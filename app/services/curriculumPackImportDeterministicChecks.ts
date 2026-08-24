import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURRICULUM_SCHEMA_VERSION,
  type CurriculumPack,
  type VersionedCurriculumData,
} from "../types/curriculum";
import {
  DEFAULT_CURRICULUM_PACK_JSON_LIMITS,
  CURRICULUM_PACK_JSON_FORMAT,
  CURRICULUM_PACK_CHECKSUM_SEMANTICS,
  areCurriculumPacksCanonicallyEqual,
  calculateCurriculumPackContentChecksum,
  parseCurriculumPackJson,
  serializeCurriculumPackContent,
  serializeCurriculumPackToJson,
  validateCurriculumPackForJson,
  type CurriculumPackJsonValidResult,
} from "./curriculumPackJsonService";
import {
  applyCurriculumPackImport,
  createEmptyCurriculumPackImportState,
  parseCurriculumPackImportResolutionJson,
  previewCurriculumPackImport,
  type CurriculumPackImportIdMap,
  type CurriculumPackImportRequest,
  type CurriculumPackImportState,
} from "./curriculumPackImportService";
import { validateCurriculumData } from "./curriculumValidationService";
import {
  CURRICULUM_STORAGE_PROTOCOL_SIZE_SEMANTICS,
  DEFAULT_CURRICULUM_STORAGE_BUDGET,
  estimateCurriculumStorageProtocolPeak,
  measureCurriculumJsonText,
  measureCurriculumSerializedJson,
} from "./curriculumStorageBudgetService";

export interface CurriculumPackImportDeterministicCheck {
  readonly name: string;
  readonly passed: boolean;
}

export interface CurriculumPackImportStorageAuditMeasurement {
  readonly targetCodeUnits: number;
  readonly pack: ReturnType<typeof measureCurriculumSerializedJson>;
  readonly nativeEnvelope: ReturnType<typeof measureCurriculumSerializedJson>;
  readonly defaultBudgetBlocksInitialImport: boolean;
  readonly afterOperations: Readonly<Record<1 | 5 | 20, {
    readonly state: ReturnType<typeof measureCurriculumSerializedJson>;
    readonly appliedOperations: ReturnType<typeof measureCurriculumSerializedJson>;
    readonly storageEnvelope: ReturnType<typeof measureCurriculumSerializedJson>;
    readonly protocolPeak: ReturnType<typeof measureCurriculumSerializedJson>;
  }>>;
}

const FIRST_EXPORTED_AT = "2026-08-24T10:00:00.000Z";
const SECOND_EXPORTED_AT = "2027-01-02T03:04:05.000Z";

