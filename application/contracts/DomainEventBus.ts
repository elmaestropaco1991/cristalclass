import type { DomainEvent } from "../../domain/events/DomainEvent";

/** Publica eventos ya confirmados; no modifica agregados ni contiene reglas de dominio. */
export interface DomainEventBus {
  publish(events: readonly DomainEvent[]): Promise<void>;
}
