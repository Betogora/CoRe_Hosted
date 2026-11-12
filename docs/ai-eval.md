# KI-Eval

Stand der per Hillclimb gemessenen KI-Prompts. Grundsätze stehen in
[ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis), offene
Arbeit unter [P5](todo.md#p5-ki-eval-und-hillclimb). Bestand und Verlauf
entstehen beim Erzeugen aus dem Ledger; die Prompttexte stehen nur im Code.
Der Runner ist Bauvorleistung: Bis P5 beginnt, bleibt das Ledger leer.

## Bestand

Eine Zeile je Anfragetyp: der Prompt im Code und der beste gemessene Stand.
Weicht beides voneinander ab, ist der Prompt im Code nicht gemessen.

## Verlauf

Hauptwert auf dem Testteil je Lauf. Ein Lauf ist eine Baseline oder eine Runde
mit genau einer Änderung.

## Ablauf

Ein Lauf besteht aus fünf Befehlen von `npm run ai-eval`; die Schrittfolge für
Agenten steht im Skill [`ai-eval`](../.agents/skills/ai-eval/SKILL.md).

| Schritt | Befehl | Ergebnis |
| --- | --- | --- |
| Fälle | `cases <typ>` | schreibt die Aufteilung neuer Fälle in Training und Test fest, je Kategorie hälftig; `--corpus <n>` zieht Korpuskarten mit festem Startwert |
| Erzeugen | `generate <typ> --run <name>` | je Fall drei Antworten über Payload-Builder und Antwortprüfung der Route, höchstens vier parallel; ein zweiter Aufruf setzt fort |
| Tabelle | `table <typ> --run <name>` | Richtertabelle ohne Dubletten, gemischt, ohne Herkunft, mit den Kontrolleinträgen |
| Richten | Subagent [`eval-judge`](../.claude/agents/eval-judge.md) | Urteile je Eintrag und Kriterium |
| Auswerten | `score <typ> --run <name>` | Bericht; mit `--record` der Ledger-Eintrag |

- Ein Kriterium besteht, wenn seine automatische Prüfung und sein Richterurteil
  bestehen. Lehnt die Antwortprüfung der Route eine Antwort ab, fällt nur das
  Vertragskriterium durch; die übrigen Kriterien zählen über die gültigen
  Antworten. Der Hauptwert zählt alle Antworten.
- Anbieter- und Netzfehler sind keine Antwort: Sie bleiben offen und werden
  beim nächsten Aufruf wiederholt.
- `score` entscheidet eine Runde selbst: übernommen, wenn der Abstand zum
  Bestand über dem Rauschen liegt und kein kritisches Kriterium schlechter ist.
- Ins Ledger kommt ein Lauf nur vom Testteil, mit kalibriertem Richter und
  ohne fälschlich bestandenen Kontrolleintrag bei einem kritischen Kriterium.
- `generate --dry` erzeugt nachgebildete Antworten ohne Schlüssel und Kosten;
  ein Trockenlauf kommt nie ins Ledger.

Die Kalibrierung vergleicht den Richter mit den Handurteilen:
`calibration-table <typ>`, dann der Richter, dann `calibration-score <typ>`.
Handurteile mit `control: true` laufen als Kontrolleinträge in jeder
Richtertabelle mit.

## Ablage

| Ort | Inhalt | In Git |
| --- | --- | --- |
| `scripts/aiEval/definitions.ts` | je Anfragetyp: Route, Kriterien, Bewertungsbogen, Hauptwert | ja |
| `scripts/aiEval/ledger.ts` | Register der Anfragetypen mit Ziel und kritischen Kriterien, Ledger-Prüfung | ja |
| `scripts/aiEval/` sonst | `cases.ts`, `generate.ts`, `judge.ts`, `score.ts`, `cli.ts` für die Schritte, `page.ts` für diese Seite | ja |
| `fixtures/ai-eval/<typ>.cases.json` | von Hand geschriebene Prüfkarten mit Kategorie und Aufteilung | ja |
| `fixtures/ai-eval/<typ>.labels.json` | Handurteile der Kalibrierung und Kontrolleinträge | ja |
| `fixtures/ai-eval/ledger.json` | ein Eintrag je Lauf und je Kalibrierung, nur Kennzahlen | ja |
| `output/ai-eval/<typ>/` | Korpusfälle und je Lauf ein Ordner mit Antworten samt Transkript, Richtertabelle, Urteilen und Bericht | nein |

Ein neuer Anfragetyp ist ein Eintrag in `REQUEST_TYPES` und eine Definition in
`definitions.ts`; seine Promptversion liest das Register aus dem Vertragsmodul
der Route.

## Ledger

`runs` und `calibrations` in `fixtures/ai-eval/ledger.json` wachsen um einen
Eintrag je Lauf und je Kalibrierung. Die Reihenfolge im Ledger ist die
Reihenfolge der Läufe. `npm run check:docs` prüft Form und Reihenfolge.

| Feld eines Laufs | Bedeutung |
| --- | --- |
| `requestType`, `run`, `date` | Anfragetyp aus dem Register, Name des Laufordners unter `output/ai-eval/<typ>/`, Tag des Laufs |
| `promptVersion`, `model`, `reasoning` | gemessene Promptversion, angefragtes Modell, Reasoning-Stufe |
| `change` | die eine Änderung dieser Runde in einem Satz |
| `decision` | `baseline` beginnt eine Reihe und setzt den Bestand neu, `accepted` wird Bestand, `rejected` nicht |
| `cases`, `repetitions` | Testfälle und Wiederholungen je Fall |
| `main`, `low`, `high` | Hauptwert als Anteil mit 95 %-Intervall, per Bootstrap über Fälle |
| `criteria` | Anteil bestandener Antworten je Kriterium; die kritischen Kriterien des Anfragetyps sind Pflicht |
| `costUsd`, `latencyP90Ms` | Kosten je Antwort, Latenz im 90. Perzentil |
| `comparison` | nur bei Runden, gepaart auf den gemeinsamen Fällen mit dem Bestand: `noise` als halbe Breite des 95 %-Intervalls des Abstands, `gained` und `lost` als gewonnene und verlorene Fälle |

| Feld einer Kalibrierung | Bedeutung |
| --- | --- |
| `requestType`, `date`, `judge` | Anfragetyp, Tag, Richtermodell |
| `entries` | von Hand bewertete Einträge |
| `agreement` | Übereinstimmung von Richter und Handurteil bei den kritischen Kriterien |
| `falsePasses` | Einträge, die der Richter bei einem kritischen Kriterium bestehen ließ, das Handurteil nicht |
