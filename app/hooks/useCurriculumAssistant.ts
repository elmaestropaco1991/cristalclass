"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";
import { getBrowserCurriculumExclusiveLock } from "../services/curriculumExclusiveLockService";
import {
  getBrowserCurriculumAssistantStorage,
  getCurriculumAssistantStorageKey,
  persistCurriculumAssistantState,
  readCurriculumAssistantState,
  type CurriculumAssistantReadResult,
} from "../services/curriculumAssistantStorageService";

export function useCurriculumAssistant(classroomId: string) {
  const [state, setState] = useState<CurriculumAssistantState | null>(null);
  const [pendingState, setPendingState] = useState<CurriculumAssistantState | null>(null);
  const [pendingConflict, setPendingConflict] = useState(false);
  const [readStatus, setReadStatus] = useState<CurriculumAssistantReadResult["status"]>("empty");
  const [loadedClassroomId, setLoadedClassroomId] = useState<string | null>(null);
  const [savingClassroomId, setSavingClassroomId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const persistedStateRef = useRef<CurriculumAssistantState | null>(null);
  const pendingStateRef = useRef<CurriculumAssistantState | null>(null);
  const pendingConflictRef = useRef(false);
  const savingRef = useRef(false);
  const currentClassroomIdRef = useRef(classroomId);
  const loadGenerationRef = useRef(0);
  const mountedRef = useRef(false);

  const installReadResult = useCallback((
    targetClassroomId: string,
    result: CurriculumAssistantReadResult,
    preservePending = false
  ) => {
    if (!mountedRef.current || currentClassroomIdRef.current !== targetClassroomId) return;
    setReadStatus(result.status);
    setLoadedClassroomId(targetClassroomId);
    if (!preservePending) {
      pendingStateRef.current = null;
      pendingConflictRef.current = false;
      setPendingState(null);
      setPendingConflict(false);
    }
    if (result.status === "valid") {
      persistedStateRef.current = result.envelope.state;
      setState(result.envelope.state);
      setMessage("");
    } else {
      persistedStateRef.current = null;
      setState(null);
      setMessage(result.status === "empty" ? "" : result.message);
    }
    if (preservePending) {
      pendingConflictRef.current = true;
      setPendingConflict(true);
      setMessage("Otra pestaña cambió este borrador. Tu cambio sigue en memoria, pero no se sobrescribirá el estado más reciente. Recarga para revisarlo.");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentClassroomIdRef.current = classroomId;
    const generation = ++loadGenerationRef.current;
    let cancelled = false;
    const storage = getBrowserCurriculumAssistantStorage();
    const load = (preservePending = false) => {
      if (cancelled || generation !== loadGenerationRef.current) return;
      const result = storage
        ? readCurriculumAssistantState(storage, classroomId)
        : { status: "storage-error", message: "El almacenamiento no está disponible." } as const;
      installReadResult(classroomId, result, preservePending);
    };
    const frame = requestAnimationFrame(() => load());
    const storageKey = getCurriculumAssistantStorageKey(classroomId);
    const onStorage = (event: StorageEvent) => {
      if (storage && event.storageArea === storage && (event.key === null || event.key === storageKey)) {
        load(pendingStateRef.current?.classroomId === classroomId);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", onStorage);
    };
  }, [classroomId, installReadResult]);

  const commitState = useCallback(async (nextState: CurriculumAssistantState): Promise<boolean> => {
    if (nextState.classroomId !== classroomId) {
      setMessage("El borrador pertenece a otra clase y no se ha guardado.");
      return false;
    }
    if (pendingConflictRef.current) {
      setMessage("Otra pestaña cambió este borrador. Recarga para revisar ambos estados sin sobrescribirlos.");
      return false;
    }
    const currentState = persistedStateRef.current?.classroomId === classroomId
      ? persistedStateRef.current
      : null;
    if (currentState === nextState || (
      currentState
      && currentState.revision === nextState.revision
      && JSON.stringify(currentState) === JSON.stringify(nextState)
    )) return true;
    if (savingRef.current) {
      setMessage("Espera a que termine el guardado anterior.");
      return false;
    }
    const storage = getBrowserCurriculumAssistantStorage();
    if (!storage) {
      pendingStateRef.current = nextState;
      setPendingState(nextState);
      setMessage("El almacenamiento del navegador no está disponible. El cambio sigue en memoria para reintentarlo.");
      return false;
    }
    savingRef.current = true;
    setSavingClassroomId(classroomId);
    setMessage("");
    const expectedRevision = currentState?.revision ?? 0;
    const stateToPersist = nextState.revision === expectedRevision + 1
      ? nextState
      : { ...nextState, revision: expectedRevision + 1 };
    let result: Awaited<ReturnType<typeof persistCurriculumAssistantState>>;
    try {
      result = await persistCurriculumAssistantState(
        storage,
        getBrowserCurriculumExclusiveLock(),
        stateToPersist,
        expectedRevision,
        stateToPersist.updatedAt
      );
    } catch {
      if (mountedRef.current && currentClassroomIdRef.current === classroomId) {
        pendingStateRef.current = nextState;
        setPendingState(nextState);
        setMessage("No se pudo completar el guardado. El borrador sigue abierto para reintentarlo.");
      }
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSavingClassroomId(null);
    }
    if (currentClassroomIdRef.current !== classroomId || !mountedRef.current) return false;
    if (result.status !== "written" && result.status !== "idempotent") {
      if (result.status === "revision-conflict" || result.status === "write-outcome-unknown") {
        const latest = readCurriculumAssistantState(storage, classroomId);
        if (
          result.status === "write-outcome-unknown"
          && latest.status === "valid"
          && latest.envelope.revision === stateToPersist.revision
          && JSON.stringify(latest.envelope.state) === JSON.stringify(stateToPersist)
        ) {
          installReadResult(classroomId, latest);
          return true;
        }
        pendingStateRef.current = nextState;
        setPendingState(nextState);
        installReadResult(classroomId, latest, true);
      } else if (
        result.status === "size-limit-exceeded"
        || result.status === "storage-error"
        || result.status === "lock-unavailable"
      ) {
        pendingStateRef.current = nextState;
        setPendingState(nextState);
      }
      const resultMessage = "message" in result ? result.message : "No se pudo guardar el borrador.";
      setMessage(
        result.status === "size-limit-exceeded"
        || result.status === "storage-error"
        || result.status === "lock-unavailable"
          ? `${resultMessage} El cambio sigue en memoria para corregirlo o reintentarlo.`
          : `${resultMessage} El cambio sigue en memoria y no se reintentará sobre otro estado.`
      );
      return false;
    }
    persistedStateRef.current = result.envelope.state;
    pendingStateRef.current = null;
    pendingConflictRef.current = false;
    setState(result.envelope.state);
    setPendingState(null);
    setPendingConflict(false);
    setReadStatus("valid");
    setLoadedClassroomId(classroomId);
    setMessage("");
    return true;
  }, [classroomId, installReadResult]);

  const retryPendingState = useCallback(async (): Promise<boolean> => {
    const pending = pendingStateRef.current;
    return pending?.classroomId === classroomId && !pendingConflictRef.current
      ? commitState(pending)
      : false;
  }, [classroomId, commitState]);

  const visibleState = state?.classroomId === classroomId ? state : null;
  const visiblePendingState = pendingState?.classroomId === classroomId ? pendingState : null;
  const isHydrated = loadedClassroomId === classroomId;

  return {
    state: visibleState,
    draftState: visiblePendingState ?? visibleState,
    hasPendingSave: visiblePendingState !== null,
    canRetryPendingSave: visiblePendingState !== null && !pendingConflict,
    readStatus: isHydrated ? readStatus : "empty",
    isHydrated,
    isSaving: savingClassroomId !== null,
    message: isHydrated ? message : "",
    commitState,
    retryPendingState,
    clearMessage: () => setMessage(""),
  };
}
