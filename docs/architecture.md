# CoRe-Architektur

**Rolle:** Aufbau der Codebase, Eigentümer, Invarianten und öffentliche Schnittstellen. **Stand:** 2026-11-14.
Produktverhalten: [Specs](specs.md). Ist-Stand: [Status](status.md). Betrieb: [Operations](operations.md). Abwägungen: [Entscheidungen](decisions.md). Offene Umbauten: [TODO](todo.md). Anki-Format: [Anki-Referenz](anki-format-analysis.md).

## Pflege dieser Datei

Hinein gehört:

- **Eigentümer:** welches Modul welchen Zustand, welche Regel oder welche Grenze besitzt.
- **Invarianten,** die über Modulgrenzen hinweg gelten.
- **Öffentliche Schnittstellen:** Routen, RPCs, Tabellen, Buckets, Speicher- und Datenbanknamen, Outbox-Arten und persistierte Schlüssel.
- **Gründe,** die der Code nicht zeigt; Abwägungen zwischen Alternativen gehören in ein ADR.

Nicht hinein gehört:

- Funktions- und Exportlisten, Algorithmen Schritt für Schritt, Aufzählungen von URL-Parametern, Einstellungsbereichen oder Zuständen.
- Maße, Breakpoints, Tastenkürzel, Messwerte und Etappenkürzel aus der Planung.
- Was die [Specs](specs.md) fachlich regeln, offene Umbauten ([TODO](todo.md)) und Betriebsabläufe ([Operations](operations.md)).

Probe: Ein Satz gehört nicht hinein, wenn er falsch wird, sobald man eine Funktion umbenennt oder umbaut, ohne dass sich ein Vertrag ändert. Umsetzungsdetails stehen in Code, Kommentaren und Tests.

Form: Stichpunkte oder Tabellenzeilen, ein Gedanke je Punkt. Eine geänderte Regel ersetzt die alte, statt sie zu ergänzen. Angepasst wird sie nur, wenn sich Eigentümer, Invariante oder öffentliche Schnittstelle ändern. `npm run check:docs` begrenzt ihre Größe (`DOC_LIMITS` in `scripts/generateDocs.ts`).

## Systembild

CoRe ist eine Vite-/React-SPA in TypeScript. Jede Änderung wird zuerst in einer accountgebundenen IndexedDB-Replica gespeichert und danach mit Supabase (Auth, Postgres mit RLS, privater Storage) synchronisiert. Vercel liefert die SPA und drei authentifizierte KI-Routen.

```schaubild
Titel: Schichten; Abhängigkeiten zeigen nur nach unten
Gruppe: Screens und Verdrahtung
App-Shell | App.tsx: Anmeldung, Navigation, aktiver Bildschirm
Screens | screens/: Produkt-UI, je Bildschirm eine Verdrahtung
UI-Bausteine | ui/: gemeinsame Komponenten und Tokens
Pfeil: über useAppServices
Gruppe: Dienste und Hooks
Arbeitsbereich | Anmeldung, Store, Sync-Status
Navigation | AppRoute, Entwurfsschutz, Einstellungsdialoge
Lernsitzung | Vorbereitung, Start, laufende Sitzung
Pfeil: schreiben über
Gruppe: Befehle
cardCommands | Inhalte, Karten, Massenaktionen
deckCommands | Stapel, Einstellungen, Profil
importCommands | Importgraph, Bestätigung, Neuübersetzung
Pfeil: planen mit
Gruppe: Domäne
[primär] coreModel | Inhalte und Karten
Lernen | Queue, FSRS-7, Prüfungsplanung
Darstellung | Renderer, Sanitizer, Rahmen
Import | APKG lesen und übersetzen
Pfeil: speichern in
Gruppe: Lokales Repository und Sync
[erfolg] Web-Replica | IndexedDB mit Outbox
Hydrierung | Kartenseiten, Suche, Offline
Sync | Outbox senden, Deltas holen
Medien | Cache und Upload-Queue
Pfeil: gegen
Gruppe: Cloud und KI-Routen
Supabase | Postgres mit RLS und RPCs, Storage
[info] /api/ai/* | card-variant, card-help, summary, source-cards über OpenRouter
```

## Modulkarte

Pfade liegen unter `src/`, soweit kein anderer angegeben ist. Private Teilmodule stehen nur, wo sie eine Importgrenze bilden.

### Screens und Verdrahtung

| Eigentümer | Verantwortung |
| --- | --- |
| `App.tsx` | App-Shell: Anmelde- und Ladezustand, Navigation, aktiver Bildschirm, globale Dialoge; erzeugt die Befehle je Arbeitsbereich |
| `screens/`, `screens/*Wiring.tsx` | Produkt-UI; je Bildschirm stellt eine Verdrahtung die Props aus Store und Diensten zusammen ([Screen-Landkarte](../src/screens/README.md)) |
| `ui/`, `styles.css`, `coreTheme.ts` | gemeinsame UI, semantische Tokens und Theme-Präferenz ([UI-Module](../src/ui/README.md), [UI-Elements](ui-elements.html)) |
| `appFeatureLoading.tsx`, `appFeaturePreload.ts` | gestuftes Vorladen der Bildschirm-Chunks nach Verbindung und Absicht |
| `pwa.ts`, `public/sw.js` | Service Worker und Modulladefehler als deutscher Neuladehinweis |

### Dienste und Hooks

