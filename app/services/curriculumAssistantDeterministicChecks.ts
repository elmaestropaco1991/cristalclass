import type { Action } from "../types/action";
import type { CurriculumAssistantState } from "../types/curriculumAssistant";
import type { CurriculumCatalogCommand, CurriculumPack } from "../types/curriculum";
import {
  addPendingBasicKnowledge,
  applyCurriculumAssistantCatalogCommand,
  archiveCurriculumSubject,
  classifyCurriculumAssistantImportRepeat,
  confirmCurriculumAssistantImport,
  createCurriculumAssistantEntityId,
  createCurriculumAssistantImportIdMap,
  createManualCurriculumAssistantState,
  getActiveCurriculumSubjects,
  getEffectiveSubject,
  getEligibleActionsForCurriculumSubject,
  inspectCurriculumSubject,
  previewCurriculumAssistantImport,
  retireCurriculumEntity,
  setBasicKnowledgeAction,
  setBasicKnowledgeCriteria,
  setCurriculumSubjectActivation,
  setCurriculumTrackingEnabled,
} from "./curriculumAssistantService";
import {
  calculateCurriculumAssistantChecksum,
  getBrowserCurriculumAssistantStorage,
  getCurriculumAssistantStorageKey,
  persistCurriculumAssistantState,
  readCurriculumAssistantState,
  writeCurriculumAssistantState,
  type CurriculumAssistantStorageAdapter,
} from "./curriculumAssistantStorageService";
import {
  parseCurriculumPackJson,
  serializeCurriculumPackToJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";
import { getCurriculumStorageKeys } from "./curriculumStorageService";

type WithoutCommandBase<T> = T extends unknown
  ? Omit<T, "operationId" | "expectedVersion" | "occurredAt">
  : never;
type TestCatalogCommand = WithoutCommandBase<CurriculumCatalogCommand>;

export interface CurriculumAssistantDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

const CLASSROOM_ID = "classroom-assistant-check";
const OTHER_CLASSROOM_ID = "classroom-assistant-other";
const INSTANT = "2026-08-30T10:00:00.000Z";
const SUBJECT_ID = "spanish-language";
const OTHER_SUBJECT_ID = "mathematics";
const COMPETENCE_1 = "competence-language-1";
const COMPETENCE_2 = "competence-language-2";
const CRITERION_1 = "criterion-language-1";
const CRITERION_2 = "criterion-language-2";
const KNOWLEDGE_1 = "knowledge-language-1";

const ownAction = action("read-aloud", SUBJECT_ID, false, 1);
const globalAction = action("participation", "general", true, 2);
const foreignAction = action("calculation", OTHER_SUBJECT_ID, false, 1);
const knownActions = [ownAction, globalAction, foreignAction];
const knownActionIds = knownActions.map((item) => item.id);

export async function runCurriculumAssistantDeterministicChecks(): Promise<readonly CurriculumAssistantDeterministicCheck[]> {
  return [
    check("a class without assistant state reads empty and performs no write", () => {
      const storage = memoryStorage();
      return readCurriculumAssistantState(storage, CLASSROOM_ID).status === "empty"
        && storage.writes === 0;
    }),
    check("manual start creates a disabled class-local draft", () => {
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      return !state.trackingEnabled
        && state.classroomId === CLASSROOM_ID
        && state.catalog.pack?.subjects.length === 0
        && state.wizardStep === 2;
    }),
    check("ordinary observation is prepared by default without an invented duration threshold", () => {
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      return state.profile?.ordinaryTracking.enabled === true
        && state.profile.ordinaryTracking.minimumSessionDurationMinutes === 0
        && state.profile.ordinaryTracking.rules.length === 0;
    }),
    check("closing without starting leaves storage empty", () => {
      const storage = memoryStorage();
      readCurriculumAssistantState(storage, CLASSROOM_ID);
      return storage.writes === 0 && storage.values.size === 0;
    }),
    check("a subject can be created through the audited catalog editor", () => {
      const state = createSubjectState();
      return state.catalog.pack?.subjects[0].name === "Lengua"
        && state.catalog.pack.subjects[0].specificCompetences?.length === 0;
    }),
    check("competences preserve pedagogical order", () => {
      const state = createCompetenceState();
      return state.catalog.pack?.subjects[0].specificCompetences?.map((item) => item.id).join(",")
        === `${COMPETENCE_1},${COMPETENCE_2}`;
    }),
    check("criteria belong to exactly one competence", () => {
      const state = createCriteriaState();
      return state.catalog.pack?.subjects[0].criteria.map((item) => item.specificCompetenceId).join(",")
        === `${COMPETENCE_1},${COMPETENCE_2}`;
    }),
    check("a pending knowledge item makes the subject incomplete", () => {
      const state = addPendingKnowledge(createCriteriaState());
      const inspection = inspectCurriculumSubject(state, SUBJECT_ID, knownActionIds);
      return !inspection.canActivate
        && inspection.blockingMessages.some((message) => message.includes("pendientes"));
    }),
    check("one knowledge item can relate to criteria from two competences", () => {
      const state = createCompleteState();
      const knowledge = getEffectiveSubject(state, SUBJECT_ID)?.basicKnowledge[0];
      return knowledge?.criterionIds.join(",") === `${CRITERION_1},${CRITERION_2}`;
    }),
    check("cross-subject criterion manipulation is rejected", () => {
      const state = addOtherSubject(createCompleteState());
      const result = setBasicKnowledgeCriteria(
        state,
        SUBJECT_ID,
        KNOWLEDGE_1,
        [CRITERION_1, "criterion-from-mathematics"],
        knownActionIds,
        INSTANT
      );
      return result.status === "blocked";
    }),
    check("own and explicitly global actions are eligible in stable order", () => {
      const subject = getEffectiveSubject(createCompleteState(), SUBJECT_ID)!;
      return getEligibleActionsForCurriculumSubject(
        [foreignAction, ownAction, globalAction],
        subject
      ).map((item) => item.id).join(",") === `${ownAction.id},${globalAction.id}`;
    }),
    check("eligible actions are deduplicated by identity", () => {
      const subject = getEffectiveSubject(createCompleteState(), SUBJECT_ID)!;
      return getEligibleActionsForCurriculumSubject([ownAction, ownAction], subject).length === 1;
    }),
    check("an action relationship does not create evidence or a grade", () => {
      const state = addActionLink(createCompleteState(), ownAction);
      const serialized = JSON.stringify(state.actionLinks[0]);
      return state.actionLinks.length === 1
        && !serialized.includes("evidence")
        && !serialized.includes("grade")
        && !serialized.includes("score");
    }),
    check("positive and negative actions retain their observable effect", () => {
      const positive = addActionLink(createCompleteState(), ownAction);
      const negativeAction = action("interrupts", SUBJECT_ID, false, -1);
      const negative = addActionLink(positive, negativeAction);
      return negative.actionLinks.map((link) => link.effect).join(",") === "positive,contrary";
    }),
    check("action relationship identity skips collisions with catalog entities", () => {
      const base = createCompleteState();
      const collidingId = addActionLink(base, ownAction).actionLinks[0].id;
      const subject = base.catalog.pack!.subjects[0];
      const collisionState: CurriculumAssistantState = {
        ...base,
        catalog: {
          ...base.catalog,
          pack: {
            ...base.catalog.pack!,
            subjects: [{
              ...subject,
              criteria: subject.criteria.map((criterion, index) =>
                index === 0 ? { ...criterion, id: collidingId } : criterion
              ),
              basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
                ...knowledge,
                criterionIds: knowledge.criterionIds.map((id) =>
                  id === CRITERION_1 ? collidingId : id
                ),
              })),
            }],
          },
        },
      };
      const linked = addActionLink(collisionState, ownAction);
      return linked.actionLinks[0].id !== collidingId;
    }),
    check("a complete subject is ready for activation", () => {
      const inspection = inspectCurriculumSubject(createCompleteState(), SUBJECT_ID, knownActionIds);
      return inspection.canActivate && inspection.status === "ready";
    }),
    check("a broken relation is marked as needing review", () => {
      const state = addActionLink(createCompleteState(), ownAction);
      const inspection = inspectCurriculumSubject(state, SUBJECT_ID, [globalAction.id]);
      return !inspection.canActivate && inspection.status === "needs-review";
    }),
    check("an archived related action invalidates the tab without mutating activation", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), ownAction));
      const archivedAction = { ...ownAction, archived: true };
      const inspection = inspectCurriculumSubject(active, SUBJECT_ID, [archivedAction, globalAction]);
      return getActiveCurriculumSubjects(active, [archivedAction, globalAction]).length === 0
        && inspection.status === "needs-review"
        && active.profile?.selectedSubjectIds.includes(SUBJECT_ID) === true;
    }),
    check("an action moved to another subject invalidates its old relationship", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), ownAction));
      const movedAction = { ...ownAction, subjectId: foreignAction.subjectId };
      const inspection = inspectCurriculumSubject(active, SUBJECT_ID, [movedAction, globalAction]);
      return !inspection.canActivate
        && inspection.blockingMessages.some((message) => message.includes("pertenece"));
    }),
    check("an action that stops being global invalidates foreign relationships", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), globalAction));
      const restricted = { ...globalAction, availableInAllSubjects: false };
      return getActiveCurriculumSubjects(active, [ownAction, restricted]).length === 0;
    }),
    check("a changed action sign requires relationship review", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), ownAction));
      const changedSign = { ...ownAction, points: -1 };
      return !inspectCurriculumSubject(active, SUBJECT_ID, [changedSign]).canActivate;
    }),
    check("duplicate action identities require explicit review", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), ownAction));
      return !inspectCurriculumSubject(active, SUBJECT_ID, [ownAction, { ...ownAction }]).canActivate;
    }),
    check("an empty subject cannot activate", () => {
      const inspection = inspectCurriculumSubject(createSubjectState(), SUBJECT_ID, knownActionIds);
      return !inspection.canActivate
        && inspection.blockingMessages.some((message) => message.includes("competencias"));
    }),
    check("an incomplete second subject does not block a complete first subject", () => {
      const state = addOtherSubject(createCompleteState());
      return inspectCurriculumSubject(state, SUBJECT_ID, knownActionIds).canActivate;
    }),
    check("activation is independent and enables tracking", () => {
      const state = addOtherSubject(createCompleteState());
      const result = setCurriculumSubjectActivation(
        state,
        SUBJECT_ID,
        true,
        knownActionIds,
        INSTANT,
        true
      );
      return result.status === "activated"
        && result.state.trackingEnabled
        && result.state.profile?.selectedSubjectIds.join(",") === SUBJECT_ID;
    }),
    check("only activated valid subjects become tabs", () => {
      const active = activateCompleteState(addOtherSubject(createCompleteState()));
      return getActiveCurriculumSubjects(active, knownActions).map((subject) => subject.id).join(",") === SUBJECT_ID;
    }),
    check("global deactivation hides tabs and preserves subject activation", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), ownAction));
      const result = setCurriculumTrackingEnabled(active, false, INSTANT);
      return result.status === "applied"
        && getActiveCurriculumSubjects(result.state, knownActions).length === 0
        && result.state.profile?.selectedSubjectIds.includes(SUBJECT_ID) === true
        && result.state.actionLinks.length === 1;
    }),
    check("reactivation restores preserved tabs", () => {
      const active = activateCompleteState(createCompleteState());
      const paused = requireApplied(setCurriculumTrackingEnabled(active, false, INSTANT));
      const resumed = requireApplied(setCurriculumTrackingEnabled(paused, true, INSTANT));
      return getActiveCurriculumSubjects(resumed, knownActions)[0]?.id === SUBJECT_ID;
    }),
    check("pausing and resuming keeps profile status consistent", () => {
      const active = activateCompleteState(createCompleteState());
      const paused = requireApplied(setCurriculumTrackingEnabled(active, false, INSTANT));
      const resumed = requireApplied(setCurriculumTrackingEnabled(paused, true, INSTANT));
      return paused.profile?.status === "configured"
        && resumed.profile?.status === "active";
    }),
    check("deactivating the final subject also turns off general tracking", () => {
      const active = activateCompleteState(addActionLink(createCompleteState(), ownAction));
      const result = setCurriculumSubjectActivation(
        active,
        SUBJECT_ID,
        false,
        knownActions,
        INSTANT
      );
      return result.status === "deactivated"
        && !result.state.trackingEnabled
        && result.state.profile?.status === "configured"
        && result.state.actionLinks.length === 1
        && result.state.catalog.pack?.subjects.length === 1;
    }),
    check("repeated activation and deactivation are idempotent", () => {
      const active = activateCompleteState(createCompleteState());
      const repeatedActivation = setCurriculumSubjectActivation(
        active, SUBJECT_ID, true, knownActions, INSTANT, true
      );
      if (repeatedActivation.status !== "activated" || repeatedActivation.state !== active) return false;
      const firstDeactivation = setCurriculumSubjectActivation(
        active, SUBJECT_ID, false, knownActions, INSTANT
      );
      if (firstDeactivation.status !== "deactivated") return false;
      const repeatedDeactivation = setCurriculumSubjectActivation(
        firstDeactivation.state, SUBJECT_ID, false, knownActions, INSTANT
      );
      return repeatedDeactivation.status === "deactivated"
        && repeatedDeactivation.state === firstDeactivation.state;
    }),
    check("a valid non-structural edit keeps an active subject active", () => {
      const active = activateCompleteState(createCompleteState());
      const edited = applyCommand(active, {
        type: "update-subject",
        packId: active.catalog.pack!.id,
        subjectId: SUBJECT_ID,
        name: "Lengua castellana",
        externalCode: "LEN",
      });
      return edited.trackingEnabled
        && edited.profile?.selectedSubjectIds.includes(SUBJECT_ID) === true;
    }),
    check("structural invalidation of an active subject requires confirmation", () => {
      const active = activateCompleteState(createCompleteState());
      const result = addPendingBasicKnowledge(
        active,
        { id: "pending-on-active", subjectId: SUBJECT_ID, text: "Nuevo saber" },
        INSTANT,
        knownActionIds
      );
      return result.status === "requires-deactivation";
    }),
    check("confirmed structural invalidation deactivates without deleting data", () => {
      const active = activateCompleteState(createCompleteState());
      const result = addPendingBasicKnowledge(
        active,
        { id: "pending-on-active", subjectId: SUBJECT_ID, text: "Nuevo saber" },
        INSTANT,
        knownActionIds,
        true
      );
      return result.status === "applied"
        && result.state.profile?.selectedSubjectIds.length === 0
        && !result.state.trackingEnabled
        && result.state.pendingBasicKnowledge[0].text === "Nuevo saber";
    }),
    check("retirement with dependencies is blocked and explains them", () => {
      const result = retireCurriculumEntity(
        createCompleteState(),
        SUBJECT_ID,
        "criterion",
        CRITERION_1,
        knownActionIds,
        INSTANT
      );
      return result.status === "blocked" && (result.dependencies?.length ?? 0) > 0;
    }),
    check("subject archive is non-destructive", () => {
      const state = createCompleteState();
      const result = archiveCurriculumSubject(state, SUBJECT_ID, INSTANT);
      return result.status === "applied"
        && result.state.catalog.pack?.subjects.some((subject) => subject.id === SUBJECT_ID) === true
        && result.state.archivedSubjectIds.includes(SUBJECT_ID);
    }),
    check("frozen inputs remain unchanged", () => {
      const state = deepFreeze(createCompleteState());
      const snapshot = JSON.stringify(state);
      const next = addActionLink(state, ownAction);
      return JSON.stringify(state) === snapshot && next.actionLinks.length === 1;
    }),
    check("a confirmed draft round-trips with checksum", () => {
      const storage = memoryStorage();
      const state = { ...createCompleteState(), revision: 1 };
      const write = writeCurriculumAssistantState(storage, state, 0, INSTANT);
      const read = readCurriculumAssistantState(storage, CLASSROOM_ID);
      return write.status === "written"
        && read.status === "valid"
        && read.envelope.checksum === calculateCurriculumAssistantChecksum(state);
    }),
    check("a simulated browser close can reopen the last confirmed change", () => {
      const storage = memoryStorage();
      const state = { ...createCompleteState(), revision: 1 };
      writeCurriculumAssistantState(storage, state, 0, INSTANT);
      const reopened = readCurriculumAssistantState(storage, CLASSROOM_ID);
      return reopened.status === "valid"
        && reopened.envelope.state.catalog.pack?.subjects[0].basicKnowledge.length === 1;
    }),
    check("classroom storage keys are isolated", () =>
      getCurriculumAssistantStorageKey(CLASSROOM_ID)
        !== getCurriculumAssistantStorageKey(OTHER_CLASSROOM_ID)),
    check("a draft from another classroom is not returned", () => {
      const storage = memoryStorage();
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      writeCurriculumAssistantState(storage, state, 0, INSTANT);
      return readCurriculumAssistantState(storage, OTHER_CLASSROOM_ID).status === "empty";
    }),
    check("checksum tampering is reported without repair", () => {
      const storage = memoryStorage();
      const state = { ...createCompleteState(), revision: 1 };
      writeCurriculumAssistantState(storage, state, 0, INSTANT);
      const key = getCurriculumAssistantStorageKey(CLASSROOM_ID);
      const envelope = JSON.parse(storage.getItem(key)!) as Record<string, unknown>;
      envelope.checksum = "curriculum-assistant-v1:tampered";
      storage.values.set(key, JSON.stringify(envelope));
      const writesBefore = storage.writes;
      return readCurriculumAssistantState(storage, CLASSROOM_ID).status === "corrupt"
        && storage.writes === writesBefore;
    }),
    check("legacy and unknown assistant envelopes remain explicit and read-only", () => {
      const legacy = memoryStorage();
      const unknown = memoryStorage();
      const key = getCurriculumAssistantStorageKey(CLASSROOM_ID);
      legacy.values.set(key, JSON.stringify({ schemaVersion: 0, payload: "conservado" }));
      unknown.values.set(key, JSON.stringify({ schemaVersion: 99, payload: "conservado" }));
      return readCurriculumAssistantState(legacy, CLASSROOM_ID).status === "legacy-review-required"
        && readCurriculumAssistantState(unknown, CLASSROOM_ID).status === "incompatible-version"
        && legacy.writes === 0
        && unknown.writes === 0;
    }),
    check("unsafe keys and excessive depth are rejected before state use", () => {
      const unsafe = memoryStorage();
      const deep = memoryStorage();
      const key = getCurriculumAssistantStorageKey(CLASSROOM_ID);
      unsafe.values.set(key, '{"schemaVersion":1,"__proto__":{}}');
      deep.values.set(key, `${"[".repeat(25)}0${"]".repeat(25)}`);
      return readCurriculumAssistantState(unsafe, CLASSROOM_ID).status === "corrupt"
        && readCurriculumAssistantState(deep, CLASSROOM_ID).status === "corrupt";
    }),
    check("unicode content round-trips without changing its checksum", () => {
      const storage = memoryStorage();
      const base = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      const state: CurriculumAssistantState = {
        ...base,
        catalog: {
          ...base.catalog,
          pack: { ...base.catalog.pack!, name: "Lengua ñ · 漢字 · 😀" },
        },
      };
      const written = writeCurriculumAssistantState(storage, state, 0, INSTANT);
      const read = readCurriculumAssistantState(storage, CLASSROOM_ID);
      return written.status === "written"
        && read.status === "valid"
        && read.envelope.state.catalog.pack?.name === state.catalog.pack?.name
        && read.envelope.checksum === calculateCurriculumAssistantChecksum(state);
    }),
    check("the combined curriculum budget fails before the assistant key is written", () => {
      const storage = memoryStorage();
      storage.values.set(
        getCurriculumStorageKeys(CLASSROOM_ID).current,
        "x".repeat(1_250_000)
      );
      const result = writeCurriculumAssistantState(
        storage,
        createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT),
        0,
        INSTANT
      );
      return result.status === "size-limit-exceeded"
        && !storage.values.has(getCurriculumAssistantStorageKey(CLASSROOM_ID));
    }),
    check("optimistic revision rejects stale writers", () => {
      const storage = memoryStorage();
      const first = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      writeCurriculumAssistantState(storage, first, 0, INSTANT);
      const stale = { ...first, revision: 2, updatedAt: INSTANT };
      return writeCurriculumAssistantState(storage, stale, 0, INSTANT).status
        === "revision-conflict";
    }),
    await asyncCheck("the cooperative lock wraps a write", async () => {
      const storage = memoryStorage();
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      let locks = 0;
      const result = await persistCurriculumAssistantState(storage, {
        async runExclusive(_classroomId, operation) {
          locks += 1;
          return { status: "acquired" as const, value: await operation() };
        },
      }, state, 0, INSTANT);
      return locks === 1 && result.status === "written";
    }),
    await asyncCheck("a throwing lock provider returns an explicit recoverable result", async () => {
      const result = await persistCurriculumAssistantState(
        memoryStorage(),
        {
          async runExclusive() {
            throw new Error("lock provider unavailable");
          },
        },
        createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT),
        0,
        INSTANT
      );
      return result.status === "lock-unavailable";
    }),
    check("SSR adapter performs no browser access", () => getBrowserCurriculumAssistantStorage() === null),
    check("failed writes are reported", () => {
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      const storage: CurriculumAssistantStorageAdapter = {
        getItem: () => null,
        setItem: () => { throw new Error("quota"); },
      };
      return writeCurriculumAssistantState(storage, state, 0, INSTANT).status === "storage-error";
    }),
    check("a write that stores and then throws is verified as written", () => {
      const storage = memoryStorage();
      const originalSet = storage.setItem.bind(storage);
      storage.setItem = (key, value) => {
        originalSet(key, value);
        throw new Error("unknown browser outcome");
      };
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      return writeCurriculumAssistantState(storage, state, 0, INSTANT).status === "written";
    }),
    check("a post-write verification mismatch reports an unknown outcome", () => {
      const storage = memoryStorage();
      storage.setItem = (key) => {
        storage.values.set(key, "{}");
        storage.writes += 1;
      };
      const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
      return writeCurriculumAssistantState(storage, state, 0, INSTANT).status
        === "write-outcome-unknown";
    }),
    check("contradictory profile activation is rejected before writing", () => {
      const active = activateCompleteState(createCompleteState());
      const contradictory = {
        ...active,
        trackingEnabled: false,
      };
      return writeCurriculumAssistantState(memoryStorage(), contradictory, 0, INSTANT).status
        === "invalid-state";
    }),
    check("duplicate action relationships are rejected before writing", () => {
      const linked = addActionLink(createCompleteState(), ownAction);
      const duplicated = {
        ...linked,
        actionLinks: [...linked.actionLinks, { ...linked.actionLinks[0], id: "duplicate-link" }],
      };
      return writeCurriculumAssistantState(memoryStorage(), duplicated, 0, INSTANT).status
        === "invalid-state";
    }),
    check("auxiliary draft references cannot contradict the catalog", () => {
      const state = createCompleteState();
      const duplicatePending = {
        ...state,
        pendingBasicKnowledge: [{
          id: KNOWLEDGE_1,
          subjectId: SUBJECT_ID,
          text: "Duplicado",
        }],
      };
      const ghostArchive = { ...state, archivedSubjectIds: ["missing-subject"] };
      const nonEmptyOverride = {
        ...state,
        knowledgeCriteriaOverrides: [{
          basicKnowledgeId: KNOWLEDGE_1,
          criterionIds: [CRITERION_1],
        }],
      };
      return [duplicatePending, ghostArchive, nonEmptyOverride].every((candidate) =>
        writeCurriculumAssistantState(memoryStorage(), candidate, 0, INSTANT).status
          === "invalid-state"
      );
    }),
    check("oversized stored drafts are blocked without parsing", () => {
      const storage = memoryStorage();
      storage.values.set(getCurriculumAssistantStorageKey(CLASSROOM_ID), " ".repeat(750_001));
      return readCurriculumAssistantState(storage, CLASSROOM_ID).status === "corrupt";
    }),
    check("import-as-new mapping is complete, exact and injective", () => {
      const pack = createCompleteState().catalog.pack!;
      const map = createCurriculumAssistantImportIdMap(pack, CLASSROOM_ID, "checksum");
      const sources = entityIds(pack);
      const targets = [map.packId, ...Object.values(map.subjectIds), ...Object.values(map.competenceIds), ...Object.values(map.criterionIds), ...Object.values(map.basicKnowledgeIds)];
      return Object.keys(map.subjectIds).length === pack.subjects.length
        && targets.length === sources.length
        && new Set(targets).size === targets.length
        && targets.every((target) => !sources.includes(target));
    }),
    check("import entity identities do not depend on pedagogical order", () => {
      const pack = createCompleteState().catalog.pack!;
      const subject = pack.subjects[0];
      const reordered: CurriculumPack = {
        ...pack,
        subjects: [{
          ...subject,
          specificCompetences: [...(subject.specificCompetences ?? [])].reverse(),
          criteria: [...subject.criteria].reverse(),
        }],
      };
      const first = createCurriculumAssistantImportIdMap(pack, CLASSROOM_ID, "first");
      const second = createCurriculumAssistantImportIdMap(reordered, CLASSROOM_ID, "second");
      return JSON.stringify(first) === JSON.stringify(second);
    }),
    check("manual identity generation skips an existing deterministic candidate", () => {
      const state = createSubjectState();
      const collidingId = createCurriculumAssistantEntityId(state, "subject");
      const subject = state.catalog.pack!.subjects[0];
      const collisionState: CurriculumAssistantState = {
        ...state,
        catalog: {
          ...state.catalog,
          pack: {
            ...state.catalog.pack!,
            subjects: [{ ...subject, id: collidingId }],
          },
        },
      };
      return createCurriculumAssistantEntityId(collisionState, "subject") !== collidingId;
    }),
    check("valid v2 import preview writes nothing", () => {
      const parsed = createParsedPack();
      const storage = memoryStorage();
      const preview = previewCurriculumAssistantImport(CLASSROOM_ID, parsed);
      return preview.canApply && preview.classification === "import-as-new" && storage.writes === 0;
    }),
    check("confirmed v2 import preserves pedagogical order and relations", () => {
      const parsed = createParsedPack();
      const preview = previewCurriculumAssistantImport(CLASSROOM_ID, parsed);
      const state = confirmCurriculumAssistantImport(CLASSROOM_ID, preview, INSTANT);
      const subject = state.catalog.pack!.subjects[0];
      return subject.specificCompetences?.map((item) => item.text).join(",")
        === "Comprender textos,Comunicar ideas"
        && subject.basicKnowledge[0].criterionIds.length === 2;
    }),
    check("an imported subject retains its explicit source identity for own actions", () => {
      const preview = previewCurriculumAssistantImport(CLASSROOM_ID, createParsedPack());
      const state = confirmCurriculumAssistantImport(CLASSROOM_ID, preview, INSTANT);
      const subject = state.catalog.pack!.subjects[0];
      return subject.legacySubjectId === SUBJECT_ID
        && getEligibleActionsForCurriculumSubject([ownAction], subject)[0]?.id === ownAction.id;
    }),
    check("a confirmed v2 import persists and reopens as a draft", () => {
      const storage = memoryStorage();
      const preview = previewCurriculumAssistantImport(CLASSROOM_ID, createParsedPack());
      const state = confirmCurriculumAssistantImport(CLASSROOM_ID, preview, INSTANT);
      const write = writeCurriculumAssistantState(storage, state, 0, INSTANT);
      const reopened = readCurriculumAssistantState(storage, CLASSROOM_ID);
      return write.status === "written"
        && reopened.status === "valid"
        && reopened.envelope.state.catalog.pack?.subjects[0].basicKnowledge[0].criterionIds.length === 2;
    }),
    check("repeated import analysis is deterministic", () => {
      const parsed = createParsedPack();
      const first = previewCurriculumAssistantImport(CLASSROOM_ID, parsed);
      const second = previewCurriculumAssistantImport(CLASSROOM_ID, parsed);
      return first.operationFingerprint === second.operationFingerprint
        && JSON.stringify(first.resolution) === JSON.stringify(second.resolution);
    }),
    check("a repeated identical import is idempotent and a divergent one is detected", () => {
      const parsed = createParsedPack();
      const first = confirmCurriculumAssistantImport(
        CLASSROOM_ID,
        previewCurriculumAssistantImport(CLASSROOM_ID, parsed),
        INSTANT
      );
      const repeated = confirmCurriculumAssistantImport(
        CLASSROOM_ID,
        previewCurriculumAssistantImport(CLASSROOM_ID, parsed),
        "2026-08-30T11:00:00.000Z"
      );
      const divergentPack = { ...parsed.pack, name: `${parsed.pack.name} revisado` };
      const divergentParsed = parseCurriculumPackJson(
        serializeCurriculumPackToJson(divergentPack, INSTANT)
      );
      if (divergentParsed.status !== "valid") return false;
      const divergent = confirmCurriculumAssistantImport(
        CLASSROOM_ID,
        previewCurriculumAssistantImport(CLASSROOM_ID, divergentParsed),
        INSTANT
      );
      return classifyCurriculumAssistantImportRepeat(first, repeated) === "idempotent"
        && classifyCurriculumAssistantImportRepeat(first, divergent) === "divergent";
    }),
    check("no assistant operation changes crystals, evidence, grades or exports", () => {
      const serialized = JSON.stringify(activateCompleteState(addActionLink(createCompleteState(), ownAction)));
      return !serialized.includes("cristales")
        && !serialized.includes("evidences")
        && !serialized.includes("grades")
        && !serialized.includes("exports");
    }),
  ];
}

