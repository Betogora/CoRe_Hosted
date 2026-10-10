# CoRe-Architektur und Invarianten

**Rolle:** aktuelle technische Grenzen und Invarianten. **Stand:** 2026-10-08.
Produktverhalten: [Specs](specs.md). Ist-Stand: [Status](status.md). Gates: [Betrieb](operations.md). Offene Änderungen: [TODO](todo.md). Formatdetails: [Anki-Referenz](anki-format-analysis.md).

## Systemkontext

CoRe ist eine Vite-/React-SPA mit TypeScript. Accountgebundene Browsermodule kapseln Supabase Auth, Postgres und privaten Storage. Vercel liefert die SPA und eine authentifizierte Function für textbasierte Kartenvarianten. React orchestriert UI; Domänenmodule besitzen Validierung, Datenformung und Persistenz.

## Modulgrenzen

| Eigentümer | Verantwortung |
| --- | --- |
| `App.tsx`, `screens/` | App-Koordination und Produkt-UI; [Screen-Landkarte](../src/screens/README.md) |
| `appNavigation.ts`, `useAppNavigation.ts` | typisierter AppRoute, URL-Kontext und einzige Browser-History-Anbindung |
| `ui/`, `styles.css`, `coreTheme.ts` | gemeinsame UI, semantische Tokens und validierte Theme-Präferenz; [UI-Verträge](../src/ui/README.md) |
| `coreTypes.ts`, `coreModel.ts` | kanonische `Note`/`Card`-Typen; einzige Grenze für Inhaltserzeugung, Änderungs-, Lösch- und Wiederherstellungsplanung, Editorwerte und manuelle Formen |
| `coreWorkspace.ts`, `coreRepository.ts` | Arbeitsbereichszustand, Stapelbefehle und Platzierungs-/Zyklusprüfung |
| `deckSettings.ts`, `settingsDraft.ts` | normalisierte Lernwerte, Presets und Snapshot-Gleichheit von Entwürfen |
| `libraryModel.ts`, `deckHierarchy.ts` | Stapel-/Kartentabellenprojektion und rein visuelle Tiefenkappung |
| `statisticsModel.ts`, `studyHeatmapModel.ts` | begrenzte Statistikreihen, Tageszähler, Streak und Kalenderprojektionen |
| `reviewService.ts`, `scheduler.ts`, `easyDays.ts` | Queue, Bewertung, FSRS-6 und deterministische Intervallentlastung |
| `coreVariantService.ts` | Reife, Eligibility, Variantenquelle, Variantenwahl, Variantendarstellung und Original-Fallback |
| `creationBatch.ts`, `creationWorkflow.ts` | manuelle Erstellung einschließlich Bildverdeckung (Bild als SHA-1-benanntes Medium), Batchzustand und getrennte lokale Medienvorbereitung |
| `importUiState.ts`, `apkgImportSession.ts` | sichtbare Importphasen und flüchtige accountgebundene Sitzung |
| `apkgImport.ts` | öffentliche APKG-Grenze: Vorschau und gestreamter Importgraph; Worker, Protokoll, ZIP und SQLite bleiben privat |
| `apkgNoteTranslation.ts`, `importRetranslation.ts` | Übersetzung eines gelesenen Anki-Pakets in den `Note`/`Card`-Importgraphen und automatische Neuübersetzung unbearbeiteter Importe |
| `notePresentation.ts`, `presentationFrame.ts` | asynchroner Kartenrenderer sowie gemeinsames CSP-Gerüst und Medienauflösung |
| `CardPresentationSurface`, `NoteCardContent`, `CardPreviewDialog` | Iframe-Rahmen, Antwort-Host mit transientem Eingabe-/Auswahlzustand und Vorschau |
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

