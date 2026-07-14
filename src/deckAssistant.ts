import { stripHtml } from "./htmlSafety.ts";
import { makeId } from "./coreModel.ts";
import {
  MAX_CHAT_EVIDENCE_TEXT_CHARS,
  MAX_CHAT_QUESTION_CHARS,
  parseAiChatError,
  parseAiChatSuccess,
} from "./aiChatContract.ts";

const STOP_WORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "ist",
  "sind",
  "was",
  "wie",
  "welche",
  "welcher",
  "welches",
  "warum",
  "wieso",
  "the",
  "and",
  "what",
  "which",
  "why",
  "how",
]);

function tokenize(value: any) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-zA-ZÄÖÜäöüß0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word: any) => word.trim())
    .filter((word: any) => word.length >= 3 && !STOP_WORDS.has(word));
}

function cardText(card: any) {
  return `${stripHtml(card.originalFront)} ${stripHtml(card.originalBack)} ${(card.originalTags ?? []).join(" ")}`;
}

function hasTokenMatch(tokenSet: any, queryToken: any) {
  if (tokenSet.has(queryToken)) return true;
  if (queryToken.length < 5) return false;

  return [...tokenSet].some((token: any) => token.includes(queryToken) || queryToken.includes(token));
}

function scoreCard(card: any, queryTokens: any) {
  const textTokens = tokenize(cardText(card));
  const tokenSet = new Set(textTokens);
  const overlap = queryTokens.filter((token: any) => hasTokenMatch(tokenSet, token)).length;
  const tagBoost = (card.originalTags ?? []).some((tag: any) => queryTokens.includes(String(tag).toLowerCase())) ? 1 : 0;
  const maturityBoost = overlap + tagBoost > 0 && ["young", "mature", "variant_ready", "mastered"].includes(card.reviewState?.maturityBand) ? 0.25 : 0;

  return overlap + tagBoost + maturityBoost;
}

function createExtractiveAnswer(evidence: any) {
  const leading = evidence[0];
  const supporting = evidence.slice(1, 3);
  const answerParts = [
    leading?.back,
    ...supporting.map((item: any) => `Ergänzend: ${item.front} -> ${item.back}`),
  ].filter(Boolean);

  return answerParts.join("\n");
}

function createCitations(evidence: any) {
  return evidence.map((item: any) => ({
    deckId: item.deckId,
    deckName: item.deckName,
    cardId: item.cardId,
    quote: item.back.slice(0, 240),
    source: item.sourceAnchors[0]?.documentName || item.deckName,
    sourceQuote: item.sourceAnchors[0]?.textQuote || item.front,
    score: item.score,
  }));
}

export function retrieveDeckEvidence({ decks, deckId = "all", question, limit = 5 }: any) {
  const queryTokens = tokenize(question);
  const candidateDecks = deckId === "all" ? decks : decks.filter((deck: any) => deck.id === deckId);
  const candidates = candidateDecks
    .flatMap((deck: any) =>
      (deck.cards ?? [])
        .filter((card: any) => card.status !== "deleted" && card.draftStatus !== "draft")
        .map((card: any) => ({
          deckId: deck.id,
          deckName: deck.name,
          card,
          score: scoreCard(card, queryTokens),
        })),
    )
    .filter((candidate: any) => candidate.score > 0)
    .sort((left: any, right: any) => right.score - left.score || left.deckName.localeCompare(right.deckName))
    .slice(0, limit);

  return candidates.map((candidate: any) => ({
    deckId: candidate.deckId,
    deckName: candidate.deckName,
    cardId: candidate.card.id,
    front: stripHtml(candidate.card.originalFront).trim(),
    back: stripHtml(candidate.card.originalBack).trim(),
    tags: candidate.card.originalTags ?? [],
    sourceAnchors: candidate.card.sourceAnchors ?? [],
    score: candidate.score,
  }));
}

export function createDeckAssistantExchange({
  question,
  evidence = [],
  answer = "",
  warnings = [],
  now = new Date().toISOString(),
  provider = "local",
  model = "card-search",
  sourceBound = true,
}: any = {}) {
  if (evidence.length === 0) {
    if (!sourceBound) {
      return {
        id: makeId("chat"),
        question,
        answer: answer || "Die KI-Antwort konnte gerade nicht erstellt werden. Bitte versuche es gleich erneut.",
        citations: [],
        warnings,
        createdAt: now,
        provider,
        model,
        sourceBound: false,
      };
    }

    return {
      id: makeId("chat"),
      question,
      answer: "Ich finde dazu in deinen Karten keine belastbare Quelle. Ich kann deshalb keine freie Antwort ohne Kartenbezug geben.",
      citations: [],
      warnings: ["Keine Quellenkarte gefunden."],
      createdAt: now,
      provider: "local",
      model: "card-search",
      sourceBound: true,
    };
  }

  return {
    id: makeId("chat"),
    question,
    answer: answer || createExtractiveAnswer(evidence),
    citations: createCitations(evidence),
    warnings,
    createdAt: now,
    provider,
    model,
    sourceBound,
  };
}

export function answerDeckQuestion({ decks, deckId = "all", question, now = new Date().toISOString() }: any) {
  const evidence = retrieveDeckEvidence({ decks, deckId, question, limit: 5 });
  return createDeckAssistantExchange({ question, evidence, now });
}

