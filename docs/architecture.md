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
- `LearningItemDocumentV1` und `NoteTypeDefinitionV1` sind Inhalts- und Darstellungswahrheit. Choice-Interaktionen speichern Optionen, richtige Antworten, Erklärung und den optionalen Auswahlmodus `single` oder `multiple`; Compatibility-Felder und Editorwerte werden atomar daraus projiziert. Feldnamen/-positionen sind keine semantischen Schlüssel.
- `CardContentPayload` enthält validierte Editorwerte und stabile Medienreferenzen, keine Entitäts-/Reviewidentitäten, Bytes oder Signed URLs. Kopien erhalten frische Karten-, Review- und Scheduleridentitäten.
- Importierte Feldwerte sind editierbar; Anki-Feldschema, Templates und CSS bleiben strukturell schreibgeschützt. Entwurfsvorschau persistiert oder revidiert nichts.
- Templateauswertung, Sanitization und URL-Auflösung bleiben getrennt. Scripts und externe Ressourcen werden nicht ausgeführt; lokale Darstellung verwendet nur `blob:`/`data:`, Sandbox-CSP und eingebettete Basisschriften. Der Renderer besitzt die Anki-`FrontSide`-Komposition. Getrennt angehängte Review-Antworten entfernen bereits sichtbare Vorderseitenanteile; Cloze-Antworten ersetzen dagegen die Vorderseitenfläche als vollständig gelöste Projektion.
- Manuelle Speicherung ist Single Flight mit unveränderlichem Snapshot. Reihenfolge: lokale Medienvorbereitung, Mediencache, lokale Karte, Upload und Referenzpersistenz. Cloudfehler nach lokalem Erfolg sind Teilabschlüsse. APKG-Medien werden nicht verkleinert.
- Reimport identifiziert Karten über `sourceCardId`, bewahrt lokale Inhaltsänderungen, Review State, Markierung, Aussetzung und lokale Stapelordnung. Medienreferenzen werden vor ihrer Stilllegung ergänzt.
- Review Events sind append-only und accountgebunden. `revlog` wird deterministisch dedupliziert. Initialer Schedulerstate folgt FSRS-Memory-State, Revlog-Replay, klassischem Kartenstatus, neuer Karte; ab dem ersten CoRe-Review besitzt FSRS-6 den State.
- KI-Varianten akzeptieren nur validierte Basic-Plaintexts. Toolname, Anzahl, Schema, Änderung, Duplikate und Größenlimits werden vor der bestehenden Variantenmutation geprüft. Eine inzwischen geänderte Karte verhindert die Mutation.
- React kennt keine Parser-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails. Ein aktiver Workerfehler bleibt sichtbar; es gibt keinen stillen Direktparser-Retry.

## Heutiges Compatibility-Modell

`deck.cards[]`, einzelne `CoreCard`-Typgrenzen und die Cloudtabelle `cards` bezeichnen Learning Items. `cards.content_document` und `deck_note_type_definitions.definition` speichern normalisierte Dokumente/Definitionen; diese heutigen Namen werden nicht nebenbei migriert. Jeder zusätzliche Varianteninhalt bleibt einem vorhandenen Item untergeordnet. Geplante Umbauten stehen ausschließlich in [TODO](todo.md).

## Persistenz, Sync und Medien

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

`POST /api/ai/card-variant` ist der einzige CoRe-Serverendpunkt. Er verlangt Same Origin und Supabase-Bearer, akzeptiert `{ source: { front, back } }`, begrenzt den Body auf 8 KiB und jedes Feld auf 1.200 Zeichen und antwortet mit `Cache-Control: no-store`. OpenRouter-Zugang bleibt ausschließlich in `process.env`. Die Function wählt kostenlose text-/toolfähige Modelle, bevorzugt ZDR und erlaubt den dokumentierten kostenlosen Non-ZDR-Fallback; genau ein erzwungener Tool Call erzeugt eine Umformulierung. Vertragsdetails stehen bei `aiCardVariantContract.ts`, der operative Umgang in [Betrieb](operations.md). Andere Produktdatenzugriffe laufen über die gekapselten Supabase-Module. Secrets gehören weder in `VITE_*`, Browsercode, `localStorage`, Exporte noch Logs.

## Importregeln

Der Worker normalisiert einmal; der Main Thread streamt den Commitgraphen in begrenzten Chunks nach IndexedDB. Persistierte IDs werden vor dem Schreiben zugeordnet. Die flüchtige APKG-Sitzung überlebt interne Navigation; Reload-Wiederanlauf gehört nur Outbox und Medienqueue. Legacy-JSON und V18-Protobuf sind unterstützte externe Anki-Formate, keine obsolete Appkompatibilität. Unbekannte Quellfelder bleiben im unveränderlichen Snapshot. Format-, Template-, Medien-, Identitäts- und Revlogdetails stehen in der [Anki-Referenz](anki-format-analysis.md); sichtbare Phasen, Dateigrenzen und Teilabschlüsse in [Specs](specs.md).

## Architekturänderungen

Änderungen erhalten diese Grenzen und Invarianten. Dauerhafte Trade-offs gehören in [Entscheidungen](decisions.md), offene Umbauten nur in [TODO](todo.md). Implementierungs- und Layoutdetails werden in ihren besitzenden Quellen gepflegt und hier nicht dupliziert.
