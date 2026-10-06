# Anki-Formatanalyse für CoRe

Stand: 2026-08-29

Dieses Dokument ist eine kompakte technische Referenz für Ankis Modell- und
Paketgrenzen. Der verbindliche CoRe-Vertrag steht in
[`architecture.md`](architecture.md) und [`specs.md`](specs.md); aktueller
Implementierungsstand und offene Arbeit gehören nicht hierher.

## Kurzentscheidung

Ankis wichtigste Modellentscheidung ist die Trennung von Inhalt, Darstellung,
Review-Einheit, Lernzustand, Organisation und Medien:

- `Note`: fachlicher Inhaltsdatensatz mit Feldern und Tags.
- `Notetype`: Feldschema, Templates, CSS und Regeln zur Kartengenerierung.
- `Card`: konkrete reviewbare Einheit mit eigenem Deck, Schedulerzustand und
  eigener Review-Historie.
- `Deck`: Studien- und Organisationscontainer für Cards, nicht der Besitzer
  fachlicher Inhalte.
- `Revlog`: append-only Verlauf der Review-Ereignisse.
- `Media`: externe Dateien, auf die Felder, Templates oder CSS verweisen.

CoRe übernimmt diese Trennung an der Modellgrenze, kopiert Ankis gewachsene
Speicherformen aber nicht intern. APKG, SQLite, Protobuf, Legacy-JSON, Zstd und
Template-HTML bleiben Importdetails hinter der öffentlichen Import-Seam.

Kernaussage: Anki ist für CoRe Vorbild an der Modellgrenze, aber nicht das
interne Datenformat.

## Quellenbasis

Primärquellen:

