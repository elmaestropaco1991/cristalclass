import {
  createApplyStudentAction,
  type ApplyStudentAction,
  type LegacyStudentActionBridge,
} from "../../application/use-cases/ApplyStudentAction";
import type { ApplyStudentActionCommand } from "../../application/commands/ApplyStudentActionCommand";
import { getAction } from "./actionService";
import { getActionType, type ActionType } from "../types/action";
import type { CrystalUpdate } from "./studentService";

type LegacyActionHandlers = {
  modificarCristales: (studentId: string, cambio: number) => CrystalUpdate | undefined;
  registrarMovimiento: (
    studentId: string,
    actionId: ActionType,
    requestedChange: number,
    appliedChange: number
  ) => void;
};

/**
 * Adaptador transitorio entre el caso de uso y los hooks actuales. Cuando los
 * repositorios de dominio estén disponibles, este archivo podrá retirarse.
 */
export function createLegacyApplyStudentAction(
  handlers: LegacyActionHandlers
): ApplyStudentAction {
  const bridge: LegacyStudentActionBridge = {
    apply(command: ApplyStudentActionCommand) {
      if (command.target.type !== "student") {
        return undefined;
      }

      const action = getAction(command.payload.actionId as ActionType);

      if (!action) {
        return undefined;
      }

      const update = handlers.modificarCristales(command.target.id, action.points);
      const crystalChange = update?.change;

      if (!crystalChange) {
        return undefined;
      }

      handlers.registrarMovimiento(
        command.target.id,
        action.id,
        crystalChange.requestedChange,
        crystalChange.appliedChange
      );

      return {
        ...action,
        points: crystalChange.appliedChange,
        type: getActionType(action),
        obtainedChests: update.generatedChests.map((chest) => ({
          id: chest.id,
          evolution: chest.evolution,
          status: chest.status,
          obtainedAt: chest.obtainedAt.toISOString(),
        })),
      };
    },
  };

  return createApplyStudentAction(bridge);
}
