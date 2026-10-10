/**
 * Splits long loops on the main thread into slices of at most `budgetMs`: call the returned function once per item and
 * await it; it yields to the browser only after the budget is used up, so input and rendering stay responsive.
 */
export function createMainThreadBudget(budgetMs = 50) {
  const now = () => globalThis.performance?.now() ?? Date.now();
  let sliceStart = now();
  return async () => {
    if (now() - sliceStart < budgetMs) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    sliceStart = now();
  };
}
