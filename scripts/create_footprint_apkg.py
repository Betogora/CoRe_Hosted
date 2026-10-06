#!/usr/bin/env python3
"""Create the deterministic APKG used to measure CoRe's content footprint.

The package uses Anki's stock note types so that the measured rows match what a
real import produces: 1,000 Basic notes, 1,000 Basic-and-reversed notes and
1,000 Cloze notes with four deletions each. All text is CoRe-owned filler.
"""

from __future__ import annotations

import argparse
import importlib.metadata
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "test-results" / "baseline" / "footprint.apkg"
ANKI_VERSION = "26.5"
NOTES_PER_KIND = 1_000
ROOT_DECK = "CoRe Speicherprofil"

ORGANS = ["Herz", "Niere", "Leber", "Lunge", "Milz", "Pankreas", "Schilddrüse", "Nebenniere", "Magen", "Dünndarm"]
TOPICS = ["Physiologie", "Pathologie", "Pharmakologie", "Anatomie", "Diagnostik"]


def basic_fields(index: int) -> list[str]:
    organ = ORGANS[index % len(ORGANS)]
    topic = TOPICS[index % len(TOPICS)]
    return [
        f"Welche Aufgabe erfüllt das Organ <b>{organ}</b> im Kontext {topic} (Frage {index})?",
        (
            f"Das Organ {organ} reguliert im Kontext {topic} zentrale Prozesse des Stoffwechsels.<br>"
            f"<ul><li>Merkmal A zu Frage {index}</li><li>Merkmal B mit klinischer Relevanz</li>"
            f"<li>Typische Störung: Funktionseinschränkung mit Laborveränderungen</li></ul>"
        ),
    ]


def cloze_fields(index: int) -> list[str]:
    organ = ORGANS[index % len(ORGANS)]
    topic = TOPICS[index % len(TOPICS)]
    return [
        (
            f"Im Bereich {topic} gilt für das Organ {organ} (Aussage {index}): "
            f"Die wichtigste Funktion ist {{{{c1::die Regulation des Volumenhaushalts}}}}, "
            f"gesteuert über {{{{c2::hormonelle Rückkopplung::Mechanismus}}}}. "
            f"Bei Ausfall zeigt sich klinisch {{{{c3::eine Dekompensation}}}} "
            f"mit erhöhtem {{{{c4::Kreatinin}}}} im Labor."
        ),
        (
            f"Merke zu Aussage {index}: Die Kombination aus Laborbefund und Klinik ist für {organ} "
            f"wegweisend. Differenzialdiagnosen im Kontext {topic} sorgfältig abgrenzen.<br>"
            f"<i>Quelle: CoRe-Lehrtext {index % 50}</i>"
        ),
    ]


def create_package(output: Path) -> None:
    try:
        installed_version = importlib.metadata.version("anki")
    except importlib.metadata.PackageNotFoundError as error:
        raise SystemExit(f"Benötigt: python -m pip install anki=={ANKI_VERSION}") from error
    if installed_version != ANKI_VERSION:
        raise SystemExit(f"Benötigt anki=={ANKI_VERSION}, gefunden wurde {installed_version}.")

    from anki.collection import Collection, ExportAnkiPackageOptions
    from anki.import_export_pb2 import ExportLimit

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp_dir:
        collection = Collection(str(Path(temp_dir) / "collection.anki2"))
        try:
            root = collection.decks.new_deck()
            root.name = ROOT_DECK
            root_id = collection.decks.add_deck(root).id
            kinds = [
                ("Basic", "Basic", basic_fields),
                ("Basic und umgekehrt", "Basic (and reversed card)", basic_fields),
                ("Lückentext", "Cloze", cloze_fields),
            ]
            for deck_name, notetype_name, fields_for in kinds:
                deck = collection.decks.new_deck()
                deck.name = f"{ROOT_DECK}::{deck_name}"
                deck_id = collection.decks.add_deck(deck).id
                model = collection.models.by_name(notetype_name)
                if model is None:
                    raise SystemExit(f"Anki-Standardnotiztyp fehlt: {notetype_name}")
                for index in range(NOTES_PER_KIND):
                    note = collection.new_note(model)
                    note.guid = f"core-footprint-{notetype_name}-{index}"
                    for field_index, value in enumerate(fields_for(index)):
                        note.fields[field_index] = value
                    collection.add_note(note, deck_id)
            options = ExportAnkiPackageOptions(with_scheduling=False, with_deck_configs=False, with_media=False, legacy=False)
            collection.export_anki_package(out_path=str(output), options=options, limit=ExportLimit(deck_id=root_id))
        finally:
            collection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    create_package(arguments.output)
    print(f"Speicherprofil-APKG erzeugt: {arguments.output}")


if __name__ == "__main__":
    main()