function createSubjectState(): CurriculumAssistantState {
  const state = createManualCurriculumAssistantState(CLASSROOM_ID, INSTANT);
  return applyCommand(state, {
    type: "add-subject",
    packId: state.catalog.pack!.id,
    subject: { id: SUBJECT_ID, name: "Lengua", externalCode: "LEN" },
  });
}

function createCompetenceState(): CurriculumAssistantState {
  let state = createSubjectState();
  state = applyCommand(state, {
    type: "add-specific-competence",
    packId: state.catalog.pack!.id,
    subjectId: SUBJECT_ID,
    specificCompetence: { id: COMPETENCE_1, text: "Comprender textos" },
  });
  return applyCommand(state, {
    type: "add-specific-competence",
    packId: state.catalog.pack!.id,
    subjectId: SUBJECT_ID,
    specificCompetence: { id: COMPETENCE_2, text: "Comunicar ideas" },
  });
}

function createCriteriaState(): CurriculumAssistantState {
  let state = createCompetenceState();
  state = applyCommand(state, {
    type: "add-criterion",
    packId: state.catalog.pack!.id,
    subjectId: SUBJECT_ID,
    criterion: { id: CRITERION_1, specificCompetenceId: COMPETENCE_1, text: "Comprende" },
  });
  return applyCommand(state, {
    type: "add-criterion",
    packId: state.catalog.pack!.id,
    subjectId: SUBJECT_ID,
    criterion: { id: CRITERION_2, specificCompetenceId: COMPETENCE_2, text: "Comunica" },
  });
}

