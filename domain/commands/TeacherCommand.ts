import type { AggregateReference } from "../aggregates/DomainAggregate";
import type { EntityId, Metadata, Timestamp } from "../../shared/types";

/** Intención genérica de un profesor sobre un agregado de dominio. */
export interface TeacherCommand<TType extends string = string, TPayload = unknown> {
  id: EntityId;
  type: TType;
  teacherId: EntityId;
  target: AggregateReference;
  issuedAt: Timestamp;
  idempotencyKey: string;
  payload: TPayload;
  metadata: Metadata;
}
