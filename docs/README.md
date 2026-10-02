# CoRe – Docs

CoRe verbindet Anki-kompatible Karten mit Spaced Repetition und kontrollierten
KI-Umformulierungen. Einstieg für Menschen und Modelle ist [index.html](index.html).
Für jede Dokumentationsrolle gibt es genau eine verbindliche Quelle.

## Leseoberfläche

Die gemeinsamen Namen `index.html`, `specs.html`, `journeys.html` und
`ui-elements.html` entsprechen der SmarterNutrition-Dokumentation.

| Seite | Inhalt | Quelle |
| --- | --- | --- |
| [Docs](index.html) | Orientierung und Quellen | diese README |
| [Specs](specs.html) | vollständiger Produktvertrag | `specs.md` |
| [Journeys](journeys.html) | sieben Abläufe, Diagramme und sämtliche Akzeptanzregeln | Abschnitt 5 von `specs.md`; Ablaufdarstellung in `scripts/generateDocs.ts` |
| [UI-Elements](ui-elements.html) | interaktive Design-Arbeitsfläche, vollständiges UI-Inventar nach 18 Elementfamilien, Tokens, Typografie und Icons | App-Code; Demos in `scripts/uiCatalogDemos.tsx`, ergänzende Screen-Muster in `scripts/uiCatalogPatterns.html` |
| [Kartentypen](card-types.html) | sechs manuell erstellbare Formen im echten Reviewrenderer | dieselben Demos und CoRe-Modellhelfer |

Alle HTML-Seiten sind erzeugte Ausgaben. Die textlichen Inhalte, Katalogskripte,
Styles und Synonym-Fonts sind eingebettet; Journey-Diagramme nutzen `vendor/mermaid.min.js`.
Der Live-Katalog lädt Amulya über denselben Fontshare-Pfad wie die App; offline
greift deren Schriftfallback.
Zum Teilen den ganzen `docs`-Ordner mitnehmen. Die Seiten lassen sich direkt
öffnen oder über `npm run dev` unter `http://127.0.0.1:5190/docs/index.html` lesen.

## Pflege bei jeder Änderung

1. Produktverhalten in `specs.md`, technische Verträge in ihrer Rollenquelle ändern.
2. Designwünsche anhand der HTML-Referenz formulieren; danach in den angegebenen
   App-Quellen umsetzen. Gemeinsame UI-Änderungen aktualisieren ihre Live-Demo;
   lokale Screen-Muster zusätzlich ihre kuratierten Beispiele.
3. `npm run docs:build` erzeugt die fünf Leseseiten und die separate Design-Freigabe. `npm run check:docs` prüft
   Quellenstand, Dokumentverweise, Journey-Regeln und die vollständige Zuordnung
   exportierter UI-Komponenten zu Gruppen und Demos. `npm run typecheck` führt
   diesen Check ebenfalls aus. HTML-Ausgaben nie direkt bearbeiten.
4. Betroffene Demos, Zustände und App-Ansichten gemäß der
   [visuellen Pflichtmatrix](operations.md#visuelle-pflichtmatrix) ansehen.

Ein technischer Inventarcheck ersetzt keine visuelle Prüfung.

Die separate [Design-Freigabe](design-review.html) enthält Einstieg- und Meldungsvarianten A/B/C. Unbestätigte Vorschau-Styles gehören ausschließlich in `scripts/designReview.tsx`; Übernahme in App und UI-Katalog erfolgt erst nach der Auswahl. Architektur und weiteres Projektwissen bleiben ausschließlich in Markdown.

## Kanonische Rollen

| Rolle | Einzige Quelle | Enthält | Enthält ausdrücklich nicht |
| --- | --- | --- | --- |
| Produkt und Kernjourneys | [`specs.md`](specs.md) | Produktversprechen, Anforderungen, Kernjourneys, Beta-Abnahme | Implementierungsjournal, Architektur, APIs, Runbooks, Roadmap |
| Architektur und Invarianten | [`architecture.md`](architecture.md) | Modulgrenzen, Domäneninvarianten, persistierte Begriffe und implementierte APIs | Produktstatus, Release-Nachweise |
| Aktueller Status | [`status.md`](status.md) | heutiger verifizierter Ist-Stand und bekannte Lücken | historisch grüne Läufe, offene Planung |
| Betrieb und Runbooks | [`operations.md`](operations.md) | lokale Gates, Release, Smoke, Rollback, Auth, Restore und Störungen | ausgefüllte Release-Protokolle |
| Entscheidungen | [`decisions.md`](decisions.md) | angenommene oder abgelöste ADRs mit Status, Kontext, Entscheidung, Konsequenzen und Datum | offene Umsetzungsschritte |
| Verlauf | [`history.md`](history.md) | abgeschlossene Pakete, datierte Abnahmen, Release-IDs und Smoke-Protokolle | heutiger Vertrag, offene Roadmap |
| Offene Roadmap | [`todo.md`](todo.md) | ausschließlich offene Aufgaben, Gates und geparkte Themen | abgeschlossene Checklisten, Releasehistorie |

HTML-Ansichten ändern diese Zuständigkeiten nicht und sind keine zweite Quelle.

## Ergänzende Analysen und Nachweise

Diese Dokumente ergänzen die Rollenquellen, konkurrieren aber nicht mit ihnen:

- [`test-portfolio.md`](test-portfolio.md): ausführbare Testkategorien, Produktverträge und CI-/Release-Gates.
- [`anki-format-analysis.md`](anki-format-analysis.md): technische Referenz zu Anki/APKG, Templates, Medien und Learning Items.
- [`file-naming-conventions.md`](file-naming-conventions.md): Dateinamensregeln.
- [`ui-elements.html`](ui-elements.html): direkt aus produktiven Komponenten erzeugte Demos plus klar gekennzeichnete lokale Screen-Muster.
- [`card-types.html`](card-types.html): interaktive Referenz für Basic, Basic mit Bildern, Basic umgekehrt, Lückentext, Single Choice und Multiple Choice.

## Technische Einstiegspunkte

- [`../AGENTS.md`](../AGENTS.md): Arbeitsregeln, Architekturgrenzen und Validierung für Coding-Agenten.
- [`../src/screens/README.md`](../src/screens/README.md): Screen-Landkarte.
- [`../supabase/migrations/20260817190000_prerelease_replica_v2_baseline.sql`](../supabase/migrations/20260817190000_prerelease_replica_v2_baseline.sql): einzige frische Pre-Release-Schemabaseline.
- [`../supabase/verify_schema_v1.sql`](../supabase/verify_schema_v1.sql): ausführbares Struktur-, RLS- und Policy-Gate.

## Inventarregeln

- `docs/todo.md` ist die einzige TODO-Markdown-Datei.
- Neue offene Arbeit wird nur dort eingetragen.
- Abgeschlossene Arbeit wird aus dem TODO entfernt und datiert in `history.md` dokumentiert.
- Historische Roadmaps, Audits und Recherchezwischenstände bleiben über Git erhalten und werden nicht als parallele Dokumente fortgeführt.
- Eine Vertragsänderung wird nur in der Quelle ihrer Rolle vorgenommen; andere Dokumente verlinken darauf.
- Abgelöste Entscheidungen und datierte Nachweise bleiben als solche gekennzeichnet; sie definieren keinen heutigen Produktvertrag.
