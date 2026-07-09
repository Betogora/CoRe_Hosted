import { stripHtml } from "./htmlSafety.js";
import { makeId } from "./coreModel.js";

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

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-zA-ZÄÖÜäöüß0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function cardText(card) {
  return `${stripHtml(card.originalFront)} ${stripHtml(card.originalBack)} ${(card.originalTags ?? []).join(" ")}`;
}

function hasTokenMatch(tokenSet, queryToken) {
  if (tokenSet.has(queryToken)) return true;
  if (queryToken.length < 5) return false;

  return [...tokenSet].some((token) => token.includes(queryToken) || queryToken.includes(token));
}

function scoreCard(card, queryTokens) {
  const textTokens = tokenize(cardText(card));
  const tokenSet = new Set(textTokens);
  const overlap = queryTokens.filter((token) => hasTokenMatch(tokenSet, token)).length;
  const tagBoost = (card.originalTags ?? []).some((tag) => queryTokens.includes(String(tag).toLowerCase())) ? 1 : 0;
  const maturityBoost = overlap + tagBoost > 0 && ["young", "mature", "variant_ready", "mastered"].includes(card.reviewState?.maturityBand) ? 0.25 : 0;

  return overlap + tagBoost + maturityBoost;
}

function createExtractiveAnswer(evidence) {
  const leading = evidence[0];
  const supporting = evidence.slice(1, 3);
  const answerParts = [
    leading?.back,
    ...supporting.map((item) => `Ergänzend: ${item.front} -> ${item.back}`),
  ].filter(Boolean);

  return answerParts.join("\n");
}

function createCitations(evidence) {
  return evidence.map((item) => ({
    deckId: item.deckId,
    deckName: item.deckName,
    cardId: item.cardId,
    quote: item.back.slice(0, 240),
    source: item.sourceAnchors[0]?.documentName || item.deckName,
    sourceQuote: item.sourceAnchors[0]?.textQuote || item.front,
    score: item.score,
  }));
}

export function retrieveDeckEvidence({ decks, deckId = "all", question, limit = 5 }) {
  const queryTokens = tokenize(question);
  const candidateDecks = deckId === "all" ? decks : decks.filter((deck) => deck.id === deckId);
  const candidates = candidateDecks
    .flatMap((deck) =>
      (deck.cards ?? [])
        .filter((card) => card.status !== "deleted" && card.draftStatus !== "draft")
        .map((card) => ({
          deckId: deck.id,
          deckName: deck.name,
          card,
          score: scoreCard(card, queryTokens),
        })),
    )
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.deckName.localeCompare(right.deckName))
    .slice(0, limit);

  return candidates.map((candidate) => ({
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
} = {}) {
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

export function answerDeckQuestion({ decks, deckId = "all", question, now = new Date().toISOString() }) {
  const evidence = retrieveDeckEvidence({ decks, deckId, question, limit: 5 });
  return createDeckAssistantExchange({ question, evidence, now });
}

export async function answerDeckQuestionWithServer({
  decks,
  deckId = "all",
  question,
  now = new Date().toISOString(),
  endpoint = "/api/ai/chat",
  fetchImpl = globalThis.fetch,
  sourceBound = false,
} = {}) {
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
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        evidence,
        sourceBound,
      }),
    });

    if (!response.ok) {
      throw new Error(`KI-Route antwortet mit Status ${response.status}.`);
    }

    const payload = await response.json();
    const aiAnswer = String(payload?.answer ?? "").trim();

    if (!aiAnswer) {
      throw new Error("KI-Route hat keine Antwort geliefert.");
    }

    return {
      exchange: createDeckAssistantExchange({
        question,
        evidence,
        answer: aiAnswer,
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        now,
        provider: payload?.provider || "google",
        model: payload?.model || "gemma-4-31b-it",
        sourceBound,
      }),
      usedServer: true,
      fallbackReason: null,
    };
  } catch {
    return {
      exchange: fallbackExchange,
      usedServer: false,
      fallbackReason: "server-error",
    };
  }
}

export function createDeckChatTranscript(previous = [], exchange) {
  return [exchange, ...previous].slice(0, 30);
}