export function runCurriculumPackImportDeterministicChecks(): readonly CurriculumPackImportDeterministicCheck[] {
  return [
    check("1. a valid pack serializes to the native envelope", () => {
      const serialized = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT, {
        exporterVersion: "test-1",
        pretty: true,
      });
      const root = JSON.parse(serialized) as Record<string, unknown>;
      return root.format === CURRICULUM_PACK_JSON_FORMAT
        && root.schemaVersion === 1
        && typeof root.contentChecksum === "string"
        && isRecord(root.pack);
    }),
    check("2. equal content produces the same checksum", () => {
      const first = createPack();
      const second = JSON.parse(JSON.stringify(first)) as CurriculumPack;
      return calculateCurriculumPackContentChecksum(first)
        === calculateCurriculumPackContentChecksum(second);
    }),
    check("3. informative exportedAt changes do not alter the checksum", () => {
      const first = requireParsed(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      const second = requireParsed(serializeCurriculumPackToJson(createPack(), SECOND_EXPORTED_AT));
      return first.contentChecksum === second.contentChecksum
        && first.envelope.exportedAt !== second.envelope.exportedAt;
    }),
    check("4. pedagogical subject criterion knowledge and relation order is preserved", () => {
      const pack = createPack();
      const parsed = requireParsed(serializeCurriculumPackToJson(pack, FIRST_EXPORTED_AT, { pretty: true }));
      return parsed.pack.subjects.map((item) => item.id).join(",") === "subject-language,subject-math"
        && parsed.pack.subjects[0].criteria.map((item) => item.id).join(",") === "criterion-b,criterion-a"
        && parsed.pack.subjects[0].basicKnowledge.map((item) => item.id).join(",") === "knowledge-b,knowledge-a"
        && parsed.pack.subjects[0].basicKnowledge[0].criterionIds.join(",") === "criterion-b,criterion-a";
    }),
    check("5. malformed JSON is distinguished", () =>
      parseCurriculumPackJson("{not-json").status === "malformed-json"),
    check("6. an unknown format is distinguished", () => {
      const root = JSON.parse(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      root.format = "another.format";
      return parseCurriculumPackJson(JSON.stringify(root)).status === "unknown-format";
    }),
    check("7. a future exchange schema is rejected without conversion", () => {
      const root = JSON.parse(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      root.schemaVersion = 99;
      const parsed = parseCurriculumPackJson(JSON.stringify(root));
      return parsed.status === "unsupported-schema-version"
        && parsed.foundSchemaVersion === 99;
    }),
    check("8. altered content with the old checksum is rejected", () => {
      const root = JSON.parse(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      root.pack.subjects[0].criteria[0].text = "Contenido alterado";
      return parseCurriculumPackJson(JSON.stringify(root)).status === "checksum-mismatch";
    }),
    check("9. an invalid pack is rejected", () => {
      const root = JSON.parse(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      delete root.pack.name;
      return parseCurriculumPackJson(JSON.stringify(root)).status === "invalid-pack";
    }),
    check("10. a broken criterion reference is rejected distinctly", () => {
      const root = JSON.parse(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      root.pack.subjects[0].basicKnowledge[0].criterionIds = ["missing-criterion"];
      return parseCurriculumPackJson(JSON.stringify(root)).status === "broken-references";
    }),
    check("11. maximum JSON text length is enforced before parsing", () =>
      parseCurriculumPackJson("{\"value\":\"0123456789\"}", {
        limits: { maxJsonTextLength: 10 },
      }).status === "limits-exceeded"),
    check("12. maximum nesting depth is enforced", () =>
      parseCurriculumPackJson("[[[[[[0]]]]]]", {
        limits: { maxDepth: 5 },
      }).status === "limits-exceeded"),
    check("13. entity count limits are enforced", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      return parseCurriculumPackJson(json, {
        limits: { maxCriteriaPerSubject: 1 },
      }).status === "limits-exceeded";
    }),
    check("14. name code and text length limits are enforced without truncation", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      const result = parseCurriculumPackJson(json, { limits: { maxNameLength: 5 } });
      return result.status === "limits-exceeded" && json.includes("Catálogo de prueba");
    }),
    check("15. dangerous object keys are rejected", () => {
      const root = JSON.parse(serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT));
      const withDangerousKey = JSON.stringify(root).replace(
        `\"format\":\"${CURRICULUM_PACK_JSON_FORMAT}\"`,
        `\"__proto__\":{},\"format\":\"${CURRICULUM_PACK_JSON_FORMAT}\"`
      );
      return parseCurriculumPackJson(withDangerousKey).status === "unsafe-structure";
    }),
    check("16. non-finite JSON numbers are rejected", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      const nonFinite = json.replace(`\"schemaVersion\":1`, `\"schemaVersion\":1e400`);
      return parseCurriculumPackJson(nonFinite).status === "unsafe-structure";
    }),
    check("17. a completely new pack is applicable and imports once", () => {
      const analyzed = analyzePack(createPack());
      const state = createEmptyCurriculumPackImportState();
      const request = importRequest(analyzed, "new-pack", state.revision);
      const preview = previewCurriculumPackImport(analyzed, state, request);
      const applied = applyWithPreview(state, preview);
      return preview.classification === "new-pack"
        && preview.canApply
        && applied.status === "applied"
        && applied.state.revision === 1
        && applied.state.packs.length === 1;
    }),
    check("18. an identical existing pack is recognized", () => {
      const imported = importOnce(createPack(), "first-import");
      const analyzed = analyzePack(createPack());
      const preview = previewCurriculumPackImport(
        analyzed,
        imported,
        importRequest(analyzed, "identical-import", imported.revision)
      );
      const reusePreview = previewCurriculumPackImport(
        analyzed,
        imported,
        importRequest(analyzed, "reuse-identical", imported.revision),
        { resolution: { kind: "reuse-identical" } }
      );
      const reused = applyWithPreview(imported, reusePreview);
      return preview.status === "idempotent"
        && preview.classification === "same-pack-id-identical"
        && preview.duplicates.some((item) => item.kind === "identical-package")
        && preview.resultingRevision === imported.revision
        && reused.status === "reused"
        && reused.state.revision === imported.revision
        && reused.state.packs.length === 1;
    }),
    check("19. reimporting the same operation is idempotent", () => {
      const analyzed = analyzePack(createPack());
      const empty = createEmptyCurriculumPackImportState();
      const request = importRequest(analyzed, "retry-import", 0);
      const preview = previewCurriculumPackImport(analyzed, empty, request);
      const first = applyWithPreview(empty, preview);
      if (first.status !== "applied") return false;
      const retryPreview = previewCurriculumPackImport(analyzed, first.state, request);
      const retry = applyWithPreview(first.state, retryPreview);
      return retryPreview.status === "idempotent"
        && retry.status === "idempotent"
        && retry.state.revision === first.state.revision
        && retry.state.packs.length === 1;
    }),
    check("20. the same packId with different content is blocked", () => {
      const existing = importOnce(createPack(), "same-id-base");
      const changed = changePackText(createPack(), "Otro contenido");
      const analyzed = analyzePack(changed);
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "same-id-conflict", existing.revision)
      );
      const skipPreview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "skip-conflict", existing.revision),
        { resolution: { kind: "skip-import" } }
      );
      const skipped = applyWithPreview(existing, skipPreview);
      return !preview.canApply
        && preview.blockingConflicts.some((item) => item.code === "same-pack-id-different-content")
        && preview.decisionsRequired.length === 1
        && skipped.status === "skipped"
        && skipped.state.revision === existing.revision
        && skipped.state.packs.length === existing.packs.length;
    }),
    check("21. the same provenance and version with a different checksum is blocked", () => {
      const first = createExternalPack("external-pack-a", "subject-a", "criterion-a1", "knowledge-a1", "Texto A");
      const second = createExternalPack("external-pack-b", "subject-b", "criterion-b1", "knowledge-b1", "Texto B");
      const existing = importOnce(first, "source-base");
      const analyzed = analyzePack(second);
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "source-conflict", existing.revision)
      );
      return preview.blockingConflicts.some(
        (item) => item.code === "source-version-checksum-conflict"
      );
    }),
    check("22. duplicate text under different IDs warns without merging", () => {
      const existing = importOnce(createPack(), "duplicate-text-base");
      const duplicate = remapPackIds(createPack(), "copy");
      const analyzed = analyzePack(duplicate);
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "duplicate-text", existing.revision)
      );
      return preview.canApply
        && preview.warnings.some((item) => item.code === "apparent-content-duplicate")
        && preview.proposedPack?.id === duplicate.id
        && preview.proposedPack.subjects[0].criteria[0].id !== existing.packs[0].subjects[0].criteria[0].id;
    }),
    check("23. import-as-new without a complete explicit map is rejected", () => {
      const existing = importOnce(createPack(), "incomplete-map-base");
      const analyzed = analyzePack(changePackText(createPack(), "Conflicto"));
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "incomplete-map", existing.revision),
        {
          resolution: {
            kind: "import-as-new",
            idMap: {
              packId: "new-pack",
              subjectIds: {},
              criterionIds: {},
              basicKnowledgeIds: {},
            },
          },
        }
      );
      return !preview.canApply
        && preview.blockingConflicts.some((item) => item.code === "incomplete-id-map");
    }),
    check("24. import-as-new remaps every entity and criterion reference", () => {
      const existing = importOnce(createPack(), "remap-base");
      const changed = changePackText(createPack(), "Conflicto remapeado");
      const analyzed = analyzePack(changed);
      const idMap = createCompleteIdMap(changed, "new");
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "remap-complete", existing.revision),
        { resolution: { kind: "import-as-new", idMap } }
      );
      const applied = applyWithPreview(existing, preview);
      if (applied.status !== "applied") return false;
      const imported = applied.pack;
      return preview.canApply
        && imported?.id === idMap.packId
        && imported.subjects[0].id === idMap.subjectIds[changed.subjects[0].id]
        && imported.subjects[0].basicKnowledge[0].criterionIds.join(",")
          === changed.subjects[0].basicKnowledge[0].criterionIds
            .map((id) => idMap.criterionIds[id]).join(",");
    }),
    check("25. duplicated target IDs in import-as-new are rejected", () => {
      const existing = importOnce(createPack(), "duplicate-new-id-base");
      const changed = changePackText(createPack(), "Conflicto duplicado");
      const analyzed = analyzePack(changed);
      const idMap = createCompleteIdMap(changed, "dup");
      const firstCriterion = changed.subjects[0].criteria[0].id;
      const secondCriterion = changed.subjects[0].criteria[1].id;
      const duplicateMap = {
        ...idMap,
        criterionIds: {
          ...idMap.criterionIds,
          [secondCriterion]: idMap.criterionIds[firstCriterion],
        },
      };
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "duplicate-target", existing.revision),
        { resolution: { kind: "import-as-new", idMap: duplicateMap } }
      );
      return preview.blockingConflicts.some((item) => item.code === "duplicate-new-id");
    }),
    check("26. an unknown resolution is returned as a conflict", () => {
      const analyzed = analyzePack(createPack());
      const preview = previewCurriculumPackImport(
        analyzed,
        createEmptyCurriculumPackImportState(),
        importRequest(analyzed, "unknown-resolution", 0),
        { resolution: { kind: "replace-destructively" } }
      );
      return !preview.canApply
        && preview.blockingConflicts.some((item) => item.code === "unknown-resolution");
    }),
    check("27. a stale expectedRevision is rejected in preview and apply", () => {
      const analyzed = analyzePack(createPack());
      const state = createEmptyCurriculumPackImportState();
      const stalePreview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "stale", 1)
      );
      const validPreview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "fresh", 0)
      );
      const staleApply = applyCurriculumPackImport(state, validPreview, {
        operationId: validPreview.operationId,
        expectedRevision: 1,
        fingerprint: validPreview.operationFingerprint,
      });
      return stalePreview.blockingConflicts.some((item) => item.code === "stale-revision")
        && staleApply.status === "rejected";
    }),
    check("28. an operationId reused with different content is rejected", () => {
      const first = analyzePack(createPack());
      const empty = createEmptyCurriculumPackImportState();
      const request = importRequest(first, "operation-collision", 0);
      const applied = applyWithPreview(empty, previewCurriculumPackImport(first, empty, request));
      if (applied.status !== "applied") return false;
      const second = analyzePack(remapPackIds(createPack(), "other"));
      const collision = previewCurriculumPackImport(
        second,
        applied.state,
        { ...importRequest(second, "operation-collision", applied.state.revision) }
      );
      return collision.blockingConflicts.some((item) => item.code === "operation-id-collision");
    }),
    check("29. preview never mutates analyzed or existing inputs", () => {
      const analyzed = analyzePack(createPack());
      const state = createEmptyCurriculumPackImportState();
      const request = importRequest(analyzed, "preview-pure", 0);
      const snapshot = JSON.stringify({ analyzed, state, request });
      previewCurriculumPackImport(analyzed, state, request);
      return JSON.stringify({ analyzed, state, request }) === snapshot;
    }),
    check("30. apply creates immutable data without mutating its inputs", () => {
      const analyzed = analyzePack(createPack());
      const state = createEmptyCurriculumPackImportState();
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "apply-pure", 0)
      );
      const snapshot = JSON.stringify({ state, preview });
      const result = applyWithPreview(state, preview);
      return result.status === "applied"
        && JSON.stringify({ state, preview }) === snapshot
        && Object.isFrozen(result.state)
        && Object.isFrozen(result.state.packs[0])
        && result.state !== state;
    }),
    check("31. the shared validator accepts the complete imported result", () => {
      const state = importOnce(createPack(), "shared-validation");
      return validateCurriculumData(validationAggregate(state.packs), []).valid;
    }),
    check("32. full serialize parse import and reserialize round-trip is equivalent", () => {
      const original = createPack();
      const first = analyzePack(original, FIRST_EXPORTED_AT);
      const state = createEmptyCurriculumPackImportState();
      const applied = applyWithPreview(
        state,
        previewCurriculumPackImport(first, state, importRequest(first, "round-trip", 0))
      );
      if (applied.status !== "applied" || !applied.pack) return false;
      const second = requireParsed(serializeCurriculumPackToJson(applied.pack, SECOND_EXPORTED_AT));
      return first.contentChecksum === second.contentChecksum
        && serializeCurriculumPackContent(first.pack) === serializeCurriculumPackContent(second.pack)
        && first.pack.packageVersion === second.pack.packageVersion;
    }),
    check("33. exchange projection excludes personal economic and internal fields", () => {
      const enriched = createPack() as CurriculumPack & Record<string, unknown>;
      enriched.students = [{ id: "student-1", name: "Personal" }];
      enriched.grades = [10];
      enriched.evidence = [{ id: "evidence-1" }];
      enriched.movements = [{ crystals: 99 }];
      enriched.classProfiles = [{ id: "profile-1" }];
      enriched.actionLinks = [{ id: "link-1" }];
      enriched.appliedOperations = [{ operationId: "secret" }];
      enriched.backups = [{ id: "backup-1" }];
      enriched.transactions = [{ id: "transaction-1" }];
      const serialized = serializeCurriculumPackToJson(enriched, FIRST_EXPORTED_AT);
      return [
        "students", "grades", "evidence", "movements", "crystals", "classProfiles",
        "actionLinks", "appliedOperations", "backups", "transactions",
      ].every((field) => !serialized.includes(`\"${field}\"`));
    }),
    check("34. core services do not access browser or file APIs", () => verifyNoForbiddenGlobalAccess()),
    check("35. core service imports remain isolated from operational code", () => verifyServiceImports()),
    check("36. internal IDs colliding across different packs are classified", () => {
      const existing = importOnce(createPack(), "internal-id-base");
      const colliding = { ...createPack(), id: "different-pack-id" };
      const analyzed = analyzePack(colliding);
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "internal-id-conflict", existing.revision)
      );
      return preview.blockingConflicts.some((item) => item.code === "internal-id-conflict");
    }),
    check("37. duplicate external codes inside one pack are blocking", () => {
      const pack = createPack();
      const duplicated: CurriculumPack = {
        ...pack,
        subjects: pack.subjects.map((subject, subjectIndex) => subjectIndex === 0
          ? {
              ...subject,
              criteria: subject.criteria.map((criterion, criterionIndex) => criterionIndex === 1
                ? { ...criterion, externalCode: subject.criteria[0].externalCode }
                : { ...criterion }),
              basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
                ...knowledge,
                criterionIds: [...knowledge.criterionIds],
              })),
            }
          : cloneSubject(subject)),
      };
      const analyzed = analyzePack(duplicated);
      const state = createEmptyCurriculumPackImportState();
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "duplicate-code", 0)
      );
      return preview.blockingConflicts.some((item) => item.code === "duplicate-external-code");
    }),
    check("38. incoherent sourceVersion is classified defensively in preview", () => {
      const valid = analyzePack(createPack());
      const forged = JSON.parse(JSON.stringify(valid)) as CurriculumPackJsonValidResult;
      const mutablePack = forged.pack as unknown as {
        subjects: Array<{ criteria: Array<{ sourceVersion: string }> }>;
      };
      const mutableEnvelopePack = forged.envelope.pack as unknown as {
        subjects: Array<{ criteria: Array<{ sourceVersion: string }> }>;
      };
      mutablePack.subjects[0].criteria[0].sourceVersion = "manual-r999";
      mutableEnvelopePack.subjects[0].criteria[0].sourceVersion = "manual-r999";
      const checksum = calculateCurriculumPackContentChecksum(forged.pack);
      (forged as unknown as { contentChecksum: string }).contentChecksum = checksum;
      (forged as unknown as { canonicalContent: string }).canonicalContent =
        serializeCurriculumPackContent(forged.pack);
      (forged.envelope as unknown as { contentChecksum: string }).contentChecksum = checksum;
      const state = createEmptyCurriculumPackImportState();
      const preview = previewCurriculumPackImport(
        forged,
        state,
        importRequest(forged, "source-version-incoherent", 0)
      );
      return preview.blockingConflicts.some((item) => item.code === "source-version-incoherent");
    }),
    check("39. checksum semantics deny authenticity and canonical equality is separate", () => {
      const original = createPack();
      const changed = changePackText(original, "Contenido distinto");
      return CURRICULUM_PACK_CHECKSUM_SEMANTICS.cryptographic === false
        && CURRICULUM_PACK_CHECKSUM_SEMANTICS.provesAuthorship === false
        && CURRICULUM_PACK_CHECKSUM_SEMANTICS.isDigitalSignature === false
        && CURRICULUM_PACK_CHECKSUM_SEMANTICS.establishesTrust === false
        && CURRICULUM_PACK_CHECKSUM_SEMANTICS.requiresCanonicalEqualityForIdentity
        && !areCurriculumPacksCanonicallyEqual(original, changed);
    }),
    check("40. duplicate simple JSON keys are rejected before JSON.parse", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      const duplicated = json.replace(
        `\"schemaVersion\":1`,
        `\"schemaVersion\":1,\"schemaVersion\":999`
      );
      return parseCurriculumPackJson(duplicated).status === "duplicate-keys";
    }),
    check("41. escaped JSON keys decoding to the same text are duplicates", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      const duplicated = json.replace(
        `\"schemaVersion\":1`,
        `\"schemaVersion\":1,\"schema\\u0056ersion\":999`
      );
      return parseCurriculumPackJson(duplicated).status === "duplicate-keys";
    }),
    check("42. duplicate keys in nested pack objects are rejected", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      const duplicated = json.replace(
        `\"name\":\"Catálogo de prueba\"`,
        `\"name\":\"Catálogo de prueba\",\"\\u006eame\":\"Otro\"`
      );
      return parseCurriculumPackJson(duplicated).status === "duplicate-keys";
    }),
    check("43. an escaped dangerous key is rejected structurally", () => {
      const json = serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT);
      const dangerous = json.replace(
        "{",
        `{\"\\u005f\\u005fproto__\":{},`
      );
      return parseCurriculumPackJson(dangerous).status === "unsafe-structure";
    }),
    check("44. the pedagogical word constructor remains valid inside text", () => {
      const pack = changePackText(
        createPack(),
        "El alumnado identifica el constructor de una narración."
      );
      return analyzePack(pack).pack.subjects[0].criteria[0].text.includes("constructor");
    }),
    check("45. duplicate and prototype-polluting keys in resolution JSON are rejected", () => {
      const duplicate = parseCurriculumPackImportResolutionJson(
        `{\"kind\":\"import-as-new\",\"idMap\":{\"packId\":\"p\",\"subjectIds\":{\"s\":\"a\",\"\\u0073\":\"b\"},\"criterionIds\":{},\"basicKnowledgeIds\":{}}}`
      );
      const dangerous = parseCurriculumPackImportResolutionJson(
        `{\"kind\":\"import-as-new\",\"idMap\":{\"packId\":\"p\",\"subjectIds\":{\"\\u005f\\u005fproto__\":\"x\"},\"criterionIds\":{},\"basicKnowledgeIds\":{}}}`
      );
      const analyzed = analyzePack(createPack());
      const pollutedMap = JSON.parse(
        `{\"packId\":\"p\",\"subjectIds\":{\"__proto__\":\"polluted\"},\"criterionIds\":{},\"basicKnowledgeIds\":{}}`
      ) as CurriculumPackImportIdMap;
      const programmatic = previewCurriculumPackImport(
        analyzed,
        createEmptyCurriculumPackImportState(),
        importRequest(analyzed, "programmatic-pollution", 0),
        { resolution: { kind: "import-as-new", idMap: pollutedMap } }
      );
      return duplicate.status === "invalid"
        && duplicate.conflict.code === "duplicate-resolution-key"
        && dangerous.status === "invalid"
        && dangerous.conflict.code === "unsafe-resolution"
        && programmatic.blockingConflicts.some((item) => item.code === "unsafe-resolution")
        && !Object.hasOwn(Object.prototype, "polluted");
    }),
    check("46. programmatic NaN is rejected by the unknown-value validator", () => {
      const invalid = { ...createPack(), schemaVersion: Number.NaN };
      const validation = validateCurriculumPackForJson(invalid);
      return !validation.valid
        && validation.issues.some((item) => item.code === "invalid-number");
    }),
    check("47. an unmatched Unicode surrogate is rejected", () => {
      const envelope = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      envelope.pack.subjects[0].criteria[0].text = "\ud800";
      return parseCurriculumPackJson(JSON.stringify(envelope)).status === "unsafe-structure";
    }),
    check("48. extreme depth returns a limit result without recursive overflow", () => {
      const depth = 10_000;
      const hostile = `${"[".repeat(depth)}0${"]".repeat(depth)}`;
      return parseCurriculumPackJson(hostile).status === "limits-exceeded";
    }),
    check("49. unknown fields and malformed checksum format are rejected strictly", () => {
      const rootWithExtra = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      rootWithExtra.unknown = true;
      const packWithExtra = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      packWithExtra.pack.unknown = true;
      const subjectWithExtra = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      subjectWithExtra.pack.subjects[0].unknown = true;
      const criterionWithExtra = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      criterionWithExtra.pack.subjects[0].criteria[0].unknown = true;
      const knowledgeWithExtra = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      knowledgeWithExtra.pack.subjects[0].basicKnowledge[0].unknown = true;
      const malformedChecksum = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      malformedChecksum.contentChecksum = "signed-and-trusted";
      const missingExportedAt = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      delete missingExportedAt.exportedAt;
      const invalidExportedAt = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      invalidExportedAt.exportedAt = "not-an-instant";
      const excessiveExporterVersion = JSON.parse(
        serializeCurriculumPackToJson(createPack(), FIRST_EXPORTED_AT)
      );
      excessiveExporterVersion.exporterVersion = "v".repeat(
        DEFAULT_CURRICULUM_PACK_JSON_LIMITS.maxVersionLength + 1
      );
      return parseCurriculumPackJson(JSON.stringify(rootWithExtra)).status === "invalid-root"
        && parseCurriculumPackJson(JSON.stringify(packWithExtra)).status === "invalid-pack"
        && parseCurriculumPackJson(JSON.stringify(subjectWithExtra)).status === "invalid-pack"
        && parseCurriculumPackJson(JSON.stringify(criterionWithExtra)).status === "invalid-pack"
        && parseCurriculumPackJson(JSON.stringify(knowledgeWithExtra)).status === "invalid-pack"
        && parseCurriculumPackJson(JSON.stringify(malformedChecksum)).status === "invalid-root"
        && parseCurriculumPackJson(JSON.stringify(missingExportedAt)).status === "invalid-root"
        && parseCurriculumPackJson(JSON.stringify(invalidExportedAt)).status === "invalid-root"
        && parseCurriculumPackJson(JSON.stringify(excessiveExporterVersion)).status
          === "limits-exceeded";
    }),
    check("50. inherited properties accessors and throwing proxies are not trusted data", () => {
      const inherited = Object.create(createPack()) as unknown;
      const accessor = Object.defineProperty({}, "id", {
        enumerable: true,
        get: () => { throw new Error("getter must not execute"); },
      });
      const throwingProxy = new Proxy({}, {
        ownKeys: () => { throw new Error("proxy trap"); },
      });
      const circular = createPack() as CurriculumPack & { circular?: unknown };
      circular.circular = circular;
      return !validateCurriculumPackForJson(inherited).valid
        && !validateCurriculumPackForJson(accessor).valid
        && !validateCurriculumPackForJson(throwingProxy).valid
        && !validateCurriculumPackForJson(circular).valid;
    }),
    check("51. object property order never changes canonical checksum", () => {
      const pack = createPack();
      const reordered = {
        subjects: pack.subjects,
        updatedAt: pack.updatedAt,
        createdAt: pack.createdAt,
        provenance: pack.provenance,
        name: pack.name,
        packageVersion: pack.packageVersion,
        schemaVersion: pack.schemaVersion,
        id: pack.id,
        scope: pack.scope,
        region: pack.region,
      } as CurriculumPack;
      return calculateCurriculumPackContentChecksum(pack)
        === calculateCurriculumPackContentChecksum(reordered)
        && areCurriculumPacksCanonicallyEqual(pack, reordered);
    }),
    check("52. identity text code relation version and pedagogical order affect checksum", () => {
      const pack = createPack();
      const base = calculateCurriculumPackContentChecksum(pack);
      const firstSubject = pack.subjects[0];
      const variants: CurriculumPack[] = [
        { ...pack, id: "another-pack-id" },
        changePackText(pack, "Texto cambiado"),
        {
          ...pack,
          subjects: [{ ...firstSubject, externalCode: "OTRO" }, ...pack.subjects.slice(1)],
        },
        {
          ...pack,
          subjects: [{
            ...firstSubject,
            basicKnowledge: firstSubject.basicKnowledge.map((knowledge, index) => index === 0
              ? { ...knowledge, criterionIds: [...knowledge.criterionIds].reverse() }
              : { ...knowledge, criterionIds: [...knowledge.criterionIds] }),
          }, ...pack.subjects.slice(1)],
        },
        { ...pack, packageVersion: "manual-r4" },
        { ...pack, subjects: [...pack.subjects].reverse() },
        {
          ...pack,
          subjects: [{ ...firstSubject, criteria: [...firstSubject.criteria].reverse() }, ...pack.subjects.slice(1)],
        },
        {
          ...pack,
          subjects: [{
            ...firstSubject,
            basicKnowledge: [...firstSubject.basicKnowledge].reverse(),
          }, ...pack.subjects.slice(1)],
        },
      ];
      return variants.every((variant) => calculateCurriculumPackContentChecksum(variant) !== base);
    }),
    check("53. all informative timestamps are checksum-neutral and serialization is pure", () => {
      const pack = createPack();
      const snapshot = JSON.stringify(pack);
      const changedDates = {
        ...pack,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2031-01-01T00:00:00.000Z",
      };
      const first = analyzePack(pack, FIRST_EXPORTED_AT);
      const second = analyzePack(changedDates, SECOND_EXPORTED_AT);
      return first.contentChecksum === second.contentChecksum
        && first.canonicalContent === second.canonicalContent
        && JSON.stringify(pack) === snapshot;
    }),
    check("54. preview cannot apply to different base content at the same revision", () => {
      const firstState = importOnce(createPack(), "base-state-a");
      const secondState = importOnce(remapPackIds(createPack(), "base-b"), "base-state-b");
      const incoming = analyzePack(remapPackIds(createPack(), "incoming-c"));
      const preview = previewCurriculumPackImport(
        incoming,
        firstState,
        importRequest(incoming, "base-binding", firstState.revision)
      );
      const appliedElsewhere = applyWithPreview(secondState, preview);
      return firstState.revision === secondState.revision
        && appliedElsewhere.status === "rejected"
        && appliedElsewhere.reasons.some((item) => item.code === "stale-revision");
    }),
    check("55. changing the selected resolution after preview invalidates apply", () => {
      const existing = importOnce(createPack(), "resolution-base");
      const changed = changePackText(createPack(), "Resolución enlazada");
      const analyzed = analyzePack(changed);
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "resolution-binding", existing.revision),
        { resolution: { kind: "import-as-new", idMap: createCompleteIdMap(changed, "bound") } }
      );
      const altered = JSON.parse(JSON.stringify(preview)) as typeof preview;
      const mutableResolution = altered.resolution as unknown as {
        idMap: { packId: string };
      };
      mutableResolution.idMap.packId = "altered-after-preview";
      const result = applyCurriculumPackImport(existing, altered, {
        operationId: preview.operationId,
        expectedRevision: preview.expectedRevision,
        fingerprint: preview.operationFingerprint,
      });
      return result.status === "rejected"
        && result.reasons.some((item) => item.code === "operation-id-collision");
    }),
    check("56. import-as-new ID maps reject unknown extra entries", () => {
      const existing = importOnce(createPack(), "extra-map-base");
      const changed = changePackText(createPack(), "Mapa exacto");
      const analyzed = analyzePack(changed);
      const idMap = {
        ...createCompleteIdMap(changed, "exact"),
        unexpected: "not-allowed",
      } as unknown as CurriculumPackImportIdMap;
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "extra-map", existing.revision),
        { resolution: { kind: "import-as-new", idMap } }
      );
      return preview.blockingConflicts.some((item) => item.code === "unexpected-id-map-entry");
    }),
    check("57. import-as-new preserves sourceVersion provenance exactly", () => {
      const existing = importOnce(createPack(), "source-remap-base");
      const changed = changePackText(createPack(), "Fuente preservada");
      const analyzed = analyzePack(changed);
      const preview = previewCurriculumPackImport(
        analyzed,
        existing,
        importRequest(analyzed, "source-remap", existing.revision),
        {
          resolution: {
            kind: "import-as-new",
            idMap: createCompleteIdMap(changed, "source-copy"),
          },
        }
      );
      const result = applyWithPreview(existing, preview);
      if (result.status !== "applied" || !result.pack) return false;
      const beforeVersions = collectEntitySourceVersions(changed);
      const afterVersions = collectEntitySourceVersions(result.pack);
      return beforeVersions.join(",") === afterVersions.join(",")
        && result.pack.provenance.sourceVersion === changed.provenance.sourceVersion
        && validateCurriculumData(validationAggregate(result.state.packs), []).valid;
    }),
    check("58. an exact operation retry survives later successful imports", () => {
      const original = analyzePack(createPack());
      const empty = createEmptyCurriculumPackImportState();
      const originalRequest = importRequest(original, "durable-retry", 0);
      const first = applyWithPreview(
        empty,
        previewCurriculumPackImport(original, empty, originalRequest)
      );
      if (first.status !== "applied") return false;
      const laterPack = analyzePack(remapPackIds(createPack(), "later"));
      const later = applyWithPreview(
        first.state,
        previewCurriculumPackImport(
          laterPack,
          first.state,
          importRequest(laterPack, "later-import", first.state.revision)
        )
      );
      if (later.status !== "applied") return false;
      const restoredState = JSON.parse(JSON.stringify(later.state)) as CurriculumPackImportState;
      const retryPreview = previewCurriculumPackImport(original, restoredState, originalRequest);
      const retry = applyWithPreview(restoredState, retryPreview);
      return retry.status === "idempotent"
        && retry.state.revision === restoredState.revision
        && retry.state.packs.length === 2;
    }),
    check("59. the same operation and pack with another resolution collide", () => {
      const existing = importOnce(createPack(), "resolution-operation-base");
      const changed = changePackText(createPack(), "Dos resoluciones");
      const analyzed = analyzePack(changed);
      const request = importRequest(analyzed, "same-operation-resolution", existing.revision);
      const skipped = applyWithPreview(
        existing,
        previewCurriculumPackImport(analyzed, existing, request, {
          resolution: { kind: "skip-import" },
        })
      );
      if (skipped.status !== "skipped") return false;
      const collision = previewCurriculumPackImport(analyzed, skipped.state, request, {
        resolution: {
          kind: "import-as-new",
          idMap: createCompleteIdMap(changed, "resolution-other"),
        },
      });
      return collision.blockingConflicts.some((item) => item.code === "operation-id-collision");
    }),
    check("60. identical content under a new operation remains a no-op revision", () => {
      const state = importOnce(createPack(), "content-first-operation");
      const analyzed = analyzePack(createPack());
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "content-second-operation", state.revision)
      );
      const result = applyWithPreview(state, preview);
      return result.status === "idempotent"
        && result.state.revision === state.revision
        && result.state.packs.length === 1
        && result.state.appliedOperations.length === state.appliedOperations.length + 1
        && result.state.appliedOperations.at(-1)?.resolutionKind === "none";
    }),
    check("61. complex round-trip preserves optional fields Unicode order and entity versions", () => {
      const first = analyzePack(createPack(), FIRST_EXPORTED_AT);
      const state = createEmptyCurriculumPackImportState();
      const applied = applyWithPreview(
        state,
        previewCurriculumPackImport(first, state, importRequest(first, "complex-round-trip", 0))
      );
      if (applied.status !== "applied" || !applied.pack) return false;
      const second = analyzePack(applied.pack, SECOND_EXPORTED_AT);
      const versions = new Set(collectEntitySourceVersions(second.pack));
      return first.canonicalContent === second.canonicalContent
        && first.contentChecksum === second.contentChecksum
        && second.pack.subjects.length > 1
        && second.pack.subjects[0].criteria.some((criterion) => criterion.externalCode === undefined)
        && second.pack.subjects[0].basicKnowledge[0].criterionIds.length > 1
        && second.pack.subjects.map((subject) => subject.id).join(",")
          === "subject-language,subject-math"
        && second.pack.name.includes("á")
        && versions.size > 1;
    }),
    check("62. durable journal entries never embed complete catalog representations", () => {
      const pack = createSizedPack(100 * 1024);
      const state = importIdenticalOperations(pack, 2);
      const serializedEntry = JSON.stringify(state.appliedOperations[0]);
      const entrySize = measureCurriculumSerializedJson(state.appliedOperations[0]);
      const packSize = measureCurriculumSerializedJson(pack);
      return entrySize.codeUnits < packSize.codeUnits / 4
        && !serializedEntry.includes("sourceCanonicalContent")
        && !serializedEntry.includes("baseStateCanonical")
        && !serializedEntry.includes("proposedCanonicalContent")
        && !serializedEntry.includes("idMap");
    }),
    check("63. twenty no-op operations do not duplicate the pack twenty times", () => {
      const pack = createSizedPack(100 * 1024);
      const state = importIdenticalOperations(pack, 20);
      const packSize = measureCurriculumSerializedJson(pack);
      const journalSize = measureCurriculumSerializedJson(state.appliedOperations);
      return state.packs.length === 1
        && state.appliedOperations.length === 20
        && journalSize.codeUnits < packSize.codeUnits / 4;
    }),
    check("64. a near-parser-limit pack is blocked by the default persistence budget", () => {
      const analyzed = analyzePack(createSizedPack(1_900_000));
      const state = createEmptyCurriculumPackImportState();
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "near-limit-budget", 0)
      );
      return !preview.canApply
        && !preview.storageEstimate.persistable
        && preview.blockingConflicts.some((item) => item.code === "storage-budget-exceeded")
        && preview.warnings.some((item) => item.code === "storage-budget-exceeded");
    }),
    check("65. preview reports state journal envelope and protocol size estimates", () => {
      const analyzed = analyzePack(createSizedPack(100 * 1024));
      const state = createEmptyCurriculumPackImportState();
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "storage-estimate", 0)
      );
      const estimate = preview.storageEstimate;
      return estimate.currentState.codeUnits > 0
        && estimate.proposedState.codeUnits > estimate.currentState.codeUnits
        && estimate.nextJournalEntry !== null
        && estimate.proposedJournal.codeUnits > estimate.currentJournal.codeUnits
        && estimate.protocol.targetEnvelope.codeUnits > estimate.proposedState.codeUnits
        && estimate.protocol.worstCase.codeUnits >= estimate.protocol.afterPromotion.codeUnits;
    }),
    check("66. apply blocks an over-budget preview before any persistence boundary", () => {
      const analyzed = analyzePack(createSizedPack(1_900_000));
      const state = createEmptyCurriculumPackImportState();
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "apply-storage-block", 0)
      );
      const result = applyWithPreview(state, preview);
      return result.status === "rejected"
        && result.state === state
        && result.reasons.some((item) => item.code === "storage-budget-exceeded");
    }),
    check("67. compact history proves an exact retry while its result pack is intact", () => {
      const analyzed = analyzePack(createPack());
      const request = importRequest(analyzed, "compact-retry", 0);
      const empty = createEmptyCurriculumPackImportState();
      const first = applyWithPreview(
        empty,
        previewCurriculumPackImport(analyzed, empty, request)
      );
      if (first.status !== "applied") return false;
      const restored = JSON.parse(JSON.stringify(first.state)) as CurriculumPackImportState;
      const retryPreview = previewCurriculumPackImport(analyzed, restored, request);
      const retry = applyWithPreview(restored, retryPreview);
      return retryPreview.status === "idempotent"
        && retry.status === "idempotent"
        && retry.state.appliedOperations.length === 1;
    }),
    check("68. retry after its result pack was edited is history-divergent", () => {
      const originalPack = createPack();
      const analyzed = analyzePack(originalPack);
      const request = importRequest(analyzed, "edited-history", 0);
      const imported = importIdenticalOperations(originalPack, 1, "edited-history");
      const editedState: CurriculumPackImportState = {
        ...imported,
        packs: [changePackText(imported.packs[0], "Editado después de importar")],
        appliedOperations: imported.appliedOperations.map((operation) => ({ ...operation })),
      };
      const preview = previewCurriculumPackImport(analyzed, editedState, request);
      const applied = applyWithPreview(editedState, preview);
      return !preview.canApply
        && preview.blockingConflicts.some(
          (item) => item.code === "operation-history-divergent"
        )
        && applied.status === "rejected"
        && applied.reasons.some((item) => item.code === "operation-history-divergent");
    }),
    check("69. storage protocol counts current transaction target backup and review", () => {
      const current = importIdenticalOperations(createPack(), 1);
      const target = importIdenticalOperations(createPack(), 2);
      const estimate = estimateCurriculumStorageProtocolPeak({
        currentState: current,
        targetState: target,
      });
      return estimate.afterPromotion.codeUnits
          === estimate.targetEnvelope.codeUnits
            + estimate.transaction.codeUnits
            + estimate.newBackup.codeUnits
            + estimate.review.codeUnits
        && CURRICULUM_STORAGE_PROTOCOL_SIZE_SEMANTICS.maximumConcurrentFullEnvelopesPerTransition === 3
        && !CURRICULUM_STORAGE_PROTOCOL_SIZE_SEMANTICS.automaticallyDeletesHistoricalBackups;
    }),
    check("70. persistence budgets are configurable without claiming browser quota", () => {
      const analyzed = analyzePack(createSizedPack(100 * 1024));
      const state = createEmptyCurriculumPackImportState();
      const tiny = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "tiny-budget", 0),
        { storageBudget: { maxPersistedStateCodeUnits: 1 } }
      );
      const generous = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "generous-budget", 0),
        { storageBudget: generousStorageBudget() }
      );
      return !tiny.canApply
        && tiny.storageEstimate.budget.maxPersistedStateCodeUnits === 1
        && generous.canApply
        && !CURRICULUM_STORAGE_PROTOCOL_SIZE_SEMANTICS.assumesUniversalLocalStorageQuota;
    }),
    check("71. reaching the journal count budget blocks without deleting history", () => {
      const pack = createPack();
      const state = importIdenticalOperations(pack, 2);
      const analyzed = analyzePack(pack);
      const snapshot = JSON.stringify(state);
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(analyzed, "journal-third", state.revision),
        {
          storageBudget: {
            ...generousStorageBudget(),
            maxJournalEntries: 2,
          },
        }
      );
      return !preview.canApply
        && preview.storageEstimate.exceededLimits.includes("journal-count")
        && state.appliedOperations.length === 2
        && JSON.stringify(state) === snapshot;
    }),
    check("72. size measurement distinguishes UTF-16 code units from UTF-8 bytes", () => {
      const measured = measureCurriculumSerializedJson("á📚");
      return measured.codeUnits === 5 && measured.utf8Bytes === 8;
    }),
    check("73. import-as-new retry is reconstructed from compact ID intent", () => {
      const existing = importOnce(createPack(), "compact-remap-base");
      const changed = changePackText(createPack(), "Remapeo compacto");
      const analyzed = analyzePack(changed);
      const request = importRequest(analyzed, "compact-remap", existing.revision);
      const options = {
        resolution: {
          kind: "import-as-new" as const,
          idMap: createCompleteIdMap(changed, "compact-result"),
        },
      };
      const first = applyWithPreview(
        existing,
        previewCurriculumPackImport(analyzed, existing, request, options)
      );
      if (first.status !== "applied") return false;
      const retryPreview = previewCurriculumPackImport(analyzed, first.state, request, options);
      const retry = applyWithPreview(first.state, retryPreview);
      const entry = first.state.appliedOperations.at(-1);
      return retry.status === "idempotent"
        && entry?.resolutionKind === "import-as-new"
        && entry.resolutionIdCount > 0
        && !JSON.stringify(entry).includes("idMap");
    }),
  ];
}

