# CoRe-Architektur und Invarianten

**Rolle:** aktuelle technische Grenzen und Invarianten. **Stand:** 2026-10-07.
Produktverhalten: [Specs](specs.md). Ist-Stand: [Status](status.md). Gates: [Betrieb](operations.md). Offene Änderungen: [TODO](todo.md). Formatdetails: [Anki-Referenz](anki-format-analysis.md).

## Systemkontext

CoRe ist eine Vite-/React-SPA mit TypeScript. Accountgebundene Browsermodule kapseln Supabase Auth, Postgres und privaten Storage. Vercel liefert die SPA und eine authentifizierte Function für textbasierte Basic-Kartenvarianten. React orchestriert UI; Domänenmodule besitzen Validierung, Datenformung und Persistenz.

## Modulgrenzen

| Eigentümer | Verantwortung |
| --- | --- |
| `App.tsx`, `screens/` | App-Koordination und Produkt-UI; [Screen-Landkarte](../src/screens/README.md) |
| `appNavigation.ts`, `useAppNavigation.ts` | typisierter AppRoute, URL-Kontext und einzige Browser-History-Anbindung |
| `ui/`, `styles.css`, `coreTheme.ts` | gemeinsame UI, semantische Tokens und validierte Theme-Präferenz; [UI-Verträge](../src/ui/README.md) |
| `coreTypes.ts`, `coreModel.ts` | kanonische Typen, Learning-Item-Erzeugung, Normalisierung und validierte Editorprojektion |
| `coreWorkspace.ts`, `coreRepository.ts` | Anwendungsbefehle, Platzierungs-/Zyklusprüfung und lokale Kartenoperationen |
| `deckSettings.ts`, `settingsDraft.ts` | normalisierte Lernwerte, Presets und Snapshot-Gleichheit von Entwürfen |
| `libraryModel.ts`, `deckHierarchy.ts` | Stapel-/Kartentabellenprojektion und rein visuelle Tiefenkappung |
| `statisticsModel.ts`, `studyHeatmapModel.ts` | begrenzte Statistikreihen, Tageszähler, Streak und Kalenderprojektionen |
| `reviewService.ts`, `scheduler.ts`, `easyDays.ts` | Queue, Bewertung, FSRS-6 und deterministische Intervallentlastung |
| `coreVariantService.ts` | Reife, Eligibility, Variantenwahl und Original-Fallback |
| `creationBatch.ts`, `creationWorkflow.ts` | manuelle Erstellung, Batchzustand und getrennte lokale Medienvorbereitung |
| `importUiState.ts`, `apkgImportSession.ts` | sichtbare Importphasen und flüchtige accountgebundene Sitzung |
| `apkgImport.ts` | öffentliche APKG-Normalisierungsgrenze; Worker, Protokoll, ZIP und SQLite bleiben privat |
| `apkgNoteTranslation.ts` | vorbereitete, noch unverdrahtete Übersetzung eines gelesenen Anki-Pakets in den `Note`/`Card`-Importgraphen |
| `ankiContentModel.ts`, `cardPresentation.ts` | private Formatübersetzung sowie sicherer gemeinsamer Template-Compiler/Renderer |
| `CardPresentationSurface`, `StudyCardContent`, `CardPreviewDialog` | React-Host, kontrollierte Kartenkomposition und transiente Entwurfsvorschau |
| `indexedDbCoreRepository.ts`, `workspaceHydrationService.ts` | accountgebundene Web-Replica, begrenzte Hydrierung, Offline-Download und Quota-Bereinigung |
| `cloudRepository.ts`, `cloudRepositoryValidation.ts` | accountgefilterte Cloudmutationen, Revisionen, Konflikte und Row-/JSONB-Validierung |
| `accountStorage.ts`, `profileIntegrity.ts` | kleine Accountnamespaces und vollständige Profilpatches |
| `mediaStore.ts`, `cloudMediaStore.ts` | öffentliche Cache-/Queue-/URL-Grenze; private Storage-, Signed-URL- und TUS-Details |
| `aiCardVariantContract.ts`, `aiCardVariant.ts`, `api/ai/card-variant.ts` | validierter Textvertrag, Browseraufruf und serverseitiger Providerzugriff |
| `pomodoroTimer.ts` | einziger accountgebundener Timer, Validierung und Endzeitprojektion |

