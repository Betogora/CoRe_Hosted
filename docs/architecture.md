# CoRe-Architektur und Invarianten

**Rolle:** einzige kanonische Quelle für aktuelle Architektur, Modulgrenzen, technische Invarianten sowie die Trennung von Ist- und Zielmodell.
**Stand:** 2026-07-16

Produktverhalten steht in [`specs.md`](specs.md), der verifizierte Ist-Stand in [`status.md`](status.md), Betrieb in [`operations.md`](operations.md) und offene Arbeit in [`todo.md`](todo.md).

## 1. Systemkontext

CoRe ist eine Vite-/React-Anwendung mit TypeScript. Der Browser nutzt Supabase Auth, Postgres und Storage über accountgebundene Module. Vercel liefert die SPA und die wenigen implementierten `/api/*`-Routen aus. Provider-Secrets bleiben ausschließlich auf dem Server.

```text
React-Screens
  -> App-Shell und Workspace-Kommandos
  -> tiefe Domänenmodule
  -> lokaler accountgebundener Cache
  -> Supabase Auth/Postgres/Storage mit RLS

Browser
  -> /api/ai/chat
  -> /api/imports/apkg
  -> serverseitige Secrets beziehungsweise Service-Role-Grenzen
```

Eine allgemeine Backend-, Auth- oder Provider-Adapterebene ist nicht Teil der Architektur. Konkrete Module bleiben erlaubt, solange nur ein realer Anbieterpfad existiert.

## 2. Modulgrenzen

| Grenze | Verantwortung |
| --- | --- |
| `src/App.tsx` | App-Shell, Route-Auswahl und Screen-Komposition |
| `src/appNavigation.ts` | Kanonischer typisierter AppRoute-Vertrag, defensive URL-Parse-/Serialize-Naht und allowlist-basierter Review-Rückkontext |
| `src/useAppNavigation.ts` | Einzige Browser-History-Anbindung; projiziert den kanonischen AppRoute ohne parallele Screen-Selektion |
| `src/screens/` | Produktnahe UI; die Screen-Landkarte steht in [`../src/screens/README.md`](../src/screens/README.md) |
| `src/coreTypes.ts` | Kanonische normalisierte Typen für Deck, Learning Item, Card Variant, Review State und diskriminierte Editorwerte |
| `src/coreModel.ts` | Einzige öffentliche Seam für Erzeugung, Normalisierung, typgerechte Editorprojektion, Validierung und Speichern von Learning Items und Varianten |
| `src/coreWorkspace.ts` | Anwendungsbefehle für Decks, typgerechte Kartenwerte, Import und Variantenannahme |
| `src/creationBatch.ts` | Reiner Batch-Session-State für Zähler, Zieldeck, aktuellen UI-Entwurf, Pins und deterministische Fokuswahl; keine zweite Kartenrepräsentation |
| `src/importUiState.ts` | Diskriminierte Projektion sichtbarer Importphasen und Terminalzustände ohne Parser-, Protokoll- oder Medienverantwortung |
| `src/coreRepository.ts` | Lokaler persistenter App-State und Legacy-Normalisierung |
| `src/cloudRepository.ts` | Accountgefiltertes Laden, revisionsgeprüfte Mutationen, Konflikte und Soft-Deletes |
| `src/apkgImport.ts` | Öffentliche APKG-Normalisierungsgrenze; Worker, ZIP und SQLite bleiben privat |
| `src/mediaStore.ts` | Öffentliche accountgebundene Mediengrenze für Cache, Queue und URL-Auflösung |
| `src/cloudMediaStore.ts` | Supabase Storage, Signed URLs und TUS |
| `src/reviewService.ts` | Auswahl, Bewertung und Projektion des Review-Flows |
| `src/coreVariantService.ts` | Eligibility, Reife, Variantenplanung und Fallback |
| `src/aiChatContract.ts` | Validierung des Browser-/Serververtrags für Chat |
| `src/cloudRepositoryValidation.ts` | Validierung externer Cloud-Rows und JSONB-Payloads |

