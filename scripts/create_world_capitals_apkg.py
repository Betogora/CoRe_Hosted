#!/usr/bin/env python3
"""Create the checked-in world capitals APKG and local seed module.

The source snapshot is normalized from mledoze/countries and committed so the
fixture stays deterministic. Run with --refresh-source to fetch a new snapshot.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import sqlite3
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "fixtures" / "apkg" / "world-capitals.source.json"
APKG_PATH = ROOT / "fixtures" / "apkg" / "world-capitals.apkg"
SEED_PATH = ROOT / "src" / "fixtures" / "worldCapitals.js"
COUNTRIES_URL = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
SNAPSHOT_DATE = "2026-07-07"
CREATED_AT = "2026-07-07T00:00:00.000Z"
ROOT_DECK_ID = "deck_world_capitals"
ROOT_DECK_NAME = "Welt-Hauptstädte"
MODEL_ID = 1720300000001
ANKI_ROOT_DECK_ID = 1720300000000


CONTINENTS = [
    ("afrika", "Afrika"),
    ("antarktis", "Antarktis"),
    ("asien", "Asien"),
    ("europa", "Europa"),
    ("nordamerika", "Nordamerika"),
    ("ozeanien", "Ozeanien"),
    ("suedamerika", "Südamerika"),
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def fetch_countries():
    with urllib.request.urlopen(COUNTRIES_URL, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def resolve_continent(country) -> tuple[str, str] | None:
    region = country.get("region")
    subregion = country.get("subregion")
    if region == "Africa":
        return ("afrika", "Afrika")
    if region == "Antarctic":
        return ("antarktis", "Antarktis")
    if region == "Asia":
        return ("asien", "Asien")
    if region == "Europe":
        return ("europa", "Europa")
    if region == "Oceania":
        return ("ozeanien", "Ozeanien")
    if region == "Americas":
        if subregion == "South America":
            return ("suedamerika", "Südamerika")
        return ("nordamerika", "Nordamerika")
    return None


def german_country_name(country) -> str:
    translations = country.get("translations") or {}
    german = translations.get("deu") or {}
    return german.get("common") or (country.get("name") or {}).get("common") or country.get("cca3")


def normalize_countries(countries):
    items = []
    for country in countries:
        capitals = [str(item).strip() for item in country.get("capital") or [] if str(item).strip()]
        continent = resolve_continent(country)
        if not capitals or not continent:
            continue
        continent_id, continent_name = continent
        cca3 = str(country.get("cca3") or "").strip().lower()
        if not cca3:
            continue
        country_name = german_country_name(country)
        card_id = f"card_world_capitals_{cca3}"
        items.append(
            {
                "id": card_id,
                "variantId": f"variant_world_capitals_{cca3}_original",
                "ankiNoteId": 1720400000000 + len(items) + 1,
                "ankiCardId": 1720500000000 + len(items) + 1,
                "cca2": country.get("cca2"),
                "cca3": country.get("cca3"),
                "country": country_name,
                "countryEnglish": (country.get("name") or {}).get("common"),
                "capitals": capitals,
                "continentId": continent_id,
                "continent": continent_name,
            }
        )

    items.sort(key=lambda item: (item["continent"], item["country"]))
    return items


def build_source(refresh: bool):
    if refresh or not SOURCE_PATH.exists():
        countries = fetch_countries()
        items = normalize_countries(countries)
        source = {
            "metadata": {
                "title": ROOT_DECK_NAME,
                "snapshotDate": SNAPSHOT_DATE,
                "source": "mledoze/countries",
                "sourceUrl": "https://github.com/mledoze/countries",
                "sourceLicense": "ODbL-1.0",
                "generatedAt": CREATED_AT,
                "totalCards": len(items),
                "countsByContinent": {
                    label: sum(1 for item in items if item["continent"] == label)
                    for _slug, label in CONTINENTS
                },
            },
            "items": items,
        }
        write_json(SOURCE_PATH, source)
        return source
    return load_json(SOURCE_PATH)


def deck_id_for_continent(continent_id: str) -> str:
    return f"deck_world_capitals_{continent_id}"


def card_front(item) -> str:
    question = f"Was ist die Hauptstadt von {item['country']}?"
    media_name = item.get("benchmarkMedia")
    return f'{question}<br><img src="{media_name}">' if media_name else question


def card_back(item) -> str:
    if len(item["capitals"]) == 1:
        answer = item["capitals"][0]
    else:
        answer = "Hauptstädte: " + ", ".join(item["capitals"])
    media_name = item.get("benchmarkMedia")
    return f'{answer}<br><img src="{media_name}">' if media_name else answer


def write_seed_module(source) -> None:
    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    metadata = source["metadata"]
    items = source["items"]
    grouped = {
        slug: [item for item in items if item["continentId"] == slug]
        for slug, _label in CONTINENTS
    }
    continents = [
        {
            "id": slug,
            "label": label,
            "deckId": deck_id_for_continent(slug),
            "cards": grouped[slug],
        }
        for slug, label in CONTINENTS
    ]
    payload = {
        "metadata": metadata,
        "rootDeck": {"id": ROOT_DECK_ID, "name": ROOT_DECK_NAME},
        "continents": continents,
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    code = f'''import {{ createBasicLearningItem, createCoreDeck }} from "../coreModel.ts";

export const WORLD_CAPITALS_FIXTURE = {serialized};

export const WORLD_CAPITALS_TOTAL_CARDS = WORLD_CAPITALS_FIXTURE.metadata.totalCards;
export const WORLD_CAPITALS_COUNTS_BY_CONTINENT = WORLD_CAPITALS_FIXTURE.metadata.countsByContinent;

function createCapitalCard(deckId, item) {{
  const front = `Was ist die Hauptstadt von ${{item.country}}?`;
  const back = item.capitals.length === 1 ? item.capitals[0] : `Hauptstädte: ${{item.capitals.join(", ")}}`;

  return createBasicLearningItem(deckId, front, back, {{
    id: item.id,
    originalVariantId: item.variantId,
    source: "anki-apkg",
    sourceType: "anki_import",
    sourceRefId: `anki-note-${{item.ankiNoteId}}`,
    tags: ["geo", "hauptstaedte", item.continentId, String(item.cca3).toLowerCase()],
    createdAt: "{CREATED_AT}",
    updatedAt: "{CREATED_AT}",
    reviewState: {{
      learningItemId: item.id,
      reviewableType: "card",
      reviewableId: item.id,
      dueAt: "{CREATED_AT}",
      reps: 0,
      repetitions: 0,
      maturityXp: 0,
    }},
    meta: {{
      fixture: "world-capitals",
      source: WORLD_CAPITALS_FIXTURE.metadata.source,
      sourceLicense: WORLD_CAPITALS_FIXTURE.metadata.sourceLicense,
      sourceUrl: WORLD_CAPITALS_FIXTURE.metadata.sourceUrl,
      snapshotDate: WORLD_CAPITALS_FIXTURE.metadata.snapshotDate,
      countryCode: item.cca3,
      countryCodeAlpha2: item.cca2,
      countryEnglish: item.countryEnglish,
      continent: item.continent,
      ankiNoteId: String(item.ankiNoteId),
      ankiCardId: String(item.ankiCardId),
    }},
  }});
}}

export function createWorldCapitalsSeedDecks() {{
  const rootDeck = createCoreDeck({{
    id: WORLD_CAPITALS_FIXTURE.rootDeck.id,
    name: WORLD_CAPITALS_FIXTURE.rootDeck.name,
    source: "anki-apkg",
    parentDeckId: null,
    hierarchyPath: [WORLD_CAPITALS_FIXTURE.rootDeck.name],
    originalDeckId: "world-capitals-root",
    cards: [],
    tags: ["geo", "hauptstaedte"],
    createdAt: "{CREATED_AT}",
    updatedAt: "{CREATED_AT}",
    importMeta: {{
      fixture: "world-capitals",
      fileName: "world-capitals.apkg",
      source: WORLD_CAPITALS_FIXTURE.metadata.source,
      sourceUrl: WORLD_CAPITALS_FIXTURE.metadata.sourceUrl,
      sourceLicense: WORLD_CAPITALS_FIXTURE.metadata.sourceLicense,
      snapshotDate: WORLD_CAPITALS_FIXTURE.metadata.snapshotDate,
      detectedCards: WORLD_CAPITALS_FIXTURE.metadata.totalCards,
      detectedDecks: WORLD_CAPITALS_FIXTURE.continents.length + 1,
      isContainerDeck: true,
    }},
  }});

  const childDecks = WORLD_CAPITALS_FIXTURE.continents.map((continent) =>
    createCoreDeck({{
      id: continent.deckId,
      name: continent.label,
      source: "anki-apkg",
      parentDeckId: rootDeck.id,
      hierarchyPath: [rootDeck.name, continent.label],
      originalDeckId: `world-capitals-${{continent.id}}`,
      cards: continent.cards.map((item) => createCapitalCard(continent.deckId, item)),
      tags: ["geo", "hauptstaedte", continent.id],
      createdAt: "{CREATED_AT}",
      updatedAt: "{CREATED_AT}",
      importMeta: {{
        fixture: "world-capitals",
        fileName: "world-capitals.apkg",
        source: WORLD_CAPITALS_FIXTURE.metadata.source,
        sourceUrl: WORLD_CAPITALS_FIXTURE.metadata.sourceUrl,
        sourceLicense: WORLD_CAPITALS_FIXTURE.metadata.sourceLicense,
        snapshotDate: WORLD_CAPITALS_FIXTURE.metadata.snapshotDate,
        ankiDeckPath: `${{rootDeck.name}}::${{continent.label}}`,
        detectedCards: continent.cards.length,
        isContainerDeck: false,
      }},
    }}),
  );

  return [rootDeck, ...childDecks];
}}
'''
    SEED_PATH.write_text(code, encoding="utf-8", newline="\n")


def anki_tags(item) -> str:
    return f"geo hauptstaedte {item['continentId']} {str(item['cca3']).lower()}"


def build_sqlite(source, path: Path) -> None:
    if path.exists():
        path.unlink()
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE col (
              id integer primary key,
              crt integer not null,
              mod integer not null,
              scm integer not null,
              ver integer not null,
              dty integer not null,
              usn integer not null,
              ls integer not null,
              conf text not null,
              models text not null,
              decks text not null,
              dconf text not null,
              tags text not null
            );
            CREATE TABLE notes (
              id integer primary key,
              guid text not null,
              mid integer not null,
              mod integer not null,
              usn integer not null,
              tags text not null,
              flds text not null,
              sfld integer not null,
              csum integer not null,
              flags integer not null,
              data text not null
            );
            CREATE TABLE cards (
              id integer primary key,
              nid integer not null,
              did integer not null,
              ord integer not null,
              mod integer not null,
              usn integer not null,
              type integer not null,
              queue integer not null,
              due integer not null,
              ivl integer not null,
              factor integer not null,
              reps integer not null,
              lapses integer not null,
              left integer not null,
              odue integer not null,
              odid integer not null,
              flags integer not null,
              data text not null
            );
            """
        )
        now = int(time.mktime(time.strptime("2026-07-07", "%Y-%m-%d")))
        decks = {
            str(ANKI_ROOT_DECK_ID): {
                "id": ANKI_ROOT_DECK_ID,
                "name": ROOT_DECK_NAME,
                "mod": now,
                "usn": 0,
                "desc": "CoRe Fixture: Welt-Hauptstädte",
                "dyn": 0,
                "conf": 1,
            }
        }
        anki_deck_ids = {}
        for index, (slug, label) in enumerate(CONTINENTS, start=1):
            deck_id = ANKI_ROOT_DECK_ID + index
            anki_deck_ids[slug] = deck_id
            decks[str(deck_id)] = {
                "id": deck_id,
                "name": f"{ROOT_DECK_NAME}::{label}",
                "mod": now,
                "usn": 0,
                "desc": "CoRe Fixture: Welt-Hauptstädte nach Kontinent",
                "dyn": 0,
                "conf": 1,
            }
        models = {
            str(MODEL_ID): {
                "id": MODEL_ID,
                "name": "Basic",
                "type": 0,
                "mod": now,
                "usn": 0,
                "flds": [{"name": "Front", "ord": 0}, {"name": "Back", "ord": 1}],
                "tmpls": [
                    {
                        "name": "Card 1",
                        "ord": 0,
                        "qfmt": "{{Front}}",
                        "afmt": "{{FrontSide}}<hr id=answer>{{Back}}",
                    }
                ],
            }
        }
        connection.execute(
            "INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                1,
                now,
                now,
                now,
                11,
                0,
                0,
                0,
                "{}",
                json.dumps(models, ensure_ascii=False),
                json.dumps(decks, ensure_ascii=False),
                "{}",
                "{}",
            ),
        )
        for due_index, item in enumerate(source["items"], start=1):
            note_id = item["ankiNoteId"]
            card_id = item["ankiCardId"]
            front = card_front(item)
            back = card_back(item)
            deck_id = anki_deck_ids[item["continentId"]]
            connection.execute(
                "INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    note_id,
                    item["cca3"],
                    MODEL_ID,
                    now,
                    0,
                    anki_tags(item),
                    f"{front}\x1f{back}",
                    front,
                    0,
                    0,
                    json.dumps(
                        {
                            "fixture": "world-capitals",
                            "country": item["country"],
                            "continent": item["continent"],
                        },
                        ensure_ascii=False,
                    ),
                ),
            )
            connection.execute(
                "INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    card_id,
                    note_id,
                    deck_id,
                    0,
                    now,
                    0,
                    0,
                    0,
                    due_index,
                    0,
                    2500,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    "{}",
                ),
            )
        connection.commit()
    finally:
        connection.close()


