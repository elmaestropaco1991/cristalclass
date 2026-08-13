import type { EntityId } from "../../shared/types";

/** Referencia estable a cualquier agregado del dominio. */
export interface AggregateReference {
  id: EntityId;
  type: string;
}

/**
 * Contrato mínimo de un agregado. Su estado es de solo lectura para los módulos;
 * el futuro caso de uso será el único autorizado a coordinar cambios.
 */
export interface DomainAggregate<TState = unknown> extends AggregateReference {
  version: number;
  state: Readonly<TState>;
}
