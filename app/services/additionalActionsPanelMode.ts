export type AdditionalActionsPanelMode = "operational" | "configuration";

export function openActionConfiguration(): AdditionalActionsPanelMode {
  return "configuration";
}

export function leaveAdditionalActionsMode(
  mode: AdditionalActionsPanelMode
): "operational" | "close" {
  return mode === "configuration" ? "operational" : "close";
}
