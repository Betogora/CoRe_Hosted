# CoRe-Architektur und Invarianten

**Rolle:** einzige kanonische Quelle für aktuelle Architektur, Modulgrenzen, technische Invarianten sowie die Trennung von Ist- und Zielmodell.
**Stand:** 2026-08-06

Produktverhalten steht in [`specs.md`](specs.md), der verifizierte Ist-Stand in [`status.md`](status.md), Betrieb in [`operations.md`](operations.md) und offene Arbeit in [`todo.md`](todo.md).

## 1. Systemkontext

CoRe ist eine Vite-/React-Anwendung mit TypeScript. Der Browser nutzt Supabase Auth, Postgres und Storage über accountgebundene Module. Vercel liefert die SPA und genau eine schmale KI-Function für textbasierte Basic-Kartenvarianten aus.

```text
React-Screens
  -> App-Shell und Workspace-Kommandos
  -> tiefe Domänenmodule
  -> lokaler accountgebundener Cache
  -> Supabase Auth/Postgres/Storage mit RLS

Basic-Variantenwerkzeug
  -> validierter Textvertrag und Supabase-Bearer
  -> Vercel Function /api/ai/card-variant
  -> OpenRouter Tool Call
  -> bestehende Variantenmutation

```

Eine allgemeine Backend-, Auth- oder Provider-Adapterebene ist nicht Teil der Architektur. Konkrete Module bleiben erlaubt, solange nur ein realer Anbieterpfad existiert.

## 2. Modulgrenzen

| Grenze | Verantwortung |
| --- | --- |
| `src/App.tsx` | App-State, Route-Auswahl und Screen-Komposition |
| `src/appNavigation.ts` | Kanonischer typisierter AppRoute-Vertrag, defensive URL-Parse-/Serialize-Naht und allowlist-basierter Review-Rückkontext |
| `src/useAppNavigation.ts` | Einzige Browser-History-Anbindung; projiziert den kanonischen AppRoute ohne parallele Screen-Selektion |
| `src/screens/` | Produktnahe UI; die Screen-Landkarte steht in [`../src/screens/README.md`](../src/screens/README.md) |
| `src/ui/` | Kanonische produktweite UI-Seam und [UI-Katalog](../src/ui/README.md): strukturelle Module in `coreUi.tsx`, Actions in `actionUi.tsx`, Feedback in `feedbackUi.tsx`, Auswahlfelder in `selectUi.tsx` und fachliche Spezialmodule |
| `src/coreTheme.ts` | Einzige Browser-Seam für validierte Light-/Dark-Auswahl, Dokumentattribut und lokale Theme-Präferenz |
| `src/coreTypes.ts` | Kanonische normalisierte Typen für Deck, Learning Item, Card Variant, Review State und diskriminierte Editorwerte |
| `src/coreModel.ts` | Einzige öffentliche Seam für Erzeugung, Normalisierung, typgerechte Editorprojektion, Validierung, identitätsfreie Karteninhalt-Payloads und Speichern von Learning Items und Varianten |
| `src/coreWorkspace.ts` | Anwendungsbefehle für Decks, gemeinsame Vier-Ebenen-Platzierungsprüfung, typgerechte Kartenwerte, unabhängige Kartenkopien, Import und Variantenannahme |
| `src/aiCardVariantContract.ts` | Gemeinsamer Laufzeitvertrag, Größenlimits und reine Basic-Plaintextprojektion für KI-Varianten |
| `src/aiCardVariant.ts` | Browseraufruf sowie Änderungs- und Duplikatprüfung vor der bestehenden Variantenmutation |
| `api/ai/card-variant.ts` | Authentifizierte Vercel Function, kostenlose OpenRouter-Modellauswahl, ZDR-Präferenz und erzwungener Tool Call |
| `src/libraryModel.ts` | Reine Projektionen für Stapelhierarchie, unbegrenzte gruppierte Kartentabelle einschließlich Fälligkeits-/Variantenstatus und Sortierung, Suche, Heatmap und Statistik |
| `src/creationBatch.ts` | Reiner Batch-Session-State für Zähler, Zieldeck, aktuellen UI-Entwurf, Pins und deterministische Fokuswahl; keine zweite Kartenrepräsentation |
| `src/importUiState.ts` | Diskriminierte Projektion sichtbarer Importphasen und Terminalzustände ohne Parser-, Protokoll- oder Medienverantwortung |
| `src/coreRepository.ts` | Lokaler persistenter App-State und Legacy-Normalisierung |
| `src/cloudRepository.ts` | Accountgefiltertes Laden, revisionsgeprüfte Mutationen, Konflikte und Soft-Deletes |
| `src/apkgImport.ts` | Öffentliche APKG-Normalisierungsgrenze; Worker, ZIP und SQLite bleiben privat |
| `src/mediaStore.ts` | Öffentliche accountgebundene Mediengrenze für Cache, Queue und URL-Auflösung; manuelle Bilder verwenden direkte SHA-1-Referenzen ohne APKG-Manifest |
| `src/cloudMediaStore.ts` | Supabase Storage, Signed URLs und TUS |
| `src/reviewService.ts` | Auswahl, Bewertung und Projektion des Review-Flows |
| `src/coreVariantService.ts` | Eligibility, Reife, Variantenplanung und Fallback |
| `src/cloudRepositoryValidation.ts` | Validierung externer Cloud-Rows und JSONB-Payloads |

