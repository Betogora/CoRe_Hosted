# CoRe-Verlauf

**Rolle:** einzige kanonische Quelle für abgeschlossene Arbeit, datierte Abnahmen, Release-IDs und Smoke-Protokolle.
**Stand:** 2026-10-09

Der Verlauf ist kein Produktvertrag und keine Roadmap. Aktuelles Verhalten steht in [`status.md`](status.md), offene Arbeit in [`todo.md`](todo.md).

## 2026-10-10 — Hosted-Smoke nach Phase 4, 7, 8 und K7.4

- `npm run test:beta:hosted` gegen `https://core-hosted.vercel.app` mit dem
  Production-Deployment von `42d4cbd` (Vercel fertig 10:38 UTC) und der
  angewandten Migration `20261010093049`: 10 von 10 bestanden in 1,5 min.

## 2026-10-10 — Zähler mit Begraben (K7.4)

- Entscheidung des Nutzers: Die Zähler ziehen Geschwister heute beantworteter
  Inhalte ab (wie Ankis Begraben bei der Antwort); das Begraben unter zwei noch
  unbeantworteten Geschwistern bleibt der Queue vorbehalten.
- Lokal: `listDeckSummaries` liest bei vollständigem Katalog die heutigen
  Antworten, deren Geschwister über den Katalogindex `noteId` und zieht
  begrabene neue, fällige und tagesübergreifende Lernkarten von den Tageszahlen
  ab; ohne aktive Option wird nichts zusätzlich gelesen. Der Bestand (Donut)
  bleibt unverändert.
- Server: Die additive Migration `20261010093049_bury_siblings_in_day_counts.sql` ersetzt
  `get_account_bootstrap`; die Übersicht für Geräte mit unvollständigem Katalog
  zieht dieselben Geschwister ab. Lokal und am 2026-10-10 per `supabase db push`
  im Pre-Release-Projekt `CoRe-Database` angewandt; `verify_schema_v1.sql` gegen
  das Projekt grün.
- Nachweise: IndexedDB-Test (Stapel A verliert ein neues Geschwister nur, wenn
  der Stapel der Antwort begräbt), RLS-Test der Bootstrap-Übersicht,
  `test:rls:local` mit Schema-Prüfung und Typdrift, `gate:push`.

## 2026-10-10 — Gesamtabnahme der Kartenmodell-Roadmap (Phase 8)

Technisch abgeschlossen; offen bleiben nur die Gerätenachweise (Phase 3) und die
Korpusabnahme mit AnKing und echtem Lernstand (Phase 5). K7.4 ist inzwischen
umgesetzt (siehe oben).

- **K8.1:** Auf `main` (`d9f9320`) sind `npm test`, `gate:push` und
  `gate:nightly` grün: Quality, RLS 10/10 und 17/17, vollständige lokale
  Browser-Suite 110 bestanden (das Beta-Auth-Artefakt läuft planmäßig separat
  und besteht), APKG-Benchmark. `performance:measure:local` auf identischem Code
  besteht alle Gates.
- **K8.2 Vergleich mit der Ausgangsmessung (K0.1, 2026-10-06):**

  | Speicher je 1.000 Inhalte (MiB) | Postgres vorher → jetzt | Sync | Browser-Kartenkörper | Lernfenster 50 Karten (KiB) |
  | --- | ---: | ---: | ---: | ---: |
  | APKG Basic | 4,87 → 2,90 | 4,66 → 3,36 | 4,35 → 2,03 | 223 → 104 |
  | APKG Basic und umgekehrt | 10,60 → 4,16 | 9,77 → 4,63 | 9,16 → 3,15 | 235 → 81 |
  | APKG Lückentext (4 Lücken) | 23,84 → 7,46 | 23,95 → 7,15 | 22,72 → 4,96 | 291 → 63 |
  | Manuell Basic | 4,46 → 2,28 | 4,07 → 2,62 | 3,77 → 1,93 | 193 → 99 |
  | Manuell Basic und umgekehrt | 9,20 → 3,49 | 8,16 → 3,85 | 7,57 → 3,02 | 194 → 77 |
  | Manuell Lückentext (4 Lücken) | 22,46 → 6,49 | 21,56 → 6,15 | 20,37 → 4,75 | 261 → 61 |

  Postgres enthält jetzt Inhalte, Karten, Katalog und bei APKG die rohen
  Anki-Felder (0,49 bis 0,65 MiB); der Inhalt liegt einmal statt je Karte.

  | Start (p75 / p95) | vorher | jetzt |
  | --- | ---: | ---: |
  | Neues Gerät bis Dashboard | 3.959 / 4.187 ms | 2.574 / 2.618 ms |
  | Wiederkehrender Start | 928 / 954 ms | 490 / 531 ms |
  | Offline-Kaltstart | 677 / 706 ms | 490 / 516 ms |
  | Start ohne Service Worker | 1.435 / 1.456 ms | 1.019 / 1.064 ms |
  | 4G-Preload, längste Aufgabe | 73 ms | 0 ms |
  | Persistierte Stapelzusammenfassung | 18,7 ms | 11,7 ms |

  Datenbank (100k Karten, 1 Mio. Reviews, je fünf Läufe): Statistik-RPC p75
  468 bis 524 ms in vier Läufen dieses Tages (vorher 490 ms), Katalogsuche p75
  95 bis 264 ms (vorher 125 ms). Bei fünf Läufen ist p95 der kalte erste Lauf
  (Statistik 527 bis 963 ms, Suche 106 bis 735 ms) und schwankt mit der
  Rechnerlast; alle Gates bestehen. Ladevolumen: Initialgraph 210,0 KiB gzip
  (3. Oktober 217,5 KiB). APKG-Import mit 25.000 Karten und 1.000 Medien: Median
  4,5 s im Einzellauf und 2,8 s in `gate:nightly` (vorher 10,5 s), Worker-Heap
  141 bis 149 MiB (vorher 425 MiB), längste Main-Thread-Verzögerung 19 bis 28 ms
  (vorher 32 ms).
- **K8.3 Visuelle Pflichtmatrix:** 120 Screenshots von Lernen, Kartenverwaltung,
  Karteneditor, Kartenvorschau, manueller Erstellung, Bildverdeckungs-Editor,
  Importvorschau, Review vor und nach dem Aufdecken und Stapeleinstellungen bei
  320, 360, 390, 430, 1280 und 1440 px, jeweils hell und dunkel; kein
  horizontaler Seitenüberlauf. Zwei Befunde behoben: „Bildverdeckung“ ragte bei
  320 und 390 px aus dem Fragentyp-Schalter (jetzt weicher Trennstrich, unter
  360 px zwei Reihen), „Vorlage mit aktuellen Werten aktualisieren“ war bei
  320 px abgeschnitten (bricht jetzt um). Screenshots lagen nur temporär vor.
- **K8.4:** Die sechs genannten Dokumente beschreiben das Modell `Note`/`Card`;
  das Testportfolio nennt jetzt Bildverdeckung und Begraben im
  Kartenlebenszyklus.

## 2026-10-10 — Startzeit „Neues Gerät bis Dashboard“ unter Budget (Phase 4)

- **Vorladen:** Der Build lädt den Supabase-Client-Chunk per `modulepreload` mit
  dem Einstieg; die Sitzungsprüfung wartet nicht mehr auf den ersten Render.
- **Parallele Sitzungsbestätigung (ADR-038):** Online startet die gespeicherte
  Sitzung Shell und Bootstrap; `getUser()` bestätigt parallel, eine Ablehnung
  verwirft den Start samt Bootstrap-Wiederholungen und zeigt die Anmeldung.
- **Messung** (`performance:measure:local`, je zehn gedrosselte Läufe, p75/p95):

  | Kennzahl | `main` vorher | nur Vorladen | Vorladen und parallel |
  | --- | ---: | ---: | ---: |
  | Neues Gerät bis Dashboard | 2.856 ms | 2.736 ms | 2.574 / 2.618 ms |
  | davon bis Sitzungsprüfung | 2.529 ms | 2.392 ms | 2.176 ms |
  | Wiederkehrender Start | 714 ms | 654 ms | 490 / 531 ms |
  | Offline-Kaltstart | 474 ms | 420 ms | 490 / 516 ms |

  Alle Gates bestehen. Ein Zwischenlauf hatte einen einzelnen 57-ms-Task im
  automatischen 4G-Preload (Grenze 50 ms); die Wiederholung lag bei 0 ms wie die
  Läufe davor.
- **Tests:** Lebenszyklus-Tests für Start ohne Warten, Ablehnung durch den Server
  und Bestätigungsfehler; Unit-Test des Preload-Tags; E2E `auth-gate`,
  `auth-lifecycle`, `auth-resilience` und `first-learning` grün (19/19).

## 2026-10-10 — Begraben von Geschwistern (K7.1–K7.3)

- **K7.1:** `buryNewSiblings`, `buryReviewSiblings` und
  `buryInterdayLearningSiblings` in `LearningSettings`, standardmäßig aus und in
  allen drei Vorlagen aus; sichtbar als Checkboxen unter „Geschwisterkarten
  begraben“ in Lern- und Stapeleinstellungen, gespeichert in Lernprofilen und im
  globalen Standard. Keine Migration: Stapeleinstellungen und Profile sind JSONB.
- **K7.2:** `createDailyReviewQueue` begräbt nach Ankis Reihenfolge (heute
  beantwortet, Lernschritte des Tages, tagesübergreifend und fällig, neu); die
  Optionen der vorher gesehenen Geschwister entscheiden, begrabene Karten
  verbrauchen kein Limit. `loadReviewSession` liefert heute beantwortete Karten
  samt Geschwistern anderer Stapel nur bei aktiver Option, sodass das Begraben
  Reload und Stapelgrenzen übersteht. Die Lernsitzung entfernt begrabene
  Geschwister nach einer Antwort samt Zählern.
- **K7.3:** Scheduler-Tests für ausgeschaltete Optionen (Queue und Fortschritt
  unverändert), Bevorzugung, Tagesgrenze mit Tagesbeginn, Zeitsimulator,
  Unterstapel mit unterschiedlichen Optionen und Limits; Profiltest und
  IndexedDB-Test für das Lernfenster; E2E-Vertrag „Geschwister begraben“.
- **Offen als K7.4:** Stapelzähler und Sitzungsplan berücksichtigen das Begraben
  noch nicht.

## 2026-10-10 — Bildverdeckungs-Editor (K6.5) und Kartenbausteine in den Docs (K6.6)

- **K6.5:** Bildverdeckung ist ein Fragentyp der manuellen Erstellung. Ein Bild
  wird wie Inline-Bilder vorbereitet (Verkleinerung, SHA-1, Upload-Queue);
  `OcclusionEditor` zeichnet Rechtecke, Ellipsen, Polygone und Texte, gruppiert
  Masken zu Karten, setzt Masken auf „bleibt verdeckt“ und wählt den Modus. Maus,
  Stift und Touch teilen Pointer-Events; Masken sind per Tastatur fokussierbar,
  verschiebbar und löschbar. Der Karteneditor bearbeitet eigene Bildverdeckungen
  mit demselben Editor; Gruppennummern werden nie neu vergeben, sodass
  verbleibende Karten ihren Lernstand behalten. Gestaltung per `visual-ab-review`
  entschieden: Variante C (Seitenleiste neben dem Bild) statt Werkzeugleiste.
  Das Bild lässt sich im Karteneditor noch nicht austauschen, weil der Editor
  keine neuen Medien speichert.
- **K6.6:** `card-types.html` heißt „Kartenbausteine“ und zeigt acht Bausteine
  mit echtem Renderer und Erstellungsweg statt sechs Kartentypen.
- **Nachgezogen:** Symbolbuttons sind auf Desktop quadratisch 40 × 40 px (vorher
  44 × 40 durch eine globale Mindestbreite); der Platzhalter von Stapeln ohne
  Unterstapel folgt der Bedienhöhe, sodass Icons bündig bleiben. Die E2E-Verträge
  für Katalogsuche, Kennzahl-Kacheln, Tabellenköpfe und Bedienhöhen erwarten das
  Soft-Minimal-Design.
- **Abnahme Phase 6:** `npm run gate:push` grün; volle lokale E2E-Suite
  (110 Tests) mit anschließend korrigierten Specs vollständig grün, darunter
  Golden-Flows, Kartenlebenszyklus und der neue Vertrag „Bildverdeckung erstellen
  und bearbeiten“; visuelle Matrix für Erstellen und Katalog-Editor bei 320, 390,
  1280 und 1440 px, hell und dunkel.

## 2026-10-09 — Erstellen und Bearbeiten auf dem Inhalt (K6.1–K6.4), Soft-Minimal-Design und neuer UI-Katalog

- **K6.1:** Manuelle Erstellung und Karteneditor teilen die Bausteine
  `NoteBlockControls` (Antwort eintippen; Felder mit Rolle Zusatzfrage, Hinweis,
  Zusatz, Quelle). Gestaltung per `visual-ab-review` entschieden: Variante B
  (Optionszeile, alle Bausteine sichtbar) statt Menü. Zusatzfelder tragen eine
  Rolle statt einer Platzierung; der Editor bietet Lernrichtung, umbenennbare und
  entfernbare Felder. Der Texteditor setzt eine Auswahl als Formel.
  Importierte Inhalte behalten Feldschema und Abfragen.
- **K6.2:** Eine Live-Zeile nennt vor dem Speichern neue und entfallende Karten
  sowie veraltende KI-Umformulierungen; `Karten entfernen?` listet jede
  entfallende Karte mit Abfrage, Stapel und Lernzustand.
- **K6.3:** Das Kartendetail listet die Geschwister des Inhalts und wechselt per
  Klick; der Untertitel nennt die Abfrage (`Lückentext · Lücke 2 von 3`).
- **K6.4:** Geänderter Frage- oder Antworttext markiert aktive KI-Varianten der
  betroffenen Karten als veraltet (`isActive: false`, `meta.outdated: true`);
  `KI-Variante neu erzeugen` ersetzt sie.
- **Design:** Der Stil „Soft Minimal“ (ADR-037) gilt appweit: Manrope in App,
  Kartenfläche und Doku, Bedienhöhe 40 px (44 px bei Touch und unter 768 px),
  schwebende 15-rem-Sidebar ohne Kopfleiste auf Desktop (Variante B der
  Designstudie), randlose Utility-Symbole in einer Reihe. Buttons sind exakt
  bedienhoch; Aussetz-Segment und Fragentyp-Zeile brechen auf schmalen Breiten
  um statt überzulaufen.
- **UI-Katalog:** `ui-elements.html` folgt dem Aufbau des BengtsToolBox-Katalogs
  (Kopf, Kapitelnavigation, Suche; Grundlagen, Primitive, App-Muster,
  CoRe-Fachmuster, Icons, Zustandsmatrix) und enthält weiterhin alle bisherigen
  Demos und Inventare; `card-types.html` nutzt denselben Rahmen.
- **Prüfung:** `npm run gate:push` grün; `check:docs` grün; visuelle Matrix für
  Heute, Lernen, Erstellen, manuelle Erstellung, Kartenverwaltung, Review,
  Statistik, Einstellungen und Hilfe bei 320/390/768/1280/1440 px, hell und
  dunkel bei 390/1440 px gesichtet; lokale E2E-Specs `card-lifecycle`,
  `navigation-context`, `core-stabilization` und `product-surfaces` grün.

## 2026-10-09 — Bildmasken wie in Anki (K5.2) und Image Occlusion Enhanced als CoRe-Masken (K5.10)

- **K5.10:** Der Übersetzer für Image Occlusion Enhanced (Version 2) baut aus
  dem Frage-SVG echte CoRe-Masken: Pixelkoordinaten werden über
  `width`/`height` des SVG auf 0–1 normiert, die Form oder Gruppe mit
  `class="qshape"` ist die Abfrage `io:1`, alle übrigen Formen bleiben mit
  `ordinal` 0 dauerhaft verdeckt und bilden keine eigene Karte (neu im Modell;
  nur mit `alwaysOccluded` gültig). SVGs mit Beschriftungen, Pfaden oder
  Transformationen bleiben eine `overlay`-Maske. `translateAnkiPackage` liest
  dafür die Masken-SVGs vorab und ist asynchron; die Neuübersetzung ohne
  Paketmedien lässt solche Inhalte unverändert. Realer Korpus
  `Image_Occlusion_Test_Pharmagrundlagen.apkg`: 66 von 66 Notizen als
  CoRe-Masken (vorher 66 Overlays), 84 Karten wie bisher, die SVG-Maskenbilder
  werden nicht mehr gespeichert.
- **K5.2:** Ankis Editor und Reviewer (26.9, nur gelesen) zeichnen Rechtecke,
  Ellipsen und Text um `angle` Grad in Bildpixeln um ihre linke obere Ecke,
  ignorieren den Winkel von Polygonen und verschieben deren Punkte auf
  `left`/`top`; die Schriftgröße ist `fs` mal Bildhöhe mal `scale`. Der
  Renderer zeichnet Rechtecke, Ellipsen und Beschriftungen deshalb als HTML in
  einer Ebene in Bildgröße (CSS-Drehung, Schriftgröße in `cqh`), Polygone ohne
  Drehung im SVG; Beschriftungen nutzen wie Anki Arial ab der linken oberen
  Ecke. Das Modell erhält `fontSize` an Textmasken, Polygone verlieren
  `angle`; der native Übersetzer (Version 2) liest `fs` und verschiebt
  Polygone. Sichtvergleich mit `CoRe_Bildverdeckung_nativ.apkg` (2:1-Bild,
  alle Formen, gedreht, Text in zwei Größen, Gruppe) gegen eine Kontur nach
  Ankis Zeichenregeln bei 1280 und 375 px: alle Formen und Beschriftungen
  deckungsgleich. Die Füllfarbe einzelner Masken (`fill`) übernimmt CoRe
  weiterhin nicht.
- Matrixgenerator: native Ellipsen mit `rx`/`ry`, realistische IOE-SVGs im
  Modus `ao` und `oa`, neue Erwartung `occlusion` je Notiz; Matrix neu erzeugt
  und grün.

