#!/usr/bin/env python3
"""Create compact APKG quality fixtures used by the import contract tests.

The legacy package is built with the Python standard library and is byte
deterministic.  The latest package intentionally uses Anki's own exporter as
the format oracle.  Regenerating it requires the pinned, opt-in tool:

    python -m pip install anki==26.5
    python scripts/create_apkg_quality_fixtures.py

Normal application builds and tests only consume the checked-in packages.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import sqlite3
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "fixtures" / "apkg"
LEGACY_PATH = FIXTURE_DIR / "import-quality-legacy.apkg"
LATEST_PATH = FIXTURE_DIR / "import-quality-latest.apkg"
MANIFEST_PATH = FIXTURE_DIR / "import-quality.expected.json"
ANKI_VERSION = "26.5"
FIELD_SEPARATOR = "\x1f"
FIXED_TIME = int(time.mktime(time.strptime("2026-07-14", "%Y-%m-%d")))
PNG_BYTES = b"\x89PNG\r\n\x1a\nCoRe APKG quality fixture\n"


DECKS = [
    (2_600_000_000_001, "CoRe APKG Qualität"),
    (2_600_000_000_002, "CoRe APKG Qualität::Reverse"),
    (2_600_000_000_003, "CoRe APKG Qualität::Optional"),
    (2_600_000_000_004, "CoRe APKG Qualität::Cloze"),
    (2_600_000_000_005, "CoRe APKG Qualität::Sonderformat"),
]


def sha1_hex(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deterministic_zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(2026, 7, 14, 0, 0, 0))
    info.compress_type = zipfile.ZIP_STORED
    info.external_attr = 0o600 << 16
    return info


def legacy_models() -> dict[str, dict[str, Any]]:
    return {
        "2600000000101": {
            "id": 2_600_000_000_101,
            "name": "CoRe Basic und umgekehrt",
            "type": 0,
            "flds": [{"name": "Vorderseite", "ord": 0}, {"name": "Rückseite", "ord": 1}],
            "tmpls": [
                {"name": "Karte 1", "ord": 0, "qfmt": "{{Vorderseite}}", "afmt": "{{FrontSide}}<hr>{{Rückseite}}"},
                {"name": "Karte 2", "ord": 1, "qfmt": "{{Rückseite}}", "afmt": "{{FrontSide}}<hr>{{Vorderseite}}"},
            ],
        },
        "2600000000102": {
            "id": 2_600_000_000_102,
            "name": "CoRe Optional umgekehrt",
            "type": 0,
            "flds": [
                {"name": "Vorderseite", "ord": 0},
                {"name": "Rückseite", "ord": 1},
                {"name": "Umgekehrt hinzufügen", "ord": 2},
            ],
            "tmpls": [
                {"name": "Karte 1", "ord": 0, "qfmt": "{{Vorderseite}}", "afmt": "{{FrontSide}}<hr>{{Rückseite}}"},
                {"name": "Karte 2", "ord": 1, "qfmt": "{{#Umgekehrt hinzufügen}}{{Rückseite}}{{/Umgekehrt hinzufügen}}", "afmt": "{{FrontSide}}<hr>{{Vorderseite}}"},
            ],
        },
        "2600000000103": {
            "id": 2_600_000_000_103,
            "name": "CoRe Cloze",
            "type": 1,
            "flds": [{"name": "Text", "ord": 0}, {"name": "Extra", "ord": 1}],
            "tmpls": [{"name": "Lückentext", "ord": 0, "qfmt": "{{cloze:Text}}", "afmt": "{{cloze:Text}}<br>{{Extra}}"}],
        },
        "2600000000104": {
            "id": 2_600_000_000_104,
            "name": "CoRe Dreifeld-Sonderformat",
            "type": 0,
            "flds": [
                {"name": "Begriff", "ord": 0},
                {"name": "Definition", "ord": 1},
                {"name": "Kontext", "ord": 2},
            ],
            "tmpls": [
                {"name": "Definition", "ord": 0, "qfmt": "{{Begriff}}", "afmt": "{{Definition}}"},
                {"name": "Kontext", "ord": 1, "qfmt": "{{Kontext}}", "afmt": "{{Begriff}}: {{Definition}}"},
            ],
        },
    }


def fixture_notes() -> list[dict[str, Any]]:
    return [
        {
            "id": 2_600_000_001_001,
            "guid": "core-quality-basic-reverse",
            "mid": 2_600_000_000_101,
            "did": DECKS[1][0],
            "fields": [
                'Welches Organell erzeugt ATP?<br><img src="quality.png"><img src="missing.png">',
                "Das Mitochondrium.",
            ],
            "cards": [(2_600_000_002_001, 0), (2_600_000_002_002, 1)],
        },
        {
            "id": 2_600_000_001_002,
            "guid": "core-quality-optional-yes",
            "mid": 2_600_000_000_102,
            "did": DECKS[2][0],
            "fields": ["Natrium", "Na", "ja"],
            "cards": [(2_600_000_002_003, 0), (2_600_000_002_004, 1)],
        },
        {
            "id": 2_600_000_001_003,
            "guid": "core-quality-optional-no",
            "mid": 2_600_000_000_102,
            "did": DECKS[2][0],
            "fields": ["Kalium", "K", ""],
            "cards": [(2_600_000_002_005, 0)],
        },
        {
            "id": 2_600_000_001_004,
            "guid": "core-quality-cloze",
            "mid": 2_600_000_000_103,
            "did": DECKS[3][0],
            "fields": ["{{c1::ATP}} entsteht in {{c2::Mitochondrien}}.", "Zellatmung"],
            "cards": [(2_600_000_002_006, 0), (2_600_000_002_007, 1)],
        },
        {
            "id": 2_600_000_001_005,
            "guid": "core-quality-custom",
            "mid": 2_600_000_000_104,
            "did": DECKS[4][0],
            "fields": ["Homöostase", "Konstanthaltung des inneren Milieus", "Physiologie"],
            "cards": [(2_600_000_002_008, 0), (2_600_000_002_009, 1)],
        },
    ]


def create_legacy_database(path: Path) -> dict[str, Any]:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE col (
              id integer primary key, crt integer not null, mod integer not null,
              scm integer not null, ver integer not null, dty integer not null,
              usn integer not null, ls integer not null, conf text not null,
              models text not null, decks text not null, dconf text not null,
              tags text not null
            );
            CREATE TABLE notes (
              id integer primary key, guid text not null, mid integer not null,
              mod integer not null, usn integer not null, tags text not null,
              flds text not null, sfld integer not null, csum integer not null,
              flags integer not null, data text not null
            );
            CREATE TABLE cards (
              id integer primary key, nid integer not null, did integer not null,
              ord integer not null, mod integer not null, usn integer not null,
              type integer not null, queue integer not null, due integer not null,
              ivl integer not null, factor integer not null, reps integer not null,
              lapses integer not null, left integer not null, odue integer not null,
              odid integer not null, flags integer not null, data text not null
            );
            """
        )
        decks = {
            str(deck_id): {"id": deck_id, "name": name, "mod": FIXED_TIME, "usn": 0, "desc": "", "dyn": 0, "conf": 1}
            for deck_id, name in DECKS
        }
        connection.execute(
            "INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (1, FIXED_TIME, FIXED_TIME, FIXED_TIME, 11, 0, 0, 0, "{}", json.dumps(legacy_models(), ensure_ascii=False), json.dumps(decks, ensure_ascii=False), "{}", "{}"),
        )
        for note in fixture_notes():
            connection.execute(
                "INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (note["id"], note["guid"], note["mid"], FIXED_TIME, 0, "core quality", FIELD_SEPARATOR.join(note["fields"]), note["fields"][0], 0, 0, "{}"),
            )
            for card_id, ordinal in note["cards"]:
                connection.execute(
                    "INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (card_id, note["id"], note["did"], ordinal, FIXED_TIME, 0, 0, 0, ordinal + 1, 0, 2500, 0, 0, 0, 0, 0, 0, ""),
                )
        connection.commit()
    finally:
        connection.close()

    return expected_from_records("legacy-2", "collection.anki21", fixture_notes(), legacy_models())


