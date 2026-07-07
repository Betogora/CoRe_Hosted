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
- `card_variants`
- `variant_scheduler_state`
- `review_events`
- `media_assets`
- `source_anchors`
- `import_identities`
- `template_snapshots`

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
- `src/coreModel.js`
- `src/apkgImport.js`
- `src/importService.js`
- `src/mediaStore.js`
- `src/reviewService.js`
- `src/scheduler.js`
- `supabase/core_schema_v1.sql`

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

Rigorose CoRe-Folgerung: CoRe sollte Template-Snapshots konservieren, aber nicht beliebige Template-Ausführung als Produktkern übernehmen. Templates sind für Import, Reimport, Debugging und späteren Export wertvoll. Für den Review-Kern sollten sie in explizite CoRe-Varianten übersetzt werden.

### Review und Revlog

Anki speichert Review-Ereignisse in `revlog`. Das Legacy-Schema hält pro Ereignis unter anderem `cid`, `ease`, `ivl`, `lastIvl`, `factor`, `time` und `type`. Cards haben zusätzlich aktuellen Scheduler-Zustand.

Rigorose CoRe-Folgerung: CoRe sollte aktuellen Zustand und Ereignisverlauf strikt trennen. `review_events` bleiben append-only. Der aktuelle Queue-/Scheduler-Zustand gehört in einen eigenen State pro Learning Item und pro Variante.

### APKG, Collection und Medien

Anki speichert lokale Profilinhalte in `collection.anki2`; Medien liegen separat in `collection.media`. APKG-Dateien bündeln Collection, Medien und Metadaten.

Aktuelle Paketvarianten laut Anki-Code:

- Legacy 1: `collection.anki2`, Schema V11
- Legacy 2: `collection.anki21`, Schema V11
- Latest: `collection.anki21b`, Schema V18, Zstd-komprimiert

Bei modernen Paketen ist die Medienliste Protobuf-basiert; Legacy-Medien nutzen eine JSON-Hashmap wie `{"0": "bild.png"}`. Der Import normalisiert Dateinamen, prüft Sicherheit, nutzt SHA-1/Größe, dekomprimiert bei Bedarf und kopiert Medien getrennt von den Karteninhalten.

Rigorose CoRe-Folgerung: APKG ist Austauschformat, nicht Persistenzformat. ZIP, SQLite, Zstd, MediaEntries und Legacy-Mappings gehören in `src/apkgImport.js` beziehungsweise ein späteres Import-/Worker-Modul, nicht in React und nicht in das kanonische CoRe-Datenmodell.

## CoRe-Istmodell

CoRe hat die entscheidende Richtung bereits eingeschlagen:

- `src/coreModel.js` erzeugt Learning Items, Original-Varianten, Reverse-Varianten, Cloze-Varianten und Review-State.
- `src/importService.js` normalisiert Importdaten in Learning Items mit Varianten und stabilen Fingerprints.
- `src/apkgImport.js` liest APKG-Container, erkennt `collection.anki2`, `collection.anki21`, `collection.anki21b`, extrahiert Notes/Cards/Decks/Media, erzeugt echte Unterstapel und speichert Raw-Fallbacks.
- `src/mediaStore.js` kapselt lokale Medienauflösung; React konsumiert aufgelöste Medien-URLs.
- `src/reviewService.js` schreibt Review-Events und aktualisiert Learning-Item- und Varianten-State.
- `src/scheduler.js` hält FSRS-like State mit Stability, Difficulty, Desired Retention, Retrievability und Variant-Kontext.
- `supabase/core_schema_v1.sql` trennt bereits `decks`, `cards`, `card_variants`, `review_events`, `source_documents` und `ai_jobs`.

Die Hauptlücke ist weniger die Richtung als die Präzision: Einige Anki-Konzepte werden importiert und roh konserviert, aber noch nicht vollständig als explizite CoRe-Strukturen modelliert. Das ist für den MVP richtig, sollte aber in den nächsten Ausbaustufen gezielt geschlossen werden.

## Differentialanalyse