- Ein Inhalt (`Note`) speichert Felder mit Rollen, Interaktion, Tags, Medienzuordnung (Name → SHA-1), Herkunft und Markierung genau einmal. Seine Abfrageschlüssel bestimmen die Kartenmenge; jede Karte (`Card`) trägt Stapel, Abfrageschlüssel, Status, Anki-Flagge, eigenen Lernstand und Varianten. Reverse-Richtungen, Lückengruppen und reale Anki-Karten sind Geschwister desselben Inhalts und dürfen in verschiedenen Stapeln liegen.
- KI-Varianten in `card.variants[]` bleiben an ihre Karte gebunden, haben keinen eigenen Lernstand oder Termin und zählen nicht zusätzlich für Queue oder Bestand. Im Review werden sie als transienter Frage-/Antwort-Inhalt mit den Zusatz- und Quellenfeldern des Inhalts dargestellt.
- Inhaltsänderungen laufen über `planNoteContentChange`: unveränderter bereinigter Inhalt meldet `changed: false` und schreibt nichts; neue Abfragen werden neue Karten, entfallende Karten werden erst nach Bestätigung soft-gelöscht. Ändert sich der bereinigte Frage- oder Antworttext einer behaltenen Karte, markiert die Planung deren aktive KI-Varianten als veraltet (`isActive: false`, `meta.outdated: true`, Revision +1); `replaceOutdatedVariants` ersetzt sie bei der Neuerzeugung durch eine neue Variante und soft-löscht die veralteten. Löschen betrifft immer den Inhalt mit allen Geschwistern; Undo stellt die vorherigen Datensätze mit fortlaufenden Revisionen wieder her. Die Markierung erhöht nur die Entitätsrevision, nicht `contentRevision`.
- Der Lernstand besitzt mit `studyRevision` eine eigene Konfliktgrenze. Reviews erhöhen sie atomar über `record_review_atomic`, Inhalts- und Kartenänderungen die Entitätsrevision; ein Review auf einem Gerät und eine Inhaltskorrektur auf einem anderen kollidieren daher nicht.
- Darstellung, Sanitization und URL-Auflösung bleiben getrennt. Scripts und externe Ressourcen werden nicht ausgeführt; lokale Darstellung verwendet nur `blob:`/`data:`, Sandbox-CSP und eingebettete Basisschriften. Gerendertes HTML wird nie persistiert.
- Manuelle Speicherung ist Single Flight mit unveränderlichem Snapshot. Reihenfolge: lokale Bildvorbereitung, Mediencache mit persistenter Upload-Queue, lokaler Inhalt samt Karten, Upload. Cloudfehler nach lokalem Erfolg sind Teilabschlüsse. APKG-Medien werden nicht verkleinert.
- Reimport ordnet Inhalte über die Anki-GUID und Karten über die Anki-Kartenidentität zu (lokal und über `load_reimport_targets` in der Cloud). Lokale Inhaltsänderungen (`contentRevision` > `importedContentRevision`), Lernstand, Aussetzung, Markierung und Stapelordnung bleiben; neue Abfragen werden neue Karten, im Paket fehlende Karten werden nur gezählt.
- Review Events sind append-only und accountgebunden. `revlog` wird deterministisch dedupliziert. Initialer Schedulerstate folgt FSRS-Memory-State, Revlog-Replay, klassischem Kartenstatus, neuer Karte; ab dem ersten CoRe-Review besitzt FSRS-6 den State.
- KI-Varianten entstehen nur aus den bereinigten Klartexten von Frage und Antwort einer Frage-/Antwort-Karte (`cardVariantSource`). Toolname, Anzahl, Schema, Änderung, Duplikate und Größenlimits werden vor der Variantenmutation geprüft. Ein inzwischen geänderter Inhalt verhindert die Mutation.
- React kennt keine Parser-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails. Ein aktiver Workerfehler bleibt sichtbar; es gibt keinen stillen Direktparser-Retry.

## Inhalte und Karten

`coreTypes.ts` definiert `Note`, `Card` und `CardStudyState` nach ADR-032 bis
ADR-036. Queue-Werte des Lernstands sind direkt typisiert, weitere Lern- und
Variantenwerte liegen typisiert in `study.extra`. Scheduler und Queue arbeiten
auf der flachen Sicht `ReviewState`; `reviewStateFromCardStudy` und
`cardStudyFromReviewState` bilden beide Formen verlustfrei aufeinander ab.

