---
name: ai-eval
description: Führt einen Lauf des KI-Evals aus – Antworten erzeugen, Richtertabelle bewerten lassen, auswerten und ins Ledger eintragen. Verwenden, wenn ein KI-Prompt gemessen, eine Baseline erhoben, eine Hillclimb-Runde ausgewertet oder der Richter kalibriert werden soll.
---

# KI-Eval

Ablage und Ledger-Format stehen in `docs/ai-eval.md`, die Regeln in ADR-049. Jeder Schritt ist ein Befehl; denke dir keine Zwischenschritte aus und ändere keine Dateien in `output/ai-eval/` von Hand.

Der Lauf kostet Geld. Starte `generate` ohne `--dry` nur, wenn der Nutzer den Lauf verlangt hat, und nenne vorher Anfragetyp, Fallzahl und Wiederholungen.

## Ein Lauf

`<typ>` ist ein Anfragetyp aus `npm run ai-eval` (ohne Argumente), `<name>` ein Laufname aus Kleinbuchstaben, Ziffern, Punkt und Bindestrich, üblich `<datum>-<promptversion>`.

1. `npm run ai-eval -- cases <typ>` – schreibt die Aufteilung neuer Fälle fest und zeigt die Fallzahlen.
2. `npm run ai-eval -- generate <typ> --run <name>` – erzeugt die Antworten auf dem Testteil. Meldet der Befehl offene Antworten, denselben Befehl wiederholen; vorhandene Antworten bleiben.
3. `npm run ai-eval -- table <typ> --run <name>` – schreibt `judge-table.json` in den Laufordner.
4. Den Subagenten `eval-judge` mit genau diesem Auftrag starten: „Bewerte `output/ai-eval/<typ>/<name>/judge-table.json`.“ Er schreibt `judge-verdicts.json` daneben. Gib ihm keine weiteren Hinweise und bewerte nicht selbst.
5. `npm run ai-eval -- score <typ> --run <name>` – prüft Vollständigkeit und zeigt den Bericht. Für den ersten Lauf eines Anfragetyps und für jeden Neustart der Reihe `--baseline` anhängen.
6. Bericht dem Nutzer zeigen. Erst auf seine Zustimmung denselben Befehl mit `--record` und bei einer Runde mit `--change "<die eine Änderung in einem Satz>"` wiederholen, danach `npm run docs:build`.

Meldet `score` unvollständige Urteile, den Richter mit demselben Auftrag erneut starten. Verweigert `--record` den Eintrag, die Meldung dem Nutzer nennen und nichts umgehen.

## Eine Runde

Eine Runde ändert genau eine Sache an Prompt, Werkzeugschema, Reasoning, Ausgabegrenze oder Modell der Route und erhöht die Promptversion im Vertragsmodul. Die Idee kommt aus Fehlern des Trainingsteils (`generate … --split train` mit eigenem Laufnamen), gemessen wird am Testteil. Lautet die Entscheidung `rejected`, die Änderung im Code zurücknehmen; der Ledger-Eintrag bleibt.

## Kalibrierung des Richters

Handurteile stehen in `fixtures/ai-eval/<typ>.labels.json`.

1. `npm run ai-eval -- calibration-table <typ>`
2. `eval-judge` mit „Bewerte `output/ai-eval/<typ>/calibration/judge-table.json`.“ starten.
3. `npm run ai-eval -- calibration-score <typ>` – zeigt Übereinstimmung, Kappa und jede Abweichung. Mit `--record` ins Ledger eintragen, sobald der Nutzer zustimmt.

## Trockenlauf

`generate … --dry` erzeugt nachgebildete Antworten ohne Schlüssel und Kosten; `score` wertet ihn ohne Richter aus. Ein Trockenlauf kommt nie ins Ledger.