const ROUTE_ERROR_WARNINGS = {
  missing_google_api_key: "KI-Route ist nicht konfiguriert.",
  provider_error: "KI-Anbieter konnte keine Antwort erstellen.",
  provider_invalid_json: "KI-Anbieter lieferte eine unlesbare Antwort.",
  provider_empty_answer: "KI-Anbieter lieferte eine leere Antwort.",
  provider_unreachable: "KI-Anbieter ist gerade nicht erreichbar.",
  provider_timeout: "KI-Anbieter hat nicht rechtzeitig geantwortet.",
  invalid_request: "KI-Anfrage war ungültig.",
  invalid_idempotency_key: "KI-Anfrage hatte keinen gültigen Wiederholungsschutz.",
  request_too_large: "KI-Anfrage war zu groß.",
  unauthorized: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
  ai_consent_required: "Bitte bestätige zuerst die Bedingungen für die externe KI-Nutzung.",
  rate_limited: "Zu viele KI-Anfragen. Bitte warte kurz.",
  request_in_progress: "Diese KI-Anfrage wird bereits verarbeitet.",
  idempotency_conflict: "Die KI-Anfrage konnte nicht sicher wiederholt werden.",
  auth_unavailable: "Deine Anmeldung kann gerade nicht geprüft werden.",
  protection_unavailable: "Der KI-Schutz ist gerade nicht verfügbar.",
  internal_error: "KI-Route ist auf einen internen Fehler gelaufen.",
};

function boundedWireText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function createAiChatEvidencePayload(evidence: any[]) {
  return evidence.map((item) => ({
    deckId: boundedWireText(item.deckId, 120),
    deckName: boundedWireText(item.deckName, 160),
    cardId: boundedWireText(item.cardId, 120),
    front: boundedWireText(item.front, MAX_CHAT_EVIDENCE_TEXT_CHARS),
    back: boundedWireText(item.back, MAX_CHAT_EVIDENCE_TEXT_CHARS),
    source: boundedWireText(item.sourceAnchors?.[0]?.documentName || item.deckName, 160),
    sourceQuote: boundedWireText(item.sourceAnchors?.[0]?.textQuote || item.front, MAX_CHAT_EVIDENCE_TEXT_CHARS),
  }));
}

async function readRouteErrorWarning(response: any) {
  try {
    const payload: unknown = await response.json();
    const parsed = parseAiChatError(payload);
    const code = parsed.success ? parsed.output.error.code : null;
    const warning = code ? (ROUTE_ERROR_WARNINGS as Record<string, string>)[code] : undefined;
    if (warning) {
      return warning;
    }
  } catch {
    // Ignore malformed error payloads and fall back to the HTTP status.
  }

  return `KI-Route antwortete mit Status ${response.status}.`;
}

export async function answerDeckQuestionWithServer({
  decks,
  deckId = "all",
  question,
  now = new Date().toISOString(),
  endpoint = "/api/ai/chat",
  fetchImpl = globalThis.fetch,
  sourceBound = false,
  getAccessToken = async () => null,
  createIdempotencyKey = () => globalThis.crypto.randomUUID(),
}: any = {}) {
  const evidence = sourceBound ? retrieveDeckEvidence({ decks, deckId, question, limit: 5 }) : [];
  const fallbackExchange = createDeckAssistantExchange({
    question,
    evidence,
    now,
    sourceBound,
    warnings: sourceBound ? [] : ["KI-Route nicht erreichbar."],
  });

  if ((sourceBound && evidence.length === 0) || typeof fetchImpl !== "function") {
    return {
      exchange: fallbackExchange,
      usedServer: false,
      fallbackReason: sourceBound && evidence.length === 0 ? "no-evidence" : "fetch-unavailable",
    };
  }

  try {
    if (question.length > MAX_CHAT_QUESTION_CHARS) {
      throw new Error(`Deine Frage darf höchstens ${MAX_CHAT_QUESTION_CHARS} Zeichen lang sein.`);
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
    }
    const idempotencyKey = createIdempotencyKey();
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        question,
        evidence: createAiChatEvidencePayload(evidence),
        sourceBound,
      }),
    });

    if (!response.ok) {
      throw new Error(await readRouteErrorWarning(response));
    }

    const payload: unknown = await response.json();
    const parsedPayload = parseAiChatSuccess(payload);
    if (!parsedPayload.success) {
      throw new Error("KI-Route hat ein ungültiges Antwortformat geliefert.");
    }
    const aiAnswer = parsedPayload.output.answer.trim();

    if (!aiAnswer) {
      throw new Error("KI-Route hat keine Antwort geliefert.");
    }

    return {
      exchange: createDeckAssistantExchange({
        question,
        evidence,
        answer: aiAnswer,
        warnings: parsedPayload.output.warnings,
        now,
        provider: parsedPayload.output.provider,
        model: parsedPayload.output.model,
        sourceBound,
      }),
      usedServer: true,
      fallbackReason: null,
    };
  } catch (error) {
    const warning = error instanceof Error && error.message ? error.message : "KI-Route nicht erreichbar.";
    return {
      exchange: createDeckAssistantExchange({
        question,
        evidence,
        now,
        sourceBound,
        warnings: [warning],
      }),
      usedServer: false,
      fallbackReason: "server-error",
    };
  }
}