React-Caller kennen keine APKG-, SQLite-, Storage-, RLS-, Scheduler-, Provider- oder Persistenzdetails.

### 2.1 Navigation und URL-Kontext

`LearnScreen` und `DecksScreen` bleiben getrennte Aufgabenoberflächen. Lernen ist der primäre Lernstart; die Kartenverwaltung ist eine sekundäre, direktlinkfähige Oberfläche. Beide erhalten Deck- und Kartenidentität ausschließlich aus dem von `src/appNavigation.ts` normalisierten AppRoute.

Der URL-Vertrag umfasst:

- View sowie fokussiertes Deck für Lernen, Kartenverwaltung und Stapel-Einstellungen;
- ausgewählte Karte ausschließlich in der Kartenverwaltung;
- Erstellmethode, Zieldeck und Abschlussdeck im Erstellfluss;
- Reviewdeck, optionalen Variantenbezeichner und den diskriminierten Rückkontext `today | learn | decks`;
- optionales Rückdeck und ausschließlich für `decks` eine optionale Rückkarte.

Freie Return-URLs werden nicht akzeptiert. Browser-History-State darf Zusatzdaten tragen, ist aber nie die einzige Quelle navigationsrelevanter Identität. `popstate`, Reload und Direktlinks werden aus der URL rekonstruiert. Unbekannte IDs bleiben bis zur zuständigen UI erhalten, damit diese einen sicheren deutschen Not-found-Zustand statt eines zufälligen Ersatzdecks oder einer zufälligen ersten Karte zeigt.

Aufklappzustände, Tastaturfokus, lokale Suche, Dialoge und ungespeicherte Entwürfe bleiben transient. Es gibt keine Routerbibliothek und keine zweite Navigations- oder Persistenzebene.

## 3. Domäneninvarianten

- Ein Deck enthält fachlich Learning Items.
- Jedes Learning Item besitzt genau eine Originalvariante.
- Jede weitere Variante verweist auf dasselbe Learning Item und bleibt am Original verankert.
- Typgerechte Änderungen synchronisieren kanonischen Inhalt, Compatibility-Felder, strukturierte Options-/Lückenfelder und Originalvariante atomar.
- Reverse-Speichern hält genau eine aktive Rückrichtung aktuell; regulärer Review verwendet die Originalrichtung, expliziter Variantenreview die Rückrichtung.
- Cloze-Speichern erhält passende Variantenidentitäten, erzeugt neue Lückengruppen und deaktiviert entfernte Gruppen.
- Importierte Rohfelder bleiben read-only und werden beim typgerechten Speichern nicht ersetzt.
- Reimport überschreibt keine lokal bearbeiteten typgerechten Inhalte. Er darf Importmetadaten und Medienreferenzen aktualisieren.
- Review Events sind append-only und accountgebunden. Community- oder geteilte Inhalte enthalten keine privaten Reviewdaten.
- Parserfehler eines aktiven APKG-Workers bleiben sichtbar; es gibt keinen stillen Direktparser-Retry.
- Fremdpayloads bleiben `unknown`, bis das besitzende Modul sie validiert oder normalisiert.
- RLS ist auf nutzerdatenhaltenden Tabellen aktiv. Ownership entsteht nicht aus veränderbaren User-Metadaten.
- Secrets erscheinen weder in `VITE_*`, Browsercode, `localStorage`, Exporten noch Logs.

## 4. Heutiges Compatibility-Modell

Das implementierte Modell verwendet aus Kompatibilitätsgründen weiterhin diese Namen:

- `deck.cards[]` ist die lokale Collection für Learning Items.
- `CoreCard` bezeichnet an einzelnen Codegrenzen weiterhin ein Learning Item.
- Die Supabase-Tabelle `cards` persistiert Learning Items.
- Bestehende Scheduler- und Importfelder bleiben in ihren aktuellen kompatiblen Formen erhalten.

Neue manuelle, Import- und KI-Pfade verwenden trotzdem die Learning-Item-Helfer aus `src/coreModel.ts`. Eine Umbenennung von `cards` zu `learning_items` wäre eine koordinierte Migration; parallele Collections oder Dual-Read/-Write-Pfade sind nicht zulässig.