React-Caller kennen keine APKG-, SQLite-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails.

### 2.1 Theme- und UI-Vertrag

`src/styles.css` besitzt die primitive CoRe-Palette, semantische Farbrollen, Typostufen und gemeinsame Zustandsklassen. Produktive TSX-Dateien verwenden diese semantischen Rollen statt eigener Theme-Paletten. `:root` definiert den Light Mode; `[data-core-theme="dark"]` überschreibt den vollständigen semantischen Satz. `src/coreTheme.ts` validiert die lokal gespeicherte Auswahl, setzt das Dokumentattribut vor dem ersten React-Render und persistiert explizite Umschaltungen. `ThemeToggle` kapselt seinen lokalen Darstellungszustand im Einstellungsbereich `App und Bedienung`, sodass eine Umschaltung keinen App-Shell-Render auslöst; eine Systempräferenz wird nicht ausgewertet.

`src/ui/coreUi.tsx` bleibt die Struktur-Seam, `src/ui/actionUi.tsx` besitzt normales Action- und Icon-Button-Verhalten, `src/ui/feedbackUi.tsx` besitzt Statusdarstellung und Live-Region-Semantik und `src/ui/selectUi.tsx` zentralisiert kontrollierte Auswahlfelder einschließlich Overlay, Tastatur- und Fokusverhalten. Fachliche Controls wie Reviewratings, MCQ-Optionen, Tabs, Farbfelder und Drag-Ziele dürfen lokal bleiben, beziehen Farben, Typografie, Fokus und Disabled aber aus demselben Vertrag. Der auffindbare Nutzungsvertrag steht in [`../src/ui/README.md`](../src/ui/README.md); Wiederverwendung ist empfohlen, nicht erzwungen, wenn sie die Fachsemantik verschlechtern würde.

`AppNavigation` besitzt die einzige responsive Shell-Navigation: CSS schaltet unter 768 px auf mobilen Kopf und schwebende Bottom Bar, ab 768 px auf die Sidebar. Die mobile Leiste wird per Portal außerhalb des weichgezeichneten Shell-Containers gerendert und verwendet dynamische Viewportmaße, damit lange Seiten und Browser-Scrollbars ihre feste Position oder Breite nicht verändern. Beide Projektionen rufen denselben typisierten Navigationscallback auf; es gibt keine Geräteerkennung oder zweite Routebene. `Mehr` ist die mobile Bezeichnung der direkt geöffneten Kartenverwaltung. Einstellungen, Hilfe und Simulator bilden eine Utility-Gruppe, deren regulärer Einstieg das Einstellungszahnrad ist.

`DeckTree` besitzt das gemeinsame Panel `Aktive Stapel`, die flache Baumprojektion und den per Pointer-Capture stabilisierten Desktop-Drag für Dashboard und Lernen. Es verwendet wie die Kartenverwaltung genau eine responsive `DeckSummaryRow`: unter 768 px ohne sichtbaren Herkunftspfad und Kennzahllabel, ab 768 px mit dem vollständigen Zeileninhalt. Flexible Namens- und Tabellenbereiche dürfen bis auf null schrumpfen und werden elliptisch gekürzt; Kennzahlen, Donut, Chevron und Stapelaktion bleiben sichtbar, ohne einen horizontalen Scrollpfad zu erzeugen. `CompactDeckSummaryRow` bleibt die feste kompakte UI-Elements-Projektion und teilt denselben Renderer. `DeckOptionsMenu` besitzt in Dashboard, Lernen und Kartenverwaltung den identischen randlosen Trigger, die Erscheinungsbild-/Pfadkopfzeile, den CoRe-Modus und den bestätigten Verschiebedialog; der Dialog wird erst beim Öffnen gemountet. Verwaltungs- und Lernaktionen jenseits von Verschieben liegen im `DeckSettingsScreen`; die Workspace-Platzierungsprüfung bleibt die einzige fachliche Validierung.

