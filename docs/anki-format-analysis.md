# Anki-Formatanalyse für CoRe

Stand: 2026-07-07

Diese Analyse bewertet das offizielle Open-Source-Repository `ankitects/anki`, das Anki-Manual und den aktuellen CoRe-Codebase-Stand. Ziel ist keine vollständige Reimplementation von Anki, sondern eine rigorose Produkt- und Architekturentscheidung: Welche Karten-, Stapel- und Paketideen sollten in CoRe zum Kernmodell werden, welche nur importiert oder konserviert werden, und welche sollten bewusst draußen bleiben?

## Kurzentscheidung

Ankis wichtigste Modellentscheidung ist stark und sollte CoRe prägen: Inhalt, Darstellung, Review-Einheit, Lernzustand, Organisation und Medien sind getrennt.

- `Note`: fachlicher Inhaltsdatensatz mit Feldern und Tags.
- `Notetype`: Feldschema, Templates, CSS und Regeln zur Kartengenerierung.
- `Card`: konkrete reviewbare Einheit mit eigenem Deck, eigener Queue, eigenem Intervall und eigener Review-Historie.
- `Deck`: Studien- und Organisationscontainer für Cards, nicht der eigentliche Besitzer fachlicher Inhalte.
- `Revlog`: append-only Verlauf der Review-Ereignisse.
- `Media`: externe Dateien, auf die Felder, Templates oder CSS verweisen.

CoRe sollte diese Trennung übernehmen, aber Ankis gewachsene Speicherformen nicht intern kopieren. APKG, SQLite, Protobuf, Legacy-JSON, Zstd und Template-HTML bleiben Import-/Exportdetails hinter einem tiefen Importmodul. Das kanonische CoRe-Modell bleibt explizit:

- `decks`
- `learning_items`
- `note_type_definitions`
- `learning_item_source_snapshots`
- `card_variants`
- `variant_scheduler_state`
- `review_events`
- `media_assets`
- `source_anchors`
- `import_identities`

Templates und ihre Rohkonfiguration gehören damit in versionierte Notetype-Definitionen statt in eine zweite Darstellungswahrheit.

Kernaussage: Anki ist für CoRe Vorbild an der Modellgrenze, aber nicht das interne Datenformat.

## Quellenbasis

Primärquellen:

- Anki-Repository: https://github.com/ankitects/anki
- Anki-Manual, Grundbegriffe: https://docs.ankiweb.net/getting-started.html
- Anki-Manual, lokale Dateien: https://docs.ankiweb.net/files.html
- Anki-Manual, Templates: https://docs.ankiweb.net/templates/intro.html
- Anki-Manual, Kartengenerierung: https://docs.ankiweb.net/templates/generation.html
- Legacy-SQLite-Schema: https://github.com/ankitects/anki/blob/main/rslib/src/storage/schema11.sql
- Protobuf-Modelle: `proto/anki/cards.proto`, `notes.proto`, `decks.proto`, `notetypes.proto`, `import_export.proto`
- APKG-Paket-Metadaten: `rslib/src/import_export/package/meta.rs`
- APKG-Medienhandling: `rslib/src/import_export/package/media.rs`

Aktueller Online-Stand des Repositorys am 2026-07-07:

- Latest Release: `26.05` vom 2026-06-16.
- Dominante Sprachen laut GitHub: Rust, Python, MDX, TypeScript, Svelte.
- Relevante Ordner: `rslib`, `proto`, `pylib`, `qt`, `ts`, `docs-site`.

Lokale CoRe-Quellen:

- `docs/specs.md`
- `docs/todo.md`
- `src/coreModel.ts`
- `src/apkgImport.ts`
- `src/importService.ts`
- `src/mediaStore.ts`
- `src/htmlSafety.ts`
- `src/richText.ts`
- `src/reviewService.ts`
- `src/scheduler.ts`
- `supabase/migrations/20260817190000_prerelease_replica_v2_baseline.sql`

