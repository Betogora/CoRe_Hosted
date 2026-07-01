import { createCoreRepository } from "./coreRepository.js";
import { createCoreCard, createCoreDeck, createReviewState } from "./coreModel.js";
import { stripHtml } from "./htmlSafety.js";
import { readSqliteDatabase } from "./sqliteReader.js";
import { readZipArchive } from "./zipReader.js";

const MAX_APKG_SIZE = 250 * 1024 * 1024;
const COLLECTION_NAMES = ["collection.anki21b", "collection.anki21", "collection.anki2"];
const FIELD_SEPARATOR = "\u001f";

function makeId(prefix) {
  const cryptoPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${cryptoPart}`;
}

function parseJson(value, fallback) {
  if (!value || typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTags(rawTags) {
  return String(rawTags ?? "")
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getDecksFromCollection(colRows) {
  const first = colRows[0] ?? {};
  const deckMap = parseJson(first.decks, {});

  return Object.values(deckMap).map((deck) => ({
    id: String(deck.id ?? ""),
    name: deck.name ?? "Anki Deck",
  }));
}

function getModelsFromCollection(colRows) {
  const first = colRows[0] ?? {};
  return parseJson(first.models, {});
}

function buildDeckHierarchy(decks) {
  const nodeByPath = new Map();

  for (const deck of decks) {
    const parts = String(deck.name ?? "Anki Deck")
      .split("::")
      .map((part) => part.trim())
      .filter(Boolean);

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("::");
      const parentPath = parts.slice(0, index).join("::") || null;
      if (!nodeByPath.has(path)) {
        nodeByPath.set(path, {
          id: index === parts.length - 1 ? String(deck.id) : `virtual_${path}`,
          name: part,
          path,
          parentPath,
          depth: index,
        });
      }
    });
  }

  return [...nodeByPath.values()];
}

function extractMediaRefs(html) {
  const refs = [];
  const mediaPattern = /(?:src|href)=["']([^"']+)["']|\[sound:([^\]]+)\]/gi;
  let match = mediaPattern.exec(html ?? "");

  while (match) {
    refs.push(match[1] ?? match[2]);
    match = mediaPattern.exec(html ?? "");
  }

  return unique(refs);
}

function extractClozeText(value) {
  return String(value ?? "").replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1");
}

function fieldNamesForNote(note, models) {
  const model = models[String(note.mid)];
  const fields = Array.isArray(model?.flds) ? model.flds : [];
  return fields.map((field, index) => field.name ?? `Field ${index + 1}`);
}

function parseFields(note, models) {
  const values = String(note.flds ?? "").split(FIELD_SEPARATOR);
  const names = fieldNamesForNote(note, models);

  return values.map((value, index) => ({
    name: names[index] ?? `Field ${index + 1}`,
    value,
  }));
}

function chooseFrontBack(note, models) {
  const fields = parseFields(note, models);
  const first = fields[0]?.value ?? "";
  const second = fields[1]?.value ?? "";
  const clozeSource = fields.map((field) => field.value).find((value) => /\{\{c\d+::/i.test(value));

  if (clozeSource) {
    const clean = extractClozeText(clozeSource);
    return {
      front: clozeSource,
      back: clean,
      isCloze: true,
      fields,
    };
  }

  return {
    front: first,
    back: second || fields.slice(1).map((field) => field.value).join("<br>"),
    isCloze: false,
    fields,
  };
}

function buildWarnings({ cards, notes, mediaMap, hasCloze, unsupportedNoteTypes }) {
  const warnings = [
    "Scheduling-Daten und Review-Historie werden im MVP bewusst noch nicht vollstaendig uebernommen.",
  ];

  if (cards.some((card) => Number(card.ord ?? 0) > 0)) {
    warnings.push("Komplexere Card Templates wurden erkannt; CoRe bewahrt die Originaldaten und nutzt eine einfache Front/Back-Vorschau.");
  }

  if (hasCloze) {
    warnings.push("Cloze-Karten wurden erkannt und als solche markiert; eine spezialisierte Cloze-Review-Logik folgt spaeter.");
  }

  if (Object.keys(mediaMap).length > 0) {
    warnings.push("Medien werden im MVP referenziert, aber noch nicht als Dateien in CoRe gespeichert.");
  }

  if (unsupportedNoteTypes.length > 0) {
    warnings.push(`Nicht vollstaendig verstandene Note Types wurden roh gesichert: ${unsupportedNoteTypes.join(", ")}.`);
  }

  if (notes.length === 0 || cards.length === 0) {
    warnings.push("Die Collection enthaelt keine auslesbaren Notes oder Cards.");
  }

  return warnings;
}

export function validateApkgFile(file) {
  const errors = [];

  if (!file) {
    errors.push("Bitte waehle eine .apkg-Datei aus.");
  }

  if (file && !file.name.toLowerCase().endsWith(".apkg")) {
    errors.push("Es werden nur Anki-Decks im .apkg-Format akzeptiert.");
  }

  if (file && file.size > MAX_APKG_SIZE) {
    errors.push("Die Datei ist groesser als 250 MB und wird im MVP nicht direkt im Browser importiert.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function extractApkgArchive(file) {
  return readZipArchive(file);
}

export function findCollectionDatabase(archive) {
  const collectionName = COLLECTION_NAMES.find((name) => archive.getEntry(name));

  if (!collectionName) {
    throw new Error("Keine Anki-Collection gefunden. Erwartet wurde collection.anki2, collection.anki21 oder collection.anki21b.");
  }

  return archive.getEntry(collectionName);
}

export async function readAnkiDatabase(collectionEntry) {
  const bytes = await collectionEntry.readBytes();
  return readSqliteDatabase(bytes);
}

export function parseAnkiDecks(database) {
  return getDecksFromCollection(database.readTable("col"));
}

export function parseAnkiNotes(database) {
  return database.readTable("notes");
}

export function parseAnkiCards(database) {
  return database.readTable("cards");
}

export async function parseAnkiMedia(archive) {
  const mediaEntry = archive.getEntry("media");

  if (!mediaEntry) {
    return {};
  }

  const mediaJson = new TextDecoder("utf-8").decode(await mediaEntry.readBytes());
  return parseJson(mediaJson, {});
}

export function mapAnkiToCoreDeck({ file, decks, notes, cards, colRows, mediaMap }) {
  const models = getModelsFromCollection(colRows);
  const deckById = new Map(decks.map((deck) => [deck.id, deck]));
  const noteById = new Map(notes.map((note) => [String(note.id), note]));
  const primaryDeck = decks[0] ?? { id: "unknown", name: file.name.replace(/\.apkg$/i, "") };
  const unsupportedNoteTypes = [];
  const createdAt = new Date().toISOString();
  let hasCloze = false;

  const coreCards = cards
    .map((card) => {
      const note = noteById.get(String(card.nid));
      if (!note) return null;

      const deck = deckById.get(String(card.did)) ?? primaryDeck;
      const frontBack = chooseFrontBack(note, models);
      hasCloze = hasCloze || frontBack.isCloze;
      const model = models[String(note.mid)] ?? {};
      const modelName = model.name ?? "Unknown Note Type";
      const isKnownType = frontBack.isCloze || frontBack.fields.length <= 2 || /basic|cloze/i.test(modelName);
      if (!isKnownType && !unsupportedNoteTypes.includes(modelName)) {
        unsupportedNoteTypes.push(modelName);
      }
      const originalHtml = [frontBack.front, frontBack.back].filter(Boolean).join("<hr>");
      const mediaRefs = unique([
        ...extractMediaRefs(originalHtml),
        ...Object.values(mediaMap).filter((name) => originalHtml.includes(String(name))),
      ]);

      return createCoreCard({
        deckId: "",
        source: "anki-apkg",
        sourceCardId: String(card.id),
        sourceNoteId: String(note.id),
        originalFront: frontBack.front,
        originalBack: frontBack.back,
        originalFields: frontBack.fields,
        originalTags: normalizeTags(note.tags),
        originalHtml,
        mediaRefs,
        cardType: frontBack.isCloze ? "cloze" : Number(card.ord ?? 0) > 0 ? "basic-reversed" : "basic",
        draftStatus: "accepted",
        reviewState: createReviewState({
          reviewableType: "card",
          intervalDays: 0,
          ease: Number(card.factor ?? 2500) / 1000 || 2.5,
          repetitions: 0,
          lapses: 0,
          maturityXp: 0,
          sourceSchedulerData: {
            due: card.due ?? null,
            interval: card.ivl ?? null,
            factor: card.factor ?? null,
            reps: card.reps ?? null,
            lapses: card.lapses ?? null,
            type: card.type ?? null,
            queue: card.queue ?? null,
          },
        }),
        createdAt,
        meta: {
          sourceDeckId: String(deck.id),
          sourceDeckName: deck.name,
          ankiOrd: card.ord,
          ankiModelName: modelName,
          unsupportedNoteType: !isKnownType,
          rawAnki: {
            note,
            card,
          },
        },
      });
    })
    .filter(Boolean);

  const deckTags = unique(coreCards.flatMap((card) => card.originalTags));

  return createCoreDeck({
    name: primaryDeck.name,
    source: "anki-apkg",
    originalDeckId: primaryDeck.id,
    createdAt,
    tags: deckTags,
    importMeta: {
      fileName: file.name,
      fileSize: file.size,
      detectedDecks: decks,
      detectedNotes: notes.length,
      detectedCards: cards.length,
      mediaCount: Object.keys(mediaMap).length,
      hasMedia: Object.keys(mediaMap).length > 0,
      hasCloze,
      deckHierarchy: buildDeckHierarchy(decks),
      unsupportedNoteTypes,
      learningProgressStatus: "raw-data-preserved-neutral-state",
    },
    cards: coreCards,
  });
}

export function createImportPreview(coreDeck, warnings) {
  return {
    deck: coreDeck,
    sampleCards: coreDeck.cards.slice(0, 5).map((card) => ({
      ...card,
      plainFront: stripHtml(card.originalFront).slice(0, 240),
      plainBack: stripHtml(card.originalBack).slice(0, 240),
    })),
    warnings,
  };
}

export async function createApkgImportPreview(file, onStep = () => {}) {
  const startedAt = new Date().toISOString();
  const validation = validateApkgFile(file);

  if (!validation.valid) {
    return {
      job: {
        id: makeId("import"),
        fileName: file?.name ?? "",
        fileSize: file?.size ?? 0,
        status: "error",
        detectedDecks: [],
        detectedCards: 0,
        detectedNotes: 0,
        warnings: [],
        errors: validation.errors,
        createdAt: startedAt,
      },
      preview: null,
    };
  }

  onStep("validate");
  const archive = await extractApkgArchive(file);
  onStep("collection");
  const collectionEntry = findCollectionDatabase(archive);
  const database = await readAnkiDatabase(collectionEntry);
  const colRows = database.readTable("col");
  onStep("cards");
  const decks = parseAnkiDecks(database);
  const notes = parseAnkiNotes(database);
  const cards = parseAnkiCards(database);
  const mediaMap = await parseAnkiMedia(archive);
  const coreDeck = mapAnkiToCoreDeck({ file, decks, notes, cards, colRows, mediaMap });
  const warnings = buildWarnings({
    cards,
    notes,
    mediaMap,
    hasCloze: coreDeck.importMeta.hasCloze,
    unsupportedNoteTypes: coreDeck.importMeta.unsupportedNoteTypes,
  });
  onStep("preview");

  return {
    job: {
      id: makeId("import"),
      fileName: file.name,
      fileSize: file.size,
      status: "preview",
      detectedDecks: decks,
      detectedCards: cards.length,
      detectedNotes: notes.length,
      warnings,
      errors: [],
      createdAt: startedAt,
    },
    preview: createImportPreview(coreDeck, warnings),
  };
}

export function commitImport(preview, repository = createCoreRepository()) {
  if (!preview?.deck) {
    throw new Error("Es gibt keine Importvorschau, die gespeichert werden kann.");
  }

  return repository.saveDeck(preview.deck);
}