export function measureCurriculumPackImportStorageAudit(): readonly CurriculumPackImportStorageAuditMeasurement[] {
  return [100 * 1024, 500 * 1024, 1024 * 1024, 1_900_000].map((targetCodeUnits) => {
    const pack = createSizedPack(targetCodeUnits);
    const serialized = serializeCurriculumPackToJson(pack, FIRST_EXPORTED_AT);
    const analyzed = requireParsed(serialized);
    const empty = createEmptyCurriculumPackImportState();
    const defaultPreview = previewCurriculumPackImport(
      analyzed,
      empty,
      importRequest(analyzed, `default-budget-${targetCodeUnits}`, 0)
    );
    let state = empty;
    const afterOperations: Partial<Record<
      1 | 5 | 20,
      CurriculumPackImportStorageAuditMeasurement["afterOperations"][1]
    >> = {};
    for (let operation = 1; operation <= 20; operation += 1) {
      const preview = previewCurriculumPackImport(
        analyzed,
        state,
        importRequest(
          analyzed,
          `measurement-${targetCodeUnits}-${operation}`,
          state.revision
        ),
        { storageBudget: generousStorageBudget() }
      );
      const applied = applyWithPreview(state, preview);
      if (applied.status !== "applied" && applied.status !== "idempotent") {
        throw new Error(`Storage measurement import failed: ${applied.status}.`);
      }
      state = applied.state;
      if (operation === 1 || operation === 5 || operation === 20) {
        afterOperations[operation] = {
          state: measureCurriculumSerializedJson(state),
          appliedOperations: measureCurriculumSerializedJson(state.appliedOperations),
          storageEnvelope: preview.storageEstimate.protocol.targetEnvelope,
          protocolPeak: preview.storageEstimate.protocol.worstCase,
        };
      }
    }
    return {
      targetCodeUnits,
      pack: measureCurriculumSerializedJson(pack),
      nativeEnvelope: measureCurriculumJsonText(serialized),
      defaultBudgetBlocksInitialImport: !defaultPreview.canApply
        && defaultPreview.blockingConflicts.some(
          (item) => item.code === "storage-budget-exceeded"
        ),
      afterOperations: afterOperations as CurriculumPackImportStorageAuditMeasurement["afterOperations"],
    };
  });
}

