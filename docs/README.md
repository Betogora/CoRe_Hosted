# Docs

## Leseseiten

| Seite | Zeigt | Erzeugt aus |
| --- | --- | --- |
| [Docs](index.html) | diesen Wegweiser | `README.md` |
| [Specs](specs.html) | je Funktion Absicht, Regeln und Entscheidungen, mit Schaubildern | `specs.md` |
| [Journeys](journeys.html) | die Kernjourneys mit Zweck, Schrittkette und verlinkter Akzeptanz | Kapitel „Kernjourneys“ von `specs.md` |
| [UI-Elements](ui-elements.html) | jede UI-Komponente und jedes Format genau einmal, als echte Komponente | `scripts/uiCatalogDemos.tsx`, `scripts/uiCatalogPatterns.html` |
| [Kartenbausteine](card-types.html) | alle Renderer-Fälle mit Erstellungsweg | dieselben Demos und CoRe-Modellhelfer |
| [KI-Eval](ai-eval.html) | den besten gemessenen Prompt je Anfragetyp und den Verlauf aller Läufe | `ai-eval.md`, `fixtures/ai-eval/ledger.json` |

Die Seiten lassen sich direkt öffnen oder über `npm run dev` unter
`http://127.0.0.1:5190/docs/index.html` lesen; sie laden nichts von außen.
`ui-elements.html?preview=<name>` öffnet echte Screens mit Beispieldaten als
Gerüst der Katalog-Browsertests.

## Welche Datei wofür

| Frage | Quelle | Gehört nicht hinein |
| --- | --- | --- |
| Was soll das Produkt tun und warum? | [`specs.md`](specs.md) | Oberflächendetails, Architektur, APIs, Messwerte, Runbooks, Roadmap ([Pflegeregel](specs.md#pflege-dieser-datei)) |
| Wie ist es gebaut, wem gehört was? | [`architecture.md`](architecture.md) | Produktstatus, Nachweise |
| Was ist heute da, was fehlt? | [`status.md`](status.md) | Verhalten (steht in den Specs), Planung |
| Was ist warum entschieden? | [`decisions.md`](decisions.md) | offene Schritte, Layoutregeln |
| Was ist als Nächstes zu tun? | [`todo.md`](todo.md) | Erledigtes |
| Wie wird getestet und geprüft? | [`test-portfolio.md`](test-portfolio.md) | Release-Abläufe |
| Welcher KI-Prompt ist gemessen, wie lief der Hillclimb? | [`ai-eval.md`](ai-eval.md) | Prompttexte (stehen im Code), offene Evals |
| Wie wird freigegeben, zurückgerollt, wiederhergestellt? | [`operations.md`](operations.md) | Testinventur, ausgefüllte Nachweise |
| Was lief auf Production, was waren die Meilensteine? | [`history.md`](history.md) | heutiger Vertrag, Arbeitsdetails (stehen in Commits) |
| Wie verhält sich Anki? | [`anki-format-analysis.md`](anki-format-analysis.md) | CoRes Übersetzung (steht in der Architektur) |
| Wie heißen Dateien? | [`file-naming-conventions.md`](file-naming-conventions.md) | – |

Technische Einstiege außerhalb von `docs/`:
[`AGENTS.md`](../AGENTS.md) (Regeln für Coding-Agenten),
[`src/ui/README.md`](../src/ui/README.md) (UI-Bausteine),
[`src/screens/README.md`](../src/screens/README.md) (Screen-Landkarte),
[`supabase/migrations/`](../supabase/migrations/20261030103636_kartenmodell_baseline.sql)
(Schemabaseline) und [`supabase/verify_schema_v1.sql`](../supabase/verify_schema_v1.sql)
(Struktur-, RLS- und Policy-Gate).

## Pflege

1. Eine Änderung nur in der Quelle ihrer Rolle vornehmen; andere Dokumente verlinken.
2. UI-Änderungen in den App-Quellen umsetzen und die betroffenen Demos in
   `scripts/uiCatalogDemos.tsx` bzw. `scripts/uiCatalogPatterns.html` mitziehen.
3. `npm run docs:build` erzeugt die Leseseiten, `npm run check:docs` prüft
   Quellenstand, Verweise, Journey-Regeln und die Zuordnung aller exportierten
   UI-Komponenten zu Demos. HTML-Dateien nie direkt bearbeiten.
4. Sichtbare Änderungen nach der
   [visuellen Pflichtmatrix](test-portfolio.md#visuelle-pflichtmatrix) ansehen;
   ein technischer Check ersetzt das nicht.

- Schaubilder stehen als `schaubild`-Codeblock im Markdown: `Titel:`, dann Zeilen aus Kästen als
  `Folge:` (mit Pfeilen) oder `Gruppe:` (nebeneinander), dazwischen `Pfeil:` nach unten. Ein Kasten ist
  `Titel | Detail`, wahlweise mit Ton davor (`[primär]`, `[erfolg]`, `[warnung]`, `[gefahr]`, `[info]`);
  `-> Text` beschriftet den nächsten Pfeil einer Folge.
- Erledigtes verschwindet aus `todo.md`; Details stehen in Commit und Pull
  Request, Production- und Datenbankschritte als Betriebsnachweis in `history.md`.
- Offene Gestaltungsvarianten werden per `visual-ab-review` als temporäre
  Vergleichsseite vorgelegt und danach gelöscht.
- Historische Roadmaps, Audits und Zwischenstände bleiben nur in Git.
- `npm run mascots:build` erzeugt den lokalen Maskottchen-Vorrat unter
  `output/mascots/` (nicht im Repository); das App-Logo entsteht in `docs:build`.

## Wann ein ADR entsteht

Nur wenn alle drei Punkte zutreffen:

- Die Entscheidung betrifft mehrere Module oder Bereiche oder ist schwer umkehrbar (Datenmodell, Persistenz, Sicherheit, Anbieter, Kosten, Datenschutz).
- Ihr Grund steht weder im Code noch in den Specs, weil er Alternativen abwägt.
- Ohne Festhalten würde sie wahrscheinlich erneut diskutiert oder versehentlich umgekehrt.

Ändert sich eine Entscheidung, wird ihr Text aktualisiert; eine aufgehobene wird
gelöscht. Nummern bleiben stabil.
