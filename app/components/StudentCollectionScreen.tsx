"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ItemCategory, ItemRarity } from "../../domain";
import { equipmentLayerAssetsByItemId } from "../data/equipmentLayerAssets";
import {
  getCollectionArtworkAssetKey,
  getDragonChestThumbnail,
} from "../data/fullBodyAvatars";
import { getCosmeticPreview } from "../data/cosmeticPlacements";
import { INITIAL_COMPANION_ITEM_ID } from "../data/initialStudentInventory";
import {
  equipCollectedItemForStudent,
  unequipItemCategoryForStudent,
} from "../services/studentEquipmentService";
import { createEquipmentOperationGuard } from "../services/equipmentOperationGuard";
import {
  getStudentCollectionView,
  type StudentCollectionQueryResult,
  type StudentCollectionView,
  type VisibleCollectedCollectionItem,
} from "../services/studentCollectionQueryService";
import {
  calculateStudentProgression,
  DEFAULT_PROGRESSION_CONFIG,
} from "../../domain/progression/StudentProgression";
import type { Student } from "../types/student";
import EquippedAvatar from "./EquippedAvatar";

type Props = {
  student: Student;
  initialCategory?: ItemCategory;
  onCategoryChange: (category: ItemCategory) => void;
  onStudentUpdated: (student: Student) => void;
  onClose: () => void;
};

const categoryLabels: Record<ItemCategory, string> = {
  head: "Cabeza",
  face: "Cara",
  back: "Espalda",
  hand: "Mano",
  companion: "Compañero",
};

const rarityLabels: Record<ItemRarity, string> = {
  common: "Común",
  uncommon: "Poco común",
  rare: "Raro",
  epic: "Épico",
  legendary: "Legendario",
};