const SIZED_PACKS = new Map<number, CurriculumPack>();

function createSizedPack(targetCodeUnits: number): CurriculumPack {
  const cached = SIZED_PACKS.get(targetCodeUnits);
  if (cached) return cached;
  const criterionCount = Math.max(1, Math.ceil(targetCodeUnits / 11_000));
  const build = (textLength: number): CurriculumPack => ({
    id: `budget-pack-${targetCodeUnits}`,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    packageVersion: "manual-r1",
    name: `Budget fixture ${targetCodeUnits}`,
    provenance: { kind: "manual", label: "Storage budget audit" },
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    subjects: [{
      id: `budget-subject-${targetCodeUnits}`,
      name: `Budget subject ${targetCodeUnits}`,
      criteria: Array.from({ length: criterionCount }, (_, index) => {
        const prefix = `Criterion ${index} `;
        return {
          id: `budget-criterion-${targetCodeUnits}-${index}`,
          sourceVersion: "manual-r1",
          text: `${prefix}${"x".repeat(Math.max(0, textLength - prefix.length))}`,
        };
      }),
      basicKnowledge: Array.from({ length: criterionCount }, (_, index) => ({
        id: `budget-knowledge-${targetCodeUnits}-${index}`,
        sourceVersion: "manual-r1",
        text: `Knowledge ${index}`,
        criterionIds: [`budget-criterion-${targetCodeUnits}-${index}`],
      })),
    }],
  });
  let lower = 1;
  let upper = 11_950;
  let best = build(lower);
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = build(middle);
    const candidateSize = measureCurriculumSerializedJson(candidate).codeUnits;
    if (
      Math.abs(candidateSize - targetCodeUnits)
      < Math.abs(measureCurriculumSerializedJson(best).codeUnits - targetCodeUnits)
    ) {
      best = candidate;
    }
    if (candidateSize < targetCodeUnits) lower = middle + 1;
    else upper = middle - 1;
  }
  SIZED_PACKS.set(targetCodeUnits, best);
  return best;
}

