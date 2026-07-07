# CoRe Documentation

Diese Datei ist die Dokumentationskarte fuer CoRe. Die Root-Ebene bleibt bewusst schlank; `AGENTS.md` bleibt dort, damit Coding-Agenten die Projektregeln automatisch finden.

## Maintained Documentation

- `README.md`: Projektueberblick, lokaler Start, Scripts und Struktur.
- `specs.md`: kanonische Produkt- und Engineering-Spezifikation.
- `specs.html`: generierte HTML-Fassung von `specs.md`.
- `todo.md`: priorisierter Gap-Backlog vom lokalen MVP zum produktionsfaehigen Produkt.
- `anki-format-analysis.md`: Analyse des offiziellen Anki-Datei- und Kartenmodells mit CoRe-Prioritaeten.

## Technical Anchors Outside Documentation

- `../AGENTS.md`: lokale Entwicklungsregeln, Architekturleitplanken und Verifikationskommandos.
- `../supabase/core_schema_v1.sql`: aktueller Supabase/Postgres-Schemaanker.
- `../supabase/verify_schema_v1.sql`: Verify-Queries fuer RLS- und Policy-Praesenz.

## Production Path Notes

Die Hinweise aus dem externen Hosting-/Database-/KI-Guide wurden am 2026-07-07 in `specs.md` und `todo.md` uebernommen. Der alte Guide soll nicht als zweite Wahrheit weitergefuehrt werden.

Relevante Zielrichtungen:

- Vercel fuer Hosting, Preview/Production, Domain und `/api/*` Functions.
- Supabase Auth + Postgres + RLS als naheliegender Persistenzpfad.
- Echte Tabellen fuer Decks, Learning Items, Varianten, Review Events, Dokumente, Medienreferenzen und AI Jobs statt grossem Store-Blob.
- Supabase Storage/Object Storage fuer APKG-Medien, Dokumente und grosse Uploads.
- Eigene KI-Proxy-Routen fuer geheime Provider-Keys; Browser bekommt nur Drafts und nie Secrets.

## Current Local Architecture Notes

- `src/reviewService.js` ist der tiefe Review-Flow fuer FSRS-like Scheduling, Variant-Fallback und Next-Review-Projektionen.
- `src/reviewFlow.js` bleibt nur als Legacy-Fassade fuer bestehende Imports bestehen.
- `src/coreVariantService.js` buendelt Eligibility, Reifegrad, Readiness, Coverage, Variant-Generation-Plan und Fallback-Projektion hinter kleinen Interfaces.
- `src/App.jsx` ist nur noch App-Shell fuer Workspace-State, Navigation und Routing; produktnahe UI liegt in `src/screens/`.
- `src/screens/README.md` ist die Einstiegskarte fuer KI-Programmierung an Screens; geteilte UI-Bausteine liegen in `src/ui/`.
- Sichtbare Features sollen bei Ueberarbeitungen erhalten bleiben und nur durch explizite Prompts entfernt werden.