Die Pfade in der Tabelle liegen unter `src/`, soweit kein anderer Pfad angegeben ist. Fremdpayloads bleiben `unknown`, bis das besitzende Modul sie validiert. Es gibt keine zentrale Sammelvalidierung oder allgemeine Anbieter-Adapterebene.

### Theme- und UI-Vertrag

`styles.css` besitzt Palette, semantische Rollen, Typografie und gemeinsame Control-Styles. `coreTheme.ts` besitzt Browserpräferenz und Dokumentattribut. `CoreSegmentedControl` und die untere `AppNavigation` teilen `useSlidingSelection`; die fachliche Auswahl bleibt beim Aufrufer. UI-Details stehen ausschließlich im [UI-Modulindex](../src/ui/README.md); [UI-Elements](ui-elements.html) ist die erzeugte Referenz nach Elementfamilien. Gemeinsame Änderungen werden dort synchronisiert und visuell geprüft.

### Navigation und URL-Kontext

Der AppRoute enthält View sowie zulässigen Deck-, Karten-, Erstellungs- und Reviewkontext. Parse/Serialize validiert die Kombinationen; `useAppNavigation` ist die einzige History-Anbindung. `deckContent` und `returnContent=1` erhalten die Inhaltsansicht bei der Review-Rückkehr. Browser-Zurück/-Vorwärts darf keine History-Schleifen erzeugen. Entwürfe und Fokus bleiben transient; offene Einstellungsentwürfe blockieren Navigation ohne Zielpuffer. Unbekannte Routen fallen auf die Übersicht zurück.

## Domäneninvarianten

- Ein Deck enthält Learning Items. Jedes Item besitzt einen eigenen Review State und `dueAt`; Reverse-Richtungen, Cloze-Gruppen und reale Anki-Cards sind eigenständige Items.
- Der ursprüngliche Inhalt bleibt am Learning Item. KI-Varianten in `variants[]` bleiben daran verankert, haben keinen eigenen Review State oder Termin und zählen nicht zusätzlich für Queue oder Bestand.
- `LearningItemDocumentV1` und `NoteTypeDefinitionV1` sind Inhalts- und Darstellungswahrheit. Compatibility-Felder und Editorwerte werden atomar daraus projiziert. Feldnamen/-positionen sind keine semantischen Schlüssel.
- `CardContentPayload` enthält validierte Editorwerte und stabile Medienreferenzen, keine Entitäts-/Reviewidentitäten, Bytes oder Signed URLs. Kopien erhalten frische Karten-, Review- und Scheduleridentitäten.
- Importierte Feldwerte sind editierbar; Anki-Feldschema, Templates und CSS bleiben strukturell schreibgeschützt. Entwurfsvorschau persistiert oder revidiert nichts.
- Templateauswertung, Sanitization und URL-Auflösung bleiben getrennt. Scripts und externe Ressourcen werden nicht ausgeführt; lokale Darstellung verwendet nur `blob:`/`data:`, Sandbox-CSP und eingebettete Basisschriften. Der Renderer besitzt die Anki-`FrontSide`-Komposition.
- Manuelle Speicherung ist Single Flight mit unveränderlichem Snapshot. Reihenfolge: lokale Medienvorbereitung, Mediencache, lokale Karte, Upload und Referenzpersistenz. Cloudfehler nach lokalem Erfolg sind Teilabschlüsse. APKG-Medien werden nicht verkleinert.
- Reimport identifiziert Karten über `sourceCardId`, bewahrt lokale Inhaltsänderungen, Review State, Markierung, Aussetzung und lokale Stapelordnung. Medienreferenzen werden vor ihrer Stilllegung ergänzt.
- Review Events sind append-only und accountgebunden. `revlog` wird deterministisch dedupliziert. Initialer Schedulerstate folgt FSRS-Memory-State, Revlog-Replay, klassischem Kartenstatus, neuer Karte; ab dem ersten CoRe-Review besitzt FSRS-6 den State.
- KI-Varianten akzeptieren nur validierte Basic-Plaintexts. Toolname, Anzahl, Schema, Änderung, Duplikate und Größenlimits werden vor der bestehenden Variantenmutation geprüft. Eine inzwischen geänderte Karte verhindert die Mutation.
- React kennt keine Parser-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails. Ein aktiver Workerfehler bleibt sichtbar; es gibt keinen stillen Direktparser-Retry.

