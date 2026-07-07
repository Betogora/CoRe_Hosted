# Anki-Dateiformat und CoRe-Kartenmodell

Stand: 2026-07-07

Diese Notiz fasst zusammen, was die offiziellen Anki-Quellen über Stapel, Karten, Notizen, Templates und APKG-Dateien zeigen. Sie ist keine vollständige Anki-Reimplementation-Spezifikation. Ziel ist eine Produkt- und Architekturentscheidung für CoRe: Welche Anki-Ideen sind grundlegend sinnvoll, welche sollten nur importiert oder konserviert werden, und wo sollte CoRe ein eigenes, klareres Modell behalten?

## Kurzfazit

Ankis wichtigste Modellentscheidung ist gut: Inhalt, Darstellung, Lernzustand und Organisation sind getrennt.

- `Note`: fachlicher Inhaltsdatensatz mit Feldern und Tags.
- `Notetype`: Feldschema plus Kartenvorlagen, aus denen Review-Karten entstehen.
- `Card`: konkrete abfragbare Review-Einheit mit eigenem Deck, eigener Queue, eigenem Intervall und eigener Review-Historie.
- `Deck`: organisatorische und schedulerbezogene Gruppierung von Karten, nicht von Notizen.
- `Revlog`: append-only Review-Verlauf pro Karte.
- `Media`: externe Dateien, auf die Felder, Templates oder CSS verweisen.

Für CoRe ist diese Trennung fast ideal, aber Ankis historisches Speicherformat sollte nicht 1:1 übernommen werden. CoRe sollte Anki an den Rändern kompatibel lesen und später ggf. schreiben, intern aber ein explizites Modell aus Learning Items, Varianten, Scheduler-State, Medienreferenzen, Quellenankern und Import-Identitäten verwenden.

## Primärquellen

- Anki-Repository: https://github.com/ankitects/anki
- Anki-Manual, Grundbegriffe: https://docs.ankiweb.net/getting-started.html
- Anki-Manual, lokale Dateien: https://docs.ankiweb.net/files.html
- Anki-Manual, Templates: https://docs.ankiweb.net/templates/intro.html
- Anki-Manual, Kartengenerierung: https://docs.ankiweb.net/templates/generation.html
- Legacy-SQLite-Schema `schema11.sql`: https://github.com/ankitects/anki/blob/main/rslib/src/storage/schema11.sql
- Protobuf-Modelle: `cards.proto`, `notes.proto`, `decks.proto`, `notetypes.proto`, `import_export.proto`
- APKG-Export/Import: `rslib/src/import_export/package/apkg/export.rs`, `.../apkg/import/mod.rs`, `.../gather.rs`
- Paket-Metadaten und Medien: `rslib/src/import_export/package/meta.rs`, `.../media.rs`

## Wie Anki einen Stapel organisiert

Im Manual ist ein Deck eine Gruppe von Karten. Es kann Unterstapel enthalten; die Hierarchie wird im Namen mit `::` ausgedrückt, etwa `Chinese::Hanzi`. Wenn ein Elternstapel gelernt wird, werden Karten aus den Unterstapeln einbezogen.

Technisch ist ein Deck nicht der Besitzer des fachlichen Inhalts. Eine Note ist global in der Collection, und einzelne daraus generierte Cards können in unterschiedlichen Decks landen. Das erklärt auch die Template-Option "Deck Override": Ein Kartentemplate kann seine erzeugten Karten in ein anderes Deck legen als das beim Hinzufügen gewählte Zieldeck.

Im älteren SQLite-Schema liegt Deck-Metadatenbestand in `col.decks`; Karten referenzieren ihr Deck über `cards.did`. Moderne Anki-APIs modellieren Decks als Protobuf-Objekte mit:

- `id`
- `name`
- Änderungszeit und Sync-Nummer
- gemeinsamen Study-/Browser-Zuständen
- `normal` oder `filtered` als Deck-Art
- Deck-Konfiguration, Beschreibung, Limits und optionaler Desired-Retention-Überschreibung

Für CoRe ist wichtig: Ein Deck ist ein Studien- und Organisationscontainer für reviewbare Einheiten. Es sollte nicht die einzige Quelle für Karteninhalt sein.

## Wie Anki eine einzelne Karte organisiert

Anki unterscheidet zwischen Note und Card. Eine Note ist der Inhalt; eine Card ist eine daraus erzeugte Abfrage.

### Note

Eine Note enthält:

- stabile `id` und `guid`
- `notetype_id`
- Änderungszeit und Sync-Nummer
- Tags
- Felder

Im Legacy-SQLite-Schema stehen die Feldwerte als `notes.flds`. In der modernen Protobuf-Schnittstelle erscheinen sie als `repeated string fields`. Diese Felder sind nicht fest auf "Front" und "Back" beschränkt. Ein Vokabel-Notetype kann z. B. `Französisch`, `Deutsch` und `Seite` enthalten.

