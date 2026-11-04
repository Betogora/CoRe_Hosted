# Anki-Referenz

Stand: 2026-11-04

Belegtes Verhalten von Anki und verbreiteten Add-ons, auf das sich CoRes
Import stützt. Wie CoRe daraus Inhalte und Karten macht, steht ausschließlich in
[`architecture.md`](architecture.md#note-übersetzung); sichtbares Verhalten in
[`specs.md`](specs.md).

Gepflegt wird diese Datei, wenn eine neue Anki-Version, ein Add-on-Notiztyp oder
ein Korpusstapel ein Format zeigt, das hier noch fehlt oder anders beschrieben
ist – typischerweise beim Erweitern eines Übersetzers oder der APKG-Matrix.

## Modell

| Begriff | Anki-Bedeutung |
| --- | --- |
| `Note` | Inhaltsdatensatz mit `id`, `guid`, `notetype_id`, Änderungsdaten, Tags und `fields` |
| `Notetype` | Feldschema, Templates, CSS, Regeln zur Kartengenerierung, Typ `normal` oder `cloze` |
| `Card` | reviewbare Einheit mit `note_id`, `deck_id`, `template_idx`, Queue, Fälligkeit, Intervall, Ease, Reps, Lapses, Flags und optionalem FSRS-Memory-State |
| `Deck` | Studien- und Organisationscontainer für Cards, nicht Besitzer der Inhalte |
| `Revlog` | append-only Review-Ereignisse; Legacy-Spalten u. a. `cid`, `ease`, `ivl`, `lastIvl`, `factor`, `time`, `type` |
| `Media` | externe Dateien, auf die Felder, Templates oder CSS verweisen |

- Die Anzeige einer Card entsteht aus Note-Feldern und Template; eine Feldänderung wirkt auf alle Cards der Note.
- Unterstapel werden über `::` im Namen ausgedrückt (`Chinese::Hanzi`); Elternstapel lernen Karten der Unterstapel mit. Nativ trennt Anki Stapelpfade mit `U+001F`.
- Decks tragen u. a. Konfiguration, Beschreibung, Tageslimits und optional einen eigenen Desired-Retention-Wert.
- Ein Template kann einen Zielstapel (`did`) setzen; die Card landet dann in einem anderen Stapel als ihre Geschwister.

## Templates und Standardtypen

- Templates sind HTML, Styling ist CSS; Bedingungen (`{{#Feld}}`) steuern Anzeige und Kartengenerierung.
- Standardtypen: Basic, Basic and Reversed, Basic optional reversed, Basic typing, Cloze, Image Occlusion. Sie tragen `originalStockKind` 1 bis 6.
- `originalStockKind` ist kein verlässliches Typmerkmal: Anki setzt 1 auch für Notiztypen aus `models.new()`, einschließlich Lückentypen, und Klone behalten den Wert. Erst unveränderte Standardvorlagen weisen einen Standardtyp nach.

## Pakete und Medien

- Lokal liegen Inhalte in `collection.anki2`, Medien in `collection.media`; APKG bündelt Collection, Medien und Metadaten.
- Paketvarianten: Legacy 1 `collection.anki2` (Schema V11), Legacy 2 `collection.anki21` (V11), Latest `collection.anki21b` (V18, Zstd).
- V18 hält `decks` und `notetypes` in normalen Tabellen, `fields` und `templates` in `WITHOUT ROWID`-B-Bäumen; Notetype-, Field- und Template-Konfigurationen sind Protobuf.
- Moderne Medienlisten sind Protobuf (`MediaEntries`): Datei *i* liegt im ZIP-Eintrag `i`, zstd-komprimiert, mit SHA-1 und Größe der entpackten Datei. Legacy-Pakete nutzen eine JSON-Hashmap wie `{"0": "bild.png"}` ohne Hash.

## Belegte Exportdetails (`anki==26.5`, 2026-10-06)

- Moderne `.apkg`/`.colpkg` enthalten neben `collection.anki21b` stets eine Platzhalter-`collection.anki2`; der Legacy-Export schreibt `collection.anki21` plus Platzhalter. Anki 2.0 nutzt nur `collection.anki2` mit Schema 11.
- Ein Deckexport enthält gefilterte Karten mit `did` des Filterstapels und dem Heimatstapel in `odid`, dazu stets den Stapel `Default`.
- Ein Export ohne Lernstand entfernt die Tags `marked` und `leech`, wandelt gefilterte Stapel in normale um und löscht `odid`; der Heimatstapel ist danach nicht mehr bestimmbar.

## Bildverdeckung

- Native Image Occlusion speichert Masken als Lückentext im Feld `Occlusion`, etwa `{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}`. Formen: `rect`, `ellipse`, `polygon:points=x,y …`, `text:text=…`. `oi=1` (occludeInactive) hält eine Form auch auf Karten anderer Gruppen verdeckt.
- Aktuelle Versionen speichern Ellipsen mit `rx`/`ry` statt `width`/`height`; Text maskiert `:` als `\:`.
- Editor und Reviewer (26.9) normieren x-Werte (`left`, `width`, `rx`, Polygon-x) auf die Bildbreite, y-Werte auf die Bildhöhe; `fs` ist die Schriftgröße relativ zur Bildhöhe, `scale` vergrößert Text zusätzlich.
- Rechtecke, Ellipsen und Text drehen sich um `angle` Grad in Bildpixeln um ihre linke obere Ecke. Polygone ignorieren `angle`; ihre Punkte werden so verschoben, dass die linke obere Ecke ihres Umrisses auf `left`/`top` liegt. Text zeichnet Anki in Arial auf weißem Kasten.
- Das Template zeichnet die Masken per `anki.imageOcclusion.setup()` aus der Anki-Laufzeit, nicht aus dem Paket.
- Image Occlusion Enhanced (Add-on) legt je Maske eine Note mit `Image`, `Question Mask`, `Answer Mask` und `Original Mask` an. Die Maskenfelder verweisen auf SVGs in Bildgröße. Das Frage-SVG markiert die abgefragte Form mit `class="qshape"` (auch an einer Gruppe); im Modus „alle verdecken“ (`ao`, ID `…-ao-N`) enthält es alle übrigen Formen, im Modus „eine verdecken“ (`oa`) nur die abgefragte. Der Korpus (66 Notes) enthält nur ungedrehte `rect`-Formen ohne Beschriftung.

## Add-on- und Korpus-Notiztypen

- „Multiple Choice for Anki“ (`zjosua/anki-mc`, AGPLv3): Notiztyp `AllInOne (kprim, mc, sc)` mit `Question`, `Title`, `QType (0=kprim,1=mc,2=sc)`, `Q_1` bis `Q_5`, `Answers`, `Sources`, `Extra 1`. `QType` 0 = Kprim, 1 = Multiple Choice, 2 = Single Choice; `Answers` ist eine durch Leerzeichen getrennte 0/1-Maske.
- Ankizin, Ankiphil und Dellas (Korpus, 2026-10-07) zeigen Quelle und Note-ID in einer Kopfzeile auf beiden Seiten, legen Zusatzfelder hinter Buttons oder `display:none` auf die Rückseite, führen Links als `href="{{Feld}}"` bzw. `{{text:Feld}}` und nutzen den Filter `edit:` des Add-ons „Edit Field During Review“.

## Quellen

- [Anki-Repository](https://github.com/ankitects/anki): Protobuf-Modelle `proto/anki/cards.proto`, `notes.proto`, `decks.proto`, `notetypes.proto`, `import_export.proto`; Paket- und Medienhandling in `rslib/src/import_export/package/meta.rs` und `media.rs`; [Legacy-Schema](https://github.com/ankitects/anki/blob/main/rslib/src/storage/schema11.sql)
- Anki-Manual: [Grundbegriffe](https://docs.ankiweb.net/getting-started.html), [lokale Dateien](https://docs.ankiweb.net/files.html), [Templates](https://docs.ankiweb.net/templates/intro.html), [Kartengenerierung](https://docs.ankiweb.net/templates/generation.html)
