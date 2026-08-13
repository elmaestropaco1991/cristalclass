import type { DomainAggregate } from "../aggregates/DomainAggregate";
import type { DomainEvent } from "../events/DomainEvent";

/** Contexto de solo lectura entregado a un módulo cuando recibe un evento. */
export interface ActionModuleContext<
  TEvent extends DomainEvent = DomainEvent,
  TAggregate extends DomainAggregate = DomainAggregate,
> {
  event: TEvent;
  aggregate: TAggregate;
}

/** Contribución declarativa de un módulo; nunca contiene mutaciones directas. */
export interface ActionModuleResult {
  events: readonly DomainEvent[];
}

/**
 * Extensión pura del dominio. Los módulos reaccionan a eventos y solo generan
 * eventos derivados; no conocen acciones concretas, React ni infraestructura.
 */
export interface ActionModule<
  TEvent extends DomainEvent = DomainEvent,
  TAggregate extends DomainAggregate = DomainAggregate,
> {
  id: string;
  priority: number;
  supports(event: DomainEvent): event is TEvent;
  react(context: ActionModuleContext<TEvent, TAggregate>): ActionModuleResult;
}