| Eigentümer | Verantwortung |
| --- | --- |
| `useAppServices.ts` | einziger Zugang der Verdrahtungen zu den Diensten des geöffneten Arbeitsbereichs; ohne Repository und Cloud |
| `useAccountWorkspace.ts`, `authenticatedWorkspaceBoot.ts`, `cloudAuth.ts` | Anmeldung, Sitzungsprüfung und accountgebundener Start (ADR-038) |
| `useWorkspaceSync.ts`, `appSyncLifecycle.ts` | Sync-Lebenszyklus, Status und Konflikte |
| `workspaceStore.ts`, `useWorkspaceStore.ts` | Store des geöffneten Kontos ohne React; Bildschirme abonnieren nur ihren Teil |
| `appNavigation.ts`, `useAppNavigation.ts` | typisierter AppRoute und einzige Browser-History-Anbindung |
| `useNavigationGuard.ts`, `useSettingsOverlay.ts` | Entwurfsschutz vor jeder Navigation; Einstellungsdialoge mit Entwurf |
| `studyPreparation.ts`, `useStudyStart.ts`, `useStudySession.ts` | Lernsitzung vorbereiten (ohne React), starten und führen |
| `useLearningClock.ts`, `learningDay.ts`, `simulationClock.ts` | Lernzeit mit Simulationsversatz, Tagesbeginn, Zeitzone und Lerntagwechsel |
| `usePomodoroTimer.ts`, `pomodoroTimer.ts` | einziger accountgebundener Fokustimer über Tabs |
| `useImportSession.ts`, `apkgImportSession.ts` | flüchtige APKG-Importsitzung bis zum Kontowechsel, Warnung beim Schließen und Hinweis auf eine unterbrochene Übernahme |
| `useCardVariantBatch.ts` | der eine app-weite Variantenlauf und seine Rückmeldung |

### Befehle

Befehlsmodule laufen ohne React, je Arbeitsbereich aus Store, Repository und Sync. Jede Schreibung übernimmt den Repository-Stand in den Store und fordert einen Sync an.

| Eigentümer | Verantwortung |
| --- | --- |
| `cardCommands.ts` | Kartenseiten, Inhalte speichern und duplizieren; Lernstand, Varianten, Medien, Erstellung, Textimport, KI-Hilfen |
| `deckCommands.ts` | Stapel, Stapel- und globale Einstellungen, Lernprofile, Prüfungsaufgaben, gespeicherte Suchen, Offline-Download |
| `importCommands.ts` | Importgraph übernehmen, Cloud-Bestätigung je Import, einmalige Neuübersetzung, Quellkarten |
| `cardBatchActions.ts` | Aktionen an Karten als ein Schreibvorgang; Rückgängig überspringt seither geänderte Karten |
| `cardVariantBatch.ts` | Stapelgenerierung von Varianten mit Abbruch |

### Domäne

| Eigentümer | Verantwortung |
| --- | --- |
| `coreTypes.ts`, `coreModel.ts` | kanonische Typen; einzige Grenze zum Anlegen, Ändern, Löschen und Wiederherstellen von Inhalten und Karten |
| `coreWorkspace.ts`, `coreRepository.ts` | Arbeitsbereich, Stapelbaum, Platzierungs- und Zyklusprüfung |
| `deckSettings.ts`, `learningProfiles.ts`, `settingsDraft.ts` | normalisierte Lernwerte, Lernprofile (ADR-018), Entwurfsvergleich |
| `reviewService.ts`, `siblingBurying.ts`, `reviewEventKinds.ts` | Tagesqueue, Begrabregel, Bewertungsarten und ihr Tagesverbrauch |
| `scheduler.ts`, `easyDays.ts` | FSRS-7 über `ts-fsrs`, Haltbarkeit, Reifeband, Easy-Days-Entlastung (ADR-044, ADR-019) |
| `coreVariantService.ts` | Eignung, Bereitschaft und Wahl von Varianten im Review |
| `cardSearchQuery.ts`, `tagDirectory.ts` | Anki-Suchsprache: Parser, lokale Auswertung, Filterbearbeitung, Widersprüche; Tag-Verzeichnis (ADR-045) |
| `catalogSearchIndex.ts`, `duplicateContents.ts` | In-Memory-Suche über den vollständigen Katalog (ADR-048); Duplikate (`is:duplicate`) |
| `hitStudySession.ts` | `Treffer lernen` und Üben ohne Schreibpfad |
| `examPlanning.ts`, `examPlanSettings.ts`, `examDailyTasks.ts`, `examCalendarModel.ts` | Prüfungsplanung, Planablage im Profil, Tagesaufgaben, Kalenderprojektion (ADR-042) |
| `statisticsModel.ts`, `studyHeatmapModel.ts` | Statistikreihen, Tageszähler, Streak, Kalender |
| `creationWorkflow.ts`, `creationBatch.ts`, `manualCreationDraft.ts` | manuelle Erstellung mit Bildverdeckung, Medienvorbereitung und Entwurf im Tab |
| `notePresentation.ts`, `presentationFrame.ts`, `originalLayout.ts`, `htmlSafety.ts` | Kartenrenderer, CSP-Rahmen, Regel des Originallayouts, Sanitizer |
| `apkgImport.ts`, `apkgNoteTranslation.ts`, `importRetranslation.ts` | APKG-Vorschau und gestreamter Importgraph, Übersetzung, Neuübersetzung |
| `textImport.ts` | Text- und CSV-Import |
| `learningSummaries.ts`, `learningMindMaps.ts` | Zusammenfassungen und Mindmaps: Format, Operationen, lokale Ablage und Abgleich |
| `quiz.ts`, `learningQuizzes.ts` | Quiz: Format, Bewertung, Erstellung über `source-cards`, Abgleich |
| `aiSourceCreation.ts`, `aiSourceCardsContract.ts`, `aiSourceCards.ts` | Karten aus einer Quelle: Auftrag und Prompt, Vertrag der Route, Auslesen, Abschnittslauf, Abruf und Vorschlagsinhalt |
| `dashboardWidgets.ts`, `dailyMotivation.ts`, `brainMascots.ts` | Dashboard-Layout und To-dos, Tagesimpuls, Maskottchen; nur lokal |
| `fieldTimings.ts` | Feldwerte nur auf dem Gerät (ADR-050) |
| `mainThreadBudget.ts` | teilt lange Hauptthread-Schleifen in begrenzte Scheiben |