### Notetype

Ein Notetype definiert:

- Art: normal oder Cloze
- Felder mit Namen und Feldoptionen
- Templates mit Front- und Back-HTML
- CSS
- Card-Requirements für bedingte Kartengenerierung
- optionales Zieldeck pro Template
- Stock-Arten wie Basic, Basic and Reversed, Optional Reversed, Typing, Cloze und Image Occlusion

Damit kann eine Note mehrere Cards erzeugen. Ein Tippfehler in einem Feld wird nur an einer Stelle korrigiert, wirkt aber auf alle daraus generierten Karten.

### Card

Eine Card enthält nicht primär den Inhalt, sondern die reviewbare Instanz:

- `id`
- `note_id`
- `deck_id`
- `template_idx`
- Typ und Queue
- Fälligkeit, Intervall, Ease-Faktor
- Wiederholungen, Lapses, verbleibende Lernschritte
- Original-Due und Original-Deck für gefilterte Decks
- Flags
- optional FSRS-Memory-State, Desired Retention, Decay und letzte Review-Zeit
- Custom Data

Der Inhalt der Karte wird zur Anzeige aus Note-Feldern plus Template gerendert. Das ist der entscheidende Punkt: Eine "Karte" ist in Anki nicht nur Front/Back-Text, sondern eine Kombination aus Inhaltsdatensatz, Template und Scheduling-Zustand.

### Revlog

`revlog` speichert Review-Ereignisse pro Card. Im Legacy-Schema stehen u. a. `cid`, `ease`, `ivl`, `lastIvl`, `factor`, `time` und `type`. Das Manual beschreibt die Bewertung als Rating 1 bis 4, also Again bis Easy. Für CoRe ist das ein gutes Vorbild: Review-Events sollten append-only bleiben und nicht als einzelner überschreibbarer Zustand enden.

## APKG und Collection-Dateien

Lokal speichert Anki Profilinhalte in `collection.anki2` und Medien in `collection.media`. APKG-Dateien sind Exportpakete, die eine Collection-Datei, Medien und Metadaten bündeln.

Aktuelle Anki-Pakete kennen mehrere Varianten:

- Legacy 1: `collection.anki2`
- Legacy 2: `collection.anki21`
- Latest: `collection.anki21b`

Die Paket-Metadaten legen fest, welche Collection-Datei im Archiv steckt. Für `Latest` verwendet Anki laut `meta.rs` `collection.anki21b`, Schema-Version 18, Zstd-Kompression und eine moderne Medienliste. Legacy-Pakete verwenden Schema-Version 11 und eine JSON-Hashmap für Medien.

Die moderne Medienliste ist Protobuf-basiert: `MediaEntries` enthält pro Eintrag Namen, Größe und SHA-1. Legacy-Medien nutzen ein JSON-Mapping wie `{"0": "bild.png"}`; die Datei im Zip heißt dann `0`, der Karteninhalt referenziert `bild.png`.

Der Importcode normalisiert und prüft Dateinamen, ersetzt Medienreferenzen in Feldern, übernimmt Notetypes, Notes, Decks, Cards und optional Revlog/Deck-Konfigurationen. Beim Reimport werden Notes über `guid` wiedererkannt; Notetype-Änderungen können aktualisiert, dupliziert oder gemergt werden. Karten werden anhand von Note und Template-Ordinal gegen Duplikate geschützt.

## Was CoRe übernehmen sollte

### P0: Jetzt als Kernmodell ernst nehmen

- **Learning Item statt flacher Card:** CoRe sollte die bereits begonnene Trennung beibehalten: Ein Learning Item entspricht eher Ankis Note, Varianten entsprechen reviewbaren Cards.
- **Genau eine Original-Variante:** Das passt zu CoRes Originalanker-Prinzip und verhindert, dass Import, KI-Varianten und Rephrases das Ursprungskonzept überschreiben.
- **Per-Variante Scheduler-State:** Reverse-, Cloze- und CoRe-Varianten brauchen eigene Fälligkeit, Intervall- und Performance-Daten.
- **Append-only Review Events:** Ein Event pro Antwort, inklusive Rating, Zeit, Variante, Learning Item und Quelle.
- **Stabile Import-Identität:** `ankiGuid`, ursprüngliche Note-ID, ursprüngliche Card-ID, Notetype-ID, Template-Ordinal, Deck-Pfad, Importgruppe und Media-Checksums sollten konserviert werden.
- **Explizite Deck-Hierarchie:** CoRe sollte `::` beim Import verstehen, intern aber echte Parent-/Child-IDs behalten.
- **Medien als Assets:** Dateiname, normalisierter Name, SHA-1, Größe, MIME-Typ, Storage-Referenz und Fundstelle gehören in ein Medienmodell, nicht in React.
- **Notetype-/Template-Snapshot:** Für Import, Reimport und spätere Exporte sollten Feldnamen, Template-Namen, Template-Reihenfolge, Front/Back-HTML und CSS als Snapshot erhalten bleiben.