## Heutiges Compatibility-Modell

`deck.cards[]`, einzelne `CoreCard`-Typgrenzen und die Cloudtabelle `cards` bezeichnen Learning Items. `cards.content_document` und `deck_note_type_definitions.definition` speichern normalisierte Dokumente/Definitionen; diese heutigen Namen werden nicht nebenbei migriert. Jeder zusätzliche Varianteninhalt bleibt einem vorhandenen Item untergeordnet. Geplante Umbauten stehen ausschließlich in [TODO](todo.md).

### Vorbereitete Note-/Card-Domäne

`coreTypes.ts` enthält zusätzlich `Note`, `Card` und `CardStudyState` nach
ADR-032. Ein Inhalt besitzt Felder, Tags, Herkunft, Markierung und
Inhaltsrevision ohne Stapel; die Markierung liegt außerhalb von `content` und
zählt nicht als Inhaltsänderung. Eine Karte besitzt Inhaltsreferenz, Stapel,
Abfrageschlüssel, Status, Anki-Flagge, Lernstand und Varianten. Queue-Werte sind direkt typisiert, die weiteren
genutzten Lern- und Variantenwerte liegen in einem typisierten `study.extra`;
`cardStudyFromReviewState` bildet einen Scheduler-Zustand darauf ab.
Importierte Inhalte tragen `importedContentRevision` = `contentRevision` beim
Import; ein höherer `contentRevision` bedeutet lokale Bearbeitung. Manuelle
Inhalte tragen `null`.

Das private Modul `coreModel/notes.ts` bietet `createNote`,
`planNoteContentChange` und `planNoteDeletion`. Inhaltseingaben bleiben
`unknown`, bis `parseNoteContent` sie validiert und bereinigt; dessen
Abfrageschlüssel bestimmen die Kartenmenge. Änderungen erhalten bestehende
Karten samt Lernstand unverändert, erhöhen Inhalts- und Entitätsrevision
einmal und liefern entfallende Karten zur Bestätigung zurück. Ist der
bereinigte Inhalt unverändert, meldet der Plan `changed: false` und behält
den bisherigen Inhalt samt Revisionen. Neue Karten kommen in den Stapel der
Karte, deren Abfrageschlüssel im bisherigen Inhalt zuerst abgeleitet wird;
bestehende Platzierungen bleiben erhalten. Aufrufer übergeben jeweils die
vollständige, nicht gelöschte Kartenmenge eines Inhalts; fremde Karten sowie
doppelte Karten oder Abfrageschlüssel werden abgewiesen. `updatedByDeviceId`
setzt die Persistenz beim Schreiben, nicht die reine Planung.

Die Löschplanung liefert Soft-Delete-Datensätze für Inhalt und Geschwister
mit gemeinsamem Zeitstempel sowie deren vollständige vorherige Datensätze
als `undo`. Sie verändert weder Eingaben noch Persistenz. Löschung erhöht
nur Entitätsrevisionen; Lernstand, Aussetzung und Inhaltsrevision bleiben
erhalten. Die Funktionen werden von Modultests und vorbereiteten Katalog-Demos genutzt,
noch nicht über `coreModel.ts` exportiert und ändern keinen App-Laufzeitpfad.

### Vorbereitete Kartendarstellung

`notePresentation.ts` rendert validierte `Note`/`Card`-Paare asynchron über
`renderCard({ note, card, side, surface, theme, typedAnswer? })`. Das Ergebnis enthält
`srcdoc`, `accessibleText`, stabile `mediaReferences`, `interactions` und
`diagnostics`; HTML wird weder persistiert noch aus Anki-Templates erzeugt.
Der Theme-Snapshot enthält die aktuellen semantischen Farben. Feld-HTML
durchläuft `sanitizeNoteHtml`; Textfarben erreichen 4,5 : 1 zum Kartenhintergrund.
Lücken werden verschachtelt tokenisiert, Bildmasken als relatives SVG dargestellt;
Textbeschriftungen der Masken sind HTML (Skala 1 entspricht der Kartenschrift),
damit die gestreckte Maskenfläche sie nicht verzerrt.
`alwaysOccluded` hält fremde Maskengruppen auch im Modus „eine verdecken“ sichtbar;
die aktive Gruppe wird auf der Antwortseite trotzdem zum Umriss. Eine Maske der
Form `overlay` legt ein ganzes Maskenbild über das Bild (Frage- und optional
Antwortbild, etwa aus Image Occlusion Enhanced); sie erscheint nur für die aktive
Gruppe und zeichnet keinen Umriss.
Review-Antworten ergänzen nur Antwort und Trennlinie; Vorschau und Verwaltung
enthalten beide Seiten. Lücken und Bildmasken ersetzen die Frage beim Aufdecken.
Zusätze stehen vor den Quellen; Quellen mit Link erscheinen gemeinsam als Chips am
Kartenende. Mit `typedAnswer` ersetzt die Antwortseite das Eingabefeld durch den
Zeichenvergleich aus `compareTypedAnswer`.