TODO-Markdown-Inventar: Aktuell existiert genau `docs/todo.md`. Die Anki-bezogenen naechsten Arbeitspakete in dieser Analyse sollen dort priorisiert werden, statt eine zweite TODO-Datei aufzubauen.

## Anki-Istmodell

### Decks

Im Manual ist ein Deck eine Gruppe von Karten. Unterstapel werden über Namen mit `::` ausgedrückt, etwa `Chinese::Hanzi`. Ein Elternstapel bezieht beim Lernen Karten aus Unterstapeln ein. Decks können unterschiedliche Lernoptionen haben, etwa neue Karten pro Tag oder Wiederholungsgrenzen.

Technisch sind Decks nicht der fachliche Inhaltsbesitzer. Eine Note liegt global in der Collection, und die daraus erzeugten Cards können in unterschiedlichen Decks landen. Das ist besonders wichtig bei Template-Deck-Overrides: Ein Kartentemplate kann erzeugte Cards in ein anderes Deck legen als das beim Hinzufügen gewählte Standarddeck.

Die moderne Protobuf-Schnittstelle modelliert Decks mit:

- `id`
- `name`
- Study-/Browser-Zuständen
- `normal` oder `filtered` als Deck-Art
- Deck-Konfiguration, Beschreibung, Tageslimits und optionaler Desired-Retention-Override

Rigorose CoRe-Folgerung: Decks sind Studiencontainer. Sie dürfen nicht die einzige Quelle für fachlichen Inhalt werden. CoRe sollte intern echte Parent-/Child-IDs behalten und `::` nur als importierte Hierarchiecodierung verstehen.

### Notes, Notetypes und Cards

Anki trennt den fachlichen Inhalt von der reviewbaren Karte:

- Eine Note enthält `id`, `guid`, `notetype_id`, Änderungsdaten, Tags und `fields`.
- Ein Notetype enthält die Struktur dieser Felder, Templates, CSS, Kartengenerierungsregeln und den Typ `normal` oder `cloze`.
- Eine Card enthält `note_id`, `deck_id`, `template_idx`, Queue, Fälligkeit, Intervall, Ease-Faktor, Reps, Lapses, Flags und inzwischen optional FSRS-Memory-State, Desired Retention, Decay und letzte Review-Zeit.

Der Inhalt einer Card ist damit nicht einfach `front/back`. Die Anzeige wird aus Note-Feldern plus Template gerendert. Ein fachlicher Fehler in einem Feld wird einmal korrigiert und wirkt auf alle daraus generierten Cards.

Rigorose CoRe-Folgerung: CoRes `Learning Item` entspricht eher Ankis `Note`; CoRes `Card Variant` entspricht eher Ankis reviewbarer `Card`. Die lokale Compatibility-Collection `deck.cards[]` darf bleiben, muss aber fachlich weiter als Learning-Item-Sammlung behandelt werden.

### Templates und Stock-Formate

Anki-Templates steuern, welche Felder auf Vorder- und Rückseite erscheinen und welche Karten erzeugt werden. Templates sind HTML, Styling ist CSS. Notetypes kennen Felder und Templates, inklusive Anforderungen für bedingte Kartengenerierung.

Offizielle Stock-Notetypes umfassen unter anderem:

- Basic
- Basic and Reversed
- Basic optional reversed
- Basic typing
- Cloze
- Image Occlusion

Rigorose CoRe-Folgerung: CoRe konserviert vollständige Template-Snapshots und übersetzt dokumentierte statische Semantik in einen eigenen sicheren Renderer. Script, externe Ressourcen und Add-on-Filter werden nicht ausgeführt; die Definition bleibt für Reimport, Debugging und späteren Export unverändert erhalten.

### Review und Revlog

