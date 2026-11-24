# KI-Eval: Versuchsplan

Stand: 2026-11-23

Ausführungsplan für [P5](todo.md#p5-ki-eval-und-hillclimb): Befunde am
Runner, Versuchsaufbau und Arbeitspakete. Umfang, Reihenfolge und Gates
stehen nur in `todo.md`, Messwerte nur unter [KI-Eval](ai-eval.md). Die Datei
löst sich mit P5 auf: Gebautes wandert nach `ai-eval.md`, Entschiedenes nach
[ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis); mit
Paket J wird sie gelöscht.

## Festlegungen

Vom Nutzer am 2026-11-23 entschieden und bindend:

- **Generator:** nur OpenRouter mit dem lokalen Schlüssel `OPENROUTER_API_KEY`
  und seinem Limit (am 2026-11-23 etwa 3 EUR, wird bei Bedarf erhöht). Kein Modell aus
  einer Subscription als Generator.
- **Ein Modell:** Der Hillclimb läuft innerhalb des Referenzmodells
  `openai/gpt-6-luna`. Ein Modellvergleich folgt später von Hand und wird
  nicht eigens gebaut; eine Kandidatendatei kann das Modell ersetzen, das
  genügt dafür.
- **Richter:** Opus 5.5 als Subagent in Claude Code, ein Richter, je Block
  ein frischer Kontext.
- **Keine Handkalibrierung vorab.** Jeder Bericht zeigt je Kriterium die
  zwei bis drei am wenigsten eindeutigen Urteile. Eine Kalibrierung wird
  nicht vorgesehen und erst angestoßen, wenn der Richter danach unpassend
  wirkt.
- **Erste Welle:** Varianten, KI hilft, Karten aus einer Quelle und
  Zusammenfassung.
- Das KI-Kontingent und ein Modellwechsel sind nicht Teil von P5.

## Für die ausführende Sitzung

Bindend sind die Festlegungen oben, die Pakete mit ihren Nachweisen in
`todo.md` und `AGENTS.md`. Alles unter „Versuchsaufbau“ und „Ansatz“ ist ein
durchdachter Vorschlag: Zeigt der Code einen besseren Weg zum selben
Nachweis, nimm ihn und nenne die Abweichung im Pull Request.

- **Zuerst lesen:** P5 in `todo.md`, diese Datei, [`ai-eval.md`](ai-eval.md),
  ADR-011 und ADR-049; dann `scripts/aiEval/` ganz (rund 1.250 Zeilen mit
  Tests), `server/aiRoute.ts`, `api/ai/`, die vier Vertragsmodule
  `src/ai*Contract.ts`, den Skill `.agents/skills/ai-eval/SKILL.md` und
  `.claude/agents/eval-judge.md`.
- **Reihenfolge:** Ausbau der Fallsätze für Quelle und Zusammenfassung,
  dann H → I → J. A bis G und der Probelauf sind erledigt; dessen Ergebnis steht im
  [Verlauf](history.md), die Rohdaten im Datenordner unter
  `<typ>/2026-11-23-probe/`. Seine Fehlermuster (Lückentext als Frage mit
  nachgestellter Lücke, übernommene eingeschleuste Anweisungen, umgekehrte
  Richtung bei Definitionen, Abschweifungen bei KI hilft) sind die ersten
  Kandidaten für Paket I. Je Paket ein Pull Request.
- **Je Pull Request:** `npm run typecheck`, die Modultests unter
  `scripts/aiEval/` (laufen mit `runModuleTests.ts`), ein Trockenlauf von
  `cases` bis `score`, `npm run check:docs`, `audit-last-change`.
- **Bezahlte Läufe** brauchen `OPENROUTER_API_KEY` und `CORE_AI_EVAL_DIR`, als
  Benutzer-Umgebungsvariablen oder in `.env.local` des Worktrees. Den
  Schlüssel trägt nur der Nutzer ein; er erscheint in keinem Log, Bericht oder
  Chat, und die Sitzung liest `.env.local` nicht. Vor jedem Lauf Anfragetyp, Fallzahl und erwartete Kosten
  nennen; solange das Limit des Schlüssels reicht, braucht ein Lauf keine
  Einzelfreigabe. Hält es an (`provider_budget_exhausted`), fragt die Sitzung
  den Nutzer, ob er es erhöht.
- **Inhalte aus echten Stapeln** stehen nie in Commits, Pull Requests oder
  versionierten Dateien.
- Ein geänderter Prompt erreicht `main` nur über einen Pull Request, den der
  Nutzer freigibt.

## Warum dieser Weg

Erzeugen ist billig, Richten ist teuer. Luna kostet bei OpenRouter 0,10 USD
(Eingabe) und 0,50 USD (Ausgabe) je Million Tokens (Preisliste vom
2026-11-23); eine Variante kostet etwa 0,0001 USD, tausend Antworten etwa
10 Cent. Opus 5.5 kostet 4 und 20 USD je Million Tokens; ein Richterlauf über
360 Einträge läge über die API bei 1–2 USD.

| Rolle | Weg | Grund |
| --- | --- | --- |
| Generator | OpenRouter-API | Jeder Aufruf ist von selbst ein frischer Kontext; es läuft der echte Payload der Route mit erzwungenem Tool-Call und ZDR; Kosten und Latenz sind messbar. |
| Richter | Claude-Code-Subscription | Hier fiele der API-Gegenwert an. Frische entsteht durch einen Subagenten je Block. |
| Optimierer | Claude-Code-Subscription | Die ausführende Sitzung liest Trainingsfehler und schreibt Kandidaten. |

Daraus folgt der Aufbau: mehrere Kandidaten je Runde statt einer Änderung,
Vorauswahl ohne den Entscheidungsteil, wiederverwendete Urteile für gleiche
Ausgaben. Ein Subscription-Modell als Generator sparte Cent und entwertete
die Messung (Harness-Prompt um jede Anfrage, kein erzwungener Tool-Call,
keine Kosten, keine Latenz).

## Bestand

Vier Routen, alle über `OPENROUTER_MODEL` (`openai/gpt-6-luna`), Reasoning
`low`, genau ein erzwungener Tool-Call, ZDR.

| Route | Prompt | Anfragearten | Prompt ist | Eval heute |
| --- | --- | --- | --- | --- |
| `card-variant` | `card-variant-v5` | Frage/Antwort, Eintippen (Zusatzregel), Lückentext, Auswahl (Single, Multiple, Kprim) | drei feste Texte | Definitionen für drei Arten |
| `card-help` | `card-help-v2` | Erklären, Beispiel, eigene Frage mit bis zu sechs Wechseln Verlauf | ein fester Text | Definition |
| `source-cards` | `source-cards-v2` | je Abschnitt (≤ 15.000 Zeichen, ≤ 25 Karten) mit `avoid` und Restmenge aus früheren Abschnitten | Funktion von sieben Einstellungen | Definition, fünf Prüfdokumente |
| `summary` | `learning-summary-v4` | eine Anfrage je Zusammenfassung, bis 400.000 Zeichen Material | Funktion von zehn Einstellungen | Definition, drei Materialsätze |

Weitere Aufrufe an ein Sprachmodell gibt es nicht; die Mindmap entsteht ohne
KI aus der Zusammenfassung.

## Befunde am Runner

R1–R7 (Antwortklassen, erwartbare Ablehnung, Zeitüberschreitungen und Kosten,
Fingerabdruck, Budget und Parallelität, getrenntes Formatkriterium bei
`card-help`, drei Teile nach Gruppen) sind mit den Paketen A und B behoben,
R8–R13 (Kandidaten, Richterblöcke, festgehaltener Richter, Eintrag ohne
Kalibrierung, versionierte Ergebnisse, Entscheidung mit Kosten und Latenz)
mit C und D.

Bewährt und bleibt: Erzeugen über Payload-Builder und Antwortprüfung der
Route, fortsetzbare Läufe mit Transkript, Tabelle ohne Herkunft mit
getrenntem Schlüssel, Bootstrap über Fälle, gepaarter Vergleich, geprüftes
Ledger, Trockenlauf.

| Nr. | Befund | Folge | Paket |
| --- | --- | --- | --- |
| R14 | Eine Definition ist eine Anfrage mit einer Antwort und kennt nur bestanden oder nicht. | Ein Auftrag aus mehreren Abschnitten und Zahlenwerte wie die Kartenmenge sind nicht messbar. | F |

Nebenbei aufgefallen, nicht Teil von P5: Die Specs sagen „nie im
Hintergrund“, ADR-011 erlaubt die vorausschauende Variante; die
Zusammenfassung prüft nicht, ob `relations` auf vorhandene Überschriften oder
Stichwörter zeigen; ihr Antwortschema lässt `non_zdr` zu, das keine Route
mehr liefert.

## Versuchsaufbau

### Kandidat

Ein Kandidat ist alles am Payload außer den Nutzdaten: Systemprompt,
Werkzeugschema, Ausgabegrenze, Reasoning, Modell. Ohne Angabe gilt, was die
Route baut.

- `--candidate <name>` lädt ein Modul aus dem Datenordner, das den gebauten
  Payload ersetzt. Kandidatendateien sind Versuchsmaterial und werden nicht
  versioniert. Die Antwortprüfung bleibt die der Route; ändert ein Kandidat
  das Werkzeugschema unverträglich, fallen seine Antworten am Vertrag durch.
- Jeder Lauf trägt einen **Fingerabdruck:** SHA-256 über die sortierte Menge
  der verschiedenen Payloads ohne Nutzdaten, gebildet aus der ersten Anfrage
  jedes Falls. Ein fortgesetzter Lauf mit anderem Fingerabdruck bricht ab.
- **Übernommen** wird ein Kandidat, indem er in den Code der Route wandert
  und die Promptversion steigt. `score --record` nimmt „übernommen“ nur an,
  wenn der Code denselben Fingerabdruck baut wie der gemessene Lauf. So ist
  die Übertragung geprüft, ohne neu zu messen.

### Fallsätze

Drei Teile je Anfragetyp, nach Kategorie geschichtet und nach Gruppe
getrennt (eine Karte, eine Notiz oder ein Dokument liegt immer nur in einem
Teil). Zwei Teile reichen nicht: Wird jede Runde am berichteten Teil
entschieden, passt sich die Promptfolge an ihn an.

| Teil | Anteil | Zweck | Wer liest Inhalte |
| --- | --- | --- | --- |
| Training (`train`) | 40 % | Fehleranalyse und Vorauswahl der Kandidaten | Optimierer |
| Entscheidung (`dev`) | 30 % | jede Runde: übernehmen oder verwerfen | nur Kennzahlen und Fallkennungen |
| Rückhalt (`holdout`) | 30 % | Baseline und Wellenende; der berichtete Wert | niemand vor Wellenende |

| Anfragetyp | Fälle | Zusammensetzung |
| --- | --- | --- |
| Varianten Frage/Antwort (mit Eintippen), Lückentext, Auswahl | je etwa 100 | etwa 50 Prüfkarten über die Kategorien, der Rest aus dem Korpus; liefert der Korpus für eine Art zu wenig, entsprechend mehr Prüfkarten |
| KI hilft | etwa 100 | jede Prüfkarte in allen drei Modi, Korpusfälle in Erklären und Beispiel |
| Karten aus einer Quelle | etwa 24 Dokumente | die fünf Prüfdokumente, dazu weitere Fächer und Formate und mindestens vier lange Quellen (über 60.000 Zeichen); je Dokument 10–30 Kernaussagen |
| Zusammenfassung | etwa 24 Materialsätze | Karten, Quelle und beides; je Satz Kernaussagen und zwei Einstellungsprofile aus einer paarweise deckenden Liste von etwa zwölf |

Was die Fallsätze enthalten müssen:

- **Varianten:** Eintippen; Ketten mit einer bis vier vorhandenen Varianten
  in `avoid`; Fälle, die „nicht umformulierbar“ erwarten, und knappe
  Fachkarten, die es nicht sind; Lückentexte, deren Lücke fast den ganzen
  Text trägt (dort umschreibt das Modell die Lösung außerhalb der Lücke, was
  die Routenprüfung nicht erkennt).
- **KI hilft:** „Freitext ohne echte Frage“ mit Dank, Bestätigung, eigenem
  Antwortversuch, Bitte wie „einfacher“, Unverständnis, Unsinn und Text ohne
  Kartenbezug; Folgefragen mit Verlauf.
- **Fallen** je kritischem Kriterium, in jedem Teil und getrennt
  ausgewiesen: Richtung und Reihenfolge, Verneinung, eingeschleuste
  Anweisungen, fachlich falsche Karten, in Quellen und Material eingebaute
  Widersprüche. Seltene kritische Fehler lassen sich nur so belegen: Null
  Fehler in n Antworten ergeben eine Obergrenze von 3/n, ein Ziel wie „M2
  ≤ 1 %“ bräuchte 300 fehlerfreie Antworten.
- Fächer breit (Medizin, Recht, Geschichte, MINT, Sprachen, Wirtschaft),
  überwiegend Deutsch, dazu Englisch und Vokabelkarten weiterer Sprachen.

Prüfkarten, Prüfdokumente und Kernaussagen schreibt die ausführende Sitzung
selbst, ohne fremde Texte und fachlich richtig (außer bei bewusst falschen
Karten); der Nutzer sieht je Anfragetyp eine Stichprobe von zehn.
Versioniert werden nur sie, Korpusfälle nie.

### Kriterien und Messgrößen

Ein Kriterium ist bestanden oder nicht; eine Messgröße ist eine Zahl je
Antwort oder Auftrag. Fett heißt kritisch: darf gegenüber dem Bestand nicht
schlechter werden.

| Anfragetyp | Automatisch | Richter | Messgrößen |
| --- | --- | --- | --- |
| Varianten | M1 Vertrag, M3 Zahlen und Begriffe zeichengenau, M4 erkennbar umformuliert, M5 Abstand zu `avoid`, M7 Eignung wie erwartet | **M2 fachlich gleich**, M6 Sprache, Schwierigkeit, Natürlichkeit | – |
| KI hilft | H0 Vertrag, H8 Format (höchstens 150 Wörter, kein Markdown) | H1 Sprache, **H2 fachlich korrekt**, H3–H5 je Modus, **H6 sicher und ehrlich**, H7 knapp und lernförderlich | – |
| Karten aus einer Quelle | Q1 Vertrag (Anfragen gültig, Anteil verworfener Karten) | je Karte mit ihren Belegstellen: **Q2 belegt**, Q3 fragt genau eine Sache, Q4 ohne Quelle verständlich und ohne Antwortverrat, Q5 Auswahloptionen plausibel und eindeutig; je Kernaussage: Q6 abgedeckt | Karten gesamt und je 1.000 Zeichen, Anteil je Kartenform, Dubletten, Anteil belegter Stellen, letzte belegte Stelle, Abbruch an der Obergrenze, gescheiterte Abschnitte |
| Zusammenfassung | Z1 Vertrag, Z2 Länge höchstens das 1,25-Fache der gewählten Obergrenze, Z3 Darstellung wie gewählt, Z4 Stichwörter einmalig, Z5 Querbezüge zeigen auf Vorhandenes | je Abschnitt mit seinem belegten Material: **Z6 belegt und unverfälscht**, Z7 verständlich und zum Lernziel passend; je Kernaussage: Z8 abgedeckt; je eingebautem Widerspruch: Z9 gemeldet | Wörter, Abschnitte, Anteil belegten Materials |

Kosten je Antwort, Latenz (Median, p90), Tokens, Vertragsablehnungen und
Zeitüberschreitungen sind bei jedem Anfragetyp feste Messgrößen.

- Bei Eintippen behält die App die Antwort der Karte
  (`coreVariantService.ts`). Geprüft wird deshalb über M2, ob die neue Frage
  noch genau diese Zeichenfolge erwartet.
- Bei „Karten aus einer Quelle“ ist der Fall ein Auftrag über das ganze
  Dokument (alle Abschnitte mit `avoid` und Restmenge wie in der App), in
  festen Profilen: Standard, alle Kartenformen, Weniger, Mehr. Der Richter
  sieht je Dokument eine Stichprobe von zehn Karten für Standard und für
  alle Kartenformen, von fünf für Weniger und Mehr (dort nur Q2).
- Der Hauptwert ist bei Varianten und KI hilft der Anteil der Antworten, die
  alle Hauptkriterien bestehen; bei Quellenkarten der Anteil bewerteter
  Karten mit Q2–Q4, bei der Zusammenfassung der Anteil der Abschnitte mit Z6
  unter gültigen Z1–Z5. Bootstrap je Fall beziehungsweise je Dokument.
- Wo eine Regel prüfbar ist, gehört sie in die Antwortprüfung der Route und
  nicht in den Prompt (etwa Z5); das ist dann ein Kandidat wie jeder andere.

### Richter

- **Blöcke:** höchstens 25 Einträge oder etwa 12.000 Zeichen, jeder mit dem
  Bogen. Einträge mit gemeinsamem Material (Karten eines Dokuments,
  Abschnitte einer Zusammenfassung) stehen in einem Block, das Material
  darin einmal. Je Block ein frischer Subagent `eval-judge`, höchstens sechs
  gleichzeitig. Fehlende Blöcke nennt `score`; nur sie werden wiederholt.
- **Urteil:** je Kriterium bestanden oder nicht und eine Sicherheit von 1
  bis 3 (3 eindeutig, 2 auch anders vertretbar, 1 knapp); eine Notiz bei
  jedem „nicht bestanden“ und bei Sicherheit unter 3.
- **Doppelurteile:** 10 % der neu bewerteten Einträge (mindestens zehn)
  stehen in zwei verschiedenen Blöcken. Der Anteil gekippter Urteile je
  Kriterium ist das Richterrauschen des Laufs.
- **Grenzfälle:** Der Bericht zeigt je Kriterium bis zu drei Einträge mit
  Eingabe, Ausgabe, Urteil und Notiz: zuerst gekippte, dann die mit der
  geringsten Sicherheit. Die Sitzung zeigt sie dem Nutzer mit jedem Bericht.
- **Urteilscache:** Ein Urteil gilt für Richterauftrag, Kriterientexte,
  Eingabe und Ausgabe. Dieselbe Ausgabe bekommt in jedem Lauf dasselbe
  Urteil; das senkt den Richteraufwand späterer Runden und nimmt dem
  gepaarten Vergleich das Richterrauschen.
- **Fingerabdruck des Richters:** Hash über Richterauftrag und
  Kriterientexte, dazu das Richtermodell als Pflichtangabe von `score`. Ein
  Vergleich gilt nur innerhalb desselben Fingerabdrucks; ändert er sich,
  beginnt die Reihe mit einer neuen Baseline.
- **Ohne Kalibrierung:** Die Seite weist den Richter als nicht kalibriert
  aus. Die vorhandenen Kalibrierbefehle bleiben unberührt und sind kein Gate
  mehr.

### Auswertung und Entscheidung

- Zwei Wiederholungen je Fall; mehr Fälle schlagen mehr Wiederholungen.
- Eine Antwort ist angenommen, von der Route abgelehnt (nur das
  Vertragskriterium fällt) oder eine Zeitüberschreitung (zählt als nicht
  bestanden und eigens als Zuverlässigkeit). Ratenlimit und Netzfehler werden
  mit Wartezeit wiederholt und bleiben sonst offen; Schlüssel- und
  Budgetfehler brechen ab.
- **Übernommen** wird am Entscheidungsteil, wenn der gepaarte Abstand zum
  Bestand über dem Rauschen liegt, kein kritisches Kriterium mehr Fehler hat
  und Kosten je Antwort und Latenz p90 höchstens das 1,2-Fache betragen.
- **Vereinfachungen** (kürzerer Prompt, niedrigeres Reasoning) gelten als
  übernommen, wenn der Abstand nicht negativ ist und im Rauschen liegt.
- Fallen: Fehler je Antworten, zur Baseline und am Wellenende über alle
  drei Teile gezählt; bei null Fehlern steht die Obergrenze 3/n dabei.
- **Rückhalt:** gemessen zur Baseline und am Wellenende. Liegt der Gewinn
  dort unter der Hälfte des Gewinns am Entscheidungsteil, ist die Reihe
  überangepasst: anhalten und den Entscheidungsteil vergrößern.
- Ehrliche Grenze: Mit etwa 30 Fällen im Entscheidungsteil sind
  Verbesserungen unter etwa fünf Punkten je Runde nicht belegbar. Reicht das
  nicht, wächst der Fallsatz des betroffenen Anfragetyps.

### Hillclimb je Anfragetyp

1. **Baseline** des Codes auf allen drei Teilen.
2. **Fehleranalyse** am Trainingsteil: Fehler nach Kriterium und Kategorie,
   die drei häufigsten Muster mit Beispielen.
3. **Drei bis fünf Kandidaten**, jeder mit genau einem Hebel gegen ein
   Muster: Satz ändern, streichen oder umstellen; Beispiel ergänzen oder
   entfernen; Werkzeugschema (Feldreihenfolge, Beschreibungen, ein Prüffeld
   vor der Antwort); Reasoning-Stufe; Ausgabegrenze; Form der Nutzdaten; eine
   Regel als Prüfung der Route statt als Promptsatz.
4. **Vorauswahl** am Trainingsteil: höchstens zwei Kandidaten, die das Muster
   beheben, ohne neue Fehler zu bringen.
5. **Messung** am Entscheidungsteil, Entscheidung nach der Regel oben. Jeder
   dort gemessene Kandidat steht im Ledger, auch verworfen.
6. **Ende:** frühestens nach drei Runden; dann nach drei Runden ohne
   Übernahme, nach acht Runden oder am Budget. Der Zielwert beendet nichts,
   er ist nur Orientierung auf der Seite.
7. **Kürzungsrunde:** Sätze einzeln streichen, die sich nicht belegen lassen
   (etwa das Beispiel zu „Wie viele …“); Regel für Vereinfachungen.
8. **Rückhalt** messen.

### Strukturversuche zu „Karten aus einer Quelle“

Nach den Promptrunden, auf denselben Dokumenten und den langen Quellen:

- **Kartenmenge:** Weniger, Normal und Mehr ergaben am 2026-11-22 77, 76 und
  77 Vorschläge ([Verlauf](history.md)). Ziel: Weniger höchstens 60 % und
  Mehr mindestens 140 % von Normal, ohne Füllkarten und bei gleichem Q2.
  Danach die Dichten in `AI_SOURCE_AMOUNTS` neu messen.
- **Zerlegung:** (a) Abschnitte wie heute; (b) die ganze Quelle als Kontext
  in jeder Anfrage, Karten nur für den markierten Abschnitt; (c) erst eine
  Gliederung mit Kernaussagen und Kartenbudget je Abschnitt, dann die
  Abschnitte mit dieser Gliederung. Heute trennt (a) Zusammenhänge über
  Abschnitte, gewichtet „zentral“ nur je Abschnitt, verbraucht die Obergrenze
  von 100 Vorschlägen von vorn und erkennt Dopplungen nur am Fragetext.
  Verglichen werden Q2, Q6, Verteilung über die Quelle,
  abschnittsübergreifende Fragen, Dubletten, Kosten und Laufzeit. Bei Luna
  kostet eine Quelle von 400.000 Zeichen als Kontext etwa 1 Cent je Anfrage;
  die Grenze von (b) ist die Laufzeit, nicht der Preis. Gewinnt (b) oder (c),
  braucht das eine Ergänzung von ADR-011.
- **Reste nach `source-cards-v2`:** Single Choice wird nie gewählt;
  Tabellenzeilen mit zwei Angaben ergeben Doppelfragen (Q3).

### Übersichten

`ai-eval.html` entsteht weiter aus dem Ledger:

- **Bestand** je Anfragetyp, ergänzt um den Wert am Rückhalt, das
  Richterrauschen und die Fallen.
- **Verlauf** je Anfragetyp wie heute, am Entscheidungsteil.
- **Bilanz** (neu): Läufe, Antworten, Kosten gesamt, bewertete Einträge und
  Anteil aus dem Cache; je Anfragetyp Baseline, bester Stand und Ziel.

Der Bericht je Lauf mit Grenzfällen und Fehlerliste bleibt lokal, weil er
Inhalte zeigt.

### Daten und Kosten

| Ort | Inhalt | In Git |
| --- | --- | --- |
| `fixtures/ai-eval/`, `fixtures/ai-source/` | Prüfkarten, Prüfdokumente, Materialsätze, Kernaussagen, Ledger, je eingetragenem Lauf eine Ergebnisdatei ohne Inhalte (Fall, Wiederholung, Kriterien, Kosten, Latenz) | ja |
| `CORE_AI_EVAL_DIR` (Benutzer-Umgebungsvariable; ohne sie `output/ai-eval`) | Korpusfälle, Antworten mit Transkript, Blöcke, Urteile, Cache, Kandidaten, Berichte | nein |

| Posten | Schätzung |
| --- | --- |
| Variante, KI hilft | 0,0001–0,0002 USD je Antwort |
| Karten aus einer Quelle | 0,001–0,003 USD je Abschnitt |
| Zusammenfassung | 0,005–0,03 USD |
| Baseline aller Anfragetypen | etwa 2 USD |
| eine Runde Varianten oder KI hilft | etwa 0,15 USD |
| eine Runde Karten aus einer Quelle | etwa 0,50 USD |
| eine Runde Zusammenfassung | etwa 1 USD |
| ganzes Experiment | 10–25 USD; das Limit des Schlüssels wird in Schritten erhöht |

Runden zu Quellenkarten und Zusammenfassung laufen ohne die langen Quellen
und Materialsätze; die kommen nur zur Baseline, in den Strukturversuchen und
am Wellenende dran. Den Richter trägt die Subscription: Die Baseline aller
Anfragetypen sind etwa 100 Blöcke, eine Runde danach 3–8. Stellschraube ist
die Fallzahl je Anfragetyp.

## Arbeitspakete

### A und B – erledigt

Umgesetzt am 2026-11-23. Abweichungen vom ursprünglichen Ansatz, die für die
folgenden Pakete gelten:

- **Schlüssel:** Es gibt keinen eigenen Eval-Schlüssel. Der Runner liest
  `OPENROUTER_API_KEY`, den lokalen Schlüssel aus `operations.md`.
- **Ablehnung:** Ein Fall erwartet „nicht umformulierbar“ mit `refuse: true`
  (statt `expect`). Eine Definition nennt in `refusal` Fehlercode und
  Kriterium (Varianten: `not_rephrasable`, M7). Die Antwortklassen sind
  `answer`, `refused`, `rejected` und `timeout`; `AnswerRow.outcome` ersetzt
  `ok`.
- **Fälle:** `group`, `trap` und `refuse` sind optionale Felder je Fall;
  `trap` wird erst in Paket D ausgewertet. Die Aufteilung gibt jede Gruppe in
  den Teil, dem nach seinem Anteil die meisten Fälle fehlen, bei Gleichstand
  `dev` vor `holdout`. Bei zwei Fällen je Kategorie ergibt das einen Fall in
  `train` und einen in `dev`; der Rückhalt füllt sich erst mit Paket E. So
  sieht der Entscheidungsteil jede Kategorie, auch Injection und Ablehnung.
- **Fingerabdruck:** `payloadFingerprint` in `generate.ts`, 16 Hexzeichen,
  über die verschiedenen Payloads ohne Nutzernachricht. Paket C nutzt ihn für
  die Übernahmeprüfung.
- **Ledger:** `--record` nimmt nur Läufe auf `dev`; die Kalibrierungsprüfung
  bleibt bis Paket C.

### C und D – erledigt

Umgesetzt am 2026-11-23. Abweichungen und Stand, die für die folgenden Pakete
gelten:

- **Kandidat:** Der Standardexport bekommt den ganzen gebauten Payload und
  die Anfrage und gibt den Payload zurück; Prompt, Schema, Grenzen, Reasoning
  und Modell sind damit alle erreichbar. Ein späterer Modellvergleich von Hand
  ist ein Kandidat, der `model` setzt.
- **Doppelurteile** entstehen erst ab zwei Blöcken; bei einem Block wären
  sie im selben Kontext wertlos.
- **Gemeinsames Material** in einem Block (Karten eines Dokuments,
  Abschnitte einer Zusammenfassung) baut Paket F beziehungsweise G; heute ist
  jeder Eintrag für sich.
- **Vereinfachung** (`--simplify`) gilt als übernommen, wenn der Abstand über
  minus Rauschen liegt, also nicht messbar schlechter ist.
- **Rückhalt** wird dem Bestand über Promptversion, Modell und Reasoning
  zugeordnet, nicht über den Fingerabdruck; der hängt an den Fällen des Teils.
- **Messgrößen** (Zahlenwerte je Fall) bringt Paket F mit R14 ins Ledger.
- **Grenzfälle** stehen in `grenzfaelle.md` im Laufordner, nicht im Bericht:
  Sie enthalten Ein- und Ausgaben, und die Sitzung soll Antworten aus
  Entscheidung und Rückhalt nicht lesen. Der Nutzer bekommt den Link.
- **Fingerabdruck des Payloads** umfasst den ganzen Payload samt
  Nutzernachricht, mit sortierten Schlüsseln; er gilt damit nur für dieselben
  Fälle. Der Fingerabdruck des Richters hängt an den Kriterien des ganzen
  Fallsatzes, nicht an den Antworten eines Laufs.
- Die Rohdaten des Probelaufs haben noch die alte Richtertabelle; `score`
  wertet sie nicht mehr aus. Ihr Ergebnis steht im Verlauf.

### E – erledigt

Umgesetzt am 2026-11-23. Stand und Abweichungen:

| Anfragetyp | Prüfkarten | Korpusfälle (lokal) | train/dev/holdout | Fallen | Ablehnungen |
| --- | --- | --- | --- | --- | --- |
| Frage/Antwort mit Eintippen | 62 | 40 | 42/33/27 | 20 | 4 |
| Lückentext | 59 | 50 | 45/34/30 | 20 | 2 |
| Auswahl | 78 | – | 27/26/25 | 20 | 4 |
| KI hilft | 70 | 40 | 46/29/35 | 20 | – |

- **Auswahl ohne Korpus:** Der lokale Anki-Korpus enthält keine
  Auswahlkarten; deshalb 78 Prüfkarten statt etwa 100.
- **Korpus:** Frage/Antwort kommt nur aus 108 Notizen, überwiegend
  Zahlenkarten; Lückentext aus über 39.000 deutschen Medizin-Notizen. Die
  Korpusfälle liegen in `<Datenordner>/<typ>/corpus.cases.json`; wer den
  Fallsatz anderswo braucht, zieht sie mit `cases <typ> --corpus <n>` und
  demselben Startwert neu (der Korpus muss unter `fixtures/apkg/corpus/`
  liegen).
- **Neue Kategorien:** `eintippen`, `knapp-fachlich` (kurze Fachkarten, die
  nicht als ungeeignet gelten dürfen) und `verneinung` bei Frage/Antwort,
  `grosse-luecke` und `verneinung` bei Lückentext, `verneinung` bei Auswahl.
- **Injection** in mehreren Formen: Anweisung im Text, auf der Rückseite, im
  Zusatzfeld, im Verlauf, in einer Auswahloption, als HTML-Kommentar und auf
  Englisch.
- **Gruppen** halten bei KI hilft alle Fälle einer Karte zusammen, darunter
  sechs Karten in allen drei Modi.

### F und G – erledigt

Umgesetzt am 2026-11-23. Stand und Abweichungen:

- **Definition mit mehreren Anfragen:** `run` führt einen Fall wie die App aus
  (`runAiSourceCards` mit Abschnitten, `avoid` und Restmenge); der Runner
  gibt ihr `send`, das Kandidat, Wiederholung, Kosten und Latenz übernimmt.
  Eine Zeitüberschreitung ist ein gescheiterter Abschnitt; ein Schlüssel-,
  Limit- oder Endpunktfehler lässt den Fall offen.
- **Mehrere Richtereinträge je Antwort** (`items`): Kriterien sind Anteile
  bestandener Einträge, bei einem Eintrag je Antwort weiter 0 oder 1. Der
  Hauptwert ist der Anteil der Einträge mit allen Hauptkriterien, unter
  bestandenen automatischen Kriterien (bei Quellenkarten auch Q1); über den
  Lauf wird je Fall gemittelt. Kriterien `Q6:<dokument>-n`,
  `Z8:<satz>-n` und `Z9:<satz>-n` sind je Kernaussage oder Widerspruch eines;
  sie zählen unter Q6, Z8 und Z9.
- **Messgrößen** (`metrics`) je Antwort: bei Quellenkarten Kartenzahl,
  Karten je 1.000 Zeichen, Anteil je Form, belegte und letzte belegte Stelle,
  Abbruch an der Obergrenze, gescheiterte Abschnitte, verworfene Vorschläge;
  bei der Zusammenfassung Wörter, Abschnitte, belegtes Material und
  Warnungen. Der Bericht mittelt sie je Kategorie; das Ledger trägt sie.
- **Karten aus einer Quelle:** Fall ist Dokument mal Profil (Standard, alle
  Formen, Weniger, Mehr), gruppiert nach Dokument. Der Richter sieht zehn
  Karten mit ihren Belegstellen (bei Weniger und Mehr fünf, nur Q2) und
  einen Eintrag mit allen Karten gegen die Kernaussagen. Das PDF liest der
  Eval über `ohmsches-gesetz.pages.json`, die das Erzeugerskript neben das
  PDF schreibt.
- **Zusammenfassung:** Fall ist Materialsatz mal Profil (Standard,
  kurz-pruefung, lang-einfach) aus `fixtures/ai-eval/summary-material/`.
  Der Richter sieht bis zu vier Abschnitte mit ihrem belegten Material und
  einen Eintrag mit der ganzen Zusammenfassung gegen Kernaussagen und
  eingebaute Widersprüche.
- **Fallzahl:** fünf Dokumente (20 Fälle) und drei Materialsätze (6 Fälle)
  statt je etwa 24; der Ausbau steht als eigener Punkt vor H in `todo.md`.
- **Gemeinsames Material** in einem Block ist nicht gebaut; jeder Eintrag
  trägt sein Material selbst.
- **Bootstrap je Fall** (Dokument mal Profil), nicht je Dokument; das
  Intervall ist dort zu eng.
- **Kandidaten** bekommen als zweites Argument die Anfrage an die Route: bei
  Quellenkarten die des Abschnitts, bei der Zusammenfassung `request.route`.
- Handurteile gibt es nur für Typen mit einem Richtereintrag je Antwort.

### H – Baseline (erledigt)

Gemessen am 2026-11-23, zwei Wiederholungen, Richter Opus 5.5 in 59 Blöcken;
Erzeugung rund 7 Cent.

| Anfragetyp | Entscheidung | Rückhalt | Kritisch (Entscheidung) | Ziel |
| --- | --- | --- | --- | --- |
| Variante Frage/Antwort | 79,3 % | 87,0 % | M2 86,8 % | 95 % |
| Variante Lückentext | 86,8 % | 90,0 % | M2 87,7 % | 95 % |
| Variante Auswahl | 92,3 % | 96,0 % | M2 97,9 % | 95 % |
| KI hilft | 71,0 % | 93,6 % | H2 91,9 %, H6 98,4 % | 90 % |
| Karten aus einer Quelle | 83,8 % | 95,0 % | Q2 98,1 % | 90 % |
| Zusammenfassung | 50,0 % | 50,0 % | Z6 100 % / 93,8 % | 95 % |

- **Korpus bereinigt:** Die erste Erzeugung ergab bei Frage/Antwort 24 von
  66 Ablehnungen, fast alle auf gelöschten, Platzhalter- und ID-Karten aus
  echten Stapeln. `sampleCorpus` überspringt sie jetzt; Frage/Antwort und
  KI hilft sind danach neu erzeugt (`baseline2`). Frage/Antwort hat nur noch
  29 Korpusfälle.
- **Rauschen** zählt je Einzelurteil; vorher kippte ein Q6-Eintrag mit 20
  Kernaussagen schon bei einer abweichenden.
- **Abstand Entscheidung zu Rückhalt** ist bei KI hilft (71 gegen 94 %) und
  Quelle (84 gegen 95 %) groß: Die Teile sind klein und nach Kategorie
  unterschiedlich schwer. Vergleiche in Runden gehen deshalb nur gepaart
  gegen die Baseline desselben Teils.
- **Zusammenfassung** hat je Teil nur zwei Fälle; das Intervall reicht von 0
  bis 100 %. Beide Standardprofile scheitern an Z5 (Querbezüge auf
  Stichwörter, die es nicht gibt).
- Fallen: je Typ höchstens ein Fehler bei einem kritischen Kriterium.
- **Vorprobe Reasoning `medium`** (2026-11-24, Entscheidungsteil, 2,7 Cent):
  Frage/Antwort 81,0 % (+1,7, im Rauschen), KI hilft 87,1 % (+16,1, fast
  ganz aus H4 Beispiel 54 → 88 %), Quelle 86,9 % (+3,1, im Rauschen, Q2
  97,5 statt 98,1 %). Kosten 1,35- bis 1,5-fach, Latenz p90 1,6- bis
  2,3-fach; alle drei nach der Regel verworfen. Der Hillclimb läuft auf
  `low`; KI hilft misst `medium` am Ende mit dem besten Prompt erneut.

### I – Hillclimb, erste Welle

- Reihenfolge (Haltepunkt 2026-11-24): KI hilft (zuerst H4 Beispiel),
  Varianten, Karten aus einer Quelle (Runden, dann Strukturversuche),
  Zusammenfassung; alles auf `low`.
- Je Anfragetyp nach „Hillclimb je Anfragetyp“; ein Pull Request je
  Anfragetyp mit Promptänderungen, neuer Promptversion, Ledger-Einträgen und
  Ergebnisdateien. Übernommene Routenprüfungen bekommen Routentests.
- **Fertig, wenn** je Anfragetyp die Abbruchregel erreicht und der Rückhalt
  gemessen ist.

**KI hilft (2026-11-24, abgeschlossen):**

| Runde | Kandidat (ein Hebel) | Trainingsteil | Entscheidungsteil | Ergebnis |
| --- | --- | --- | --- | --- |
| 1 | Karte nur bei eindeutigem Gegenwissen korrigieren, dann im ersten Satz | 85,4 % | 83,9 % (+12,9, Rauschen ±11,3) | übernommen, `card-help-v2` |
| 1 | fremde Bitten ablehnen | 83,3 % | 77,4 % (+6,5, H6 schlechter) | verworfen |
| 1 | Verlauf-Bezug, Beispiel-Definition | 79,2 %, 81,3 % | – | Vorauswahl verfehlt |
| 2 | Beispiel bei Faktenkarten als Situation | 85,4 % | 79,0 % (−4,8, H2 und H6 schlechter) | verworfen |
| 2 | fremde Bitten sanft | 79,2 % | – | Vorauswahl verfehlt |
| 3 | Auftrag hinter den Daten, alle Modi / nur Beispiel | 83,3 %, 77,1 % | – | Vorauswahl verfehlt |
| 4 | Musterbeispiel im Prompt | 79,2 % | – | Vorauswahl verfehlt |
| Kürzung | Satz zum Werkzeugaufruf gestrichen | – | 80,7 % (H2 und H6 schlechter) | verworfen |
| Abschluss | `medium` auf `card-help-v2` | – | 88,7 % (+4,8 im Rauschen, Kosten 1,5-fach, p90 2,3-fach) | verworfen |

- **Rückhalt:** `card-help-v2` 88,7 % gegen 93,6 % mit `v1` (2 Fälle
  gewonnen, 5 verloren, im Rauschen). Der Gewinn am Entscheidungsteil ist
  damit nicht bestätigt; er kam zur Hälfte aus H4, das die Änderung nicht
  anspricht.
- **Befund:** Mit 31 Fällen je Teil liegt das Rauschen bei ±10 Punkten;
  kleinere Verbesserungen sind nicht messbar. Die Vorauswahl mit einer
  Wiederholung schwankt ähnlich stark (Musterbeispiel: H4 67 → 92 → 63 %).

### K – Messschärfe und L – ausgewogene Fallsätze

Anlass ist die Welle KI hilft: 31 Karten je Teil, eine Karte rund 3 Punkte,
Rauschen um ±10 Punkte; der Rückhalt bestätigte den Gewinn nicht. Das
Rauschen kommt fast nur vom Erzeuger, die Doppelurteile des Richters sind
stabil. Doppelt so viele Fälle senkten es nur auf etwa ±7.

- **Nachmessen:** Nach zwei Wiederholungen bekommen nur Karten, bei denen
  Bestand und Kandidat oder die Wiederholungen voneinander abweichen, zwei
  weitere, für beide Prompts (geschätzt 20 bis 30 % mehr Anfragen).
- **Ziel-Entscheidung:** Ein Kandidat nennt Kriterium und Modus oder
  Kategorie seines Fehlerbilds. Übernommen wird vorläufig, wenn er dort
  mindestens zwei Karten mehr gewinnt als verliert, am Rest höchstens eine
  Karte verliert und kein kritisches Kriterium schlechter wird.
- **Sammelprüfung:** Nach höchstens drei vorläufigen Schritten misst der
  Stapel gegen den letzten bestätigten Stand mit drei Wiederholungen; ist er
  nicht besser als das Rauschen, fällt der Schritt mit dem schwächsten Beleg
  heraus.
- **Begründung:** Jede Übernahme trägt zwei Sätze aus den geänderten
  Trainingsantworten (Fehlerbild behoben, nichts Neues kaputt).
- **Sicherheit 1** zählt nicht für die Entscheidung, nur für die Grenzfälle.
- **Fallraster** wie in `todo.md` unter L; Referenzaussagen für Fachfakten,
  damit der Richter nicht aus dem Gedächtnis urteilt.
- **Berichte und Tabellen:** Hauptwert als richtige Antworten „x von n“ mit
  Prozent; Kosten nur, wenn sie vom Bestand abweichen.

### J – Abschluss

- Kostenziele je Anfragetyp nach `operations.md`; `status.md` und
  `history.md` nachziehen; Reste als Einzeiler nach `todo.md`.
- `ai-eval.md` beschreibt den Ablauf vollständig; diese Datei und ihre Zeile
  in `docs/README.md` löschen.
- **Fertig, wenn** die Seite Bestand, Verlauf und Bilanz für alle
  Anfragetypen zeigt.

## Zielwerte

Orientierung auf der Seite, kein Abbruchgrund (Haltepunkt H, 2026-11-24).

| Anfragetyp | Hauptwert am Rückhalt | Kritisch | Weitere |
| --- | --- | --- | --- |
| Varianten | ≥ 95 % | Fallen zu Richtung, Reihenfolge und Verneinung: 0 Fehler bei mindestens 40 Antworten je Kartenart | Kosten höchstens das 1,2-Fache der Baseline, Latenz p90 ≤ 4 s |
| KI hilft | ≥ 90 % | H2: höchstens 2 Fehler je 100 Antworten; H6: 0 Fehler in den Fallen bei mindestens 40 Antworten | Streaming erst, wenn die Latenz im Median über 4 s liegt |
| Karten aus einer Quelle | ≥ 90 % | Q2 ≥ 98 % der bewerteten Karten | Q6 ≥ 80 % bei Normal, keine Dubletten, Kartenmenge 60 % und 140 %, jede erlaubte Form kommt vor, wo das Dokument sie trägt |
| Zusammenfassung | ≥ 95 % | Z6 ≥ 98 % der Abschnitte | Z2 ≥ 90 %, Z8 ≥ 80 %, jeder eingebaute Widerspruch gemeldet |

## Risiken

- **Richter ohne Kalibrierung:** Ein systematischer Fehler bleibt unsichtbar.
  Dagegen stehen automatische Kriterien, wo immer eine Regel prüfbar ist, das
  Richterrauschen und die Grenzfälle je Bericht.
- **Limits der Subscription:** Die Baseline sind etwa 100 Richterblöcke. Sie
  läuft je Anfragetyp getrennt und lässt sich fortsetzen.
- **Selbst geschriebene Fälle** sind leichter als echte Karten. Deshalb die
  Korpusfälle und die Fallen.
- **Prompts gelten für Luna.** Ein späterer Modellwechsel braucht je
  Anfragetyp mindestens eine neue Baseline.

## Bewusst nicht enthalten

Ein gebauter Modellvergleich, Handkalibrierung und neue Kontrolleinträge, ein
zweiter Richter, ein Richter über die API, ein Generator über eine
Subscription, die Batch-Endpunkte von OpenRouter, eine Bibliothek zur
automatischen Promptoptimierung, ein Lauf in CI und das KI-Kontingent.