`cardPresentationFrame.ts` besitzt das gemeinsame CSP-Gerüst und die bestehende
Blob-/Data-URL-Auflösung. Der Rahmen enthält kein Script und erlaubt keine
externen Ressourcen. `CardPresentationSurface` nimmt optional ein fertiges
Renderergebnis entgegen; diese Variante erlaubt zusätzlich isolierte externe
Popups und meldet Textauswahl an den Host. Der bisherige Learning-Item-Aufruf
behält seinen bisherigen Vertrag.

`ui/NoteCardContent.tsx` besitzt ausschließlich transienten Eingabe-, Auswahl-
und Darstellungszustand. Das Eingabefeld steht bis zum Aufdecken im Host; danach
rendert der Host die Antwortseite einmal mit der Eingabe neu. `compareTypedAnswer`
und `evaluateNoteChoice` bleiben reine Renderer-Helfer; `notePlainText` erhält Wörter und Satzzeichen über
Inline-HTML hinweg und trennt Blockinhalte. Vorlesen verwendet bereinigte, der aktuellen Kartenseite
entsprechende Texte und die System-Sprachausgabe im Host. AMBOSS öffnet die Suche
mit dem markierten Begriff. KaTeX wird nur bei erkannten Formeln (`\(…\)`,
`\[…\]`, `[$]`, `[$$]`, `[latex]`) importiert;
`noteMathAssets.ts` lädt lokale WOFF2-Assets einmal und bettet sie mit dem CSS
als Data-URLs in den Rahmen ein. Die Bausteine sind nur im UI-Katalog angebunden;
Import, App und Persistenz wechseln erst im Cutover auf diesen Vertrag.

## Persistenz, Sync und Medien

- IndexedDB `core.workspace.entities.v3.<userId>` (Schema 1) trennt Deck-Hüllen, Summaries, Katalog, Kartenkörper, Varianten, Reviewereignisse, Notiztypen, Outbox und Konflikte. `accountStorage` hält nur `core.accountState.v2` und `core.syncDevice.v2`.
- Hydrierung lädt begrenzte Karten-/Lernfenster. Offline-Downloads pinnen Karten, Varianten, Definitionen und hashgeprüfte Medien; Quota-Bereinigung entfernt ausschließlich ungepinnte bestätigte Körper/Medien.
- Lokale Mutationen und Outbox werden atomar persistiert. Revisiongeprüfte Cloudwrites und bestätigte lokale Applies besitzen getrennte Abschlussgrenzen; fehlgeschlagener Cloud-Sync setzt den lokalen Erfolg nicht zurück.
- Die Outbox hält je Entität höchstens eine ausstehende Mutation. Ersetzt eine Änderung einen noch nicht bestätigten Insert, bleibt sie ein Insert ohne Basisrevision. Existiert die Zeile in der Cloud bereits und hat sie zuletzt dasselbe Gerät geschrieben, war nur die Antwort verloren; die Mutation wird dann als Update auf diese Revision angewandt. Fremde oder gelöschte Zeilen bleiben Konflikte.
- Konfliktmetadaten bleiben lokal erhalten. Betroffene Karten fehlen im Review-Scope und bleiben in der Verwaltung sichtbar. Auflösung betrifft ausschließlich geprüfte Konflikte und bewahrt konfliktfreie Inhalte, Reviews und Medien.
- `card_catalog` und `deck_study_summaries` sind die Cloudprojektionen mit Account-RLS und Keyset-/Deck-/Sortier-/Reviewindizes. Trigger pflegen sie transaktional ohne fachliche Revisionsänderung. Fälligkeit wird für den Lerntag indexgestützt ermittelt.
- `list_account_card_catalog()` liefert eine Keyset-Seite, `get_deck_offline_manifest()` Revisionen/Größen/Medienhashes und `get_account_statistics()` begrenzte Aggregate.
- Medien liegen privat unter accountgebundenen SHA-1-Pfaden. Deckmodelle persistieren Referenzen, keine Bytes, Tokens oder Signed URLs. Die persistierte Queue besitzt Objekt-/Referenzentscheidung und monotone Bytezähler; Upload wartet auf bestätigte Cloud-Eltern.
- Profilpatches enthalten das vollständige Profil. Nur erfolgreicher Cloud-Bootstrap darf unvollständige alte Profilpatches ersetzen und gültige UI-Präferenzen retten; vollständige Offlinepatches und andere Outbox-Mutationen bleiben erhalten.