Anki speichert Review-Ereignisse in `revlog`. Das Legacy-Schema hält pro Ereignis unter anderem `cid`, `ease`, `ivl`, `lastIvl`, `factor`, `time` und `type`. Cards haben zusätzlich aktuellen Scheduler-Zustand.

Rigorose CoRe-Folgerung: CoRe sollte aktuellen Zustand und Ereignisverlauf strikt trennen. `review_events` bleiben append-only. Der aktuelle Queue-/Scheduler-Zustand gehört in einen eigenen State pro Learning Item und pro Variante.

Der APKG-Leser setzt diese Trennung um: zuordenbare, nicht manuelle `revlog`-Zeilen werden als kompakte Analysehistorie durch Preview und Worker transportiert, anhand der bestehenden Anki-Kartenidentität auf finale CoRe-Varianten abgebildet und per deterministischer Ereignis-ID vereinigt. Bewertung, Zeitstempel, Antwortzeit, Intervall und Herkunft werden normalisiert; beschädigte oder nicht zuordenbare Zeilen werden gezählt und übersprungen. Getrennt davon wird der anfängliche aktuelle Zustand pro Card versioniert angenähert: gültiger moderner FSRS-Memory-State, sonst chronologisches Revlog-Replay, sonst klassischer Kartenstatus und schließlich eine neue Karte. Nach dem ersten CoRe-Review übernimmt ausschließlich FSRS-6.

### APKG, Collection und Medien

Anki speichert lokale Profilinhalte in `collection.anki2`; Medien liegen separat in `collection.media`. APKG-Dateien bündeln Collection, Medien und Metadaten.

Aktuelle Paketvarianten laut Anki-Code und verifizierter CoRe-Fixture:

- Legacy 1: `collection.anki2`, Schema V11
- Legacy 2: `collection.anki21`, Schema V11
- Latest: `collection.anki21b`, Schema V18, Zstd-komprimiert

CoRe liest den modernen V18-Pfad ohne Anki-Runtime: `decks` und `notetypes` liegen in normalen Tabellen, `fields` und `templates` in `WITHOUT ROWID`-Index-B-Bäumen. Diese vier Tabellen werden hinter `src/apkgImport.ts` in dieselbe private Model-Form wie Legacy-`col.models` normalisiert. Die bekannten Notetype-, Field- und Template-Konfigurationen werden mit einem bounds-sicheren Protobuf-Wire-Reader dekodiert; vollständige Raw-Bytes, 64-Bit-Werte und unbekannte Felder bleiben zusätzlich verlustfrei erhalten. Ankis nativer Deck-Trenner `U+001F` wird erst an dieser Importgrenze in `::` übersetzt. Die eingecheckte Latest-Qualitätsfixture wurde ausschließlich als Referenzartefakt mit `anki==26.5` erzeugt; App, Tests und CI übernehmen daraus keine Runtime-Abhängigkeit.

Bei modernen Paketen ist die Medienliste Protobuf-basiert; Legacy-Medien nutzen eine JSON-Hashmap wie `{"0": "bild.png"}`. Der Import normalisiert Dateinamen, prüft Sicherheit, nutzt SHA-1/Größe, dekomprimiert bei Bedarf und kopiert Medien getrennt von den Karteninhalten.

Rigorose CoRe-Folgerung: APKG ist Austauschformat, nicht Persistenzformat. ZIP, SQLite, Zstd, MediaEntries und Legacy-Mappings gehören in `src/apkgImport.ts` beziehungsweise ein späteres Import-/Worker-Modul, nicht in React und nicht in das kanonische CoRe-Datenmodell.

## CoRe-Istmodell

CoRe hat die entscheidende Richtung bereits eingeschlagen:

