/** Screenshot matrices run only on request (`CORE_VISUAL_OUTPUT=1`); ordinary runs keep one phone and one desktop breakpoint. */
export const visualOutput = Boolean(process.env.CORE_VISUAL_OUTPUT);

/** Viewports of the mandatory visual matrix in `docs/operations.md#visuelle-pflichtmatrix`. */
export const VISUAL_MATRIX_VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

export function matrixViewports(viewports = VISUAL_MATRIX_VIEWPORTS) {
  return visualOutput ? viewports : [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
}

/** Both themes belong to the visual matrix; ordinary runs check behavior once in the light theme. */
export const matrixThemes: readonly ("light" | "dark")[] = visualOutput ? ["light", "dark"] : ["light"];
