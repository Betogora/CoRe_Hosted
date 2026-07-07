# CoRe - Content Repetition

CoRe ist ein lokaler Web-MVP fuer eine Lernplattform, die klassische Spaced-Repetition-Karten um inhaltliche Wiederholung erweitert. Das Ziel ist, Kartenblindheit zu reduzieren: Lernende sollen nicht nur Layout, Wortlaut oder Lueckenposition wiedererkennen, sondern den Inhalt auch bei veraenderter Fragestellung abrufen koennen.

Der aktuelle Stand ist bewusst ein breiter lokaler Prototyp. Viele Produktpfade sind klickbar und testbar; Supabase und Vercel sind initial angebunden, aber CoRe ist noch kein fertiges gehostetes Mehrnutzerprodukt. App-State, Profile, Decks, Jobs, Community-Daten und Lernplaene liegen weiterhin lokal im Browser-Storage.

Die gepflegte Projektdokumentation liegt im Ordner `docs/`. `AGENTS.md` bleibt auf Root-Ebene, damit Coding-Agenten die Arbeitsregeln automatisch finden.

## Funktionsumfang

- Dashboard, Profil-Onboarding, Datenschutzoptionen und globale CoRe-Einstellungen.
- Deck-Verwaltung mit Hierarchie-Metadaten, Suche, Filtern, Kartenbearbeitung und Versionseintraegen.
- Importpfade fuer Anki-APKG, Text, CSV und Tabellen-/Excel-Paste.
- Manuelle Kartenerstellung mit Dokumentkontext und Quellenankern.
- Deterministische lokale KI-Drafts aus Quellentext mit Schema-Validierung und Draft-Review.
- Fullscreen-Review mit Antwortaufdeckung, vier Ratings (`Again`, `Hard`, `Good`, `Easy`), Tastatursteuerung und FSRS-like Scheduler-State.
- Content-Repetition-Varianten fuer geeignete reife Karten, inklusive Originalanker, konservativer Variant-Level, Fallback nach Fehlern, Deaktivieren und Fehler-Feedback.
- Lokale Community-Logik fuer kleine Gruppen, Ordner und Deck-Kopien ohne fremde Reviewdaten.
- Deck-Graph/Mindmap, Chat-your-Deck mit Zitaten, Lernplan-Generator, AI-Job-Uebersicht und JSON-Datenportabilitaet.

## Tech Stack

- Vite
- React 19
- Tailwind CSS
- Node.js `node:test` fuer Modultests
- Lokale Browser-Persistenz ueber `localStorage`

## Lokaler Start

```bash
npm install
npm run dev
```

Die Entwicklungs- und Preview-Server sind auf `http://127.0.0.1:5190/` konfiguriert.

## Scripts

```bash
npm run dev      # Vite-Dev-Server
npm test         # Node-Testlauf fuer src/*.test.js
npm run build    # Produktionsbuild
npm run preview  # Lokale Preview auf Port 5190
```

## Projektstruktur

```text
src/
  App.jsx                 App-Shell: Workspace-State, Navigation und Routing
  screens/                UI-Screens mit kleinen Props-Interfaces
  screens/README.md       Screen-Map und Regeln fuer KI-Programmierung
  ui/                     Geteilte Praesentationsbausteine und Medien-HTML
  coreModel.js            Zentrales Deck-, Karten-, Varianten- und Review-Datenmodell
  coreRepository.js       Lokale Persistenz und State-Normalisierung
  coreWorkspace.js        App-Kommandos und Demo-Daten
  creationWorkflow.js     Creation-/Import-Orchestrierung fuer APKG, Paste, manuell und KI-Drafts
  apkgImport.js           Anki-APKG-Importpipeline
  importService.js        Text-, CSV- und Tabellen-Import
  reviewService.js        Tiefer Review-Flow, Sessions, Fallback und Rating-Erfassung
  reviewFlow.js           Legacy-Fassade fuer bestehende Review-Imports
  scheduler.js            FSRS-like Review-State, Intervalle, Retrievability und Maturity-XP
  coreVariantService.js   Eligibility, Reifegrad, Variant-Plan, Fallback und Varianten-Feedback
  aiOrchestrator.js       Lokale KI-Job- und Draft-Erzeugung
  deckGraph.js            Mindmap-/Graph-Modell
  deckAssistant.js        Quellengebundene Deck-Antworten
  learningPlan.js         Lokale Lernplan-Erzeugung
  dataPortability.js      JSON-Export/-Import
```

## Wichtige Dokumente

- `docs/index.md`: Dokumentationskarte fuer Menschen und Agenten.
- `docs/specs.md`: Produktvision, Anforderungen, Datenmodell, API-Skizzen, Architektur, Hosting-/Datenbank-/KI-Leitplanken und Implementierungsstand.
- `docs/specs.html`: navigierbare HTML-Fassung der Spezifikation.
- `docs/todo.md`: Differenz zwischen aktuellem lokalen MVP und produktionsreifem Zielbild.
- `AGENTS.md`: lokale Entwicklungsregeln, empfohlene Kommandos und Architekturleitplanken.
- `supabase/core_schema_v1.sql`: aktueller Supabase/Postgres-Schemaanker fuer den spaeteren Produktivpfad.
- `supabase/verify_schema_v1.sql`: RLS-/Policy-Verifikation fuer das Supabase-Schema.

## Aktueller Status

CoRe laeuft lokal als Vite/React-App und hat einen initialen Vercel-/Supabase-Infrastrukturpfad. Es gibt noch keine ausgereifte Deployment-Pipeline, keine eigene Domain, keine App-Persistenz ueber Supabase, keine echte Registrierung, keinen Sync zwischen Geraeten und keine externen LLM-Provider. Die vorhandenen Module sind darauf ausgelegt, diese Adapter spaeter gezielt zu ergaenzen, sobald Persistenz, Auth, KI-Provider und Job-Infrastruktur ausgebaut werden.

## Naechste sinnvolle Schritte

- Smoke-Tests fuer die wichtigsten Browser-Flows automatisieren.
- Accessibility-Pass fuer Review, Import und Settings durchfuehren.
- Fehlerfaelle fuer grosse oder ungueltige Importdaten in der UI haerten.
- App-Persistenz, Auth, Domain/Deployment-Pipeline, Supabase Storage und serverseitige KI-Jobs konkretisieren.
- FSRS-like Scheduler und Variant-Fallback mit echten Decks validieren.
- Datenportabilitaet mit Roundtrip-Fixtures absichern.
