import {
  createEquipCollectedItem,
  type EquipCollectedItemResult,
  type StudentEquipmentState,
} from "../../application/use-cases/EquipCollectedItem";
import {
  createUnequipItemCategory,
  type UnequipItemCategoryResult,
} from "../../application/use-cases/UnequipItemCategory";
import type { EquipableItemCategory, ItemDefinition } from "../../domain";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import type { Student } from "../types/student";
import { loadStudents, saveStudents } from "./storageService";

export interface StudentEquipmentServiceDependencies {
  loadStudents(): Student[] | null;
  saveStudents(students: Student[]): void;
  catalog: readonly ItemDefinition[];
}

export type StudentEquipmentServiceResult<T> =
  | T
  | {
      status: "student-not-found";
      studentId: string;
    };

export interface StudentEquipmentService {
  equipCollectedItemForStudent(
    studentId: string,
    itemId: string
  ): Promise<StudentEquipmentServiceResult<EquipCollectedItemResult>>;
  unequipItemCategoryForStudent(
    studentId: string,
    category: EquipableItemCategory | string
  ): Promise<StudentEquipmentServiceResult<UnequipItemCategoryResult>>;
}

export function createStudentEquipmentService(
  dependencies: StudentEquipmentServiceDependencies
): StudentEquipmentService {
  return {
    async equipCollectedItemForStudent(studentId, itemId) {
      const currentStudents = loadCurrentStudents(dependencies);

      if (!currentStudents) {
        return { status: "failed", reason: "Unable to load students." };
      }

      const student = currentStudents.find((candidate) => candidate.id === studentId);

      if (!student) {
        return { status: "student-not-found", studentId };
      }

      const useCase = createEquipCollectedItem({
        loadState: (): StudentEquipmentState => ({
          collection: student.inventory,
          equipment: student.equipment,
        }),
        persistState: (nextState) => {
          persistEquipmentState(
            dependencies,
            currentStudents,
            student,
            nextState.equipment
          );
        },
        catalog: dependencies.catalog,
      });

      return useCase.execute(itemId);
    },

    async unequipItemCategoryForStudent(studentId, category) {
      const currentStudents = loadCurrentStudents(dependencies);

      if (!currentStudents) {
        return { status: "failed", reason: "Unable to load students." };
      }

      const student = currentStudents.find((candidate) => candidate.id === studentId);

      if (!student) {
        return { status: "student-not-found", studentId };
      }

      const useCase = createUnequipItemCategory({
        loadState: (): StudentEquipmentState => ({
          collection: student.inventory,
          equipment: student.equipment,
        }),
        persistState: (nextState) => {
          persistEquipmentState(
            dependencies,
            currentStudents,
            student,
            nextState.equipment
          );
        },
      });

      return useCase.execute(category);
    },
  };
}

export function equipCollectedItemForStudent(
  studentId: string,
  itemId: string
): Promise<StudentEquipmentServiceResult<EquipCollectedItemResult>> {
  return createProductionService().equipCollectedItemForStudent(studentId, itemId);
}

export function unequipItemCategoryForStudent(
  studentId: string,
  category: EquipableItemCategory
): Promise<StudentEquipmentServiceResult<UnequipItemCategoryResult>> {
  return createProductionService().unequipItemCategoryForStudent(studentId, category);
}

function createProductionService(): StudentEquipmentService {
  return createStudentEquipmentService({
    loadStudents,
    saveStudents,
    catalog: fantasyItemCatalog,
  });
}

function loadCurrentStudents(
  dependencies: StudentEquipmentServiceDependencies
): Student[] | undefined {
  try {
    return dependencies.loadStudents() ?? [];
  } catch {
    return undefined;
  }
}

function persistEquipmentState(
  dependencies: StudentEquipmentServiceDependencies,
  students: readonly Student[],
  student: Student,
  equipment: Student["equipment"]
): void {
  const nextStudents = students.map((candidate) =>
    candidate.id === student.id
      ? {
          ...student,
          equipment,
        }
      : candidate
  );

  dependencies.saveStudents(nextStudents);
}