- [Anki-Repository](https://github.com/ankitects/anki)
- [Anki-Manual: Grundbegriffe](https://docs.ankiweb.net/getting-started.html)
- [Anki-Manual: lokale Dateien](https://docs.ankiweb.net/files.html)
- [Anki-Manual: Templates](https://docs.ankiweb.net/templates/intro.html)
- [Anki-Manual: Kartengenerierung](https://docs.ankiweb.net/templates/generation.html)
- [Legacy-SQLite-Schema](https://github.com/ankitects/anki/blob/main/rslib/src/storage/schema11.sql)
- Protobuf-Modelle im Anki-Repository: `proto/anki/cards.proto`,
  `notes.proto`, `decks.proto`, `notetypes.proto`, `import_export.proto`
- Paket- und Medienhandling im Anki-Repository:
  `rslib/src/import_export/package/meta.rs` und
  `rslib/src/import_export/package/media.rs`

## Anki-Istmodell

### Decks

Im Manual ist ein Deck eine Gruppe von Karten. Unterstapel werden über Namen
mit `::` ausgedrückt, etwa `Chinese::Hanzi`. Ein Elternstapel bezieht beim
Lernen Karten aus Unterstapeln ein. Decks können unterschiedliche Lernoptionen
haben, etwa neue Karten pro Tag oder Wiederholungsgrenzen.

Technisch sind Decks nicht der fachliche Inhaltsbesitzer. Eine Note liegt global
in der Collection, und die daraus erzeugten Cards können in unterschiedlichen
Decks landen. Das ist besonders wichtig bei Template-Deck-Overrides: Ein
Kartentemplate kann erzeugte Cards in ein anderes Deck legen als das beim
Hinzufügen gewählte Standarddeck.

Die moderne Protobuf-Schnittstelle modelliert Decks unter anderem mit ID, Name,
Study-/Browser-Zuständen, Deck-Art, Konfiguration, Beschreibung, Tageslimits und
optionalem Desired-Retention-Override.

CoRe-Folgerung: Decks sind Studiencontainer. Intern bleiben echte
Parent-/Child-IDs kanonisch; `::` ist nur eine importierte Hierarchiecodierung.
CoRe erhält den vollständigen Quellbaum ohne fachliches Tiefenlimit. Jeder
importierte Stapel verweist auf seinen unmittelbaren Anki-Elternstapel und
behält den vollständigen Pfad sowie seine stabile Importidentität. Ab Ebene 6
bleiben lediglich Einrückung und Tiefenfarbe visuell konstant; die echte
Beziehung wird nicht in Kartentags umgewandelt.

### Notes, Notetypes und Cards

Anki trennt den fachlichen Inhalt von der reviewbaren Karte:

- Eine Note enthält `id`, `guid`, `notetype_id`, Änderungsdaten, Tags und
  `fields`.
- Ein Notetype enthält Feldstruktur, Templates, CSS,
  Kartengenerierungsregeln und den Typ `normal` oder `cloze`.
- Eine Card enthält unter anderem `note_id`, `deck_id`, `template_idx`, Queue,
  Fälligkeit, Intervall, Ease-Faktor, Reps, Lapses, Flags und optionalen
  FSRS-Memory-State.

Der Inhalt einer Card ist damit nicht einfach `front/back`. Die Anzeige wird
aus Note-Feldern und Template gerendert. Eine fachliche Feldänderung wirkt auf
alle daraus generierten Cards.

CoRe-Folgerung: Ein CoRe-`LearningItem` entspricht einer reviewbaren Anki-Card,
nicht einer Note. Jede importierte Card, jede Reverse-Richtung und jede
Cloze-Gruppe wird eine eigenständige CoRe-Karte mit eigenem Lernzustand. Eine
persistierte Notizinstanz oder Geschwisterkopplung gibt es in CoRe nicht.

### Templates und Stock-Formate

Anki-Templates steuern, welche Felder auf Vorder- und Rückseite erscheinen und
welche Karten erzeugt werden. Templates sind HTML, Styling ist CSS. Notetypes
kennen Felder und Templates einschließlich Anforderungen für bedingte
Kartengenerierung.

Offizielle Stock-Notetypes umfassen unter anderem Basic, Basic and Reversed,
Basic optional reversed, Basic typing, Cloze und Image Occlusion.

CoRe-Folgerung: Die für die Darstellung benötigte Notetype-Definition wird als
Render-Schablone erhalten und dokumentierte statische Semantik in einem eigenen
sicheren Renderer übersetzt. Script, externe Ressourcen und Add-on-Filter
werden nicht ausgeführt. Notizinhalte und Quelldokumente werden nicht als
gemeinsame persistierte Instanz konserviert.

### Review und Revlog

Anki speichert Review-Ereignisse in `revlog`. Das Legacy-Schema hält pro
Ereignis unter anderem `cid`, `ease`, `ivl`, `lastIvl`, `factor`, `time` und
`type`. Cards besitzen zusätzlich den aktuellen Schedulerzustand.

CoRe-Folgerung: Aktueller Zustand und Ereignisverlauf bleiben getrennt.
`review_events` sind append-only; Queue- und Schedulerzustand gehören direkt
zur jeweiligen Karte. KI-Umformulierungen teilen diesen Zustand und erzeugen
keine eigene Queue-Einheit.

Der APKG-Leser ordnet geeignete `revlog`-Zeilen über stabile
Anki-Kartenidentitäten den eigenständigen CoRe-Karten zu und vereinigt sie über
deterministische Ereignis-IDs. Beschädigte oder nicht zuordenbare Zeilen werden
gezählt und übersprungen. Der anfängliche Card-Zustand folgt der Reihenfolge
gültiger FSRS-Memory-State, chronologisches Revlog-Replay, klassischer
Kartenstatus und neue Karte. Nach dem ersten CoRe-Review übernimmt
ausschließlich FSRS-6.

### APKG, Collection und Medien

Anki speichert lokale Profilinhalte in `collection.anki2`; Medien liegen
separat in `collection.media`. APKG-Dateien bündeln Collection, Medien und
Metadaten.

Von CoRe unterstützte Paketvarianten:

- Legacy 1: `collection.anki2`, Schema V11
- Legacy 2: `collection.anki21`, Schema V11
- Latest: `collection.anki21b`, Schema V18, Zstd-komprimiert

Im modernen V18-Pfad liegen `decks` und `notetypes` in normalen Tabellen,
`fields` und `templates` in `WITHOUT ROWID`-Index-B-Bäumen. CoRe normalisiert
diese Tabellen in dieselbe private Form wie Legacy-`col.models`. Bekannte
Notetype-, Field- und Template-Konfigurationen werden bounds-sicher aus
Protobuf dekodiert; vollständige Rohbytes, 64-Bit-Werte und unbekannte Felder
bleiben erhalten. Ankis nativer Deck-Trenner `U+001F` wird erst an der
Importgrenze in `::` übersetzt.

Bei modernen Paketen ist die Medienliste Protobuf-basiert; Legacy-Medien nutzen
eine JSON-Hashmap wie `{"0": "bild.png"}`. Der Import normalisiert Dateinamen,
prüft Sicherheit, verwendet SHA-1 und Größe, dekomprimiert bei Bedarf und hält
Medien von Karteninhalten getrennt.

Mit `anki==26.5` verifizierte Exportdetails (APKG-Formatmatrix, 2026-10-06):

- Moderne `.apkg`- und `.colpkg`-Dateien enthalten neben `collection.anki21b`
  stets eine Platzhalter-`collection.anki2`; der Legacy-Export schreibt
  `collection.anki21` plus Platzhalter. Anki 2.0 verwendet ausschließlich
  `collection.anki2` mit Schema 11.
- Die sechs Standardnotiztypen tragen `originalStockKind` 1 bis 6: Basic,
  Basic und umgekehrt, optional umgekehrt, Antwort eintippen, Cloze und Image
  Occlusion.
- Image Occlusion speichert Masken als Lückentext im Feld `Occlusion`, etwa
  `{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}`; Formen
  sind `rect`, `ellipse`, `polygon:points=x,y …` und `text:text=…`. `oi=1`
  (occludeInactive) hält eine Form auch auf Karten anderer Gruppen verdeckt.
  Das Template zeichnet die Masken per `anki.imageOcclusion.setup()` aus der
  Anki-Laufzeit, nicht aus dem Paket.
- Ein Deckexport enthält gefilterte Karten mit `did` des Filterstapels und dem
  Heimatstapel in `odid`, dazu stets den Stapel `Default`. Ein Export ohne
  Lernstand entfernt die Tags `marked` und `leech`.
- Ein Template-Zielstapel (`did` im Template) legt die betreffende Karte direkt
  in einen anderen Stapel als ihre Geschwister.
- Das Add-on „Multiple Choice for Anki“ (`zjosua/anki-mc`, AGPLv3) legt den
  Notiztyp `AllInOne (kprim, mc, sc)` mit den Feldern `Question`, `Title`,
  `QType (0=kprim,1=mc,2=sc)`, `Q_1` bis `Q_5`, `Answers`, `Sources` und
  `Extra 1` an. `QType` bedeutet 0 = Kprim, 1 = Multiple Choice, 2 = Single
  Choice; `Answers` ist eine durch Leerzeichen getrennte 0/1-Maske.

CoRe-Folgerung: APKG ist Austauschformat, nicht Persistenzformat.
`src/apkgImport.ts` bleibt die öffentliche Seam; Worker-Protokoll, ZIP, SQLite,
Zstd, MediaEntries und Legacy-Mappings bleiben in ihren privaten
Eigentümermodulen und außerhalb von React und dem kanonischen CoRe-Datenmodell.
