# CoRe TODO

Stand: 2026-10-30

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität: P0 vor P1 vor P2. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig, „Später“ ist geparkt.

## P0: Karteneditor V2 mit Tags, Flaggen und Lernbremse

Roadmap für den Karteneditor V2 samt Tag-, Flaggen- und Lernbremsen-System.
Erledigte Pakete wandern datiert nach [`history.md`](history.md).

Die Startbedingung ist erfüllt: P1 R2–R7 (FSRS-7, Reifemodell ohne XP,
Datenbank-Cutover) liegt seit PR #52 auf `main`. Diese Pakete haben Scheduler,
`record_review_atomic`-Pfad, Kartenspalten, `card_catalog`, das Kartendetail
in `DecksScreen.tsx` und die Variantenfreigabe geändert. Der Editor-PR zweigt
vom aktuellen `main` ab.

Kein Scope Creep: Neues nur, wenn eine Entscheidung unten es verlangt.
Listenbasierte Funktionen gehören in die Kartenverwaltung V2 (siehe unten),
nicht in den Editor.

### Zielbild

Grundlage sind die Ist/Soll-Vergleichsseiten vom 2026-10-29 (Runde 3, Soll B,
mit dem Nutzerfeedback zu Runde 2).

- Desktop: Dialog über die ganze Fläche, keine Leiste rechts. Kopf mit
  Vor/Zurück durch die Trefferliste (`12 / 48`), Titel, Unterzeile mit
  Statussymbolen (Stern, Flagge, Pause), Duplizieren, Löschen, Schließen.
- Vier Reiter in dieser Reihenfolge: `Allgemein`, `Inhalt`, `Varianten`,
  `Lernen`. Mobil Vollbild mit denselben Reitern, gleich breit und kompakt
  (Stil Runde 1); 44-px-Ziele.
- `Allgemein` wirkt sofort und bietet bei jeder Sofortaktion Rückgängig. Links:
  Flagge mit Markiert, Planung, Stapel. Rechts: Tags, Karten aus diesem Inhalt,
  Ähnliche Inhalte, Details. Mobil: Flaggen als 4×2-Raster mit Namen.
- `Inhalt` ist der Entwurf: Felder links, Live-Vorschau rechts (kein
  Vorschau-Dialog); mobil Umschalter `Bearbeiten | Vorschau`. Werkzeugleiste
  nur am aktiven Feld, Geändert-Punkt je Feld. Die Fußleiste nennt zuerst die
  Wirkung, dann `Verwerfen` und `Speichern`.
- `Varianten` und `Lernen` übernehmen die Gestaltung aus Runde 2, ohne Leiste.
- Eine markierte Karte färbt Kopf, Reiter und Hintergrund leicht gelb (neuer
  Token `--core-marked-surface`); innere Karten bleiben weiß. Eine Flagge färbt
  nichts. Eine ausgesetzte Karte bekommt keine Flächentönung mehr.
- Sofortaktionen bestätigen sich über den App-Baustein `SuccessToast`, ergänzt
  um die Aktion `Rückgängig`.

### Entscheidungen vom 2026-10-29

- V1 Tags und Flaggen werden genau wie in Anki gespeichert, auf CoRe-Begriffe
  abgebildet und in der Oberfläche vereinfacht (Konzept unten).
- V2 Tag-Identität wie in Anki: NFC, Groß-/Kleinschreibung egal, die
  gespeicherte Schreibweise gewinnt, `::` bildet die Hierarchie (F1).
- V3 Das Anki-Tag `leech` wird zur Lernbremse. Das Datenfeld entsteht im
  Cutover dieses Projekts; sichtbar wird die Funktion erst mit Paket 12 (F2).
- V4 Importierte Tags erscheinen eingeklappt mit Anzahl und lassen sich
  ausklappen und bearbeiten; eigene Tags sind sichtbar (F3).
- V5 Eigene Flaggennamen werden kontoweit vergeben, Standard sind die
  Farbnamen (F4).
- V6 Tags in `Allgemein` speichern sofort, mit Rückgängig (F5).
- V7 Flaggenpunkt, Filter und `tag:`/`flag:`-Suche in der Kartenverwaltung
  gehören zu diesem Projekt, als eigenes Paket nach dem Editor (F6).