function addPendingKnowledge(state: CurriculumAssistantState): CurriculumAssistantState {
  const result = addPendingBasicKnowledge(
    state,
    { id: KNOWLEDGE_1, subjectId: SUBJECT_ID, text: "Lectura comprensiva" },
    INSTANT,
    knownActionIds
  );
  return requireApplied(result);
}

function createCompleteState(): CurriculumAssistantState {
  const pending = addPendingKnowledge(createCriteriaState());
  return requireApplied(setBasicKnowledgeCriteria(
    pending,
    SUBJECT_ID,
    KNOWLEDGE_1,
    [CRITERION_1, CRITERION_2],
    knownActionIds,
    INSTANT
  ));
}

function addOtherSubject(state: CurriculumAssistantState): CurriculumAssistantState {
  let next = applyCommand(state, {
    type: "add-subject",
    packId: state.catalog.pack!.id,
    subject: { id: OTHER_SUBJECT_ID, name: "Matemáticas" },
  });
  next = applyCommand(next, {
    type: "add-specific-competence",
    packId: next.catalog.pack!.id,
    subjectId: OTHER_SUBJECT_ID,
    specificCompetence: { id: "competence-mathematics", text: "Resolver problemas" },
  });
  return applyCommand(next, {
    type: "add-criterion",
    packId: next.catalog.pack!.id,
    subjectId: OTHER_SUBJECT_ID,
    criterion: {
      id: "criterion-from-mathematics",
      specificCompetenceId: "competence-mathematics",
      text: "Calcula",
    },
  });
}

