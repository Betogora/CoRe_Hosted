#!/usr/bin/env python3
"""Create the KI-Varianten demo package: three cards of general knowledge per card kind.

The deck shows how each card kind behaves when AI variants are generated, including the kinds
that have no variants yet. Anki's own exporter writes the package (pinned ``anki==26.5``):

    python -m pip install anki==26.5
    python scripts/create_ai_variant_demo_apkg.py
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from create_apkg_matrix_fixtures import MC_NOTETYPE, MC_QTYPE, add_multiple_choice_notetype, ensure_anki, export, open_collection

ROOT = Path(__file__).resolve().parents[1]
APKG_PATH = ROOT / "fixtures" / "apkg" / "ai-variant-card-kinds.apkg"
DECK = "CoRe KI-Varianten"

BASIC = [
    ("Wer malte die „Mona Lisa“?", "Leonardo da Vinci"),
    ("Welcher Planet ist der Sonne am nächsten?", "Merkur"),
    ("In welchem Jahr fiel die Berliner Mauer?", "1989"),
]
TYPE_IN = [
    ("Wie heißt die Hauptstadt von Australien?", "Canberra"),
    ("Welches chemische Symbol hat Gold?", "Au"),
    ("Wie viele Bundesländer hat Deutschland?", "16"),
]
# Three cards: the first note asks two gap groups.
CLOZE = [
    ("Die {{c1::Titanic}} sank im Jahr {{c2::1912}} nach der Kollision mit einem Eisberg.", "Beim Untergang starben rund 1.500 Menschen."),
    ("Der höchste Berg der Erde ist der {{c1::Mount Everest}}.", ""),
]
# (QType, question, options, answer mask, extra); QType 0 = Kprim, 1 = Multiple Choice, 2 = Single Choice.
CHOICE = {
    "Single Choice": [
        ("2", "Welcher Ozean ist der größte der Erde?", ["Atlantik", "Pazifik", "Indischer Ozean", "Arktischer Ozean"], "0 1 0 0", ""),
        ("2", "Wer entwickelte die Relativitätstheorie?", ["Isaac Newton", "Niels Bohr", "Max Planck", "Albert Einstein"], "0 0 0 1", ""),
        ("2", "Welches ist das größte heute lebende Tier?", ["Blauwal", "Afrikanischer Elefant", "Pottwal", "Walhai"], "1 0 0 0",
         "Blauwale werden bis zu 30 Meter lang."),
    ],
    "Multiple Choice": [
        ("1", "Welche dieser Länder grenzen an Deutschland?", ["Polen", "Ungarn", "Dänemark", "Italien", "Luxemburg"], "1 0 1 0 1", ""),
        ("1", "Welche dieser Planeten sind Gasriesen?", ["Jupiter", "Mars", "Saturn", "Venus"], "1 0 1 0", ""),
        ("1", "Welche dieser Städte liegen am Rhein?", ["Köln", "Hamburg", "Basel", "München", "Düsseldorf"], "1 0 1 0 1", ""),
    ],
    "Kprim": [
        ("0", "Welche Aussagen zum Mond stimmen?", [
            "Der Mond ist der einzige natürliche Satellit der Erde.",
            "Der Mond leuchtet aus eigener Kraft.",
            "Ein Umlauf des Mondes um die Erde dauert etwa 27 Tage.",
            "Der Mond hat eine dichte Atmosphäre.",
        ], "1 0 1 0", ""),
        ("0", "Welche Aussagen zu Wasser stimmen?", [
            "Auf Meereshöhe siedet Wasser bei etwa 100 °C.",
            "Ein Wassermolekül besteht aus zwei Wasserstoffatomen und einem Sauerstoffatom.",
            "Eis hat eine höhere Dichte als flüssiges Wasser.",
            "Salzwasser gefriert bei einer höheren Temperatur als Süßwasser.",
        ], "1 1 0 0", "Weil Eis leichter ist, schwimmt es auf dem Wasser."),
        ("0", "Welche Aussagen zur Europäischen Union stimmen?", [
            "Der Euro ist in allen Mitgliedstaaten Zahlungsmittel.",
            "Das Europäische Parlament wird direkt von den Bürgerinnen und Bürgern gewählt.",
            "Die Schweiz ist Mitglied der EU.",
            "Die Europäische Kommission hat ihren Sitz in Brüssel.",
        ], "0 1 0 1", ""),
    ],
}


def add(col, notetype: str, deck: str, guid: str, fields: dict[str, str], tag: str) -> None:
    note = col.new_note(col.models.by_name(notetype))
    note.guid = guid
    for name, value in fields.items():
        note[name] = value
    note.tags = [f"Kartenart::{tag}"]
    col.add_note(note, col.decks.id(f"{DECK}::{deck}"))


def main() -> None:
    ensure_anki()
    with tempfile.TemporaryDirectory() as temp_name:
        col = open_collection(Path(temp_name) / "demo")
        try:
            add_multiple_choice_notetype(col)
            for index, (front, back) in enumerate(BASIC, start=1):
                add(col, "Basic", "1 Frage–Antwort", f"ai-variant-basic-{index}", {"Front": front, "Back": back}, "Frage–Antwort")
            for index, (front, back) in enumerate(TYPE_IN, start=1):
                add(col, "Basic (type in the answer)", "2 Eintippen", f"ai-variant-type-in-{index}", {"Front": front, "Back": back}, "Eintippen")
            for index, (text, extra) in enumerate(CLOZE, start=1):
                add(col, "Cloze", "3 Lückentext", f"ai-variant-cloze-{index}", {"Text": text, "Back Extra": extra}, "Lückentext")
            for number, (deck, notes) in enumerate(CHOICE.items(), start=4):
                slug = deck.lower().replace(" ", "-")
                for index, (qtype, question, options, answers, extra) in enumerate(notes, start=1):
                    fields = {"Question": question, "Title": "Allgemeinwissen", MC_QTYPE: qtype, "Answers": answers, "Extra 1": extra}
                    fields.update({f"Q_{position}": option for position, option in enumerate(options, start=1)})
                    add(col, MC_NOTETYPE, f"{number} {deck}", f"ai-variant-{slug}-{index}", fields, deck)
            export(col, APKG_PATH, DECK)
        finally:
            col.close()
    print(f"wrote {APKG_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