- V8 Ausgesetzt wird ohne Flächenfärbung dargestellt: Umschalter, Zustand in der
  Planung, Zeile der Geschwisterkarte, Pause-Symbol in der Kopfzeile (F7).
- V9 `Zurückstellen` ist eine einmalige Aktion bis zum nächsten Lerntag und
  nutzt denselben Mechanismus wie das Zurückstellen von Geschwisterkarten.
- V10 `Neu planen` erscheint erst nach einer Datumsänderung und lässt eine
  Aussetzung bestehen.
- V11 Kein Export einzelner Karten. Mehrfachbearbeitung gehört in die
  Kartenverwaltung V2.
- V12 Cutover ohne Kompatibilitätscode in der App: vorhandene Daten rechnet
  einmalig eine Datenbank-Migration um.

### Konzept: Tags, Flaggen und Lernbremse

Analog zur Inhaltsform, auf die alle Anki-Notiztypen abgebildet werden, gibt es
drei Schichten.

1. Gespeichert wird genau wie in Anki. `Note.tags` behält die exakten
   Anki-Texte einschließlich `#`, `^`, `&`, `(`, `/` und `::`.
   `Card.ankiFlag` behält 0–7. Ein späterer Stapel-Export bleibt so ohne
   Verlust möglich.
2. Abgebildet wird auf CoRe-Begriffe. `marked` wird zum Stern (wie heute),
   `leech` zur Lernbremse `Card.leechedAt`. Woher ein Tag stammt, entscheidet
   `Note.importedTags`, der Tag-Stand des letzten Imports: eigene oder
   importierte Tags.
3. Die Oberfläche vereinfacht. Tags erscheinen als Chips mit dem letzten
   Pfadteil; der volle Pfad steht im Tooltip. Importierte Tags sind
   eingeklappt. Flaggen sind 7 Farbpunkte, auf Wunsch mit Namen.

Regeln:

- Eine Tag-Änderung ist keine Inhaltsänderung. Wie die Markierung erhöht sie
  `contentRevision` nicht, sodass ein Reimport die Felder weiter aktualisiert.
- Beim Reimport werden die Tags pro Notiz zusammengeführt:
  `lokal ∪ (neu − Basis) − (Basis − neu)`. `Basis` ist `importedTags`.
  Danach gilt `importedTags := neu`.
- Lokal gesetzte Flaggen, Markierung und Lernbremse bleiben beim Reimport
  erhalten. Neue Karten übernehmen die importierte Flagge.
- Normalisierung wie in Anki: NFC, Steuerzeichen und Leerzeichen sind
  unzulässig, `::`-Teile werden getrimmt, ein leerer Teil wird `blank`.
  Duplikate pro Notiz werden ohne Rücksicht auf Groß-/Kleinschreibung
  entfernt. Getrennt wird nie an `#`, `,` oder `;`.
- Lernbremse ist ein Kartenzustand (`Card.leechedAt`, Zeitpunkt oder `null`),
  getrennt von `status`. Beim Import erhalten die Karten einer Notiz mit
  `leech`-Tag die Lernbremse: alle Karten mit mindestens einem Lapse, hat keine
  einen, alle Karten. Das Tag wird dann nicht als Chip geführt.
- Eigene Flaggennamen liegen kontoweit im Profil. Aus `.apkg` sind sie nicht
  übernehmbar, weil Anki sie nur in `.colpkg` mitgibt.

Anki-Grundlagen, öffentlich belegt:

