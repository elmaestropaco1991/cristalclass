/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const workspace = path.resolve(__dirname, "..");

// Deliberately explicit: adding a similarly named file must never execute code implicitly,
// and deleting/renaming a required legacy suite must fail this runner.
const deterministicSuites = [
  ["app/services/andalusianPrimaryCurriculumDefaultsDeterministicChecks.ts", "runAndalusianPrimaryCurriculumDefaultsDeterministicChecks"],
  ["app/services/andalusianPrimaryCurriculumDeterministicChecks.ts", "runAndalusianPrimaryCurriculumDeterministicChecks"],
  ["app/services/andalusianLanguageCurriculumDeterministicChecks.ts", "runAndalusianLanguageCurriculumDeterministicChecks"],
  ["app/services/actionCatalogDeterministicChecks.ts", "runActionCatalogDeterministicChecks"],
  ["app/services/actionConfigurationDeterministicChecks.ts", "runActionConfigurationDeterministicChecks"],
  ["app/services/actionContextConfigurationDeterministicChecks.ts", "runActionContextConfigurationDeterministicChecks"],
  ["app/services/actionSoundDeterministicChecks.ts", "runActionSoundDeterministicChecks"],
  ["app/services/additionalActionsPanelDeterministicChecks.ts", "runAdditionalActionsPanelDeterministicChecks"],
  ["app/services/attendanceDeterministicChecks.ts", "runAttendanceDeterministicChecks"],
  ["app/services/chestOpeningLifecycleDeterministicChecks.ts", "runChestOpeningLifecycleDeterministicChecks"],
  ["app/services/curriculumCatalogEditorDeterministicChecks.ts", "runCurriculumCatalogEditorDeterministicChecks"],
  ["app/services/curriculumAssistantDeterministicChecks.ts", "runCurriculumAssistantDeterministicChecks"],
  ["app/services/curriculumEvaluationDeterministicChecks.ts", "runCurriculumEvaluationDeterministicChecks"],
  ["app/services/curriculumEvaluationRuntimeDeterministicChecks.ts", "runCurriculumEvaluationRuntimeDeterministicChecks"],
  ["app/services/languageCurriculumDefaultsDeterministicChecks.ts", "runLanguageCurriculumDefaultsDeterministicChecks"],
  ["app/services/curriculumMigrationDeterministicChecks.ts", "runCurriculumMigrationDeterministicChecks"],
  ["app/services/curriculumPackImportDeterministicChecks.ts", "runCurriculumPackImportDeterministicChecks"],
  ["app/services/curriculumStorageDeterministicChecks.ts", "runCurriculumStorageDeterministicChecks"],
  ["app/services/randomStudentSelectorDeterministicChecks.ts", "runRandomStudentSelectorDeterministicChecks"],
  ["app/services/studentChestDeterministicChecks.ts", "runStudentChestDeterministicChecks"],
  ["app/services/studentCollectionDeterministicChecks.ts", "runStudentCollectionDeterministicChecks"],
  ["app/services/studentEquipmentDeterministicChecks.ts", "runStudentEquipmentDeterministicChecks"],
  ["app/services/subjectActionCatalogDeterministicChecks.ts", "runSubjectActionCatalogDeterministicChecks"],
  ["domain/coins/CoinCoreDeterministicChecks.ts", "runCoinCoreDeterministicChecks"],
  ["infrastructure/coins/CoinPersistenceDeterministicChecks.ts", "runCoinPersistenceDeterministicChecks"],
];

function registerTypeScriptExtension(extension) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
    });
    module._compile(output.outputText, filename);
  };
}

registerTypeScriptExtension(".ts");
registerTypeScriptExtension(".tsx");

function sourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function repositoryIsolationChecks() {
  const pageSource = fs.readFileSync(path.join(workspace, "app", "page.tsx"), "utf8");
  const assistantSource = fs.readFileSync(
    path.join(workspace, "app", "components", "CurriculumAssistant.tsx"),
    "utf8"
  );
  const assistantHookSource = fs.readFileSync(
    path.join(workspace, "app", "hooks", "useCurriculumAssistant.ts"),
    "utf8"
  );
  const teacherSettingsSource = fs.readFileSync(
    path.join(workspace, "app", "components", "TeacherSettingsPanel.tsx"),
    "utf8"
  );
  const appFiles = [
    path.join(workspace, "app", "page.tsx"),
    ...sourceFiles(path.join(workspace, "app", "components")),
    ...sourceFiles(path.join(workspace, "app", "hooks")),
  ];
  const operationalFiles = [
    ...sourceFiles(path.join(workspace, "app")),
    ...sourceFiles(path.join(workspace, "application")),
    ...sourceFiles(path.join(workspace, "domain"))
      .filter((file) => !file.includes(`${path.sep}domain${path.sep}coins${path.sep}`)),
  ];
  const forbiddenImport = /(?:domain|infrastructure)[\\/]coins|CoinCore|CoinPersistence/;
  const newRuntimeFiles = [
    ...sourceFiles(path.join(workspace, "domain", "coins")),
    ...sourceFiles(path.join(workspace, "infrastructure", "coins")),
  ].filter((file) => !file.endsWith("DeterministicChecks.ts"));
  const nondeterminism = /Date\.now|Math\.random|randomUUID|crypto\s*\./;
  return [
    {
      name: "repository isolation: page, components and hooks do not import the coin core",
      passed: appFiles.every((file) => !forbiddenImport.test(fs.readFileSync(file, "utf8"))),
    },
    {
      name: "repository isolation: current operational systems do not import the coin core",
      passed: operationalFiles.every((file) => !forbiddenImport.test(fs.readFileSync(file, "utf8"))),
    },
    {
      name: "repository isolation: coin runtime contains no generated dates or random identities",
      passed: newRuntimeFiles.every((file) => !nondeterminism.test(fs.readFileSync(file, "utf8"))),
    },
    {
      name: "curriculum overlays use deterministic disjoint classroom keys",
      passed: pageSource.includes('key={`teacher-settings:${classroomId}`}')
        && pageSource.includes('key={`curriculum-assistant:${classroomId}`}'),
    },
    {
      name: "curriculum dialogs are unmounted while closed",
      passed: pageSource.includes("{configuracionAbierta && <TeacherSettingsPanel")
        && pageSource.includes("{asistenteCurricularAbierto && <CurriculumAssistant"),
    },
    {
      name: "curriculum overlays lock and declaratively restore classroom scrolling",
      passed: pageSource.includes('curriculumOverlayOpen ? "overflow-hidden" : "overflow-y-auto"'),
    },
    {
      name: "curriculum file selection can repeat the exact same file",
      passed: assistantSource.includes('event.currentTarget.value = ""'),
    },
    {
      name: "the bundled Andalusian Primary catalog uses the strict preview and import path",
      passed: assistantSource.includes("getAndalusianPrimaryCurriculumPack")
        && assistantSource.includes("serializeCurriculumPackToJson(pack, occurredAt")
        && assistantSource.includes("previewCurriculumAssistantImport(classroomId, parsed)"),
    },
    {
      name: "curriculum action storage is not read during render",
      passed: pageSource.includes("useState<ReturnType<typeof getActionCatalog>>([])")
        && pageSource.includes("refreshActionCatalog();")
        && !pageSource.includes("useState(readCurriculumActionCatalog)"),
    },
    {
      name: "curriculum storage listeners reuse the safely acquired adapter",
      passed: !assistantHookSource.includes("window.localStorage")
        && assistantHookSource.includes("event.storageArea === storage"),
    },
    {
      name: "curriculum storage listeners react to a cross-tab clear",
      passed: assistantHookSource.includes("event.key === null || event.key === storageKey")
        && pageSource.includes('event.key === null || event.key === "cristalclass_actions"'),
    },
    {
      name: "curriculum dialogs only apply initial focus when opening",
      passed: /titleRef\.current\?\.focus\(\);\s*\}, \[open\]\);/.test(assistantSource)
        && /titleRef\.current\?\.focus\(\);\s*\}, \[open\]\);/.test(teacherSettingsSource),
    },
    {
      name: "failed known writes retain a draft without exposing it as an operational tab",
      passed: assistantHookSource.includes("setPendingState(nextState)")
        && assistantHookSource.includes("retryPendingState")
        && assistantHookSource.includes("installReadResult(classroomId, latest, true)")
        && pageSource.includes("state={curriculum.draftState}")
        && pageSource.includes("getActiveCurriculumSubjects(curriculum.state, curriculumActionCatalog)"),
    },
    {
      name: "unexpected curriculum persistence failures retain the in-memory candidate",
      passed: /catch \{\s*if \(mountedRef\.current && currentClassroomIdRef\.current === classroomId\) \{\s*pendingStateRef\.current = nextState;\s*setPendingState\(nextState\);/.test(
        assistantHookSource
      ),
    },
  ];
}

async function main() {
  const groups = [];
  const groupNames = new Set();
  const checkNames = new Set();
  for (const [relativeFile, exportName] of deterministicSuites) {
    if (groupNames.has(exportName)) throw new Error(`Duplicate deterministic suite: ${exportName}.`);
    groupNames.add(exportName);
    const file = path.join(workspace, ...relativeFile.split("/"));
    if (!fs.existsSync(file)) throw new Error(`Required deterministic suite is missing: ${relativeFile}.`);
    const loaded = require(file);
    const exported = loaded[exportName];
    if (typeof exported !== "function") {
      throw new Error(`${relativeFile} does not export ${exportName}.`);
    }
    const checks = await exported();
    validateCheckArray(exportName, checks, checkNames);
    groups.push({ name: exportName, checks });
  }
  const isolation = repositoryIsolationChecks();
  validateCheckArray("runRepositoryIsolationChecks", isolation, checkNames);
  groups.push({ name: "runRepositoryIsolationChecks", checks: isolation });

  let total = 0;
  let passed = 0;
  for (const group of groups) {
    const groupPassed = group.checks.filter((check) => check && check.passed === true).length;
    total += group.checks.length;
    passed += groupPassed;
    process.stdout.write(`${group.name}: ${groupPassed}/${group.checks.length}\n`);
    for (const failed of group.checks.filter((check) => !check || check.passed !== true)) {
      process.stderr.write(`FAIL ${group.name}: ${failed?.name ?? "unnamed check"}\n`);
    }
  }

  const { measureCoinStorageScenarios } = require(path.join(
    workspace,
    "infrastructure",
    "coins",
    "CoinStorageScenarios.ts"
  ));
  process.stdout.write(`STORAGE_MEASUREMENTS ${JSON.stringify(measureCoinStorageScenarios())}\n`);
  process.stdout.write(`DETERMINISTIC_CHECKS ${passed}/${total}\n`);
  if (passed !== total) process.exitCode = 1;
}

function validateCheckArray(groupName, checks, checkNames) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error(`${groupName} must return a non-empty check array.`);
  }
  for (const [index, check] of checks.entries()) {
    if (!check || typeof check !== "object"
      || typeof check.name !== "string" || check.name.trim().length === 0
      || typeof check.passed !== "boolean") {
      throw new Error(`${groupName} returned an invalid check at index ${index}.`);
    }
    const identity = `${groupName}:${check.name}`;
    if (checkNames.has(identity)) throw new Error(`Duplicate deterministic check: ${identity}.`);
    checkNames.add(identity);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
