import type { ChestRarity, ChestSource } from "../types/chest";
import type { Student } from "../types/student";
import { createChest, giveChest } from "./chest.service";

export function rewardChest(
  student: Student,
  rarity: ChestRarity,
  source: ChestSource
): Student {
  const chest = createChest(
    student.avatar.theme,
    rarity,
    source
  );

  return giveChest(student, chest);
}