- `src/coreModel.ts` ist die einzige öffentliche Seam für `LearningItemDocumentV1`, unveränderliche Notetype-Definitionen, Variantenprojektion, Review-State und Compatibility-Felder.
- `src/csvFieldMapping.ts` und `src/importService.ts` normalisieren Text-, CSV-, JSON- und Tabellen-Importdaten in dynamische Learning Items mit sichtbarer Spaltenzuordnung, Parent-/Hierarchy-Feldern, stabilen Fingerprints und Duplicate-Erkennung.
- `src/apkgImport.ts` liest APKG-Container, erkennt `collection.anki2`, `collection.anki21`, `collection.anki21b`, extrahiert Notes/Cards/Decks/Media, Definitionen, Quellsnapshots, Schedulerrohzustand und Revlog-Historie, erzeugt echte Unterstapel und speichert Raw-Fallbacks.
- `src/cardPresentation.ts` kompiliert dokumentierte statische Templates einmal pro Definitionshash und rendert dieselbe sichere Präsentation für Vorschau, Kartenverwaltung und Review.
- `src/mediaStore.ts` kapselt accountgebundenen lokalen Cache, persistente Upload-Queue und Cloud-/Fallback-Auflösung; React konsumiert ausschließlich aufgelöste Medien-URLs und Status.
- `src/htmlSafety.ts` und `src/richText.ts` kapseln allowlist-basierte HTML-Sanitization, Plain-Text-Extraktion und Rich-Text-Normalisierung für Karteninhalt, Importvorschau und Review.
- `src/reviewService.ts` schreibt Review-Events und aktualisiert Learning-Item- und Varianten-State.
- `src/scheduler.ts` kapselt FSRS-6 mit Stability, Difficulty, Desired Retention, Retrievability, Variant-Kontext und Intervallvorschau für die vier Review-Buttons.
- Die frische Pre-Release-Baseline trennt `decks`, `cards`, `note_type_definitions`, `learning_item_source_snapshots`, `card_variants`, `review_events` und `source_documents`; Labs-Jobtabellen sind entfernt.

Die verbleibende Kompatibilitätsgrenze ist bewusst: Template-JavaScript, Add-on-/Custom-Filter, externe Ressourcen, native LaTeX-Toolchains und nicht browserfähige Codecs werden erhalten, aber nicht ausgeführt. APKG-Export und ein manueller Image-Occlusion-Maskeneditor folgen nicht in diesem Ausbau.

## Differentialanalyse

