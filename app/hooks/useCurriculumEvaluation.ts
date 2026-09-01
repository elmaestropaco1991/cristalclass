"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action } from "../types/action";
import type { CurriculumEvaluationRuleSnapshot, CurriculumEvaluationState } from "../types/curriculumEvaluation";
import {
  appendClosedCurriculumEvaluationSession,
  clearOpenCurriculumEvaluationSession,
  createOpenCurriculumEvaluationSession,
  persistOpenCurriculumEvaluationSession,
  readOpenCurriculumEvaluationSession,
  recordOpenCurriculumEvaluationAction,
  sameRuleSnapshots,
  touchOpenCurriculumEvaluationSession,
  type CurriculumEvaluationOpenSession,
} from "../services/curriculumEvaluationRuntimeService";
import {
  createCurriculumEvaluationState,
} from "../services/curriculumEvaluationService";
import {
  persistCurriculumEvaluationState,
  readCurriculumEvaluationState,
} from "../services/curriculumEvaluationStorageService";

export function useCurriculumEvaluation(classroomId: string) {
  const [state, setState] = useState<CurriculumEvaluationState | null>(null);
  const [openSession, setOpenSession] = useState<CurriculumEvaluationOpenSession | null>(null);
  const [loadedClassroomId, setLoadedClassroomId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const stateRef = useRef<CurriculumEvaluationState | null>(null);
  const openRef = useRef<CurriculumEvaluationOpenSession | null>(null);
  const classroomRef = useRef(classroomId);

  useEffect(() => {
    classroomRef.current = classroomId;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const storage = window.localStorage;
      const occurredAt = new Date().toISOString();
      const stored = readCurriculumEvaluationState(storage, classroomId);
      const nextState = stored.status === "valid"
        ? stored.envelope.state
        : stored.status === "empty"
          ? createCurriculumEvaluationState(classroomId, occurredAt)
          : null;
      const open = readOpenCurriculumEvaluationSession(storage, classroomId);
      const nextOpen = open.status === "valid" ? open.session : null;
      stateRef.current = nextState;
      openRef.current = nextOpen;
      setState(nextState);
      setOpenSession(nextOpen);
      setMessage(
        stored.status === "invalid" || stored.status === "storage-error"
          ? stored.message
          : open.status === "invalid" || open.status === "storage-error"
            ? "Hay una sesión curricular abierta que no ha superado la comprobación de integridad."
            : ""
      );
      setLoadedClassroomId(classroomId);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [classroomId]);

  useEffect(() => {
    const touchBeforeLeaving = () => {
      const current = openRef.current;
      if (!current || current.classroomId !== classroomRef.current) return;
      const touched = touchOpenCurriculumEvaluationSession(
        current,
        current.presentStudentIds,
        new Date().toISOString()
      );
      if (persistOpenCurriculumEvaluationSession(window.localStorage, touched)) {
        openRef.current = touched;
      }
    };
    window.addEventListener("pagehide", touchBeforeLeaving);
    return () => window.removeEventListener("pagehide", touchBeforeLeaving);
  }, []);

  const installOpen = useCallback((next: CurriculumEvaluationOpenSession | null) => {
    openRef.current = next;
    setOpenSession(next);
  }, []);

  const finalizeOpen = useCallback((presentStudentIds: readonly string[], occurredAt: string): boolean => {
    const currentOpen = openRef.current;
    const currentState = stateRef.current;
    if (!currentOpen) return true;
    if (!currentState || currentOpen.classroomId !== classroomId) {
      setMessage("La sesión curricular abierta no coincide con la clase actual.");
      return false;
    }
    const touched = touchOpenCurriculumEvaluationSession(
      currentOpen,
      presentStudentIds,
      occurredAt
    );
    if (!persistOpenCurriculumEvaluationSession(window.localStorage, touched)) {
      setMessage("No se pudo asegurar la sesión curricular antes de cerrarla.");
      return false;
    }
    installOpen(touched);
    const closed = appendClosedCurriculumEvaluationSession(
      currentState,
      touched,
      touched.lastActivityAt
    );
    if (closed.status === "rejected") {
      setMessage(closed.message ?? "No se pudo cerrar la sesión curricular.");
      return false;
    }
    let persisted = currentState;
    for (const next of closed.states) {
      const result = persistCurriculumEvaluationState(
        window.localStorage,
        next,
        persisted.revision,
        next.updatedAt
      );
      if (result.status !== "written" && result.status !== "idempotent") {
        setMessage("El registro diario se aplicó, pero la sesión curricular sigue pendiente de cierre.");
        const latest = readCurriculumEvaluationState(window.localStorage, classroomId);
        if (latest.status === "valid") {
          stateRef.current = latest.envelope.state;
          setState(latest.envelope.state);
        }
        return false;
      }
      persisted = result.envelope.state;
    }
    if (!clearOpenCurriculumEvaluationSession(window.localStorage, classroomId)) {
      setMessage("La sesión se guardó, pero no se pudo retirar el borrador de sesión abierta.");
      return false;
    }
    stateRef.current = persisted;
    setState(persisted);
    installOpen(null);
    setMessage("");
    return true;
  }, [classroomId, installOpen]);

  const transitionSubject = useCallback((input: {
    readonly subjectId: string | null;
    readonly localDate: string;
    readonly presentStudentIds: readonly string[];
    readonly rules: readonly CurriculumEvaluationRuleSnapshot[];
    readonly occurredAt: string;
    readonly sessionId: string;
  }): boolean => {
    const current = openRef.current;
    if (
      current
      && current.subjectId === input.subjectId
      && input.subjectId !== null
      && sameRuleSnapshots(current.rules, input.rules)
    ) {
      const touched = touchOpenCurriculumEvaluationSession(
        current,
        input.presentStudentIds,
        input.occurredAt
      );
      if (!persistOpenCurriculumEvaluationSession(window.localStorage, touched)) {
        setMessage("No se pudo actualizar la sesión curricular abierta.");
        return false;
      }
      installOpen(touched);
      return true;
    }
    if (!finalizeOpen(input.presentStudentIds, input.occurredAt)) return false;
    if (input.subjectId === null || input.rules.length === 0) return true;
    try {
      const next = createOpenCurriculumEvaluationSession({
        id: input.sessionId,
        classroomId,
        subjectId: input.subjectId,
        localDate: input.localDate,
        openedAt: input.occurredAt,
        presentStudentIds: input.presentStudentIds,
        rules: input.rules,
      });
      if (!persistOpenCurriculumEvaluationSession(window.localStorage, next)) {
        setMessage("No se pudo iniciar el seguimiento curricular de esta sesión.");
        return false;
      }
      installOpen(next);
      setMessage("");
      return true;
    } catch {
      setMessage("Las reglas de esta asignatura no permiten iniciar una sesión válida.");
      return false;
    }
  }, [classroomId, finalizeOpen, installOpen]);

  const recordAction = useCallback((input: {
    readonly action: Action;
    readonly studentId: string;
    readonly presentStudentIds: readonly string[];
    readonly occurredAt: string;
    readonly observationId: string;
  }): boolean => {
    const current = openRef.current;
    if (!current) return true;
    try {
      const touched = touchOpenCurriculumEvaluationSession(
        current,
        input.presentStudentIds,
        input.occurredAt
      );
      const next = recordOpenCurriculumEvaluationAction(touched, {
        observationId: input.observationId,
        studentId: input.studentId,
        actionId: input.action.id,
        actionTitle: input.action.title,
        recordedAt: input.occurredAt,
      });
      if (next === current || next === touched && touched === current) return true;
      if (!persistOpenCurriculumEvaluationSession(window.localStorage, next)) {
        setMessage("La conducta se registró, pero no se pudo guardar su evidencia curricular.");
        return false;
      }
      installOpen(next);
      return true;
    } catch {
      setMessage("La conducta se registró, pero no coincide con la sesión curricular abierta.");
      return false;
    }
  }, [installOpen]);

  return {
    state: state?.classroomId === classroomId ? state : null,
    openSession: openSession?.classroomId === classroomId ? openSession : null,
    isHydrated: loadedClassroomId === classroomId,
    message: loadedClassroomId === classroomId ? message : "",
    transitionSubject,
    recordAction,
    finalizeOpen,
    clearMessage: () => setMessage(""),
  };
}
