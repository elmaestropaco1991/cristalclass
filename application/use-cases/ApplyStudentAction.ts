import type { ApplyStudentActionCommand } from "../commands/ApplyStudentActionCommand";
import type { ApplyStudentActionResult } from "./ApplyStudentActionResult";
import type { DomainEvent } from "../../domain/events/DomainEvent";
import type { EntityId } from "../../shared/types";
import type { Evolution } from "../../domain/progression/StudentProgression";

/**
 * Único punto de escritura del dominio para acciones docentes. La futura
 * implementación coordinará módulos, transacción y eventos, sin conocer la UI.
 */
export interface ApplyStudentAction {
  execute(command: ApplyStudentActionCommand): Promise<ApplyStudentActionResult>;
}

/**
 * Puente temporal para reutilizar el flujo actual mientras aún no existen
 * agregados, repositorios ni transacciones de dominio.
 */
export interface LegacyStudentActionBridge {
  apply(command: ApplyStudentActionCommand): LegacyStudentAction | undefined;
}

export interface LegacyStudentAction {
  id: string;
  title: string;
  points: number;
  type: "positive" | "negative";
  obtainedChests: readonly LegacyObtainedChest[];
}

export interface LegacyObtainedChest {
  id: string;
  evolution: Evolution;
  status: "pending" | "closed" | "opened";
  obtainedAt: string;
}

/**
 * Primera implementación incremental del caso de uso. Conserva la mutación
 * existente detrás del puente y expone sus consecuencias como eventos de
 * dominio, sin introducir reglas ni almacenamiento nuevos.
 */
export function createApplyStudentAction(
  bridge: LegacyStudentActionBridge
): ApplyStudentAction {
  return {
    async execute(command) {
      const action = bridge.apply(command);

      if (!action) {
        return {
          commandId: command.id,
          status: "rejected",
          target: command.target,
          events: [],
          failure: {
            code: "ACTION_NOT_APPLIED",
            message: "La acción no se pudo aplicar al agregado seleccionado.",
          },
        };
      }

      return {
        commandId: command.id,
        status: "committed",
        target: command.target,
        events: createLegacyActionEvents(command, action),
      };
    },
  };
}

function createLegacyActionEvents(
  command: ApplyStudentActionCommand,
  action: LegacyStudentAction
): readonly DomainEvent[] {
  const occurredAt = new Date().toISOString();
  const eventMetadata = command.metadata;

  const events: DomainEvent[] = [
    createEvent(
      "teacher-action-applied",
      command,
      occurredAt,
      {
        actionId: action.id,
        title: action.title,
        points: action.points,
        type: action.type,
      },
      eventMetadata
    ),
    createEvent(
      "economy-crystals-changed",
      command,
      occurredAt,
      { amount: action.points },
      eventMetadata
    ),
    ...action.obtainedChests.map((chest) =>
      createEvent(
        "student-chest-obtained",
        command,
        occurredAt,
        chest,
        eventMetadata
      )
    ),
    createEvent(
      "student-movement-recorded",
      command,
      occurredAt,
      {
        actionId: action.id,
        title: action.title,
        points: action.points,
        type: action.type,
      },
      eventMetadata
    ),
  ];

  return events;
}

function createEvent<TPayload>(
  type: string,
  command: ApplyStudentActionCommand,
  occurredAt: string,
  payload: TPayload,
  metadata: ApplyStudentActionCommand["metadata"]
): DomainEvent<string, TPayload> {
  return {
    id: createId(),
    type,
    aggregate: command.target,
    occurredAt,
    version: 0,
    correlationId: command.id,
    causationId: command.id,
    payload,
    metadata,
  };
}

function createId(): EntityId {
  return crypto.randomUUID();
}