| Thema | Anki-Ist | CoRe-Ist | CoRe-Soll |
|---|---|---|---|
| Fachlicher Inhalt | `Note` mit Feldern, Tags, GUID und Notetype | `Learning Item` in `deck.cards[]` als Compatibility Collection | Learning Item als kanonischer fachlicher Inhalt, unabhängig von Deck-UI und Review-Variante |
| Review-Einheit | `Card` pro Note/Template mit eigenem Scheduler | Original-, Reverse-, Cloze- und CoRe-Varianten mit teils eigenem State | Jede reviewbare Variante bekommt eigenen Scheduler-/Performance-State und bleibt an genau einem Original verankert |
| Original | Implizit über Note plus Template | `immutableOriginal` und genau eine `isOriginal`-Variante | Unveränderlicher Originalanker bleibt P0-Invariante für Import, KI und Reimport |
| Templates | HTML/CSS plus Feldersetzung und Card-Requirements | Einfache Front/Back-Auflösung, Raw-Fallbacks, Metadaten | Template-Snapshot konservieren, aber Ausführung nur kontrolliert und nicht als Review-Kern |
| Cloze | Eigener Notetype, Cloze-Nummern, generierte Cards | Cloze wird erkannt und als Variantenfamilie teilweise erzeugt | Cloze-Gruppen, Ordnungen und Review-UI explizit modellieren |
| Deck-Hierarchie | Namen mit `::`, Cards referenzieren Deck-ID | Echte Parent-/Child-Decks aus APKG-Hierarchie | Parent-/Child-IDs bleiben kanonisch; `::` bleibt Import-/Exportdetail |
| Filtered Decks | Temporäre Deck-Art mit Suche, Limits und Rescheduling-Optionen | Lernplan und Review-Queue lokal modelliert | Nicht als permanente Deck-Art übernehmen; als temporäre Session-/Plan-View abbilden |
| Review-Verlauf | `revlog` append-only pro Card | lokale `reviewEvents`, Supabase-Tabelle `review_events` vorbereitet | Revlog-Import nur für Analytics/Migration, nicht automatisch als gelernter Zustand übernehmen |
| Scheduler | Legacy-State plus FSRS-Felder | FSRS-like eigener Scheduler | CoRe-Scheduler bleibt eigenständig; Anki-Schedulerdaten als Quelle konservieren |
| Medien | Separater Medienordner, APKG-Medienliste, SHA-1, sichere Dateinamen | Manifest, lokale IndexedDB/Session-Fallbacks, URL-Auflösung | Produktives `media_assets`-Modell mit Storage-Referenzen, Checksums, Löschregeln und Sharing-Sicherheit |
| Importidentität | Notes via GUID, Cards via Note/Template, Notetypes via IDs | `sourceExternalId`, Importgruppe, Raw-Metadaten, Fingerprints | Explizites `import_identities`-Konzept für Note-ID, Card-ID, GUID, Notetype-ID, Template-Ord, Deck-Pfad und Medienchecksums |
| Reimport | Update/Merge/Duplicate-Optionen | lokale Content-Edits bleiben bei Reimport erhalten | Feldschema-Änderungen, Template-Änderungen und lokale Edits deterministisch mergen |
| Stock-Formate | Basic, Reverse, Optional Reverse, Typing, Cloze, Image Occlusion | Basic, Reverse, Cloze, Multiple Choice, Free Text, Import-Fallbacks | Nur lernwirksame Formate übernehmen; Image Occlusion erst nach eigenem Bildregionen-/Medienkonzept |
| Add-ons/Interna | Add-on-Ökosystem, Sync-Interna, `graves` | Nicht vorhanden | Nicht übernehmen; würde CoRe-Komplexität erhöhen ohne Kernnutzen |

## Differenzanalyse

### P0: Kernmodell absichern

