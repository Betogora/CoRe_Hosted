export const MAX_VISIBLE_DECK_LEVELS = 6;

export function getVisibleDeckDepth(logicalDepth: number): number {
  return Math.min(Math.max(0, Math.floor(logicalDepth)), MAX_VISIBLE_DECK_LEVELS - 1);
}
