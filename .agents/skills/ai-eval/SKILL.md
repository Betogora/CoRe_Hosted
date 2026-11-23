---
name: ai-eval
description: Führt einen Lauf des KI-Evals aus – Antworten erzeugen, Richtertabelle bewerten lassen, auswerten und ins Ledger eintragen. Verwenden, wenn ein KI-Prompt gemessen, eine Baseline erhoben, eine Hillclimb-Runde ausgewertet oder der Richter kalibriert werden soll.
---

# KI-Eval

Ablage und Ledger-Format stehen in `docs/ai-eval.md`, die Regeln in ADR-049. Jeder Schritt ist ein Befehl; denke dir keine Zwischenschritte aus und ändere keine Dateien im Datenordner (`CORE_AI_EVAL_DIR`, sonst `output/ai-eval/`) von Hand, außer Kandidatendateien.

Der Lauf kostet Geld. Nenne vor jedem `generate` ohne `--dry` Anfragetyp, Fallzahl, Wiederholungen und erwartete Kosten. Solange das Limit des Schlüssels reicht, braucht ein Lauf keine Einzelfreigabe; hält es an (`provider_budget_exhausted`), frag den Nutzer, ob er es erhöht.

## Ein Lauf

`<typ>` ist ein Anfragetyp aus `npm run ai-eval` (ohne Argumente), `<name>` ein Laufname aus Kleinbuchstaben, Ziffern, Punkt und Bindestrich, üblich `<datum>-<promptversion>` oder `<datum>-<kandidat>`.

1. `npm run ai-eval -- cases <typ>` – schreibt die Aufteilung neuer Fälle fest und zeigt die Fallzahlen.
2. `npm run ai-eval -- generate <typ> --run <name>` – erzeugt die Antworten auf dem Entscheidungsteil (`dev`), höchstens für `--budget` USD (Vorgabe 1). Meldet der Befehl offene Antworten, denselben Befehl wiederholen; vorhandene Antworten bleiben.
3. `npm run ai-eval -- table <typ> --run <name>` – schreibt die Richterblöcke und nennt je Block den Auftrag. Antworten mit Urteil im Cache brauchen keinen Richter.
4. Je Block einen Subagenten `eval-judge` mit genau dem genannten Auftrag „Bewerte `<Pfad>`.“ starten, höchstens sechs gleichzeitig. Gib ihnen keine weiteren Hinweise und bewerte nicht selbst.
5. `npm run ai-eval -- score <typ> --run <name> --judge claude-opus-5-5` – prüft Vollständigkeit, füllt den Urteilscache und zeigt den Bericht. Für den ersten Lauf eines Anfragetyps und für jeden Neustart der Reihe `--baseline` anhängen.
6. Dem Nutzer Hauptwert und Entscheidung nennen und die Datei `grenzfaelle.md`, die `score` nennt, als Link geben. Bei Läufen auf dem Entscheidungsteil oder dem Rückhalt liest du sie nicht selbst. Dann denselben Befehl mit `--record` (bei einer Runde mit `--change "<die eine Änderung in einem Satz>"`) und danach `npm run docs:build`.

Nennt `score` fehlende Blöcke, nur für diese den Richter erneut starten; `table` nicht erneut ausführen. Verweigert `--record` den Eintrag, die Meldung dem Nutzer nennen und nichts umgehen.

## Eine Runde

Eine Runde misst Kandidaten gegen den Bestand. Ein Kandidat ist eine Datei `<Datenordner>/<typ>/candidates/<name>.ts`, deren Standardexport den gebauten Payload der Route ändert, ohne den Code der Route anzufassen:

```ts
export default (payload: any) => ({ ...payload, reasoning: { effort: "medium" } });
```

1. Fehler des Trainingsteils lesen (`generate … --split train` mit eigenem Laufnamen, dann `table`, `score` und `grenzfaelle.md` sowie die Antworten im Laufordner), die drei häufigsten Muster benennen. Ein Lauf auf dem Trainingsteil entscheidet nichts und kommt nicht ins Ledger.
2. Drei bis fünf Kandidaten schreiben, jeder mit genau einem Hebel gegen ein Muster, und am Trainingsteil mit `--candidate <name>` vorauswählen.
3. Höchstens zwei Kandidaten am Entscheidungsteil messen (`generate … --candidate <name>`, `table`, `score`; `--simplify` bei einer Kürzung oder niedrigerem Reasoning). Antworten des Entscheidungsteils nicht lesen, nur Bericht und Kennzahlen.
4. Lautet die Entscheidung `rejected`, mit `--record --change "…"` eintragen und den Kandidaten liegen lassen. Lautet sie `accepted`, den Kandidaten in die Route übernehmen, die Promptversion im Vertragsmodul erhöhen und erst dann `--record --change "…"`; `--record` prüft, dass der Code denselben Payload baut.

Den Rückhalt (`--split holdout`) misst du nur zur Baseline und am Ende einer Reihe, mit `--record`, und liest seine Antworten nicht.

## Kalibrierung des Richters

Nur auf Wunsch des Nutzers. Handurteile stehen in `fixtures/ai-eval/<typ>.labels.json`.

1. `npm run ai-eval -- calibration-table <typ>`
2. Je Block `eval-judge` mit dem genannten Auftrag starten.
3. `npm run ai-eval -- calibration-score <typ> --judge claude-opus-5-5` – zeigt Übereinstimmung, Kappa und jede Abweichung. Mit `--record` ins Ledger eintragen, sobald der Nutzer zustimmt.

## Trockenlauf

`generate … --dry` erzeugt nachgebildete Antworten ohne Schlüssel und Kosten; `score` wertet ihn ohne Richter aus. Ein Trockenlauf kommt nie ins Ledger.
