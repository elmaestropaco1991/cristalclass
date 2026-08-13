import type { AggregateReference } from "../../domain/aggregates/DomainAggregate";
import type { DomainEvent } from "../../domain/events/DomainEvent";
import type { EntityId } from "../../shared/types";

export type ApplyStudentActionStatus = "committed" | "rejected" | "idempotent";

export interface ApplyStudentActionFailure {
  code: string;
  message: string;
}

/** Recibo inmutable de una solicitud, independiente de cualquier interfaz de usuario. */
export interface ApplyStudentActionResult {
  commandId: EntityId;
  status: ApplyStudentActionStatus;
  target: AggregateReference;
  events: readonly DomainEvent[];
  failure?: ApplyStudentActionFailure;
}
