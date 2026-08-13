import type { EntityId, Timestamp } from "../../shared/types";

export interface Classroom {
  id: EntityId;
  name: string;
  teacherIds: readonly EntityId[];
  studentIds: readonly EntityId[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