`HelpScreen` besitzt die statische Produktaufklärung und den transienten Interaktionszustand der Lernkurve. Er liest oder mutiert keinen Workspace-State. Die Kurve ist lokale, semantisch beschriftete UI und kein Scheduler- oder Variantenvertrag.

`src/simulationClock.ts` normalisiert den transienten Tagesoffset und projiziert die reale lokale Uhr kalenderbasiert auf einen simulierten Lernzeitpunkt. `App` besitzt den Offset ausschließlich im React-Zustand und reicht den effektiven Zeitpunkt an Dashboard, Lernen, Kartenverwaltung, Statistik und Review weiter. `SimulatorScreen` besitzt nur die Tagessteuerung; es gibt keinen parallelen Teststapel oder Schedulerpfad. Bloßes Umstellen mutiert keinen Workspace. Ein Review verwendet den simulierten Zeitpunkt im bestehenden `reviewService.ts`-Pfad und wird anschließend normal gespeichert und synchronisiert. Technische Auth-, Sync-, Medien-, Autosave- und Inhaltsmetadaten bleiben auf realer Systemzeit.

### 2.2 Navigation und URL-Kontext

`LearnScreen` und `DecksScreen` bleiben getrennte Aufgabenoberflächen und beide Teil der Hauptnavigation. Lernen ist der primäre Lernstart; Karten ist die direktlinkfähige, nach Stapelhierarchie gruppierte Gesamttabelle. Beide erhalten Deck- und Kartenidentität ausschließlich aus dem von `src/appNavigation.ts` normalisierten AppRoute; der Karten-Screen besitzt keine parallele Auswahlidentität.

Der URL-Vertrag umfasst:

- View sowie fokussiertes Deck für Lernen, Kartenverwaltung und Stapel-Einstellungen;
- ausgewählte Karte ausschließlich in der Kartenverwaltung;
- Erstellmethode, Zieldeck und Abschlussdeck im Erstellfluss;
- die kontextfreien Seiten `/hilfe` und `/simulator`;
- Reviewdeck, optionalen Variantenbezeichner und den diskriminierten Rückkontext `today | learn | decks`;
- optionales Rückdeck und ausschließlich für `decks` eine optionale Rückkarte.

Freie Return-URLs werden nicht akzeptiert. Browser-History-State darf Zusatzdaten tragen, ist aber nie die einzige Quelle navigationsrelevanter Identität. `popstate`, Reload und Direktlinks werden aus der URL rekonstruiert. Unbekannte IDs bleiben bis zur zuständigen UI erhalten, damit diese einen sicheren deutschen Not-found-Zustand statt eines zufälligen Ersatzdecks oder einer zufälligen ersten Karte zeigt.

Aufklappzustände, Tastaturfokus, lokale Suche, Dialoge, ungespeicherte Entwürfe und der Simulationsoffset bleiben transient. `/testmodus` ist nicht mehr routbar und fällt wie andere unbekannte oder entfernte Seiten auf die Übersicht zurück. Es gibt keine Routerbibliothek und keine zweite Navigations- oder Persistenzebene.

## 3. Domäneninvarianten