export default function StudentCollectionScreen({
  student,
  initialCategory,
  onCategoryChange,
  onStudentUpdated,
  onClose,
}: Props) {
  const [result, setResult] = useState<StudentCollectionQueryResult>(() => getStudentCollectionView(student.id));
  const [activeCategory, setActiveCategory] = useState<ItemCategory>(() => getInitialCategory(result, initialCategory));
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState("");
  const equipmentOperationGuard = useRef(createEquipmentOperationGuard());

  if (result.status === "student-not-found") {
    return <CollectionMessage onClose={onClose} message="No se ha encontrado el alumno." />;
  }

  if (result.status === "failed") {
    return (
      <CollectionMessage
        onClose={onClose}
        message="No hemos podido cargar la colección."
        onRetry={() => setResult(getStudentCollectionView(student.id))}
      />
    );
  }

  const activeCategoryView = result.view.categories.find(
    (category) => category.category === activeCategory
  );

  if (!activeCategoryView) {
    return <CollectionMessage onClose={onClose} message="No hemos podido cargar la colección." />;
  }

  const ownedItems = activeCategoryView.items.filter(isCollectedItem);
  const dragonThumbnail = getDragonChestThumbnail(
    calculateStudentProgression({
      crystals: student.cristales,
      highestCrystalTotal: student.highestCrystalTotal,
      config: DEFAULT_PROGRESSION_CONFIG,
    }).evolution
  );
  const showsLockedDragon = activeCategory === "companion" && activeCategoryView.items.some(
    (item) => item.status === "locked" && item.itemId === INITIAL_COMPANION_ITEM_ID
  );

  const selectCategory = (category: ItemCategory) => {
    setActiveCategory(category);
    onCategoryChange(category);
  };

  const toggleEquipment = async (item: VisibleCollectedCollectionItem) => {
    await equipmentOperationGuard.current.run(async () => {
      setPendingItemId(item.itemId);
      setOperationError("");
      const operation = item.status === "equipped"
        ? unequipItemCategoryForStudent(student.id, item.category)
        : equipCollectedItemForStudent(student.id, item.itemId);

      try {
        const operationResult = await operation;
        if (!hasEquipment(operationResult)) {
          setOperationError("No se ha podido actualizar el equipamiento.");
          return;
        }

        onStudentUpdated({ ...student, equipment: operationResult.equipment });
        onCategoryChange(item.category);
        setActiveCategory(item.category);
        setResult(getStudentCollectionView(student.id));
      } catch {
        setOperationError("No se ha podido actualizar el equipamiento.");
      } finally {
        setPendingItemId(null);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/95 p-3 text-white backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-title"
    >
      <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-cyan-300/20 bg-[#081321] shadow-2xl sm:rounded-[40px]">
        <CollectionBackground />

        <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-cyan-200/15 px-6 py-5 sm:px-10 sm:py-7">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-200 sm:text-base">Alumno</p>
            <h1 id="collection-title" className="mt-1 text-3xl font-black sm:text-5xl">Colección</h1>
            <p className="mt-2 text-lg font-bold text-cyan-100 sm:text-2xl">{result.view.studentName}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-14 rounded-2xl border border-white/30 px-6 text-lg font-black focus-visible:outline-4 focus-visible:outline-cyan-200">
            Volver
          </button>
        </header>

        <main className="relative z-10 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.35fr)] lg:grid-rows-1">
          <CharacterPanel student={student} view={result.view} dragonThumbnail={dragonThumbnail} />

          <section className="flex min-h-0 flex-col border-t border-cyan-200/15 bg-slate-950/25 lg:border-t-0 lg:border-l">
            <nav className="grid shrink-0 grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-8 xl:grid-cols-5" aria-label="Categorías de colección">
              {result.view.categories.map((category) => (
                <button
                  key={category.category}
                  type="button"
                  onClick={() => selectCategory(category.category)}
                  aria-pressed={activeCategory === category.category}
                  className={`min-h-16 w-full rounded-2xl border px-4 py-3 text-left text-lg font-black transition focus-visible:outline-4 focus-visible:outline-cyan-200 ${
                    activeCategory === category.category
                      ? "border-cyan-200 bg-cyan-300 text-slate-950 shadow-[0_0_28px_rgba(103,232,249,.35)]"
                      : "border-white/15 bg-white/5 text-white"
                  }`}
                >
                  {categoryLabels[category.category]}
                </button>
              ))}
            </nav>

            <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 sm:px-8 sm:pb-8">
              <div className="mb-4 flex shrink-0 items-baseline justify-between gap-4">
                <h2 className="text-2xl font-black sm:text-3xl">{categoryLabels[activeCategory]}</h2>
                <p className="text-lg font-bold text-cyan-100">{formatObjectCount(ownedItems.length)}</p>
              </div>

              <p aria-live="assertive" className="mb-3 min-h-6 text-sm font-bold text-rose-200">{operationError}</p>
              <div className="grid min-h-0 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] content-start justify-items-center gap-4 overflow-y-auto pr-1">
                {ownedItems.map((item) => (
                  <CollectionItemButton
                    key={item.itemId}
                    item={item}
                    dragonThumbnail={dragonThumbnail}
                    pending={pendingItemId === item.itemId}
                    disabled={pendingItemId !== null}
                    onToggle={() => void toggleEquipment(item)}
                  />
                ))}
                {showsLockedDragon && <LockedDragonCard dragonThumbnail={dragonThumbnail} />}
                {ownedItems.length === 0 && !showsLockedDragon && (
                  <p className="rounded-2xl border border-dashed border-white/20 p-6 text-lg text-slate-300 sm:col-span-2 xl:col-span-3">
                    Todavía no tienes objetos de esta categoría.
                  </p>
                )}
              </div>
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}

function LockedDragonCard({ dragonThumbnail }: { dragonThumbnail: string }) {
  return (
    <article className="relative min-h-[23rem] w-full max-w-[23.75rem] overflow-hidden rounded-3xl border border-dashed border-white/20 bg-white/[.035] p-5 text-left opacity-75">
      <div className="absolute right-4 top-4 rounded-full bg-slate-950/80 px-3 py-1 text-sm font-black text-amber-200">
        Bloqueado
      </div>
      <div className="flex h-full flex-col gap-4">
        <div className="flex w-full justify-center">
          <div className="flex h-[15rem] w-[15rem] items-center justify-center overflow-hidden rounded-2xl bg-slate-950/50 grayscale">
            <Image
              src={dragonThumbnail}
              alt=""
              width={220}
              height={220}
              unoptimized
              className="h-full w-full object-contain"
            />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-black">Dragón de cristal</h3>
          <p className="mt-2 text-sm font-bold text-cyan-100">Compañero</p>
          <p className="mt-3 font-bold text-amber-200">Se consigue al elegirlo en un cofre.</p>
        </div>
      </div>
    </article>
  );
}

function getInitialCategory(result: StudentCollectionQueryResult, initialCategory?: ItemCategory): ItemCategory {
  if (initialCategory) return initialCategory;
  if (result.status === "ready") {
    return result.view.categories.find((category) => category.equippedItemId)?.category ?? "head";
  }
  return "head";
}

function isCollectedItem(item: { status: string }): item is VisibleCollectedCollectionItem {
  return item.status === "equipped" || item.status === "collected";
}

function formatObjectCount(count: number): string {
  return `${count} ${count === 1 ? "objeto" : "objetos"}`;
}

function hasEquipment(result: object): result is { equipment: Student["equipment"] } {
  return "equipment" in result;
}

function CharacterPanel({
  student,
  view,
  dragonThumbnail,
}: {
  student: Student;
  view: StudentCollectionView;
  dragonThumbnail: string;
}) {
  const equippedItems = view.categories.flatMap((category) => category.items.filter(isCollectedItem).filter((item) => item.status === "equipped"));

  return (
    <aside className="flex min-h-0 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-7 sm:px-10 lg:px-8 xl:px-12">
      <div className="relative flex h-56 w-56 shrink-0 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-300/10 shadow-[0_0_70px_rgba(34,211,238,.25)] sm:h-72 sm:w-72 lg:h-[min(46vh,30rem)] lg:w-[min(46vh,30rem)]">
        <div className="absolute inset-4 rounded-full border border-cyan-100/15" />
        <EquippedAvatar
          student={student}
          className="relative z-10 h-[85%] w-[85%]"
          avatarClassName="drop-shadow-[0_20px_25px_rgba(0,0,0,.4)]"
        />
      </div>
      <div className="w-full max-w-md rounded-3xl border border-cyan-200/20 bg-white/5 p-5">
        <h2 className="text-xl font-black text-cyan-100">Equipamiento actual</h2>
        {equippedItems.length === 0 ? <p className="mt-3 text-base text-slate-300">No hay objetos equipados.</p> : (
          <ul className="mt-4 grid gap-3">
            {equippedItems.map((item) => <li key={item.itemId} className="flex items-center gap-3 rounded-2xl bg-slate-950/40 p-3"><ItemArtwork item={item} size="small" dragonThumbnail={dragonThumbnail} /><div className="min-w-0"><p className="truncate text-lg font-black">{item.displayName}</p><p className="text-sm font-bold text-cyan-100">{categoryLabels[item.category]}</p></div></li>)}
          </ul>
        )}
      </div>
    </aside>
  );
}

function CollectionItemButton({ item, dragonThumbnail, pending, disabled, onToggle }: { item: VisibleCollectedCollectionItem; dragonThumbnail: string; pending: boolean; disabled: boolean; onToggle: () => void }) {
  const isEquipped = item.status === "equipped";
  return (
    <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={isEquipped} aria-label={`${item.displayName}, ${categoryLabels[item.category]}, ${isEquipped ? "equipado" : "sin equipar"}`} className={`relative min-h-[23rem] w-full max-w-[23.75rem] overflow-hidden rounded-3xl border p-5 text-left transition focus-visible:outline-4 focus-visible:outline-cyan-200 disabled:cursor-wait disabled:opacity-70 ${isEquipped ? "border-cyan-200 bg-cyan-300/15 shadow-[0_0_24px_rgba(103,232,249,.22)]" : "border-white/15 bg-white/5"}`}>
      {pending && <span className="absolute right-4 top-4 rounded-full bg-slate-950/80 px-3 py-1 text-sm font-black">Guardando…</span>}
      <div className="flex h-full flex-col gap-4">
        <div className="flex w-full justify-center"><ItemArtwork item={item} size="large" dragonThumbnail={dragonThumbnail} /></div>
        <div>
          <h3 className="text-xl font-black">{item.displayName}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-bold text-cyan-100">
            <p>{categoryLabels[item.category]} · {rarityLabels[item.rarity]}</p>
            {isEquipped && <span className="ml-auto inline-flex rounded-full bg-cyan-200 px-3 py-1 text-sm font-black text-slate-950">Equipado</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function ItemArtwork({ item, size, dragonThumbnail }: { item: VisibleCollectedCollectionItem; size: "small" | "large"; dragonThumbnail: string }) {
  const dimensions = size === "small" ? 48 : 150;
  const layers = equipmentLayerAssetsByItemId[item.itemId];
  const preview = getCosmeticPreview(item.itemId, size === "large");
  const isCardPreview = size === "large";
  const containerClassName = size === "small" ? "h-12 w-12" : "";
  const imageClassName = isCardPreview
    ? "box-border h-auto shrink-0 object-contain"
    : "box-border h-auto max-h-full max-w-full object-contain";
  const containerStyle = isCardPreview
    ? { width: preview.containerSize, height: preview.containerSize }
    : undefined;

  if (layers?.back || layers?.front) {
    return <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950/50 ${containerClassName}`} style={containerStyle}><div className="relative h-[175%] w-[175%] shrink-0"><Image src={layers.back ?? layers.front!} alt="" fill unoptimized className="absolute inset-0 h-full w-full object-contain" />{layers.front && <Image src={layers.front} alt="" fill unoptimized className="absolute inset-0 h-full w-full object-contain" />}</div></div>;
  }

  const artworkAssetKey = getCollectionArtworkAssetKey(item.itemId, item.assetKey, dragonThumbnail);

  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950/50 ${containerClassName}`} style={containerStyle}><Image src={artworkAssetKey} alt="" width={dimensions} height={dimensions} unoptimized className={imageClassName} style={{ width: preview.imageScale, height: preview.imageScale, padding: preview.padding }} /></div>;
}

function CollectionMessage({ message, onClose, onRetry }: { message: string; onClose: () => void; onRetry?: () => void }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/95 p-6 text-center text-white"><section className="w-full max-w-xl rounded-[32px] border border-cyan-200/20 bg-[#081321] p-10 shadow-2xl"><p className="text-2xl font-black sm:text-3xl">{message}</p><div className="mt-8 flex flex-wrap justify-center gap-4">{onRetry && <button type="button" onClick={onRetry} className="min-h-14 rounded-2xl bg-cyan-300 px-6 text-lg font-black text-slate-950">Reintentar</button>}<button type="button" onClick={onClose} className="min-h-14 rounded-2xl border border-white/30 px-6 text-lg font-black">Volver</button></div></section></div>;
}

function CollectionBackground() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" /><div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" /></div>;
}
