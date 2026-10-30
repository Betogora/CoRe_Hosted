# CoRe TODO

Stand: 2026-10-30

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität: P0 vor P1 vor P2. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig, „Später“ ist geparkt.

## P0: Karteneditor V2 mit Tags, Flaggen und Lernbremse

Roadmap für den Karteneditor V2 samt Tag-, Flaggen- und Lernbremsen-System.
Erledigte PRs wandern datiert nach [`history.md`](history.md).

Die Startbedingung ist erfüllt: Die FSRS-7-Reife-Roadmap (ADR-044, Scheduler,
Reifeband ohne XP, Datenbank-Cutover) liegt seit PR #52 auf `main`. Abgeglichen
mit `main` nach #57–#61 am 2026-10-30: Diese PRs ändern den Editor nicht. Sie
liefern aber zwei Bausteine, auf die V2 aufsetzt: Ziele je Ansicht in
`appNavigation.ts` und `onBeforeNavigation(route, source)` (#58). Außerdem
haben P1 und P2 Berührungspunkte mit dem Editor (siehe W16 und W17).

Kein Scope Creep: Neues nur, wenn eine Entscheidung unten es verlangt.
Listenbasierte Funktionen gehören in die Kartenverwaltung V2 (siehe unten),
nicht in den Editor. `docs/specs.md` und die ADRs gelten für dieses Projekt als
überholbar: PR A fasst sie nach dem Zielbild neu, statt den alten Stand
fortzuschreiben (W4).

### Arbeitsweise: drei PRs

Statt 13 Paketen gibt es drei PRs, jeweils mit einem Start, einem Audit
(`audit-last-change`) und einem Merge. Jeder PR zweigt vom aktuellen `main` ab
und arbeitet seine Etappen in einer Sitzung ab. Jede Etappe endet mit einem
Commit, fokussierten Tests und `npm run typecheck`. Reicht der Kontext nicht,
läuft dieselbe Sitzung weiter; einen neuen Start braucht es nicht. Alle
Produktfragen sind entschieden (V1–V12, W1–W23).

| PR | Inhalt | Sichtbar | Altpakete |
| --- | --- | --- | --- |
| A Fundament | Specs, ADR, Schemabaseline, Daten-Cutover, Domänenbausteine, Katalog und Suche | nein (nur Doku) | 0, 1, 2, 3, Teile von 11 und 12 |
| B Editor | UI-Bausteine, Rahmen, vier Reiter, visuelle Abnahme des Editors | ja | 4–9, Teile von 12 und 13 |
| C Rest und Abnahme | Erstellen, Lernmodus, Kartenverwaltung, Stapeleinstellungen, Gesamtgates | ja | 10, Teile von 11, 12 und 13 |

B setzt A voraus, C setzt B voraus (Tag-Eingabe und Flaggenwähler).

### Zielbild

Grundlage sind die Ist/Soll-Vergleichsseiten vom 2026-10-29 (Runde 3, Soll B,
mit dem Nutzerfeedback zu Runde 2).

- Desktop: Dialog über die ganze Fläche, keine Leiste rechts. Kopf mit
  Vor/Zurück durch die Trefferliste (`12 / 48`), Titel, Unterzeile mit
  Statussymbolen (Stern, Flagge, Pause, Lernbremse), Duplizieren, Löschen,
  Schließen.
- Vier Reiter in dieser Reihenfolge: `Allgemein`, `Inhalt`, `Varianten`,
  `Lernen`. Mobil Vollbild mit denselben Reitern, gleich breit und kompakt
  (Stil Runde 1); 44-px-Ziele.
- `Allgemein` wirkt sofort und lässt sich rückgängig machen (W7, W20). Links:
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
- V3 Das Anki-Tag `leech` wird zur Lernbremse. Datenfeld und Erkennung entstehen
  in PR A; sichtbar wird sie mit PR B (Editor) und PR C (Kartenverwaltung,
  Stapeleinstellungen) (F2).
- V4 Importierte Tags erscheinen eingeklappt mit Anzahl und lassen sich
  ausklappen und bearbeiten; eigene Tags sind sichtbar (F3).
- V5 Eigene Flaggennamen werden kontoweit vergeben, Standard sind die
  Farbnamen (F4).
- V6 Tags in `Allgemein` speichern sofort, mit Rückgängig (F5).
- V7 Flaggenpunkt, Filter und `tag:`/`flag:`-Suche in der Kartenverwaltung
  gehören zu diesem Projekt: Abfrage in PR A, Oberfläche in PR C (F6).
- V8 Ausgesetzt wird ohne Flächenfärbung dargestellt: Umschalter, Zustand in der
  Planung, Zeile der Geschwisterkarte, Pause-Symbol in der Kopfzeile (F7).
- V9 `Zurückstellen` ist eine einmalige Aktion bis zum nächsten Lerntag und
  nutzt denselben Mechanismus wie das Zurückstellen von Geschwisterkarten.
- V10 `Neu planen` erscheint erst nach einer Datumsänderung und lässt eine
  Aussetzung bestehen.
- V11 Kein Export einzelner Karten. Mehrfachbearbeitung gehört in die
  Kartenverwaltung V2.
- V12 Cutover ohne Kompatibilitätscode in der App: Vorhandene Daten rechnet
  einmalig eine Datenbank-Migration um (Ausgestaltung W2).

### Entscheidungen vom 2026-10-30

Nach dem Abgleich mit #57–#61 und einer Recherche zu Anki und Barrierefreiheit:

- W1 Drei PRs statt 13 Pakete (Arbeitsweise oben). Kein Inhalt entfällt; die
  Zuordnung der Altpakete steht in der Tabelle.
- W2 Cutover: Eine Datenbank-Migration rechnet die Bestände einmalig um. Die
  lokale Replik wechselt den Namensraum (`core.workspace.entities.v4.` →
  `v5.`) und lädt neu aus der Cloud; die App liest den alten Namensraum nicht
  und kennt keine Altformen. Vor dem Deploy synchronisieren, weil eine nicht
  synchronisierte Outbox im alten Namensraum zurückbleibt (Pre-Release, ADR-034).
  Wie beim Wechsel auf `v4` gibt es keinen Aufräumpfad für den alten
  Namensraum; Kontodaten bleiben in der Cloud erhalten.
- W3 Die Schemabaseline (bisher „Vor dem ersten externen Release“) kommt als
  erste Etappe in PR A. So stehen `card_catalog`, `record_review_atomic` und
  die Bootstrap-Funktionen danach an genau einer Stelle, und die neue Migration
  setzt auf der Baseline auf statt auf 13 Dateien.
- W4 Specs und ADRs werden neu gefasst. Ersetzt werden unter anderem:
  - Specs „Kartendetail und Editor“: nicht-modales `aside` mit Schließen bei
    Klick daneben, `Vorschau`-Knopf, „Einen Herkunfts-…Abschnitt gibt es
    nicht“, Ausnahme der Varianteneingaben von der Entwurfsrückfrage.
  - Specs Lernmodus: „Anki-Flaggen werden appweit weder angeboten noch
    dargestellt“.
  - Specs „Vorschau und Darstellung“: Der Vorschau-Dialog bleibt nur beim
    Erstellen, im Editor ersetzt ihn die Live-Vorschau.
  - ADR-032: Tags als Rohtext mit Herkunft, Lernbremse als Kartenzustand,
    Flagge sichtbar. Neue ADR-045 für V1–V12 und W1–W19; ADR-032 verweist
    darauf.
- W5 Reiter in der URL nach dem Muster aus #58: eine feste Liste je Ansicht in
  `appNavigation.ts`. Ein Reiterwechsel löst keine Rückfrage aus
  (`onBeforeNavigation` erhält Route und Quelle). Der Entwurf in `Inhalt`
  bleibt über Reiterwechsel erhalten.
- W6 Einstieg: Aus der Tabelle öffnet `Allgemein`, aus dem Lernmodus
  (`Karte bearbeiten`) öffnet `Inhalt`. Ohne Trefferliste, etwa aus dem
  Lernmodus, entfällt Vor/Zurück; der Rückkontext in die Sitzung bleibt.
- W7 Rückgängig ist barrierefrei: Ein Toast mit Aktion bleibt 10 s, pausiert
  bei Mauszeiger und Fokus und wird von einem neuen Toast ersetzt. Rückgängig
  ist nie der einzige Weg: Flagge, Markiert, Aussetzen und Tags setzt das
  Bedienelement selbst zurück. Rückgängig speichert eine neue Änderung mit
  neuer Revision (synchronisierbar) und entfällt mit Meldung, wenn sich die
  Karte inzwischen geändert hat. Welche Aktionen einen Toast zeigen: W20.
- W8 Löschen bleibt wie heute: Rückfrage mit Kartenzahl (ADR-032), danach
  schließt der Editor und die Tabelle bietet das vorhandene `Rückgängig`.
- W9 Live-Vorschau: zeigt die geöffnete Karte; eine Auswahl wechselt zu
  Geschwistern einschließlich „Neu beim Speichern“. Ein Umschalter wechselt
  `Vorderseite | Rückseite`; Auswahlfragen simulieren wie im bisherigen
  Vorschau-Dialog. Bei Bildverdeckung tritt der Masken-Editor an die Stelle der
  Vorschau-Spalte.
- W10 Tag-Eingabe: Leertaste, Enter und Tab schließen einen Chip ab; Einfügen
  trennt nur an Leerraum. `#`, `,` und `;` bleiben Teil des Tags.
- W11 Tastenkürzel: `Strg+Enter` speichert den Entwurf, `Strg+1`–`7` schaltet
  die Flagge (wie Anki), `Strg+K` schaltet Markiert, `Alt+↑`/`Alt+↓`
  wechselt zur vorigen/nächsten Karte, `Escape` schließt (mit Rückfrage bei
  Entwurf). Reiter folgen dem ARIA-Tabs-Muster (Pfeiltasten). Tooltips nennen
  die Kürzel.
- W12 Varianten bearbeiten: Jede Variante wird in ihrer Zeile bearbeitet und
  gespeichert, unabhängig vom Inhaltsentwurf. Bearbeitete Varianten gelten als
  eigene: `Varianten neu generieren` ersetzt sie nicht, eine Inhaltsänderung
  macht sie wie alle anderen veraltet.
- W13 Die Lernbremsen-Erkennung läuft ab PR A mit den Standardwerten (W22). Der
  Editor zeigt sie ab PR B samt Zurücksetzen; Filter und Stapeleinstellung
  folgen in PR C.
- W14 Flaggen nie nur über die Farbe: Name in Tooltip und `aria-label`. Der
  Lernmodus zeigt eine gesetzte Flagge als Punkt in der Kopfzeile.
- W15 Treue bei importiertem HTML: Öffnen und Schließen ohne Eingabe erzeugt
  keinen Geändert-Punkt; die Änderung eines Felds schreibt die anderen Felder
  nicht um.
- W16 Der Reiter `Inhalt` arbeitet auf `NoteEditorValue` und funktioniert auch
  ohne gespeicherte Notiz, damit die Ergebnisliste aus P2 (Karten aus einer
  Quelle) Felder und Live-Vorschau wiederverwendet statt einen zweiten Editor
  zu bauen.
- W17 Variantenzustände sind erweiterbar: Der Zustand „nicht umformulierbar“
  aus P1 erscheint später als weitere Zustandsmarke im Reiter `Varianten`.
- W18 Reifeband im Reiter `Lernen` mit den vier Stufen aus ADR-044: `Neu`,
  `Lernen`, `Jung`, `Reif`.
- W19 Sync: Ein Konflikt im Editor verlinkt auf
  `einstellungen?target=sync-conflicts` (#58). Kommt bei offenem Entwurf eine
  neuere Fassung per Sync an, greift beim Speichern die vorhandene
  Konfliktbehandlung; ein Test deckt das ab. `Ähnliche Inhalte` und die
  Cloud-Bewertungsliste erscheinen nur online.

### Entscheidungen vom 2026-10-30, zweite Runde

Antworten auf die offenen Fragen O1–O4, jeweils nach Empfehlung:

- W20 Einen Toast mit `Rückgängig` zeigen nur Aktionen, deren Ergebnis aus dem
  Blick verschwindet oder etwas Altes überschreibt: Verschieben,
  Zurückstellen, Neu planen, Lernbremse zurücksetzen und Tag entfernen.
  Flagge, Markiert, Aussetzen und Tag hinzufügen zeigen keinen Toast; ihr
  Bedienelement zeigt den Zustand und setzt ihn zurück. Im Lernmodus zeigt
  der Flaggenpunkt in der Kopfzeile die Änderung, ohne Toast.
- W21 `Als neu lernen` hat keine Optionen: Wiederholungs- und Fehlerzähler
  gehen auf 0, die Lernbremse wird aufgehoben, der Bewertungsverlauf bleibt
  mit einem manuellen Eintrag. Die Karte reiht sich wie eine neue Karte ein.
- W22 Die Lernbremse ist standardmäßig `Nur kennzeichnen`. Löst sie im
  Lernmodus aus, erscheint einmal der Hinweis „Lernbremse: N-mal vergessen“
  mit der Aktion `Bearbeiten`, die den Editor im Reiter `Inhalt` öffnet.
- W23 Eigene Flaggennamen werden an genau einer Stelle vergeben: in den
  Karteneinstellungen (`karten-einstellungen`), sieben Zeilen mit Farbpunkt
  und Namensfeld; ein leeres Feld steht für den Farbnamen. Der Flaggenwähler
  verlinkt mit `Namen bearbeiten` dorthin (Ziel `flag-names` nach dem
  Muster aus #58).

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
  Heute hängen Tags noch am Entwurf und erhöhen `contentRevision`
  (`DecksScreen.tsx`, Tag-Feld und `draftNote`).
- Beim Reimport werden die Tags pro Notiz zusammengeführt:
  `lokal ∪ (neu − Basis) − (Basis − neu)`. `Basis` ist `importedTags`.
  Danach gilt `importedTags := neu`.
- Lokal gesetzte Flaggen, Markierung und Lernbremse bleiben beim Reimport
  erhalten. Neue Karten übernehmen die importierte Flagge.
- Normalisierung wie in Anki: NFC, Steuerzeichen und Leerzeichen sind
  unzulässig, `::`-Teile werden getrimmt, ein leerer Teil wird `blank`.
  Duplikate pro Notiz werden ohne Rücksicht auf Groß-/Kleinschreibung
  entfernt. Getrennt wird nie an `#`, `,` oder `;` (heute tut
  `normalizeTags` in `src/coreModel/coreValues.ts` genau das).
- Lernbremse ist ein Kartenzustand (`Card.leechedAt`, Zeitpunkt oder `null`),
  getrennt von `status`. Beim Import erhalten die Karten einer Notiz mit
  `leech`-Tag die Lernbremse: alle Karten mit mindestens einem Lapse, hat keine
  einen, alle Karten. Das Tag wird dann nicht als Chip geführt.
- Eigene Flaggennamen liegen kontoweit im Profil. Aus `.apkg` sind sie nicht
  übernehmbar, weil Anki sie nur in `.colpkg` mitgibt.
- Suche und Filter brauchen Flagge, Lernbremse und Tags ohne Kartenkörper:
  `card_catalog` (Cloud und Replik) erhält `anki_flag`, `leeched` und die
  kleingeschriebenen Tags samt Pfadpräfixen, damit `tag:x` Kinder findet.

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
- „Forget“ bietet „Ursprüngliche Position wiederherstellen“ und „Wiederholungs-
  und Fehlerzähler zurücksetzen“; der Bewertungsverlauf bleibt, der Eintrag
  erscheint als manuell
  ([Forum](https://forums.ankiweb.net/t/reset-repetition-and-lapse-count/25154),
  [Statistik](https://docs.ankiweb.net/stats.html)).

### PR A: Fundament

Keine sichtbare Änderung außer der Doku. Endet mit `npm run gate:push`,
`npm run db:types:check`, `npm run test:rls:local` und
`npm run performance:measure:local` (Sync und Katalog betroffen).

#### A1 Specs und Entscheidungen

- [ ] `docs/specs.md`: „Kartendetail und Editor“ nach dem Zielbild neu fassen
  (Dialog, vier Reiter, sofort gegen Entwurf, Einstieg je Herkunft,
  Tastenkürzel, Markiert-Tönung, Ausgesetzt ohne Tönung, Rückgängig,
  Live-Vorschau). Lernmodus-Satz zu Flaggen ersetzen, Begraben und
  Zurückstellen ergänzen. Neuer Abschnitt „Tags, Flaggen und Lernbremse“ mit
  Normalisierung, Herkunft, Reimport-Regel, Suche und Lernbremse.
  Kartenverwaltung um Flaggenpunkt, Filter und Suchsyntax ergänzen. Alle
  W4-Stellen ersetzen.
- [ ] `docs/decisions.md`: ADR-045 „Karteneditor V2: Tags, Flaggen und
  Lernbremse ankitreu speichern und auf CoRe-Begriffe abbilden“ mit V1–V12,
  W1–W23; ADR-032 anpassen.
- [ ] `docs/architecture.md`: persistierte Begriffe (`importedTags`,
  `leechedAt`, Flaggennamen, Katalogspalten), Replik-Namensraum `v5`, neue
  öffentliche `coreModel`-Bausteine.
- [ ] `status.md`: Editor V2 als laufend vermerken.
- [ ] `npm run docs:build`, `npm run check:docs`.

#### A2 Schemabaseline

- [ ] Die Migrationen ab `20261008101057_kartenmodell_baseline.sql`
  (Stand 2026-10-30: 13 Dateien bis `20261030103636`, mit mehrfach
  überschriebenen Fassungen von `get_account_bootstrap`,
  `get_account_statistics` und `list_account_card_study_states`) zu einer
  Baseline zusammenfassen, damit jede Funktion an genau einer Stelle steht.
  Hosted per `supabase migration repair` umstellen, Daten bleiben unberührt.
- Nachweis: `supabase db diff --linked` leer, `verify_schema_v1.sql` lokal und
  remote grün. Verweise in `README.md`, `operations.md` und `status.md`
  angepasst; offene Branches mit Migrationen nachgezogen.

#### A3 Daten-Cutover

- [ ] `Note.importedTags: string[] | null` und `Card.leechedAt: string | null`
  in `src/coreTypes.ts`, Replik, Cloud-Zeilen, Sync-Planer und
  `src/cloudRepositoryValidation.ts`; Replik-Namensraum `v5` (W2).
- [ ] Eine Migration auf der Baseline: neue Spalten, `card_catalog` um
  `anki_flag`, `leeched` und Tags erweitert (Trigger, Indizes). Einmalige
  Umrechnung: `importedTags` aus den heutigen Tags importierter Notizen,
  `leech`-Tag zu `leechedAt` nach der Regel oben und Tag entfernen.
- [ ] `normalizeTags` nach den Anki-Regeln, ohne Trennung an `#`, `,` und `;`.
  Behebt das Zerlegen von Tags wie `#AK_Step1_v12::#B&B`.
- [ ] `coreModel`-Baustein `setNoteTags`: erhöht die Revision, nicht
  `contentRevision`. Tags verlassen den Inhaltsentwurf. Behebt „Tag-Änderung
  blockiert spätere Import-Updates“.
- [ ] Reimport (`indexedDbCoreRepository.ts`, Abschnitt K5.7): Tags nach der
  Drei-Wege-Regel zusammenführen; Flagge, Markierung und Lernbremse bleiben.
- [ ] APKG-Import: `leech` setzt `leechedAt`, `importedTags` wird gesetzt.
- [ ] `npm run db:types:generate`.
- Nachweis: Tests mit einem Stapel im AnKing-Stil (tiefe `#`-Pfade,
  Groß-/Kleinschreibung, `leech`, `marked`). Reimport mit lokal ergänzten und
  im Stapel entfernten Tags. Eine reine Tag-Änderung blockiert kein
  Feld-Update. Migration auf einer Kopie mit echten Daten geprüft.

#### A4 Tags, Flaggen und Suche

- [ ] Kontoweites Tag-Verzeichnis: lokal aus den Notizen abgeleitet, online per
  Cloud-Abfrage mit Anzahl und Herkunft (eigen/importiert); Vorschläge
  hierarchisch.
- [ ] `coreModel`-Baustein `setCardFlag` (Kartenrevision, Sync, Konfliktanzeige
  „Flagge“).
- [ ] Eigene Flaggennamen im Profil, synchronisiert, Standard: Farbnamen.
- [ ] Suchsyntax wie in Anki: `flag:n`, `tag:x` (inklusive Kindern),
  `tag:none`, Verneinung mit `-`; Server-Suche
  (`search_account_card_catalog`) und Offline-Suche über die Replik.
- Nachweis: Tests für Vorschläge mit Groß-/Kleinschreibung und Hierarchie,
  Flagge über zwei Geräte; Server- und Offline-Suche liefern dieselben
  Treffer.

#### A5 Lern- und Kartenaktionen

- [ ] Karten verschieben (eine Karte oder alle Karten eines Inhalts) als
  `coreModel`-Baustein.
- [ ] `Als neu lernen`: Lernstand zurücksetzen über `record_review_atomic`
  (normale Kartenupdates übernehmen Lernfelder in der Cloud nicht), als
  manuelles Ereignis im Verlauf; Zähler und Lernbremse nach W21.
- [ ] Einzelne Karte zurückstellen über `src/siblingBurying.ts`.
- [ ] Rückgängig je Sofortaktion als Gegenänderung mit neuer Revision (W7).
- [ ] Bewertungen einer Karte: lokal über den Index `cardAnswered`, sonst aus
  der Cloud über `review_events_user_card_answered_idx`.
- [ ] Ähnliche Inhalte: Server-Abfrage über Textähnlichkeit (pg_trgm),
  höchstens 3 Treffer, lazy und abbrechbar.
- [ ] Varianten abschalten (`deactivateVariant` freigeben; heute gibt es nur
  `Reaktivieren`) und Variantentext bearbeiten, bearbeitete Varianten von
  `Varianten neu generieren` ausgenommen (W12).
- [ ] Lernbremsen-Erkennung im FSRS-7-Scheduler (ADR-044) und in
  `record_review_atomic`: Schwelle (Standard 8 Lapses), danach erneut bei
  jeder halben Schwelle; Standardaktion nach W22. Die Stapeleinstellung dafür ist
  gespeichert, ihre Oberfläche folgt in PR C.
- Nachweis: Tests je Baustein; RLS-Tests für neue Abfragen; Tests für
  Schwelle, Wiederholung bei halber Schwelle und keine rückwirkende Auslösung.

### PR B: Editor

Endet mit der visuellen Pflichtmatrix für den Editor, `npm run gate:push` und
den betroffenen E2E-Tests.

#### B1 Gemeinsame UI-Bausteine und Tokens

- [ ] `SuccessToast` und `useSuccessToast` (`src/ui/feedbackUi.tsx`) mit
  optionaler Aktion: 10 s, Pause bei Mauszeiger und Fokus, Ersetzen durch den
  nächsten Toast (W7).
- [ ] Tag-Eingabe: Chips, Vorschläge, Hierarchie, Trennung nach W10;
  importierte Gruppe eingeklappt, ausklappbar und bearbeitbar. Genutzt von
  Editor und Erstellen.
- [ ] Flaggenwähler: Punkte auf Desktop, 4×2-Raster mit Namen mobil, Namen in
  Tooltip und `aria-label` (W14); Link `Namen bearbeiten` nach W23. Genutzt von Editor,
  Lernmodus und Kartenverwaltung.
- [ ] `RichTextEditor`: Werkzeugleiste nur am aktiven Feld.
- [ ] Tokens hell und dunkel: `--flag-1` bis `--flag-7`, `--core-danger-text`,
  `--core-marked-surface`; Theme-Vertragstest.
- [ ] Katalog-Demos in `scripts/uiCatalogDemos.tsx`, `src/ui/README.md`.
- Nachweis: Katalog im Browser geprüft, Kontraste hell/dunkel ≥ 4,5:1 für
  Text.

#### B2 Editor-Rahmen

- [ ] `DeckCardEditor` aus `src/screens/DecksScreen.tsx` nach
  `src/screens/cardEditor/` aufteilen.
- [ ] Dialog über die ganze Fläche / Vollbild mobil, Kopf mit Vor/Zurück,
  Duplizieren, Löschen (W8), Schließen.
- [ ] Reiter als URL-Parameter nach W5; Einstieg nach W6; Reload und Zurück
  bleiben deterministisch.
- [ ] Fokusführung und die Rückfrage bei ungespeicherten Änderungen bleiben;
  Tastenkürzel nach W11.
- [ ] Fußleiste für den Entwurf, Markiert-Tönung, Statussymbole in der
  Unterzeile.
- [ ] Vor/Zurück: Die Tabelle gibt die Reihenfolge ihrer geladenen Zeilen
  weiter. Am Seitenende wird nachgeladen, sonst ist der Knopf inaktiv.
- [ ] `Varianten` und `Lernen` werden erst beim Öffnen geladen.
- Nachweis: Bundle-Budget eingehalten, Tastatur- und Fokus-Tests.

#### B3 Reiter Allgemein

- [ ] Flagge und Markiert; Planung mit Schnellwahl, `Neu planen` nach Änderung,
  Aussetzen, Zurückstellen; Lernbremse mit `Zurücksetzen`.
- [ ] Verschieben über den vorhandenen Dialog mit `DeckSelect`.
- [ ] Tags (sofort speichernd).
- [ ] Karten aus diesem Inhalt, inklusive Entwurfszeile „Neu beim Speichern“.
- [ ] Ähnliche Inhalte, erst geladen, wenn der Browser frei ist; offline
  ausgeblendet.
- [ ] Details mit Quelle, Prüfung und kopierbaren IDs.
- [ ] Rückgängig nach W7 und W20.

#### B4 Reiter Inhalt

- [ ] Zwei Spalten: Felder und Live-Vorschau über `renderCard` bzw.
  `NoteCardContent`, mit kurzer Verzögerung von etwa 150 ms; Kartenauswahl,
  Seitenumschalter und Bildverdeckung nach W9. Gerendertes HTML wird nie
  gespeichert.
- [ ] Arbeitet auf `NoteEditorValue`, ohne Bindung an eine gespeicherte Notiz
  (W16).
- [ ] Mobil `Bearbeiten | Vorschau`; Inhaltsform und Lernrichtung als eine
  Zeile.
- [ ] Geändert-Punkte je Feld nach W15, Schalter `Antwort eintippen`.
- [ ] Medienliste aus `Note.media`: Größen nur, wenn bekannt; ungenutzte
  Dateien entfernbar.
- Nachweis: Korpustest mit AnKing-Notizen für W15.

#### B5 Reiter Varianten

- [ ] Original zum Vergleich; je Variante Bearbeiten (W12), Neu generieren,
  Abschalten, Löschen; veraltete Varianten ersetzen; Link zu den
  Stapeleinstellungen.
- [ ] Freigabe zeigt die Variantenbereitschaft nach ADR-044 (Haltbarkeit
  erreicht die Stapelschwelle) statt einer XP-Zahl.
- [ ] Zustandsmarken erweiterbar (W17).

#### B6 Reiter Lernen

- [ ] 9 Kennzahlen aus Lernstand und `calculateRetrievability` (FSRS-7);
  Reifeband nach W18 statt „Lernstufe XP“; Lernbremse mit Zeitpunkt.
- [ ] Abrufverlauf und vollständige Bewertungsliste, erst beim Öffnen geladen,
  Cloud-Teil nur online (W19).
- [ ] `Als neu lernen …` mit Bestätigungsdialog nach W21.

#### B7 Abnahme Editor

- [ ] Tests anpassen: `DecksScreen.test.tsx`; E2E `card-lifecycle`,
  `navigation-context`, `core-stabilization`, `batch-resilience`,
  `zz-media-import`; Test für Sync-Fassung bei offenem Entwurf (W19).
- [ ] Visuelle Pflichtmatrix aus [`operations.md`](operations.md) hell und
  dunkel für alle vier Reiter, Desktop und mobil. Bewertungsrunden mit
  Screenshots aus der echten App bis mindestens 9,5/10.
- [ ] `src/ui/README.md` und Specs-Abweichungen nachziehen.

### PR C: Restliche Oberflächen und Gesamtabnahme

#### C1 Erstellen und Lernmodus

- [ ] Erstellen nutzt die Tag-Eingabe aus B1.
- [ ] Lernmodus: Flagge setzen über Menü und `Strg+1`–`7`, Flaggenpunkt in der
  Kopfzeile (W14), ohne Toast (W20); Hinweis zur Lernbremse nach W22.

#### C2 Kartenverwaltung und Stapeleinstellungen

- [ ] Flaggenpunkt in der Tabelle; Filter für Flagge, Lernbremse und Tags;
  Suchsyntax aus A4 in der Suchzeile.
- [ ] Stapeleinstellungen: Schwelle und Aktion der Lernbremse
  (`Nur kennzeichnen`, `Aussetzen`).
- [ ] Karteneinstellungen: Flaggennamen nach W23, Deep-Link-Ziel `flag-names`.

#### C3 Gesamtabnahme

- [ ] Visuelle Pflichtmatrix hell und dunkel für Erstellen, Lernmodus,
  Kartenverwaltung und Stapeleinstellungen.
- [ ] `npm run gate:push`, `npm run performance:measure:local`,
  `npm run test:rls:local`, `npm run test:e2e:local`.
- [ ] `status.md`, `history.md`, `src/ui/README.md` nachziehen; P0 hier
  entfernen.

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
      gescheiterte und gemeldete Karten erneut. Ein neuer Zustand erscheint als
      weitere Zustandsmarke im Reiter `Varianten` des Editors V2 (P0, W17).
      Nachweis: Playtest-Ergebnis vor und nach der Prompt-Ergänzung,
      Routentests mit solchen Karteninhalten.

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
      Bearbeiten und Vorschau nutzen den Reiter `Inhalt` des Editors V2 (P0,
      W16), kein zweiter Editor;
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
