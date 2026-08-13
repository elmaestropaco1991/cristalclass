import { useEffect, useState } from "react";

import type { Movement } from "../types/movement";
import { getActionType, type ActionType } from "../types/action";

import { initialMovements } from "../data/movements";

import {
  addMovement,
  deleteMovement,
  getStudentMovements,
} from "../services/movementService";

import {
  loadMovements,
  saveMovements,
} from "../services/movementStorageService";

import { getAction } from "../services/actionService";

export function useMovements() {
  const [movements, setMovements] = useState<Movement[]>(
    () => loadMovements() ?? initialMovements
  );

  useEffect(() => {
    saveMovements(movements);
  }, [movements]);

  function registrarMovimiento(
    studentId: string,
    actionId: ActionType,
    requestedChange: number,
    appliedChange: number
  ) {
    const action = getAction(actionId);

    if (!action) return;

    const updatedMovements = addMovement(movements, {
      studentId,
      actionId,
      requestedChange,
      appliedChange,
      points: appliedChange,
      title: action.title,
      type: getActionType(action),
    });

    saveMovements(updatedMovements);
    setMovements(updatedMovements);
  }

  function eliminarMovimiento(id: string) {
    setMovements((prev) => deleteMovement(prev, id));
  }

  function obtenerMovimientosAlumno(studentId: string) {
    return getStudentMovements(movements, studentId);
  }

  return {
    movements,
    registrarMovimiento,
    eliminarMovimiento,
    obtenerMovimientosAlumno,
  };
}
