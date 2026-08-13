import type { TeacherCommand } from "../../domain/commands/TeacherCommand";

/**
 * Intención de aplicar una acción docente a un agregado. El nombre se mantiene
 * por compatibilidad de producto, pero el destino no está acoplado a Student.
 */
export type ApplyStudentActionCommand = TeacherCommand<
  "apply-student-action",
  ApplyStudentActionPayload
>;

export interface ApplyStudentActionPayload {
  actionId: string;
}