### P1: Als sinnvolle nächste Ausbaustufe

- **Cloze wirklich modellieren:** Cloze-Nummern, Cloze-Gruppen und generierte Card-Ords sollten eigene Strukturen bekommen, nicht nur HTML-Fallback sein.
- **Tags als Such- und Planungsmetadaten:** Tags sind nützlich für Filter, Lernpläne, Graph und Community, sollten aber nicht zum einzigen Fachmodell werden.
- **New/Learning/Review/Relearn vollständig abbilden:** CoRe hat schon FSRS-like State; die Statusbegriffe sollten für Import, UI und Analytics konsistent sein.
- **Reimport-Feldschema:** Wenn ein importierter Notetype neue Felder bekommt, sollte CoRe vorhandene lokale Edits erhalten und neue Felder kontrolliert ergänzen.
- **Revlog-Import für Analytics:** Nicht zwingend, um Karten sofort als gelernt zu markieren, aber wertvoll für Heatmap, Retention und Migration.

### P2: Optional, nur wenn Produktnutzen klar ist

- **Optional reversed und selective generation:** Nützlich, aber CoRe kann das produktfreundlicher über Variantenregeln ausdrücken.
- **Filtered Decks:** Besser als temporäre Review-Sessions oder Lernplan-Views modellieren, nicht als permanente Deck-Art.
- **Deck-Presets:** Relevant bei Power-Usern; im MVP reicht ein kleines Set verständlicher Deck-Settings.
- **Field-Optionen:** RTL, Plain Text, Sticky, Browser-Font usw. nur übernehmen, wenn importierte Decks oder Zielgruppen es wirklich brauchen.

### Nicht blind übernehmen

- Vollständige Ausführung beliebiger Anki-Templates mit JS/CSS.
- Legacy-Scheduler-Modi.
- `graves`, Sync-Interna und Add-on-Kompatibilität.
- Image Occlusion vor einem eigenen Medien-/Bildregionen-Konzept.
- APKG als interne Persistenzform.
- Alle historischen Deck-Options-Schalter.

## Ist Ankis Format grundsätzlich sinnvoll?

Ja, als Konzept. Nein, als direktes CoRe-Datenmodell.

Sinnvoll sind:

- Trennung von Inhalt und Review-Einheit.
- Mehrere Cards pro Note mit unabhängigem Scheduling.
- Templates als Wiederverwendungsmechanismus.
- Decks als Studiencontainer statt Inhaltscontainer.
- Review-Historie als eigene Tabelle.
- Medien außerhalb der eigentlichen Kartendaten.

Problematisch für CoRe wären:

- Historisch gewachsene SQLite-/JSON-/Protobuf-Mischung.
- Implizite Bedeutung in HTML-Templates statt expliziter fachlicher Struktur.
- Deck-Hierarchie über Namen statt echte Baumkanten.
- Sicherheits- und Performance-Risiken durch beliebige Template-Medien, HTML, CSS und potenziell Skripte.
- Komplexes Reimport-Verhalten, wenn Notetypes und Felder nachträglich geändert werden.
- Viele Features, die für Anki-Kompatibilität wichtig sind, aber CoRes Produktkern vernebeln würden.

Empfehlung: Anki bleibt Austauschformat und Lernvorbild. CoRe bleibt kanonisch bei einem expliziten Modell:

- `decks`
- `learning_items`
- `card_variants`
- `variant_scheduler_state`
- `review_events`
- `source_anchors`
- `media_assets`
- `import_identities`
- `template_snapshots`

## Prioritätsliste für CoRe

1. **APKG-Reimport absichern:** GUID-/Template-/Deck-Mapping, lokale Edits, Medien und Original-Variantenanker müssen stabil bleiben.
2. **Cloze-Import vertiefen:** Cloze nicht nur als Text anzeigen, sondern als Variantenfamilie mit eigenem Review-State abbilden.
3. **Medienmodell produktionsfähig machen:** Browser-Speicher ist für MVP okay; produktiv braucht es Object Storage, stabile URLs und Garbage Collection.
4. **Notetype-Snapshots speichern:** Nicht alle Template-Features rendern, aber genug konservieren, um Reimport, Debugging und späteren Export zu ermöglichen.
5. **Review-State und Revlog trennen:** Aktueller Zustand für Queue, Events für Historie und Analyse.
6. **Deck-Konfiguration vereinfachen:** Neue Karten pro Tag, Reviews pro Tag, Desired Retention, CoRe-Modus, Variantenregeln. Mehr erst nach Nutzerbedarf.
7. **Große APKGs messen:** Erst reale Decks importieren und Engpässe messen, dann über Worker, WASM oder Serververarbeitung entscheiden.