function addActionLink(state: CurriculumAssistantState, selectedAction: Action): CurriculumAssistantState {
  return requireApplied(setBasicKnowledgeAction(
    state,
    SUBJECT_ID,
    KNOWLEDGE_1,
    selectedAction,
    true,
    INSTANT
  ));
}

function activateCompleteState(state: CurriculumAssistantState): CurriculumAssistantState {
  const result = setCurriculumSubjectActivation(
    state,
    SUBJECT_ID,
    true,
    [...knownActionIds, "interrupts"],
    INSTANT,
    true
  );
  if (result.status !== "activated") throw new Error("Expected activation.");
  return result.state;
}

function applyCommand(
  state: CurriculumAssistantState,
  command: TestCatalogCommand
): CurriculumAssistantState {
  const entityId = "subjectId" in command ? command.subjectId : command.type;
  const complete = {
    ...command,
    operationId: `check-operation-${state.catalog.revision + 1}`,
    expectedVersion: state.catalog.revision,
    occurredAt: INSTANT,
  } as CurriculumCatalogCommand;
  const result = applyCurriculumAssistantCatalogCommand(state, complete, knownActionIds);
  if (result.status !== "applied") throw new Error(`Command failed for ${entityId}.`);
  return result.state;
}

function requireApplied(result: ReturnType<typeof setBasicKnowledgeCriteria> | ReturnType<typeof setBasicKnowledgeAction> | ReturnType<typeof setCurriculumTrackingEnabled>): CurriculumAssistantState {
  if (result.status !== "applied") throw new Error("Expected applied result.");
  return result.state;
}