### Lokales Repository und Sync

| Eigentümer | Verantwortung |
| --- | --- |
| `indexedDbCoreRepository.ts` | accountgebundene Web-Replica; einzige öffentliche Grenze vor den privaten `indexedDb*.ts` |
| `workspaceHydrationService.ts` | Hydrierung, Kartenseiten und Suche, Offline-Download, Quota-Bereinigung |
| `workspaceReplica.ts` | Datensatzformen der Replica (Katalogzeile, Kartenkörper, Status) |
| `syncEngine.ts`, `syncMutationPlanner.ts` | Sync-Zyklus und Outbox-Arten |
| `mediaStore.ts` | Mediencache, persistente Upload-Queue, URL-Auflösung |
| `accountStorage.ts`, `profileIntegrity.ts`, `uiPreferences.ts` | kleine Accountnamespaces, Profilpatches, UI-Präferenzen im Profil |

### Cloud und KI-Routen

| Eigentümer | Verantwortung |
| --- | --- |
| `cloudRepository.ts`, `cloudRepositoryValidation.ts` | einzige öffentliche Cloudgrenze: accountgefilterte Abfragen und Mutationen, Revisionen, Konflikte, Zeilenvalidierung |
| `cloudMediaStore.ts` | Supabase Storage, Signed URLs, TUS |
| `cloudLearningDocuments.ts` | revisionierte Tabellen der Zusammenfassungen und Mindmaps |
| `supabaseClient.ts`, `supabaseRealtimeStub.ts` | Supabase-Client; Realtime im Browserbuild ersetzt, weil CoRe keine Kanäle öffnet |
| `aiRouteRequest.ts`, `ai*Contract.ts`, `aiCardVariant.ts`, `aiCardHelp.ts`, `aiLearningSummary.ts` | Browseraufrufe und validierte Verträge der drei KI-Routen |
| `api/ai/*.ts`, `server/aiRoute.ts` | Vercel Functions; `createAiRoute` bildet die Hülle, jede Route liefert Parse, Payload und Extraktion |
| `supabase/migrations/`, `supabase/verify_schema_v1.sql` | ausführbare SQL-Quellen; `database.types.ts` wird nur daraus erzeugt |

### Außerhalb der App

| Eigentümer | Verantwortung |
| --- | --- |
| `library/`, `fixtures/worldCapitals.ts` | Grundbibliothek mit stabilen Inhalts-IDs; die Demo committet Welt-Hauptstädte als Importgraph |
| `schedulerExampleChains.ts` | Beispielketten, die Golden-Test und `docs:build` lesen; die App importiert sie nicht |
| `scripts/` | Doku-Bau, Gates und Messungen ([Testportfolio](test-portfolio.md)) |

## Importgrenzen

`scripts/verifyModuleBoundaries.ts` prüft sie in `npm run typecheck`; Ausnahmen und Obergrenzen, die nur sinken dürfen, stehen dort als `IMPORT_EXCEPTIONS` und `MODULE_LIMITS`.

- `screens/` und `ui/` laden Persistenz-, Sync- und Cloud-Module höchstens als Typ.
- APKG-Interna (Worker, Protokoll, ZIP, SQLite) nur über `apkgImport.ts`; `coreModel/` nur über `coreModel.ts`.
- `ui/` importiert nichts aus `screens/`.
- `.ts`-Module direkt unter `src/` außer `use*.ts` und `appScreenProps.ts` kennen weder React noch `screens/` oder `ui/`.

## Navigation und URL-Kontext

- `AppRoute` trägt View sowie zulässigen Stapel-, Karten-, Erstellungs-, Review- und Einstellungskontext; Parse und Serialize prüfen die Kombinationen, unbekannte Routen führen zur Übersicht.
- Einstellungsdialoge sind URL-Kontext jeder View, keine eigenen Routen. Öffnen legt einen History-Eintrag an, Bereichs- und Reiterwechsel ersetzen ihn, Schließen geht zurück.
- Die Sitzungsstapel `exam-session` und `hit-session` bestehen nur in der Sitzung; nach einem Neuladen wird die Prüfungseinheit neu vorbereitet.
- Entwürfe und Fokus bleiben transient. Offene Erstellungs-, Prüfungs-, Karten- und Einstellungsentwürfe halten App- und Browsernavigation an, bis gespeichert oder verworfen ist (`useNavigationGuard`).

## Domäneninvarianten