Das Begraben von Geschwistern (`buryNewSiblings`, `buryReviewSiblings`,
`buryInterdayLearningSiblings` in `LearningSettings`) ist kein persistiertes
Feld. `createDailyReviewQueue` leitet es bei jedem Aufbau ab: Heutige
Reviewereignisse der gelernten Stapel und `options.answeredToday` (heute
beantwortete Karten mit Inhalt und Stapel) markieren Inhalte als gesehen, danach
folgen Lernschritte des Tages, tagesübergreifende Lern- und fällige Karten und
neue Karten. Eine Karte ist begraben, wenn ihr Inhalt vorher gesehen wurde und
die vereinigten Optionen der Stapel der zuvor gesehenen Geschwister ihre Art
begraben; Karten jenseits eines Limits zählen nicht als gesehen, begrabene
verbrauchen kein Limit. Die Queue liefert `buriedKeys`; die Sitzung entfernt
damit offene Geschwister nach einer Antwort. `loadReviewSession` lädt
`answeredToday` aus Katalog und Reviewereignissen (auch Geschwister geladener
Karten in anderen Stapeln), aber nur mit `answeredSiblings`, das die App setzt,
wenn ein Stapel der Auswahl eine Option aktiviert hat. Stapelzähler aus
`listDeckSummaries` bleiben zählbasiert und berücksichtigen das Begraben nicht.
Importierte Inhalte tragen `importedContentRevision` = `contentRevision` beim
Import; manuelle Inhalte tragen `null`. `Deck.cards` enthält die geladenen
Karten eines Stapels, nie Inhaltskopien.

`coreModel.ts` exportiert `createNote`, `planNoteContentChange`,
`planNoteDeletion`, `planNoteRestore`, `setNoteMarked`, `duplicateNote`,
`noteTextIndex`, `notePromptLabel` (sichtbarer Name einer Abfrage, etwa
`Lücke 2`), die Editorwerte (`noteEditorValue`, `applyNoteEditorValue`,
`validateNoteEditorValue`), die Inhaltsbausteine (`noteBlocks`, `setNoteReverse`,
`setNoteTypeIn`, `addNoteField`, `canRemoveNoteField`, `removeNoteField`,
`renameNoteField`; Richtung und Eintippen nur für reine Vorwärts-/Rückwärts-
Abfragen, Feldrollen Zusatzfrage, Hinweis, Zusatz und Quelle), die Maskenhelfer der
Bildverdeckung (`createOcclusionNoteContent`, `validateOcclusionInput`,
`addOcclusionMask`, `moveOcclusionMasks`, `updateOcclusionMaskShape`,
`removeOcclusionMasks`, `groupOcclusionMasks`, `ungroupOcclusionMasks`,
`setOcclusionMasksAlwaysOccluded`, `occlusionGroups`; Gruppennummern werden nie
neu vergeben) und die manuellen Formen (`createManualNoteContent`,
`validateManualNoteInput`; Basic, Basic mit Rückrichtung, Lückentext, Single und
Multiple Choice; Zusatzfelder tragen eine Rolle, Basic optional Eintippen). Inhaltseingaben bleiben `unknown`, bis `parseNoteContent` sie
validiert und bereinigt. Aufrufer übergeben die vollständige, nicht gelöschte
Kartenmenge eines Inhalts; fremde Karten sowie doppelte Karten oder
Abfrageschlüssel werden abgewiesen. `updatedByDeviceId` setzt der Cloud-Write,
nicht die Planung.

### Kartendarstellung

