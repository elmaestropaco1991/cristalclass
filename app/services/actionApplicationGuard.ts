export type ActionApplicationOutcome = "committed" | "failed" | "blocked";

export function shouldCloseAfterActionApplication(outcome: ActionApplicationOutcome): boolean {
  return outcome === "committed";
}

/** Prevents concurrent action submissions while keeping domain application external. */
export function createActionApplicationGuard() {
  let isProcessing = false;

  return {
    get isProcessing() {
      return isProcessing;
    },
    async run(apply: () => Promise<boolean>): Promise<ActionApplicationOutcome> {
      if (isProcessing) return "blocked";

      isProcessing = true;

      try {
        return (await apply()) ? "committed" : "failed";
      } catch {
        return "failed";
      } finally {
        isProcessing = false;
      }
    },
  };
}
