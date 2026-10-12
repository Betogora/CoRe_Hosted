# CoRe-Architektur und Invarianten

**Rolle:** aktuelle technische Grenzen und Invarianten. **Stand:** 2026-10-02.
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
| `reviewService.ts`, `fsrsScheduler.ts`, `easyDays.ts` | Queue, Bewertung, FSRS-6 und deterministische Intervallentlastung |
| `coreVariantService.ts` | Reife, Eligibility, Variantenwahl und Original-Fallback |
| `creationBatch.ts`, `creationWorkflow.ts` | manuelle Erstellung, Batchzustand und getrennte lokale Medienvorbereitung |
| `importUiState.ts`, `apkgImportSession.ts` | sichtbare Importphasen und flüchtige accountgebundene Sitzung |
| `apkgImport.ts` | öffentliche APKG-Normalisierungsgrenze; Worker, Protokoll, ZIP und SQLite bleiben privat |
| `ankiContentModel.ts`, `cardPresentation.ts` | private Formatübersetzung sowie sicherer gemeinsamer Template-Compiler/Renderer |
| `CardPresentationSurface`, `StudyCardContent`, `CardPreviewDialog` | React-Host, kontrollierte Kartenkomposition und transiente Entwurfsvorschau |
| `indexedDbCoreRepository.ts`, `workspaceHydrationService.ts` | accountgebundene Web-Replica, begrenzte Hydrierung, Offline-Download und Quota-Bereinigung |
| `cloudRepository.ts`, `cloudRepositoryValidation.ts` | accountgefilterte Cloudmutationen, Revisionen, Konflikte und Row-/JSONB-Validierung |
| `accountStorage.ts`, `profileIntegrity.ts` | kleine Accountnamespaces und vollständige Profilpatches |
| `mediaStore.ts`, `cloudMediaStore.ts` | öffentliche Cache-/Queue-/URL-Grenze; private Storage-, Signed-URL- und TUS-Details |
| `aiCardVariantContract.ts`, `aiCardVariant.ts`, `api/ai/card-variant.ts` | validierter Variantenvertrag und Browser-/Serveraufruf |
| `learningSummarySettings.ts`, `learningSummaries.ts`, `aiLearningSummary.ts`, `aiLearningSummaryContract.ts`, `api/ai/summary.ts` | Auswahl, lokale Fassungen, Materialaufbereitung und validierte KI-Zusammenfassungen |
| `server/aiTextTool.ts` | gemeinsame serverseitige Auth-, Requestgrößen-, Free-only- und Datenschutzprüfung |
| `learningMindMaps.ts`, `screens/DeckMindMapsPanel.tsx` | validierter lokaler Graph, Zusammenfassungsumwandlung und unendlicher Flächeneditor |
| `pomodoroTimer.ts` | einziger accountgebundener Timer, Validierung und Endzeitprojektion |

Die Pfade in der Tabelle liegen unter `src/`, soweit kein anderer Pfad angegeben ist. Fremdpayloads bleiben `unknown`, bis das besitzende Modul sie validiert. Es gibt keine zentrale Sammelvalidierung oder allgemeine Anbieter-Adapterebene.

### Theme- und UI-Vertrag

`styles.css` besitzt Palette, semantische Rollen, Typografie und gemeinsame Control-Styles. `coreTheme.ts` besitzt Browserpräferenz und Dokumentattribut. `CoreSegmentedControl` und die untere `AppNavigation` teilen `useSlidingSelection`; die fachliche Auswahl bleibt beim Aufrufer. UI-Details stehen ausschließlich im [UI-Modulindex](../src/ui/README.md); [UI-Elements](ui-elements.html) ist die erzeugte Referenz nach Elementfamilien. Gemeinsame Änderungen werden dort synchronisiert und visuell geprüft.

