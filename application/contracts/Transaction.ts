import type { EntityId } from "../../shared/types";

/** Contexto opaco que una infraestructura local o remota podrá asociar a una transacción. */
export interface TransactionContext {
  id: EntityId;
}

/**
 * Límite atómico de escritura. Su contrato permite un adaptador local hoy y
 * una transacción de base de datos en el futuro, sin cambiar el caso de uso.
 */
export interface Transaction {
  execute<TResult>(
    work: (context: TransactionContext) => Promise<TResult>
  ): Promise<TResult>;
}
