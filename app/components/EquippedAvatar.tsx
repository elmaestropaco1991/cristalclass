import Image from "next/image";
import { getProgressionFullBodyAvatar } from "../data/fullBodyAvatars";
import { equipmentLayerAssetsByItemId } from "../data/equipmentLayerAssets";
import { getCosmeticPlacement } from "../data/cosmeticPlacements";
import { fantasyItemCatalog } from "../themes/fantasy/cosmetics";
import type { Student } from "../types/student";
import {
  calculateStudentProgression,
  DEFAULT_PROGRESSION_CONFIG,
} from "../../domain/progression/StudentProgression";

type Props = {
  student: Student;
  className: string;
  avatarClassName?: string;
  imageLoading?: "lazy" | "eager";
};

export default function EquippedAvatar({
  student,
  className,
  avatarClassName = "",
  imageLoading,
}: Props) {
  const hasSelectedDragon = student.equipment?.companion === "green-crystal-dragon";
  const progression = calculateStudentProgression({
    crystals: student.cristales,
    highestCrystalTotal: student.highestCrystalTotal,
    config: DEFAULT_PROGRESSION_CONFIG,
  });
  const fullBodyAvatar = getProgressionFullBodyAvatar(
    student.fullBodyAvatarId,
    progression.evolution,
    hasSelectedDragon
  );
  const hasIntegratedCompanion = fullBodyAvatar.id === "boy-01" && hasSelectedDragon;
  const backLayers = student.equipment?.back
    ? equipmentLayerAssetsByItemId[student.equipment.back]
    : undefined;
  const backAura = student.equipment?.back === "blue-crystal-aura"
    ? fantasyItemCatalog.find((item) => item.id === student.equipment.back && item.category === "back")
    : undefined;
  const companion = student.equipment?.companion
    ? fantasyItemCatalog.find((item) => item.id === student.equipment.companion && item.category === "companion")
    : undefined;

  return (
    <div className={`relative ${className}`}>
      {backAura && <BackCosmetic itemId={backAura.id} src={backAura.assetKey} fullBodyAvatarId={student.fullBodyAvatarId} />}
      {backLayers?.back && <EquipmentLayer src={backLayers.back} />}
      <Image
        src={fullBodyAvatar.src}
        alt={student.nombre}
        fill
        sizes="(max-width: 1024px) 72vw, 490px"
        loading={imageLoading}
        unoptimized
        className={`pointer-events-none absolute inset-0 z-10 h-full w-full object-contain object-bottom ${avatarClassName}`}
        style={{ transform: `scale(${fullBodyAvatar.visualScale})` }}
      />
      {backLayers?.front && <EquipmentLayer src={backLayers.front} front />}
      {companion && !hasIntegratedCompanion && <Companion itemId={companion.id} src={companion.assetKey} fullBodyAvatarId={student.fullBodyAvatarId} />}
    </div>
  );
}

function BackCosmetic({ itemId, src, fullBodyAvatarId }: { itemId: string; src: string; fullBodyAvatarId?: string }) {
  const placement = getCosmeticPlacement(itemId, fullBodyAvatarId);

  return (
    <Image
      src={src}
      alt=""
      width={480}
      height={480}
      unoptimized
      className="pointer-events-none absolute h-auto object-contain"
      style={{
        left: placement.anchor === "center" ? placement.x : undefined,
        top: placement.anchor === "center" ? placement.y : undefined,
        width: placement.width,
        zIndex: placement.zIndex,
        transform: placement.anchor === "center" ? "translate(-50%, -50%)" : undefined,
      }}
    />
  );
}

function Companion({ itemId, src, fullBodyAvatarId }: { itemId: string; src: string; fullBodyAvatarId?: string }) {
  const placement = getCosmeticPlacement(itemId, fullBodyAvatarId);

  return (
    <Image
      src={src}
      alt=""
      width={240}
      height={240}
      unoptimized
      className="pointer-events-none absolute h-auto object-contain drop-shadow-[0_8px_10px_rgba(9,85,71,.32)]"
      style={{
        right: placement.anchor === "bottom-right" ? placement.x : undefined,
        bottom: placement.anchor === "bottom-right" ? placement.y : undefined,
        width: placement.width,
        zIndex: placement.zIndex,
      }}
    />
  );
}

function EquipmentLayer({ src, front = false }: { src: string; front?: boolean }) {
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes="(max-width: 1024px) 72vw, 490px"
      unoptimized
      className={`pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom ${front ? "z-20" : "z-0"}`}
    />
  );
}
