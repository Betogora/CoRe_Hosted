# KI-Eval

Stand der per Hillclimb gemessenen KI-Prompts. Grundsätze stehen in
[ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis), offene
Arbeit unter [P5](todo.md#p5-ki-eval-und-hillclimb). Bestand, Verlauf und
Bilanz entstehen beim Erzeugen aus dem Ledger; die Prompttexte stehen nur im
Code.

## Bestand

Eine Zeile je Anfragetyp: der Prompt im Code und der beste gemessene Stand am
Entscheidungsteil, dazu die Messung am Rückhalt mit derselben Promptversion.
Weicht der Prompt im Code vom besten Stand ab, ist er nicht gemessen.

## Verlauf

Hauptwert auf dem Entscheidungsteil je Lauf. Ein Lauf ist eine Baseline oder
eine Runde mit genau einer Änderung; Messungen am Rückhalt gehören zu keiner
Reihe.

## Bilanz

Was das Experiment bisher gekostet hat: Läufe, Antworten, Kosten, neu
bewertete Einträge und der Anteil der Einträge aus dem Urteilscache, je Anfragetyp mit
Baseline, bestem Stand und Ziel.

## Ablauf

Ein Lauf besteht aus fünf Befehlen von `npm run ai-eval`; die Schrittfolge für
Agenten steht im Skill [`ai-eval`](../.agents/skills/ai-eval/SKILL.md).

| Schritt | Befehl | Ergebnis |
| --- | --- | --- |
| Fälle | `cases <typ>` | schreibt die Aufteilung neuer Fälle fest: je Kategorie 40 % Training (`train`), 30 % Entscheidung (`dev`), 30 % Rückhalt (`holdout`), Fälle derselben `group` im selben Teil; `--corpus <n>` zieht Korpuskarten mit festem Startwert, gruppiert nach Notiz |
| Erzeugen | `generate <typ> --run <name>` | je Fall zwei Antworten (`--repetitions`) auf dem Entscheidungsteil (`--split`) über Payload-Builder und Antwortprüfung der Route, `--concurrency` parallel (Vorgabe 4), bis `--budget` USD (Vorgabe 1); `--candidate <name>` ersetzt den Payload; ein zweiter Aufruf setzt fort |
| Blöcke | `table <typ> --run <name>` | Richterblöcke ohne Dubletten und ohne Herkunft, gemischt, mit Kontrolleinträgen und Doppeln |
| Richten | je Block ein Subagent [`eval-judge`](../.claude/agents/eval-judge.md) | Urteil und Sicherheit je Eintrag und Kriterium |
| Auswerten | `score <typ> --run <name> --judge <modell>` | Bericht und Grenzfälle; am Entscheidungsteil die Entscheidung; mit `--record` der Ledger-Eintrag und die Ergebnisdatei |

- Jede Anfrage endet als angenommene Antwort, als Ablehnung des Falls durch das
  Modell (bei Varianten „nicht umformulierbar“), als von der Route verworfene
  Antwort oder als Zeitüberschreitung. Verworfene Antworten und
  Zeitüberschreitungen bestehen nur das Vertragskriterium nicht; eine
  Ablehnung besteht das Ablehnungskriterium (M7), wenn der Fall sie mit
  `refuse: true` erwartet. Nur angenommene Antworten auf Fälle ohne
  `refuse` gehen an automatische Prüfungen und Richter. Der Hauptwert zählt
  alle Antworten.
- Ratenlimit und Anbieterfehler werden mit wachsender Wartezeit bis zu fünfmal
  versucht; was danach scheitert, bleibt offen und wird beim nächsten Aufruf
  wiederholt. Schlüssel-, Limit- und Endpunktfehler halten den Lauf an.
- Ein Kandidat ist ein Modul `<typ>/candidates/<name>.ts` im Datenordner,
  dessen Standardexport den gebauten Payload ändert (Prompt, Werkzeugschema,
  Ausgabegrenze, Reasoning, Modell); die Antwortprüfung bleibt die der Route.
  Jeder Lauf hält den Fingerabdruck seiner Payloads fest; ein geänderter
  Payload setzt ihn nicht fort.
- Ein Block hat höchstens 25 Einträge und etwa 12.000 Zeichen, je Block urteilt
  ein frischer Richter. Ab zwei Blöcken steht ein Zehntel der Einträge
  (mindestens zehn) ein zweites Mal in einem anderen Block, zusätzlich zu
  dessen Einträgen; der Anteil gekippter Urteile ist das Rauschen des Richters.
  `grenzfaelle.md` im Laufordner zeigt je Kriterium bis zu drei Grenzfälle:
  gekippte Urteile, dann die mit der geringsten Sicherheit. Sie enthält Ein-
  und Ausgaben und ist für den Nutzer; der Bericht selbst nennt nur
  Kennzahlen.
- Ein Urteil gilt für Richterauftrag, Bogen, Eingabe und Ausgabe und landet im
  Urteilscache `<typ>/judge-cache.json`; dieselbe Ausgabe bekommt in späteren
  Läufen dasselbe Urteil ohne Richter. Ein anderer Richterauftrag oder Bogen
  ändert den Fingerabdruck des Richters, und die Reihe beginnt mit einer neuen
  Baseline.
- `score` entscheidet eine Runde selbst: übernommen, wenn der gepaarte Abstand
  zum Bestand über dem Rauschen liegt (mit `--simplify` für Kürzungen: nicht
  messbar schlechter), kein kritisches Kriterium schlechter wird und Kosten je
  Antwort und Latenz p90 höchstens das 1,2-Fache betragen. Fallen (`trap`)
  zählt der Bericht getrennt.
- Ins Ledger kommen Läufe auf dem Entscheidungsteil und Messungen am Rückhalt.
  Eine Baseline, eine Übernahme und eine Messung am Rückhalt trägt `--record`
  nur ein, wenn der Code der Route denselben Payload baut wie der Lauf; ein
  übernommener Kandidat muss also zuerst in die Route. Ein Kontrolleintrag, den
  der Richter bei einem kritischen Kriterium fälschlich bestehen lässt,
  verhindert den Eintrag, und seine Urteile kommen nicht in den Cache.
- `generate --dry` erzeugt nachgebildete Antworten ohne Schlüssel und Kosten;
  ein Trockenlauf kommt nie ins Ledger.

Eine Kalibrierung ist nicht vorgesehen, aber möglich: `calibration-table
<typ>`, dann die Richter, dann `calibration-score <typ> --judge <modell>`.
Handurteile mit `control: true` laufen als Kontrolleinträge in jedem Lauf mit.

## Ablage

| Ort | Inhalt | In Git |
| --- | --- | --- |
| `scripts/aiEval/definitions.ts` | je Anfragetyp: Route, Kriterien, Bewertungsbogen, Hauptwert | ja |
| `scripts/aiEval/ledger.ts` | Register der Anfragetypen mit Ziel und kritischen Kriterien, Ledger-Prüfung | ja |
| `scripts/aiEval/` sonst | `cases.ts`, `generate.ts`, `judge.ts`, `score.ts`, `cli.ts` für die Schritte, `page.ts` für diese Seite | ja |
| `fixtures/ai-eval/<typ>.cases.json` | von Hand geschriebene Prüfkarten mit Kategorie, Aufteilung und optional `group`, `trap` (Falle für ein kritisches Kriterium) und `refuse` | ja |
| `fixtures/ai-eval/<typ>.labels.json` | Handurteile der Kalibrierung und Kontrolleinträge | ja |
| `fixtures/ai-eval/ledger.json` | ein Eintrag je Lauf und je Kalibrierung, nur Kennzahlen | ja |
| `fixtures/ai-eval/results/<typ>/<lauf>.json` | Ergebnis je Antwort eines eingetragenen Laufs ohne Inhalte; der gepaarte Vergleich liest den Bestand von hier | ja |
| `$CORE_AI_EVAL_DIR/<typ>/`, sonst `output/ai-eval/<typ>/` | Korpusfälle, Kandidaten, Urteilscache und je Lauf ein Ordner mit Antworten samt Transkript, Richterblöcken, Urteilen und Bericht | nein |

Ein neuer Anfragetyp ist ein Eintrag in `REQUEST_TYPES` und eine Definition in
`definitions.ts`; seine Promptversion liest das Register aus dem Vertragsmodul
der Route.

## Ledger

`runs` und `calibrations` in `fixtures/ai-eval/ledger.json` wachsen um einen
Eintrag je Lauf und je Kalibrierung. Die Reihenfolge im Ledger ist die
Reihenfolge der Läufe. `npm run check:docs` prüft Form und Reihenfolge.

| Feld eines Laufs | Bedeutung |
| --- | --- |
| `requestType`, `run`, `date`, `split` | Anfragetyp aus dem Register, Name des Laufordners im Datenordner unter `<typ>/`, Tag des Laufs, `dev` oder `holdout` |
| `promptVersion`, `candidate`, `fingerprint` | Promptversion (bei Baseline, Übernahme und Rückhalt die des Codes), Kandidatendatei oder `null`, Fingerabdruck des Payloads |
| `model`, `reasoning` | angefragtes Modell, Reasoning-Stufe |
| `change` | die eine Änderung dieser Runde in einem Satz |
| `decision` | `baseline` beginnt eine Reihe und setzt den Bestand neu, `accepted` wird Bestand, `rejected` nicht, `holdout` ist eine Messung am Rückhalt |
| `cases`, `repetitions` | Fälle und Wiederholungen je Fall |
| `main`, `low`, `high` | Hauptwert als Anteil mit 95 %-Intervall, per Bootstrap über Fälle |
| `criteria` | Anteil bestandener Antworten je Kriterium; die kritischen Kriterien des Anfragetyps sind Pflicht |
| `outcomes` | Antworten je Klasse: angenommen, abgelehnt, verworfen, Zeitüberschreitung |
| `traps` | Antworten auf Fallen und davon Fehler bei kritischen Kriterien |
| `costUsd`, `costTotalUsd`, `latencyP90Ms` | Kosten je Antwort und im Lauf, Latenz im 90. Perzentil |
| `judge` | Richtermodell, Fingerabdruck von Auftrag und Bogen, neu bewertete Einträge und Einträge aus dem Cache (ohne Kontrolleinträge), Rauschen je Kriterium |
| `comparison` | nur bei Runden, gepaart auf den gemeinsamen Fällen mit dem Bestand: `noise` als halbe Breite des 95 %-Intervalls des Abstands, `gained` und `lost` als gewonnene und verlorene Fälle |

| Feld einer Kalibrierung | Bedeutung |
| --- | --- |
| `requestType`, `date`, `judge` | Anfragetyp, Tag, Richtermodell |
| `entries` | von Hand bewertete Einträge |
| `agreement` | Übereinstimmung von Richter und Handurteil bei den kritischen Kriterien |
| `falsePasses` | Einträge, die der Richter bei einem kritischen Kriterium bestehen ließ, das Handurteil nicht |