## 5. Zielmodell

Das fachliche Zielmodell trennt:

- `Learning Item`: kanonischer Lerninhalt, Felder, Tags, Quellen und Versionen;
- `Card Variant`: reviewbare Darstellung mit Originalanker, Typ, Status und Qualitätsdaten;
- `Review State`: nutzerbezogener Schedulingzustand pro reviewbarer Einheit;
- `Review Event`: unveränderliches Bewertungsereignis;
- `Source Document` und `Source Anchor`: Quelle und stabile Fundstelle;
- `Shared Deck Reference`: geteilte Inhalte ohne private Lernmetriken.

Dieses Zielmodell beschreibt die gewünschte fachliche Richtung, nicht bereits vorhandene Tabellennamen. Das Compatibility-Modell aus Abschnitt 4 bleibt die einzige Aussage über den aktuellen Persistenzvertrag.

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

| Methode und Pfad | Zweck | Grenze |
| --- | --- | --- |
| `POST /api/ai/chat` | Freie oder quellengebundene Chat-Antwort | Supabase-Bearer, Einwilligung, Idempotenz, Rate Limit, serverseitiger Provider-Key |
| `GET /api/imports/apkg?jobId=…` | Owner-geprüfte Projektion eines serverseitigen APKG-Auftrags | Bearer, Ownership, sanitisiertes Ergebnis |
| `POST /api/imports/apkg` | APKG-Aktionen `create`, `enqueue-analysis`, `prepare-commit`, `finalize`, `retry`, `cancel` | Same-Origin, Bearer, Ownership, Zustands- und Revisionsprüfung |

Browserzugriffe auf Produktdaten erfolgen ansonsten direkt über die gekapselten Supabase-Repository-Module und RLS; sie sind keine CoRe-REST-Endpunkte.

### 7.2 Geplante, nicht implementierte APIs

Folgende Ressourcen sind Zielskizzen und dürfen nicht als verfügbar vorausgesetzt werden:

- `/api/decks`, `/api/learning-items` und `/api/review/session`;
- Karten- und Variantengenerierungsjobs unter `/api/ai/*`;
- Dokument-, Community- und Graph-Endpunkte;
- serverseitiger Art.-15-Export und Account-Löschworkflow.

Neue Endpunkte brauchen einen expliziten Roadmap-Auftrag, Laufzeitvalidierung, Auth-/RLS-Grenzen und Tests. Frühere Beispiele mit `/api/cards` sind keine implementierte Compatibility-API.

## 8. Importregeln

- APKG-Vorschau und Commit verwenden dieselbe Normalisierung.
- Jeder sichtbare Importmodus besitzt eine eigene UI-Session. Ein Formatwechsel remountet diese Session und entfernt Vorschau, Commitfähigkeit, Fehler und Fortschritt des vorherigen Modus.
- `src/importUiState.ts` projiziert die gemeinsamen sichtbaren Phasen; APKG-Worker, Serverprotokoll, ZIP/SQLite, Reimport und Medienqueue bleiben in ihren bestehenden Eigentümermodulen.
- Dateien bis einschließlich 250 MiB laufen im Browser-Worker. Der vorbereitete Pfad darüber bleibt bis zur Hosted-Abnahme deaktiviert.
- Importidentität bevorzugt stabile Anki-IDs vor Fingerprints.
- Unknown Note Types bleiben als sichere Rohprojektion erhalten; beliebige Anki-Templates werden nicht ausgeführt.
- Der Hauptbericht zeigt nutzerrelevante Ergebnisse, technische IDs nur in der Diagnose.

Die Detailanalyse des Anki-Formats steht in [`anki-format-analysis.md`](anki-format-analysis.md).

## 9. Architekturänderungen

Architekturänderungen müssen die Modulgrenzen und Invarianten oben erhalten. Entscheidungen mit dauerhaftem Trade-off werden im kleinen ADR-Format in [`decisions.md`](decisions.md) dokumentiert. Offene Umbauten stehen ausschließlich in [`todo.md`](todo.md).