`notePresentation.ts` rendert validierte `Note`/`Card`-Paare asynchron über
`renderCard({ note, card, side, surface, theme, typedAnswer? })`. Das Ergebnis enthält
`srcdoc`, `accessibleText`, stabile `mediaReferences`, `interactions` und
`diagnostics`; HTML wird weder persistiert noch aus Anki-Templates erzeugt.
Der Theme-Snapshot enthält die aktuellen semantischen Farben. Feld-HTML
durchläuft `sanitizeNoteHtml`. Farbige Marker (`background-color`) ändern ihre
Helligkeit, bis die Kartenschrift des Themes darauf 4,5 : 1 erreicht; graue,
weiße und schwarze Hintergründe aus kopiertem Webtext entfallen. Textfarben
erreichen 4,5 : 1 zu ihrem Marker oder zum Kartenhintergrund; unlesbare farblose
Textfarben übernehmen die Kartenschrift. `var(…)` in Farbwerten gilt als deckend.
Das Bild einer Bildverdeckung trägt den ersten Fragetext als Beschreibung
(„Herzklappen – Bild mit verdeckten Bereichen“).
Lücken werden verschachtelt tokenisiert. Bildmasken liegen in einer Ebene in
Bildgröße; ihre Positionen sind relativ zu Bildbreite und -höhe. Rechtecke,
Ellipsen und Beschriftungen drehen sich wie in Anki in Bildpixeln um ihre linke
obere Ecke (HTML mit CSS-Drehung), Polygone werden nie gedreht und liegen im
gestreckten 0–1-SVG. Beschriftungen verwenden Ankis Schrift Arial; `fontSize`
ist wie Ankis `fs` relativ zur Bildhöhe (umgesetzt in `cqh`), ohne `fontSize`
gilt `scale` als Vielfaches der Kartenschrift.
`alwaysOccluded` hält fremde Maskengruppen auch im Modus „eine verdecken“ sichtbar;
die aktive Gruppe wird auf der Antwortseite trotzdem zum Umriss. Masken mit
`ordinal` 0 sind nur verdeckt und bilden keine eigene Karte; sie sind nur mit
`alwaysOccluded` gültig. Eine Maske der Form `overlay` legt ein ganzes Maskenbild
über das Bild (Frage- und optional Antwortbild, der Rückfall für Image Occlusion
Enhanced); sie erscheint nur für die aktive Gruppe und zeichnet keinen Umriss.
Review-Antworten ergänzen nur Antwort und Trennlinie; Vorschau und Verwaltung
enthalten beide Seiten. Lücken und Bildmasken ersetzen die Frage beim Aufdecken.
Zusätze stehen vor den Quellen; Quellen mit Link erscheinen gemeinsam als Chips am
Kartenende. Mit `typedAnswer` ersetzt die Antwortseite das Eingabefeld durch den
Zeichenvergleich aus `compareTypedAnswer`.

`presentationFrame.ts` besitzt das gemeinsame CSP-Gerüst und die bestehende
Blob-/Data-URL-Auflösung. Der Rahmen enthält kein Script und erlaubt keine
externen Ressourcen. `CardPresentationSurface` zeigt ein fertiges Renderergebnis
im Sandbox-Iframe, erlaubt isolierte externe Popups und meldet Textauswahl an den
Host.

`ui/NoteCardContent.tsx` besitzt ausschließlich transienten Eingabe-, Auswahl-
und Darstellungszustand. Das Eingabefeld steht bis zum Aufdecken im Host; danach
rendert der Host die Antwortseite einmal mit der Eingabe neu. `compareTypedAnswer`
und `evaluateNoteChoice` bleiben reine Renderer-Helfer; `notePlainText` erhält Wörter und Satzzeichen über
Inline-HTML hinweg und trennt Blockinhalte. Vorlesen verwendet bereinigte, der aktuellen Kartenseite
entsprechende Texte und die System-Sprachausgabe im Host. AMBOSS öffnet die Suche
mit dem markierten Begriff. KaTeX wird nur bei erkannten Formeln (`\(…\)`,
`\[…\]`, `[$]`, `[$$]`, `[latex]`) importiert;
`noteMathAssets.ts` lädt lokale WOFF2-Assets einmal und bettet sie mit dem CSS
als Data-URLs in den Rahmen ein. Review, Vorschau, Kartenverwaltung, manuelle
Erstellung und Importvorschau verwenden denselben Host; Medien-URLs löst
`useNoteMediaUrls` über `note.media` auf.