| Thema | Anki-Ist | CoRe-Ist | CoRe-Soll |
|---|---|---|---|
| Fachlicher Inhalt | `Note` mit Feldern, Tags, GUID und Notetype | `LearningItemDocumentV1` in `deck.cards[]` als Compatibility Collection | Dynamisches Dokument bleibt kanonisch, unabhängig von Deck-UI und Review-Variante |
| Review-Einheit | `Card` pro Note/Template mit eigenem Scheduler | stabile Template-, Cloze- und Image-Occlusion-Projektionen mit eigenem State | Jede Anki-Card bleibt separat reviewbar und am Original verankert |
| Original | Implizit über Note plus Template | `immutableOriginal` und genau eine `isOriginal`-Variante | Unveränderlicher Originalanker bleibt P0-Invariante für Import, KI und Reimport |
| Templates | HTML/CSS plus Feldersetzung und Card-Requirements | unveränderliche Definition, vollständiger Snapshot und sicherer statischer Renderer | Tier-1-Semantik gemeinsam rendern; unsichere Funktionen preserved-only |
| Cloze | Eigener Notetype, Cloze-Nummern, generierte Cards | Cloze-Gruppen und Ordinale als stabile Variantenprojektionen | Editoraktion und Importprojektion bleiben dieselbe Domänensemantik |
| Deck-Hierarchie | Namen mit `::`, Cards referenzieren Deck-ID | Echte Parent-/Child-Decks aus APKG-Hierarchie | Parent-/Child-IDs bleiben kanonisch; `::` bleibt Import-/Exportdetail |
| Filtered Decks | Temporäre Deck-Art mit Suche, Limits und Rescheduling-Optionen | Lernplan und Review-Queue lokal modelliert | Nicht als permanente Deck-Art übernehmen; als temporäre Session-/Plan-View abbilden |
| Review-Verlauf | `revlog` append-only pro Card | lokale `reviewEvents`; APKG-Revlog wird analytisch dedupliziert | Analytics-Verlauf append-only halten und getrennt vom aktuellen State behandeln |
| Scheduler | Legacy-State plus FSRS-Felder | versionierte Initialmigration, danach FSRS-6 über `ts-fsrs` | direktes FSRS, Revlog-Replay und SM-2-Fallback diagnostizieren; Rohquelle erhalten |
| Medien | Separater Medienordner, APKG-Medienliste, SHA-1, sichere Dateinamen | Manifest, accountgebundene IndexedDB/Queue, accountweite SHA-1-Objekte, getrennte `media_assets`-Referenzen, Standard-/TUS-Upload und Cloud-/Local-/Missing-Auflösung | Export-/Sharing-Regeln und administratives Orphan-GC ergänzen |
| Importidentität | Notes via GUID, Cards via Note/Template, Notetypes via IDs | `sourceExternalId`, Importgruppe, Raw-Metadaten, Fingerprints | Explizites `import_identities`-Konzept für Note-ID, Card-ID, GUID, Notetype-ID, Template-Ord, Deck-Pfad und Medienchecksums |
| Reimport | Update/Merge/Duplicate-Optionen | Dreiwege-Feldmerge mit expliziten Konflikten und unveränderlichen Snapshots | lokale Edits und Reviewidentität weiter schützen |
| Stock-Formate | Basic, Reverse, Optional Reverse, Typing, Cloze, Image Occlusion | dynamische Felder, Review-Rezepte und importierte IO-Projektionen | manuellen IO-Maskeneditor separat ausbauen |
| Add-ons/Interna | Add-on-Ökosystem, Sync-Interna, `graves` | Nicht vorhanden | Nicht übernehmen; würde CoRe-Komplexität erhöhen ohne Kernnutzen |

## Differenzanalyse

### P0: Kernmodell absichern

- **Learning Item statt flacher Karte:** CoRe soll fachlichen Inhalt, Original und Varianten weiterhin trennen. Ein React-Caller sollte nie APKG-, Template- oder Scheduler-Details zusammensetzen müssen.
- **Genau eine Original-Variante:** Jede Import-, KI- und manuelle Erstellung muss genau eine `isOriginal: true`-Variante erzeugen. Nicht-originale Varianten müssen auf diese Originalvariante zeigen.
- **Per-Variante Scheduler-State:** Reverse-, Cloze-, KI- und CoRe-Varianten brauchen eigene Fälligkeit, Performance und Fehlerhistorie. Das vermeidet, dass eine leichte Rephrase den Originalfortschritt verfälscht.
- **Append-only Review Events:** Reviewdaten gehören als Ereignisse gespeichert, nicht nur als überschreibbarer Zustand. Der aktuelle State ist eine Projektion.
- **Stabile Importidentität:** CoRe konserviert diese Werte versioniert als `ankiImportIdentityV1` in vorhandenen Card-/Varianten-JSONB-Metadaten. Notes werden beim Reimport in der Reihenfolge GUID, Legacy-Note-ID und Fingerprint wiedererkannt; Varianten in der Reihenfolge Card-ID, GUID plus Template-Ordinal, Legacy-Card-ID und lokale ID. GUID ist damit stabiler Primärschlüssel, während geänderte Anki-Note-/Card-IDs als aktualisierte Importmetadaten erhalten bleiben. Media-Checksums bleiben im Medienmanifest beziehungsweise in `MediaAssetReference.sha1`.
- **Explizite Deck-Hierarchie:** Ankis `::`-Namen werden beim Import in echte Parent-/Child-Decks übersetzt. Intern sollte CoRe keine Baumstruktur aus Strings rekonstruieren müssen.
- **Medien als Assets:** Dateiname, SHA-1, Größe, MIME-Typ, Storage-Referenz und Fundstelle gehören in `MediaAssetReference` hinter `mediaStore`. Physische Objekte sind accountweit unter `{userId}/objects/{sha1}` adressiert; React kennt weder Pfadbildung noch APKG-Manifeste.

