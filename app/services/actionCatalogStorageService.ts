import { actions } from "../data/actions";
import type { Action, ActionVariant, QuickActionSlot } from "../types/action";
import { isQuickActionSlot, normalizeActionCatalog } from "./actionCatalogService";
import {
  normalizeActionContext,
  normalizeAttitudinalCriterionLinks,
  normalizeOrdinaryComplianceTracking,
} from "./actionSubjectService";

const STORAGE_KEY = "cristalclass_actions";

const LEGACY_QUICK_SLOTS: Readonly<Record<string, QuickActionSlot>> = {
  weekly_challenge: 1,
  help_classmate: 2,
  correct_answer: 3,
  bring_material: 4,
  talking: 5,
  disturbing: 6,
};

type StoredAction = Record<string, unknown> & {
  id?: unknown;
  title?: unknown;
  points?: unknown;
  icon?: unknown;
  iconId?: unknown;
  archived?: unknown;
  quickSlot?: unknown;
  orbit?: unknown;
  subjectId?: unknown;
  availableInAllSubjects?: unknown;
  attitudinalCriterionLinks?: unknown;
  trackOrdinaryCompliance?: unknown;
};

export function loadActionCatalog(): Action[] | null {
  if (typeof window === "undefined") return null;

  const storedCatalog = localStorage.getItem(STORAGE_KEY);

  if (!storedCatalog) return null;

  try {
    return hydrateActionCatalog(JSON.parse(storedCatalog));
  } catch {
    return cloneDefaultCatalog();
  }
}

export function saveActionCatalog(catalog: readonly Action[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeActionCatalog(catalog)));
}

export function hydrateActionCatalog(value: unknown): Action[] {
  if (!Array.isArray(value)) {
    return cloneDefaultCatalog();
  }

  const ids = new Set<string>();
  const catalog = value.flatMap((storedAction) => {
    const action = hydrateAction(storedAction);

    if (!action || ids.has(action.id)) return [];

    ids.add(action.id);
    return [action];
  });

  // New bundled proposals are appended without replacing any stored action.
  // A matching stable id always keeps the teacher's edited title and settings.
  actions.forEach((defaultAction) => {
    if (ids.has(defaultAction.id)) return;
    ids.add(defaultAction.id);
    catalog.push(cloneAction(defaultAction));
  });

  return catalog.length > 0 ? normalizeActionCatalog(catalog) : cloneDefaultCatalog();
}

/**
 * Additive read-time migration. Stored data is not rewritten merely by loading;
 * the normalized contract is persisted only on a later explicit catalog save.
 */
function hydrateAction(value: unknown): Action | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }

  const id = value.id.trim();
  const title = value.title.trim();
  const points = value.points;

  if (!id || !title || typeof points !== "number" || !Number.isFinite(points) || points === 0) {
    return null;
  }

  const defaultAction = actions.find((action) => action.id === id);
  const archived = value.archived === true;
  const context = normalizeActionContext(value);
  const quickSlot = archived
    ? null
    : hasOwn(value, "quickSlot")
      ? isQuickActionSlot(value.quickSlot) ? value.quickSlot : null
      : LEGACY_QUICK_SLOTS[id] ?? null;
  const icon = typeof value.icon === "string" ? value.icon : defaultAction?.icon;
  const iconId = typeof value.iconId === "string" ? value.iconId : undefined;
  const orbit = hydrateOrbit(value.orbit)?.orbit ?? defaultAction?.orbit;

  return {
    ...value,
    id,
    title,
    points,
    icon,
    iconId,
    archived,
    quickSlot,
    orbit,
    ...context,
    attitudinalCriterionLinks: normalizeAttitudinalCriterionLinks(
      value.attitudinalCriterionLinks
    ),
    trackOrdinaryCompliance: normalizeOrdinaryComplianceTracking(
      points,
      value.trackOrdinaryCompliance
    ),
  };
}

function hydrateOrbit(value: unknown): { orbit: { angle: number; variant: ActionVariant } } | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const orbit = value as { angle?: unknown; variant?: unknown };

  if (typeof orbit.angle !== "number" || !isActionVariant(orbit.variant)) return null;

  return { orbit: { angle: orbit.angle, variant: orbit.variant } };
}

function cloneDefaultCatalog(): Action[] {
  return actions.map(cloneAction);
}

function cloneAction(action: Action): Action {
  return {
    ...action,
    attitudinalCriterionLinks: action.attitudinalCriterionLinks.map((link) => ({ ...link })),
    ...(action.orbit ? { orbit: { ...action.orbit } } : {}),
  };
}

function hasOwn(value: StoredAction, key: keyof StoredAction): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is StoredAction {
  return typeof value === "object" && value !== null;
}

function isActionVariant(value: unknown): value is ActionVariant {
  return value === "success" || value === "bonus" || value === "reward"
    || value === "warning" || value === "danger" || value === "severe";
}