## Persistenz, Sync und Medien

- IndexedDB `core.workspace.entities.v4.<userId>` trennt Deck-Hüllen, Summaries, Katalog, Inhalte, Kartenkörper, Varianten, Reviewereignisse, Anki-Vorlagen (`noteTypeSources`), rohe Anki-Felder (`noteSources`), Outbox und Konflikte. `accountStorage` hält nur `core.accountState.v2` und `core.syncDevice.v2`.
- Hydrierung lädt begrenzte Karten-/Lernfenster samt Inhalten (`hydrate_account_cards` nach Karten- oder Inhalts-IDs); ein Kartenkörper ist aktuell, wenn Körper-, Lernstands- und Abhängigkeitsrevision zum Katalog passen. Die Kartenverwaltung lädt einen Inhalt online immer mit allen Geschwistern; offline nur bei vollständigem Katalog. Offline-Downloads pinnen Karten, Inhalte, Varianten und hashgeprüfte Medien; Quota-Bereinigung entfernt ausschließlich ungepinnte bestätigte Körper/Medien.
- Lokale Mutationen und Outbox werden atomar persistiert (`saveNoteGraphs` schreibt Inhalt, Karten, Katalog, Summaries und Outbox in einer Transaktion). Revisiongeprüfte Cloudwrites und bestätigte lokale Applies besitzen getrennte Abschlussgrenzen; fehlgeschlagener Cloud-Sync setzt den lokalen Erfolg nicht zurück. Anki-Vorlagen und rohe Felder sind Upsert-Tabellen (letzter Write gewinnt).
- Die Outbox hält je Entität höchstens eine ausstehende Mutation. Ersetzt eine Änderung einen noch nicht bestätigten Insert, bleibt sie ein Insert ohne Basisrevision. Existiert die Zeile in der Cloud bereits und hat sie zuletzt dasselbe Gerät geschrieben, war nur die Antwort verloren; die Mutation wird dann als Update auf diese Revision angewandt. Fremde oder gelöschte Zeilen bleiben Konflikte. Löschungen laufen nach Inserts und Updates in umgekehrter Fremdschlüsselreihenfolge. Gleichzeitige Sync-Anforderungen teilen sich einen laufenden Durchlauf; wurde während eines Durchlaufs ein weiterer angefordert und enthält die Outbox danach noch Mutationen, folgt unmittelbar ein zweiter.
- Konfliktmetadaten bleiben lokal erhalten. Betroffene Karten – bei einem Inhaltskonflikt alle Geschwister – fehlen im Review-Scope und bleiben in der Verwaltung sichtbar. Auflösung betrifft ausschließlich geprüfte Konflikte und bewahrt konfliktfreie Inhalte, Reviews und Medien.
- `card_catalog` und `deck_study_summaries` sind die Cloudprojektionen mit Account-RLS und Keyset-/Deck-/Sortier-/Reviewindizes; nur Stapel, Katalog und Summaries tragen `sync_change_id`. Anweisungsbezogene Trigger mit Übergangstabellen pflegen sie mengenbasiert ohne fachliche Revisionsänderung; der Katalog übernimmt Vorschau, Sortiertext und Markierung aus dem Inhalt. Die Suche läuft per Trigramm-Index über `notes.search_text`. Fälligkeit wird für den Lerntag indexgestützt ermittelt.
- `get_account_bootstrap()` liefert Stapel, Summaries und Tagesübersicht, `get_account_due_forecast()` die Prognose nachgelagert, `list_account_card_catalog()` eine Keyset-Seite (Gesamtzahl nur auf Anfrage), `get_deck_offline_manifest()` Revisionen/Größen/Medienhashes, `get_account_statistics()` begrenzte Aggregate, `load_reimport_targets()` bestehende Inhalte je Anki-GUID und `list_retranslation_candidates()` unbearbeitete Importe älterer Übersetzerversionen.
- Medien liegen privat unter `<userId>/<sha1>` im Bucket `core-media`; `media_files` registriert jede Datei einmal je Account, `note_media` wird per Trigger aus `notes.media` gepflegt. Inhalte persistieren nur Namen und SHA-1, keine Bytes, Tokens oder Signed URLs. Die lokale Mediendatenbank `core-media-store.v3` hält Dateien und eine persistente SHA-1-Upload-Queue; Upload wartet auf bestätigte Cloud-Eltern. Nicht mehr referenzierte Dateien gibt `list_releasable_media()` nach einem Tag (gelöschte Inhalte nach sieben Tagen) frei.
- Start (ADR-038): `startAuthenticatedWorkspaceSessionLifecycle` liest online die gespeicherte Sitzung und ruft `onBoot` sofort auf; `getUser()` bestätigt parallel, eine Ablehnung ruft `onSessionRejected`, das den Lauf über `bootRunRef` verwirft und seine Bootstrap-Wiederholungen beendet. Der Build lädt den Supabase-Client-Chunk per `modulepreload` mit dem Einstieg (`vite.config.ts`), damit die Sitzungsprüfung nicht erst nach dem ersten Render nachlädt.
- Profilpatches enthalten das vollständige Profil. Nur erfolgreicher Cloud-Bootstrap darf unvollständige alte Profilpatches ersetzen und gültige UI-Präferenzen retten; vollständige Offlinepatches und andere Outbox-Mutationen bleiben erhalten.