function importIdenticalOperations(
  pack: CurriculumPack,
  count: number,
  firstOperationId = "compact-operation"
): CurriculumPackImportState {
  const analyzed = analyzePack(pack);
  let state = createEmptyCurriculumPackImportState();
  for (let index = 0; index < count; index += 1) {
    const operationId = index === 0 ? firstOperationId : `${firstOperationId}-${index + 1}`;
    const preview = previewCurriculumPackImport(
      analyzed,
      state,
      importRequest(analyzed, operationId, state.revision)
    );
    const result = applyWithPreview(state, preview);
    if (result.status !== "applied" && result.status !== "idempotent") {
      throw new Error(`Compact operation failed: ${result.status}.`);
    }
    state = result.state;
  }
  return state;
}

function generousStorageBudget(): typeof DEFAULT_CURRICULUM_STORAGE_BUDGET {
  return {
    maxPersistedStateCodeUnits: 50_000_000,
    maxJournalEntryCodeUnits: 1_000_000,
    maxJournalCodeUnits: 20_000_000,
    maxJournalEntries: 1_000,
    maxProtocolPeakCodeUnits: 200_000_000,
  };
}

function createPack(): CurriculumPack {
  return {
    id: "manual-pack-1",
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    packageVersion: "manual-r3",
    name: "Catálogo de prueba",
    region: "España",
    scope: "Primaria",
    provenance: { kind: "manual", label: "Docente" },
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-21T09:00:00.000Z",
    subjects: [
      {
        id: "subject-language",
        externalCode: "LEN",
        name: "Lengua",
        criteria: [
          {
            id: "criterion-b",
            externalCode: "LEN-2",
            sourceVersion: "manual-r2",
            title: "Segundo criterio",
            text: "Comprende mensajes orales.",
          },
          {
            id: "criterion-a",
            sourceVersion: "manual-r1",
            text: "Produce textos escritos.",
          },
        ],
        basicKnowledge: [
          {
            id: "knowledge-b",
            externalCode: "LEN-S2",
            sourceVersion: "manual-r3",
            text: "Comunicación oral y escrita.",
            criterionIds: ["criterion-b", "criterion-a"],
          },
          {
            id: "knowledge-a",
            externalCode: "LEN-S1",
            sourceVersion: "manual-r2",
            text: "Producción textual.",
            criterionIds: ["criterion-a"],
          },
        ],
      },
      {
        id: "subject-math",
        externalCode: "MAT",
        name: "Matemáticas",
        criteria: [{
          id: "criterion-math",
          externalCode: "MAT-1",
          sourceVersion: "manual-r3",
          text: "Resuelve problemas sencillos.",
        }],
        basicKnowledge: [{
          id: "knowledge-math",
          externalCode: "MAT-S1",
          sourceVersion: "manual-r1",
          text: "Sentido numérico.",
          criterionIds: ["criterion-math"],
        }],
      },
    ],
  };
}

