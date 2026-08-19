# CoRe-Dokumentenlandkarte

Diese Datei ist der Einstieg in die Projektdokumentation. Für jede kanonische Rolle gibt es genau eine Quelle.

## Kanonische Rollen

| Rolle | Einzige Quelle | Enthält | Enthält ausdrücklich nicht |
| --- | --- | --- | --- |
| Produkt und Kernjourneys | [`specs.md`](specs.md) | Produktversprechen, Anforderungen, Kernjourneys, Beta-Abnahme | Implementierungsjournal, Architektur, APIs, Runbooks, Roadmap |
| Architektur und Invarianten | [`architecture.md`](architecture.md) | Modulgrenzen, Domäneninvarianten, Compatibility-/Zielmodell, implementierte und geplante APIs | Produktstatus, Release-Nachweise |
| Aktueller Status | [`status.md`](status.md) | heutiger verifizierter Ist-Stand und bekannte Lücken | historisch grüne Läufe, offene Planung |
| Betrieb und Runbooks | [`operations.md`](operations.md) | lokale Gates, Release, Smoke, Rollback, Auth, Restore und Störungen | ausgefüllte Release-Protokolle |
| Entscheidungen | [`decisions.md`](decisions.md) | angenommene oder abgelöste ADRs mit Status, Kontext, Entscheidung, Konsequenzen und Datum | offene Umsetzungsschritte |
| Verlauf | [`history.md`](history.md) | abgeschlossene Pakete, datierte Abnahmen, Release-IDs und Smoke-Protokolle | heutiger Vertrag, offene Roadmap |
| Offene Roadmap | [`todo.md`](todo.md) | ausschließlich offene Aufgaben, Gates und geparkte Themen | abgeschlossene Checklisten, Releasehistorie |

[`specs.html`](specs.html) ist ausschließlich die generierte HTML-Spiegelung von `specs.md` und keine eigene Quelle. Für die anderen Rollen werden keine HTML-Spiegelungen gepflegt.

## Ergänzende Analysen und Nachweise

Diese Dokumente ergänzen die Rollenquellen, konkurrieren aber nicht mit ihnen:

- [`test-portfolio.md`](test-portfolio.md): ausführbare Testkategorien, Produktverträge und CI-/Release-Gates.
- [`anki-format-analysis.md`](anki-format-analysis.md): technische Referenz zu Anki/APKG, Templates, Medien und Learning Items.
- [`file-naming-conventions.md`](file-naming-conventions.md): Dateinamensregeln.
- [`ui-elements.html`](ui-elements.html): teilbarer, fachlich kuratierter und technisch mit den kanonischen UI-Quellen synchronisierter visueller Elementkatalog.
- [`card-types.html`](card-types.html): responsive Referenz der Reviewansichten für Basic, Basic umgekehrt, Lückentext und Multiple Choice.

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
- Frühere Sammelabschnitte aus `specs.md` werden über Abschnitt 11 der Spezifikation eindeutig auf ihre neue Quelle verwiesen.
