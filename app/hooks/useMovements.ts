import { useEffect, useState } from "react";

import type { Movement } from "../types/movement";
import type { ActionType } from "../types/action";

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
  const [movements, setMovements] = useState<Movement[]>([]);

  useEffect(() => {
    const almacenados = loadMovements();
    setMovements(almacenados ?? initialMovements);
  }, []);

  useEffect(() => {
    saveMovements(movements);
  }, [movements]);

  function registrarMovimiento(
    studentId: string,
    actionId: ActionType
  ) {
    const action = getAction(actionId);

    if (!action) return;

    setMovements((prev) =>
      addMovement(prev, {
        studentId,
        points: action.points,
        title: action.title,
        type: action.type,
      })
    );
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