- Tags stehen in `notes.tags` als `" a b c "`. Die Identität ist `unicase`,
  `::` bildet die Hierarchie, `.apkg` enthält keine Tags-Tabelle und keinen
  Einklappzustand
  ([register.rs](https://github.com/ankitects/anki/blob/main/rslib/src/tags/register.rs),
  [insert.rs](https://github.com/ankitects/anki/blob/main/rslib/src/import_export/insert.rs)).
- Systemtags: `marked` ist die Markierung. `leech` gilt ab Schwelle 8;
  Standardaktion ist, nur das Tag zu setzen
  ([deckconfig](https://github.com/ankitects/anki/blob/main/rslib/src/deckconfig/mod.rs),
  [Leeches](https://docs.ankiweb.net/leeches.html)). Der deutsche Anki-Begriff
  ist „Lernbremse“
  ([de/deck-config.ftl](https://raw.githubusercontent.com/ankitects/anki-core-i18n/main/core/de/deck-config.ftl)).
- Flaggen sind `cards.flags & 7`, 1 Rot bis 7 Lila, Strg+1–7. Namen stehen in
  der Konfiguration `flagLabels`, die nur `.colpkg` mitgibt
  ([flags.py](https://github.com/ankitects/anki/blob/main/qt/aqt/flags.py)).
- Ein Export ohne Lernstand setzt die Flaggen auf 0 und entfernt `marked` und
  `leech`; Ankis Reimport ersetzt Tags, statt sie zusammenzuführen
  ([gather.rs](https://github.com/ankitects/anki/blob/main/rslib/src/import_export/gather.rs)).
- Suche: `flag:n`, `tag:x` (findet auch Kinder, ohne Rücksicht auf
  Groß-/Kleinschreibung), `tag:none`
  ([sqlwriter.rs](https://github.com/ankitects/anki/blob/main/rslib/src/search/sqlwriter.rs)).

### Arbeitspakete

Reihenfolge: 0, dann 1–4 weitgehend parallel, dann 5, dann 6–9, dann 10–12.
Paket 13 begleitet alle Pakete. Jedes Paket endet mit fokussierten Tests,
`npm run typecheck` und bei Bedarf `npm run build`.

#### 0 Entscheidungen und Specs

- [ ] `docs/specs.md`: „Kartendetail und Editor“ neu fassen (Dialog, vier
  Reiter, sofort gegen Entwurf, Markiert-Tönung, Ausgesetzt ohne Tönung,
  Rückgängig). Den Flaggen-Satz („Anki-Flaggen werden appweit weder angeboten
  noch dargestellt“) ersetzen. Begraben und Zurückstellen sowie Rückgängig
  ergänzen. Abschnitt „Tags und Flaggen“ mit Normalisierung, Herkunft und
  Reimport-Regel; Lernbremse als vorhandener, noch unsichtbarer Zustand.
- [ ] `docs/decisions.md`: ADR „Tags, Flaggen und Lernbremse ankitreu speichern
  und auf CoRe-Begriffe abbilden“ mit V1–V12.
- [ ] `docs/architecture.md`: neue persistierte Begriffe (`importedTags`,
  `leechedAt`, Flaggennamen) und neue öffentliche `coreModel`-Bausteine.
- [ ] `docs/specs.html` und weitere Ansichten neu erzeugen
  (`npm run docs:build`, `npm run check:docs`).
- Nachweis: `check:docs` grün; Abschnitte verlinkt.

#### 1 Datenmodell-Cutover: Tags, Flaggen, Lernbremse

- [ ] `Note.importedTags: string[] | null` und `Card.leechedAt: string | null`
  in `src/coreTypes.ts`, IndexedDB, Cloud-Zeilen, Sync-Planer und
  `src/cloudRepositoryValidation.ts`.
- [ ] Migration: neue Spalten. Einmalige Umrechnung vorhandener Daten:
  - `importedTags` aus den heutigen Tags importierter Notizen,
  - `leech`-Tag zu `leechedAt` nach der Regel oben, Tag entfernen.
- [ ] `normalizeTags` nach den Anki-Regeln, ohne Trennung an `#`, `,` und `;`.
  Behebt das Zerlegen von Tags wie `#AK_Step1_v12::#B&B`.
- [ ] Neuer `coreModel`-Baustein `setNoteTags`: erhöht die Revision, nicht
  `contentRevision`. Behebt „Tag-Änderung blockiert spätere Import-Updates“.
- [ ] Reimport (`indexedDbCoreRepository.ts`, Abschnitt K5.7): Tags nach der
  Drei-Wege-Regel zusammenführen; Flagge, Markierung und Lernbremse bleiben.
- [ ] APKG-Import: `leech` setzt `leechedAt`, `importedTags` wird gesetzt.
- [ ] `npm run db:types:generate`, `db:types:check`, `test:rls:local`.
- Nachweis: Tests mit einem Stapel im AnKing-Stil (tiefe `#`-Pfade,
  Groß-/Kleinschreibung, `leech`, `marked`). Reimport mit lokal ergänzten und
  im Stapel entfernten Tags. Eine reine Tag-Änderung blockiert kein
  Feld-Update.

#### 2 Tag-Verzeichnis und Flaggen-Bausteine

- [ ] Kontoweites Tag-Verzeichnis: lokal aus den Notizen abgeleitet, online per
  Cloud-Abfrage mit Anzahl und Herkunft (eigen/importiert); Vorschläge
  hierarchisch.
- [ ] `coreModel`-Baustein `setCardFlag` (Kartenrevision, Sync, Konfliktanzeige
  „Flagge“ vorhanden).
- [ ] Eigene Flaggennamen im Profil, synchronisiert, Standard: Farbnamen.
- Nachweis: Tests für Vorschläge mit Groß-/Kleinschreibung und Hierarchie,
  Flagge über zwei Geräte.

#### 3 Lern- und Kartenaktionen

- [ ] Karten verschieben (eine Karte oder alle Karten eines Inhalts) als
  `coreModel`-Baustein.
- [ ] `Als neu lernen`: Lernstand zurücksetzen über `record_review_atomic`
  (normale Kartenupdates übernehmen Lernfelder in der Cloud nicht).
- [ ] Einzelne Karte zurückstellen über `src/siblingBurying.ts`.
- [ ] Bewertungen einer Karte: lokal über den Index `cardAnswered`, sonst aus
  der Cloud über `review_events_user_card_answered_idx`.
- [ ] Ähnliche Inhalte: Server-Abfrage über Textähnlichkeit (pg_trgm),
  höchstens 3 Treffer, lazy und abbrechbar.
- [ ] Varianten pausieren (`deactivateVariant` freigeben) und Variantentext
  bearbeiten.
- Nachweis: Tests je Baustein; RLS-Tests für neue Abfragen.

#### 4 Gemeinsame UI-Bausteine und Tokens

- [ ] `SuccessToast` und `useSuccessToast` mit optionaler Aktion
  (`Rückgängig`).
- [ ] Tag-Eingabe: Chips, Vorschläge, Hierarchie; importierte Gruppe
  eingeklappt, ausklappbar und bearbeitbar. Genutzt von Editor und Erstellen.
- [ ] Flaggenwähler: Punkte auf Desktop, 4×2-Raster mit Namen mobil. Genutzt von
  Editor, Lernmodus und Kartenverwaltung.
- [ ] `RichTextEditor`: Werkzeugleiste nur am aktiven Feld.
- [ ] Tokens hell und dunkel: `--flag-1` bis `--flag-7`, `--core-danger-text`,
  `--core-marked-surface`; Theme-Vertragstest.
- [ ] Katalog-Demos in `scripts/uiCatalogDemos.tsx`, `src/ui/README.md`.
- Nachweis: Katalog im Browser geprüft, Kontraste hell/dunkel ≥ 4,5:1 für
  Text.

#### 5 Editor-Rahmen

- [ ] `DeckCardEditor` aus `src/screens/DecksScreen.tsx` nach
  `src/screens/cardEditor/` aufteilen.
- [ ] Dialog über die ganze Fläche / Vollbild mobil, Kopf mit Vor/Zurück,
  Duplizieren, Löschen, Schließen.
- [ ] Reiter als URL-Parameter mit fester Liste erlaubter Werte; Reload und
  Zurück bleiben deterministisch.
- [ ] Fokusführung und die Rückfrage bei ungespeicherten Änderungen bleiben.
- [ ] Fußleiste für den Entwurf, Markiert-Tönung, Statussymbole in der
  Unterzeile.
- [ ] Vor/Zurück: Die Tabelle gibt die Reihenfolge ihrer geladenen Zeilen
  weiter. Am Seitenende wird nachgeladen, sonst ist der Knopf inaktiv.
- [ ] `Varianten` und `Lernen` werden erst beim Öffnen geladen.
- Nachweis: Bundle-Budget eingehalten, Tastatur- und Fokus-Tests.

#### 6 Reiter Allgemein

- [ ] Flagge und Markiert; Planung mit Schnellwahl, `Neu planen` nach Änderung,
  Aussetzen, Zurückstellen.
- [ ] Verschieben über den vorhandenen Dialog mit `DeckSelect`.
- [ ] Tags (sofort speichernd).
- [ ] Karten aus diesem Inhalt, inklusive Entwurfszeile „Neu beim Speichern“.
- [ ] Ähnliche Inhalte, erst geladen, wenn der Browser frei ist.
- [ ] Details mit Quelle, Prüfung und kopierbaren IDs.
- [ ] Jede Sofortaktion zeigt einen Toast mit Rückgängig.

#### 7 Reiter Inhalt

- [ ] Zwei Spalten: Felder und Live-Vorschau über `renderCard` bzw.
  `NoteCardContent`, mit kurzer Verzögerung von etwa 150 ms. Gerendertes HTML
  wird nie gespeichert.
- [ ] Mobil `Bearbeiten | Vorschau`; Inhaltsform und Lernrichtung als eine
  Zeile.
- [ ] Geändert-Punkte, Schalter `Antwort eintippen`.
- [ ] Medienliste aus `Note.media`: Größen nur, wenn bekannt; ungenutzte
  Dateien entfernbar.

#### 8 Reiter Varianten

- [ ] Original zum Vergleich; je Variante Bearbeiten, Neu generieren, Pausieren,
  Löschen; veraltete Varianten ersetzen; Link zu den Stapeleinstellungen.
- [ ] Freigabe zeigt die Variantenbereitschaft aus P1 (ER3: Stabilität erreicht
  die Stapelschwelle) statt einer XP-Zahl.

#### 9 Reiter Lernen

- [ ] 9 Kennzahlen aus Lernstand und `calculateRetrievability` (FSRS-7);
  statt „Lernstufe XP“ das Reifeband aus P1 (ER2: Neu, Lernen, Jung, Reif,
  Gefestigt).
- [ ] Abrufverlauf und vollständige Bewertungsliste, erst beim Öffnen geladen.
- [ ] `Als neu lernen …` mit Bestätigungsdialog.

#### 10 Erstellen und Lernmodus

- [ ] Erstellen nutzt die Tag-Eingabe aus Paket 4.
- [ ] Lernmodus: Flagge setzen über Menü und Strg+1–7; Toast mit Rückgängig.

#### 11 Kartenverwaltung: Flaggen und Tags

- [ ] Flaggenpunkt in der Tabelle; `card_catalog` und `CardCatalogEntry` um die
  Flagge erweitern (Migration und Trigger).
- [ ] Filter und Suche in Anki-Schreibweise: `flag:n`, `tag:x` (inklusive
  Kindern), `tag:none`, Verneinung mit `-`.
- Nachweis: Server- und Offline-Suche liefern dieselben Treffer.

#### 12 Lernbremse sichtbar machen

- [ ] Erkennung im FSRS-7-Scheduler aus P1: Schwelle (Standard 8 Lapses) und Aktion
  (`Nur kennzeichnen`, `Aussetzen`) in den Stapeleinstellungen. Gesetzt wird
  über `record_review_atomic`.
- [ ] Anzeige im Editor (Allgemein, Lernen), Filter in der Kartenverwaltung,
  Zurücksetzen der Lernbremse.
- Nachweis: Tests für Schwelle, Wiederholung bei halber Schwelle und keine
  rückwirkende Auslösung.

#### 13 Abnahme und Nachbessern

- [ ] Betroffene Tests anpassen: `DecksScreen.test.tsx`;
  e2e `card-lifecycle`, `navigation-context`, `core-stabilization`,
  `batch-resilience`, `zz-media-import`.
- [ ] Visuelle Pflichtmatrix aus [`operations.md`](operations.md) hell und
  dunkel. Bewertungsrunden mit Screenshots aus der echten App bis mindestens
  9,5/10.
- [ ] `npm run gate:push`, `npm run performance:measure:local`,
  `npm run test:rls:local`, `npm run test:e2e:local`.
- [ ] `status.md`, `history.md`, `src/ui/README.md` nachziehen.

### Für Kartenverwaltung V2 vorgemerkt

Gehört nicht in den Editor:

- Tag-Verwaltung für das ganze Konto: umbenennen, zusammenführen, löschen,
  Herkunft anzeigen.
- Mehrfachbearbeitung: Flagge, Tags, Stapel, Aussetzen, Neu planen,
  Zurücksetzen für viele Karten.
- Suchen und Ersetzen in Feldern.
- Duplikate kontoweit finden, etwa „Felder gleich“.
- Gespeicherte Suchen und Spaltenauswahl.
- Position neuer Karten (Ankis „Reposition“).
- Lernen nach Tag oder Flagge (Ankis gefilterte Stapel), sinnvoll gemeinsam mit
  dem Lernbereich. Prüfungsthemen über Tags als Antwort auf die offene
  Themenzuordnung in ungegliederten Stapeln.

### Später

Nicht Teil dieses Projekts:

- Stapel-Export als `.apkg`. Dabei `marked`, `leech` und Flaggen
  zurückschreiben, `importedTags` und Anki-Rohtexte nutzen.
- Import aus `.colpkg` (bringt Flaggennamen und Einklappzustand der Tags mit).
- AnkiHub-Schutz-Tags (`AnkiHub_Protect::Feld`) als Feldschutz beim Reimport
  auswerten.
- Inhaltsform importierter Inhalte wechseln, als Umwandlung in einen eigenen
  Inhalt.
- Feldeigenschaften aus Notiztypen: Schreibrichtung rechts nach links,
  Schriftart, Ausschluss von der Suche.

## P1: KI-Varianten (Proof of Concept) abschließen

Bewusst einfacher Probelauf (ADR-011); Auswahl und Oberfläche werden danach
geglättet.

- [ ] **Einstiege:** Zähler der Karten ohne Variante in den Stapeleinstellungen
      (danach eine einzige Aktion, deren Beschriftung zwischen „generieren“ und
      „neu generieren“ wechselt); nach Fehlschlägen führt `Anzeigen` in der Leiste
      zum Filter „Ohne Variante“; Stoppgründe in der Leiste kurz halten (z. B.
      „Keine Verbindung“).
- [ ] **Visuelle Pflichtmatrix:** Fortschrittsleiste, Einschalt-Dialog,
      Variantenbereich der Stapeleinstellungen und Filter `Ohne Variante`; dazu
      ein E2E-Test der Stapelgenerierung (Route je Aufruf mit anderer Variante
      gemockt).
- [ ] **Nicht umformulierbare Inhalte untersuchen:** Das erzwungene Werkzeug
      verlangt heute immer eine Variante; bei sinnlosen Inhalten (zufällige
      Buchstabenfolgen) oder Insidern ohne allgemeinen Kontext bleibt dem Modell
      nur eine Hülle („Was gehört zu …?“) oder eine erfundene Deutung. Zu
      untersuchen: Playtest mit solchen Prüfkarten neben den bisherigen sechs,
      danach eine Prompt-Ergänzung mit Ausweg, über den das Modell eine Karte
      als nicht umformulierbar meldet. Offen ist, wie die Route das meldet und
      ob die Karte danach aus Stapelläufen fällt; heute wählt jeder Lauf
      gescheiterte und gemeldete Karten erneut. Nachweis: Playtest-Ergebnis vor
      und nach der Prompt-Ergänzung, Routentests mit solchen Karteninhalten.

## P2: Karten aus einer Quelle per KI erstellen

Formular und Auftragsprüfung unter `/neue-karten?method=ai-source` stehen
(`src/aiSourceCreation.ts`, `AiSourceCreationPanel.tsx`); „Karten erstellen“
ist deaktiviert, nichts wird gelesen oder übertragen. Offen ist alles, was die
Oberfläche danach verspricht. Setzt P1 und das KI-Kontingent pro Nutzer
voraus.

- [ ] **Entscheidungen vor dem Code (Ergänzung zu ADR-011):** ADR-011 erlaubt
      genau zwei KI-Routen; eine dritte Route (etwa
      `POST /api/ai/source-cards`, gleiches Modell, ZDR, Kostenlog) braucht die
      Ergänzung. Festlegen: ob der Browser nur extrahierten Text oder die
      Datei überträgt (ADR-011 schließt Bildübertragung aus, Scans und
      Diagramme bleiben damit außen vor); Obergrenzen je Auftrag (Zeichen,
      Seiten oder Folien, Karten) und wie große Quellen ohne Serverqueue in
      Portionen im geöffneten Tab laufen; Hinweis, dass die Quelle an den
      Anbieter geht.
- [ ] **Quelle auslesen:** Das Formular nimmt PDF, Text, Markdown, CSV, TSV,
      DOCX und PPTX an. `documentModel.ts` liest die ersten fünf bereits;
      DOCX und PPTX fehlen (ZIP und XML, ohne neue Abhängigkeit über
      `zipReader.ts` prüfen). Jede Textstelle trägt einen echten Beleg (Seite,
      Folie oder Abschnitt), weil der Prompt einen Quellenverweis je Karte
      verlangt. Leere, geschützte, nur gescannte oder zu große Dokumente
      werden mit Meldung abgelehnt, nichts wird still abgeschnitten.
- [ ] **Generierung und Vertrag:** Anfrage- und Antwortschema in einem eigenen
      Vertragsmodul wie `aiCardVariantContract.ts`; die Route nutzt
      `buildAiSourceCreationPrompt` und hält Quellmaterial von Anweisungen
      getrennt. Je Karte getrennt: Frage oder Lückentext, kurze Lösung,
      Auswahloptionen mit Richtigkeit, quellenbasierte Erklärung, externe
      Ergänzung, Quellenverweis. Hinweise des Modells (Material trägt das
      Lernziel nicht, widersprüchliche oder unlesbare Stellen) kommen als
      eigene Meldungen zurück. Fortschritt, Abbruch und Fehler folgen den
      Regeln der Variantengenerierung.
- [ ] **Ergebnis prüfen und übernehmen:** Vor dem Speichern eine Liste der
      vorgeschlagenen Karten mit Vorschau, Bearbeiten und Verwerfen je Karte;
      gespeichert wird erst nach Bestätigung und nur über `coreModel.ts`
      (Frage–Antwort, Lückentext, Single und Multiple Choice gibt es dort
      schon). Feldzuordnung festlegen: kurze Antwort, quellenbasierte
      Erklärung in `extra`, Quellenverweis in `source`; die externe Ergänzung
      braucht eine sichtbar getrennte Kennzeichnung „Ergänzende Erklärung –
      außerhalb der Quelle“ (eigene Feldrolle oder benanntes Feld). Neuer
      Zielstapel entsteht erst bei der Übernahme. Der Entwurfsschutz gilt
      auch für ungespeicherte Ergebnisse.
- [ ] **Freigabe:** „Karten erstellen“ und den Hinweis „noch nicht verfügbar“
      erst danach umstellen; ohne Verbindung bleibt die Aktion mit Meldung
      gesperrt. Specs §6.4, `status.md` und `architecture.md` nachziehen.
      Nachweis: Routen- und Vertragstests, E2E mit gemockter Route (Erfolg,
      Hinweise, Abbruch, Fehler, nichts gespeichert vor Übernahme), echte
      Quellen je Format mit allen vier Kartenformen, visuelle Pflichtmatrix
      für Fortschritt und Ergebnisliste.

## Offene Nachweise

Abnahmen der Kartenmodell-Roadmap; sie brauchen echte Geräte oder Daten, keinen
neuen Code.

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones; dazu die
      Mindmap-Gesten aus W4c (Doppeltippen, Langdrücken, Zwei-Finger-Zoom,
      Vollbild) auf iOS und Android.
- [ ] **Korpus (Phase 5):** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel: mindestens
      95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## Vor dem ersten externen Release

- [ ] **Neue Schemabaseline:** Die Migrationen ab
      `20261008101057_kartenmodell_baseline.sql` (Stand 2026-10-30: 12 Dateien,
      3.224 Zeilen, davon rund 550 überschriebene Fassungen von
      `get_account_bootstrap`, `get_account_statistics` und
      `list_account_card_study_states`) zu einer Baseline zusammenfassen, damit
      jede Funktion an genau einer Stelle steht. Kein Laufzeitgewinn, nur
      Übersicht; Aufwand etwa 1–2 h. Hosted per `supabase migration repair`
      umstellen, Daten bleiben unberührt. Nachweis: `supabase db diff --linked`
      leer, `verify_schema_v1.sql` lokal und remote grün. Verweise in
      `README.md`, `operations.md` und `status.md` anpassen, offene Branches mit
      Migrationen nachziehen.
- [ ] **KI-Kontingent pro Nutzer:** Alle Nutzer teilen das Ausgabenlimit des
      OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in
      Supabase) verhindert, dass ein Nutzer es allein aufbraucht. Braucht eine
      Ergänzung zu ADR-011.
- [ ] **KI-Routen in `npm run dev`:** Das Vite-Plugin `localAiRoutes` in
      `vite.config.ts` bedient `/api/ai/summary` und `/api/ai/card-variant`
      bereits lokal; `operations.md` nennt dafür noch `vercel dev`. Vor dem
      ersten Release oder wenn weitere Entwickler lokal mit KI arbeiten,
      entscheiden, welcher Weg gilt, und `operations.md` anpassen.
- [ ] **Login-Wege:** Magic Link und Google sind gebaut, aber per Flag aus. Für
      Magic Link braucht es einen eigenen SMTP-Server in Supabase, freigegebene
      Redirect-Adressen (Produktion, Preview), eine deutsche Mailvorlage und
      zusätzlich einen 6-stelligen Code zum Eintippen, weil der Link auf
      Mobilgeräten oft im falschen Browser landet. Google erst nach Entscheidung
      über den OAuth-Prüfprozess und den Datenschutztext; sonst Code und Flag
      entfernen.

## Später

- Native App nach ADR-036.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- Quiz als eigenes Feature (ADR-042): Stapel-Tab `Quiz` ist Platzhalter.
  Danach Quizplanung im Prüfungsplaner; einen Entwurf mit manuellen
  Kapitel- und Gruppenquizzen im gespeicherten Planformat enthält
  `codex/klausurplaner-design`, ohne Quizplanung ist der Branch sonst
  übernehmbar.
- KI-Varianten vorausschauend erzeugen: Heute erzeugt die Stapelaktion des
  Proof of Concept beim Einschalten Varianten für bis zu 50 Karten auf einmal,
  auch für Karten, die noch lange keine Variante zeigen. Künftig erzeugt CoRe
  bei eingeschaltetem CoRe-Modus Varianten gesammelt nur für Karten, die in den
  nächsten Tagen die Haltbarkeitsschwelle des Stapels (7/21/60 Tage) erreichen.
  Auswahl: Karten in der Wiederholung ohne aktive Variante, deren Haltbarkeit
  nach einem `Gut` am Fälligkeitstermin die Schwelle erreicht und die in den
  nächsten N Tagen fällig sind; `createReviewChain` aus `scheduler.ts` rechnet
  das ohne Buchführung je Karte. Erzeugt wird nur im geöffneten Tab, in kleinen
  Portionen, mit der bestehenden Fortschrittsleiste und denselben Fehler- und
  Abbruchregeln; eine Serverqueue entsteht nicht. Voraussetzungen: die offenen
  Punkte des Proof of Concept unter P1, das KI-Kontingent pro Nutzer und eine
  Ergänzung zu ADR-011 (automatische Erzeugung, Auswahlregel, Tageslimit).
  Verteilt die Kosten über die Tage und verbraucht nichts für ungelernte
  Karten. Nachweis: Test der Auswahl über die Beispielketten, E2E mit
  gemockter Route.
- Persönliche FSRS-Parameteroptimierung: Heute gelten für alle die
  21 FSRS-7-Standardparameter; Abstände passen dadurch nur zum
  Durchschnittsgedächtnis. Der Optimierer `@open-spaced-repetition/binding`
  (WebAssembly, passend zu `ts-fsrs` 6) berechnet in einem Worker aus den
  eigenen Bewertungen, einschließlich importierter Anki-Historie, eigene
  Parameter je Stapelprofil. Übernommen werden sie nur, wenn sie den Verlauf
  messbar besser vorhersagen als die Standardwerte (Log-Loss oder RMSE auf
  zurückgehaltenen Bewertungen) und genug Bewertungen vorliegen (Mindestzahl
  bei der Umsetzung festlegen, Größenordnung einige hundert). Die Parameter
  liegen im Stapelprofil und synchronisieren mit. Weil Haltbarkeit von den
  Parametern abhängt, verschieben sich Reife, Variantenfreigabe,
  Prüfungsprognose und Statistik mit; beim Übernehmen muss deshalb
  `study.extra.maturityBand` aller betroffenen Karten neu berechnet und
  `study_revision` erhöht werden, damit Katalog und andere Geräte
  nachziehen. Fälligkeiten bestehender Karten bleiben bis zur nächsten
  Bewertung unverändert. Oberfläche: Aktion in den Stapeleinstellungen mit
  Vergleich alt/neu und Zurück zu den Standardwerten. Rahmen in ADR-044;
  Ablauf und Mindestzahl dort bei der Umsetzung ergänzen. Nachweis:
  Golden-Test bleibt auf Standardparametern, Tests für Übernahme, Ablehnung
  und Neuberechnung.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
- Prüfungsplanung: semantische Themenzuordnung innerhalb ungegliederter Stapel.
  Heute bilden Unterstapel die Themen; eine spätere Zuordnung braucht
  explizite, prüfbare Themengrenzen und darf Lernstände nicht ändern. Einen
  Lösungsweg über Tags nennt P0 unter „Für Kartenverwaltung V2 vorgemerkt“.
