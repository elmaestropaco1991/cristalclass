import type { DomainEvent } from "../../domain/events/DomainEvent";
import type { ActionModule } from "../../domain/modules/ActionModule";

/** Catálogo extensible de módulos que pueden reaccionar a eventos de dominio. */
export interface ModuleRegistry {
  register(module: ActionModule): void;
  resolve(event: DomainEvent): readonly ActionModule[];
}
