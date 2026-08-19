function answerKey(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

export function normalizeChoiceAnswerList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const answers = values.map((answer) => String(answer).trim()).filter(Boolean);
  return answers.filter((answer, index) => answers.findIndex((candidate) => answerKey(candidate) === answerKey(answer)) === index);
}

export function readChoiceCorrectAnswers(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const choice = value as { correctAnswers?: unknown; correctAnswer?: unknown };
  return Array.isArray(choice.correctAnswers)
    ? normalizeChoiceAnswerList(choice.correctAnswers)
    : normalizeChoiceAnswerList(choice.correctAnswer);
}

export function sameChoiceAnswer(left: string, right: string): boolean {
  return answerKey(left) === answerKey(right);
}

export function findChoiceAnswerIndices(options: string[], correctAnswers: string[]): number[] {
  return options
    .map((option, index) => correctAnswers.some((answer) => sameChoiceAnswer(option, answer)) ? index : -1)
    .filter((index) => index >= 0);
}
