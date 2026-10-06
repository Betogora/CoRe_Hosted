#!/usr/bin/env python3
"""Create the APKG format matrix (ADR-035) and its expectation manifest.

Every package is produced by Anki's own exporter (pinned ``anki==26.5``) except
the Anki-2.0 variant, which re-packs the schema-11 database under its historic
entry name, and the deliberately broken package. Anki assigns time-based ids,
so packages and ``apkg-matrix.expected.json`` are always regenerated together:

    python -m pip install anki==26.5
    python scripts/create_apkg_matrix_fixtures.py

Each note carries the target expectation of the universal CoRe content model:
field roles, card keys, visible text before and after reveal, deck placement
and learning state. Known gaps of the current implementation are tracked in
``src/apkgFormatMatrix.test.ts``, never here.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import struct
import tempfile
import zipfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
MATRIX_DIR = ROOT / "fixtures" / "apkg" / "matrix"
MANIFEST_PATH = MATRIX_DIR / "apkg-matrix.expected.json"
ANKI_VERSION = "26.5"
CONTRACT_VERSION = 2


def png_bytes(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def svg_bytes(label: str) -> bytes:
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="10" height="10"/><title>{label}</title></svg>'.encode()


@dataclass
class CardSpec:
    key: str
    front_includes: list[str] = field(default_factory=list)
    front_excludes: list[str] = field(default_factory=list)
    back_includes: list[str] = field(default_factory=list)
    back_excludes: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    deck: str | None = None


@dataclass
class NoteSpec:
    guid: str
    notetype: str
    deck: str
    fields: dict[str, str]
    roles: dict[str, str]
    interaction: str
    cards: dict[int, CardSpec]
    tags: list[str] = field(default_factory=list)
    media: list[str] = field(default_factory=list)
    instruction: dict[str, str] = field(default_factory=dict)
    speech: dict[str, str] = field(default_factory=dict)
    choice: dict[str, Any] | None = None


def ensure_anki() -> None:
    try:
        installed = importlib.metadata.version("anki")
    except importlib.metadata.PackageNotFoundError as error:
        raise SystemExit(f"Benötigt: python -m pip install anki=={ANKI_VERSION}") from error
    if installed != ANKI_VERSION:
        raise SystemExit(f"Benötigt anki=={ANKI_VERSION}, gefunden wurde {installed}.")


def add_custom_notetype(col: Any, name: str, fields: list[str], templates: list[tuple[str, str, str]], *, cloze: bool = False, css: str | None = None,
                        target_decks: dict[int, str] | None = None) -> None:
    from anki.consts import MODEL_CLOZE

    model = col.models.new(name)
    if cloze:
        model["type"] = MODEL_CLOZE
    if css is not None:
        model["css"] = css
    for field_name in fields:
        col.models.add_field(model, col.models.new_field(field_name))
    for template_name, question, answer in templates:
        template = col.models.new_template(template_name)
        template["qfmt"] = question
        template["afmt"] = answer
        col.models.add_template(model, template)
    for ordinal, deck in (target_decks or {}).items():
        model["tmpls"][ordinal]["did"] = col.decks.id(deck)
    col.models.add(model)


def add_note(col: Any, spec: NoteSpec) -> list[dict[str, Any]]:
    model = col.models.by_name(spec.notetype)
    if model is None:
        raise SystemExit(f"Notiztyp fehlt: {spec.notetype}")
    note = col.new_note(model)
    note.guid = spec.guid
    for name, value in spec.fields.items():
        note[name] = value
    note.tags = list(spec.tags)
    col.add_note(note, col.decks.id(spec.deck))
    return place_cards(col, note.id, spec)


def place_cards(col: Any, note_id: int, spec: NoteSpec) -> list[dict[str, Any]]:
    cards = sorted(col.get_note(note_id).cards(), key=lambda card: card.ord)
    if sorted(card.ord for card in cards) != sorted(spec.cards):
        raise SystemExit(f"{spec.guid}: Anki erzeugte Karten {sorted(card.ord for card in cards)}, erwartet {sorted(spec.cards)}")
    for card in cards:
        target = col.decks.id(spec.cards[card.ord].deck or spec.deck)
        if card.did != target:
            col.set_deck([card.id], target)
    return [{"ankiCardId": str(card.id), "ord": card.ord} for card in cards]


def note_manifest(spec: NoteSpec, cards: list[dict[str, Any]], states: dict[int, dict[str, Any]] | None = None) -> dict[str, Any]:
    states = states or {}
    result_cards = []
    for card in cards:
        card_spec = spec.cards[card["ord"]]
        back_excludes = list(card_spec.back_excludes)
        if spec.interaction == "reveal":
            back_excludes += [text for text in card_spec.front_includes if text not in back_excludes]
        entry = {
            "ankiCardId": card["ankiCardId"],
            "ord": card["ord"],
            "key": card_spec.key,
            "deckPath": card_spec.deck or spec.deck,
            "frontIncludes": card_spec.front_includes,
            "frontExcludes": card_spec.front_excludes,
            "backIncludes": card_spec.back_includes,
            "backExcludes": back_excludes,
            "links": card_spec.links,
            "learning": states.get(card["ord"], {"state": "new", "suspended": False}),
        }
        result_cards.append(entry)
    return {
        "guid": spec.guid,
        "notetype": spec.notetype,
        "interaction": spec.interaction,
        "fieldRoles": spec.roles,
        "instruction": spec.instruction,
        "speech": spec.speech,
        "choice": spec.choice,
        "tags": spec.tags,
        "marked": "marked" in [tag.lower() for tag in spec.tags],
        "media": spec.media,
        "cards": result_cards,
    }


# --- Standard note types, package versions and deck organisation -------------------------

STANDARD_ROOT = "Matrix Standard"
FILLED_CLOZE = "Insulin senkt, Glukagon hebt den Blutzucker."


def standard_notes() -> list[NoteSpec]:
    root = STANDARD_ROOT
    return [
        NoteSpec("matrix-basic", "Basic", f"{root}::Basic",
                 {"Front": "Welches Hormon senkt den Blutzucker?", "Back": "Insulin"},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Welches Hormon senkt den Blutzucker?"], ["Insulin"], ["Insulin"])}),
        NoteSpec("matrix-reverse", "Basic (and reversed card)", f"{root}::Umgekehrt",
                 {"Front": "Mitochondrium", "Back": "Kraftwerk der Zelle"},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Mitochondrium"], ["Kraftwerk der Zelle"], ["Kraftwerk der Zelle"]),
                  1: CardSpec("reverse", ["Kraftwerk der Zelle"], ["Mitochondrium"], ["Mitochondrium"], deck=f"{root}::Umgekehrt::Rückrichtung")}),
        NoteSpec("matrix-optional-yes", "Basic (optional reversed card)", f"{root}::Optional",
                 {"Front": "Natrium", "Back": "Na+", "Add Reverse": "ja"},
                 {"Front": "prompt", "Back": "answer", "Add Reverse": "note"}, "reveal",
                 {0: CardSpec("forward", ["Natrium"], [], ["Na+"]), 1: CardSpec("reverse", ["Na+"], [], ["Natrium"])}),
        NoteSpec("matrix-optional-no", "Basic (optional reversed card)", f"{root}::Optional",
                 {"Front": "Kalium", "Back": "K", "Add Reverse": ""},
                 {"Front": "prompt", "Back": "answer", "Add Reverse": "note"}, "reveal",
                 {0: CardSpec("forward", ["Kalium"], [], ["K"])}),
        NoteSpec("matrix-type-in", "Basic (type in the answer)", f"{root}::Eintippen",
                 {"Front": "Hauptstadt von Frankreich?", "Back": "Paris"},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Hauptstadt von Frankreich?"], ["Paris"], ["Paris"])}),
        NoteSpec("matrix-cloze", "Cloze", f"{root}::Lückentext",
                 {"Text": "{{c1::Insulin}} senkt, {{c2::Glukagon::Hormon}} hebt den {{c1,3::Blutzucker}}.", "Back Extra": "Pankreas"},
                 {"Text": "prompt", "Back Extra": "extra"}, "cloze",
                 {0: CardSpec("cloze:1", ["Glukagon"], ["Insulin", "Blutzucker", "Pankreas"], [FILLED_CLOZE, "Pankreas"]),
                  1: CardSpec("cloze:2", ["Insulin", "Hormon"], ["Glukagon"], [FILLED_CLOZE, "Pankreas"]),
                  2: CardSpec("cloze:3", ["Insulin", "Glukagon"], ["Blutzucker"], [FILLED_CLOZE, "Pankreas"])}),
        NoteSpec("matrix-cloze-nested", "Cloze", f"{root}::Lückentext",
                 {"Text": "Die {{c1::Aortenklappe liegt {{c2::links}} vom Sternum}}.", "Back Extra": ""},
                 {"Text": "prompt", "Back Extra": "extra"}, "cloze",
                 {0: CardSpec("cloze:1", ["Die"], ["Aortenklappe", "links"], ["Aortenklappe liegt links vom Sternum"]),
                  1: CardSpec("cloze:2", ["Aortenklappe liegt", "vom Sternum"], ["links"], ["Aortenklappe liegt links vom Sternum"])}),
        NoteSpec("matrix-template-deck", TARGET_DECK_NOTETYPE, f"{root}::Template-Heimat",
                 {"Begriff": "Homöostase", "Erklärung": "Konstanthaltung des inneren Milieus"},
                 {"Begriff": "prompt", "Erklärung": "answer"}, "reveal",
                 {0: CardSpec("anki-0", ["Homöostase"], [], ["Konstanthaltung des inneren Milieus"]),
                  1: CardSpec("anki-1", ["Konstanthaltung des inneren Milieus"], [], ["Homöostase"], deck=f"{root}::Template-Zielstapel")}),
        NoteSpec("matrix-deep", "Basic", f"{root}::Ebene 2::Ebene 3::Ebene 4::Ebene 5::Ebene 6",
                 {"Front": "Tiefe Frage", "Back": "Tiefe Antwort"},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Tiefe Frage"], [], ["Tiefe Antwort"])}),
        NoteSpec("matrix-empty-parent", "Basic", f"{root}::Leerer Elternstapel::Kind",
                 {"Front": "Kind-Frage", "Back": "Kind-Antwort"},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Kind-Frage"], [], ["Kind-Antwort"])}),
    ]


TARGET_DECK_NOTETYPE = "CoRe-Matrix Template-Zielstapel"


def build_standard(col: Any) -> list[dict[str, Any]]:
    add_custom_notetype(col, TARGET_DECK_NOTETYPE, ["Begriff", "Erklärung"], [
        ("Begriff", "{{Begriff}}", "{{FrontSide}}<hr id=answer>{{Erklärung}}"),
        ("Erklärung", "{{Erklärung}}", "{{FrontSide}}<hr id=answer>{{Begriff}}"),
    ], target_decks={1: f"{STANDARD_ROOT}::Template-Zielstapel"})
    return [note_manifest(spec, add_note(col, spec)) for spec in standard_notes()]


# --- Special formats ----------------------------------------------------------------------

SPECIAL_ROOT = "Matrix Sonderformate"
ANKING_FIELDS = ["Text", "Extra", "Lecture Notes", "Missed Questions", "Additional Resources", "AMBOSS"]
AMBOSS_URL = "https://next.amboss.com/de/article/matrix-troponin"
# Multiple Choice for Anki (github.com/zjosua/anki-mc, AGPLv3): note type, field order and
# "QType: 0 = Kprim, 1 = Multiple Choice, 2 = Single Choice" are taken from its README and
# template definition; the template below is a CoRe-authored imitation of its signature.
MC_NOTETYPE = "AllInOne (kprim, mc, sc)"
MC_QTYPE = "QType (0=kprim,1=mc,2=sc)"
MC_FIELDS = ["Question", "Title", MC_QTYPE, "Q_1", "Q_2", "Q_3", "Q_4", "Q_5", "Answers", "Sources", "Extra 1"]
MC_ROLES = {"Question": "prompt", "Title": "note", MC_QTYPE: "consumed", "Q_1": "consumed", "Q_2": "consumed", "Q_3": "consumed",
            "Q_4": "consumed", "Q_5": "consumed", "Answers": "consumed", "Sources": "source", "Extra 1": "extra"}


def build_special_notetypes(col: Any) -> None:
    # CoRe-authored imitations of popular community note types; structure only, no copied code.
    hint_buttons = "".join(
        f'{{{{#{name}}}}}<button class="hint" onclick="toggle(this)">{name}</button><div class="hidden">{{{{{name}}}}}</div>{{{{/{name}}}}}'
        for name in ANKING_FIELDS[2:5]
    )
    add_custom_notetype(col, "CoRe-Matrix AnKing-artig", ANKING_FIELDS, [(
        "Cloze",
        f'{{{{cloze:Text}}}}<div id="hints">{hint_buttons}</div><script>function toggle(b){{b.nextSibling.classList.toggle("hidden")}}</script>',
        f'{{{{cloze:Text}}}}<hr>{{{{Extra}}}}{hint_buttons}{{{{#AMBOSS}}}}<div class="amboss">{{{{AMBOSS}}}}</div>{{{{/AMBOSS}}}}<script>function toggle(b){{}}</script>',
    )], cloze=True, css=".hidden{display:none}")
    add_custom_notetype(col, MC_NOTETYPE, MC_FIELDS, [(
        MC_NOTETYPE,
        '<script>var type="{{QType (0=kprim,1=mc,2=sc)}}";</script>{{Question}}<table id="qtable"></table>'
        '<div class="hidden" id="Q_solutions">{{Answers}}</div><div class="hidden">{{Q_1}}|{{Q_2}}|{{Q_3}}|{{Q_4}}|{{Q_5}}</div>',
        '{{Question}}<table id="atable"></table><p><b>Correct answers: x %</b></p><div>{{Sources}}</div><div>{{Extra 1}}</div>'
        '<script>var solution="{{Answers}}";</script>',
    )])
    add_custom_notetype(col, "CoRe-Matrix Hauptstadt", ["Land", "Hauptstadt", "Flagge"], [(
        "Hauptstadt",
        "Was ist die Hauptstadt von {{Land}}?{{#Flagge}}<br>{{Flagge}}{{/Flagge}}",
        "{{FrontSide}}<hr id=answer>{{Hauptstadt}}",
    )])
    add_custom_notetype(col, "CoRe-Matrix Hinweis und Vorlesen", ["Frage", "Antwort", "Hinweis"], [(
        "Karte 1",
        "{{Frage}}{{tts de_DE:Frage}}<br>{{hint:Hinweis}}",
        "{{FrontSide}}<hr id=answer>{{Antwort}}",
    )])
    add_custom_notetype(col, "CoRe-Matrix Furigana", ["Ausdruck", "Bedeutung"], [(
        "Lesen", "{{furigana:Ausdruck}}", "{{FrontSide}}<hr id=answer>{{Bedeutung}}",
    )])
    add_custom_notetype(col, "CoRe-Matrix Wortschatz", ["Wort", "Bedeutung", "Audio"], [
        ("Erkennen", "{{Wort}}", "{{FrontSide}}<hr id=answer>{{Bedeutung}}"),
        ("Abrufen", "{{Bedeutung}}", "{{FrontSide}}<hr id=answer>{{Wort}}"),
        ("Hören", "{{#Audio}}{{Audio}}{{/Audio}}", "{{FrontSide}}<hr id=answer>{{Wort}} – {{Bedeutung}}"),
    ])
    add_custom_notetype(col, "CoRe-Matrix Zwei Lückenfelder", ["Text", "Text 2", "Extra"], [(
        "Cloze", "{{cloze:Text}}<br>{{cloze:Text 2}}", "{{cloze:Text}}<br>{{cloze:Text 2}}<br>{{Extra}}",
    )], cloze=True)
    add_custom_notetype(col, "CoRe-Matrix Image Occlusion Enhanced", [
        "ID (hidden)", "Header", "Image", "Question Mask", "Footer", "Remarks", "Sources", "Extra 1", "Extra 2", "Answer Mask", "Original Mask",
    ], [(
        "IO Card",
        '{{#Header}}<div>{{Header}}</div>{{/Header}}<div id="io-wrapper"><div id="io-overlay">{{Question Mask}}</div><div id="io-original">{{Image}}</div></div>',
        '{{#Header}}<div>{{Header}}</div>{{/Header}}<div id="io-wrapper"><div id="io-overlay">{{Answer Mask}}</div><div id="io-original">{{Image}}</div></div>{{#Remarks}}<div>{{Remarks}}</div>{{/Remarks}}',
    )], css="#io-wrapper{position:relative}#io-overlay{position:absolute;top:0;width:100%;z-index:3}")


def mc_note(guid: str, qtype: str, options: list[str], answers: str, mode: str, question: str, extra: str) -> NoteSpec:
    fields = {"Question": question, "Title": "Elektrolyte und Hormone", MC_QTYPE: qtype, "Answers": answers,
              "Sources": "Physiologie-Skript", "Extra 1": extra}
    fields.update({f"Q_{index + 1}": option for index, option in enumerate(options)})
    correct = [value == "1" for value in answers.split(" ")]
    return NoteSpec(guid, MC_NOTETYPE, f"{SPECIAL_ROOT}::Multiple Choice", fields, MC_ROLES, "choice",
                    {0: CardSpec("choice", [question, *options], [answers, "Correct answers", extra], [extra],
                                 [question, answers, "Correct answers"])},
                    choice={"mode": mode, "options": options, "correct": correct})


def special_notes() -> list[NoteSpec]:
    root = SPECIAL_ROOT
    return [
        NoteSpec("matrix-anking", "CoRe-Matrix AnKing-artig", f"{root}::AnKing",
                 {"Text": "{{c1::Troponin}} steigt nach 3–4 h.", "Extra": "Herzinfarkt-Diagnostik",
                  "Lecture Notes": "Vorlesung Kardiologie", "Missed Questions": "Frage 12", "Additional Resources": "Leitlinie",
                  "AMBOSS": f'<a href="{AMBOSS_URL}">AMBOSS: Troponin</a>'},
                 {"Text": "prompt", "Extra": "extra", "Lecture Notes": "hint", "Missed Questions": "hint", "Additional Resources": "hint", "AMBOSS": "source"},
                 "cloze",
                 {0: CardSpec("cloze:1", ["steigt nach 3–4 h"], ["Troponin", "Herzinfarkt-Diagnostik", "Vorlesung Kardiologie", "Frage 12"],
                              ["Troponin steigt nach 3–4 h.", "Herzinfarkt-Diagnostik"], links=[AMBOSS_URL])},
                 tags=["#Kardio::Labor"]),
        mc_note("matrix-mc-kprim", "0", ["Natrium ist ein Kation.", "Chlorid ist ein Kation.", "Kalium ist intrazellulär hoch.", "Calcium ist zweiwertig."],
                "1 0 1 1", "kprim", "Welche Aussagen zu Elektrolyten stimmen?", "Kprim: jede Aussage einzeln bewerten."),
        mc_note("matrix-mc-multiple", "1", ["Natrium", "Chlorid", "Kalium", "Hydrogencarbonat"],
                "1 0 1 0", "multiple", "Welche Elektrolyte sind Kationen?", "Kationen sind positiv geladen."),
        mc_note("matrix-mc-single", "2", ["Insulin", "Glukagon", "Cortisol"],
                "1 0 0", "single", "Welches Hormon senkt den Blutzucker?", "Nur Insulin senkt den Blutzucker."),
        NoteSpec("matrix-capital", "CoRe-Matrix Hauptstadt", f"{root}::Unbekannter Notiztyp",
                 {"Land": "Frankreich", "Hauptstadt": "Paris", "Flagge": ""},
                 {"Land": "prompt", "Hauptstadt": "answer", "Flagge": "prompt"}, "reveal",
                 {0: CardSpec("anki-0", ["Was ist die Hauptstadt von", "Frankreich"], ["Paris"], ["Paris"], ["Was ist die Hauptstadt von"])},
                 instruction={"anki-0": "Was ist die Hauptstadt von …?"}),
        NoteSpec("matrix-hint-tts", "CoRe-Matrix Hinweis und Vorlesen", f"{root}::Hinweis und Vorlesen",
                 {"Frage": "Normwert Kalium?", "Antwort": "3,5–5,0 mmol/l", "Hinweis": "Intrazellulär hoch"},
                 {"Frage": "prompt", "Antwort": "answer", "Hinweis": "hint"}, "reveal",
                 {0: CardSpec("anki-0", ["Normwert Kalium?"], ["3,5–5,0 mmol/l", "Intrazellulär hoch"], ["3,5–5,0 mmol/l"])},
                 speech={"Frage": "de_DE"}),
        NoteSpec("matrix-furigana", "CoRe-Matrix Furigana", f"{root}::Furigana",
                 {"Ausdruck": "日本語[にほんご]", "Bedeutung": "Japanisch"},
                 {"Ausdruck": "prompt", "Bedeutung": "answer"}, "reveal",
                 {0: CardSpec("anki-0", ["日本語", "にほんご"], ["[にほんご]", "Japanisch"], ["Japanisch"])}),
        NoteSpec("matrix-vocabulary", "CoRe-Matrix Wortschatz", f"{root}::Drei Richtungen",
                 {"Wort": "der Hund", "Bedeutung": "dog", "Audio": "[sound:hund.mp3]"},
                 {"Wort": "prompt", "Bedeutung": "answer", "Audio": "prompt"}, "reveal",
                 {0: CardSpec("anki-0", ["der Hund"], ["dog"], ["dog"]), 1: CardSpec("anki-1", ["dog"], ["der Hund"], ["der Hund"]),
                  2: CardSpec("anki-2", [], ["der Hund", "dog", "[sound:"], ["der Hund", "dog"])},
                 media=["hund.mp3"]),
        NoteSpec("matrix-two-cloze-fields", "CoRe-Matrix Zwei Lückenfelder", f"{root}::Zwei Lückenfelder",
                 {"Text": "{{c1::Adrenalin}} wirkt an α- und β-Rezeptoren.", "Text 2": "{{c2::Atropin}} blockiert M-Rezeptoren.", "Extra": "Pharmakologie"},
                 {"Text": "prompt", "Text 2": "prompt", "Extra": "extra"}, "cloze",
                 {0: CardSpec("cloze:1", ["wirkt an", "Atropin"], ["Adrenalin"], ["Adrenalin wirkt an", "Atropin blockiert", "Pharmakologie"]),
                  1: CardSpec("cloze:2", ["Adrenalin", "blockiert"], ["Atropin"], ["Adrenalin wirkt an", "Atropin blockiert", "Pharmakologie"])}),
        NoteSpec("matrix-math", "Basic", f"{root}::Formeln",
                 {"Front": r"Formel: \(E = mc^2\) und \[\sum_{i=1}^{n} i\]", "Back": "[latex]x^2[/latex] Energie"},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Formel"], [r"\(", r"\[", "Energie"], ["Energie"], [r"[latex]", "[/latex]"])}),
        NoteSpec("matrix-cloze-math", "Cloze", f"{root}::Formeln",
                 {"Text": r"Ableitung: \(\frac{d}{dx} x^{{c1::2}} = {{c2::2x}}\)", "Back Extra": "Potenzregel"},
                 {"Text": "prompt", "Back Extra": "extra"}, "cloze",
                 {0: CardSpec("cloze:1", ["Ableitung"], ["{{c1::", r"\("], ["Potenzregel"], ["{{c1::", r"\("]),
                  1: CardSpec("cloze:2", ["Ableitung"], ["{{c2::", "2x", r"\("], ["2x", "Potenzregel"], ["{{c2::", r"\("])}),
        NoteSpec("matrix-media-rich", "Basic", f"{root}::Medien und Tabellen",
                 {"Front": 'Herzton hören: [sound:herz.mp3] Video: [sound:klappe.mp4] <span style="color:#c00">wichtig</span>',
                  "Back": '<table style="border-collapse:collapse"><tr><td style="border:1px solid #999">Systole</td><td>Diastole</td></tr></table>'},
                 {"Front": "prompt", "Back": "answer"}, "reveal",
                 {0: CardSpec("forward", ["Herzton hören", "wichtig"], ["[sound:", "Systole"], ["Systole", "Diastole"])},
                 media=["herz.mp3", "klappe.mp4"]),
    ]


def build_special(col: Any, media_dir: Path) -> list[dict[str, Any]]:
    build_special_notetypes(col)
    for name, data in {"hund.mp3": b"ID3matrix-hund", "herz.mp3": b"ID3matrix-herz", "klappe.mp4": b"\x00\x00\x00\x18ftypmp42matrix"}.items():
        col.media.write_data(name, data)
    manifests = [note_manifest(spec, add_note(col, spec)) for spec in special_notes()]
    manifests.append(build_native_image_occlusion(col, media_dir))
    manifests.extend(build_image_occlusion_enhanced(col))
    return manifests


def build_native_image_occlusion(col: Any, media_dir: Path) -> dict[str, Any]:
    image = media_dir / "herzklappen.png"
    image.write_bytes(png_bytes(40, 20, (200, 30, 30)))
    occlusions = (
        "{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}"
        "{{c2::image-occlusion:ellipse:left=.5:top=.5:width=.2:height=.2}}"
        "{{c2::image-occlusion:polygon:points=.6,.1 .9,.1 .75,.4}}"
        "{{c2::image-occlusion:text:text=Aorta:left=.1:top=.8:scale=1:fs=.08}}"
    )
    notetype = col.models.by_name("Image Occlusion")
    col.add_image_occlusion_note(notetype_id=notetype["id"], image_path=str(image), occlusions=occlusions, header="Herzklappen", back_extra="Auskultation", tags=["Anatomie"])
    note_id = col.find_notes('"note:Image Occlusion" Herzklappen')[0]
    note = col.get_note(note_id)
    note.guid = "matrix-io-native"
    col.update_note(note)
    spec = NoteSpec("matrix-io-native", "Image Occlusion", f"{SPECIAL_ROOT}::Image Occlusion", {},
                    {"Occlusion": "consumed", "Image": "consumed", "Header": "prompt", "Back Extra": "extra", "Comments": "note"}, "image-occlusion",
                    {0: CardSpec("io:1", ["Herzklappen"], ["image-occlusion:", "Auskultation"], ["Auskultation"], ["image-occlusion:"]),
                     1: CardSpec("io:2", ["Herzklappen"], ["image-occlusion:", "Auskultation"], ["Auskultation"], ["image-occlusion:"])},
                    tags=["Anatomie"], media=["herzklappen.png"])
    return note_manifest(spec, place_cards(col, note_id, spec))


def build_image_occlusion_enhanced(col: Any) -> list[dict[str, Any]]:
    image = "ioe-original.png"
    col.media.write_data(image, png_bytes(40, 20, (30, 30, 200)))
    manifests = []
    for index in (1, 2):
        names = {kind: f"ioe-{index}-{kind}.svg" for kind in ("Q", "A", "O")}
        for kind, name in names.items():
            col.media.write_data(name, svg_bytes(f"{kind}{index}"))
        spec = NoteSpec(f"matrix-ioe-{index}", "CoRe-Matrix Image Occlusion Enhanced", f"{SPECIAL_ROOT}::Image Occlusion Enhanced",
                        {"ID (hidden)": f"ioe-{index}", "Header": "Niere", "Image": f'<img src="{image}">',
                         "Question Mask": f'<img src="{names["Q"]}">', "Answer Mask": f'<img src="{names["A"]}">',
                         "Original Mask": f'<img src="{names["O"]}">', "Remarks": f"Struktur {index}"},
                        {"ID (hidden)": "note", "Header": "prompt", "Image": "consumed", "Question Mask": "consumed", "Footer": "note",
                         "Remarks": "extra", "Sources": "source", "Extra 1": "extra", "Extra 2": "extra", "Answer Mask": "consumed", "Original Mask": "consumed"},
                        "image-occlusion",
                        {0: CardSpec("io:1", ["Niere"], [f"Struktur {index}"], [f"Struktur {index}"])},
                        media=[image, names["Q"], names["A"], names["O"]])
        manifests.append(note_manifest(spec, add_note(col, spec)))
    return manifests


# --- Media edge cases ---------------------------------------------------------------------

MEDIA_ROOT = "Matrix Medien"


def build_media(col: Any) -> list[dict[str, Any]]:
    add_custom_notetype(col, "CoRe-Matrix Schrift", ["Front", "Back"], [("Karte 1", "{{Front}}", "{{FrontSide}}<hr id=answer>{{Back}}")],
                        css='@font-face{font-family:Matrix;src:url("_matrix-schrift.woff")} .card{font-family:Matrix}')
    files = {
        "Ä-Bild.png": png_bytes(4, 4, (10, 200, 10)),
        "mit leerzeichen.png": png_bytes(4, 4, (10, 10, 200)),
        "a&b.png": png_bytes(4, 4, (200, 200, 10)),
        "_matrix-schrift.woff": b"wOFFmatrix",
    }
    for name, data in files.items():
        col.media.write_data(name, data)
    specs = [
        NoteSpec("matrix-media-unicode", "Basic", MEDIA_ROOT, {"Front": 'Umlaut <img src="Ä-Bild.png">', "Back": "Ä"},
                 {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("forward", ["Umlaut"], [], ["Ä"])}, media=["Ä-Bild.png"]),
        NoteSpec("matrix-media-space", "Basic", MEDIA_ROOT, {"Front": 'Leerzeichen <img src="mit leerzeichen.png">', "Back": "roh"},
                 {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("forward", ["Leerzeichen"], [], ["roh"])}, media=["mit leerzeichen.png"]),
        NoteSpec("matrix-media-urlencoded", "Basic", MEDIA_ROOT, {"Front": 'URL-kodiert <img src="mit%20leerzeichen.png">', "Back": "kodiert"},
                 {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("forward", ["URL-kodiert"], [], ["kodiert"])}, media=["mit leerzeichen.png"]),
        NoteSpec("matrix-media-entity", "Basic", MEDIA_ROOT, {"Front": 'Entity <img src="a&amp;b.png">', "Back": "maskiert"},
                 {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("forward", ["Entity"], [], ["maskiert"])}, media=["a&b.png"]),
        NoteSpec("matrix-media-missing", "Basic", MEDIA_ROOT, {"Front": 'Fehlt <img src="fehlt.png">', "Back": "weg"},
                 {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("forward", ["Fehlt"], [], ["weg"])}, media=["fehlt.png"]),
        NoteSpec("matrix-media-font", "CoRe-Matrix Schrift", MEDIA_ROOT, {"Front": "Schrift aus CSS", "Back": "ohne Schrift"},
                 {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("anki-0", ["Schrift aus CSS"], [], ["ohne Schrift"])}),
    ]
    return [note_manifest(spec, add_note(col, spec)) for spec in specs]


# --- Learning state, history and filtered decks -------------------------------------------

LEARNING_ROOT = "Matrix Lernstand"


def build_learning(col: Any) -> list[dict[str, Any]]:
    from anki.cards import FSRSMemoryState

    deck = f"{LEARNING_ROOT}::Zustände"
    plain = {"Front": "prompt", "Back": "answer"}

    def basic(guid: str, text: str, tags: list[str] | None = None) -> NoteSpec:
        answer = f"Lösung {guid.removeprefix('matrix-state-')}"
        return NoteSpec(guid, "Basic", deck, {"Front": text, "Back": answer}, plain, "reveal",
                        {0: CardSpec("forward", [text], [], [answer])}, tags=tags or [])

    now = col.sched.today
    timestamp = col.crt + now * 86_400
    revlog_ids = iter(range((timestamp - 30 * 86_400) * 1_000, timestamp * 1_000, 3_600_000))
    manifests = []

    def add_with_state(spec: NoteSpec, update: Callable[[Any], dict[str, Any]], revlog: list[tuple[int, int, int, int]] | None = None) -> None:
        cards = add_note(col, spec)
        card = col.get_card(int(cards[0]["ankiCardId"]))
        expected = update(card)
        col.update_card(card)
        for ease, interval, last_interval, review_type in revlog or []:
            col.db.execute(
                "insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?, ?, -1, ?, ?, ?, 2500, 6000, ?)",
                next(revlog_ids), int(card.id), ease, interval, last_interval, review_type,
            )
        expected["reviewEvents"] = len(revlog or [])
        manifests.append(note_manifest(spec, cards, {0: expected}))

    add_with_state(basic("matrix-state-new", "Neu"), lambda card: {"state": "new", "suspended": False})

    def learning(card: Any) -> dict[str, Any]:
        card.type, card.queue, card.due, card.left = 1, 1, timestamp + 600, 1001
        return {"state": "learning", "suspended": False}
    add_with_state(basic("matrix-state-learning", "Lernend"), learning, [(3, -600, 0, 0)])

    def review(card: Any) -> dict[str, Any]:
        card.type, card.queue, card.due, card.ivl, card.factor, card.reps = 2, 2, now + 5, 12, 2500, 4
        card.memory_state = FSRSMemoryState(stability=12.5, difficulty=5.2)
        card.flags = 2
        return {"state": "review", "suspended": False, "fsrs": {"stability": 12.5, "difficulty": 5.2}, "flag": 2}
    add_with_state(basic("matrix-state-review-fsrs", "Review mit FSRS", ["marked"]), review, [(3, -600, 0, 0), (3, 1, -600, 0), (3, 4, 1, 1), (3, 12, 4, 1)])

    def history_only(card: Any) -> dict[str, Any]:
        card.type, card.queue, card.due, card.ivl, card.factor, card.reps = 2, 2, now + 3, 8, 2300, 3
        return {"state": "review", "suspended": False}
    add_with_state(basic("matrix-state-history", "Nur Historie"), history_only, [(3, 1, -600, 0), (2, 3, 1, 1), (3, 8, 3, 1)])

    def relearning(card: Any) -> dict[str, Any]:
        card.type, card.queue, card.due, card.ivl, card.lapses, card.left = 3, 1, timestamp + 600, 1, 1, 1001
        return {"state": "relearning", "suspended": False}
    add_with_state(basic("matrix-state-relearning", "Wiederlernen"), relearning, [(3, 10, 4, 1), (1, -600, 10, 1)])

    def suspended(card: Any) -> dict[str, Any]:
        card.type, card.queue, card.due, card.ivl = 2, -1, now + 10, 20
        return {"state": "review", "suspended": True}
    add_with_state(basic("matrix-state-suspended", "Ausgesetzt"), suspended, [(3, 20, 8, 1)])

    def buried(card: Any) -> dict[str, Any]:
        card.type, card.queue, card.due, card.ivl = 2, -3, now, 6
        return {"state": "review", "suspended": False}
    add_with_state(basic("matrix-state-buried", "Begraben"), buried, [(3, 6, 2, 1)])

    filtered_spec = basic("matrix-state-filtered", "Im Filterstapel")
    filtered_cards = add_note(col, filtered_spec)
    filtered_deck = col.decks.new_filtered(f"{LEARNING_ROOT}::Gefiltert")
    config = col.sched.get_or_create_filtered_deck(filtered_deck)
    config.config.search_terms[0].search = f"cid:{filtered_cards[0]['ankiCardId']}"
    col.sched.add_or_update_filtered_deck(config)
    manifests.append(note_manifest(filtered_spec, filtered_cards, {0: {"state": "new", "suspended": False, "reviewEvents": 0}}))
    return manifests


# --- Packaging ----------------------------------------------------------------------------

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def zip_entries(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        return sorted(info.filename for info in archive.infolist())


def export(col: Any, out: Path, root: str, *, legacy: bool = False, scheduling: bool = False) -> None:
    from anki.collection import DeckIdLimit, ExportAnkiPackageOptions

    options = ExportAnkiPackageOptions(with_scheduling=scheduling, with_deck_configs=False, with_media=True, legacy=legacy)
    col.export_anki_package(out_path=str(out), options=options, limit=DeckIdLimit(col.decks.id(root)))


def repack_as_anki2(source: Path, target: Path) -> None:
    with zipfile.ZipFile(source) as archive, zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for info in archive.infolist():
            if info.filename in {"collection.anki2", "meta"}:
                continue
            name = "collection.anki2" if info.filename == "collection.anki21" else info.filename
            output.writestr(name, archive.read(info.filename))


def as_learning_without_scheduling(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # Anki drops scheduling and the scheduling tags "marked" and "leech" from such exports.
    reset = json.loads(json.dumps(notes))
    for note in reset:
        note["tags"] = [tag for tag in note["tags"] if tag.lower() not in {"marked", "leech"}]
        note["marked"] = False
        for card in note["cards"]:
            card["learning"] = {"state": "new", "suspended": False, "reviewEvents": 0}
    return reset


def fixture_entry(path: Path, package_format: str, axes: dict[str, list[str]], notes: list[dict[str, Any]], *, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    entry = {
        "file": path.name,
        "sha256": sha256(path),
        "packageFormat": package_format,
        "zipEntries": zip_entries(path),
        "axes": axes,
        "notes": notes,
    }
    entry.update(extra or {})
    return entry


def media_manifest(directory: Path, names: list[str]) -> list[dict[str, Any]]:
    return [{"name": name, "sha1": hashlib.sha1((directory / name).read_bytes()).hexdigest(), "size": (directory / name).stat().st_size} for name in names]


def open_collection(directory: Path) -> Any:
    from anki.collection import Collection

    directory.mkdir()
    return Collection(str(directory / "collection.anki2"))


def main() -> None:
    ensure_anki()
    MATRIX_DIR.mkdir(parents=True, exist_ok=True)
    for stale in MATRIX_DIR.iterdir():
        stale.unlink()
    fixtures: dict[str, Any] = {}

    with tempfile.TemporaryDirectory() as temp_name:
        temp = Path(temp_name)
        col = open_collection(temp / "matrix")
        media_dir = Path(col.media.dir())
        try:
            standard = build_standard(col)
            special = build_special(col, temp)
            media = build_media(col)
            learning = build_learning(col)

            standard_axes = {"package": [], "content": ["basic", "reverse", "optional-reverse", "type-in", "cloze", "cloze-multi-ordinal", "cloze-nested"],
                             "organization": ["deep-decks", "empty-parent", "siblings-in-different-decks", "template-target-deck"], "learning": ["new"]}
            for name, package_format, legacy in (("standard-latest.apkg", "latest", False), ("standard-legacy2.apkg", "legacy-2", True)):
                path = MATRIX_DIR / name
                export(col, path, STANDARD_ROOT, legacy=legacy)
                fixtures[name.removesuffix(".apkg")] = fixture_entry(path, package_format, {**standard_axes, "package": [package_format]}, standard)
            legacy1 = MATRIX_DIR / "standard-legacy1.apkg"
            repack_as_anki2(MATRIX_DIR / "standard-legacy2.apkg", legacy1)
            fixtures["standard-legacy1"] = fixture_entry(legacy1, "legacy-1", {**standard_axes, "package": ["legacy-1"]}, standard)

            path = MATRIX_DIR / "special-latest.apkg"
            export(col, path, SPECIAL_ROOT)
            special_media = ["herz.mp3", "herzklappen.png", "hund.mp3", "ioe-1-A.svg", "ioe-1-O.svg", "ioe-1-Q.svg", "ioe-2-A.svg", "ioe-2-O.svg", "ioe-2-Q.svg", "ioe-original.png", "klappe.mp4"]
            fixtures["special-latest"] = fixture_entry(path, "latest", {
                "package": ["latest"],
                "content": ["anking-like", "mc-addon-kprim", "mc-addon-multiple", "mc-addon-single", "unknown-notetype", "static-template-text", "hint", "tts", "furigana", "three-directions",
                            "cloze-two-fields", "cloze-in-mathjax", "mathjax", "latex", "audio", "video", "table", "inline-style", "links", "image-occlusion", "image-occlusion-enhanced"],
                "organization": [], "learning": ["new"],
            }, special, extra={"media": media_manifest(media_dir, special_media), "missingMedia": []})

            path = MATRIX_DIR / "media-latest.apkg"
            export(col, path, MEDIA_ROOT)
            fixtures["media-latest"] = fixture_entry(path, "latest", {
                "package": ["latest"], "content": ["unicode-media-name", "space-media-name", "url-encoded-reference", "html-entity-reference", "missing-media", "css-font"],
                "organization": [], "learning": ["new"],
            }, media, extra={"media": media_manifest(media_dir, ["_matrix-schrift.woff", "a&b.png", "mit leerzeichen.png", "Ä-Bild.png"]), "missingMedia": ["fehlt.png"]})

            learning_axes = {"package": ["latest"], "content": ["basic"], "organization": ["filtered-deck"],
                             "learning": ["new", "learning", "review", "relearning", "suspended", "buried", "flag", "marked", "fsrs-memory-state", "revlog-only"]}
            path = MATRIX_DIR / "learning-latest.apkg"
            export(col, path, LEARNING_ROOT, scheduling=True)
            fixtures["learning-latest"] = fixture_entry(path, "latest", learning_axes, learning)
            path = MATRIX_DIR / "learning-legacy2.apkg"
            export(col, path, LEARNING_ROOT, legacy=True, scheduling=True)
            fixtures["learning-legacy2"] = fixture_entry(path, "legacy-2", {**learning_axes, "package": ["legacy-2"]}, learning)
            path = MATRIX_DIR / "learning-without-scheduling.apkg"
            export(col, path, LEARNING_ROOT, scheduling=False)
            fixtures["learning-without-scheduling"] = fixture_entry(path, "latest", {**learning_axes, "learning": ["export-without-scheduling"]},
                                                                    as_learning_without_scheduling(learning))
        finally:
            col.close()

        colpkg_col = open_collection(temp / "colpkg")
        try:
            colpkg_notes = build_standard(colpkg_col)
            default_spec = NoteSpec("matrix-default-deck", "Basic", "Default", {"Front": "Im Standardstapel", "Back": "Default"},
                                    {"Front": "prompt", "Back": "answer"}, "reveal", {0: CardSpec("forward", ["Im Standardstapel"], [], ["Default"])})
            colpkg_notes.append(note_manifest(default_spec, add_note(colpkg_col, default_spec)))
            path = MATRIX_DIR / "collection-latest.colpkg"
            colpkg_col.export_collection_package(str(path), include_media=True, legacy=False)
        finally:
            colpkg_col.close()
        fixtures["collection-latest"] = fixture_entry(path, "colpkg", {"package": ["colpkg"], "content": ["basic"], "organization": ["default-deck"], "learning": ["new"]}, colpkg_notes)

        empty_col = open_collection(temp / "empty")
        try:
            empty_col.decks.id("Matrix Leer")
            path = MATRIX_DIR / "empty-latest.apkg"
            export(empty_col, path, "Matrix Leer")
        finally:
            empty_col.close()
        fixtures["empty-latest"] = fixture_entry(path, "latest", {"package": ["latest"], "content": [], "organization": [], "learning": []}, [],
                                                 extra={"expectError": "Keine importierbaren"})

    broken = MATRIX_DIR / "broken.apkg"
    broken.write_bytes((MATRIX_DIR / "standard-latest.apkg").read_bytes()[:2048])
    fixtures["broken"] = {"file": broken.name, "sha256": sha256(broken), "packageFormat": "broken", "zipEntries": [],
                          "axes": {"package": ["broken"], "content": [], "organization": [], "learning": []}, "notes": [], "expectError": ""}

    manifest = {"contractVersion": CONTRACT_VERSION, "generator": f"anki=={ANKI_VERSION}", "fixtures": fixtures}
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    for name in sorted(fixtures):
        print(f"{name}: {len(fixtures[name]['notes'])} Notizen")
    print(f"Manifest: {MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