### P1: Nächste Ausbaustufe

- **Kompatibilitätskorpus verbreitern:** Weitere reale Notetypes, Filterketten, MathJax-, Font-, Audio-/Video- und Image-Occlusion-Fixtures gegen eine gepinnte offizielle Anki-Version differenziell prüfen.
- **Konflikt- und Diagnosen-UI vertiefen:** Große Definitionen, entfernte extern bearbeitete Felder und mehrere gleichzeitige Reimportkonflikte kompakt und vollständig auflösen lassen.
- **Produktive Medienpersistenz:** Cloud-first mit lokalem reloadfestem Pending-Fallback ist umgesetzt. Offen bleiben Medienexport/-sharing sowie globales administratives Orphan-GC.
- **Importbericht schärfen:** Der Nutzer sollte sehen, welche Decks, Notetypes, Templates, Medien, Cloze-Gruppen und Scheduling-Daten erkannt, übernommen, konserviert oder bewusst ignoriert wurden.

### P2: Optional und nutzergetrieben

- **Optional Reversed und selective generation:** Nützlich, aber CoRe kann es verständlicher über Variantenregeln ausdrücken.
- **Filtered-Deck-Äquivalent:** Nicht als permanente Deck-Art bauen. Besser als temporäre Review-Session, Lernplan-View oder Such-/Filterqueue.
- **Deck-Presets:** Für Power-User relevant, aber im MVP reichen wenige klare Deck-Settings: neue Karten pro Tag, Review-Limit, Desired Retention, CoRe-Modus und Variantenregeln.
- **Field-Optionen:** RTL, Plain Text, Sticky Fields, Browser-Font und ähnliche Details nur übernehmen, wenn importierte Zieldecks oder Nutzergruppen es wirklich brauchen.
- **APKG-Export:** Später wertvoll für Vertrauen und Portabilität, aber nach Importstabilität, Medienmodell und Template-Snapshots.

### Nicht implementieren

- **Beliebige Anki-Template-Ausführung mit JavaScript:** Zu riskant für Sicherheit, Performance und Produktklarheit. Sicheres statisches HTML/CSS wird kontrolliert gerendert; Script bleibt preserved-only.
- **Legacy-Scheduler-Modi:** CoRe braucht keinen vollständigen historischen Scheduler-Zoo. Importierte Schedulerdaten bleiben Quelle, nicht Systemkern.
- **Add-on-Kompatibilität:** Würde CoRe an Ankis Erweiterungsmodell fesseln, ohne CoRes Kernproblem zu lösen.
- **`graves` und Sync-Interna:** Für Anki-Sync wichtig, für CoRe-Persistenz und Supabase/RLS nicht der richtige Abstraktionskern.
- **APKG als interne Persistenzform:** APKG ist ein Austauschpaket. CoRe braucht echte Tabellen, Assets, Events und Jobs.
- **Manueller Image-Occlusion-Maskeneditor:** Import und Review vorhandener Masken sind getrennt davon möglich; das Erstellen und freie Bearbeiten benötigt später ein eigenes Bildregionenmodell.
- **Alle historischen Deck-Options-Schalter:** Power-User-Flexibilität darf nicht das MVP-Interface dominieren.

## Karten- und Stapelformate für CoRe

### Sollte CoRe als Kernformate unterstützen