def deterministic_zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(2026, 7, 7, 0, 0, 0))
    info.compress_type = zipfile.ZIP_STORED
    info.external_attr = 0o600 << 16
    return info


def write_apkg(source, output_path: Path = APKG_PATH, media_files: dict[str, bytes] | None = None) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    media_files = media_files or {}
    with tempfile.TemporaryDirectory() as temp_dir:
        sqlite_path = Path(temp_dir) / "collection.anki2"
        build_sqlite(source, sqlite_path)
        with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(deterministic_zip_info("collection.anki2"), sqlite_path.read_bytes())
            media_map = {str(index): name for index, name in enumerate(media_files)}
            archive.writestr(deterministic_zip_info("media"), json.dumps(media_map, sort_keys=True))
            for index, data in enumerate(media_files.values()):
                archive.writestr(deterministic_zip_info(str(index)), data)


def build_benchmark_fixture(source, repeat: int, media_count: int, item_count: int = 0):
    benchmark = copy.deepcopy(source)
    original_items = benchmark["items"][:item_count] if item_count > 0 else benchmark["items"]
    media_files = {
        f"benchmark-{index:04d}.png": b"\x89PNG\r\n\x1a\n" + bytes([index % 251]) * 4096
        for index in range(media_count)
    }
    media_names = list(media_files)
    expanded = []
    for repetition in range(repeat):
        for index, original in enumerate(original_items):
            item = copy.deepcopy(original)
            serial = repetition * len(original_items) + index + 1
            item["id"] = f"benchmark-card-{serial}"
            item["variantId"] = f"benchmark-variant-{serial}"
            item["ankiNoteId"] = 1820400000000 + serial
            item["ankiCardId"] = 1820500000000 + serial
            item["country"] = f"{item['country']} ({repetition + 1})"
            if media_names:
                item["benchmarkMedia"] = media_names[serial % len(media_names)]
            expanded.append(item)
    benchmark["items"] = expanded
    benchmark["metadata"] = {**benchmark["metadata"], "totalCards": len(expanded), "fixture": "m3-benchmark"}
    return benchmark, media_files


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-source", action="store_true")
    parser.add_argument("--benchmark-output", type=Path)
    parser.add_argument("--benchmark-repeat", type=int, default=20)
    parser.add_argument("--benchmark-media-count", type=int, default=200)
    parser.add_argument("--benchmark-item-count", type=int, default=0)
    args = parser.parse_args()
    source = build_source(refresh=args.refresh_source)
    if args.benchmark_output:
        output_path = args.benchmark_output if args.benchmark_output.is_absolute() else ROOT / args.benchmark_output
        benchmark, media_files = build_benchmark_fixture(
            source,
            max(1, args.benchmark_repeat),
            max(0, args.benchmark_media_count),
            max(0, args.benchmark_item_count),
        )
        write_apkg(benchmark, output_path, media_files)
        print(f"wrote {output_path.relative_to(ROOT)}")
        return
    write_seed_module(source)
    write_apkg(source)
    print(f"wrote {SOURCE_PATH.relative_to(ROOT)}")
    print(f"wrote {SEED_PATH.relative_to(ROOT)}")
    print(f"wrote {APKG_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