- Ein Deck enthält fachlich Learning Items.
- Jedes Learning Item besitzt genau eine Originalvariante.
- Jede weitere Variante verweist auf dasselbe Learning Item und bleibt am Original verankert.
- Typgerechte Änderungen synchronisieren kanonischen Inhalt, Compatibility-Felder, strukturierte Options-/Lückenfelder und Originalvariante atomar.
- `basic-with-images` verwendet denselben Front-/Back-Vertrag wie Basic. Je Seite wird höchstens ein optionales Bild als SHA-1-Referenz im HTML und in `mediaRefs` verankert; die Bytes verbleiben hinter `mediaStore`.
- `CardContentPayload` transportiert ausschließlich einen validierten `CardEditorValue` und stabile `mediaRefs`. Die Projektion enthält keine Karten-, Deck-, Varianten-, Review-, Quellen- oder Versionsidentität, keine Medienbytes und keine Signed URLs.
- Der KI-Variantenvertrag akzeptiert ausschließlich Basic-Karten und projiziert daraus nur bereinigte Vorder- und Rückseitentexte. Providerantworten bleiben `unknown`, bis Toolname, Anzahl, Schema, Änderung und Größenlimits validiert sind.
- KI-Ergebnisse laufen als `ai_generated` durch dieselbe Variantenmutation wie manuelle Formen und erzeugen kein zweites Learning Item. Eine zwischenzeitlich geänderte Quelle oder ein Inhaltsduplikat verhindert die Mutation.
- Eine Kartenkopie wird über dieses Payload erneut durch die kanonische Learning-Item-Erstellung geführt. Dadurch entstehen frische Learning-Item-, Originalvarianten- und Review-Identitäten sowie ein neuer Schedulerzustand; Importanker, Quellenanker und Versionsverlauf werden nicht übernommen.
- Reverse-Speichern hält genau eine aktive Rückrichtung aktuell; regulärer Review verwendet die Originalrichtung, expliziter Variantenreview die Rückrichtung.
- Cloze-Speichern erhält passende Variantenidentitäten, erzeugt neue Lückengruppen und deaktiviert entfernte Gruppen.
- Importierte Rohfelder bleiben read-only und werden beim typgerechten Speichern nicht ersetzt.
- Reimport überschreibt keine lokal bearbeiteten typgerechten Inhalte. Er darf Importmetadaten und Medienreferenzen aktualisieren.
- Review Events sind append-only und accountgebunden. Stapel sind implizit privat.
- Parserfehler eines aktiven APKG-Workers bleiben sichtbar; es gibt keinen stillen Direktparser-Retry.
- Fremdpayloads bleiben `unknown`, bis das besitzende Modul sie validiert oder normalisiert.
- RLS ist auf nutzerdatenhaltenden Tabellen aktiv. Ownership entsteht nicht aus veränderbaren User-Metadaten.
- Service-Secrets erscheinen weder in `VITE_*`, Browsercode, `localStorage`, Exporten noch Logs.

## 4. Heutiges Compatibility-Modell

Das implementierte Modell verwendet aus Kompatibilitätsgründen weiterhin diese Namen:

- `deck.cards[]` ist die lokale Collection für Learning Items.
- `CoreCard` bezeichnet an einzelnen Codegrenzen weiterhin ein Learning Item.
- Die Supabase-Tabelle `cards` persistiert Learning Items.
- Bestehende Scheduler- und Importfelder bleiben in ihren aktuellen kompatiblen Formen erhalten.

Neue manuelle und Importpfade verwenden die Learning-Item-Helfer aus `src/coreModel.ts`. Eine Umbenennung von `cards` zu `learning_items` wäre eine koordinierte Migration; parallele Collections oder Dual-Read/-Write-Pfade sind nicht zulässig.

## 5. Zielmodell

Das fachliche Zielmodell trennt:

- `Learning Item`: kanonischer Lerninhalt, Felder, Tags, Quellen und Versionen;
- `Card Variant`: reviewbare Darstellung mit Originalanker, Typ, Status und Qualitätsdaten;
- `Review State`: nutzerbezogener Schedulingzustand pro reviewbarer Einheit;
- `Review Event`: unveränderliches Bewertungsereignis;
- `Source Document` und `Source Anchor`: Quelle und stabile Fundstelle;

Dieses Zielmodell beschreibt die gewünschte fachliche Richtung, nicht bereits vorhandene Tabellennamen. Das Compatibility-Modell aus Abschnitt 4 bleibt die einzige Aussage über den aktuellen Persistenzvertrag.

`src/scheduler.ts` kapselt die offizielle FSRS-6-Implementierung aus `ts-fsrs@5.4.1`. Review State wird ohne paralleles Persistenzmodell auf die FSRS-Karte projiziert; CoRe ergänzt ausschließlich Reife-XP, Variantenwahl und Fallback. Neue Zustände tragen `fsrs_6_v1`. Ältere `fsrs_v1`-Zustände behalten ihren Termin und werden erst beim nächsten Review auf den neuen Schedulerzustand projiziert. Fuzzing ist deaktiviert, damit Vorschau und Commit deterministisch bleiben. Die 21 offiziellen Standardparameter sind aktiv; persönliche Parameteroptimierung ist nicht implementiert.

Die Tagesqueue begrenzt nur eindeutige initiale Karten. Der Sitzungszustand hält Wiederholungen separat und zieht sie nach der Anfangsqueue bei Bedarf vor; jede Bewertung bleibt trotzdem genau ein unveränderliches Review Event.

## 6. Persistenz, Sync und Medien

- `src/accountStorage.ts` trennt lokale Cache-Keys pro Account.
- Revisionierte Entitäten tragen Revision, Soft-Delete-Zeitpunkt und Geräte-ID.
- Mutationen werden nur gegen die erwartete Basisrevision bestätigt. Abweichungen erzeugen accountgebundene Konflikte statt stiller Merges.
- Karten-Undo setzt denselben soft-gelöschten Datensatz mit der bestätigten Tombstone-Revision wieder aktiv, entfernt genau diesen Tombstone und erhält Karten-ID sowie Review State.
- Review-Mutationen werden einzeln und idempotent bestätigt; Snapshot-Mutationen erst nach Persistenz und Readback.
- Medienobjekte liegen privat unter accountgebundenen Pfaden und werden über SHA-1 dedupliziert. Persistiert werden keine Bytes, Tokens oder Signed URLs im Deckmodell.
- Reimport legt neue Medienreferenzen vor der Stilllegung alter Referenzen an.