- **Basic:** Der kleinste, stabile Kern für manuelle Erstellung, CSV/Text-Import, KI-Drafts und APKG-Fallbacks.
- **Reverse:** Als nicht-originale Variante mit eigenem Scheduler-State, nicht als zweite unabhängige Kopie.
- **Cloze:** Als Editoraktion und Variantenfamilie mit stabilen Gruppen, nicht als nötige vorgeschaltete Kartentypwahl.
- **Multiple Choice und Free Text:** Produktseitig sinnvoll, aber weiterhin selbstbewertet mit dem normalen Again/Hard/Good/Easy-Scheduler.
- **Case Vignette / kontextualisierte Variante:** CoRe-spezifisch und langfristig wertvoll, aber erst nach stabiler Variantengenerierung und Quellenankern.
- **Multi-field Import Item:** Für Anki-Kompatibilität wichtig, intern aber als Learning Item mit Feldschema-Snapshot und reviewbaren Varianten.

### Sollte CoRe als Importdetails konservieren

- Notetype-Name und ursprüngliche Notetype-ID.
- Feldnamen, Feldreihenfolge und Rohfelder.
- Template-Name, Template-Ordinal, Front-/Back-Template und CSS.
- Deck-Pfad aus Anki inklusive `::`.
- Anki-Card-ID, Note-ID, GUID und Template-Ordinal.
- Media-Mapping, normalisierte Dateinamen, SHA-1, Größe und fehlende Medien.
- Scheduler-Rohdaten und Revlog, wenn importiert.

### Sollte CoRe anders modellieren als Anki

- Decks als echte Baumknoten statt nur hierarchische Namen.
- Filtered Decks als temporäre Session-/Planungsprojektionen.
- Optional Reverse als Variantenregel.
- Notetype-Wechsel als kontrollierten Import-/Edit-Vorgang, nicht als direkte Template-Operation im UI.
- Scheduling als gekapselte FSRS-6-Projektion mit importierten Anki-Daten als Quelle.

## Sprach- und Infrastrukturentscheidung

Die richtige Frage ist nicht: "Welche Sprache ist schneller?", sondern: "Welche Arbeit gehört in welches tiefe Modul, und wo liegt der reale Engpass?"

### JavaScript/TypeScript bleibt Kern für Produktlogik

JS/TS ist für den aktuellen CoRe-Pfad richtig:

- React/Vite UI
- lokale Modulinterfaces
- Creation Pipeline
- Review-Service
- Scheduler-Projektionen
- Variantenauswahl
- Import-Orchestrierung
- Tests mit `node:test`

Die meisten aktuellen Entscheidungen sind fachlich und modellbezogen, nicht CPU-limitiert. Ein Rewrite würde Geschwindigkeit vortäuschen und Produktwissen zerstreuen.

### Supabase/Postgres bleibt Persistenzanker

Supabase/Postgres passt für den ersten produktiven Pfad:

- echte Tabellen statt Store-Blob
- RLS für Nutzerisolation
- append-only `review_events`
- getrennte `decks`, `cards` beziehungsweise Learning Items, `card_variants`, Dokumente und Jobs
- JSONB für flexible Metadaten, Importrohdetails, Template-Snapshots und Versionseinträge

Rigorose Einschränkung: Keine weiteren produktiven Migrationen auf Verdacht. Erst muss das lokale Learning-Item-/Variantenmodell gegen das SQL-Schema abgeglichen werden.

### Vercel reicht für MVP-Serverpfade

Vercel ist ausreichend für:

- statisches Vite-Hosting
- Preview/Production
- eigene `/api/*` Functions
- KI-Proxy-Routen
- kleinere Import-/Validierungsendpunkte

Vercel Functions sind nicht die erste Wahl für sehr große, lang laufende APKG-Imports mit vielen Medien. Dafür braucht es später Worker, Queue oder separaten Importdienst.

### Rust/WASM gezielt prüfen

Rust ist plausibel, aber nur als gezielter Beschleuniger nach Messung. Es passt besonders gut zu:

- Zstd-Dekompression
- SQLite/APKG-Hotpaths
- Medien-Hashing
- großer Import-Normalisierung
- Suchindex-Builds
- eventuell FSRS-Berechnung, falls der JS-Pfad messbar limitiert