- Ein Inhalt (`Note`) speichert Felder mit Rollen, Interaktion, Tags, Medien (Name → SHA-1), Herkunft, Markierung und `importedTags` genau einmal. Jede Karte (`Card`) trägt Stapel, Abfrageschlüssel, Status, Flagge, eigenen Lernstand und Varianten.
- `Deck.cards` enthält nur geladene Karten, nie Inhaltskopien. Aufrufer von `coreModel.ts` übergeben die vollständige, nicht gelöschte Kartenmenge eines Inhalts; fremde oder doppelte Karten werden abgewiesen.
- Inhaltsänderungen planen nur über `coreModel.ts`; unveränderter bereinigter Inhalt schreibt nichts. Tags und Markierung erhöhen nur `revision`, nicht `contentRevision`. Löschen betrifft immer den Inhalt mit allen Geschwistern.
- Importierte Inhalte tragen beim Import `importedContentRevision` = `contentRevision`, manuelle `null`; lokal bearbeitet ist ein Inhalt mit `contentRevision` > `importedContentRevision`.
- Varianten in `card.variants[]` haben keinen eigenen Lernstand oder Termin und zählen nicht für Queue oder Bestand. Ihre Wahl folgt aus Stapeleinstellungen, Lernstand und Uhrzeit; die erreichte Kettenstufe (`study.extra.variantStage`) wird mit der Bewertung geschrieben.
- Der Lernstand hat mit `studyRevision` eine eigene Konfliktgrenze. Bewertungen und manuelle Lernstandsänderungen laufen als `ReviewEvent` über `record_review_atomic`, Inhalts- und Kartenänderungen über die Entitätsrevision; Review und Korrektur auf zwei Geräten kollidieren nicht.
- Review Events sind accountgebunden und unveränderlich; manuelle tragen `rating: "manual"` und ihre Art in `flags.kind`. Nur das Zurücknehmen einer Bewertung entfernt ein Ereignis (`undo_review_atomic`).
- Das Reifeband (`study.extra.maturityBand`) wird bei jeder Bewertung aus dem FSRS-7-Zustand abgeleitet und mitgeschrieben. Katalog, Stapelzahlen und Statistik lesen das Band, Prüfungsplanung und Variantenwahl rechnen mit derselben Funktion.
- Begraben und Zurückstellen sind nicht persistiert: `siblingBurying.ts` leitet sie aus den Ereignissen des Lerntags ab. `get_account_bootstrap` bildet die Regel in SQL nach; ein RLS-Test prüft beide gegen dieselben Fälle.
- Bewertungsarten bestimmen den Tagesverbrauch an einer Stelle (`reviewEventKinds.ts`); Lernplan, Replica und `get_account_bootstrap` zählen gleich, `hit_review` verbraucht keine Limits.
- `Deck.hierarchyPath` ist immer der Pfad des Oberstapels plus eigener Name und wird beim Verschieben und Umbenennen für den ganzen Teilbaum neu geschrieben.
- Fremdpayloads bleiben `unknown`, bis das besitzende Modul sie validiert. Es gibt keine zentrale Sammelvalidierung und keine Anbieter-Adapterebene (ADR-006).
- React kennt keine Parser-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails. Ein Fehler des APKG-Workers bleibt sichtbar; es gibt keinen stillen Direktparser-Retry.
- Gerendertes HTML wird nie persistiert. Kartenrahmen führen kein Script aus und laden nichts von außen.
- Ownership stammt aus Supabase Auth, nie aus veränderbaren User-Metadaten; RLS schützt jede Nutzertabelle.

## Inhalte und Karten

`coreTypes.ts` definiert `Note`, `Card` und `CardStudyState` nach ADR-032. Fachbegriffe und ihre Namen im Code:

| Fachbegriff | Code | Tabelle |
| --- | --- | --- |
| Stapel | `Deck` | `decks` |
| Inhalt | `Note` | `notes`, Rohfelder in `note_sources` |
| Karte | `Card` | `cards` |
| Variante | `CardVariant` | `card_variants` |
| Lernstand | `CardStudyState`, flach `ReviewState` | Spalten von `cards`, Zusatzwerte in `study_extra` |
| Bewertungsereignis | `ReviewEvent` | `review_events` |
| Lernbremse, Aussetzen, Zurückstellen | `leech`, `suspended`, `bury` | – |

- Scheduler und Queue arbeiten auf `ReviewState`; `reviewStateFromCardStudy` und `cardStudyFromReviewState` bilden beide Formen verlustfrei ab.
- Abfrageschlüssel sind persistiert: `forward`/`reverse`, `anki-<Ordinal>`, `cloze:N`, `io:N` und `choice`.
- `updatedByDeviceId` setzt der Cloud-Write, nicht die Planung.

## Kartendarstellung