`LearnScreen` besitzt die browserlokale Auswahl `Liste / Ordner` über einen einzelnen Wechselbutton (`core.learn.deckView.v1`). Beide Projektionen verwenden `DeckTree` mit unveränderten Domänenaktionen; die Liste fasst die sichtbare flache Baumprojektion linear in Hauptstapelgruppen zusammen, ohne Reihenfolge, Aufklappzustand oder Domänendaten zu ändern; die Ordnernavigation samt vollständigem Vorfahrenpfad bleibt transient im Baumrenderer. Die Wurzelprojektion bleibt bei geöffnetem Zweig erhalten; das Panel wird anhand der gemessenen Rasterspalten unter der Reihe des aktiven Wurzelstapels eingeordnet. `DeckSubstacksPanel` besitzt unabhängig davon die browserlokale Inhaltsansicht `core.content.substackView.v1`; Ebenen und Tabs bleiben im bestehenden Routenkontext. `DeckSummaryRow` rendert alle Stapelprojektionen aus demselben optionalen Lernstatusblock mit Tageskennzahlen ohne Donut; große Ordner und kompakte Unterstapel verwenden eine gemeinsame untere Aktionsleiste. `setDeckExpanded` nimmt eine einzelne ID oder mehrere IDs entgegen, damit gemeinsames Auf-/Zuklappen genau einen Profilpatch erzeugt.

### Navigation und URL-Kontext

Der AppRoute enthält View sowie zulässigen Deck-, Karten-, Erstellungs- und Reviewkontext. Parse/Serialize validiert die Kombinationen; `useAppNavigation` ist die einzige History-Anbindung. `deckContent` und `returnContent=1` erhalten die Inhaltsansicht bei der Review-Rückkehr. Die allowlist-validierte Auswahl `deckContentTab` wird als `tab` beziehungsweise `returnTab` serialisiert; ohne Auswahl öffnet die Inhaltsansicht Unterstapel, direkte Kartenlinks projizieren Karten. `DecksScreen` verwendet ausschließlich den gerouteten Deck-/Tabkontext. Das lokale `DeckSubstacksPanel` projiziert direkte Kinder aus `createDeckLibraryModel` mit den vorhandenen Bestandszusammenfassungen und UI-Renderern; Kartenseiten werden erst im Karten-Tab angefordert. Browser-Zurück/-Vorwärts darf keine History-Schleifen erzeugen. Entwürfe und Fokus bleiben transient; offene Einstellungsentwürfe blockieren Navigation ohne Zielpuffer. Unbekannte Routen fallen auf die Übersicht zurück.

## Domäneninvarianten