Der richtige Schnitt wäre ein kleines Import-/Parsing-Modul mit JS-Interface, ausführbar in Web Worker oder serverseitig. Kein App-Rewrite, keine breite Rust-Domänenschicht.

### Elixir nicht als Performance-Antwort

Elixir ist stark für Nebenläufigkeit, langlebige Prozesse, PubSub, Realtime-Fortschritt, Queues und robuste Job-Orchestrierung. Für CPU-Arbeit wie Dekompression, SQLite-Parsing und Hashing ist Elixir nicht die primäre Antwort; dort bräuchte man ohnehin Rust-NIFs, Ports oder externe Worker.

Elixir wäre später interessant, wenn CoRe stark serverseitig wird:

- viele parallele Imports
- kollaborative Community-Workflows
- Realtime-Importfortschritt
- langlebige KI-Job-Orchestrierung
- eigene Sync-Infrastruktur
- Presence oder Live-Kollaboration

Für den aktuellen Vercel/Supabase-Pfad ist Elixir kein P0 und kein P1. Es ist eine spätere Backend-Strategie, nicht die Lösung für Kartenformate.

### Entscheidmatrix

| Arbeit | Jetzt | Später, wenn gemessen nötig | Nicht sinnvoll |
|---|---|---|---|
| UI und Review-Flows | JS/TS | - | Rust/Elixir |
| Learning-Item-Modell | JS/TS + Postgres-Schema | - | APKG intern |
| Kleine API-Routen | Vercel Functions | - | eigener Service auf Verdacht |
| Große APKGs | JS-Modul, Browsergrenzen, Messung | Worker, Rust/WASM, Importdienst | React-Caller mit ZIP/SQLite-Details |
| Medienpersistenz | lokale Manifest-/URL-Auflösung | Supabase Storage/Object Storage | Base64 in Kartenfeldern |
| Realtime-Jobs | lokale Job-Projektion | Queue, eventuell Elixir/Phoenix | Elixir für reine CPU-Hotpaths |

## Nächste Arbeitspakete

1. **Golden Corpus verbreitern:** Weitere Legacy-/V18-Pakete, Notetypes, Filter, Medien, Fonts, MathJax und Image Occlusion differenziell gegen eine gepinnte Anki-Version prüfen.
2. **Kompatibilitätsdiagnosen schärfen:** Preserved-only-Funktionen und Scheduler-Migrationsmethoden nach Notetype und Variante vollständig im Importbericht bündeln.
3. **Medienmodell weiterführen:** Export, Community-Sharing und administratives Orphan-GC auf dem vorhandenen accountweiten Storage-/Referenzmodell definieren.
4. **APKG-Export und Image-Occlusion-Editor getrennt entscheiden:** Beide können auf Definitionen und Snapshots aufsetzen, gehören aber nicht zum aktuellen Import-/Review-Ausbau.

## Architekturentscheidung

- **Ja:** Ankis Note/Card/Deck/Revlog-Trennung in CoRe-Begriffen weiterführen.
- **Ja:** APKG-Kompatibilität an der Importgrenze verbessern.
- **Ja:** Learning Items, Varianten, Review-Events, Medien und Importidentitäten als tiefe Module halten.
- **Ja:** große Importarbeit Worker-fähig kapseln.
- **Vielleicht:** Rust/WASM für gemessene Import-Hotpaths.
- **Nicht im freigegebenen Core:** Ein separater Import-/Jobdienst für große Uploads oder KI-Jobs wurde entfernt und erfordert vor einer Neuaufnahme eine neue Produktentscheidung.
- **Nein:** Anki-Dateiformat intern kopieren.
- **Nein:** Template-JavaScript oder Add-on-Runtime ausführen; dokumentierte statische Templates laufen ausschließlich im sicheren Renderer.
- **Nein:** Elixir als pauschale Performance-Lösung.