Schemaanker, Migrationen, Policies und Verify-SQL unter `supabase/` sind die ausführbare Wahrheit für konkrete Datenbankstrukturen. `src/database.types.ts` wird ausschließlich daraus generiert.

## 7. API-Vertrag

### 7.1 Implementierte Endpunkte

`POST /api/ai/card-variant` ist der einzige CoRe-Serverendpunkt. Er akzeptiert `{ source: { front, back } }`, verlangt Same Origin und einen gültigen Supabase-Bearer, begrenzt den Body auf 8 KiB sowie je Feld auf 1.200 Zeichen und antwortet immer mit `Cache-Control: no-store`. `OPENROUTER_API_KEY` wird ausschließlich aus `process.env` gelesen.

Die Function wählt zur Laufzeit das meistgenutzte kostenlose, textfähige und Tool-Call-fähige OpenRouter-Modell mit abschaltbarem Reasoning. ZDR-Endpunkte werden bevorzugt; fehlt ein nutzbarer Kandidat, ist genau ein kostenloser Non-ZDR-Fallback mit verweigerter Datenweitergabe zulässig. Kostenpflichtige Modelle und Modelle ohne Texteingabe sind ausgeschlossen; Bildfähigkeit ist für diese bewusst textbasierte Route keine Voraussetzung. Reasoning wird für die kompakte Umschreibung deaktiviert, damit das begrenzte Ausgabebudget vollständig für den Tool Call verfügbar bleibt. Ein Verfügbarkeitsfehler darf einmal mit neu geladener Modellliste wiederholt werden. Prompt und Tool-Schema verlangen genau eine kompakte Basic-Variante; es gibt kein Streaming und keine zweite Modellrunde.

Andere `/api/ai/*`-Routen sowie `/api/imports/apkg` bleiben entfernt und liefern im Deployment `404`.

Browserzugriffe auf Produktdaten erfolgen ansonsten direkt über die gekapselten Supabase-Repository-Module und RLS; sie sind keine CoRe-REST-Endpunkte.

### 7.2 Geplante, nicht implementierte APIs

Folgende Ressourcen sind Zielskizzen und dürfen nicht als verfügbar vorausgesetzt werden:

- `/api/decks`, `/api/learning-items` und `/api/review/session`;
- Dokumentendpunkte;
- serverseitiger Art.-15-Export und Account-Löschworkflow.

Neue Endpunkte brauchen einen expliziten Roadmap-Auftrag, Laufzeitvalidierung, Auth-/RLS-Grenzen und Tests. Frühere Beispiele mit `/api/cards` sind keine implementierte Compatibility-API.

## 8. Importregeln

- APKG-Vorschau und Commit verwenden dieselbe Normalisierung.
- Jeder sichtbare Importmodus besitzt eine eigene UI-Session. Ein Formatwechsel remountet diese Session und entfernt Vorschau, Commitfähigkeit, Fehler und Fortschritt des vorherigen Modus.
- `src/importUiState.ts` projiziert die gemeinsamen sichtbaren Phasen; APKG-Worker, ZIP/SQLite, Reimport und Medienqueue bleiben in ihren bestehenden Eigentümermodulen.
- Dateien bis einschließlich 250 MiB laufen im Browser-Worker. Größere Dateien werden ohne Upload oder Serverfallback abgewiesen.
- Importidentität bevorzugt stabile Anki-IDs vor Fingerprints.
- Unknown Note Types bleiben als sichere Rohprojektion erhalten; beliebige Anki-Templates werden nicht ausgeführt.
- Der Hauptbericht zeigt nutzerrelevante Ergebnisse; Notetype-IDs, SHA-1-Listen und Importidentitäten werden nicht dargestellt.

Die Detailanalyse des Anki-Formats steht in [`anki-format-analysis.md`](anki-format-analysis.md).

## 9. Architekturänderungen

Architekturänderungen müssen die Modulgrenzen und Invarianten oben erhalten. Entscheidungen mit dauerhaftem Trade-off werden im kleinen ADR-Format in [`decisions.md`](decisions.md) dokumentiert. Offene Umbauten stehen ausschließlich in [`todo.md`](todo.md).