- `notePresentation.ts` rendert validierte `Note`/`Card`-Paare asynchron. Das Ergebnis trägt `srcdoc`, zugänglichen Text, Medienverweise, Interaktionen, Diagnosen und das Layout `core` oder `original`.
- `presentationFrame.ts` besitzt das gemeinsame CSP-Gerüst und die Auflösung zu `blob:`/`data:`-URLs. `CardPresentationSurface` zeigt das Ergebnis im Sandbox-Iframe; Schriften und Formeln werden eingebettet, weil der Rahmen nichts nachlädt.
- `ui/NoteCardContent.tsx` ist der einzige Host für Review, Vorschau, Kartenverwaltung, Erstellung und Importvorschau und besitzt nur transienten Eingabe-, Auswahl- und Darstellungszustand. Medien löst er über `note.media` auf.
- Feld-HTML durchläuft `sanitizeNoteHtml`, Vorlagen-HTML `sanitizeLayoutHtml` (`htmlSafety.ts`). Eingabevergleich und Auswahlauswertung bleiben reine Helfer des Renderers.
- Originallayout (ADR-047): Die Regel steht einmal in `originalLayout.ts`, das auch der Importbericht nutzt. Der Host liest Vorlage und Stapelpfad über `NoteLayoutContext`, den die App an die replizierten `noteTypeSources` und die Importvorschau an ihre Vorlage bindet; bei leerer Vorderseite gilt das CoRe-Design mit Diagnose.
- Vorgerenderte Ergebnisse und aufgelöste Medien werden je Inhaltsobjekt beziehungsweise Medienmenge geteilt; Varianten sind eigene Objekte und teilen nichts mit ihrem Original.

## Persistenz, Sync und Medien

### Lokale Ablage

| Name | Ort | Inhalt |
| --- | --- | --- |
| `core.workspace.entities.v5.<userId>` | IndexedDB | Stapel, Summaries, Katalog, Volltexte (`noteSearch`), Inhalte, Kartenkörper, Varianten, Reviewereignisse, `noteTypeSources`, `noteSources`, Outbox, Konflikte |
| `core-media-store.v3` | IndexedDB | Mediendateien und persistente SHA-1-Upload-Queue |
| `core.learningSummaries.v2.<userId>`, `core.learningMindMaps.v2.<userId>` | IndexedDB | Zwischenspeicher und Warteschlange der Lerndokumente |
| `core.accountState.v2`, `core.syncDevice.v2` | `accountStorage` | Accountzustand und Gerät; darin `core.fieldTimings.v1` |
| `core.pomodoroTimer.v1`, `core.dashboard.*` | Accountnamespace | Fokustimer, Widgetlayout und eigene To-dos |
| `core.theme.v1` | Browser | Theme-Präferenz |
| `core.manualDraft.v1.<userId>` | `sessionStorage` | manueller Entwurf ohne Bilder |

### Sync

- Lokale Mutation und Outbox werden in einer Transaktion geschrieben. Payloads liest nur die Outbox. Cloudwrite und lokaler Abschluss haben getrennte Grenzen; ein gescheiterter Sync setzt den lokalen Erfolg nicht zurück.
- Ein Sync-Zyklus sendet die Outbox (`entity-mutation`, `deck-command`, `profile-patch`, `review-atomic`, `review-undo`), lädt Deltas seit den `sync_change_id`-Cursorn und ein neueres Profil, aktualisiert zuletzt Konflikte und Status. Gleichzeitige Anforderungen teilen einen Lauf.
- Die Outbox hält je Entität höchstens eine Mutation. Ein ersetzter unbestätigter Insert bleibt Insert; eine Zeile, die zuletzt dasselbe Gerät schrieb, gilt als verlorene Antwort und wird Update. Löschungen laufen zuletzt in umgekehrter Fremdschlüsselreihenfolge.
- `review-undo` folgt seiner `review-atomic`-Mutation und wird nicht gesendet, solange diese scheitert. Ausstehende Bewertungen und Rücknahmen schützen Karte und Ereignis vor dem Überschreiben durch Abrufe.
- Geräte-, Zeit-, Zähler-, Eigentümer- und Schedulerprojektionen erzeugen allein keinen Inhaltskonflikt. Kartenwrites erhalten den Cloud-Lernstand. Konfliktmetadaten bleiben lokal; betroffene Karten (bei Inhaltskonflikt alle Geschwister) fehlen im Review, nicht in der Verwaltung.
- Profilpatches tragen nur geänderte Schlüssel; wartende liegen über jedem Cloud-Profil.
- Start (ADR-038): Die gespeicherte Sitzung startet sofort, `getUser()` bestätigt parallel; eine Ablehnung verwirft den Lauf.

### Hydrierung und Offline

- Hydrierung lädt begrenzte Karten- und Lernfenster samt Inhalten (`hydrate_account_cards`). Ein Kartenkörper ist aktuell, wenn Körper-, Lernstands- und Abhängigkeitsrevision zum Katalog passen.
- Die Kartenverwaltung lädt einen Inhalt immer mit allen Geschwistern; offline geht das nur bei vollständigem Katalog.
- Offline-Downloads pinnen Karten, Inhalte, Varianten und hashgeprüfte Medien. Die Quota-Bereinigung entfernt ab 80 % bis 70 % nur ungepinnte, bestätigte Kartenkörper und Medien nach letzter Nutzung, nie Medien mit ausstehendem Upload, und läuft nie parallel.

### Cloud-Schnittstellen

- Tabellen mit Owner-RLS: `decks`, `notes`, `cards`, `card_variants`, `review_events`, `note_sources`, `note_type_sources`, `note_search`, `media_files`, `note_media`, `profiles`, `sync_devices`, `sync_conflicts`, `learning_summaries`, `learning_mind_maps`, `learning_quizzes`; Projektionen `card_catalog`, `deck_study_summaries`, `review_statistics_daily`.
- Projektionen pflegen anweisungsbezogene Trigger ohne fachliche Revisionsänderung. Nur Stapel, Katalog, Summaries, `note_type_sources` und `note_search` tragen `sync_change_id`.