- Ein Deck enthält Learning Items. Jedes Item besitzt einen eigenen Review State und `dueAt`; Reverse-Richtungen, Cloze-Gruppen und reale Anki-Cards sind eigenständige Items.
- Der ursprüngliche Inhalt bleibt am Learning Item. KI-Varianten in `variants[]` bleiben daran verankert, haben keinen eigenen Review State oder Termin und zählen nicht zusätzlich für Queue oder Bestand.
- `LearningItemDocumentV1` und `NoteTypeDefinitionV1` sind Inhalts- und Darstellungswahrheit. Choice-Interaktionen speichern Optionen, richtige Antworten, Erklärung und den optionalen Auswahlmodus `single` oder `multiple`; Compatibility-Felder und Editorwerte werden atomar daraus projiziert. Feldnamen/-positionen sind keine semantischen Schlüssel.
- `CardContentPayload` enthält validierte Editorwerte und stabile Medienreferenzen, keine Entitäts-/Reviewidentitäten, Bytes oder Signed URLs. Kopien erhalten frische Karten-, Review- und Scheduleridentitäten.
- Importierte Feldwerte sind editierbar; Anki-Feldschema, Templates und CSS bleiben strukturell schreibgeschützt. Entwurfsvorschau persistiert oder revidiert nichts.
- Templateauswertung, Sanitization und URL-Auflösung bleiben getrennt. Scripts und externe Ressourcen werden nicht ausgeführt; lokale Darstellung verwendet nur `blob:`/`data:`, Sandbox-CSP und eingebettete Basisschriften. Der Renderer besitzt die Anki-`FrontSide`-Komposition. Getrennt angehängte Review-Antworten entfernen bereits sichtbare Vorderseitenanteile; Cloze-Antworten ersetzen dagegen die Vorderseitenfläche als vollständig gelöste Projektion.
- Manuelle Speicherung ist Single Flight mit unveränderlichem Snapshot. Reihenfolge: lokale Medienvorbereitung, Mediencache, lokale Karte, Upload und Referenzpersistenz. Cloudfehler nach lokalem Erfolg sind Teilabschlüsse. APKG-Medien werden nicht verkleinert.
- Reimport identifiziert Karten über `sourceCardId`, bewahrt lokale Inhaltsänderungen, Review State, Markierung, Aussetzung und lokale Stapelordnung. Medienreferenzen werden vor ihrer Stilllegung ergänzt.
- Review Events sind append-only und accountgebunden. `revlog` wird deterministisch dedupliziert. Initialer Schedulerstate folgt FSRS-Memory-State, Revlog-Replay, klassischem Kartenstatus, neuer Karte; ab dem ersten CoRe-Review besitzt FSRS-6 den State.
- KI-Varianten akzeptieren nur validierte Basic-Plaintexts. Toolname, Anzahl, Schema, Änderung, Duplikate und Größenlimits werden vor der bestehenden Variantenmutation geprüft. Eine inzwischen geänderte Karte verhindert die Mutation.
- React kennt keine Parser-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails. Ein aktiver Workerfehler bleibt sichtbar; es gibt keinen stillen Direktparser-Retry.

## Prüfungsplanung

`ExamPlanningPanel.tsx` besitzt das lokale Wochenatelier mit vier Planbereichen, Wochen-/Tagesauswahl und einem 352 px breiten Desktop-Editor. Die private Wochenprojektion zeigt Kapazität und prognostizierte Blöcke; Kapazitätswerte stammen aus `getExamDayCapacity`. Tagesbearbeitung ergänzt oder entfernt ausschließlich `StudyTimeCapacity.dateOverrides` im Entwurf. Das bestehende Forecast-Modul berechnet die gemeinsame Prognose in allen gültigen Planbereichen; erst die ausdrückliche Aktivierung ruft den vorhandenen Profil-Speicherpfad auf. `ActionDialog` bleibt unverändert, seine erweiterte Breite ist ausschließlich auf den Erstelldialog begrenzt.

`examPlanSettings.ts` besitzt die strenge unbekannt→validiert-Grenze und Profilmutationen. `schedulerPreferences.examPlanning` enthält Version 2, mehrere accountgebundene `ExamLearningPlan`, eine gemeinsame `StudyTimeCapacity` und deren nullable Vorbereitungsabweichung. Der initiale Einzelplan wird beim Lesen migriert; alle Writes verwenden die Sammlung. Änderungen globaler Lernwerte erhalten diese Angaben. Bestehender Profil-/Outbox-/Cloudpfad, keine neue Tabelle oder Schemaänderung. Echte Ereignisse bleiben ausschließlich in `ReviewEvent`; Plan-/Blockkontext sind ergänzende Eventflags.

`examPlanning.ts` besitzt Auswahl, Überschneidungsdeduplizierung, robuste Methodenzeitdaten, Bewertungsszenarien, gemeinsame Kapazität, Reserve, deterministische Prioritäten, adaptive Phasen und reine FSRS-Prognosen. `EXAM_MODEL` versioniert explizite Parameter; `SCHEDULER_VERSION` kennzeichnet den wiederverwendeten Scheduler. `ExamPortfolioForecast` trennt Aufwand/Kapazität, aktuelle/prognostizierte Bereitschaft und Unsicherheit. `StudyPlanBlock` besitzt Methode, sämtliche Prüfungskontexte, originale Deck-/Item-IDs, Dauer, Priorität und abgeleiteten Status; abgeschlossene Dauern stammen aus der Reviewhistorie. Prognostizierte States/Events werden nie persistiert. `ExamQuizCapability` / `ExamQuizObservation` bereiten tatsächliche künftige Integrationen vor; heutige Capabilities bleiben unverfügbar.