Die Migrationsbaseline in `supabase/migrations/` und `supabase/verify_schema_v1.sql` sind die ausführbaren SQL-Quellen. `database.types.ts` wird ausschließlich aus der frisch aufgebauten lokalen Datenbank generiert. RLS schützt Nutzertabellen; Ownership stammt nicht aus veränderbaren User-Metadaten.

## API-Vertrag

`POST /api/ai/card-variant` ist der einzige CoRe-Serverendpunkt. Er verlangt Same Origin und Supabase-Bearer, akzeptiert `{ source: { front, back } }`, begrenzt den Body auf 8 KiB und jedes Feld auf 1.200 Zeichen und antwortet mit `Cache-Control: no-store`. OpenRouter-Zugang bleibt ausschließlich in `process.env`. Die Function wählt kostenlose text-/toolfähige Modelle, bevorzugt ZDR und erlaubt den dokumentierten kostenlosen Non-ZDR-Fallback; genau ein erzwungener Tool Call erzeugt eine Umformulierung. Vertragsdetails stehen bei `aiCardVariantContract.ts`, der operative Umgang in [Betrieb](operations.md). Andere Produktdatenzugriffe laufen über die gekapselten Supabase-Module. Secrets gehören weder in `VITE_*`, Browsercode, `localStorage`, Exporte noch Logs.

## Importregeln

Der Worker erhält die `File`, liest sie mit `readAnkiPackage`, übersetzt einmal mit `translateAnkiPackage` und hält den Importgraphen bis zum Commit oder Verwerfen. Die Vorschau enthält Bericht, bis zu fünf Beispielinhalte und deren Medien (höchstens 20 MiB). Beim Commit streamt der Worker begrenzte Chunks (Stapel, Anki-Vorlagen, je 250 Inhalte mit rohen Feldern und Karten, je 500 Reviewereignisse, dann jede Mediendatei einzeln mit SHA-1-Prüfung); der Main Thread schreibt sie nach IndexedDB, bevor er den nächsten Chunk anfordert. Persistierte IDs werden vor dem Schreiben zugeordnet (Reimport). Die flüchtige APKG-Sitzung überlebt interne Navigation; Reload-Wiederanlauf gehört nur Outbox und Medienqueue. Legacy-JSON und V18-Protobuf sind unterstützte externe Anki-Formate. Format-, Template-, Medien-, Identitäts- und Revlogdetails stehen in der [Anki-Referenz](anki-format-analysis.md); sichtbare Phasen, Dateigrenzen und Teilabschlüsse in [Specs](specs.md). Der ZIP-Leser liest Einträge einzeln aus dem `Blob`, statt das Archiv vollständig zu laden.