| RPC | Liefert |
| --- | --- |
| `get_account_bootstrap` | Stapel, Summaries, Tagesübersicht |
| `get_account_due_forecast` | Fälligkeitsprognose |
| `pull_account_catalog_delta` | Katalog-Delta seit Cursor |
| `list_account_card_catalog`, `search_account_card_catalog` | Keyset-Seiten und erste Suchseite vieler Stapel |
| `hydrate_account_cards` | Kartenkörper und Inhalte |
| `list_account_card_study_states` | Lernstände ganzer Stapel ohne Körper, nicht in die Replica |
| `record_review_atomic`, `undo_review_atomic` | Bewertung schreiben und zurücknehmen |
| `delete_account_deck_tree` | Stapel samt Unterstapeln löschen |
| `get_deck_offline_manifest` | Revisionen, Größen, Medienhashes |
| `get_account_statistics` | begrenzte Aggregate |
| `load_reimport_targets`, `list_retranslation_candidates` | Reimportziele je Anki-GUID; unbearbeitete Importe älterer Übersetzer |
| `list_account_tags`, `list_similar_notes` | Tag-Verzeichnis; ähnliche Inhalte |
| `list_releasable_media` | nicht mehr referenzierte Medien |
| `patch_account_profile` | Profilpatch je Schlüssel |

### Medien

- Medien liegen privat unter `<userId>/<sha1>` im Bucket `core-media`; `media_files` registriert jede Datei einmal je Konto, `note_media` folgt per Trigger `notes.media`.
- Inhalte speichern nur Namen und SHA-1, keine Bytes, Tokens oder Signed URLs. Uploads warten auf bestätigte Cloud-Eltern.
- Vorlagenmedien mit `_`-Präfix stehen in `notes.media` jedes Inhalts ihres Notiztyps und überleben Bearbeiten und Bereinigen, damit das Originallayout offline und vor der Freigabe geschützt bleibt.

### Katalog und Suche

- Der Katalog führt je Karte alle Werte, nach denen gesucht und sortiert wird (Lernstand, Flagge, Lernbremse, `tag_keys`, Inhaltsform, Bewertungsverlauf); `private.refresh_card_catalog` leitet sie in der Cloud ab, lokal schreibt jede Katalogschreibung sie fort.
- `parseCardSearchQuery` liefert Klauseln, die alle zutreffen müssen. Relative Begriffe löst ein `CardSearchContext` vorher zu festen Grenzen und IDs auf. Dieselbe Liste wertet lokal `matchesCardSearch` und in der Cloud `p_terms` aus; ein fehlender Wert trifft nie, seine Verneinung immer.
- Ist der Katalog vollständig und hat Suchtexte (`ReplicaStatus.searchTextsReady`), beantwortet `catalogSearchIndex.ts` jede Seite lokal; sonst fragt die Cloud (ADR-048). Den Volltext liefert `note_search` als letzte Tabelle des Katalog-Deltas.
- Delta-Seiten werden je in einer Transaktion geschrieben, der Cursor rückt erst danach vor. Cloudseiten zeigen lokal ausstehende Karten mit ihrer lokalen Zeile; ein Inhalt mit ausstehender Änderung behält seinen eigenen Text.

### Kartenverwaltung

- Seitenabfragen der Kartenliste warten auf das Nachlesen geänderter Zeilen in den Suchindex, damit keine Seite einen veralteten Stand zeigt.
- Massenaktionen planen über `coreModel.ts` und schreiben mit einem Repository-Aufruf; Lernstandsänderungen laufen als manuelle Ereignisse. Rückgängig stellt nur Werte zurück, die noch dem Ergebnis entsprechen, Lernstände nur bei unveränderter `studyRevision`.
- Suchen und Ersetzen ändert nur Text zwischen HTML-Tags und plant jeden Inhalt über `coreModel.ts`; Inhalte, deren Kartenmenge sich ändern würde, bleiben unverändert.
- `is:duplicate` kennt nur der vollständige lokale Katalog, nicht die Cloud. Vor dem Laden des Cloud-Tag-Verzeichnisses wird die Outbox gesendet.

### App-Shell und Vorladen

- Vercel revalidiert HTML und Service Worker; Assets und API-Pfade sind vom SPA-Rewrite ausgenommen. `public/sw.js` cacht JavaScript nur mit JavaScript-MIME-Typ. Es gibt keinen automatischen Reload, damit offene Entwürfe erhalten bleiben.
- Automatisches Vorladen lädt Bildschirm-Chunks nur herunter; ausgeführt wird ein Bildschirm erst bei erkennbarer Absicht oder Aufruf.

## API-Vertrag

- `POST /api/ai/card-variant`, `POST /api/ai/card-help`, `POST /api/ai/summary` und `POST /api/ai/source-cards` sind die einzigen CoRe-Serverendpunkte. Sie teilen `server/aiRoute.ts`, der Browser ruft sie über `aiRouteRequest.ts`; `npm run dev` stellt sie per Vite-Middleware bereit.
- Jede Route verlangt Same Origin, einen Supabase-Bearer (lokal gegen die gecachten JWKS geprüft) und den Serverschlüssel, bevor sie den begrenzten Body liest; sie antwortet mit `no-store`, erzeugt genau einen erzwungenen Tool Call und loggt dessen Kosten auch bei verworfener Antwort.
- Eingaben, Grenzen, Fristen und Antwortprüfung stehen in den `ai*Contract.ts`.
- Modell: `OPENROUTER_MODEL` in `server/aiRoute.ts` (`openai/gpt-6-luna`), Reasoning je Route (`medium` außer Auswahl und Quelle), ZDR, `data_collection: "deny"`; ohne Katalog und Fallback (ADR-011).
- Der OpenRouter-Zugang steht nur in `process.env`; Secrets gehören weder in `VITE_*`, Browsercode, `localStorage`, Exporte noch Logs. Alle anderen Datenzugriffe laufen über die Supabase-Module. Betrieb: [Operations](operations.md).

