import { getActionSoundKind, type ActionSoundKind } from "./actionSoundService";

export type ActionFeedbackPlan = {
  readonly kind: ActionSoundKind;
  readonly durationMs: number;
};

export function getActionFeedbackPlan(
  points: number,
  actionCommitted: boolean,
  reducedMotion: boolean
): ActionFeedbackPlan | null {
  const kind = getActionSoundKind(points);
  if (!actionCommitted || !kind) return null;
  return { kind, durationMs: reducedMotion ? 140 : 520 };
}

export function shouldCompleteActionAfterFeedback(
  actionCommitted: boolean,
  feedbackFinished: boolean
): boolean {
  return actionCommitted && feedbackFinished;
}