`createExamPortfolioForecast` betrachtet alle aktiven zukünftigen Prüfungen gemeinsam, teilt Item-State, gibt zwischen Tagen und Batches die Ausführung frei und unterstützt Abbruch. Reviewdringlichkeit ist lexikografisch, in Specs dokumentiert; geteilte Arbeit wird anteilig ohne doppelte Kapazität zugerechnet. Unbegrenztes Aufwandsszenario und begrenztes Tagesszenario rufen denselben vorhandenen Scheduler. `createExamStudyDecks` erstellt ausschließlich eine temporäre gemeinsame Sitzungswurzel mit echten Deck-IDs; die Repository-Bewertung erhält originale Deckmetadaten. `resolveExamSessionPlan` wählt nach gelöschtem Anker einen überlebenden ausgewählten Stapel, ohne die gespeicherte Auswahl umzuschreiben. `getExamBlockQueue` fragt den echten ReviewService nach aktueller Startbarkeit, statt prognostizierte Termine als tatsächliche Queue zu behandeln.

`workspaceHydrationService.prepareExamPlanningDecks` lädt die Vereinigung explizit ausgewählter Kapitel aktiver Prüfungen vollständig, verwendet aktuelle vollständige lokale Körper und weist fehlende Offlinekörper sichtbar ab. `IndexedDbCoreRepository.loadExamPlanningDecks` liest echte Items, Varianten, Events und Konfliktsperren. `loadExamPlanningDayEvents` nutzt den vorhandenen answeredAt-Index für heutige Accountreviews; auch reguläre Reviews beanspruchen so heutige Kapazität, ohne deren Kartenkörper zu laden. Die lazy Dashboardfunktion initiiert aktive Planhydrierung; ohne Prüfungen werden keine Körper geladen. Inaktive Kartenlernstände werden erst beim Öffnen der Verwaltung beziehungsweise Details geladen; `getExamCurrentProgress` verwendet dieselbe Bereitschaftsregel.

`screens/ExamPlanningPanel.tsx` besitzt die vier Planbereiche des Wochenateliers und die entprellte Prognose; `ExamPlanningOverview.tsx` besitzt Verwaltung, Heute, Woche, Bereitschaft, Details und optionalen Kalender. Account-, Deck-, Review- und Profiländerungen invalidieren Prognosen; gestartete StudyMode-Queues bleiben stabil. `App.tsx` orchestriert vollständige Profilwrites und frische eingeschränkte Queues. `StudyRoute.examPlanId` und `examBlockId` (URL `examPlan` / `examBlock`) sind aktuelle Accountreferenzen, erhalten über URL/Reload/Editor/Einstellungen. Nicht belegte, pausierte oder abgelaufene Blockreferenzen scheitern sichtbar, ohne reguläre Ersatzsitzung. Bereits bewertete Blockitems werden über die heutigen echten Reviewflags für Reload und Editor-Rückkehr erhalten, auch wenn die ursprüngliche New-Quote erledigt ist. Plansettings sind transient; Originalmetadaten, Reviewhistorie und Persistenzinvarianten bleiben bei ihren bestehenden Besitzern.

## Heutiges Compatibility-Modell

`deck.cards[]`, einzelne `CoreCard`-Typgrenzen und die Cloudtabelle `cards` bezeichnen Learning Items. `cards.content_document` und `deck_note_type_definitions.definition` speichern normalisierte Dokumente/Definitionen; diese heutigen Namen werden nicht nebenbei migriert. Jeder zusätzliche Varianteninhalt bleibt einem vorhandenen Item untergeordnet. Geplante Umbauten stehen ausschließlich in [TODO](todo.md).

