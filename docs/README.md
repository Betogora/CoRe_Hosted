# CoRe — Content Repetition

CoRe ist ein Web-MVP für eine Lernplattform, die klassische Spaced-Repetition-Karten um inhaltliche Varianten erweitert. Lernende sollen Wissen auch bei veränderter Fragestellung abrufen und den Ursprung nach der Antwort prüfen können.

Die kanonische [Dokumentenlandkarte](index.md) trennt Produktvertrag, Architektur, Status, Betrieb, Entscheidungen, Verlauf und offene Roadmap. Diese README ist nur Projektüberblick und Startanleitung.

## Lokaler Start

```powershell
npm install
npm run dev
```

Die lokale URL ist `http://127.0.0.1:5190/`.

## Tech Stack

- Vite und React 19
- TypeScript
- Tailwind CSS
- Node.js `node:test` und Playwright
- Supabase Auth, Postgres und Storage
- Vercel für SPA und `/api/*`-Routen

## Wichtige Scripts

```powershell
npm run dev                 # lokale Entwicklung
npm run typecheck           # TypeScript und Type-Policy
npm test                    # Unit-, Contract- und Integrationstests
npm run test:e2e            # Playwright
npm run test:rls:local      # lokales Schema-/RLS-Gate
npm run test:e2e:local      # vollständige lokale Browser-/Datenbankabnahme
npm run test:release        # vollständiges Release-Gate
npm run build               # Production-Build und Chunk-Gate
npm run preview             # lokale Production-Preview
```

Details zu Kategorien und Frequenzen stehen in [`test-portfolio.md`](test-portfolio.md), der manuelle Releaseablauf in [`operations.md`](operations.md).

## Produkt in Kürze

Der Beta-Kern umfasst Account, leeren Erstkontakt, Erstellen und Importieren, Kartenstapelverwaltung, Lernen mit vier Bewertungen und Content-Repetition, Statistik, Einstellungen sowie accountgebundene Speicherung und Syncstatus.

Chat-your-Deck, Lernplan, lokaler Entwurfsassistent, Deck-Graph, Community-Demo, externer Varianten-JSON-Flow, AI-Job-Historie und erweiterte APKG-Diagnose sind Labs. Nicht abgenommene Hosted-, Großdatei-, Community-, KI- und Account-Lifecycle-Pfade bleiben deaktiviert.

Der verbindliche Umfang steht ausschließlich in [`specs.md`](specs.md), der aktuelle Implementierungsstand ausschließlich in [`status.md`](status.md).

## Projektstruktur

```text
api/             Vercel-Serverrouten und serverseitige Verträge
docs/            kanonische Dokumentation und Analysen
fixtures/        deterministische Test- und Importdaten
scripts/         Test-, Build-, Datenbank- und Benchmarkwerkzeuge
src/             App-Shell, Screens, UI und Domänenmodule
supabase/        Schemaanker, Migrationen, Policies und Verify-SQL
tests/           E2E- und RLS-Szenarien
trigger/         vorbereitete serverseitige APKG-Aufgaben
```

Für Coding-Agenten gilt zuerst [`../AGENTS.md`](../AGENTS.md). Die UI-Landkarte liegt in [`../src/screens/README.md`](../src/screens/README.md).

## Dokumentation

- [Dokumentenlandkarte](index.md)
- [Produktvertrag](specs.md) und [HTML-Spiegelung](specs.html)
- [Architektur und Invarianten](architecture.md)
- [aktueller Status](status.md)
- [Betrieb und Runbooks](operations.md)
- [Entscheidungen](decisions.md)
- [Verlauf](history.md)
- [offene Roadmap](todo.md)

Es gibt genau eine TODO-Markdown-Datei: `docs/todo.md`.