- **Learning Item statt flacher Karte:** CoRe soll fachlichen Inhalt, Original und Varianten weiterhin trennen. Ein React-Caller sollte nie APKG-, Template- oder Scheduler-Details zusammensetzen müssen.
- **Genau eine Original-Variante:** Jede Import-, KI- und manuelle Erstellung muss genau eine `isOriginal: true`-Variante erzeugen. Nicht-originale Varianten müssen auf diese Originalvariante zeigen.
- **Per-Variante Scheduler-State:** Reverse-, Cloze-, KI- und CoRe-Varianten brauchen eigene Fälligkeit, Performance und Fehlerhistorie. Das vermeidet, dass eine leichte Rephrase den Originalfortschritt verfälscht.
- **Append-only Review Events:** Reviewdaten gehören als Ereignisse gespeichert, nicht nur als überschreibbarer Zustand. Der aktuelle State ist eine Projektion.
- **Stabile Importidentität:** CoRe muss `ankiGuid`, ursprüngliche Note-ID, Card-ID, Notetype-ID, Template-Ordinal, Template-Name, Deck-Pfad, Importgruppe und Media-Checksums konservieren.
- **Explizite Deck-Hierarchie:** Ankis `::`-Namen werden beim Import in echte Parent-/Child-Decks übersetzt. Intern sollte CoRe keine Baumstruktur aus Strings rekonstruieren müssen.
- **Medien als Assets:** Dateiname, normalisierter Name, SHA-1, Größe, MIME-Typ, Storage-Referenz und Fundstelle gehören in ein Medienmodell hinter `mediaStore` beziehungsweise späterem Storage-Adapter.

### P1: Nächste Ausbaustufe

- **Cloze wirklich modellieren:** Cloze-Nummern, Cloze-Gruppen und generierte Card-Ords sollten als Variantenfamilie gespeichert werden. Der Review sollte pro Cloze-Gruppe sauber schedulen.
- **Notetype-/Template-Snapshots:** Feldnamen, Feldreihenfolge, Template-Namen, Template-Reihenfolge, Front-/Back-HTML, CSS, Card-Requirements und optionales Zieldeck sollten als Snapshot erhalten bleiben.
- **Reimport-Feldschema:** Wenn ein importierter Notetype neue Felder, geänderte Templates oder andere Ordnungen hat, muss CoRe lokale Edits erhalten und neue Importdaten kontrolliert ergänzen.
- **Revlog-Import für Analytics:** Anki-Fortschritt sollte nicht ungeprüft den CoRe-Scheduler initialisieren, aber Revlog ist wertvoll für Heatmap, Retention, Migrationsdiagnose und Vertrauen.
- **Produktive Medienpersistenz:** Browser-Speicher reicht für MVP. Produktiv braucht CoRe Object Storage, stabile Referenzen, Sync-/Exportregeln und Garbage Collection.
- **Importbericht schärfen:** Der Nutzer sollte sehen, welche Decks, Notetypes, Templates, Medien, Cloze-Gruppen und Scheduling-Daten erkannt, übernommen, konserviert oder bewusst ignoriert wurden.

### P2: Optional und nutzergetrieben

- **Optional Reversed und selective generation:** Nützlich, aber CoRe kann es verständlicher über Variantenregeln ausdrücken.
- **Filtered-Deck-Äquivalent:** Nicht als permanente Deck-Art bauen. Besser als temporäre Review-Session, Lernplan-View oder Such-/Filterqueue.
- **Deck-Presets:** Für Power-User relevant, aber im MVP reichen wenige klare Deck-Settings: neue Karten pro Tag, Review-Limit, Desired Retention, CoRe-Modus und Variantenregeln.
- **Field-Optionen:** RTL, Plain Text, Sticky Fields, Browser-Font und ähnliche Details nur übernehmen, wenn importierte Zieldecks oder Nutzergruppen es wirklich brauchen.
- **APKG-Export:** Später wertvoll für Vertrauen und Portabilität, aber nach Importstabilität, Medienmodell und Template-Snapshots.

### Nicht implementieren