## Persistenz, Sync und Medien

- `learningSummarySettings.ts` besitzt Auswahlvertrag und Standardwerte; `learningSummaries.ts` besitzt unbekannt→validiert-Grenze, Sanitizing, Lesezeit und den heutigen lokalen Zusammenfassungsinhalt. Die separate IndexedDB `core.learningSummaries.v1.<encodedUserId>` speichert Original-Editorwerte und Schriftangaben im Store `summaries`, mit Stapelindex; erfolgreiche Transaktionen werden erst nach Commit bestätigt. Sie verändert weder Workspace-Cache noch Outbox oder Cloudschema. `DeckSummariesPanel.tsx` orchestriert Liste, direktes Formular und Editor; `DecksScreen` und `App` teilen den bestehenden Entwurfsschutz. Die Daten sind lokal je Account und Stapel, nicht synchronisiert. `aiLearningSummary.ts` besitzt vollständige Materialaufbereitung, Textdeduplizierung, Auswahlantworten, Quellenstellen, Browserrequest und sichere Ausgabe. `prepareContentDecks` in `workspaceHydrationService` lädt die benötigten Karten vollständig für Prüfungsplanung und Zusammenfassungen. Quelldokumente bleiben transient; Dateiparserdetails verbleiben in `documentModel.ts`. Generierungsmetadaten sind optional am lokalen Zusammenfassungsinhalt gespeichert; sie erhalten die ursprüngliche Abschnitts-/Materialzuordnung auch bei ausgeblendeten Belegen.

- IndexedDB `core.workspace.entities.v3.<userId>` (Schema 1) trennt Deck-Hüllen, Summaries, Katalog, Kartenkörper, Varianten, Reviewereignisse, Notiztypen, Outbox und Konflikte. `accountStorage` hält nur `core.accountState.v2` und `core.syncDevice.v2`.
- Hydrierung lädt begrenzte Karten-/Lernfenster. Offline-Downloads pinnen Karten, Varianten, Definitionen und hashgeprüfte Medien; Quota-Bereinigung entfernt ausschließlich ungepinnte bestätigte Körper/Medien.
- Lokale Mutationen und Outbox werden atomar persistiert. Revisiongeprüfte Cloudwrites und bestätigte lokale Applies besitzen getrennte Abschlussgrenzen; fehlgeschlagener Cloud-Sync setzt den lokalen Erfolg nicht zurück.
- Konfliktmetadaten bleiben lokal erhalten. Betroffene Karten fehlen im Review-Scope und bleiben in der Verwaltung sichtbar. Auflösung betrifft ausschließlich geprüfte Konflikte und bewahrt konfliktfreie Inhalte, Reviews und Medien.
- `card_catalog` und `deck_study_summaries` sind die Cloudprojektionen mit Account-RLS und Keyset-/Deck-/Sortier-/Reviewindizes. Trigger pflegen sie transaktional ohne fachliche Revisionsänderung. Fälligkeit wird für den Lerntag indexgestützt ermittelt.
- `list_account_card_catalog()` liefert eine Keyset-Seite, `get_deck_offline_manifest()` Revisionen/Größen/Medienhashes und `get_account_statistics()` begrenzte Aggregate.
- Medien liegen privat unter accountgebundenen SHA-1-Pfaden. Deckmodelle persistieren Referenzen, keine Bytes, Tokens oder Signed URLs. Die persistierte Queue besitzt Objekt-/Referenzentscheidung und monotone Bytezähler; Upload wartet auf bestätigte Cloud-Eltern.
- Profilpatches enthalten das vollständige Profil. Nur erfolgreicher Cloud-Bootstrap darf unvollständige alte Profilpatches ersetzen und gültige UI-Präferenzen retten; vollständige Offlinepatches und andere Outbox-Mutationen bleiben erhalten.