Die Migrationsbaseline in `supabase/migrations/` und `supabase/verify_schema_v1.sql` sind die ausführbaren SQL-Quellen. `database.types.ts` wird ausschließlich aus der frisch aufgebauten lokalen Datenbank generiert. RLS schützt Nutzertabellen; Ownership stammt nicht aus veränderbaren User-Metadaten.

## API-Vertrag

`POST /api/ai/card-variant` ist der einzige CoRe-Serverendpunkt. Er verlangt Same Origin und Supabase-Bearer, akzeptiert `{ source: { front, back } }`, begrenzt den Body auf 8 KiB und jedes Feld auf 1.200 Zeichen und antwortet mit `Cache-Control: no-store`. OpenRouter-Zugang bleibt ausschließlich in `process.env`. Die Function wählt kostenlose text-/toolfähige Modelle, bevorzugt ZDR und erlaubt den dokumentierten kostenlosen Non-ZDR-Fallback; genau ein erzwungener Tool Call erzeugt eine Umformulierung. Vertragsdetails stehen bei `aiCardVariantContract.ts`, der operative Umgang in [Betrieb](operations.md). Andere Produktdatenzugriffe laufen über die gekapselten Supabase-Module. Secrets gehören weder in `VITE_*`, Browsercode, `localStorage`, Exporte noch Logs.

## Importregeln

Der Worker normalisiert einmal; der Main Thread streamt den Commitgraphen in begrenzten Chunks nach IndexedDB. Persistierte IDs werden vor dem Schreiben zugeordnet. Die flüchtige APKG-Sitzung überlebt interne Navigation; Reload-Wiederanlauf gehört nur Outbox und Medienqueue. Legacy-JSON und V18-Protobuf sind unterstützte externe Anki-Formate, keine obsolete Appkompatibilität. Unbekannte Quellfelder bleiben im unveränderlichen Snapshot. Format-, Template-, Medien-, Identitäts- und Revlogdetails stehen in der [Anki-Referenz](anki-format-analysis.md); sichtbare Phasen, Dateigrenzen und Teilabschlüsse in [Specs](specs.md). Der ZIP-Leser liest Einträge einzeln aus dem `Blob`, statt das Archiv vollständig zu laden.

### Vorbereitete Note-Übersetzung

`readAnkiPackage(file)` in `apkgImportInternal.ts` liest `.apkg` und `.colpkg`
bis 2 GiB (`ANKI_PACKAGE_MAX_BYTES`) zu Stapeln mit Filterkennung, Notizen,
Karten, Notiztypen, Revlog, Sammlungsdatum und einem Medienindex. Medien bleiben
im Archiv und werden erst über `readBytes()` gelesen; moderne Pakete liefern
SHA-1 und Größe aus `MediaEntries` (Eintrag *i* ist ZIP-Eintrag `i`), Legacy-Medien
werden einzeln gehasht. Die sichtbare 250-MB-Grenze des heutigen Imports bleibt
bis zum Cutover bestehen.

`translateAnkiPackage(pkg)` in `apkgNoteTranslation.ts` ist eine reine Funktion
und liefert `{ decks, notes, cards, mediaFiles, reviewEvents, noteTypeSources,
report }`:

- **Stapel:** Karten liegen in `did`, in gefilterten Stapeln im Heimatstapel
  `odid`. Angelegt werden nur Stapel mit Karten und ihre Vorfahren; gefilterte
  Stapel nie.