function createExternalPack(
  packId: string,
  subjectId: string,
  criterionId: string,
  knowledgeId: string,
  criterionText: string
): CurriculumPack {
  return {
    id: packId,
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    packageVersion: "2026.1",
    name: "Catálogo externo",
    provenance: {
      kind: "external",
      sourceId: "official-source",
      sourceVersion: "2026",
    },
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:00:00.000Z",
    subjects: [{
      id: subjectId,
      name: "Asignatura",
      criteria: [{ id: criterionId, sourceVersion: "2026", text: criterionText }],
      basicKnowledge: [{
        id: knowledgeId,
        sourceVersion: "2026",
        text: `Saber ${criterionText}`,
        criterionIds: [criterionId],
      }],
    }],
  };
}

function analyzePack(
  pack: CurriculumPack,
  exportedAt = FIRST_EXPORTED_AT
): CurriculumPackJsonValidResult {
  return requireParsed(serializeCurriculumPackToJson(pack, exportedAt));
}

function requireParsed(serialized: string): CurriculumPackJsonValidResult {
  const parsed = parseCurriculumPackJson(serialized);
  if (parsed.status !== "valid") throw new Error(`Expected valid JSON, received ${parsed.status}.`);
  return parsed;
}

function importRequest(
  analyzed: CurriculumPackJsonValidResult,
  operationId: string,
  expectedRevision: number
): CurriculumPackImportRequest {
  return {
    operationId,
    expectedRevision,
    expectedPackageVersion: analyzed.pack.packageVersion,
  };
}