**Nachweise (lokal, 2026-10-09):** `gate:push` grün, fokussierte Tests
(Übersetzer, Renderer, Inhaltsschema, Neuübersetzung, Matrix) grün,
`report:apkg-corpus` ohne Verluste, `benchmark:apkg` 3,7 s gesamt, 3,35 s
Worker, Spitze 162 MiB, Main-Thread höchstens 20,9 ms. UI-Katalog-Demo hell und
dunkel geprüft. Gemergt als `bcd4b04` (PR #13, CI grün); Hosted-Smoke gegen
Production 10 von 10 grün. Die lokale E2E-Suite lief nicht, weil eine parallele
Sitzung den gemeinsamen lokalen Supabase-Stack nutzte.

## 2026-10-08/09 — Remote-Reset des Pre-Release-Projekts (K4.8)

Nach ausdrücklicher Freigabe des Nutzers im Chat; Projekt-Ref vorher aus
`supabase/.temp/project-ref` angezeigt und gegen die Freigabe geprüft.

- Projekt `CoRe-Database` (`hirbiuiydczmnjqtoyqx`). Vorher: 2 Auth-Konten,
  6 Sitzungen, 213 Objekte in `core-media`, Migration `20260817190000`.
- Storage-Objekte über die Storage-API gelöscht. Das Löschen der Konten über
  die Admin-API scheiterte am alten Schema (HTTP 500), deshalb folgte
  `supabase db reset --linked --no-seed` vor dem Kontolöschen; der Reset
  entfernte die Konten mit.
- Danach: 0 Konten, 0 Sitzungen, 0 Storage-Objekte, alle 15 Tabellen in
  `public` leer, einzige Migration `20261008101057`. `verify_schema_v1.sql`
  gegen das Projekt fehlerfrei; die aus dem Projekt generierten Typen
  entsprechen `src/database.types.ts` bis auf CLI-Metadaten und Formatierung.
- Production (`core-hosted.vercel.app`) läuft auf `d29cc99` und zeigt die
  Anmeldung ohne Konsolenfehler.
- Erster Hosted-Smoke (`npm run test:beta:hosted`, neu registrierter
  Testaccount) gegen `d29cc99`: 9 von 10 grün. „PDF-Auswahl erzeugt nur
  Karteninhalt“ scheiterte am Dialog „Änderungen übernehmen?“: Nach dem
  lokalen Speichern lud die Kartenverwaltung den Inhalt erneut aus der Cloud
  und galt bis zu deren Antwort als ungespeichert; die Antwort konnte zudem
  den älteren Cloud-Stand liefern. `reloadNoteGraph` liest seitdem nach
  lokalen Änderungen nur noch die Replica. Der PDF-Test verzögert die
  Hydrierung um 3 s und scheitert ohne die Korrektur reproduzierbar.
- Zweiter Hosted-Smoke gegen `1f138cd` (PR #10): 9 von 10 grün, der PDF-Test
  jetzt grün. „KI-Basic-Variante … reloadfest gespeichert“ scheiterte in 1 von
  3 Wiederholungen: Die Variante entstand, während der Sync von Stapel, Inhalt
  und Karte lief, und die Sync-Anforderung dazu ging verloren, weil `flush`
  bei laufendem Sync nur den laufenden zurückgab. Der Fehler bestand schon vor
  dem Cutover; die Cloud-Abfrage nach dem Speichern hatte ihn zeitlich
  verdeckt. Seitdem folgt einem Sync, während dessen ein weiterer angefordert
  wurde, ein zweiter Durchlauf, wenn die Outbox noch Mutationen enthält.
  Lokal dazu `test:e2e:local` 108 bestanden, 1 übersprungen, und
  `performance:measure:local` mit allen Gates (neues Gerät p75 2.978 ms,
  Wiederholungsstart 709 ms, offline 490 ms).
- Dritter Hosted-Smoke gegen `2e7527f` (PR #11) am 2026-10-09: 10 von 10 grün.
  K4.8 ist damit abgeschlossen.

## 2026-10-08 — Cutover auf das Kartenmodell `Note`/`Card` (Phase 4, K5.4, K5.7–K5.9)

Umgesetzt auf dem Branch `kartenmodell-cutover`, gemergt mit PR #9
(`d29cc99`, CI grün). Der Remote-Reset (K4.8) folgte am selben Tag.

- **Datenbank (K4.1, K4.3, K4.4):** Die einzige Migration
  `20261008101057_kartenmodell_baseline.sql` ersetzt die Replica-v2-Baseline:
  `notes`, `cards` mit typisierten Lernstandsspalten und eigener
  `study_revision`, `note_type_sources`, `note_sources`, `media_files`,
  `note_media`, Trigramm-Suche über `notes.search_text`, Reviewindex je Karte.
  Katalog, Summaries und Statistikrollups werden über anweisungsbezogene
  Trigger mengenbasiert gepflegt. Neue bzw. umgebaute RPCs: Bootstrap ohne
  Prognose, `get_account_due_forecast`, Katalog mit Gesamtzahl nur auf Anfrage,
  `hydrate_account_cards` nach Karten- und Inhalts-IDs, `load_reimport_targets`,
  `list_retranslation_candidates`, `list_releasable_media`, Stapelbaum-Löschung
  mit verwaisten Inhalten. `verify_schema_v1.sql`, RLS und generierte Typen
  sind neu.
- **Replica, Sync, Medien (K4.5–K4.7):** IndexedDB
  `core.workspace.entities.v4` mit Cursor-Paging; Inhalte und Karten als
  getrennte Mutationen; Medien je Account und SHA-1 mit persistenter Queue und
  Freigabe nicht mehr referenzierter Dateien.
- **App (K4.9):** Review, Vorschau, Kartenverwaltung (Inhaltseditor,
  Geschwisterlöschung mit Undo, Bestätigung entfallender Karten, Markierung am
  Inhalt, entprellte Suche mit Abbruch), manuelle Erstellung und KI-Varianten
  arbeiten auf `Note`/`Card` und rendern über `NoteCardContent`.
- **Import (K5.4, K5.7–K5.9):** Der Worker liest die `File` (`.apkg`, `.colpkg`
  bis 2 GiB), übersetzt mit `translateAnkiPackage` und streamt begrenzte Chunks;
  Medien werden beim Commit einzeln gelesen und SHA-1-geprüft. Reimport über
  Anki-GUID und Kartenidentität, auch gegen Cloud-Ziele. Bericht je Notiztyp in
  Vorschau und Abschluss. Automatische Neuübersetzung unbearbeiteter Importe
  nach Übersetzer-Updates.
- **Altpfad (K4.10) und Tests (K4.11):** `LearningItem`, Kartentypen,
  Notiztyp-Definitionen, `cardPresentation.ts`, `ankiContentModel.ts`,
  `importService.ts`, `StudyCardContent` und die Legacy-APKG-Abbildung sind
  gelöscht; `grep -rnE "LearningItem|CardType|cardPresentation" src scripts api
  tests` findet nichts. E2E-Specs nutzen Matrixpakete; der Generator und die
  `import-quality`-Fixtures sind entfernt.
- **Während der Umsetzung gefundene und behobene Fehler:** endlos wiederholte
  Medien-Queue-Einträge ohne lokale Datei; Neuübersetzung verlor `anki-N`-Karten
  statt sie umzuschlüsseln; Konfliktkarten über das gezielte Lernfenster
  lernbar; lokal erstellte Inhalte vor dem Sync nicht im Editor zu öffnen;
  ungesendete Varianten beim Hydrieren gelöscht; veraltete Kartenzeilen nach
  Bearbeiten/Aussetzen/Markieren; Vorschau verwarf die Auswahl vor
  `Antwort prüfen`; Fokusziel und Fokuswechsel im Review.

**Nachweise (lokal, 2026-10-08):**

- `npm run gate:push` grün (644 Modultests, Typecheck, Build, Chunk-Budget
  209,2 KiB gzip Initialgraph), `db:types:check` grün, `test:rls:local` 17/17
  einschließlich Zwei-Geräte-Test für Review und Inhaltskorrektur,
  `npm run test:e2e:local` 108 bestanden, 1 übersprungen (im Beta-Schritt
  bestanden), `docs:build`/`check:docs` grün.
- **Speicher je 1.000 Inhalte** (`npm run measure:footprint`, MiB; Postgres
  umfasst `notes`, `cards`, `card_catalog`, `note_sources`,
  `note_type_sources`):

  | Szenario | Karten | Postgres | Sync | Browser | Lernfenster 50 Karten |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | APKG Basic | 1.000 | 2,90 (vorher 4,87) | 3,36 (4,66) | 2,03 (4,35) | 104 KiB (223) |
  | APKG Basic und umgekehrt | 2.000 | 4,16 (10,60) | 4,63 (9,77) | 3,15 (9,16) | 81 KiB (235) |
  | APKG Lückentext (4 Lücken) | 4.000 | 7,46 (23,84) | 7,14 (23,95) | 4,96 (22,72) | 63 KiB (291) |
  | Manuell Basic | 1.000 | 2,28 (4,46) | 2,62 (4,07) | 1,93 (3,77) | 99 KiB (193) |
  | Manuell Basic und umgekehrt | 2.000 | 3,49 (9,20) | 3,85 (8,16) | 3,02 (7,57) | 77 KiB (194) |
  | Manuell Lückentext (4 Lücken) | 4.000 | 6,49 (22,46) | 6,15 (21,56) | 4,75 (20,37) | 61 KiB (261) |

- **Startzeiten** (`npm run performance:measure:local`, zweiter Lauf, p75/p95):
  Wiederholungsstart 634/656 ms (Ausgangsmessung 928/954), Offline-Kaltstart
  465/593 ms (677/706), ohne Service Worker 1.284/1.292 ms (1.435/1.456),
  neues Gerät bis Dashboard 2.883/3.003 ms (3.959/4.187), 4G-Preload
  1.216/1.399 ms ohne Hintergrund-Long-Tasks, persistierte Summary p75 8,9 ms.
  Alle Gates eingehalten. Der erste Lauf desselben Stands lag beim neuen Gerät
  bei p75 3.023 ms (knapp über Budget, nicht schlechter als K3.7 mit 3.035 ms)
  und hatte einen einzelnen Offline-Ausreißer (852 ms bei sonst höchstens
  550 ms); der Wert schwankt um das Budget.
- **Phasenaufschlüsselung „Neues Gerät bis Dashboard“** (K4.2, p75 zweiter
  Lauf): Netz, Bundle und Anmeldung bis zur Sitzungsprüfung 2.576 ms,
  Bootstrap-RPC 350 ms, IndexedDB-Schreiben 15 ms, erste Stapelzusammenfassung
  8 ms, Rendern 2 ms. Die Datenbank ist damit nicht der Engpass.
- **Datenbank** (`supabase/benchmark_replica_v2.sql`, 100k Inhalte/Karten,
  1 Mio. Reviews, p75/p95): Statistik-RPC 453/465 ms (Ausgangsmessung 490/522),
  Katalogsuche über den Inhaltstext 163/169 ms (125/295; K3.7 mit der alten
  Vorschauprojektion 42/75), Bootstrap 8/35 ms, atomarer Review 4/27 ms,
  Import-Schreibbatch mit 250 Inhalten und Karten 86/117 ms,
  Clientprojektion höchstens 9,6 ms.
- **K4.2 Projektionen:** Erste Kartenseite über `card_catalog` 1,8/10,1 ms
  gegenüber 165/194 ms direkt über `cards` und `notes`; Stapelzähler aus
  `deck_study_summaries` 0,1/0,2 ms gegenüber 30/37 ms direkter Aggregation.
  Beide Projektionen bleiben (ADR-034, Ergänzung).
- **APKG-Benchmark** (`npm run benchmark:apkg`, 25.000 Karten, 1.000 Medien,
  ohne Parallel-Last): 3,7 s gesamt, 3,3 s Worker, Spitze 161 MiB
  (Ausgangsmessung 10,2 s Worker, 425 MiB Heap), Main-Thread höchstens 16,6 ms,
  Ergebnisübergabe 0 ms.
- **Visuelle Pflichtmatrix** (320, 360, 390, 430, 1280, 1440 px; 390 und
  1440 px zusätzlich dunkel): Review Frage/Antwort, Kartenverwaltung mit
  Inhaltseditor, Vorschau Vorder-/Rückseite, manuelle Erstellung und
  APKG-Importvorschau mit Notiztyp-Bericht und Beispielkarten per Screenshot
  geprüft, ohne Befund aus dem Cutover. Vorbestehend und unverändert: Die
  Beschriftung „Aussetzen“ in den Lernstandsaktionen wird bei 320 und 360 px
  gekürzt; der Hinweis auf fehlende Medien steht in der Importvorschau
  zusätzlich in der Warnungsliste.

## 2026-10-08 — Korpus: echte Bildverdeckung und echter Lernstand

- `Image_Occlusion_Test_Pharmagrundlagen.apkg` (73 Inhalte, 84 Karten): 66
  Image-Occlusion-Enhanced-Inhalte zu 100 % voll übersetzt, sieben Lückentexte
  generisch, 0 % nicht darstellbar, keine fehlenden Medien. Die SVG-Masken
  bestehen ausschließlich aus ungedrehten Rechtecken ohne Text, in beiden
  Modi (`ao`, `oa`). Damit ist entschieden, IOE in echte CoRe-Masken zu
  übersetzen (K5.10, Ergänzung zu ADR-033). Ankis eingebaute Bildverdeckung
  enthält das Paket nicht; es hat keinen Lernstand.
- `Pokemon_Gen_I_Auszug.apkg`: mit Ankis Python-Bibliothek 26.5 auf 40 von
  151 Inhalten gekürzt (16 statt 60 MB), bevorzugt Karten mit Vergessen und
  Wiederlernen. Alle 40 Karten übernehmen den FSRS-Gedächtniszustand, alle
  116 Reviewereignisse (Lernen, Wiederholung, Wiederlernen über 7,7 Tage)
  werden ohne Auslassung übernommen. Alle Karten stehen in der Wiederholung;
  Lern-, ausgesetzte, begrabene und geflaggte Karten fehlen.
- `CoRe_Bildverdeckung_nativ.apkg`: mit Ankis Python-Bibliothek im
  Speicherformat des Anki-Editors erzeugt (aus Ankis Editor-Code 26.9
  abgelesen), weil die Desktop-Steuerung nicht verfügbar war. Zwei Inhalte mit
  je sieben Karten auf dem 2:1-Raster: ungedrehtes und gedrehtes Rechteck,
  gedrehte Ellipse (`rx`/`ry`), gedrehtes Polygon, Text in zwei Größen (einmal
  gedreht), eine Zweiergruppe mit eigener Füllfarbe; einmal „alle verdecken“,
  einmal „eine verdecken“. Anki nimmt beide Inhalte an; CoRe übersetzt sie zu
  100 % voll. Drehung und Textgröße prüft K5.2.

## 2026-10-08 — Phase-3-Performance-Abnahme (K3.7)

- `npm run performance:measure:local` lief erstmals seit Phase 3 vollständig:
  Startmessung einschließlich 4G-Preload, 100k-/1m-Statistikbenchmark und
  Grenzwertprüfung. Das 4G-Szenario, an dem der Phase-3-Lauf nach zehn Minuten
  abbrach, lief durch. Benchmark und Speichermessung lesen den Datenbankcontainer
  jetzt aus der `project_id` in `supabase/config.toml` statt aus dem
  Ordnernamen, damit sie auch in Worktrees laufen.
- Messwerte (p75/p95): Wiederholungsstart 665/703 ms, Offline-Kaltstart
  513/556 ms, ohne Service Worker 1.259/1.335 ms, 4G-Preload 1.315/1.347 ms,
  persistierte Summary p75 13,5 ms, keine Hintergrund-Long-Tasks;
  Statistik-RPC 462/466 ms, 100k-Kartensuche 42/75 ms, Clientprojektion
  höchstens 4,6 ms p95; Initialgraph 218,1 KiB gzip.
- Einziger überschrittener Grenzwert: „Neues Gerät bis Dashboard“ p75
  3.035 ms gegen 3.000 ms (Ausgangsmessung 3.959 ms). Die Überschreitung war
  bekannt und bleibt in der Phase-4-Abnahme geführt; die Grenzwerte sind
  unverändert.

## 2026-10-08 — Lokale Playwright-Suite wieder grün

- Ursache der hängenden APKG-Importe und der Synchronisierungskonflikte: Eine
  Folgeänderung an einem noch nicht gesendeten Insert (etwa die globalen
  Lernstandards direkt nach dem Import) ersetzte ihn in der Outbox als Update
  mit Basisrevision 1; die Cloud meldete `missing`, die Karten scheiterten am
  Stapel-Fremdschlüssel. Die Outbox hält solche Ersetzungen jetzt als Insert.
  Ging nur die Antwort auf einen Insert verloren (Reload während des Syncs),
  übernimmt die Cloud die Folgeänderung als Update, sofern dasselbe Gerät die
  Zeile zuletzt geschrieben hat.
- Weitere Produktkorrekturen: Die Dashboard-Überschrift trägt als zugänglichen
  Namen wieder die vollständige Begrüßung; eingefügte Bilder gehen nicht mehr
  verloren, wenn ein anderes Feld beim Einfügen den Fokus abgibt; nach dem
  Speichern landet der Fokus im ersten freien Pflichtfeld statt im
  Datei-Input der Toolbar; verpixelter Hilfetext bricht wie der lesbare um;
  der Heatmap-Kopf wechselt ab 37 rem nur noch einmal, weil 36 rem in der
  Breitendelle des größeren Innenabstands ab 640 px lag.
- Rund 30 Playwright-Tests in sieben Specs wurden an spec-gedeckte UI-Änderungen seit dem
  2026-08-18 angepasst (Stapelinhalte statt Review per Zeilenklick,
  Heatmap-Dropdown, getrennte Lerneinstellungen, Bereichstoasts,
  Platzhalter-Tabs, Einrückung 8 px, kürzbare Spaltentitel, Navigationshelfer).
- Abgenommen: `npm run gate:push` (Typecheck mit Doku-Prüfung, 108
  Testdateien, Build und Chunk-Budget), `npm run test:e2e:local` mit 15/15
  RLS-/Zwei-Geräte-Fällen, 108 bestandenen und einem erwartbar übersprungenen
  Playwright-Test sowie dem Beta-Auth-Artefakt, die Startmessung aus
  `performance:measure:local` (Wiederholungsstart p75/p95 731/775 ms,
  Offline-Kaltstart 518/542 ms, Frischstart p75 3.063 ms). Der anschließende
  Statistikbenchmark lief im Worktree nicht, weil er den Containernamen aus dem
  Verzeichnisnamen ableitet. Visuell geprüft wurden Heatmap-Kopf in Dashboard
  und Statistik, verpixelte Hilfekarte und Begrüßung bei 320 bis 1.440 px in
  Light und Dark.

## 2026-10-07 — Entscheidungen vor dem Cutover: Marker, Kprim, Bildbeschreibung

- Marker (Entscheidung 1A): Farbige `background-color`-Marker im Feld-HTML
  ändern ihre Helligkeit, bis die Kartenschrift des Themes darauf 4,5 : 1
  erreicht (Dark Mode dunkler, Light Mode heller). Der Korpus zeigte kaum echte
  Marker, aber eingefügte Webfarben: 100-mal weiße Tailwind-Schrift
  `rgb(255 255 255/var(--tw-text-opacity))` in Ankizin, die der Farbparser wegen
  `var(…)` nicht las und im Light Mode unsichtbar ließ, dazu graue und weiße
  Seitenhintergründe. `var(…)` gilt jetzt als deckend; farblose Hintergründe
  entfallen, unlesbare farblose Textfarben übernehmen die Kartenschrift.
  Visuell in Light und Dark mit Marker, Webkopie und Ankizin-Textfarben geprüft.
- Kprim (wie vorgeschlagen): Nach dem Prüfen nennt die Rückmeldung „3 von 4
  Aussagen richtig“; die Bewertung Nochmal/Schwer/Gut/Einfach bleibt manuell.
- Bildbeschreibung (Entscheidung 3A): Das Bild einer Bildverdeckung trägt den
  ersten Fragetext, etwa „Herzklappen – Bild mit verdeckten Bereichen“.
- Neuübersetzung (K5.4): Der Importgraph liefert zusätzlich `noteSources`, die
  rohen Anki-Feldwerte je Inhalt. Ohne sie wäre keine Neuübersetzung möglich,
  weil Übersetzer Felder wie Antwortmaske, Optionen oder Maskenfeld
  verbrauchen. Kosten am Beispiel Dellas: 1,75 MiB Rohfelder zu 7,39 MiB
  übersetztem Inhalt. Entschieden: automatische Neuübersetzung mit vier
  Leitplanken (nur Unbearbeitetes, Lernstand und Karten mit Lernstand
  geschützt, einmal deterministisch je Account, kurzer Hinweis), festgehalten
  in K5.4 und als Ergänzung zu ADR-033.
- Nachweise: Renderer- und Farbtests, Matrix, Übersetzertests, die drei
  Kartenbaustein-Browsertests (Eintippen, Auswahl einschließlich Kprim,
  200-%-Zoom).
- Audit mit `audit-last-change`: Textfarben werden je Stilangabe nur noch
  einmal gelesen; keine weitere belegbare Vereinfachung.

## 2026-10-07 — Übersetzer und Importgraph (Phase 5A)

- K5.0: `readAnkiPackage` (`apkgImportInternal.ts`) liest Pakete ohne
  Abbildung; `translateAnkiPackage` (`apkgNoteTranslation.ts`) liefert
  `{ decks, notes, cards, mediaFiles, reviewEvents, noteTypeSources, report }`.
  `src/apkgFormatMatrix.test.ts` beobachtet diese Pipeline und `renderCard`
  statt Learning Items; die sichtbare Textfassung blendet zugeklappte Hinweise
  aus und ergänzt bei Auswahlfragen die Optionen. Alle 27 bisherigen
  `KNOWN_GAPS`-Einträge sind geschlossen, die Liste ist leer.
- K5.1: Anki-Karten liegen in `did`, gefilterte im Heimatstapel `odid`;
  angelegt werden nur Stapel mit Karten und deren Vorfahren. `Note` trägt
  `importedContentRevision`. Fehlende Anki-Karten werden aus dem Inhalt
  abgeleitet, Karten ohne Abfrage berichtet.
- K5.2/K5.3: Registry aus nativer Image Occlusion, „Multiple Choice for Anki“
  (QType 0/1/2, Maske über die gefüllten Optionen), Image Occlusion Enhanced
  (neue Maskenform `overlay` mit Frage- und Antwort-SVG, Standard der
  Roadmap), AnKing-/Ankizin-Familie (Feldrollen nach Name, nie referenzierte
  Felder als Notiz), Anki-Standardtypen und generischem Übersetzer
  (Feldplatzierung, Anweisung mit `…`, Bedingungen, Eintippen, Vorlesen,
  Furigana). Passt ein Inhalt nicht, bleibt er als Feldliste erhalten.
- Abweichungen von der Roadmap, begründet: Signaturen werden vor der
  Stock-Kennung geprüft, und Basic/Lückentext gelten nur mit unveränderten
  Standardvorlagen als Standardtyp, weil Anki `originalStockKind` = 1 auch an
  neu angelegte und geklonte Notiztypen vergibt (in den Matrixpaketen
  nachgewiesen). Zwei Zielerwartungen wichen nachweislich von Ankis Verhalten
  ab und wurden im Generator korrigiert: „CoRe-Matrix Schrift“ ist ein
  unveränderter Basic-Klon (`forward` statt `anki-0`); ein Export ohne
  Lernstand wandelt den gefilterten Stapel in einen normalen um, die Karte
  bleibt dort. Die Matrix wurde mit `anki==26.5` neu erzeugt.
- K5.5: Phase, Fälligkeit relativ zum Sammlungsdatum, Zähler, Aussetzung und
  `flags & 7` kommen von der Anki-Karte; das Gedächtnis folgt FSRS-Memory-State,
  Revlog-Replay, klassischem Intervall oder bleibt neu. Das Tag `marked` wird
  `note.marked`. `cardStudyFromReviewState` in `coreModel/notes.ts` bildet den
  Scheduler-Zustand auf `Card.study` ab.
- K5.6: Medienverweise nur aus `src`, `poster` und `[sound:…]`, verglichen nach
  HTML-, URL- und NFC-Normalisierung und im Feldtext auf den kanonischen Namen
  umgeschrieben; eine Datei je SHA-1, nur referenzierte Medien. Moderne
  Medien werden positionsgenau ihrem ZIP-Eintrag zugeordnet (per SHA-1 geprüft).
- K5.8: Der ZIP-Leser liest Einträge einzeln aus dem `Blob`; `readAnkiPackage`
  akzeptiert `.apkg` und `.colpkg` bis 2 GiB und hält Medien bis zum Lesen im
  Archiv. Die sichtbare 250-MB-Grenze des heutigen Imports bleibt bewusst bis
  zum Cutover (K5.8 App), weil der Altpfad alle Medien materialisiert.
- K5.9: Der Bericht nennt je Notiztyp Übersetzer und Version, Inhalte, Karten,
  Feldrollen, nicht zugeordnete Felder, Feldlisten- und nicht darstellbare
  Inhalte, fehlende Medien und übernommenen Lernstand. `report:apkg-corpus`
  berichtet diese Quoten statt der Darstellungsquote.
- Nachweise: Matrix 13/13 und `apkgNoteTranslation.test.ts` 9/9 grün,
  `gate:push` mit vollständiger Modulsuite (108 Dateien), Typecheck, Build und Budgets. `benchmark:apkg` (25.000 Karten,
  1.000 Medien): Workerzeit Altpfad 7,1 s / 502 MB Heap, Note-Übersetzung
  3,2 s / 181 MB, Übergabe 0 ms. `benchmark:apkg:large` mit 2,11 GB
  (1.000 Medien à 2,1 MB): 14,7 s, Spitze Heap plus ArrayBuffer 183 MB bei
  1-GiB-Heap-Grenze.
- Browserprobe im Dev-Server: Der heutige Worker-Import liest mit dem neuen
  ZIP-Leser unverändert (`special-latest` 20 Karten, 11 Medien; Deflate-Paket
  `standard-legacy1`), die Note-Übersetzung läuft im Browser mit passender
  Medien-SHA-1. Die Supabase-E2E-Suite lief nicht, weil Docker nicht verfügbar
  war.
- Realwelt-Korpus (lokal in `fixtures/apkg/corpus/`, nicht versioniert):
  Ankizin v5 vollständig (46.729 Inhalte, 53.205 Karten, 5.617 Medien,
  784 MB; 23,5 s, 552 MiB Heap), Dellas x Amboss Pharmakologie v0.81
  (4.944 Inhalte) sowie mit Ankis eigenem Exporter geschnittene Auszüge aus
  AMBOSS feat. Ankiphil Klinik (317 Inhalte) und Physikum v43 (424 Inhalte).
  Ankizin: 99,9 % der Lückentexte über den Ankizin-/AnKing-Übersetzer, die
  1.800 Blickdiagnosen generisch, 0,1 % Feldliste (54 Lösch-Platzhalter ohne
  Lücke, eine im Original nicht geschlossene Lücke), 0 % nicht darstellbar.
  Die Stichproben deckten auf, dass echte Vorlagen Zusatzfelder hinter Buttons
  oder `display:none` auf der Rückseite, Metadaten in einer Kopfzeile auf
  beiden Seiten und Links als `href="{{Feld}}"` führen; der Übersetzer ordnet
  seitdem nach Position statt nach Feldnamen. Diese Muster stehen als
  selbst geschriebene Nachbauten (`matrix-ankizin`, `matrix-blickdiagnose`) in
  der versionierten Matrix, damit sie ohne Korpus geprüft werden. Dellas
  meldet zutreffend 44 im Paket fehlende Bilder und 7 verwaiste Anki-Karten
  gelöschter Lücken. Keiner der Stapel enthält Bildverdeckung oder Lernstand.
- `npm run test:e2e:local` mit Docker: 58 bestanden, 46 fehlgeschlagen, 4 nicht
  gelaufen. Ein Vergleichslauf der APKG-Import-Specs auf `7e9f192` scheitert
  identisch; die Fehlschläge stammen nicht aus Phase 5A (siehe `status.md`).
- Audit mit `audit-last-change`: ungenutzte Notiztyp-ID im internen Modell,
  doppelte Script-Entfernung und doppelte Filterung der Vorderseitenfelder
  entfernt. Zweites Audit nach den Korpus-Nacharbeiten: Hinweise aus
  Button-Abschnitten werden direkt über die Vorderseite statt per Suche in der
  Rückseite bestimmt; keine weitere belegbare Vereinfachung.
- Offen: AnKing, reale Bildverdeckung und reale Lernstände fehlen im Korpus;
  Lernstand ist über die mit Anki erzeugten Matrixpakete synthetisch belegt; Drehung und Textgröße der Bildmasken brauchen im Anki-Editor
  gezeichnete Masken (K5.2). Persistenz, Neuübersetzung, Reimport und
  Oberfläche folgen im Cutover (K5.4, K5.7, K5.8 App, K5.9 App).

## 2026-10-07 — Vorbereiteter Renderer und Kartenbausteine (Phase 3)

- K3.1–K3.4/K3.8: `notePresentation.ts` rendert validierte `Note`/`Card`-Paare
  ohne Anki-Templates, Scripts oder Persistenz. Review-Antworten ergänzen nur
  Antwort und Trennlinie, Vorschau/Verwaltung beide Seiten; Lücken und Bildmasken
  ersetzen die Frage. Feldrollen steuern native Hinweise, Zusatz und Quellen;
  interne Notizfelder bleiben auch bei expliziten Abfragereferenzen verborgen.
  Der Cloze-Tokenizer unterstützt Verschachtelung, Mehrfachnummern, Hinweise,
  leere Lücken und Formeln. Relative SVG-Masken unterstützen Rechteck, Ellipse,
  Polygon, Beschriftung und beide Modi. `alwaysOccluded` hält fremde Gruppen
  sichtbar, verhindert aber nicht das Aufdecken der aktiven Gruppe.
  Feld-HTML wird bereinigt und Textfarbe auf 4,5 : 1 zum Theme-Hintergrund
  angepasst. `notePlainText` erhält Wörter/Satzzeichen über Inline-Tags hinweg.
- K3.5/K3.6: `NoteCardContent` komponiert den bestehenden Kartenrahmen,
  Aktions- und Statusbausteine sowie das segmentierte Control. Eingabe und
  Auswahl bleiben im Host: Enter deckt auf, Unicode-Zeichen werden einzeln
  verglichen, Single Choice deckt direkt auf, Multiple Choice und vollständiges
  Kprim werden geprüft. Rich-Text-Optionen verwenden das bereits bereinigte
  Renderergebnis, damit KaTeX-Layoutattribute erhalten bleiben; nur aufgelöste
  Blob-/Data-Medien gelangen dabei in den Host.
- K3.7/K3.9/K3.10: KaTeX 0.19.0 lädt nur bei Formeln. Lokale WOFF2-Assets
  werden einmal geladen und mit CSS in den Frame eingebettet. Nicht unterstützte
  oder unsichere Befehle zeigen die bereits maskierte Quelle mit Diagnose.
  Rückseitendiagnosen bleiben bis zum Aufdecken verborgen. MP4-Soundmarker
  werden Video-Controls; Bilder, Audio und Video nutzen die bestehende
  URL-Auflösung. System-Vorlesen erhält bereinigten Text und Sprache im Host
  ohne Feldduplikation oder Antwortleck. Die AMBOSS-Suche mit
  `https://next.amboss.com/de/search?q=Herzinsuffizienz` wurde im echten Browser
  bis zur Anmeldung geprüft; Suchpfad und Begriff bleiben erhalten. Ergebnisse
  hinter dem Login wurden nicht geprüft. Der automatisierte Popup-Test nutzt
  eine lokale Antwort und prüft Begriff sowie `window.opener === null`.
- Gemeinsames CSP-Gerüst und URL-Auflösung liegen in `cardPresentationFrame.ts`;
  der bisherige Renderer verwendet exakt dieselben Funktionen. Der neue
  Frame-Aufruf erlaubt isolierte Popups und meldet Textauswahl. Der bisherige
  App-Aufruf bleibt unverändert. Vierzehn interaktive normalisierte Beispiele
  stehen in `scripts/uiCatalogDemos.tsx` und unter
  `docs/ui-elements.html#note-content`; der Kartentypen-Katalog verlinkt sie.
  App, Import, Scheduler, Speicherung und alte Renderpfade wechseln erst im
  Cutover. Die tatsächlichen APKG-Textvergleiche und IO-Enhanced-/Korpusnachweise
  folgen in K5.0; kein `KNOWN_GAPS`-Eintrag wurde vorzeitig entfernt.
- Nachweise: 17 fokussierte Renderer-/Kontrastprüfungen sowie neun bestehende
  Rendererprüfungen, vollständige Modulsuite (107 Dateien), Typecheck,
  Dokumentationsgate und Produktionsbuild mit Bundlebudgets bestehen.
  Initialgraph 218,0 KiB gzip, größter Lazy-Graph 168,7 KiB gzip. Ein separater
  Build des noch unverdrahteten Hosts hält dieselben Budgets ebenfalls ein;
  KaTeX-Lazy-Graph rund 76 KiB gzip. UI-, Rollen-, Wortgrenzen-, Formel- und
  Medienregressionen sind gezielt abgesichert.
- Browsernachweis für CoRe 0.2.0 im Arbeitsstand nach `0c025cb`, Chromium
  149.0.7827.55: 672 Renderfälle mit 14 Beispielen, Review/Vorschau vor und
  nach Aufdecken, Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932,
  1280 × 720 und 1440 × 900. Eingabe/Reset, falsche und richtige Auswahl,
  vollständiges Kprim, native Hinweise per Tastatur, Script-CSP, Textauswahl,
  Formelschriften und Fehlerdiagnosen, echte Audio-/MP4-Wiedergabe und
  Host-Sprachausgabe bestehen. Die bisherigen Inhalts-/Reviewrahmen und der
  mobile Vorschaudialog sind zusätzlich geprüft; die Eingabejourney besteht
  bei 200 % CSS-Zoom. Screenshots liegen in `test-results/note-presentation/`,
  zusätzlich gesichert unter `C:/Users/bengt/.codex/scratchpad/core-phase3/screenshots/`.
  Für komponentenbezogene Aufnahmen wurde ausschließlich die klebende
  Dokumentationsnavigation auf statische Position gesetzt. Die App-Styles
  wurden nicht durch Test-Styles verändert.
- Review gegen K3.1–K3.10 am 2026-10-07: Die Funktionen entsprechen der
  Roadmap. Korrigiert wurden: `[$$]…[/$$]` fehlte als abgesetzte Formel.
  Textbeschriftungen der Bildverdeckung waren SVG-Text in der gestreckten
  0–1-Fläche und damit verzerrt; Ankis Standardskala 1 ergab eine bildhohe
  Schrift. Sie sind jetzt HTML, Skala 1 entspricht der Kartenschrift. Umrisse
  verwenden nicht skalierende Striche, fremde Masken sind deckend statt in
  Bildhintergrundfarbe. Zusätze stehen vor den Quellen, Link-Quellen gemeinsam
  als Chips am Kartenende. Der Tippvergleich ersetzt auf der Antwortseite das
  Antwortfeld (`typedAnswer`), statt die Antwort doppelt zu zeigen. Der Host
  rendert Frage, Optionen und Vorlesetexte beider Seiten einmal und beim
  Aufdecken nur die Antwortseite neu, ohne die Karte zwischenzeitlich
  auszublenden.
- Visuelle Neugestaltung aus den bestehenden UI-Bausteinen: Hinweise als
  umrandete Disclosure mit Chevron, aktive Lücke als umrandete Akzentmarke,
  Zusatz mit gedämpfter Überschrift, Tabellen ohne Zeichenumbruch,
  Formelfehler als markierter Quelltext. Auswahl im vorhandenen Choice-Stil
  mit Buchstaben, Status-Icons und Feedback; Kprim zeigt die Lösung je
  Aussage. Das Eingabefeld steht mit Enter-Hinweis bis zum Aufdecken unter der
  Frage. Die Werkzeugzeile zeigt Vorlesen und `In AMBOSS nachschlagen` erst bei
  markiertem Begriff. Im Katalog wählt ein Segmented Control die Darstellung;
  Abfragen heißen „Lücke 1“, „Maske 2“ usw.
- Bewusst offen und in `todo.md` geführt: Marker-Hintergründe im Dark Mode,
  Kprim-Teilpunkte und Bildbeschreibung der Bildverdeckung (Abschnitt „Offene
  Entscheidungen aus Phase 3“) sowie Drehung und Textgröße gedrehter Masken
  (K5.2).
- Nachweise nach der Neugestaltung: 15 Renderer- und drei Kontrastprüfungen,
  vollständige Modulsuite (107 Dateien), Typecheck mit Dokumentationsgate,
  Produktionsbuild mit Bundlebudgets (Initialgraph 217,9 KiB gzip, größter
  Lazy-Graph 168,7 KiB gzip), die sieben Browserprüfungen von
  `tests/e2e/note-presentation.spec.ts` und die visuelle Matrix mit
  672 Aufnahmen (sechs Viewports, Light/Dark, Review/Vorschau, vor und nach
  dem Aufdecken; ohne horizontales Überlaufen und Seitenfehler). Gesichtet
  wurden Light und Dark bei 320, 390 und 1440 px. Der gestapelte Tippvergleich
  und die beim Aufdecken sichtbar bleibende Frage entstanden nach dem
  Matrixlauf; beides ist mit den Browserprüfungen und eigenen Aufnahmen bei
  320 und 1440 px nachgeprüft.
- Audit mit `audit-last-change` nach dem Review: Theme-Farbliste und
  Formelerkennung bestehen nur noch einmal; der Host rendert beim Aufdecken
  nicht mehr alle Seiten neu. Keine weitere belegbare Vereinfachung gefunden.
- Offene Abnahme: `npm run performance:measure:local` prüft lokales Schema
  und Typendrift und baut erfolgreich, endet aber im 4G-Szenario beim Warten
  auf `core:first_deck_summaries_ready` am Zehn-Minuten-Limit. Der Trace zeigt
  ein gerendertes Dashboard, keinen Konsolenfehler und die erfolgreiche
  Bootstrap-Marke; die Zusammenfassungsmarke fehlt in diesem Lauf. Es entsteht
  kein neues Performanceartefakt; Statistikbenchmark und Grenzwertprüfung
  wurden deshalb nicht ausgeführt. Der Nutzer hat ausdrücklich entschieden,
  Phase 3 mit offener Performance-Abnahme festzuhalten. Der bestehende Startpfad
  und alle Grenzwerte bleiben unverändert. Echte Smartphone-Tastatur,
  physischer Touch/Screenreader, hörbare Systemstimme und nativer Browserzoom
  bleiben ebenfalls ungeprüft; CSS-Zoom und kontrollierte Sprachübergabe
  ersetzen diese Nachweise nicht.
- Abschlussaudit mit `audit-last-change`: Font-Binärdaten bleiben außerhalb
  des JavaScript-Bundles, CSP und Medienauflösung sind gemeinsam statt kopiert,
  interne Feldrollen und aktive Bildmasken werden korrekt behandelt und
  Textgrenzen bleiben erhalten. Keine weitere belegbare Vereinfachung gefunden.
  Produkt-Specs und lokale Screen-Muster bleiben unverändert, weil kein
  Produktpfad auf den neuen Renderer umgestellt wurde. Keine Datenbankänderung,
  keine Phase-5A-Implementierung und kein Commit/Push ohne neue Freigabe.

## 2026-10-07 — Nachprüfung Kanonisches Modell (Phase 2)

- Review von `0c025cb` gegen K2.1–K2.6: Typen, Ableitung, Abgleich, private
  Seam, Inventar und Löschplanung entsprechen der Roadmap. Nachgeschärft:
- `planNoteContentChange` meldet `changed`. Ist der bereinigte Inhalt
  unverändert, bleiben Inhalt, Inhalts- und Entitätsrevision unverändert;
  sonst steigen beide genau einmal. Verglichen werden beide Seiten nach
  `parseNoteContent`, damit eine spätere JSONB-Schlüsselreihenfolge keine
  Scheinänderung erzeugt. So gilt ein bloßes Speichern später nicht als
  lokale Bearbeitung (K5.1/K5.7 nennen dafür jetzt `importedContentRevision`).
- Neue Karten kommen deterministisch in den Stapel der Karte, deren
  Abfrageschlüssel im bisherigen Inhalt zuerst abgeleitet wird, statt in den
  Stapel der zufällig ersten übergebenen Karte.
- Doppelte Karten-IDs oder Abfrageschlüssel werden bei Änderung und Löschung
  abgewiesen; gelöschte Inhalte oder Karten können nicht geändert werden.
- `updatedByDeviceId` setzt ausschließlich die Persistenz beim Schreiben
  (K4.9); `createNote` nimmt den Wert nicht mehr entgegen.
- Markierung: `marked` liegt wie in Anki am Inhalt (`Note.marked`) statt an
  der Karte und außerhalb von `content`; ADR-032 ist entsprechend ergänzt.
  Der APKG-Import entfernt künftig das Tag `marked` (K5.5); die
  Matrixerwartung bleibt unverändert, die Beobachtung ergänzt das Tag (K5.0).
- `architecture.md` nennt in der Modultabelle `scheduler.ts` statt der nicht
  existierenden Datei `fsrsScheduler.ts`.
- Nachweise: vier neue und drei angepasste Modelltests; vollständige
  Modulsuite (105 Dateien), `npm run typecheck` einschließlich
  `check:docs` und `npm run docs:build` bestehen.
- Audit mit `audit-last-change`: Die Stapelwahl für neue Karten nimmt die
  erste vorhandene Karte in bisheriger Schlüsselreihenfolge, statt alle
  Karten zu sortieren. Keine weitere belegbare Vereinfachung gefunden.

## 2026-10-06 — Kanonisches Note-/Card-Modell (Phase 2)

- K2.1: `coreTypes.ts` ergänzt `Note`, `Card` und `CardStudyState`, ohne
  bestehende Typen zu ändern. `coreTypes.typecheck.ts` schützt die Trennung
  von Inhalt, Stapel und Lernstand. Queue-relevante Werte liegen direkt am
  Lernstand; genutzte CoRe-, Lernfortschritts- und Variantenwerte sind in
  `extra` typisiert. Identitäten des früheren Review-State, die Aliaswerte
  `repetitions`/`sameDaySuccessCount` und die nur geschriebenen Werte
  `ease`, `retrievability` und `schedulerParamsJson` wurden nicht übernommen.
- K2.2/K2.3: `coreModel/notes.ts` validiert und bereinigt Inhalte über
  `parseNoteContent`, erstellt frische Karten je Abfrageschlüssel und plant
  Inhaltsänderungen. Gleiche Schlüssel erhalten exakt ihre bisherigen
  Karten, Lernstände, Varianten, Markierungen, Flaggen und Stapel. Neue
  Schlüssel erzeugen neue Karten im Stapel der ersten übergebenen Karte;
  entfallende Karten werden nur gemeldet, nicht gelöscht. Inhalts- und
  Entitätsrevision steigen je Änderungsplan einmal.
- K2.6 (reiner Anteil): `planNoteDeletion` plant Soft-Delete für Inhalt und
  alle Geschwister, auch in anderen Stapeln, mit einem Zeitstempel. `undo`
  enthält die vollständigen vorherigen Datensätze einschließlich Varianten
  und Aussetzung. Eingaben und Persistenz werden nicht verändert.
- K2.4/K2.5: Die neuen Funktionen bleiben privat; `coreModel.ts`, Scheduler,
  Review, Statistik, Import, App und Persistenz sind unverändert. Die
  verbleibende Verdrahtung von K2.2/K2.4/K2.5/K2.6 ist in K4.9 eingeplant.
- Nachweise: 17 neue Modelltests und elf vorhandene Inhaltsschema-Tests
  bestehen. Abgedeckt sind bedingte Richtungen, Eintippen, alle drei
  Auswahlmodi, beide Bildverdeckungsmodi, Hinweise, Mehrfachnummern,
  Verschachtelung, mehrere Lückenfelder und Formeln; außerdem Hinzufügen,
  Entfernen und Umnummerieren von Lücken, Rückrichtung an/aus, geleerte
  Bedingungen, Formatierungs-/Reihenfolgeänderungen, Fremdkartenabwehr und
  vollständiger Undo-Zustand. Die vollständige Modulsuite besteht mit
  unveränderten Scheduler-, Review- und Statistiktests (105 Dateien).
  `npm run typecheck` einschließlich `check:docs`, `npm run docs:build`
  und die abschließende Diffprüfung bestehen ebenfalls.
- Audit mit `audit-last-change`: Der Änderungsabgleich verwendet seine
  Schlüssel-Map zugleich für entfallende Karten; ein zusätzliches Set und
  ein weiterer Filterdurchlauf entfallen. Keine weitere sichere
  Vereinfachung gefunden. Keine neue Abhängigkeit, kein Laufzeitwechsel,
  keine Änderung von Datenbank oder UI. Produkt-Specs, Anki-Formatvertrag
  und Kartentypen-Demos bleiben deshalb unverändert.

<!-- K2.5: Lese-/Schreibinventar für den Cutover, Stand 2026-10-06.
src/reviewService.ts:
  Lesen: isDue/isReviewDueByLearningDay/isNewLearningItem/isLearningAvailable,
  compareQueueEntries/compareReviewQueueEntries, isIntradayLearning,
  classifyDailyReviewProgress und createDailyReviewQueue: state, dueAt, reps
  (bisher auch repetitions), lastReviewedAt und learningDayKey.
  createReviewItemViewModel/createFallbackViewModel: maturityXp/maturityBand,
  schedulerVersion, forcedVariantId, fallbackUntilCorrect, lastFailedVariantId.
  Schreiben: answerVariant -> updateCoreStateFromReview übernimmt den gesamten
  Schedulerstate, createReviewEvent speichert vorher/nachher als Snapshots;
  Variantenperformance wird separat aktualisiert. Meta-Projektionen entfallen
  erst im Cutover, repetitions wird überall auf reps umgestellt.
src/scheduler.ts:
  Lesen: createFsrsScheduler (desiredRetention), toFsrsCard/phaseForState/
  getStateReps/calculateRetrievability (direkte Queue-/FSRS-Werte),
  nextPreferredVariantLevel/fallbackStateForRating/deriveOutcomeMaturity
  (Variantenwerte), learningProgress (Lernfortschritt und Zeitstempel).
  Schreiben: projectFsrsResult -> createReviewState; state, dueAt, intervalDays,
  intervalMinutes, learningStepIndex, difficulty, stability, desiredRetention,
  reps, lapses, maturityXp/maturityBand, lastReviewedAt/lastRating,
  schedulerVersion, Variantenfallback und Lernfortschritt. Die bisher zusätzlich
  geschriebenen Alias-/Diagnosewerte entfallen im Cutover; keine FSRS-Änderung.
src/easyDays.ts:
  Lesen: createEasyDaysDueCounts liest state und dueAt; keine Lernstand-Schreibstelle.
src/learningDay.ts:
  Keine direkte ReviewState-Nutzung; erhält Datum, Zeitzone und Tagesgrenze als
  Werte. Aufrufer müssen künftig study.dueAt und extra.learningDayKey übergeben.
src/statisticsModel.ts:
  Lesen: snapshot/category/createStatisticsAccumulator nutzen state,
  intervalDays, difficulty, stability und dueAt sowie Review-Snapshots.
  Keine Lernstand-Schreibstelle; Snapshots/Account-Aggregate beim Cutover mitziehen.
src/coreVariantService.ts und coreVariantService/variantSelection.ts:
  Lesen: getLearningItemMaturity/getVariantReadiness/chooseReviewCard und
  selectAutomaticReviewVariant lesen maturityXp/maturityBand, stability,
  difficulty, intervalDays, reps (bisher auch repetitions), state,
  preferredVariantLevel, forcedVariantId und fallbackUntilCorrect.
  Keine Scheduler-Schreibstelle; Variantenmutationen bleiben an ihrer Karte.
-->

## 2026-10-06 — APKG-Formatmatrix und Realwelt-Korpus (Phase 1)

- `scripts/create_apkg_matrix_fixtures.py` erzeugt mit dem offiziellen Exporter von `anki==26.5` zwölf Pakete und `apkg-matrix.expected.json` (Vertrag v2):
  - Standardnotiztypen als aktuelles Paket, Legacy-2-Paket und Anki-2.0-Paket;
  - Sonderformate (AnKing-artige Hinweise mit AMBOSS-Link, „Multiple Choice for Anki“ als Kprim, Multiple und Single Choice, unbekannter Notiztyp mit festem Vorlagentext, Hinweis, Vorlesen, Furigana, drei Richtungen, zwei Lückenfelder, Lücke in Formel, MathJax, LaTeX, Audio, Video, Tabelle, native Image Occlusion mit allen vier Formen, Image Occlusion Enhanced);
  - Mediensonderfälle;
  - Lernstände mit und ohne Lernstand, auch als Legacy-Paket;
  - eine `.colpkg` mit Stapel `Default`;
  - ein leeres und ein defektes Paket.

  Jede Notiz trägt die Zielerwartung des universellen Inhalts: Feldrollen, Abfrageschlüssel, Text vor und nach dem Aufdecken nach der Regel aus `2c08cc7` (Basic wiederholt die Frage nicht, Lückentext füllt an derselben Stelle), Stapel, Lernstand und Medien.
- `src/apkgFormatMatrix.test.ts` (Contract, unter 1 s) prüft alle Pakete über die öffentliche Import-Seam. `KNOWN_GAPS` ist streng: Nicht gelistete Abweichungen und bereits geschlossene Lücken lassen den Test fehlschlagen.
- Die Matrix weist folgende Lücken des heutigen Imports nach:
  - **Widerspruch zum dokumentierten Vertrag:** Der rohe Anki-Kartenzustand erreicht das Learning Item nicht. Gültige FSRS-Zustände, Aussetzen, Wiederlernen, Begraben und Flaggen gehen verloren; es greift nur das Revlog-Replay.
  - **Stapel:** Jeder Import legt einen leeren Stapel `Default` an; gefilterte Stapel werden echte Stapel (`odid` ignoriert); Geschwister in anderen Stapeln, auch per Template-Zielstapel, landen im Stapel der ersten Karte.
  - **Formate:** `.colpkg` wird abgelehnt. `{{c1,3::…}}` erzeugt keine dritte Karte, verschachtelte Lücken zerbrechen, und die Eintippkarte zeigt die Antwort nicht. Hinweise sind sofort sichtbar, MathJax und LaTeX bleiben roh, Bildverdeckung erscheint als Rohtext. „Multiple Choice for Anki“ und Image Occlusion Enhanced werden nicht erkannt.
  - **Medien:** Ein Link-Pfad zählt als Medienverweis. HTML-maskierte und URL-kodierte Mediennamen werden nicht aufgelöst und fälschlich als fehlend gemeldet. Das Tag `marked` wird nicht zur Markierung.
- Belegte Formatdetails stehen in `anki-format-analysis.md`, darunter die Bedeutung von `QType` (0 = Kprim, 1 = Multiple, 2 = Single Choice) laut Quelle von `zjosua/anki-mc`. Noemis zurückgestellte Commits `e558338` und `2c08cc7` dienten nur als Lesevorlage; aus ihnen wurde kein Code übernommen.
- `scripts/reportApkgCorpus.ts` (`npm run report:apkg-corpus`) importiert echte Stapel aus `fixtures/apkg/corpus/` (gitignoriert) und berichtet je Notiztyp heutige Darstellungsquote, fehlende Medien, Laufzeit und Heap; ohne Dateien endet er mit Exit-Code 2. Mit Matrixpaketen geprüft; echte Ankizin- und AnKing-Stapel stehen noch aus.
- Audit des fertigen Diffs: Ungenutzte Erwartungsfelder im Test und ein ungenutzter Generatorparameter wurden entfernt; sonst keine Vereinfachung gefunden. Die Roadmap in `todo.md` wurde für die Übergabe an ein ausführendes Modell detailliert. Neu sind dort Arbeitsweise, Geschmacksstandards, Datei-Hinweise und Fertig-Kriterien je Aufgabe. Ausgeführt wird künftig 2 → 3 → 5A → Cutover (4) → 6 → 7 → 8, damit `LearningItem` erst im Cutover entfällt.
- Nebenbefunde außerhalb des Feature-Freezes, nicht behoben, aber in `todo.md` eingeplant (K4.11, K5.9, K3.9):
  - `scripts/create_apkg_quality_fixtures.py` exportiert wegen `ExportLimit` statt `DeckIdLimit` die ganze Sammlung.
  - Der Import meldet noch „produktive Medienablage bleibt ein späterer Ausbaupunkt“.
  - Das Filter `{{tts …}}` gibt den Feldtext doppelt aus.

## 2026-10-06 — Inhaltsschema und Feld-HTML-Vertrag (K0.2, K0.3)

- `NoteContent` in `coreTypes.ts` beschreibt den universellen Inhalt nach ADR-033: Felder mit den Rollen Frage, Antwort, Hinweis, Zusatz, Quelle und Notiz; genau eine Abfrageart (Aufdecken mit einer Liste von Abfragen, Auswahl, Lückentext oder Bildverdeckung); Vorlesen je Feld; Tags. Eine Abfrage nennt Schlüssel, Namen, eine meist ausgeblendete Anweisung für festen Vorlagentext, Vorder- und Rückseitenfelder, eine optionale Feldbedingung (`all`/`any`) und optional ein Eintippfeld. Damit bleiben auch Anki-Notiztypen mit mehr als zwei Richtungen ohne Kartenverlust abbildbar.
- `src/coreModel/noteContent.ts` validiert fremde Inhalte mit deutschen Meldungen. Daneben leitet es die Abfrageschlüssel deterministisch ab: erfüllte Abfragen über ihren Schlüssel, `choice`, `cloze:N` einschließlich `{{c1,2::…}}` und Verschachtelung sowie `io:N`. Wie in Anki entsteht keine Karte mit leerer Vorderseite. Medienreferenzen werden aus dem Inhalt abgeleitet statt gespeichert.
- `sanitizeNoteHtml` erhält Auszeichnung, Farben, relative Schriftgrößen, Listen, Tabellen mit Rahmen, Innenabständen und Prozentbreiten, Ruby, lokale beziehungsweise eingebettete Medien und absolute Web-Links. Entfernt werden Schriftarten, feste Größen, Positionierung, Klassen, IDs, Datenattribute, relative Links, Remote-, `blob:`- und Script-Inhalte. Der bestehende `sanitizeCardHtml` bleibt unverändert, bis der Renderer in Phase 3 umgestellt wird.
- Audit des fertigen Diffs: Eine Nachbearbeitung, die leere Attribute entfernen sollte, löschte auch die Wörter „src“, „href“, „style“ und „poster“ aus normalem Text. Die Prüfung liegt jetzt im Attribut-Hook des Filters, gilt nur für erlaubte Attribute und decodiert HTML-Entities vorher. Medienreferenzen werden ebenfalls decodiert (`c&amp;d.png` → `c&d.png`). Für beide Fälle gibt es Regressionstests.
- Schema und Sanitizer sind bewusst noch nicht an Erstellung, Import oder Darstellung angeschlossen; das geschieht in Phase 2, 3 und 5.
- Nachweise: 11 Schema-Tests mit Beispielen für Basic, Basic und umgekehrt, optional umgekehrt, Eintippen, drei Richtungen mit Anweisung, Lückentext, AnKing-artige Feldrollen, Single/Multiple Choice/Kprim und Bildverdeckung, 3 neue Sanitizer-Tests neben den 4 bestehenden; `npm run typecheck` einschließlich Dokumentationsgate.

## 2026-10-06 — Ausgangsmessung für das neue Kartenmodell (K0.1)

Referenz für den Vergleich nach ADR-032 bis ADR-036. Gemessen auf dem lokalen Entwicklungsrechner mit dem Kartenmodell nach ADR-029; Rohdaten liegen lokal in `test-results/baseline/`.

**Speicherbedarf je 1.000 Inhalte.** `npm run measure:footprint` erzeugt mit `anki==26.5` ein APKG aus Ankis Standardnotiztypen (je 1.000 Notizen Basic, Basic und umgekehrt sowie Lückentext mit vier Lücken und Extra; rund 300 bis 450 Zeichen Text je Notiz). Der Import läuft über den produktiven APKG-Pfad. Die manuellen Szenarien verwenden dieselben Texte über `createLearningItemsFromEditorValue`. Alle Zeilen werden über `createCloudStateRows` in einer zurückgerollten Transaktion in die lokale Datenbank geschrieben. Postgres misst `pg_column_size` je Zeile einschließlich der Trigger-Projektion `card_catalog`. Sync misst das JSON der Zeilen, Browser das UTF-8-JSON der IndexedDB-Kartenkörper. Angaben in MiB, Lernfenster in KiB.

| Szenario | Karten | Postgres gesamt | davon `cards` | davon `card_catalog` | Sync | Browser-Kartenkörper | Lernfenster 50 Karten |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| APKG Basic | 1.000 | 4,87 | 3,71 | 1,15 | 4,66 | 4,35 | 223 |
| APKG Basic und umgekehrt | 2.000 | 10,60 | 7,73 | 2,87 | 9,77 | 9,16 | 235 |
| APKG Lückentext (4 Lücken) | 4.000 | 23,84 | 19,31 | 4,53 | 23,95 | 22,72 | 291 |
| Manuell Basic | 1.000 | 4,46 | 3,52 | 0,94 | 4,07 | 3,77 | 193 |
| Manuell Basic und umgekehrt | 2.000 | 9,20 | 7,06 | 2,15 | 8,16 | 7,57 | 194 |
| Manuell Lückentext (4 Lücken) | 4.000 | 22,46 | 17,52 | 4,94 | 21,56 | 20,37 | 261 |

Notiztyp-Definitionen belegen je Szenario unter 2 KiB. Eine importierte Lückentext-Karte trägt rund 3,3 KiB Inhaltskopien (`contentDocument`, `originalHtml`, `originalFields`, `originalFront`/`originalBack`, `canonicalQuestion`/`canonicalAnswer`, `title`) und rund 0,8 KiB Lernstand-JSON mit 37 Schlüsseln. Der eigentliche Notiztext umfasst rund 0,6 KiB je Notiz.

**Startzeiten.** `npm run performance:measure:local` mit 4-facher CPU-Drosselung und je zehn Läufen:

| Kennzahl | p75 | p95 | Grenze | Ergebnis |
| --- | ---: | ---: | ---: | --- |
| Wiederkehrender Start mit IndexedDB | 927,5 ms | 953,8 ms | – | – |
| Offline-Kaltstart | 677,1 ms | 705,5 ms | – | – |
| Start ohne Service Worker | 1.435,1 ms | 1.455,8 ms | – | – |
| Neues Gerät bis Dashboard | 3.958,8 ms | 4.187,4 ms | 3.000 ms (p75) | überschritten |
| Automatischer 4G-Preload, längste Aufgabe | – | 73 ms | 50 ms | überschritten |
| Persistierte Stapelzusammenfassung | 18,7 ms | – | – | – |
| Statistik-RPC (100k Karten, 1 Mio. Reviews) | 490,0 ms | 522,0 ms | – | – |
| Katalogsuche (100k Karten) | 125,1 ms | 295,2 ms | – | – |

Die Überschreitung beim Start eines neuen Geräts war bereits am 3. Oktober 2026 bekannt (3.821,6 ms und 3.097,5 ms). Die Preload-Überschreitung trat in dieser Messung zusätzlich auf. Beide Werte sind Teil der Ausgangslage und wurden nicht korrigiert.

**APKG-Import.** `npm run benchmark:apkg` mit 25.000 Karten und 1.000 Medien (14,2 MiB): Median 10,5 s gesamt und 10,2 s im Worker, maximal 425 MiB Worker-Heap, längste Main-Thread-Verzögerung 32,4 ms, Ergebnisübergabe 0 ms.

## 2026-10-05 — Specs an den UI-Katalog angeglichen

- Specs und gemeinsamer Dokumentationsrahmen verwenden CoRe-Typografie, Abstände, Radien, Rahmen, Flächen, Controls und Lucide-Icons. Die Inhaltsnavigation markiert die Scrollposition auch innerhalb langer Abschnitte und ist unter 1280 px aufklappbar; Escape schließt sie mit Fokus-Rückkehr und erhält den Suchfilter.
- Die Markdown-Quelle wurde um 457 Wörter gestrafft; alle 35 Überschriften und 274 Aufzählungsregeln bleiben erhalten. Der Generator ergänzt eine nachvollziehbare Codeumfang-Projektion aus aktuellen Quellen mit den produktiven `SegmentedDonut`- und `StatTile`-Komponenten. Der Ring zeigt Bildschirmcode je Produktbereich; gemeinsam genutzter Code und API stehen separat. Produktfunktionen und Roadmap bleiben unverändert.
- Nachweise: neun fokussierte Dokumentationstests, Typecheck einschließlich `check:docs`, Produktionsbuild und Bundlebudgets. Chromium 149.0.7827.55: sechs Dokumentationsseiten in Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720, 1440 × 900 sowie 600/601 und 1279/1280 × 900. Kein horizontaler Seitenüberlauf. Specs zusätzlich mit langen Texten, Tabellen, Codegrafik, geöffnetem Menü, Suche/Nulltreffern, Scrollspy, Direktlinks, Browser-Zurück und Escape geprüft. Screenshots und Browserbericht liegen lokal in `test-results/specs-ui/`.
- Offen: echte Smartphone-Bildschirmtastatur, physische Touch-/Screenreader-Prüfung und nativer 200-%-Browser-Zoom. Die Zoomprobe verwendet 720 × 450 CSS-Pixel bei DPR 2 und ersetzt diese Nachweise nicht. Die App wurde als Stilreferenz angesehen; Auth-/Cloud-Flows gehören nicht zu dieser Dokumentationsänderung.

## 2026-10-03 — Token-Vereinheitlichung und Vorher-/Nachher-Vergleich

- Die Produkt-UI verwendet sechs gemeinsame Rundungen, zwei Elevationen plus Vertiefung und Auswahl, Rahmen mit 1/2 px sowie zentrale Schriftgrößen, Zeilenhöhen und Gewichte. Die sechs bisherigen Schriftgrößen bleiben erhalten; freie kleine Beschriftungen, Sonderrundungen, Schatten und ähnliche Panelabstände sind behutsam zusammengeführt. Zwölf redundante Status-Aliasse entfallen. Semantische Farben und fachliche Stapeltiefen bleiben erhalten; importierte Kartengestaltung und PDF-Textgeometrie bleiben in ihren Besitzern. Der Theme-Vertrag verhindert die erneute Einführung freier Geometrieklassen.
- Der Katalog zeigt zusätzlich echte Produkt-Screens mit lokalen Demodaten. Der temporäre A/B-Vergleich enthielt 88 Fälle mit 352 eingebetteten Vorher-/Nachher-Bildern in Light/Dark, Such- und Bereichsfilter sowie gemeinsame Vergrößerung. Grundlage war der isolierte Ausgangsstand mit identischen Fixtures und Zeitpunkt. Standardbreite 1440 px, mobile Navigation zusätzlich einmal bei 390 px. Menüs, Dialoge, Karteneditor, Textwerkzeuge, laufender Timer und Choice-Auswahl/-Lösung waren enthalten. Nach der Freigabe zur Veröffentlichung wurden Vergleichsdatei, Ausgangskopie und temporäre Vergleichsskripte auf Nutzerwunsch entfernt. Demos und generierte HTML-Seiten bleiben aus ihren Quellen aktualisiert.
- Modultests in 102 Dateien, Typecheck einschließlich Dokumentationsgate sowie Produktionsbuild und Bundlebudgets bestehen. Initialgraph 217,5 KiB gzip, größter Lazy-Graph 168,7 KiB gzip. Bedienprüfungen der Vergleichsdatei bestanden ohne Laufzeitfehler. Separate Chromium-Nachweise bleiben in `test-results/ui-token-validation/matrix/`: 15 Screens und Navigation über die sechs Pflichtgrößen sowie 1279/1280 × 900 in beiden Themes; zusätzliche Vergrößerungsprobe mit 200 % CSS-Zoom. Komponenten und geöffnete Zustände wurden am Vergleich visuell geprüft; dies ersetzt keine vollständige Geräte- oder Cloud-Abnahme.
- Audit des fertigen Diffs: keine weitere belegbare Produktionsvereinfachung oder Performance-Optimierung gefunden. Der Typografie-Test bewahrt bei der Token-Umstellung zusätzlich die bisherigen Prüfungen von Schriftfamilien und Gewichten; alle elf Theme-Prüfungen bestehen.
- Das vollständige `npm run gate:push` besteht nach dem Audit. `npm run performance:measure:local` wurde zweimal ausgeführt: zunächst neuer Geräte-Start p75 3.821,6 ms und persistierte Stapelzusammenfassung p75 110,5 ms, anschließend ohne parallele Builds 3.097,5 ms beziehungsweise 9,8 ms. Damit bleibt ausschließlich der Geräte-Start über seinem 3.000-ms-Budget. Die übrigen Grenzwerte einschließlich des 100k-Karten-/1m-Review-Statistikbenchmarks bestehen. Messungen liegen in `test-results/ui-token-validation/performance-first.json` und `performance-repeat.json`; die Grenzwerte wurden nicht verändert. Der Nutzer hat am 3. Oktober 2026 ausdrücklich eine einmalige Ausnahme für den Main-Push dieser Token-Umstellung erlaubt. Die Ausnahme ändert weder die Performance-Grenzwerte noch die Anforderungen für weitere Änderungen.
- Der vorhandene Überstand der Überschrift „Lerneinstellungen“ bei 320 px ist im Ausgangsstand identisch (300 px verfügbar, 316 px Textbreite, 36 px Schrift). Beim schnellen Theme-/Viewportwechsel des PDF-Katalogs wurde eine RenderingCancelledException vor und nach der Umstellung beobachtet. Beide angrenzenden Probleme bleiben außerhalb dieser Token-Umstellung. Reale Smartphone-Tastatur, physischer Touch/Screenreader, nativer Browserzoom und authentifizierte Cloudabläufe bleiben ungeprüft. Die lokale Änderung ist nach dem A/B-Vergleich zur Veröffentlichung freigegeben.

## 2026-10-02 — Audit der Dokumentation und UI-Korrekturen vor Main-Push

- Fertigen Diff und direkt betroffene App-, Katalog- und Erzeugungspfade geprüft. Eine unerreichbare Vorschau-CSS-Regel für `h2` entfernt; die Varianten verwenden ausschließlich `h3`. Den widersprüchlichen Specs-Satz zu schmalen Tabellenüberschriften an die bereits geprüfte Ellipsendarstellung mit vollständigen zugänglichen Namen angeglichen und den Quellenstand aktualisiert. Keine weitere belegbare Vereinfachung oder Performance-Optimierung gefunden; keine zusätzliche Produkt- oder Designänderung.
- `npm run gate:push` besteht mit Typecheck, Dokumentationsgate, allen Unit-/Contract-/Integrationstests in 102 Dateien sowie Produktionsbuild und Bundlebudgets. Initialgraph 217,7 KiB gzip, größter Lazy-Graph 168,8 KiB gzip. Nach der ausschließlich dokumentarischen Auditkorrektur sind die HTML-Ausgaben regeneriert und erneut auf Quellenstand, Inventar und Verweise geprüft. Die separat vorgestellten Designvarianten bleiben bis zur Auswahl Vorschauen.

## 2026-10-02 — UI-Korrekturen und Dokumentation nach Elementfamilien

- Reguläre und kompakte Segmente richten Icon und Text gemeinsam mittig aus. Der leere Dashboard-Einstieg verwendet dieselben Aktionskarten wie „Erstellen“; die drei bisherigen Sonderstile und die doppelte Kartenimplementierung entfallen. In beiden Kartenlisten ersetzen graue Haken-/Strich-Icons die Ja-/Nein-Pills. Feste Iconplätze richten markierte Sterne untereinander aus; schmale Tabellenköpfe überlagern sich nicht mehr.
- Der Katalog ordnet 55 Komponenten, lokale Kennzeichnungen und native Eingaben genau 18 Elementfamilien zu. Doppelte fachliche Muster sind zusammengeführt oder ihrer Elementfamilie zugeordnet. Eigene CSS-Klassen zeigen ausschließlich Verwendungen. `project.html` samt Erzeugung und Navigation entfällt; `architecture.md` enthält auf rund einem Fünftel der ursprünglichen Textmenge weiterhin Zuständigkeiten und Invarianten. Rückbauhistorie entfällt aus den Specs. Die Stapelzeile aus der Rückmeldung ist weiterhin produktiv und bleibt erhalten; ihre Demo entspricht wieder der App-Konfiguration.
- `design-review.html` zeigt die bestehenden Einstiegskarten A sowie alternative Verdichtungen B/C und drei kompaktere Meldungsdichten mit symmetrischen sichtbaren Iconabständen. Diese Vorschau-Styles werden erst nach Auswahl übernommen. Die fremde SmarterNutrition-Referenz bleibt unverändert.
- Abgenommen: 60 fokussierte UI-/Screen-/Modell-/Dokumentationstests, Typecheck einschließlich Dokumentationsgate, Produktionsbuild und Bundlebudgets. Browsernachweise in `test-results/docs/revision/`: 60 Leserfälle, zwölf Design-Freigabefälle und zwölf Segmentfälle in den sechs Pflichtgrößen und beiden Themes; zusätzlich alle 22 Katalogbereiche bei 320 und 1440 px in Light/Dark. Die gerenderten Verbraucher Einstieg, Erstellen, Dashboard und beide Kartenlisten verwenden echte Komponenten mit lokalen Fixtures. Kein horizontaler Hauptscroll; lange Datumswerte, zentrierte Segmente und ausgerichtete Sterne geprüft. Vorschau-Schließen-Aktionen bleiben 44 px hoch.
- Keine neue Auth-/Cloud-Abnahme und keine vollständige Wiederholung sämtlicher geschützter Screens. Physische Smartphone-Tastatur, Touch, Screenreader und nativer 200-%-Zoom bleiben offen. Historische Iframe-Konsolenmeldungen werden durch diese Renderprüfung nicht als behoben behauptet. Keine Veröffentlichung, kein Commit und kein Push.

## 2026-10-02 — Gemeinsame HTML-Dokumentation und vollständiger UI-Katalog

- Alle elf Markdown-Rollenquellen, die drei bisherigen HTML-Referenzen sowie die Projekt-, Screen- und UI-Einstiege auf Quellenzuständigkeit, Verweise und veraltete Aussagen geprüft. Falsche Importversprechen, Varianten-Lernstände, Hierarchiegrenzen, ADR-Status und Heatmap-Farbwahl korrigiert; historische Nachweise und weiterhin notwendige Formatverträge erhalten. `specs.md` ist gegenüber dem übernommenen Arbeitsstand um rund 1 % kürzer; die sieben Journeys und ihre Akzeptanzregeln bleiben vollständig.
- `docs/README.md` ersetzt `docs/index.md`. Docs, Specs, Journeys und UI-Elements teilen die Namen und Navigationsstruktur mit SmarterNutrition; Kartentypen und Projektwissen ergänzen die CoRe-spezifischen Rollen. Die fremde Referenz wurde ausschließlich gelesen. Ein Generator ersetzt den alten Teilgenerator und erzeugt alle sechs HTML-Seiten aus den kanonischen Quellen und echten App-Komponenten. Keine Produktionsabhängigkeit ergänzt und kein Produktcode geändert; parallel vorhandene Änderungen wurden erhalten.
- Der Katalog enthält sämtliche 49 gemeinsamen Komponenten einschließlich des gemeinsamen Lernkopfs sowie fünf besondere Produktansichten, 83 Tokens, Typografie, kanonische CSS-Regeln mit Bedingungen und 125 importierte Icons. Die sechs manuell erstellbaren Kartentypen verwenden den echten Reviewrenderer. README-Dateien und `AGENTS.md` verankern `docs:build`, `check:docs` und die Pflege der Demos; Typecheck prüft erzeugte Ausgaben, Rollen, Verweise und fehlende Komponentendemos.
- Abgenommen: sieben Dokumentationsprüfungen, Typecheck, Produktionsbuild und Chunk-Budget. Im Codex-In-App-Browser wurden alle sechs HTML-Seiten in Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720 und 1440 × 900 erfasst; 72 Seitenfälle ohne horizontales Hauptscrolling. Zusätzlich 72 geöffnete Dialog-/Menü-/Navigationszustände, 60 besondere Produktansichten, Kartentypen mit Aufdecken und Choice-Rückmeldung sowie Umbruchgrenzen geprüft. Screenshot- und JSON-Nachweise liegen lokal unter `test-results/docs/`; sie belegen die Dokumentationsdemos mit lokalen Beispieldaten und ersetzen keine Auth-/Cloud-Abnahme.
- Offen bleiben echte Smartphone-Bildschirmtastatur, physische Touch-/Screenreader-Prüfung und 200-%-Browser-Zoom. Beim Iframe-Neuladen meldet die Browserumgebung teilweise einen `MutationObserver`-Fehler ohne Quellenangabe; die Zuordnung bleibt offen. Die Karten rendern und reagieren, die skriptfreie Iframe-Gegenprobe reproduzierte die Meldung nicht. Eine fehlerfreie Browserkonsole wird daher nicht als abgenommen behauptet.

## 2026-10-02 — Testportfolio geprüft und gestrafft

- Alle 106 ursprünglichen Modultestdateien sowie zwölf Browser-, zwei RLS- und die Start-/Preload-Performance-Suite anhand der aktuellen Besitzer und Verträge geprüft. Drei Mini-Suites sind in ihre Besitzer integriert; umfangreiche selbst geprüfte Typfixtures sind durch Compile-Verträge ersetzt. Zwei doppelte History-/Review-Exit-Journeys, SSR-Tautologien und reine Klassen-/Dekorationsduplikate entfallen. Der Laufzeittestcode schrumpft um mehr als 360 Zeilen; der gesamte Diff bleibt einschließlich Dokumentation und neuer Typverträge negativ.
- Kleine Regressionstests ergänzen Workerabbrüche, Cloudrevisionen/JSONB-/Manifestgrenzen und den Cache-/Outbox-Schutz. Dabei gefundene Fehler korrigiert: APKG-Workerabbrüche während des Commits lassen den Import nicht mehr hängen; Arrays werden vor der Record-Transformation als ungültige JSONB-Objekte abgewiesen. Theme-Kontrast wird anhand der tatsächlich verwendeten CSS-Tokens geprüft. Fehlende Long-Task-Beobachtung bricht die Startmessung ausdrücklich ab, statt ein scheinbar grünes Nullergebnis zu liefern.
- Quality enthält alle schnellen Unit-/Contract-/Integrationsprüfungen. Nightly verwendet einen vollständigen Release-Lauf und ergänzt im selben Supabase-Lebenszyklus nur den abweichenden Beta-Auth-Vertrag. Alle sechs Golden-Journeys sind in Beta enthalten; fokussierte Golden-/Beta-/PR-Läufe starten einen statt vier Vite-Servern. Bestehende Authkonfigurationen bleiben in der Vollsuite.
- Abgenommen: 519/519 Modultests in 102 Dateien, Typecheck samt UI-Katalog, Production-Build und Bundlebudgets. APKG-Benchmark mit 25.000 Karten/1.000 Medien/fünf Vorschaukarten und 0 ms gemessener Workerübergabe bestanden; drei Parserläufe 8,8–32,7 s unter wechselnder Rechnerlast. Kein belastbarer Laufzeitgewinn aus diesem Audit ableitbar.
- Browserauswahl per `--list`: 99 Journeys plus Auth-Setup, davon sechs Golden, 23 Beta und neun Hosted. Tatsächliche Browser-/RLS-/Datenbankdrift-Abnahme offen: Docker Desktop scheitert beim Start seines internen Inference Managers; Hosted wurde nicht ausgeführt. Keine produktive UI geändert. Lernpuffer-/Quota-Servicepfade und Messintegritätslücken bleiben im [`Testportfolio`](test-portfolio.md) priorisiert.

## 2026-10-01 — Stapelaktionen und einheitlicher Lernkopf

- Audit vor dem Main-Push: redundante No-op-Bedingung in der Platzierungsvalidierung entfernt und einen 4-px-Abstandsfehler zwischen Kennzahlen und Donut bei mittlerer Inhaltsbreite korrigiert. Veraltete Browsertestannahmen für Mehrfachauswahl, Aufklappbutton, Speichermeldung und Play nach dem Verschieben sind an die bestehenden Produktverträge angepasst. 84 fokussierte Prüfungen, die vollständige Suite aus 106 Testdateien, das erneute Push-Gate, alle zwölf Stapel-Browsertests sowie 14 lokale RLS-/Zwei-Geräte-Tests und der Typendriftcheck bestehen. Der aktualisierte Nachweis enthält 54 Renderfälle einschließlich 820 px ohne Überlauf, Laufzeitfehler oder ungleichmäßige Kennzahl-/Donutabstände. Keine weitere belegbare Performance-Optimierung gefunden. Auch das lokale Performance-Gate besteht: 50 gedrosselte Start-/Preload-Messläufe und der 100k-Karten-/1m-Review-Benchmark halten alle Grenzwerte ein; Statistik-RPC p95 461,4 ms, Katalogsuche p95 48,09 ms, größte Clientprojektion p95 4,56 ms.

- Play liegt in Dashboard und Lernen direkt neben den Stapeloptionen hinter dem Donut. Beide Icons sind bei unveränderter 44 × 44-px-Klickfläche größer und füllen sich bei Hover beziehungsweise geöffnetem Menü in der jeweiligen Textfarbe; ihre Hintergrundfläche bleibt transparent. Beide Lernansichten verwenden denselben Header mit Lerneinstellungen links und der regulären, rechtsbündigen Bereichsauswahl.
- Abgenommen: 32 fokussierte Tests, vollständige Suite aus 106 Testdateien, Typecheck samt UI-Katalog sowie Produktionsbuild und Chunk-Budget. 48 Chromium-Renderfälle prüfen Dashboard, Lernen und Kartenverwaltung über die Pflichtmatrix in beiden Themes ohne Überlauf oder Laufzeitfehler. Sechs Interaktionsfälle bei 320, 390 und 1440 px prüfen Bereichswechsel, Lerneinstellungen, Play, Tastatur, Optionsmenü/Escape, Hover auf Ebene 1 und 6 sowie Reduced Motion. Screenshots verwenden echte Komponenten mit lokalen Beispieldaten; Auth-, Cloud- und native Geräteflows wurden nicht erneut abgenommen. Der temporäre Render-Einstieg wird entfernt; der Screenshot-Nachweis liegt außerhalb des Repositorys.

## 2026-10-01 — Schmale UI und visueller Prüfnachweis

- Ergänzung: Die visuelle Stapeltiefe endet jetzt auf Ebene 6 bei unverändert vollständiger logischer Hierarchie. Light- und Dark-Farben werden in sechs linearen sRGB-Stufen zwischen den bisherigen Endfarben verteilt. Audit der Änderung und von Commit `415b05b`: keine weitere belegbare Vereinfachung oder Performance-Optimierung; ungenutzte Tiefen-6/-7-Tokens und Zeilenregeln sind entfernt. 64 fokussierte Tests, vollständige Suite (105 Dateien), Typecheck, Produktionsbuild und Chunk-Budget bestehen. 112 Renderfälle und 48 geöffnete Stapelauswahlen bestehen die visuelle Matrix in beiden Themes; die 13-stufigen Unterbäume bleiben auf Dashboard und Lernen auf-/zuklappbar. Browsernachweis mit lokalen Fixtures, keine neue Auth-/Cloud-/Geräteabnahme.

- Dashboard-Begrüßung und Lern-Bereichswechsel passen auf schmale Ansichten; die Bereichs-Pill bleibt 44 px hoch und Lerneinstellungen behalten ihr Icon. Single Choice und Multiple Choice bleiben in einer gemeinsamen Pill mit bei Bedarf zweizeiligen Labels.
- Der Stapelvergleich verwendet auf schmalen Inhaltsflächen bestehende Kennzahlflächen; der lokale Stapelname öffnet die fünfteiligen Stapelinhalte. Die Kartenverwaltung behält ihre Tabellenzeilen. Rich Text erhält eine kurze Toolbar mit ausklappbaren vorhandenen Zusatzaktionen. Die Heatmap verwendet das gemeinsame Zeitraum-Dropdown und zweizeilige Tageslabels bei unveränderter Legende.
- Abgenommen: fokussierte Tests, vollständige Modul-/Contract-/Integrationssuite aus 105 Dateien, Typecheck samt UI-Katalog und Produktionsbuild mit Chunk-Budget. 112 Chromium-Renderfälle prüfen sieben echte Produktansichten mit lokalen Beispieldaten in Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720, 1440 × 900, 1279 × 900 und 1280 × 900 ohne Seiten- oder Control-Überlauf und ohne Laufzeitfehler. Bereichswechsel, Choice-Auswahl, Toolbar/Textselektion, Farbmenü/Escape, Cloze-Erstellung/Entfernung, Tastaturauswahl und alle Heatmap-Zeiträume sowie der Statistiklink ins Stapelmenü bestehen. Fünf Ansichten bestehen zusätzlich bei 200 % CSS-Zoom ohne Seitenüberlauf; die automatisch geladene Specs-HTML zeigt den geänderten Vertrag.
- Der lokale Screenshot-Bericht enthält sieben Vergleiche mit den alten gehosteten Aufnahmen, Zusatzansichten und das vollständige Renderarchiv. Er ist ein Nachweis echter Komponenten mit Beispieldaten; gespeicherte Authentifizierung, Cloud-Sync und persistente Speicherflows wurden nicht abgenommen. Echte Smartphone-Bildschirmtastatur, physische Touch- und Screenreader-Abnahme sowie nativer Browser-Zoom bleiben offen. Der temporäre Render-Einstieg und die vorherigen Designentwürfe werden entfernt; keine Produktionsabhängigkeit oder paralleler App-Pfad wurde ergänzt.

## 2026-09-30 — Gleitende Hauptnavigation und Statistik-Ladewechsel

- Die zweizeilige untere Hauptnavigation teilt Positionsmessung, Indikator und Bewegung mit den segmentierten Controls. Icon und Tab-Name bleiben sichtbar; Resize und Reduced Motion verwenden denselben Vertrag.
- Statistik-Filterwechsel erhalten ausschließlich das aktuell angezeigte Ergebnis bis zum Ersatz. Auswahl und Dropdownbeschriftung reagieren sofort. Variante A läuft ohne sichtbaren Schriftzug als 3-px-Balken über den vollständigen Filterinnenraum; 8 px Abstand und Balkenhöhe bleiben immer reserviert. Der vollständige Ladebildschirm erscheint beim initialen Eintritt. Überholte Antworten werden verworfen, Aktualisierungsfehler behalten Daten und Filter mit Wiederholung und Rückfokus auf die Zeitraumwahl. Zusätzliche Caches, Abfragen, Vorladung oder Warmhaltung wurden nicht eingeführt.
- Abgenommen: 36 fokussierte Screen-/UI-/Statistikprüfungen, vollständige Modul-/Contract-/Integrationssuite aus 105 Dateien, Typecheck einschließlich UI-Katalog sowie Produktionsbuild und Chunk-Budget. Browserprüfungen verwendeten echte Komponenten mit kontrollierten Antworten für initiales Laden/Fehler, sofortige und verzögerte Antworten, Reihenfolgekonflikte, Zeitraum-/Stapelwechsel, Fehler/Wiederholung, Tastatur, zugängliche Fortschritts-/Live-Semantik und stabilen Fokus/Scroll. Die originalen Reduced-Motion-Regeln wurden auf der Testseite aktiviert und anhand der berechneten Styles geprüft; ein separater Screenreader-Lauf wurde nicht durchgeführt. Light/Dark und 320, 390, 430, 640, 768, 1024, 1280 und 1920 px passen ohne Seitenüberlauf; der Balken schließt links/rechts bündig mit den Filtern ab. In der angemeldeten lokalen App blieb die Filterbox beim Wechsel 125 px hoch; der Screenshot zeigt ihren echten laufenden Ladezustand. Initialgraph 217,5 KiB gzip, größter Lazy-Graph 168,6 KiB gzip, größter Chunk 452,4 kB.

## 2026-08-29 — Unbegrenzte logische Stapelhierarchie

- Die fachliche Acht-Ebenen-Grenze und die APKG-Abflachung sind entfernt. Anlegen, Desktop-Drag, bestätigtes Verschieben und Import erhalten unmittelbare Elternbeziehungen, vollständige Pfade und beliebig tiefe Unterbäume; Reimporte bewahren die lokale Ordnung aus Name, Elternstapel, Pfad und Einstellungen.
- Ebene 8 bleibt ausschließlich die maximale sichtbare Einrückung und Tiefenfarbe. Bibliotheks- und Auswahlprojektionen laufen iterativ; Teilbaumaggregate verwenden direkte Kinder und `descendantCount` statt vollständiger Nachfahrenlisten. Überlaufwarnung, Herkunftssymbol, doppelter Suchpfad und vorbereitende Überlaufmetadaten wurden entfernt, ohne Karten- oder Anki-Tags zu verändern. ADR-031 löst ADR-030 ab; der Tag-TODO enthält keine System-Tag-Ableitung mehr.
- Abgenommen wurden 85 fokussierte Hierarchie-, Import-, Bibliotheks-, Auswahl-, Screen- und Themeprüfungen, die vollständige Suite mit 502 Tests, Typecheck einschließlich UI-Katalog sowie Production-Build und Chunk-Budget. Der gezielte Playwright-Lauf wurde gestartet, konnte aber ohne die ausdrücklich isolierten E2E-Supabase-Zugangsdaten nicht über das Auth-Setup hinauslaufen; die neue 13-stufige Desktop-/Mobiljourney bleibt für diese Umgebung ausführbar hinterlegt.

## 2026-08-28 — Globale Lerneinstellungen und Stapelstandards

- Die sichtbaren `Karteneinstellungen` heißen jetzt durchgehend `Lerneinstellungen`, bleiben unter dem kompatiblen Pfad `/karten-einstellungen` erreichbar und stehen als separater, typografisch vereinheitlichter Button neben der Bereichsauswahl. Allgemeine Einstellungen bleiben auf Konto, Daten/Sync und `Über uns` begrenzt.
- Die globale Seite besitzt nun `Lerntag & Planung`, `Tagesrunde & Lernprofile`, `Scheduler & CoRe` und `Fokuswerkzeuge`. Lernprofile lassen sich dort als Standard wählen; die Speicherleiste unterscheidet den Standard nur für neue Stapel von der ausdrücklichen Übernahme auf alle vorhandenen und neuen Stapel. Name, Hierarchie, Darstellung, CoRe-Modus, Karten und Reviewhistorie bleiben dabei erhalten.
- `Profile.schedulerPreferences` normalisiert Version 2 ohne Datenbankmigration auf Version 3 mit einem vollständigen globalen Stapelstandard. Manuelle, importierte und Demo-Stapel erhalten ihn bei der Neuerstellung; Reimporte behalten lokale Einstellungen. Das Copy-on-Apply-Prinzip vorhandener Stapel bleibt bestehen.
- Abgenommen wurden 51 fokussierte Einstellungs-/UI-Tests, die vollständige Suite mit 500 Tests, `npm run gate:push` einschließlich Unit-/Contract-Gate, Typecheck, UI-Katalog, Production-Build und Chunk-Budget. Der lokale Browser-Smoke bestand bei 1.352 × 900 und 390 × 844 px ohne Fehleroverlay, Konsolenwarnung oder horizontalen Überlauf; ohne lokale Testsitzung blieb die Live-Prüfung erwartungsgemäß am Auth-Gate, während die geschützte Einstellungsansicht über Renderingtests verifiziert wurde.

## 2026-08-28 — Stapeleinstellungen auf Unterstapel übertragbar

- Die Speicherleiste der Stapeleinstellungen unterscheidet das Speichern des gewählten Stapels vom rekursiven Speichern für den Stapel und alle Unterstapel. Die Baumoption erscheint nur bei vorhandenen Unterstapeln.
- Rekursives Speichern übernimmt feldgenau nur die gegenüber dem gespeicherten Stand geänderten Darstellungs-, Lern-, Scheduler- und CoRe-Werte. Unterstapelnamen und nicht geänderte individuelle Werte bleiben erhalten; alle betroffenen Stapel laufen durch eine gemeinsame lokale Metadatenmutation und die bestehende Sync-Outbox.
- Abgenommen wurden 15 fokussierte Draft-, Speicherleisten- und Stapeleinstellungs-Tests, Typecheck, Production-Build einschließlich Chunk-Budget sowie ein lokaler Browser-Smoke mit HTTP 200, sichtbarem Auth-Gate und ohne Konsolenfehler oder Vite-Overlay. Die angemeldete Einstellungsroute wurde im Browser-Smoke mangels Testsitzung nicht geöffnet.

## 2026-08-28 — Achtstufige Stapelhierarchie

- CoRe unterstützt Hauptstapel plus sieben Unterebenen. Eine gemeinsame reine Projektion flacht APKG-Quellknoten ab Ebene 9 als getrennte Geschwister auf sichtbare Ebene 8 ab; stabile IDs, Karten-Zuordnung, vollständiger Anki-Pfad, Quelltiefe und ursprünglicher Elternpfad bleiben erhalten.
- Manuelles Anlegen und Verschieben lehnt Ebene 9 sowie weiterhin zu tiefe Altbaum-Platzierungen ohne Mutation ab. Acht lineare Light-/Dark-Gruppentöne, Einrückung bis Tiefe 7, zweizeilige schmale Stapelnamen, Importwarnung, Herkunftssymbol, Originalpfad im Menü sowie Suche und Auswahl über beide Pfade sind umgesetzt. Kartentags und Persistenzschema blieben unverändert; die spätere System-Tag-Projektion ist ausschließlich als Folgefeature dokumentiert.
- Abgenommen wurden 66 fokussierte Hierarchie-, Import-, Workspace-, Such-, Auswahl- und Themeprüfungen, die vollständigen Unit-/Contract-Kategorien mit 98 Testdateien, Typecheck einschließlich UI-Katalog und Production-Build. Die tatsächliche gemeinsame Stapelzeile wurde bei 1.280 × 900 und 390 × 844 px geprüft: acht Tiefenflächen, Begrenzung auf Tiefe 7, genau zwei Namenszeilen, zugänglicher Herkunftshinweis, kein horizontaler Überlauf und keine Browserwarnung.

## 2026-08-18 — Replica-v2 auf frische Pre-Release-Baseline gehärtet

- Die vierzehnteilige Supabase-Kette und der doppelte Schemaanker wurden durch eine einzelne frische Baseline plus Verify-SQL ersetzt. Lokaler Reset, generierte Typen, Typdrift und 13/13 RLS-/Zwei-Geräte-Fälle sind grün. Die alten Voll-Delta-/Bootstrap-RPCs, `due_count` und der administrative Katalog-Backfill fehlen nachweislich.
- IndexedDB und Mediencache verwenden frische v2-Datenbanken mit Schema-Version 1 ohne Upgrade-, Marker- oder Legacy-localStorage-Pfade. Lokale v5-Stapelprojektionen, Fälligkeits-Buckets und deren Rebuildzustände wurden entfernt; Summary, Katalogindex und `AccountStudyOverview` bilden den einzigen Studienpfad.
- Serverpagination liefert exakt die angeforderte Keyset-Seite. Medienblobs führen alle referenzierenden Stapel und werden beim Pinnen per SHA-1 geprüft. Bootstrap-Browserlistener enden nach dem ersten Erfolg; Online-Statistik überspringt den lokalen Vollscan und liefert begrenzte Aggregate für alle vorhandenen Panels.
- Abgenommen wurden 625/625 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Schema-Verify, warnungsfreier DB-Lint, Typdrift, 13/13 RLS-/Zwei-Geräte-Fälle sowie das lokale Playwright-Release-Gate mit 94 bestandenen und einem erwartbar übersprungenen Test. Der wiederholte gedrosselte Lauf bestand mit Wiederholungsstart p75/p95 678/751 ms, Offline-Kaltstart 677/806 ms, Frischstart p75 2.640 ms, persistierter Summary p75 8,7 ms und keinem gemessenen Hintergrund-Long-Task. Der Build maß 228,5 KiB initial und 163,1 KiB im größten Lazy-Graphen.
- Die transaktionale 100k-Karten-/1m-Review-Fixture misst den tatsächlichen SQL-Pfad: Karten-Suche p75/p95 47,54/51,22 ms, Statistik-RPC lokal p75/p95 459,52/462,23 ms und Clientprojektion höchstens 5,72 ms p95. Lokale `EXPLAIN (ANALYZE, BUFFERS)` lagen für den kalten Bootstrap bei 532 ms, Delta 12 ms, Kartenliste 3 ms, Hydrierung 14 ms, Manifest 5 ms und die kleine Statistik 11 ms.
- Projektliste, Link und vorhandene Daten identifizierten `hirbiuiydczmnjqtoyqx` eindeutig als `CoRe-Database` in Frankfurt: vor dem Reset 5 Auth-Nutzer, 12 Sitzungen, 108 Objekte im privaten `core-media`-Bucket, 51 Stapel, 551 Karten und 7.561 Reviews. Das getrennte Projekt `smarter-nutrition` blieb unberührt. Sitzungen, Storage-Objekte und Auth-Nutzer wurden über ihre vorgesehenen APIs gelöscht; anschließend wurde das bestätigte Pre-Release-Projekt ohne Seed aus der einzigen Baseline neu aufgebaut.
- Die Statistikfunktion vermeidet nach einem YAGNI-Audit den teuren beliebig genauen `numeric`-Potenzscan und berechnet ausschließlich die begrenzten 5-Prozent-Retrievability-Buckets in `double precision`. 366.000 Kombinationen aus Stabilität und verstrichenen Tagen ergaben keine Bucketabweichung. Lokal sank der tatsächliche 100k-/1m-RPC von p75/p95 1.304/1.540 ms auf 459,52/462,23 ms; der Katalogpfad blieb mit 47,54/51,22 ms deutlich unter seinem Gate. Der Performancefix ist Commit `f16e62f`.
- Die gehostete kanonische Fixture umfasste 100.000 Karten und tägliche Rollups über genau 1 Mio. logische Reviews. Warme p95-Werte lagen bei Bootstrap 146,50 ms, Delta 24,29 ms, Kartenliste 112,65 ms, Hydrierung 3,62 ms, Manifest 21,77 ms und Statistik 984,12 ms; erste kalte Aufrufe blieben mit höchstens 2.406,37 ms unter dem 3-Sekunden-App-Kaltstartgate. `EXPLAIN (ANALYZE, BUFFERS)` wurde für alle sechs Replica-Lese-RPCs erfasst. RLS zeigte 100.000 Eigentümerkarten und 0 Karten aus einem fremden Account. Ein zusätzlicher Versuch mit 1 Mio. physischen `review_events` überschritt das aktuelle Hosted-Volume und wurde vollständig zurückgerollt; diese Retention-/Kapazitätsgrenze bleibt offen.
- Das isolierte staged Production `dpl_Daropk4PSerq8wzKUmS8iSPxzST8` unter `https://core-hosted-napbxmcwd-bengt2.vercel.app` war `READY`; der Build maß 228,5 KiB initial und 163,1 KiB im größten Lazy-Graphen. Der geschützte Hosted-Lauf bestand mit einem Auth-Setup und neun Kernverträgen. Es erfolgte keine Promotion der kanonischen Domain. Danach wurden Testaccount und zwei Testmedien gelöscht und das Remote-Projekt erneut zurückgesetzt: Auth, Sitzungen, Storage-Objekte, Profile, Stapel, Karten, Katalog, Reviews und Rollups stehen bei 0; der leere private `core-media`-Bucket, Schema-Verify und Remote-DB-Lint sind grün.

## 2026-08-17 — Hybride Offline-Replica

- Supabase besitzt additive, accountisolierte Projektionen für Kartenkatalog und Stapelstatistiken sowie versionierte, bytebegrenzte RPCs für Bootstrap, Katalogdelta, Suche, Kartenhydration, Statistik und Offline-Manifeste. Kanonische Karten, Varianten, Dokumente und Reviews bleiben die Schreibwahrheit; Projektionstrigger verändern keine fachliche Revision.
- IndexedDB v6 trennt Stapel-Hüllen, Summaries, Katalog, vollständige Kartenkörper, Residency, Offline-Manifeste, Statistik-Snapshots und Synczustand. Die Migration arbeitet fortsetzbar in höchstens 250er-/25-ms-Abschnitten. Ein Hydration-Service übernimmt Kartenöffnung, serverseitig ergänzte 50er-Seiten, Lernfenster, vollständige Deck-Downloads, Medienprüfung und Quota-LRU.
- Bekannte Geräte starten aus der lokalen Replica; neue Geräte warten nur auf eine bestätigte erste Bootstrap-Seite. Ein fehlgeschlagener Erstabgleich erzeugt keine falsche Leeransicht und wird mit 2/10/30/120 Sekunden, danach fünfminütig sowie bei Online, Fokus und manueller Aktion wiederholt. Ein Race zwischen Bootstrap und bereits versendeten Offline-Profiländerungen wurde geschlossen.
- Kartenverwaltung und Lernen zeigen Katalogdaten sofort und laden Körper bedarfsgesteuert. Der Lernstart wartet nur auf die erste benötigte Karte, hält je nach Verbindung 50 oder fünf Karten vor und lädt bei 25 verbleibenden Karten nach. Angeheftete Downloads werden erst nach Karten-, Revisions-, Abhängigkeits- und Medienprüfung als offline verfügbar markiert; lokale Änderungen und aktive Lernfenster bleiben vor Bereinigung geschützt.
- Statistiken lesen serverseitige Aggregate mit optimistischer lokaler Ergänzung. Export und Reimport hydratisieren benötigte Cloud-Strukturen vollständig; accountweite Stapelbaum-Löschungen werden online serverseitig ausgeführt oder offline als Deckkommando vorgemerkt.
- Lokal bestätigt wurden 644 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Datenbankreset und -typdrift, Schema-Verifikation, 13/13 RLS-/Zwei-Geräte-Fälle sowie fokussierte Browserjourneys für Offline-Profil-Sync, Offline-Review, Kartenhydration, Direktlinks, Lernstart, Löschen, Restore, Varianten, Portabilität, schmale Kartenverwaltung und große scrollende Stapel. Die großen 10k/250k- und 100k/1m-Lastfixtures sowie Messungen am tatsächlich konfigurierten Hosted-Projekt bleiben als dokumentierte Skalengates offen.

## 2026-08-16 — Adaptive Preloads und lokale Stapelprojektionen

- Automatisches Idle-Preloading lädt `Lernen` und `Karten` seriell nur bei 4G oder fehlender Network-Information. 3G erlaubt ausschließlich Hover, Fokus oder Touchstart; Save-Data, 2G, unsichtbare Tabs und Nutzerinteraktion verhindern weitere Spekulation. Der kontrollierte 4G-Lauf verursachte keinen Long Task, alle 3G-Läufe blieben ohne automatischen Preload. Ein weiterer Editor-Chunk-Split war deshalb nicht erforderlich.
- IndexedDB v5 hält löschbare Stapelprojektionen, Fälligkeits-Buckets, einen Stapel-/Kartenindex und einen fortsetzbaren Rebuild-Checkpoint. Einzelne Karten- und Reviewwrites aktualisieren die Ableitung atomar; Bulk-, Cloud-, Restore- und Konfliktpfade markieren betroffene Stapel dirty. Rebuilds arbeiten in höchstens 250er-/25-ms-Abschnitten, prüfen Dirty-Token und Kontext und schließen Konfliktkarten aus. Tagesfortschritt liest nur den aktuellen Lerntag, historische Heatmapwerte stammen weiterhin aus den stündlichen Reviewzählern.
- Der finale gedrosselte Lauf mit je zehn Wiederholungen bestand vollständig: Wiederholungsstart p75/p95 0,742/0,831 Sekunden, Offline-Kaltstart 0,482/0,576 Sekunden, Frischstart p75 2,786 Sekunden, persistierter Summary-Read p75 7 ms und längster direkt gemessener Projektions-/Hintergrundabschnitt 9,4 ms. Der Service Worker war im p75-Vergleich 576 ms schneller und blieb unverändert. Der Production-Build maß 217,3 KiB gzip im Initialgraphen und 163,1 KiB im größten Lazy-Graphen.
- Repositoryverträge decken unterbrochenen Rebuild, Reload, Review, Kartenänderung, Cloud-Delta/-Reset, Konflikte, Tageskontextwechsel und einen 100k-Karten-/1m-Reviews-Vertrag ohne vollständigen Karten-, Varianten- oder Reviewread beim normalen Boot ab. Die vollständige 100k-Browserjourney und Feldmessung bleiben als LATER-Nachweis offen.
- Der Reviewstart aus den Stapeleinstellungen ersetzt deren Browser-History-Eintrag nun anhand der tatsächlich sichtbaren Ansicht; dadurch entsteht kein doppelter, identischer Review-Eintrag. Abgenommen wurden alle 625 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, das vollständige Performance-Gate, Datenbanktypdrift, 12/12 RLS-/Zwei-Geräte-Fälle und das lokale Playwright-Release-Gate mit 90 bestandenen und einem erwartbar übersprungenen Test.

## 2026-08-16 — Reproduzierbare Startmessung

- Datenbanköffnung, Shell, Outbox samt vier Sync-Metadaten und erste Stapelzusammenfassung besitzen getrennte anonyme Performancephasen. Outbox und Sync-Metadaten werden in einer gemeinsamen Readonly-Transaktion geladen; Profil- und Karteninhalte gelangen nicht in das Artefakt.
- Das lokale Production-Gate misst je zehn Starts für einen wiederkehrenden Browser, einen frischen isolierten Kontext, einen persistenten Kontext ohne Service Worker und einen Offline-Kaltstart bei 1,6 Mbit/s, 150 ms RTT und vierfacher CPU-Verlangsamung.
- Der gemessene Wiederholungsstart bestand mit p75 0,69 Sekunden und p95 0,74 Sekunden, der Offline-Kaltstart mit p75 0,44 Sekunden und p95 0,49 Sekunden. Der Frischstart bestand mit p75 2,78 Sekunden. Der Service Worker war im p75-Vergleich 560 ms schneller und erhält daher kein Navigation-Preload.
- Das Gesamtgate bleibt rot, weil der längste Hintergrundtask 231 ms statt höchstens 50 ms benötigte. Die erste Stapelzusammenfassung dauerte bis 503 ms und verursachte den 231-ms-Long-Task; ein spekulativer Feature-Load überlappte maximal 58 ms. Gemäß Roadmap wird die dauerhafte O(Stapel)-Projektion deshalb in NOW vorgezogen und das Preload-Task-Budget nachgehärtet; große Inhaltstrennung und Navigation-Preload bleiben zurückgestellt.

## 2026-08-15 — Profilintegrität nach Local-first-Start

- Das Auf- und Zuklappen eines Stapels schreibt wieder das vollständige Profil. Gemeinsame Laufzeitprüfungen weisen unvollständige Profilwrites vor IndexedDB und vor dem Supabase-Upsert zurück.
- Der erfolgreiche Cloud-Bootstrap entfernt ausschließlich alte unvollständige Profilpatches, übernimmt das vollständige Cloud-Profil, rettet gültige UI-Präferenzen und reiht nur bei einer Abweichung genau einen vollständigen Ersatzpatch ein. Vollständige Offline-Profiländerungen sowie Karten-, Review-, Import- und Medienmutationen bleiben erhalten; offline wird nichts verworfen.
- Abgenommen wurden 60 fokussierte Profil-, Repository-, Boot- und Cloudtests, 616/616 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Datenbanktypdrift, 12/12 RLS-Fälle sowie das vollständige lokale Playwright-Gate mit 90 bestandenen und einem erwartbar übersprungenen Test. Der neue Browservertrag bestätigt Stapelumschaltung, Einstellungen, Reload und einen frischen isolierten Kontext mit demselben Cloud-Profil.

## 2026-08-15 — Local-first Performance-Grundlage

- Der Accountstart öffnet nach einer Accountprüfung zuerst die lokale IndexedDB-Shell. Profil-/Stapel-Bootstrap, global cursorbasierte und bytebegrenzte Account-Deltas, Konflikte, Reparatur und Medien laufen nach. Kartenverwaltung und Lernen lesen 50er-Seiten; die Sitzung fordert bei 15 verbleibenden Karten nach. Ein eingerichtetes Gerät kann bei einem reinen Netzwerkfehler aus derselben persistierten Supabase-Sitzung offline kalt starten.
- Produktscreens, Supabase-Client, Cloud-/Mediencode und Statistikmodell werden dynamisch geladen. Lernen und Karten werden nach einer ruhigen Sekunde seriell vorbereitet; Datensparmodus, langsames Netz, Hintergrundtab und Interaktion stoppen Spekulation. Der Production-Build sank gegenüber 271,6 KiB Ausgangswert auf 211,8 KiB gzip im Initialgraphen; der größte Lazy-Graph misst 163,1 KiB gzip.
- Die ausführbaren Gates, Performance-Marken, PWA-App-Shell, persistente Speicheranfrage und sichtbare Quotenanzeige sind vorhanden. Der Browser-Smoke bestätigte Login-Shell, fehlendes Fehleroverlay, null CLS, 184 ms lokales LCP, 6,8 ms lokales TTFB und keinen horizontalen Überlauf bei 390 px; dies ersetzt ausdrücklich nicht den offenen gedrosselten 100k-/1m-Nachweis.
- 110 fokussierte Performance-, Repository-, Sync-, Auth- und Pagingprüfungen sowie alle 605 Modul-/Contract-/Integrationstests, Typecheck, Dokumentationscheck, Production-Build und JavaScript-Syntaxcheck des Service Workers waren grün. Datenbanktypdrift und RLS konnten mangels laufendem Docker Desktop nicht ausgeführt werden; die neue SQL-Migration bleibt deshalb vor Merge lokal nachzuprüfen.

## 2026-08-14 — Synchronisation 2.0

- Der kanonische `syncNow()`-Zyklus schreibt lokale IndexedDB-Transaktionen, überträgt Outbox-Mutationen einzeln, lädt anschließend alle `sync_change_id`-Deltas und aktualisiert Konflikt- und Statusdaten. Manueller Sync lädt auch bei leerer Outbox; Autosync ist accountgebunden und reagiert entprellt auf lokale Änderungen, Start, Online, Fokus sowie ein sichtbares Intervall von 0, 1, 5, 15 oder 30 Minuten.
- Fachliche Inhaltsrevisionen ignorieren technische Eigentümer-, Zähler-, Import- und Projektionsfelder. Reviews bleiben idempotente append-only Ereignisse, erhöhen keine Inhaltsrevision und überschreiben den Lernstand nur, wenn sie zeitlich neuer sind. Fehlende Originalvarianten vorhandener Cloud-Karten sowie technische Alt-Abweichungen werden idempotent repariert; ein Konflikt blockiert nur die betroffene Entität.
- Aktive Konflikte sind pro Account, Tabelle und Entität eindeutig. Konfliktkarten werden aus der Lernwarteschlange genommen, bleiben in der Kartenverwaltung sichtbar und können gesammelt mit einer Folgenvorschau für `Dieser Browser` oder `Cloud im Account` aufgelöst werden. Die Richtungsentscheidung entfernt die verursachende Outbox-Mutation; Reviews, Medien und konfliktfreie Inhalte bleiben unberührt.
- Navigation und globale Einstellungen zeigen Sync-Status, Konfliktzahl, ausstehende Änderungen, letzte erfolgreiche Synchronisierung, Intervall und einen vollständigen manuellen Sync. IndexedDB bleibt beim Schließen die sichere Wiederanlaufwahrheit; der letzte Browser-Sync ist ausdrücklich nur bestmöglich.
- Lokal bestanden 66 fokussierte Sync-/Repository-/Einstellungsprüfungen, alle 585 Modul-, Contract- und Integrationstests, Typecheck, Produktionsbuild, Schema-/Typdriftprüfung und 12/12 RLS-/Zwei-Geräte-Fälle. Der Sync-Konfliktpfad wurde im In-App-Browser auf Desktop und Mobil einschließlich Richtungsfolgen, Light/Dark und manuellem Vollabgleich geprüft. Der vollständige lokale Browserlauf wurde ausgeführt, bleibt im gemeinsamen uncommitteten Arbeitsbaum aber mit 16 Fehlschlägen in bereits parallel geänderten Import-, Navigations-, Kartenprofil-, Medien- und Statistikpfaden offen; 66 Fälle bestanden, einer wurde übersprungen.

## 2026-08-13 — Dependency-Sicherheitsgate geschlossen

- `pdfjs-dist` wurde gezielt auf 6.2.108 und `postcss` auf 8.5.26 angehoben. PostCSS besitzt weiterhin die transitive Abhängigkeit auf `nanoid`, die das Lockfile ohne direkte Projektabhängigkeit auf 3.3.18 auflöst; weitere Dependency-Upgrades gehörten nicht zu diesem Sicherheitspaket.
- Ein sauberes `npm ci` reproduzierte den Lockfile-Stand, und `npm audit --omit=dev` endete mit null Schwachstellen. Sieben PDF-/Worker-Fokustests, 542/542 Modul-, Contract- und Integrationstests, Typecheck, Production-Build und Bundlebudgets blieben grün.
- Das lokale Beta-Gate bestand mit 22/22 Browserfällen einschließlich Beta-Login und PDF-Quellenanker. Das Release-Gate bestätigte Datenbanktypdrift, 12/12 RLS-Prüfungen sowie 79 bestandene und einen erwartbar übersprungenen Browserfall.

## 2026-08-13 — Dynamische Karten- und Skalierungshärtung

- Karteninhalt besitzt mit `LearningItemDocumentV1` und deduplizierten Notetype-Definitionen eine Schreibwahrheit; vollständige Definitionen und Quellsnapshots werden nicht mehr über Kartenmetadaten dupliziert. Renderer und Templatecache sind synchron und von der initialen Core-Seam getrennt. Die öffentlichen Exporte sanken gegenüber dem Freeze in `coreModel` von 66 auf 52, in `apkgImport` von 32 auf 4 und in `cloudRepository` von 24 auf 18.
- APKG erzeugt Commitgraph, Bericht und höchstens fünf Samples genau einmal im Worker und streamt den Graphen in IndexedDB-Chunks. Der produktive Browserpfad besitzt keinen Direktparser-Fallback; die Protobuf-Dekoder werden als eigener Lazy-Chunk geladen, wodurch der Main-Thread-APKG-Chunk von 96,9 auf 87,3 kB sank. Boot, Kartenbrowser, Review und Statistik verwenden begrenzte Entityabfragen; eine Reviewantwort schreibt lokal eine Transaktion und synchronisiert genau einen atomaren RPC. Cloudlisten verwenden 500er-ID-Keyset-Seiten, begrenzte Writes und keinen vollständigen Readback.
- Gegen die eingefrorene Basis von 7.017 zusätzlichen handgeschriebenen Produktionszeilen verbleiben nach demselben Filter 5.564 Zeilen, also 20,7 Prozent weniger. Der Production-Build hält die komprimierten Budgets; der initiale Hauptchunk misst 478,5 kB roh statt rund 492 kB am Freeze.
- Lokal bestätigt: 542/542 Modul-, Contract- und Integrationstests, Typecheck einschließlich UI-Katalog, Production-Build, Datenbank-Reset über beide neuen Migrationen, Typgenerierung und Typdrift, Schema-Verifikation, 12/12 RLS sowie der vollständige Release-E2E-Lauf mit 79 bestandenen und einem im normalen Release-Modus erwartbar übersprungenen Beta-Artefakt-Test. Das Golden-Gate bestand separat mit Auth-Setup und sechs Kernjourneys.
- Der abschließende 25.000-Karten-/1.000-Medien-APKG-Median lag bei 15,01 Sekunden Gesamt- und 14,68 Sekunden Workerzeit, rund 688 MiB Workerheap, 25,73 ms maximaler Main-Thread-Verzögerung und 0,41 ms Ergebnisübergabe. Das überschreitet die frühere optionale Rust-Spike-Schwelle, Rust/WASM bleibt aber bewusst außerhalb dieses Pakets. `npm audit --omit=dev` meldet drei bekannte Findings im unverändert eingefrorenen PDF.js-/PostCSS-Stand und transitivem `nanoid`; die frühere Aussage „ohne Production-Vulnerability“ ist damit nicht mehr aktuell und wird nicht als Gate dieser Härtung behauptet.

## 2026-08-12 — Dynamische Karteninhalte und erhaltender Anki-Import

- Das kanonische Inhaltsmodell ist feldzentriert: `LearningItemDocumentV1`, unveränderliche Notetype-Definitionen und stabile Variantenprojektionen ersetzen feste Kartentypen als fachliche Wahrheit. Die manuelle Erstellung beginnt mit Vorder- und Rückseite und ergänzt Bilder, Lücken, Rückrichtung, Multiple Choice und weitere Felder als kombinierbare Aktionen beziehungsweise Rezepte.
- Legacy- und V18-APKG erhalten bekannte und unbekannte Notetype-, Feld- und Template-Konfigurationen einschließlich Roh-Protobuf, CSS, IDs, Medien- und Schedulerquellen. Dreiwege-Reimport schützt lokale Feldänderungen; jede Anki-Card bleibt eine separat reviewbare Variante. Ein gemeinsamer CSP-/Sandbox-Renderer versorgt Importvorschau, Kartenverwaltung und Review und zeigt bei nicht sicher ausführbaren Funktionen eine diagnostizierte Feldansicht.
- CSV- und Tabellenimporte besitzen eine bestätigungspflichtige, ausschließlich deterministische Spaltenzuordnung; der APKG-Integritätspfad bleibt davon getrennt.
- Zwei agentische Browserrunden prüften Erstellung, CSV-Mapping, importierte Felder und gemeinsame Präsentationen in Light/Dark, Reduced Motion, per Tastatur sowie von 320 bis 1.920 px und an den tatsächlichen Breakpoints. Gefundene P1-Befunde zu Cloze-Auswahl, Dirty-State, Statusmeldungen und Reflow wurden behoben; die zweite Runde fand in den erneut geprüften Kernpfaden keine offenen P0/P1. Die isolierte Auth-Oberfläche bestand zusätzlich bei exakt 160 CSS-Pixeln ohne Clipping, Konsolen- oder Seitenfehler.
- Der damalige Zwischenstand bestätigte 624 Modul-, Contract- und Integrationstests, Typecheck einschließlich UI-Katalog, Production-Build mit einem größten Hauptchunk von 491,9 kB, Datenbanktypdrift, Schema-Verifikation, die vollständige 12-Test-RLS-Suite und den 25.000-Karten-/1.000-Medien-APKG-Benchmark. Persistierte Playwright-Durchstiche bestanden für den kompletten Basic-Lebenszyklus sowie die Latest-APKG-Analyse; die nachfolgende gemeinsame Skalierungshärtung und ihr geschlossener Release-Lauf sind im Eintrag vom 13. August dokumentiert.

## 2026-08-11 — Hierarchische Tageslimits, Sortierung und Easy Days

- Eine gestartete Baumrunde berücksichtigt Neu- und Reviewbudgets jedes enthaltenen Stapels und seiner aktiven Vorfahren. Reviews sowie tagesübergreifende Lernschritte reservieren Reviewbudget vor neuen Karten; Intraday-Schritte umgehen Limits. Durch Limits verborgene fällige und neue Karten werden am Start und Abschluss verständlich ausgewiesen.
- Lernprofile und materialisierte Stapeleinstellungen führen getrennte Sortierungen für neue Karten und fällige Reviews. Alter, stabiler Lerntagszufall, Überfälligkeit und tatsächliche FSRS-Abrufwahrscheinlichkeit bestimmen die Auswahl vor dem bestehenden Modus `Neue zuerst / Gemischt / Wiederholungen zuerst`.
- Der globale Wochenrhythmus führt je Wochentag `Normal`, `Weniger` oder `Minimal`. Easy Days verteilt ausschließlich neue Review-Tagesintervalle von 3 bis 90 Tagen innerhalb des offiziellen FSRS-Fensters anhand der Last aller aktiven Stapel; Vorschau und Commit teilen denselben DST-sicheren Kontext. Profil-JSONB und Portabilität wurden ohne Schemaänderung erweitert.
- Die fokussierte Abnahme war unmittelbar nach beiden Paketen mit 102 Prüfungen grün; der nachgelagerte Vereinfachungsaudit bestand mit 70 betroffenen Queue-/Scheduler-/Bibliotheksprüfungen sowie sechs Easy-Days-Grenzfällen. Die Browserabnahme bestätigte Light und Dark bei 390, 768 und 1.440 px, Tastaturauswahl und fehlenden horizontalen Überlauf. Die Paket-Builds waren grün. Im abschließenden gemeinsamen Arbeitsbaum wurden `typecheck`, `build`, `npm test` und `test:beta` zusätzlich ausgeführt, blieben aber ausschließlich an parallel entstehenden, sachfremden APKG-/HTML-Sicherheitsänderungen hängen; das lokale Supabase-Browsergate war bereits ohne laufendes Docker Desktop extern blockiert.

## 2026-08-11 — Getrennte globale und stapelspezifische Einstellungen

- Globale Stapel-Defaults und die fehlerhafte Bulk-Mutation wurden entfernt. Tagesbeginn und Vorziehfenster werden accountweit an Queue und Sitzung übergeben; Tageslimits, Scheduler und CoRe bleiben materialisierte Stapelwerte.
- Eigene benannte Lernprofile sind konto-weite, versionierte Copy-on-apply-Vorlagen. Cloud- und lokale Normalisierung sowie Portabilität transportieren die Bibliothek ohne Datenbankmigration; Import-ID-Kollisionen werden sicher getrennt.
- Beide Einstellungsseiten besitzen drei responsive CoRe-Bereichskarten, direkte Quernavigation und mobil stabile Seitenköpfe. Die decklose Route bietet eine Stapelauswahl; Sprache ist ehrlich als `Deutsch (Beta)` gekennzeichnet.
- Lokal bestätigt: 525 Modul-, Contract- und Integrationstests, Typecheck, Production-Build sowie Browserabnahme in Light und Dark bei 390, 768 und 1.440 px. Die Profiljourney Anlegen, Anwenden, lokal Ändern und Speichern funktionierte ohne horizontalen Überlauf; zwei nachgelagerte Agentenaudits fanden und verifizierten die Legacy-, Import- und Vereinfachungskorrekturen.

## 2026-08-10 — Globaler Pomodoro-Timer

- Ein einziger accountgebundener, browserlokaler Timer wird aus globalen Einstellungen oder Lerneinstellungen gestartet. Er speichert Start, Ende und Dauer statt heruntergezählter Zwischenstände, ersetzt einen laufenden Timer sofort und bleibt dadurch über Hintergrunddrosselung, Navigation, Reload und weitere Tabs driftfrei.
- Der laufende Timer erscheint im Review, in der Desktop-Sidebar und unterhalb von 1.280 px als 22 px hohe Projektion in der Kopfleiste. Der Lernbalken behält ohne Timer den Zustand `Nicht gestartet`; globale Projektionen verschwinden nach dem Ablauf. Der vorhandene schließbare Toast meldet exakt `Timer abgelaufen.`.
- Lokal bestätigt: 27 fokussierte Timer-/UI-Tests, die vollständige Modulsuite mit 505 Tests, Typecheck und Production-Build. Das lokale Datenbankgate bestätigte 11 RLS-/Storage-/Zwei-Geräte-Prüfungen. Playwright bestätigte automatisiert den Start aus den Lerneinstellungen sowie Ablauf, Entfernung und Toast; der interaktive In-App-Browser bestätigte zusätzlich Ganzzahlfehler und ARIA-Zustand, globalen Start, sofortigen Ersatz, Navigation, Reload und Tab-Synchronisierung. Die visuelle Prüfung bei 390, 767, 768, 1.279 und 1.280 px ergab keinen horizontalen Überlauf, den vorgesehenen Navigationswechsel und keine Konsolenwarnungen oder -fehler.

## 2026-08-06 — Anki-inspirierte Statistik im CoRe-Design

- Der bisherige Statistikpfad wurde durch ein einziges indexiertes Projektionsmodell und einen lazy geladenen CoRe-Screen ersetzt. Eine globale Auswahl steuert 30 Tage, 90 Tage, ein Jahr oder den Gesamtverlauf sowie Sammlung, Oberstapel und deduplizierte Mehrfachauswahl. Aktivität, Lernzeit, Kalender, Planung, Bestand, Intervalle, FSRS, Antwortverhalten, wahre Erinnerungsquote, Stapelvergleich und schwierige Karten verwenden dieselbe Projektion und höchstens 240 aggregierte Punkte je Reihe.
- Reviewantwortzeiten werden von der sichtbaren Karte bis zur Bewertung monoton gemessen, bei 60 Sekunden gedeckelt und optional im bestehenden Review-Event gespeichert. Der APKG-Pfad übernimmt zuordenbare Anki-Revlog-Ereignisse deterministisch und duplikatfrei ausschließlich für Analysen; aktuelle Fälligkeit und FSRS-State bleiben neutral.
- Neu sind ausschließlich `recharts@3.10.1` und das dazu passende direkte `react-is@19.2.7`. Der Production-Build hielt das feste Chunkbudget mit einem 477,2-kB-Statistikchunk ein.
- Lokal bestätigt: 447 Modul-/Integrationsprüfungen, Typecheck, Production-Build sowie ein reproduzierbarer Lauf mit 250.000 synthetischen Review-Ereignissen. Nach der featurekonstanten Projektionsoptimierung benötigte der abschließende Lauf 68 ms für den Index, 311 ms für den kalten Standardzeitraum, 8–29 ms für anschließende Wechsel zwischen 30 Tagen, 90 Tagen und einem Jahr sowie 327 ms für den Gesamtverlauf; Diagrammreihen blieben bei höchstens 115 Punkten und der tägliche Jahreskalender bei 365 Zellen. Es gilt bewusst kein geräteabhängiges CI-Zeitlimit. Die manuelle Browserabnahme in Light und Dark bei Desktop-, Tablet- und 390-px-Mobilbreite bestätigte globale Filter, Maus-/Touch-/Tastaturdetails und keinen horizontalen Hauptscroll.
- Der vollständige Modullauf war mit 441 Tests grün. Das lokale Release-Gate bestätigte Datenbanktypen und alle 11 RLS-/Storage-/Zwei-Geräte-Prüfungen; nur die anschließende vollständige Playwright-Suite blieb offen, weil ein parallel gestarteter fremder Dev-Server den vorgeschriebenen Port 5190 belegte.

## 2026-08-06 — Basic + Bilder und Kartentyp-Icons

- Die manuelle Erstellung unterstützt den neuen Kartentyp `Basic + Bilder`. Vorder- und Rückseite besitzen weiterhin Rich Text und zusätzlich je ein optionales Bildfeld mit Einfügen per Strg+V, Drag-and-drop, Dateiauswahl, Vorschau, Ersetzen und Entfernen.
- Alle Kartentypen zeigen ein eigenes Icon links vom Namen. Bild-Bytes bleiben im accountgebundenen Mediencache und der bestehenden Upload-/Retry-Queue; Karten und Cloud-JSONB speichern ausschließlich SHA-1-Referenzen.
- Der neue Typ durchläuft denselben validierten Front-/Back-, Kopier-, Persistenz- und Reviewvertrag wie Basic, bleibt aber bewusst von der textbasierten KI-Variantenroute ausgeschlossen. Es wurde keine Datenbankmigration und keine neue Abhängigkeit eingeführt.
- Lokal bestätigt: 421 Modul-, Contract- und Integrationstests, Typecheck, Production-Build sowie Browserprüfung bei Desktop-, Zwischen- und Mobilbreite. Icons, Dateiauswahl, Strg+V, Vorschau, Reset nach Speichern und Offline-Medienstatus funktionierten ohne Konsolenwarnungen oder horizontalen Überlauf.

## 2026-08-06 — Gemeinsame Stapelübersicht und Stapelaktionen

- Dashboard und Lernen verwenden dasselbe responsive „Aktive Stapel“-Panel; nur das Dashboard ergänzt die Aktion „Lernen öffnen“. Die während eines Drags sichtbare Hauptebenen-Dropzone bleibt dadurch außerhalb der Zeilen erreichbar.
- Pointer-Capture hält den gegriffenen Stapel auch außerhalb der Liste aktiv. Lift-Zustand, verstärkter Einfügeindikator und bestehende Platzierungsvalidierung machen gültige und ungültige Ziele eindeutig.
- Dashboard, Lernen und Kartenverwaltung verwenden dasselbe reduzierte Stapelmenü mit Erscheinungsbild, vollständigem Pfad, CoRe-Modus, Einstellungen und bestätigtem Verschieben. Umbenennen, Unterstapel, Lernen, Variantenlernen und Löschen liegen ausschließlich in den Stapel-Einstellungen.
- Lokal bestätigt: 416 Modul-, Contract- und Integrationstests, Typecheck, Production-Build und Browserprüfung bei Desktop-, Zwischen- und Mobilbreite. Hauptebenen- und Unterstapel-Drops, Menü, Dialog und Zielvalidierung funktionierten ohne Konsolenfehler.

## 2026-08-06 — App-weite Lernzeitsimulation

- Der isolierte FSRS-Testmodus, sein Fünf-Karten-Stapel, Verlauf und `/testmodus` wurden entfernt. `/simulator` steuert stattdessen eine transiente, kalenderbasierte Lernuhr für die vorhandenen Accountkarten.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Vollbildreview verwenden denselben simulierten Zeitpunkt. Reine Zeitwahl bleibt mutationsfrei; Zukunftsreviews werden über den bestehenden Scheduler-, Workspace- und Syncpfad dauerhaft gespeichert.
- Der aktive Zukunftstag ist in App-Shell und Review sichtbar. Schnellziele, einzelne Tagesschritte und ein auf zehn Jahre begrenztes Datumsfeld sind tastaturbedienbar; Reload und Logout setzen den Offset auf „Heute“ zurück.
- Es wurden keine Datenbankmigration, neue Abhängigkeit, Rollen-/Premiumlogik oder rücksetzbare Sandbox eingeführt.
- Lokal bestätigt: 413 Modul- und Integrationstests, Typecheck und Production-Build. Der In-App-Browser startete `/simulator` ohne Konsolenfehler; die geschützte Simulatoransicht selbst blieb ohne vorhandene lokale Anmeldung hinter dem Auth-Gate.

## 2026-08-01 — Labs- und Groß-APKG-Vorleistungen zurückgebaut

- Chat-your-Deck, Lernplan, Graph, Community-Demo, KI-Entwürfe/-Jobs, externer Varianten-JSON-Flow und technische APKG-Diagnose wurden aus UI, Domainmodell und Tests entfernt.
- `/api/ai/*`, `/api/imports/apkg`, Trigger.dev-Aufgaben, Upstash-/Trigger-Abhängigkeiten und der Server-APKG-Benchmark wurden entfernt. APKG bleibt lokal bis einschließlich 250 MiB.
- App-State v3 und Portable Export v2 enthalten nur Core-Daten; Legacy-Zustände und V1-Exporte werden beim Lesen bereinigt. Stapel sind implizit privat.
- Der Produktionsrückbau wurde gegen das über Vercel verifizierte Projekt `CoRe-Database` (`hirbiuiydczmnjqtoyqx`) ausgeführt. Sechs abgeschlossene KI-Jobzeilen sowie die pensionierten Tabellen und Spalten wurden entfernt; Labs-Decks, -Karten, Reviews, Konflikte und Medien waren nicht vorhanden.
- Der Storage-API-Lauf bestätigte 0 zu löschende `core-media`-Objekte und einen bereits fehlenden Bucket `core-imports`. Die pensionierten Vercel-KI-Variablen wurden aus Development, Preview und Production entfernt. `smarter-nutrition` blieb verbunden und unverändert.
- Lokal bestätigt: 346 Modul-/Integrationsprüfungen, Typecheck, Production-Build, Datenbanktypen, Beta-Core mit 22 Browserjourneys sowie Release mit vollständigem RLS/TUS, 51 Browserjourneys und lokalem 4.900-Karten-APKG-Benchmark. Die ausgemusterten Tabellen, Spalten und der Bucket `core-imports` fehlen im lokalen Zielzustand.
- Commit `5c741ad09c113455466e68970848190d0e476c78` wurde erfolgreich nach `main` ausgeliefert. Quality und Beta-Core waren grün; `extended-core` bestand im Wiederholungslauf in 7:14 Minuten. Der erste Versuch war ausschließlich beim Abruf des Supabase-`postgres-meta`-Images durch ein externes Registry-Rate-Limit fehlgeschlagen, nachdem alle 103 Integrationstests bestanden hatten.
- Vercel bestätigte genau diesen Commit. Die kanonische Startseite antwortete mit `200`, `/api/ai/chat` und `/api/imports/apkg` jeweils mit `404`.

## 2026-07-16 — Stapel-IA und URL-Kontext

- Ausgangs-Commit war `0474d1c6f1a7c5efb9f476b4109111b00d5c74ce`. Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen, verwenden aber denselben kanonischen URL-Kontext für View, Deck, Karte und Erstellziel.
- Der Reviewpfad serialisiert Reviewdeck, optionalen Variantenbezeichner und den diskriminierten Rückkontext `today | learn | decks` mit optionalem Rückdeck und Rückkarte. Alte Reviewpfade bleiben lesbar; freie Return-URLs werden nicht akzeptiert.
- Lokale parallele Deck-/Kartenselektion wurde aus `LearnScreen` und `DecksScreen` entfernt. Die Kartenverwaltung ist sekundär über `Karten verwalten` erreichbar, zeigt nur Inventarzahlen `im Stapel` und unterscheidet gleichnamige Unterstapel über vollständige Pfade.
- Ungültige oder gelöschte Deck-/Kartenlinks zeigen sichere deutsche Fallbacks und öffnen keine zufällige Ersatzkarte. Browser-Reload, Direktlink, neuer Tab sowie Zurück/Vorwärts erhalten den semantischen Kontext.
- `npm run typecheck`, 415 Modul-/Contract-/Integrationstests, Production-Build mit Chunkbudget, die fokussierten Navigationsjourneys A–G und das vollständige `npm run test:beta` mit 22 Browserflows waren grün.
- Es wurde keine Routerbibliothek, Datenbankmigration, Scheduler-/Queueänderung, KI-, Graph- oder Community-Funktion eingeführt.

## 2026-07-16 — Batch-Erstellung und Fehlertoleranz

- Die manuelle Erstellung bleibt nach jedem Save geöffnet, führt einen expliziten Batch-Session-State und beendet die Sitzung erst über `Fertig`. Pin-Reset, Zieldeck, vollständige Hierarchiepfade und Fokus sind deterministisch.
- Nichtleere fachliche Entwürfe sind durch einen zugänglichen Navigationsdialog und den Browser-Unload-Fallback geschützt; bereits gespeicherte Karten bleiben bei einem verworfenen Entwurf erhalten.
- Karten- und Stapellöschung verwenden produktspezifische Dialoge. Das unmittelbare Karten-Undo reaktiviert denselben Datensatz mit der bestätigten Tombstone-Revision und erhält den bestehenden Review State.
- Importmodi besitzen getrennte UI-Sessions und eine diskriminierte Zustandsprojektion. Formatwechsel entfernen alte Vorschau, Commitfähigkeit, Fehler und Fortschritt; Erfolg, Teilabschluss, Abbruch sowie retryable und terminale Fehler bleiben unterscheidbar.
- `npm run typecheck`, 411 Modul-/Integrationstests, Production-Build mit Chunkbudget, vier neue Beta-Core-Browserjourneys, der fokussierte retryable/cancelled-Serverterminal-Smoke und das vollständige `npm run test:beta` mit 20 Browserflows waren grün.
- Es wurde keine Datenbankmigration, KI-Arbeit, APKG-Parseränderung, Scheduleränderung oder neue Medieninfrastruktur eingeführt.

## 2026-07-16 — Typgerechter Kartenlebenszyklus

- Basic, Reverse, Cloze und Multiple Choice verwenden einen diskriminierten Editorwert und eine kanonische Save-Naht im Core Model; der normale Verwaltungsfluss speichert kein generisches `front/back/kind`-Patch mehr.
- Reverse-Richtung, Cloze-Lückengruppen und Multiple-Choice-Lösung werden atomar aktualisiert. Versionswiederherstellung, APKG-Reimport, Cloud-JSONB und Portabilität erhalten die strukturierten Inhalte.
- Der normale Reverse-Review zeigt die Originalrichtung; der ausdrücklich gestartete Variantenreview zeigt die synchronisierte Rückrichtung.
- Feldnahe Validierung, Rich-Text-Editoren, read-only Importfelder und progressive Herkunfts-/Versionsdetails sind in der Kartenverwaltung verfügbar.
- Unit-, Contract-, Persistenz- und fünf lokale Beta-Core-Browserjourneys einschließlich Kern-RLS waren grün. Es wurde keine Datenbankmigration und keine KI-, Provider- oder Adapterfunktion ergänzt.

## 2026-07-15 — Beta-Core-Gate lokal verifiziert

- Das neue blockierende `npm run test:beta` trennt den freigegebenen Kern von Labs-, Heavy- und Großdateipfaden. Die erweiterten Pfade laufen in CI separat und nicht blockierend.
- `npm run test:beta:local` bestand mit Kern-RLS, Registrierung und E-Mail-Bestätigung, Recovery und erneutem Login, fünf Kernjourneys, Offline/Reconnect, Konfliktstatus, kleinem APKG-Medienimport und Portabilitätsgrenzen.
- `npm run typecheck`, Unit-, Contract- und Integrationstests sowie `npm run build` waren grün. Der Build hielt das Chunk-Budget ein.
- Dies ist kein Hosted-Release-Nachweis: Preview, staged Production, realer Alarmempfang und getrennte DB-/Storage-Restore-Proben bleiben offen, weil kein dedizierter Hosted-Smoke-Account und kein Restore-Testprojekt für diesen Lauf bereitstanden.
- Der Nachweis enthält keine Secrets, Tokens, Nutzerinhalte, E-Mail-Adressen oder Authartefakte.

## 2026-07-15 — Produktvertrag und Dokumentation

- P0.1: Produktoberflächen wurden in Core, Labs und Disabled eingeordnet und zentral projiziert.
- P0.2: Der Review-/Variantenvertrag wurde korrigiert. Vor dem Reveal erscheinen keine Herkunfts-, Variantenlevel-, Reife- oder Schedulerhinweise; Original und Quelle erscheinen erst nach der Antwort.
- P0.3: Einstellungen zeigen die Login-E-Mail als Accountwert, erklären tatsächliche Datenschutzgrenzen und trennen Profil, Lernen, Sync/Daten sowie Erweitert.
- P0.4: Standardaccounts starten leer; Demo-Daten sind opt-in. Nach manueller Erstellung oder APKG-Commit führen stabile Folgeaktionen zu Lernen oder Kartenprüfung.
- P0.5: Core-/Labs-Einstiege, lesbare Quellformate, APKG-Hauptbericht und lokale Entwurfsassistenz wurden getrennt. Einzelne UX-Nacharbeiten bleiben offen.
- P0.6: Lernen und Stapelverwaltung wurden fachlich getrennt; Strukturänderungen sind explizit und bestätigt. Die moderierte Abnahme bleibt Teil des offenen P0-Gates.
- P1.1: Auth-/Account-Boot, Navigation, Sync- und Medien-Lifecycle wurden aus der App-Shell gelöst; Screen-Props sind konkret typisiert.
- P1.3: Tests wurden in Unit, Contract, Integration, Golden-E2E und Heavy-Release geordnet. Das Testportfolio steht in `docs/test-portfolio.md`.
- P1.4: Produktvertrag, Architektur, Status, Betrieb, Entscheidungen, Verlauf und offene Roadmap wurden in eindeutige Rollenquellen getrennt.

## 2026-07-14 — Cloud, Medien und Sync

- Revisionsgeprüfte Cloud-Mutationen, Konfliktprojektion, Soft-Deletes, Offline-Outbox und Zwei-Geräte-Vertrag wurden abgenommen.
- Der accountgebundene Medienpfad mit privatem Storage, Standardupload, TUS über 6 MiB, Signed URLs und reloadfester Pending-Queue wurde implementiert.
- APKG-Reimport bewahrt lokale Inhaltsänderungen und aktualisiert Import- sowie Medienmetadaten.
- Der lokale Datenbanktyp-Driftcheck, RLS-/Ownership-Smokes und Browserflows waren grün. Historische Testanzahlen werden nicht als heutiges Gate fortgeschrieben.

## 2026-07-13 — TypeScript und Architektur-Audit

- TypeScript wurde verbindlicher Standard in den produktiven Codewurzeln; `src/coreTypes.ts` wurde kanonische Typquelle.
- App-Shell, Core Model, Repository, Import und Sync wurden entlang ihrer bestehenden Modulgrenzen vertieft, ohne Produktfeatures zu entfernen.
- Lazy Loading, PDF.js-Split und das harte 500.000-Byte-JavaScript-Chunk-Gate wurden abgenommen.

## 2026-07-10 — Erstes protokolliertes Production-Release

- Commit: `e600ac4817f80c8ca8062df3aa2c706ee1f71178` (`e600ac4`).
- GitHub Actions: [Lauf 29121208290](https://github.com/Betogora/CoRe_Hosted/actions/runs/29121208290), `quality` und `browser-e2e` grün.
- Preview: `https://core-hosted-k77v2wj19-bengt2.vercel.app`, Deployment `dpl_ADcYAJBLJWcZ9mu2cMJPeMAyCMGG`.
- Vorherige Production: `https://core-hosted-38mw22988-bengt2.vercel.app`, Deployment `dpl_3HhXHhqRiL6dSqpRALwDc6dXuBYP`.
- Staged und anschließend kanonische Production: `https://core-hosted-94320qvku-bengt2.vercel.app`, Deployment `dpl_CCF8hGMt236krS8CdPW5W9G1yWM9`.
- Preview-Smoke 1–8, staged Kurzsmoke und Production-Kurzsmoke bestanden. Der Log-Scan enthielt keine 5xx- oder Error-Level-Treffer; ein Rollback war nicht erforderlich.
- Site URL und Redirect-Allowlist wurden nach Dashboard-Reload bestätigt; keine Secret-Werte wurden in den Nachweis übernommen.

## 2026-07-09 — Cloud-Grundlage

- Pflichtlogin, accountgebundene Cache-Keys, Cloud-first Autosave und Legacy-Datenübernahme wurden eingeführt.
- Supabase-Tabellen, RLS, accountgebundene Schlüssel und Auth-/Medienoperationen wurden über versionierte Migrationen und Verify-SQL abgesichert.

## Format für neue Einträge

Neue Einträge nennen Datum, abgeschlossenes Paket beziehungsweise Release, Ergebnis, relevante IDs und verbleibende Risiken. Sie enthalten keine Secrets, Passwörter, Tokens, Environment-Werte, personenbezogenen Daten oder Rohinhalte.