- **Beliebige Anki-Template-Ausführung mit JS/CSS:** Zu riskant für Sicherheit, Performance und Produktklarheit. CoRe sollte nur sichere HTML-/CSS-Snapshots konservieren und kontrolliert rendern.
- **Legacy-Scheduler-Modi:** CoRe braucht keinen vollständigen historischen Scheduler-Zoo. Importierte Schedulerdaten bleiben Quelle, nicht Systemkern.
- **Add-on-Kompatibilität:** Würde CoRe an Ankis Erweiterungsmodell fesseln, ohne CoRes Kernproblem zu lösen.
- **`graves` und Sync-Interna:** Für Anki-Sync wichtig, für CoRe-Persistenz und Supabase/RLS nicht der richtige Abstraktionskern.
- **APKG als interne Persistenzform:** APKG ist ein Austauschpaket. CoRe braucht echte Tabellen, Assets, Events und Jobs.
- **Image Occlusion sofort:** Erst sinnvoll nach eigenem Bildregionenmodell, produktivem Medienmodell und klarer Review-UI.
- **Alle historischen Deck-Options-Schalter:** Power-User-Flexibilität darf nicht das MVP-Interface dominieren.

## Karten- und Stapelformate für CoRe

### Sollte CoRe als Kernformate unterstützen

- **Basic:** Der kleinste, stabile Kern für manuelle Erstellung, CSV/Text-Import, KI-Drafts und APKG-Fallbacks.
- **Reverse:** Als nicht-originale Variante mit eigenem Scheduler-State, nicht als zweite unabhängige Kopie.
- **Cloze:** Als eigener Typ mit Cloze-Gruppen und Variantenfamilie. Das ist für Medizin, Jura und Definitionen zu wichtig, um nur HTML-Fallback zu bleiben.
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
- Scheduling als CoRe-eigene FSRS-like Projektion mit importierten Anki-Daten als Quelle.

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
| KI-Proxy | Vercel `/api/ai/*` | Queue/Worker bei langer Laufzeit | Provider-Key im Browser |
| Realtime-Jobs | lokale Job-Projektion | Queue, eventuell Elixir/Phoenix | Elixir für reine CPU-Hotpaths |

## Nächste Arbeitspakete

1. **APKG-Fixtures erweitern:** Basic reversed, optional reversed, Cloze, Medien, ungewöhnliche Notetypes und echte `collection.anki21b`/Zstd-Beispiele.
2. **Importidentitäten prüfen:** GUID, ursprüngliche Note-/Card-ID, Template-Ordinal, Notetype-Snapshot, Deck-Pfad und Medienprüfsummen im CoRe-Modell konsolidieren.
3. **Cloze-Familien modellieren:** Cloze-Gruppen, Card-Ords, Review-State und UI-Verhalten explizit machen.
4. **Template-Snapshots speichern:** Nicht beliebig ausführen, aber genug für Reimport, Debugging und späteren Export bewahren.
5. **Medienmodell produktionsfähig machen:** Storage-Referenzen, Checksums, MIME-Typen, Export, Sharing und Löschregeln definieren.
6. **Revlog-Import als Analytics-Spike:** Anki-Reviewverlauf lesbar machen, aber nicht ungeprüft als CoRe-Lernzustand übernehmen.
7. **Benchmark-Dokument anlegen:** Deckgröße, Medienanzahl, Importdauer, Speicherverbrauch, UI-Hänger und Abbruchverhalten messen.
8. **Rust/WASM-Spike nur nach Messung:** Erst reale Engpässe nachweisen, dann ein enges Import-Hotpath-Modul bauen.

## Architekturentscheidung

- **Ja:** Ankis Note/Card/Deck/Revlog-Trennung in CoRe-Begriffen weiterführen.
- **Ja:** APKG-Kompatibilität an der Importgrenze verbessern.
- **Ja:** Learning Items, Varianten, Review-Events, Medien und Importidentitäten als tiefe Module halten.
- **Ja:** große Importarbeit Worker-fähig kapseln.
- **Vielleicht:** Rust/WASM für gemessene Import-Hotpaths.
- **Später:** separater Import-/Jobdienst für große Uploads, Medienpersistenz und lange KI-Jobs.
- **Nein:** Anki-Dateiformat intern kopieren.
- **Nein:** beliebige Anki-Templates ausführen.
- **Nein:** Elixir als pauschale Performance-Lösung.