- **Übersetzer-Registry** in Erkennungsreihenfolge: native Image Occlusion
  (`originalStockKind` 6), „Multiple Choice for Anki“ (Felder plus
  `qtable`/`Q_solutions`), Image Occlusion Enhanced (drei Maskenfelder, eine
  `overlay`-Maske), AnKing-/Ankizin-Familie (Lückentyp mit `Text`, `Extra` und
  Hinweis-Buttons), Anki-Standardtypen und der generische Übersetzer. Weil Anki
  `originalStockKind` auch an geklonte und neu angelegte Notiztypen vergibt,
  zählen Basic-Familie und Lückentext nur mit unveränderten Standardvorlagen
  als Standardtyp. Jeder Inhalt trägt `translator: { id, version }`.
- **Generischer Übersetzer:** wertet die Vorlagen mit `compileSafeTemplate`
  ohne Script-Blöcke und Kommentare aus. Angezeigte Vorderseitenfelder werden
  Frage, direkt sichtbare neue Rückseitenfelder nach `{{FrontSide}}` oder
  `<hr id=answer>` Antwort, `hint:` Hinweis; nie angezeigte Felder bleiben
  Notiz. Felder in einem `{{#Feld}}`-Abschnitt mit Button werden vorn Hinweis,
  hinten wie per `display:none` verborgene Felder und Felder namens `Extra`
  Zusatz; Lückentypen führen alle Rückseitenfelder als Zusatz. Metadaten (`Note ID`, `ankihub_id`, `Date Stamp`,
  GUID) bleiben unabhängig von ihrer Position Notiz; `Source`/`Quelle` und
  AMBOSS-, Link- oder URL-Felder werden Quelle. Ein Feld in `href="…{{Feld}}…"`
  wird Quelle und zum Link mit dem Feldnamen als Beschriftung. Statischer Text
  auf der Zeile eines Fragefelds (ohne Buttons und Links) wird Anweisung mit
  `…`, ersatzweise eine mit `?` oder `:` endende Zeile direkt darüber, eine vollständig umschließende Bedingung `requires`, `type:` Eintippen,
  `tts` Vorlesen und `furigana:`/`kana:`/`kanji:` Ruby-Text. Die
  AnKing-/Ankizin-Familie nutzt dieselbe Positionsanalyse.
- **Abfrageschlüssel:** Basic-Familie `forward`/`reverse`, sonst `anki-<Ordinal>`,
  Lückentext `cloze:N`, Bildverdeckung `io:N`, Auswahl `choice`. Die Kartenmenge
  folgt dem Inhalt: fehlende Anki-Karten werden abgeleitet, Anki-Karten ohne
  Abfrage berichtet. Passt ein Inhalt nicht zum Übersetzer, wird er Feldliste
  (`field-list`), statt verloren zu gehen.
- **Lernstand:** Phase, Fälligkeit (Tageswerte relativ zum Sammlungsdatum),
  Zähler, Aussetzung und `flags & 7` kommen von der Anki-Karte; das Gedächtnis
  folgt FSRS-Memory-State, Revlog-Replay, klassischem Intervall oder bleibt neu.
  Zurückgesetzte Karten beginnen neu. Das Tag `marked` wird zu `note.marked`.
  Reviewereignisse tragen deterministische IDs je Anki-Revlog-Zeile.
- **Medien:** Verweise nur aus `src`, `poster` und `[sound:…]`, verglichen nach
  HTML-, URL- und NFC-Normalisierung; der Feldtext verweist danach auf den
  kanonischen Namen. Je SHA-1 bleibt eine Datei; übernommen werden nur
  referenzierte Medien.
- **Bericht:** je Notiztyp Übersetzer, Inhalte, Karten, Feldrollen, nicht
  zugeordnete Felder, Feldlisten- und nicht darstellbare Inhalte, fehlende
  Medien und übernommener Lernstand nach Herkunft.

`noteTypeSources` enthält die unsichtbare Anki-Vorlage je genutztem Notiztyp
für spätere Neuübersetzung. Die Funktion ist nur an Matrix, Korpusbericht und
Benchmark angebunden; Worker, Commit und Oberfläche wechseln im Cutover.

## Architekturänderungen

Änderungen erhalten diese Grenzen und Invarianten. Dauerhafte Trade-offs gehören in [Entscheidungen](decisions.md), offene Umbauten nur in [TODO](todo.md). Implementierungs- und Layoutdetails werden in ihren besitzenden Quellen gepflegt und hier nicht dupliziert.
