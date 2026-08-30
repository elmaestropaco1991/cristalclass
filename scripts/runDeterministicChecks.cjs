/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const workspace = path.resolve(__dirname, "..");

// Deliberately explicit: adding a similarly named file must never execute code implicitly,
// and deleting/renaming a required legacy suite must fail this runner.
const deterministicSuites = [
  ["app/services/actionCatalogDeterministicChecks.ts", "runActionCatalogDeterministicChecks"],
  ["app/services/actionConfigurationDeterministicChecks.ts", "runActionConfigurationDeterministicChecks"],
  ["app/services/actionContextConfigurationDeterministicChecks.ts", "runActionContextConfigurationDeterministicChecks"],
  ["app/services/actionSoundDeterministicChecks.ts", "runActionSoundDeterministicChecks"],
  ["app/services/additionalActionsPanelDeterministicChecks.ts", "runAdditionalActionsPanelDeterministicChecks"],
  ["app/services/attendanceDeterministicChecks.ts", "runAttendanceDeterministicChecks"],
  ["app/services/chestOpeningLifecycleDeterministicChecks.ts", "runChestOpeningLifecycleDeterministicChecks"],
  ["app/services/curriculumCatalogEditorDeterministicChecks.ts", "runCurriculumCatalogEditorDeterministicChecks"],
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