function importOnce(pack: CurriculumPack, operationId: string): CurriculumPackImportState {
  const analyzed = analyzePack(pack);
  const empty = createEmptyCurriculumPackImportState();
  const preview = previewCurriculumPackImport(
    analyzed,
    empty,
    importRequest(analyzed, operationId, 0)
  );
  const result = applyWithPreview(empty, preview);
  if (result.status !== "applied") throw new Error(`Initial import failed: ${result.status}.`);
  return result.state;
}

function applyWithPreview(
  state: CurriculumPackImportState,
  preview: ReturnType<typeof previewCurriculumPackImport>
): ReturnType<typeof applyCurriculumPackImport> {
  return applyCurriculumPackImport(state, preview, {
    operationId: preview.operationId,
    expectedRevision: preview.expectedRevision,
    fingerprint: preview.operationFingerprint,
  });
}

function changePackText(pack: CurriculumPack, text: string): CurriculumPack {
  return {
    ...pack,
    subjects: pack.subjects.map((subject, subjectIndex) => subjectIndex === 0
      ? {
          ...subject,
          criteria: subject.criteria.map((criterion, criterionIndex) => criterionIndex === 0
            ? { ...criterion, text }
            : { ...criterion }),
          basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
            ...knowledge,
            criterionIds: [...knowledge.criterionIds],
          })),
        }
      : cloneSubject(subject)),
  };
}