### Note-Übersetzung

`readAnkiPackage(file)` in `apkgImportInternal.ts` liest `.apkg` und `.colpkg`
bis 2 GiB (`ANKI_PACKAGE_MAX_BYTES`) zu Stapeln mit Filterkennung, Notizen,
Karten, Notiztypen, Revlog, Sammlungsdatum und einem Medienindex. Medien bleiben
im Archiv und werden erst über `readBytes()` gelesen; moderne Pakete liefern
SHA-1 und Größe aus `MediaEntries` (Eintrag *i* ist ZIP-Eintrag `i`), Legacy-Medien
werden einzeln gehasht.

`translateAnkiPackage(pkg)` in `apkgNoteTranslation.ts` liest vorab nur die
Masken-SVGs von Image Occlusion Enhanced (je höchstens 1 MiB) aus dem Paket,
übersetzt dann ohne weitere Ein- und Ausgabe und liefert asynchron `{ decks,
notes, cards, mediaFiles, reviewEvents, noteTypeSources, noteSources, report }`:

- **Stapel:** Karten liegen in `did`, in gefilterten Stapeln im Heimatstapel
  `odid`. Angelegt werden nur Stapel mit Karten und ihre Vorfahren; gefilterte
  Stapel nie.
- **Übersetzer-Registry** in Erkennungsreihenfolge: native Image Occlusion
  (`originalStockKind` 6), „Multiple Choice for Anki“ (Felder plus
  `qtable`/`Q_solutions`), Image Occlusion Enhanced (drei Maskenfelder; die
  Formen des Frage-SVG werden auf die SVG-Größe normiert zu CoRe-Masken, die
  Form oder Gruppe mit `class="qshape"` als Abfrage `io:1`, alle übrigen mit
  `ordinal` 0 dauerhaft verdeckt; nur SVGs mit Beschriftungen, Pfaden oder
  Transformationen bleiben eine `overlay`-Maske), AnKing-/Ankizin-Familie (Lückentyp mit `Text`, `Extra` und
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

`noteTypeSources` enthält die unsichtbare Anki-Vorlage je genutztem Notiztyp,
`noteSources` die rohen Anki-Feldwerte je Inhalt (Mediennamen bereits
kanonisch), auch die vom Übersetzer verbrauchten Felder. Beide zusammen sind die
Eingabe jeder Neuübersetzung.

### Neuübersetzung (K5.4)

`TRANSLATOR_VERSIONS` nennt die aktuelle Version je Übersetzer. Nach dem
Cloud-Sync prüft `runAccountRetranslation` einmal je Übersetzerstand und Gerät
die unbearbeiteten Importe älterer Versionen seitenweise. `planRetranslation`
übersetzt die rohen Felder mit `retranslateNoteContent` neu: Karten behalten
Identität und Lernstand (generische `anki-N`-Schlüssel erhalten den Schlüssel des
besseren Übersetzers), neue Abfragen werden neue Karten. Würde eine Karte mit
Lernstand entfallen oder ist der Inhalt nicht übersetzbar, bleibt er unverändert.
Image Occlusion Enhanced braucht dafür die Masken-SVGs des Pakets, die nach dem
Import nicht mehr vorliegen; solche Inhalte bleiben bei der Neuübersetzung
unverändert.
Nur geänderte Inhalte werden geschrieben, mit `importedContentRevision` =
`contentRevision`; Inhalte mit ausstehender lokaler Änderung werden
übersprungen. Die App meldet die Zahl aktualisierter Inhalte.

## Architekturänderungen

Änderungen erhalten diese Grenzen und Invarianten. Dauerhafte Trade-offs gehören in [Entscheidungen](decisions.md), offene Umbauten nur in [TODO](todo.md). Implementierungs- und Layoutdetails werden in ihren besitzenden Quellen gepflegt und hier nicht dupliziert.