## Import und Übersetzung

### Ablauf

- Der Worker erhält die Datei, liest sie mit `readAnkiPackage`, übersetzt einmal und hält den Importgraphen bis Commit oder Verwerfen. Der ZIP-Leser (auch ZIP64) liest Einträge einzeln aus dem `Blob`, statt das Paket ganz zu laden.
- Beim Commit streamt der Worker begrenzte Chunks in Fremdschlüsselreihenfolge und Medien einzeln mit SHA-1-Prüfung; der Main Thread schreibt jeden Chunk in IndexedDB, bevor er den nächsten anfordert.
- Die flüchtige Importsitzung überlebt interne Navigation; nach einem Neuladen laufen nur Outbox und Medienqueue weiter. `interruptedImport` im Meta-Store vermerkt eine begonnene Übernahme bis zu ihrem Ende. Die Cloud-Bestätigung je Import läuft nach jedem gespeicherten Sync erneut und zieht in den nächsten Arbeitsbereich des Kontos mit.

### Reimport

- Reimport ordnet Inhalte per Anki-GUID und Karten per Anki-Karten-ID zu, lokal und über `load_reimport_targets`; persistierte IDs stehen vor dem Schreiben fest.
- Paketbewertungen gehen nur an neue Karten, mit `resume` an alle; Ereignis-IDs sind stabil. Tags werden dreiseitig gegen `importedTags` zusammengeführt; eine Notiz, deren `mod` älter als `importedAnkiModifiedAt` ist, schreibt nichts.
- Vorhandene Stapel behalten Name, Oberstapel und Einstellungen; ohne Anki-ID erkennt sie der Reimport an Oberstapel und Name. Neue entstehen unter dem Pfad ihres persistierten Oberstapels.

### Note-Übersetzung

- Die Übersetzer-Registry erkennt in fester Reihenfolge: native Bildverdeckung, „Multiple Choice for Anki“, Image Occlusion Enhanced, AnKing-/Ankizin-Familie, Anki-Standardtypen, generischer Übersetzer. Jeder Inhalt trägt `translator: { id, version }`.
- Standardtypen zählen nur mit unveränderten Standardvorlagen, weil Anki `originalStockKind` auch an geklonte Notiztypen vergibt.
- Der generische Übersetzer leitet Feldrollen aus der Position im Template ab, das `compileSafeTemplate` ohne Scripts auswertet. Ein Inhalt, der zu keinem Übersetzer passt, wird Feldliste (`field-list`), statt verloren zu gehen.
- Der Lernstand folgt einem FSRS-7-Replay der vollständigen Historie, sonst Ankis FSRS-Gedächtnis, klassischem Intervall oder bleibt neu. Ereignisse tragen feste IDs je Revlog-Zeile.
- Medien zählen nur aus `src`, `poster` und `[sound:…]`; je SHA-1 bleibt eine Datei, nur referenzierte kommen mit.
- `noteTypeSources` (Vorlage je Notiztyp) und `noteSources` (rohe Feldwerte je Inhalt) sind die Eingabe jeder Neuübersetzung. Ankis Format- und Templatedetails stehen in der [Anki-Referenz](anki-format-analysis.md).

### Neuübersetzung

- `TRANSLATOR_VERSIONS` nennt die Version je Übersetzer. Nach dem Sync prüft `runAccountRetranslation` einmal je Übersetzerstand und Gerät die Kandidaten aus `list_retranslation_candidates`.
- Karten behalten Identität und Lernstand. Würde eine Karte mit Lernstand entfallen, fehlt die Eingabe (Image Occlusion Enhanced) oder wartet eine lokale Änderung, bleibt der Inhalt unverändert.
- Geschrieben werden nur geänderte Inhalte, mit `importedContentRevision` = `contentRevision`.

## Lernen und Prüfungsplanung

### Lernen

- `reviewService.ts` baut die Tagesqueue aus Lernständen, Ereignissen des Lerntags und Stapeloptionen und liefert die begrabenen Schlüssel; die Sitzung hält die gezeigte Karte, bis sie bewertet ist.
- `scheduler.ts` kapselt `ts-fsrs`. Die Prüfungsplanung simuliert Laufbahnen über dieselbe FSRS-7-Planung samt Easy Days, nur ohne Buchführung zwischen den Antworten.
- Eine Neuplanung ist genau ein manuelles `ReviewEvent`, das alten und neuen Termin festhält.
- `newCardsTodayOverride` gilt für einen Stapel und Lerntag; eine Änderung des Neulimits hebt ihn auf.

### Prüfungsplanung