function remapPackIds(pack: CurriculumPack, prefix: string): CurriculumPack {
  const idMap = createCompleteIdMap(pack, prefix);
  return {
    ...pack,
    id: idMap.packId,
    subjects: pack.subjects.map((subject) => ({
      ...subject,
      id: idMap.subjectIds[subject.id],
      criteria: subject.criteria.map((criterion) => ({
        ...criterion,
        id: idMap.criterionIds[criterion.id],
      })),
      basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
        ...knowledge,
        id: idMap.basicKnowledgeIds[knowledge.id],
        criterionIds: knowledge.criterionIds.map((id) => idMap.criterionIds[id]),
      })),
    })),
  };
}

function createCompleteIdMap(pack: CurriculumPack, prefix: string): CurriculumPackImportIdMap {
  return {
    packId: `${prefix}:${pack.id}`,
    subjectIds: Object.fromEntries(pack.subjects.map((subject) => [
      subject.id,
      `${prefix}:${subject.id}`,
    ])),
    criterionIds: Object.fromEntries(pack.subjects.flatMap((subject) =>
      subject.criteria.map((criterion) => [criterion.id, `${prefix}:${criterion.id}`])
    )),
    basicKnowledgeIds: Object.fromEntries(pack.subjects.flatMap((subject) =>
      subject.basicKnowledge.map((knowledge) => [knowledge.id, `${prefix}:${knowledge.id}`])
    )),
  };
}

function collectEntitySourceVersions(pack: CurriculumPack): string[] {
  return pack.subjects.flatMap((subject) => [
    ...subject.criteria.map((criterion) => criterion.sourceVersion ?? "<absent>"),
    ...subject.basicKnowledge.map((knowledge) => knowledge.sourceVersion ?? "<absent>"),
  ]);
}

function cloneSubject(subject: CurriculumPack["subjects"][number]): CurriculumPack["subjects"][number] {
  return {
    ...subject,
    criteria: subject.criteria.map((criterion) => ({ ...criterion })),
    basicKnowledge: subject.basicKnowledge.map((knowledge) => ({
      ...knowledge,
      criterionIds: [...knowledge.criterionIds],
    })),
  };
}

function validationAggregate(packs: readonly CurriculumPack[]): VersionedCurriculumData {
  return {
    schemaVersion: CURRICULUM_SCHEMA_VERSION,
    module: {
      schemaVersion: CURRICULUM_SCHEMA_VERSION,
      classroomId: "import-check",
      status: "inactive",
      activeProfileId: null,
    },
    packs,
    profiles: [],
    actionLinks: [],
  };
}

function verifyNoForbiddenGlobalAccess(): boolean {
  const globalObject = globalThis as typeof globalThis & Record<string, unknown>;
  const names = ["window", "localStorage", "navigator"] as const;
  const descriptors = new Map(names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalObject, name),
  ]));
  let accesses = 0;
  try {
    names.forEach((name) => {
      const descriptor = descriptors.get(name);
      if (descriptor && !descriptor.configurable) return;
      Object.defineProperty(globalObject, name, {
        configurable: true,
        get: () => { accesses += 1; return undefined; },
      });
    });
    const analyzed = analyzePack(createPack());
    const state = createEmptyCurriculumPackImportState();
    const preview = previewCurriculumPackImport(
      analyzed,
      state,
      importRequest(analyzed, "global-check", 0)
    );
    applyWithPreview(state, preview);
    return accesses === 0;
  } finally {
    names.forEach((name) => restoreGlobalProperty(
      globalObject,
      name,
      descriptors.get(name)
    ));
  }
}

function verifyServiceImports(): boolean {
  const files = [
    "app/services/curriculumPackJsonService.ts",
    "app/services/curriculumPackImportService.ts",
    "app/services/curriculumStorageBudgetService.ts",
  ];
  const allowedImports = new Set([
    "../types/curriculum",
    "./curriculumFingerprintService",
    "./curriculumValidationService",
    "./curriculumPackJsonService",
    "./curriculumStorageBudgetService",
  ]);
  return files.every((file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const imports = [...source.matchAll(/from\s+[\"']([^\"']+)[\"']/g)].map((match) => match[1]);
    const forbiddenRuntimeReferences = /\b(?:window|localStorage|navigator|FileReader)\s*[.([]/;
    return imports.every((item) => allowedImports.has(item))
      && !forbiddenRuntimeReferences.test(source);
  });
}

function restoreGlobalProperty(
  target: object,
  name: PropertyKey,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else Reflect.deleteProperty(target, name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function check(
  name: string,
  predicate: () => boolean
): CurriculumPackImportDeterministicCheck {
  try {
    return { name, passed: predicate() };
  } catch {
    return { name, passed: false };
  }
}
