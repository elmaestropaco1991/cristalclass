import {
  createOpenStudentChest,
  type OpenStudentChestResult,
  type StudentChestState,
} from "../../application/use-cases/OpenStudentChest";
import type {
  ChestRewardSelectionResult,
  ItemDefinition,
  RandomSource,
} from "../../domain";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import type { InventoryItem, Student } from "../types/student";
import { loadStudents, saveStudents } from "./storageService";

export interface OpenStudentChestServiceDependencies {
  loadStudents(): Student[] | null;
  saveStudents(students: Student[]): void;
  catalog: readonly ItemDefinition[];
  random: RandomSource;
  now(): Date;
  selectReward?: () => ChestRewardSelectionResult;
}

export type OpenStudentChestServiceResult =
  | OpenStudentChestResult
  | {
      status: "student-not-found";
      studentId: string;
    };

export interface OpenStudentChestService {
  openOldestPendingChestForStudent(
    studentId: string
  ): Promise<OpenStudentChestServiceResult>;
}

const infrastructureRandom: RandomSource = {
  next: () => Math.random(),
};

/**
 * Creates the infrastructure bridge used by a future UI. The production
 * function below wires it to the existing student local-storage service.
 */
export function createOpenStudentChestService(
  dependencies: OpenStudentChestServiceDependencies
): OpenStudentChestService {
  return {
    async openOldestPendingChestForStudent(studentId) {
      let students: Student[] | null;

      try {
        students = dependencies.loadStudents();
      } catch {
        return { status: "failed", reason: "Unable to load students." };
      }

      const currentStudents = students ?? [];
      const student = currentStudents.find((candidate) => candidate.id === studentId);

      if (!student) {
        return { status: "student-not-found", studentId };
      }

      let openingTime: Date | undefined;
      const openStudentChest = createOpenStudentChest({
        loadState: (): StudentChestState => ({
          collection: student.inventory,
          chests: student.chests,
        }),
        persistState: (nextState) => {
          const nextStudent = applyOpenedChestState(
            student,
            nextState,
            dependencies.catalog
          );
          const nextStudents = currentStudents.map((candidate) =>
            candidate.id === student.id ? nextStudent : candidate
          );

          dependencies.saveStudents(nextStudents);
        },
        catalog: dependencies.catalog,
        random: dependencies.random,
        ...(dependencies.selectReward
          ? { selectReward: dependencies.selectReward }
          : {}),
        now: () => {
          if (!openingTime) {
            openingTime = dependencies.now();
          }

          return new Date(openingTime.getTime());
        },
      });

      return openStudentChest.execute();
    },
  };
}

export function openOldestPendingChestForStudent(
  studentId: string
): Promise<OpenStudentChestServiceResult> {
  return createOpenStudentChestService({
    loadStudents,
    saveStudents,
    catalog: fantasyItemCatalog,
    random: infrastructureRandom,
    now: () => new Date(),
  }).openOldestPendingChestForStudent(studentId);
}

export function openOldestPendingChestWithSelectedReward(
  studentId: string,
  itemId: string
): Promise<OpenStudentChestServiceResult> {
  const selectedItem = fantasyItemCatalog.find((item) => item.id === itemId);

  if (!selectedItem) {
    return Promise.resolve({ status: "failed", reason: "Selected reward not found." });
  }

  return createOpenStudentChestService({
    loadStudents,
    saveStudents,
    catalog: fantasyItemCatalog,
    random: infrastructureRandom,
    now: () => new Date(),
    selectReward: () => ({
      status: "selected",
      item: selectedItem,
      selectedRarity: selectedItem.rarity,
      primaryRarity: selectedItem.rarity,
      usedFallback: false,
    }),
  }).openOldestPendingChestForStudent(studentId);
}

function applyOpenedChestState(
  student: Student,
  nextState: StudentChestState,
  catalog: readonly ItemDefinition[]
): Student {
  const newlySelectedReward = nextState.chests
    .filter((chest) => chest.status === "opened" && chest.rewardId)
    .find((chest) => {
      const previousChest = student.chests.find((candidate) => candidate.id === chest.id);
      return previousChest?.status !== "opened";
    })?.rewardId;
  const selectedItem = newlySelectedReward
    ? catalog.find((item) => item.id === newlySelectedReward)
    : undefined;

  return {
    ...student,
    inventory: mergeInventory(student.inventory, nextState.collection, catalog),
    equipment: selectedItem?.category === "companion"
      ? { ...student.equipment, companion: selectedItem.id }
      : student.equipment,
    chests: nextState.chests.map((chest) => ({ ...chest })),
  };
}

function mergeInventory(
  currentInventory: readonly InventoryItem[],
  collection: StudentChestState["collection"],
  catalog: readonly ItemDefinition[]
): InventoryItem[] {
  return collection.map((entry) => {
    const existingItem = currentInventory.find(
      (item) => item.itemId === entry.itemId
    );

    if (existingItem) {
      return {
        ...existingItem,
        itemId: entry.itemId,
        unlockedAt: entry.unlockedAt,
      };
    }

    const item = catalog.find((candidate) => candidate.id === entry.itemId);

    return {
      id: entry.itemId,
      itemId: entry.itemId,
      cosmeticId: entry.itemId,
      theme: item?.theme,
      ...(item?.category === "companion" ? { type: "pet" as const } : {}),
      unlockedAt: entry.unlockedAt,
    };
  });
}