def expected_from_records(package_format: str, collection_entry: str, notes: list[dict[str, Any]], models: dict[str, Any]) -> dict[str, Any]:
    return {
        "packageFormat": package_format,
        "collectionEntry": collection_entry,
        "notes": [
            {
                "guid": note["guid"],
                "noteId": str(note["id"]),
                "notetypeId": str(note["mid"]),
                "deckPath": note.get("deckPath") or next(name for deck_id, name in DECKS if deck_id == note["did"]),
                "cardIds": [str(card_id) for card_id, _ in note["cards"]],
                "templateOrdinals": [ordinal for _, ordinal in note["cards"]],
            }
            for note in notes
        ],
        "notetypes": [
            {
                "id": str(model["id"]),
                "name": model["name"],
                "fields": [field["name"] for field in model["flds"]],
                "templates": [{"name": template["name"], "ordinal": template["ord"]} for template in model["tmpls"]],
            }
            for model in models.values()
        ],
        "media": [{"name": "quality.png", "size": len(PNG_BYTES), "sha1": sha1_hex(PNG_BYTES)}],
        "missingMediaReferences": ["missing.png"],
    }


def create_legacy_fixture() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "collection.anki21"
        expected = create_legacy_database(database_path)
        with zipfile.ZipFile(LEGACY_PATH, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(deterministic_zip_info("collection.anki21"), database_path.read_bytes())
            archive.writestr(deterministic_zip_info("media"), json.dumps({"0": "quality.png"}, sort_keys=True))
            archive.writestr(deterministic_zip_info("0"), PNG_BYTES)
    expected.update({"file": LEGACY_PATH.name, "sha256": sha256_file(LEGACY_PATH), "generator": "python-stdlib"})
    return expected


def add_model(col: Any, name: str, field_names: list[str], templates: list[tuple[str, str, str]], *, cloze: bool = False) -> dict[str, Any]:
    from anki.consts import MODEL_CLOZE

    model = col.models.new(name)
    if cloze:
        model["type"] = MODEL_CLOZE
    for field_name in field_names:
        col.models.add_field(model, col.models.new_field(field_name))
    for template_name, question_format, answer_format in templates:
        template = col.models.new_template(template_name)
        template["qfmt"] = question_format
        template["afmt"] = answer_format
        col.models.add_template(model, template)
    col.models.add(model)
    return model


def add_modern_note(col: Any, model: dict[str, Any], deck_id: int, guid: str, fields: list[str]) -> dict[str, Any]:
    note = col.new_note(model)
    note.guid = guid
    for index, value in enumerate(fields):
        note.fields[index] = value
    col.add_note(note, deck_id)
    cards = col.db.all("select id, ord from cards where nid = ? order by ord, id", note.id)
    return {
        "id": int(note.id),
        "guid": guid,
        "mid": int(model["id"]),
        "did": int(deck_id),
        "fields": fields,
        "cards": [(int(card_id), int(ordinal)) for card_id, ordinal in cards],
    }


def create_latest_fixture() -> dict[str, Any]:
    try:
        installed_version = importlib.metadata.version("anki")
    except importlib.metadata.PackageNotFoundError as error:
        raise SystemExit(f"Latest-Fixture benötigt: python -m pip install anki=={ANKI_VERSION}") from error
    if installed_version != ANKI_VERSION:
        raise SystemExit(f"Latest-Fixture benötigt anki=={ANKI_VERSION}, gefunden wurde {installed_version}.")

    from anki.collection import Collection, ExportAnkiPackageOptions
    from anki.import_export_pb2 import ExportLimit

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        collection = Collection(str(temp_root / "collection.anki2"))
        try:
            deck_ids: dict[str, int] = {}
            for _, human_name in DECKS:
                deck = collection.decks.new_deck()
                # The Python API accepts the human-facing separator and converts it
                # to Anki's native U+001F separator at the collection boundary.
                deck.name = human_name
                deck_ids[human_name] = int(collection.decks.add_deck(deck).id)

            reverse = add_model(collection, "CoRe Basic und umgekehrt", ["Vorderseite", "Rückseite"], [
                ("Karte 1", "{{Vorderseite}}", "{{FrontSide}}<hr>{{Rückseite}}"),
                ("Karte 2", "{{Rückseite}}", "{{FrontSide}}<hr>{{Vorderseite}}"),
            ])
            optional = add_model(collection, "CoRe Optional umgekehrt", ["Vorderseite", "Rückseite", "Umgekehrt hinzufügen"], [
                ("Karte 1", "{{Vorderseite}}", "{{FrontSide}}<hr>{{Rückseite}}"),
                ("Karte 2", "{{#Umgekehrt hinzufügen}}{{Rückseite}}{{/Umgekehrt hinzufügen}}", "{{FrontSide}}<hr>{{Vorderseite}}"),
            ])
            cloze = add_model(collection, "CoRe Cloze", ["Text", "Extra"], [
                ("Lückentext", "{{cloze:Text}}", "{{cloze:Text}}<br>{{Extra}}"),
            ], cloze=True)
            custom = add_model(collection, "CoRe Dreifeld-Sonderformat", ["Begriff", "Definition", "Kontext"], [
                ("Definition", "{{Begriff}}", "{{Definition}}"),
                ("Kontext", "{{Kontext}}", "{{Begriff}}: {{Definition}}"),
            ])

            notes = [
                add_modern_note(collection, reverse, deck_ids[DECKS[1][1]], "core-quality-basic-reverse", [
                    'Welches Organell erzeugt ATP?<br><img src="quality.png"><img src="missing.png">',
                    "Das Mitochondrium.",
                ]),
                add_modern_note(collection, optional, deck_ids[DECKS[2][1]], "core-quality-optional-yes", ["Natrium", "Na", "ja"]),
                add_modern_note(collection, optional, deck_ids[DECKS[2][1]], "core-quality-optional-no", ["Kalium", "K", ""]),
                add_modern_note(collection, cloze, deck_ids[DECKS[3][1]], "core-quality-cloze", ["{{c1::ATP}} entsteht in {{c2::Mitochondrien}}.", "Zellatmung"]),
                add_modern_note(collection, custom, deck_ids[DECKS[4][1]], "core-quality-custom", ["Homöostase", "Konstanthaltung des inneren Milieus", "Physiologie"]),
            ]
            collection.media.write_data("quality.png", PNG_BYTES)
            options = ExportAnkiPackageOptions(with_scheduling=False, with_deck_configs=False, with_media=True, legacy=False)
            collection.export_anki_package(out_path=str(LATEST_PATH), options=options, limit=ExportLimit(deck_id=deck_ids[DECKS[0][1]]))
            models = {str(model["id"]): model for model in [reverse, optional, cloze, custom]}
            latest_deck_name_by_id = {deck_id: name for name, deck_id in deck_ids.items()}
            for note in notes:
                note["deckPath"] = latest_deck_name_by_id[note["did"]]
            expected = expected_from_records("latest", "collection.anki21b", notes, models)
        finally:
            collection.close()

    expected.update({
        "file": LATEST_PATH.name,
        "sha256": sha256_file(LATEST_PATH),
        "generator": f"anki=={ANKI_VERSION}",
        "provenance": "Offizieller Anki-Exporter, legacy=False; sämtliche Fixture-Inhalte sind CoRe-eigen.",
    })
    return expected


def main() -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "contractVersion": 1,
        "generatedAt": "2026-07-14",
        "fixtures": {
            "legacy": create_legacy_fixture(),
            "latest": create_latest_fixture(),
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {LEGACY_PATH.relative_to(ROOT)}")
    print(f"wrote {LATEST_PATH.relative_to(ROOT)}")
    print(f"wrote {MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