## Performance, Mikroservice, WASM oder Elixir

Die relevante Frage ist nicht nur "Welche Sprache ist schneller?", sondern "Wo liegt der Engpass?"

Wahrscheinliche Engpässe bei CoRe:

- große APKGs entpacken
- Zstd-Dekompression
- SQLite lesen
- viele Medien extrahieren, hashen und persistieren
- HTML sanitizen und Medienreferenzen ersetzen
- Review-Queues über große Decks bilden
- Suche, Graph, Assistent und spätere KI-Jobs

### JavaScript/TypeScript behalten

Für UI, Modulinterfaces, Produktlogik und Tests bleibt JS/TS sinnvoll. Die aktuelle Codebase ist ein React/Vite-MVP, und die meisten Produktentscheidungen sind noch fachlich, nicht CPU-limitiert. Heavy Work sollte aber in Web Worker oder Serverjobs verschoben werden, sobald echte Deckgrößen Probleme zeigen.

### WASM, bevorzugt Rust, als gezielter Beschleuniger

WASM ist sinnvoll für klar abgegrenzte CPU-Arbeit im Browser:

- APKG-Parsing
- Zstd/SQLite-Hotpaths
- Medien-Hashing
- große Import-Normalisierung
- ggf. FSRS-Berechnungen oder Suchindex-Builds

Rust wäre hier naheliegend, weil Anki selbst große Teile des Kerns in Rust hat und die Ökosystemlage für Zstd, SQLite, Parsing und WASM gut ist. Der beste Schnitt wäre kein Rewrite der App, sondern ein kleines Import-/Parsing-Modul mit JS-API und Worker-Ausführung.

### Mikroservice erst bei echtem Bedarf

Ein separater Import- oder Job-Service lohnt sich, wenn Browser-Importe bei großen Decks, medienreichen APKGs oder KI-Verarbeitung an Grenzen stoßen. Dann kann ein Service:

- Uploads streamen
- APKGs serverseitig entpacken
- Medien in Supabase Storage oder Object Storage schreiben
- DB-Zeilen direkt erzeugen
- Fortschritt und Abbruch unterstützen

Vorher sollte CoRe die Modulgrenzen im bestehenden Code schärfen, aber keinen generischen Service nur auf Verdacht bauen.

### Elixir nur für orchestration-heavy Backend

Elixir ist stark für Nebenläufigkeit, lange Jobs, PubSub, Live-Fortschritt, Queues und robuste Hintergrundverarbeitung. Für reine CPU-Hotpaths wie Dekompression, SQLite-Parsing und Hashing ist es nicht die erste Wahl; dort bräuchte man ohnehin Rust-NIFs, Ports oder externe Worker.

Elixir wäre interessant, wenn CoRe später stark serverseitig wird:

- viele parallele Imports
- kollaborative Community-Workflows
- Realtime-Fortschritt
- langlebige KI-Job-Orchestrierung
- eigene Sync- oder Presence-Infrastruktur

Für den aktuellen Pfad mit Vercel, Supabase und lokalem MVP ist Elixir kein P0. Es wäre eine spätere Backend-Strategie, nicht die Antwort auf das Kartenformat.

## Architekturentscheidung

Kurzentscheidung:

- **Nicht:** Anki-Dateiformat intern kopieren.
- **Ja:** Ankis Note/Card/Deck/Revlog-Trennung in CoRe-Begriffen weiterführen.
- **Ja:** APKG-Kompatibilität an der Importgrenze verbessern.
- **Ja:** große Importarbeit als Worker-fähiges Modul kapseln.
- **Vielleicht:** Rust/WASM für Import-Hotpaths nach Messung mit echten Decks.
- **Später:** Mikroservice für große Imports, Medienpersistenz und KI-Jobs.
- **Nicht jetzt:** Elixir als Performance-Lösung.

## Nächste konkrete Arbeitspakete

1. APKG-Fixtures erweitern: Basic reversed, optional reversed, Cloze, Medien, ungewöhnliche Notetypes und echte `collection.anki21b`-Pakete.
2. Import-Metadaten im CoRe-Modell prüfen: GUID, ursprüngliche IDs, Template-Ordinal, Notetype-Snapshot, Deck-Pfad und Medienprüfsummen.
3. Cloze als eigene Variantenfamilie modellieren.
4. Medienmodell aus dem lokalen Browserpfad auf spätere Storage-Referenzen vorbereiten.
5. Ein kleines Benchmark-Dokument anlegen: Deckgröße, Medienanzahl, Importdauer, Speicherverbrauch, Browser-Hänger.
6. Danach entscheiden, ob ein Rust/WASM-Spike für APKG-Parsing gerechtfertigt ist.