Die Migrationsbaseline in `supabase/migrations/` und `supabase/verify_schema_v1.sql` sind die ausführbaren SQL-Quellen. `database.types.ts` wird ausschließlich aus der frisch aufgebauten lokalen Datenbank generiert. RLS schützt Nutzertabellen; Ownership stammt nicht aus veränderbaren User-Metadaten.

## API-Vertrag

`POST /api/ai/card-variant` ist die Route für Kartenumformulierungen. Er verlangt Same Origin und Supabase-Bearer, akzeptiert `{ source: { front, back } }`, begrenzt den Body auf 8 KiB und jedes Feld auf 1.200 Zeichen und antwortet mit `Cache-Control: no-store`. OpenRouter-Zugang bleibt ausschließlich in `process.env`. Die Function wählt kostenlose text-/toolfähige Modelle, bevorzugt ZDR und erlaubt den dokumentierten kostenlosen Non-ZDR-Fallback; genau ein erzwungener Tool Call erzeugt eine Umformulierung. Vertragsdetails stehen bei `aiCardVariantContract.ts`, der operative Umgang in [Betrieb](operations.md). Andere Produktdatenzugriffe laufen über die gekapselten Supabase-Module. Secrets gehören weder in `VITE_*`, Browsercode, `localStorage`, Exporte noch Logs.

`POST /api/ai/summary` verlangt dieselbe Origin- und Bearerprüfung. Der Vertrag in `aiLearningSummaryContract.ts` akzeptiert Titel, validierte Einstellungen und Klartextmaterial mit anonymen Kennungen (`m1` …), maximal 500 Einheiten, 60.000 Materialzeichen und 256 KiB Requestbody. IDs, Lernstand, Tags und Mediendateien werden nicht an den Anbieter übertragen. Die ausgewählten Karten werden vor der Aufbereitung vollständig geladen; Quellentext stammt ausschließlich aus einem bewusst angefügten lesbaren Dokument. Der Server baut den versionierten deutschen Prompt aus der Auswahl und erzwingt genau einen `create_learning_summary`-Aufruf. Ausgabe, Felder und vorhandene Referenzkennungen werden vor der Rückgabe validiert; die App erzeugt HTML und interne Kartenlinks aus ihren eigenen Referenzen. Ein Kontextfilter, 60 Sekunden je Completion und höchstens ein Verfügbarkeitsfallback begrenzen die Anfrage. Formatfehler werden nicht durch einen stillen Providerwechsel versteckt. Beide KI-Routen nutzen die serverseitigen Auth-, Größen- und Free-only-/Privacy-Helfer in `server/aiTextTool.ts`. `npm run dev` stellt beide Routen über eine ausschließlich serverseitige Vite-Middleware bereit; die Produktion nutzt Vercel Functions.

## Importregeln

Der Worker normalisiert einmal; der Main Thread streamt den Commitgraphen in begrenzten Chunks nach IndexedDB. Persistierte IDs werden vor dem Schreiben zugeordnet. Die flüchtige APKG-Sitzung überlebt interne Navigation; Reload-Wiederanlauf gehört nur Outbox und Medienqueue. Legacy-JSON und V18-Protobuf sind unterstützte externe Anki-Formate, keine obsolete Appkompatibilität. Unbekannte Quellfelder bleiben im unveränderlichen Snapshot. Format-, Template-, Medien-, Identitäts- und Revlogdetails stehen in der [Anki-Referenz](anki-format-analysis.md); sichtbare Phasen, Dateigrenzen und Teilabschlüsse in [Specs](specs.md).

## Architekturänderungen

Änderungen erhalten diese Grenzen und Invarianten. Dauerhafte Trade-offs gehören in [Entscheidungen](decisions.md), offene Umbauten nur in [TODO](todo.md). Implementierungs- und Layoutdetails werden in ihren besitzenden Quellen gepflegt und hier nicht dupliziert.