function createParsedPack(): CurriculumPackJsonValidResult {
  const pack = createCompleteState().catalog.pack!;
  const parsed = parseCurriculumPackJson(serializeCurriculumPackToJson(pack, INSTANT));
  if (parsed.status !== "valid") throw new Error("Expected valid v2 pack.");
  return parsed;
}

function entityIds(pack: CurriculumPack): string[] {
  return [
    pack.id,
    ...pack.subjects.flatMap((subject) => [
      subject.id,
      ...(subject.specificCompetences?.map((item) => item.id) ?? []),
      ...subject.criteria.map((item) => item.id),
      ...subject.basicKnowledge.map((item) => item.id),
    ]),
  ];
}

function action(id: string, subjectId: Action["subjectId"], availableInAllSubjects: boolean, points: number): Action {
  return {
    id,
    title: id,
    points,
    archived: false,
    quickSlot: null,
    subjectId,
    availableInAllSubjects,
    attitudinalCriterionLinks: [],
    trackOrdinaryCompliance: false,
  };
}

type MemoryStorage = CurriculumAssistantStorageAdapter & {
  readonly values: Map<string, string>;
  writes: number;
};

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    values,
    writes: 0,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); this.writes += 1; },
  };
}

function check(name: string, predicate: () => boolean): CurriculumAssistantDeterministicCheck {
  try { return { name, passed: predicate() }; } catch { return { name, passed: false }; }
}

async function asyncCheck(name: string, predicate: () => Promise<boolean>): Promise<CurriculumAssistantDeterministicCheck> {
  try { return { name, passed: await predicate() }; } catch { return { name, passed: false }; }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((nested) => deepFreeze(nested, seen));
  return Object.freeze(value);
}
