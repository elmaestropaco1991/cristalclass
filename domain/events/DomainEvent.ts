import type { AggregateReference } from "../aggregates/DomainAggregate";
import type { EntityId, Metadata, Timestamp } from "../../shared/types";

/** Hecho inmutable producido por el dominio y persistible por la infraestructura. */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  id: EntityId;
  type: TType;
  aggregate: AggregateReference;
  occurredAt: Timestamp;
  version: number;
  correlationId: EntityId;
  causationId?: EntityId;
  payload: TPayload;
  metadata: Metadata;
}