- Pläne liegen in `schedulerPreferences.examPlanning` (Version 3) im Profil und werden von `examPlanSettings.ts` validiert; andere Formate liest die App nicht, frühere haben Migrationen einmalig umgestellt.
- `examPlanning.ts` ist die öffentliche Planungsschnittstelle; die Kontaktplanung in `examContactPlanning.ts` ist privat, deterministisch und teilt mit der Lastverteilung ein Hauptthread-Budget.
- `workspaceHydrationService.loadExamPlanningData` lädt Lernstände über `list_account_card_study_states` und ersetzt sie durch noch nicht synchronisierte Antworten.
- Die Zeitzone aller Prüfungsansichten liefert `getLearningTimeZone` (Profil, sonst Browser, sonst UTC).
- Die Tagescheckliste besitzt `examDailyTasks.ts` mit Grenzen in `EXAM_PLANNING_LIMITS`; `deckCommands.ts` mischt sie in den jeweils aktuellen Profilstand.
- `createExamSessionDecks` und `Treffer lernen` markieren ihren transienten Wurzelstapel mit `plannedOrder`; nur dann hebt `reviewService.ts` Mengengrenzen auf und erhält die Reihenfolge, ohne die Planung zu kennen.
- Ohne Verbindung meldet die Prognose `offline`, die Tagesaufgaben arbeiten mit den gespeicherten Zielen und der Sitzungsstart mit den lokal vorhandenen Zielkarten.

## KI und Lerninhalte

### Varianten und Lernhilfe

- Varianten entstehen nur aus der bereinigten Quelle einer Karte (`cardVariantSource`; Art `basic`, `type-in`, `cloze`, `choice`). Vor der Mutation prüft der Vertrag Anzahl, Schema, Änderung, Duplikate, Größen und den aktuellen Inhalt.
- Antwort, Eintippvergleich, Lückenlösung, Options-IDs und Richtigkeit kommen beim Darstellen von der Karte. Eine Auswahl-Variante speichert Stamm und Optionen in `front`/`back`, umformulierte Optionstexte in `meta.options`. `clozeSyntax.ts` zerlegt Anki-Lücken für Renderer und Vertrag.
- `not_rephrasable` (422) oder drei Abweisungen in Folge (`AI_CARD_VARIANT_REJECTIONS`) vermerkt die Karte in `variantRefusal`, gültig bei gleicher `contentRevision`; `activeVariantRefusal`, `catalogEntryFromCard` und `refresh_card_catalog` werten gleich aus.
- Geänderter Text einer behaltenen Karte, auch per Reimport, macht ihre aktiven Varianten veraltet (`meta.outdated`); eine Neuerzeugung ersetzt sie.
- `aiCardHelp.ts` bildet den Kartentext der Lernhilfe: ohne Quellenfelder und Bildverdeckungen, eine Lücke verdeckt nur sich selbst.

### Karten aus einer Quelle

- `aiSourceCardsContract.ts` prüft je Anfrage einen Abschnitt als Einheiten mit ID und die Antwort: Strukturfehler verwerfen sie ganz; ungültige, unbelegte, wiederholte oder überzählige Vorschläge fallen gezählt heraus. `aiSourceCards.ts` zerlegt die Quelle im Browser in belegte Einheiten (PDF-Seite, Zeilenblöcke, Tabellenzeilen mit Kopfzeile) und schickt Abschnitte einzeln über `requestAiSourceCards`, das die Antwort erneut prüft. Gespeichert wird erst bei der Übernahme über `saveManualNote`.

### Zusammenfassungen und Mindmaps

- Online liegen sie in `learning_summaries` (eine Zeile je Fassung), `learning_mind_maps` (Zeilen-ID = Stapel-ID) und `learning_quizzes` (eine Zeile je Quiz), mit `document` als versioniertem JSONB, Owner-RLS, Fremdschlüssel auf den eigenen Stapel und `deleted_at` (ADR-043).
- Die Datenbank vergibt `revision` und `updated_at` per Trigger; `cloudLearningDocuments.ts` schreibt nur gegen die bekannte Revision. Ohne Supabase-Client bleibt alles lokal.
- Speichern schreibt zuerst lokal und lädt dann hoch; offline Gespeichertes bleibt als ausstehend markiert und wird beim nächsten Öffnen abgeglichen.
- Konflikte: Eine Zusammenfassung erhält eine `Konfliktfassung von …`, das Original den Cloudstand. Ein Quiz ergänzt den Cloudstand um die eigenen Durchgänge. Bei einer Mindmap gewinnt der zuletzt gespeicherte Stand; ein gleichzeitiges erstes Speichern (`23505`) gilt ebenfalls als Konflikt.
- Mindmap-Bilder liegen lokal unter ihrem SHA-1 und online im privaten Bucket `learning-mind-map-images` (`<userId>/<sha1>`). Sie werden vor der Map hochgeladen und erst freigegeben, wenn keine lokale und keine Online-Map sie mehr nutzt.
- Erweiterungen des Dokumentformats sind optional, damit ältere Fassungen lesbar bleiben. In Mindmaps bilden `parentId` die azyklische Hierarchie und `edges` unabhängige Querverbindungen.
- Mindmap-Operationen besitzt `learningMindMaps.ts`, der Screen nur Auswahl, Gesten und Ansicht. Autospeichern über `latestSaver.ts` überschreibt nie einen neueren Stand mit einem älteren.
- `aiLearningSummary.ts` verarbeitet nur vollständig geladene Inhalte des gewählten Stapelbaums, je Inhalt eine Einheit. `aiLearningSummaryContract.ts` ist die einzige Quelle des Prompts und trennt Anweisung, Einstellungen und nicht vertrauenswürdiges Material.
- Die App setzt die Antwort zu semantischem HTML zusammen; `mindMapFromSummary` liest genau dieses HTML. Eine Signatur des erzeugten Baums erlaubt, ihn später nur unbearbeitet zu ersetzen.
