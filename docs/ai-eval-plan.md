# KI-Eval: Versuchsplan

Stand: 2026-11-23

Ausführungsplan für [P5](todo.md#p5-ki-eval-und-hillclimb): Befunde zum
heutigen Stand, Versuchsaufbau und Arbeitspakete. Umfang, Reihenfolge und
Gates stehen nur in `todo.md`, Messwerte nur unter [KI-Eval](ai-eval.md).
Die Datei löst sich mit P5 auf: Gebautes wandert nach `ai-eval.md`,
Entschiedenes nach [ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis);
mit Paket J wird sie gelöscht.

## Festlegungen

Vom Nutzer am 2026-11-23 entschieden:

- **Generator:** nur OpenRouter mit eigenem Eval-Schlüssel. Kein Modell aus
  einer Subscription als Generator.
- **Richter:** Opus 5.5 als Subagent in Claude Code, ein Richter, je Block
  ein frischer Kontext.
- **Keine Handkalibrierung vorab.** Jeder Bericht zeigt je Kriterium die
  zwei bis drei am wenigsten eindeutigen Urteile. Eine Kalibrierung wird
  nicht vorgesehen und erst angestoßen, wenn der Richter danach unpassend
  wirkt.
- **Erste Welle:** Varianten, KI hilft, Karten aus einer Quelle und
  Zusammenfassung.
- **Modell offen:** Gemessen wird je Kandidat aus Prompt, Modell und
  Reasoning. Ein Modellwechsel und das KI-Kontingent sind nicht Teil von P5;
  P5 liefert dafür die Zahlen.

Annahmen dieses Plans, änderbar bis Paket H:

- Limit des Eval-Schlüssels 40 USD; erwartet werden 15–35 USD Erzeugung.
- Vergleichsmodelle: `openai/gpt-6-luna` (Referenz, `low`),
  `openai/gpt-6-luna-pro`, `anthropic/claude-haiku-5.5`, dazu zwei bis drei
  günstige Modelle mit ZDR-Endpunkt und erzwingbarem Tool-Call (Kandidaten:
  `google/gemini-3.5-flash-lite`, `deepseek/deepseek-v4.1-flash`,
  `qwen/qwen3.7-flash`) und `openai/gpt-6.1-terra` als Obergrenze, wegen
  des zehnfachen Preises nur bei Varianten und KI hilft. Wer keinen
  ZDR-Endpunkt hat, fällt aus und steht so in der Übersicht.
- Fälle aus echten Stapeln gehen wie in der Produktion nur an ZDR-Endpunkte
  und bleiben lokal.

## Warum dieser Weg

Erzeugen ist billig, Richten ist teuer. Luna und Haiku 5.5 kosten bei
OpenRouter je 0,10 USD (Eingabe) und 0,50 USD (Ausgabe) je Million Tokens
(Preisliste vom 2026-11-23); eine Variante kostet etwa 0,0001 USD, tausend
Antworten etwa 10 Cent. Opus 5.5 kostet 4 und 20 USD je Million Tokens; ein
Richterlauf über 360 Einträge läge über die API bei 1–2 USD.

| Rolle | Weg | Grund |
| --- | --- | --- |
| Generator | OpenRouter-API | Jeder Aufruf ist von selbst ein frischer Kontext; es läuft der echte Payload der Route mit erzwungenem Tool-Call und ZDR; Kosten und Latenz sind messbar; das Modell ist ein Parameter. |
| Richter | Claude-Code-Subscription | Hier fällt der API-Gegenwert an (geschätzt 50–150 USD über das Experiment). Frische entsteht durch einen Subagenten je Block. |
| Optimierer | Claude-Code-Subscription | Die ausführende Sitzung liest Trainingsfehler und schreibt Kandidaten. |

Ein Subscription-Modell als Generator spart Cent und entwertet die Messung:
Der Harness-Prompt der Agentenumgebung liegt um jede Anfrage, es gibt keinen
erzwungenen Tool-Call, keine Kosten und keine Latenz, und Wochenlimits
begrenzen die Menge. Die Batch-Varianten bei OpenRouter (halber Preis)
lohnen aus demselben Grund nicht; mit ihnen ginge die Latenz verloren.

## Bestand

Vier Routen, alle über `OPENROUTER_MODEL` (`openai/gpt-6-luna`), Reasoning
`low`, genau ein erzwungener Tool-Call, ZDR.

| Route | Prompt | Anfragearten | Prompt ist | Eval heute |
| --- | --- | --- | --- | --- |
| `card-variant` | `card-variant-v5` | Frage/Antwort, Eintippen (Zusatzregel), Lückentext, Auswahl (Single, Multiple, Kprim) | drei feste Texte | Definitionen für drei Arten, je 24 Prüfkarten; Eintippen ohne Prüfkarte |
| `card-help` | `card-help-v1` | Erklären, Beispiel, eigene Frage mit bis zu sechs Wechseln Verlauf | ein fester Text | Definition, 24 Prüfkarten |
| `source-cards` | `source-cards-v2` | je Abschnitt (≤ 15.000 Zeichen, ≤ 25 Karten) mit `avoid` und Restmenge aus früheren Abschnitten | Funktion von sieben Einstellungen | fehlt im Register und auf der Seite; fünf Prüfdokumente |
| `summary` | `learning-summary-v4` | eine Anfrage je Zusammenfassung, bis 400.000 Zeichen Material | Funktion von zehn Einstellungen | im Register, ohne Definition |

Weitere Aufrufe an ein Sprachmodell gibt es nicht; die Mindmap entsteht ohne
KI aus der Zusammenfassung.

## Befunde

### Am bisherigen P5

1. **Die Wartebedingung ist erfüllt.** Alle vier Routen stehen, Quiz ist
   geparkt. P5 kann beginnen.
2. **„Erste Runde Varianten“ ist überholt.** `card-variant-v5` enthält
   beide Anweisungen schon. Runden entstehen aus der Fehleranalyse, nicht
   vorab.
3. **Zielwerte sind mit den Fallzahlen nicht prüfbar.** „M2 ≤ 1 %“ braucht
   rund 300 fehlerfreie, unabhängige Antworten (Dreierregel: 0 Fehler in n
   ergibt eine Obergrenze von 3/n); 60 Fälle × 3 korrelierte Wiederholungen
   belegen höchstens etwa 5 %. „H6 = 100 %“ ist nie belegbar. Seltene
   kritische Fehler brauchen Fallen mit ausgewiesener Zahl.
4. **Zwei Teile reichen nicht.** Wird jede Runde am Testteil entschieden,
   passt sich die Promptfolge an ihn an; der berichtete Wert ist dann zu
   gut. Es fehlt ein Teil, der nur an Meilensteinen gemessen wird.
5. **Der Engpass ist falsch gesetzt.** Eine Änderung je Runde mit vollem
   Richterlauf spart am Erzeugen, das Cent kostet, und verbraucht den
   Richter. Mehrere Kandidaten je Runde, Vorauswahl am Trainingsteil und
   wiederverwendete Urteile drehen das um.
6. **Rauschen ±7,5 Punkte bei Ziel 95 %** heißt: Verbesserungen sind
   unsichtbar. Abhilfe sind schwerere Fälle, der gepaarte Vergleich und
   mehr Fälle statt mehr Wiederholungen.
7. **Die Aufgaben zu „Karten aus einer Quelle“ sind keine Promptrunden.**
   Kartenmenge und Zerlegung brauchen zuerst eine Messung je Dokument;
   Zerlegung (b) und (c) ändern Vertrag und ADR-011.
8. **Es fehlen:** `source-cards` im Register, eine Definition für die
   Zusammenfassung, Fälle für Eintippen, der Modellvergleich, ein Budget
   und ein fester Ort für Rohdaten.

### Am Runner

Vor dem ersten bezahlten Lauf zu beheben:

| Nr. | Befund | Folge |
| --- | --- | --- |
| R1 | `generate.ts` kennt als Vertragsfehler nur vier Codes. Die Variantenroute wirft außerdem `not_rephrasable`, `invalid_gaps`, `changed_answer`, `revealed_answer`, `changed_options`, `negated_question` und `negated_option`. | Solche Antworten gelten als offen und werden bei jedem Aufruf neu angefragt: Der Lauf wird nie fertig, und genau die Ablehnungen, die M1 zählen soll, fehlen. Der Trockenlauf zeigt das nicht. |
| R2 | „Nicht umformulierbar“ ist nur ein Fehler. Die Prüfkarten der Kategorie `nicht-umformulierbar` erwarten diese Antwort. | Richtiges Verhalten lässt sich nicht bestehen, eine falsche Verweigerung nicht von einer richtigen trennen. |
| R3 | Zeitüberschreitungen werden still wiederholt. | Latenz p90 und Zuverlässigkeit sind geschönt; Lernende sähen einen Fehler. |
| R4 | Ein Lauf erkennt seinen Prompt nur an der von Hand erhöhten Versionskonstante. | Ein geänderter Prompt ohne neue Version mischt sich in einen fortgesetzten Lauf. |
| R5 | Der gepaarte Vergleich braucht `results.json` des Bestands in `output/`, das je Worktree existiert und nicht versioniert ist. | Nach dem Entfernen eines Worktrees lässt sich keine Runde mehr auswerten. |
| R6 | Der Richter ist nicht festgehalten: `model: opus` wandert mit Claude Code, `--judge` ist Freitext mit Vorgabewert, der Bogen kann sich spurlos ändern. | Läufe mit verschiedenen Richtern werden verglichen. |
| R7 | Der ganze Lauf geht als eine Tabelle an einen Subagenten. | Hunderte Einträge in einem Kontext: spätere Urteile hängen von früheren ab. |
| R8 | `H1` bei `card-help` bedeutet dreierlei: Vertrag, Format (Wortzahl, kein Markdown) und Sprache. | Ein Fehler lässt sich nicht zuordnen. |
| R9 | Die Aufteilung geht je Fall. `card-help` erzeugt aus einer Korpuskarte zwei Fälle, Lückentexte einer Notiz mehrere. | Dieselbe Karte liegt in Training und Test. |
| R10 | Eine Definition ist eine Anfrage mit einer Antwort und kennt nur bestanden oder nicht. | Ein Auftrag aus mehreren Abschnitten und Zahlenwerte wie die Kartenmenge sind nicht messbar. |
| R11 | Modell und Reasoning stehen nur im Servercode. | Kein Modellvergleich, immer nur ein Kandidat. |
| R12 | Kein Budgetabbruch, feste Parallelität 4, kein Warten bei 429. | Große Läufe sind weder begrenzt noch robust. |
| R13 | `--record` verlangt eine Kalibrierung. | Widerspricht der Festlegung. |

Bewährt und bleibt: Erzeugen über Payload-Builder und Antwortprüfung der
Route, fortsetzbare Läufe mit Transkript, Tabelle ohne Herkunft mit
getrenntem Schlüssel, Bootstrap über Fälle, gepaarter Vergleich, geprüftes
Ledger, Trockenlauf.

### Nebenbei aufgefallen

Nicht Teil von P5, zur Entscheidung: `status.md` nennt drei der vier Routen;
die Specs sagen „nie im Hintergrund“, ADR-011 erlaubt die vorausschauende
Variante; die Zusammenfassung prüft nicht, ob `relations` auf vorhandene
Überschriften oder Stichwörter zeigen; ihr Antwortschema lässt `non_zdr` zu,
das keine Route mehr liefert.

## Versuchsaufbau

### Kandidat

Ein Kandidat ist Prompt (als Funktion der Anfrage), Werkzeugschema,
Ausgabegrenze, Modell und Reasoning. Ohne Angabe gilt, was die Route baut.

- `--model <kennung>` und `--reasoning <stufe>` ersetzen die beiden Felder
  im gebauten Payload.
- `--candidate <datei>` lädt ein TypeScript-Modul aus dem Datenordner, das
  den Systemprompt (und bei Bedarf Werkzeugschema oder Ausgabegrenze) aus
  Anfrage und gebautem Payload neu liefert. Kandidatendateien sind
  Versuchsmaterial und werden nicht versioniert.
- Jeder Lauf trägt einen Fingerabdruck: SHA-256 über Systemprompt,
  Werkzeugschema und Ausgabegrenze aller Fälle in fester Reihenfolge, ohne
  Nutzdaten und Modell. Ein fortgesetzter Lauf mit anderem Fingerabdruck
  bricht ab.
- Übernommen wird ein Kandidat, indem er in den Code der Route wandert und
  die Promptversion steigt. `score --record` nimmt „übernommen“ nur an, wenn
  der Code denselben Fingerabdruck baut wie der gemessene Lauf. So ist die
  Übertragung geprüft, ohne neu zu messen.

### Fallsätze

Drei Teile je Anfragetyp, nach Kategorie geschichtet und nach Gruppe
getrennt (eine Karte, eine Notiz oder ein Dokument liegt immer nur in einem
Teil):

| Teil | Anteil | Zweck | Wer liest Inhalte |
| --- | --- | --- | --- |
| Training (`train`) | 40 % | Fehleranalyse und Vorauswahl der Kandidaten | Optimierer |
| Entscheidung (`dev`) | 30 % | jede Runde: übernehmen oder verwerfen | nur Kennzahlen und Fallkennungen |
| Rückhalt (`holdout`) | 30 % | Baseline, Wellenende, Modellvergleich am Ende; der berichtete Wert | niemand vor Wellenende |

Da nichts gemessen ist, wird die heutige Aufteilung verworfen und neu
gezogen.

| Anfragetyp | Fälle | Zusammensetzung |
| --- | --- | --- |
| Varianten Frage/Antwort (mit Eintippen), Lückentext, Auswahl | je etwa 200 | etwa 80 Prüfkarten über die Kategorien, etwa 120 Korpusfälle (`cases --corpus`) |
| KI hilft | etwa 200 | jede Prüfkarte in allen drei Modi, Korpusfälle in Erklären und Beispiel |
| Karten aus einer Quelle | etwa 24 Dokumente | die fünf Prüfdokumente, dazu weitere Fächer und Formate und mindestens vier lange Quellen (über 60.000 Zeichen); je Dokument eine Liste von 10–30 Kernaussagen |
| Zusammenfassung | etwa 24 Materialsätze | Karten, Quelle und beides; je Satz Kernaussagen und zwei Einstellungsprofile aus einer paarweise deckenden Liste von etwa zwölf |

Was die Fallsätze enthalten müssen:

- **Varianten:** Eintippen; Ketten mit einer bis vier vorhandenen Varianten
  in `avoid`; Fälle, die „nicht umformulierbar“ erwarten, und knappe
  Fachkarten, die es nicht sind; Lückentexte, deren Lücke fast den ganzen
  Text trägt (dort umschreibt das Modell die Lösung außerhalb der Lücke,
  was die Routenprüfung nicht erkennt).
- **KI hilft:** „Freitext ohne echte Frage“ mit Dank, Bestätigung, eigenem
  Antwortversuch, Bitte wie „einfacher“, Unverständnis, Unsinn und Text ohne
  Kartenbezug; Folgefragen mit Verlauf.
- **Fallen** je kritischem Kriterium, in jedem Teil und getrennt
  ausgewiesen: Richtung und Reihenfolge, Verneinung, eingeschleuste
  Anweisungen, fachlich falsche Karten, in Quellen und Material eingebaute
  Widersprüche.
- Sprachen: überwiegend Deutsch, dazu Englisch und Vokabelkarten weiterer
  Sprachen.

Prüfkarten, Prüfdokumente und Kernaussagen entwirft die ausführende
Sitzung selbst, ohne fremde Texte; der Nutzer sieht je Anfragetyp eine
Stichprobe von zehn. Versioniert werden nur sie, Korpusfälle nie.

### Kriterien und Messgrößen

Ein Kriterium ist bestanden oder nicht; eine Messgröße ist eine Zahl je
Antwort oder Auftrag. Kritisch heißt: darf gegenüber dem Bestand nicht
schlechter werden.

| Anfragetyp | Automatisch | Richter | Messgrößen |
| --- | --- | --- | --- |
| Varianten | M1 Vertrag, M3 Zahlen und Begriffe zeichengenau, M4 erkennbar umformuliert, M5 Abstand zu `avoid`, M7 Eignung wie erwartet | **M2 fachlich gleich**, M6 Sprache, Schwierigkeit, Natürlichkeit | – |
| KI hilft | H0 Vertrag, H8 Format (höchstens 150 Wörter, kein Markdown) | H1 Sprache, **H2 fachlich korrekt**, H3–H5 je Modus, **H6 sicher und ehrlich**, H7 knapp und lernförderlich | – |
| Karten aus einer Quelle | Q1 Vertrag (Anfragen gültig, Anteil verworfener Karten) | je Karte mit ihren Belegstellen: **Q2 belegt**, Q3 fragt genau eine Sache, Q4 ohne Quelle verständlich und ohne Antwortverrat, Q5 Auswahloptionen plausibel und eindeutig; je Dokument: Q6 abgedeckte Kernaussagen | Karten gesamt und je 1.000 Zeichen, Anteil je Kartenform, Dubletten, Anteil belegter Stellen, letzte belegte Stelle, Abbruch an der Obergrenze |
| Zusammenfassung | Z1 Vertrag, Z2 Länge im Korridor, Z3 Darstellung wie gewählt, Z4 Stichwörter einmalig, Z5 Querbezüge zeigen auf Vorhandenes | je Abschnitt mit seinem belegten Material: **Z6 belegt und unverfälscht**, Z7 verständlich und zum Lernziel passend; je Zusammenfassung: Z8 abgedeckte Kernaussagen, Z9 eingebaute Widersprüche gemeldet | Wörter, Abschnitte, Anteil belegten Materials |

Kosten je Antwort, Latenz (Median, p90), Tokens, Vertragsablehnungen und
Zeitüberschreitungen sind bei jedem Anfragetyp feste Messgrößen.

- Bei Eintippen behält die App die Antwort der Karte. Geprüft wird deshalb
  über M2, ob die neue Frage noch genau diese Zeichenfolge erwartet.
- Bei „Karten aus einer Quelle“ ist der Fall ein Auftrag über das ganze
  Dokument (alle Abschnitte mit `avoid` und Restmenge wie in der App), in
  festen Profilen: Standard, alle Kartenformen, Kartenmenge (Weniger,
  Normal, Mehr). Der Richter sieht je Dokument eine Stichprobe von zehn
  Karten für Standard und für alle Kartenformen, von fünf für Weniger und
  Mehr (dort nur Q2).
- Der Hauptwert ist bei Varianten und KI hilft der Anteil der Antworten, die
  alle Hauptkriterien bestehen; bei Quellenkarten der Anteil bewerteter
  Karten mit Q2–Q4, bei der Zusammenfassung der Anteil der Abschnitte mit
  Z6 unter gültigen Z1–Z5. Bootstrap je Fall beziehungsweise je Dokument.
- Wo eine Regel prüfbar ist, gehört sie in die Antwortprüfung der Route und
  nicht in den Prompt (etwa Z5).

### Richter

- **Blöcke:** `table` schreibt Blöcke von höchstens 25 Einträgen oder etwa
  12.000 Zeichen, jeder mit dem Bogen. Einträge mit gemeinsamem Material
  (Karten eines Dokuments, Abschnitte einer Zusammenfassung) stehen in einem
  Block, das Material darin einmal. Je Block ein frischer Subagent
  `eval-judge`, höchstens sechs gleichzeitig. `score` nennt fehlende Blöcke;
  nur sie werden wiederholt.
- **Urteil:** je Kriterium bestanden oder nicht und eine Sicherheit von 1
  bis 3; eine Notiz bei jedem „nicht bestanden“ und bei Sicherheit unter 3.
- **Doppelurteile:** 10 % der neu bewerteten Einträge (mindestens zehn)
  stehen in zwei verschiedenen Blöcken. Der Anteil gekippter Urteile je
  Kriterium ist das Richterrauschen des Laufs.
- **Grenzfälle:** Der Bericht zeigt je Kriterium bis zu drei Einträge mit
  Eingabe, Ausgabe, Urteil und Notiz: zuerst gekippte, dann die mit der
  geringsten Sicherheit. Die Sitzung zeigt sie dem Nutzer mit jedem Bericht.
- **Urteilscache:** Ein Urteil gilt für Bogen, Kriterien, Eingabe und
  Ausgabe. Dieselbe Ausgabe bekommt in jedem Lauf dasselbe Urteil; das
  senkt den Richteraufwand späterer Runden und nimmt dem gepaarten Vergleich
  das Richterrauschen.
- **Fingerabdruck des Richters:** Hash über Bogen und Richterauftrag, dazu
  das Richtermodell als Pflichtangabe von `score`. Cache und Vergleich gelten
  nur innerhalb desselben Fingerabdrucks; ändert er sich, beginnt die Reihe
  mit einer neuen Baseline.
- **Ohne Kalibrierung:** Die Seite weist den Richter als nicht kalibriert
  aus. Die vorhandenen Kalibrierbefehle bleiben unberührt und sind kein Gate
  mehr.

### Auswertung und Entscheidung

- Zwei Wiederholungen je Fall; mehr Fälle schlagen mehr Wiederholungen.
- Eine Antwort ist: angenommen, von der Route abgelehnt (nur das
  Vertragskriterium fällt) oder Zeitüberschreitung (zählt als nicht
  bestanden und eigens als Zuverlässigkeit). Ratenlimit, Netz- und
  Schlüsselfehler bleiben offen und werden mit Wartezeit wiederholt.
- **Übernommen** wird am Entscheidungsteil, wenn der gepaarte Abstand zum
  Bestand über dem Rauschen liegt, kein kritisches Kriterium mehr Fehler hat
  und Kosten je Antwort und Latenz p90 höchstens das 1,2-Fache betragen.
- **Vereinfachungen** (kürzerer Prompt, niedrigeres Reasoning) gelten als
  übernommen, wenn der Abstand nicht negativ ist und im Rauschen liegt.
- Seltene kritische Fehler: Fehler je Antworten der Fallen; bei null
  Fehlern steht die Obergrenze 3/n dabei.
- **Rückhalt:** gemessen zur Baseline und am Wellenende. Liegt der Gewinn
  dort unter der Hälfte des Gewinns am Entscheidungsteil, ist die Reihe
  überangepasst: anhalten und den Entscheidungsteil vergrößern.
- Ehrliche Grenze: Mit etwa 60 Fällen im Entscheidungsteil sind
  Verbesserungen unter etwa drei Punkten je Runde nicht belegbar.

### Hillclimb je Anfragetyp

1. **Baseline** des Codes auf allen drei Teilen; Eintrag im Ledger.
2. **Fehleranalyse** am Trainingsteil: Fehler nach Kriterium und Kategorie,
   die drei häufigsten Muster mit Beispielen.
3. **Drei bis fünf Kandidaten**, jeder mit genau einem Hebel gegen ein
   Muster: Satz ändern, streichen oder umstellen; Beispiel ergänzen oder
   entfernen; Werkzeugschema (Feldreihenfolge, Beschreibungen, ein Prüffeld
   vor der Antwort); Reasoning-Stufe; Ausgabegrenze; Form der Nutzdaten;
   eine Regel als Prüfung der Route statt als Promptsatz.
4. **Vorauswahl** am Trainingsteil: höchstens zwei Kandidaten, die das
   Muster beheben, ohne neue Fehler zu bringen.
5. **Messung** am Entscheidungsteil, Entscheidung nach der Regel oben. Jeder
   gemessene Kandidat steht im Ledger, auch verworfen.
6. **Ende:** Ziel am Entscheidungsteil erreicht und Fallen fehlerfrei, oder
   drei Runden ohne Übernahme, oder acht Runden, oder Budget.
7. **Kürzungsrunde:** Sätze einzeln streichen, die sich nicht belegen
   lassen (etwa das Beispiel zu „Wie viele …“); Regel für Vereinfachungen.
8. **Rückhalt** messen.

### Strukturversuche zu „Karten aus einer Quelle“

Nach den Promptrunden, auf denselben Dokumenten und den langen Quellen:

- **Kartenmenge:** Weniger, Normal und Mehr ergaben am 2026-11-22 77, 76
  und 77 Vorschläge ([Verlauf](history.md)). Ziel: Weniger höchstens 60 %
  und Mehr mindestens 140 % von Normal, ohne Füllkarten und bei gleichem Q2.
  Danach die Dichten in `AI_SOURCE_AMOUNTS` neu messen.
- **Zerlegung:** (a) Abschnitte wie heute; (b) die ganze Quelle als Kontext
  in jeder Anfrage, Karten nur für den markierten Abschnitt; (c) erst eine
  Gliederung mit Kernaussagen und Kartenbudget je Abschnitt, dann die
  Abschnitte mit dieser Gliederung. Heute trennt (a) Zusammenhänge über
  Abschnitte, gewichtet „zentral“ nur je Abschnitt, verbraucht die
  Obergrenze von 100 Vorschlägen von vorn und erkennt Dopplungen nur am
  Fragetext. Verglichen werden Q2, Q6, Verteilung über die Quelle,
  abschnittsübergreifende Fragen, Dubletten, Kosten und Laufzeit. Bei Luna
  kostet eine Quelle von 400.000 Zeichen als Kontext etwa 1 Cent je Anfrage;
  die Grenze von (b) ist die Laufzeit, nicht der Preis. Gewinnt (b) oder
  (c), braucht das eine Ergänzung von ADR-011.
- **Reste nach `source-cards-v2`:** Single Choice wird nie gewählt;
  Tabellenzeilen mit zwei Angaben ergeben Doppelfragen (Q3).

### Modellvergleich

- **Erster Vergleich** nach der Baseline: Prompts des Codes, alle
  Anfragetypen, Entscheidungsteil. Er zeigt, ob ein anderes Modell besser
  oder billiger ist, bevor Arbeit in Prompts für Luna fließt.
- **Zweiter Vergleich** am Wellenende: beste Prompts und Baseline-Prompts
  auf dem Rückhalt, für die drei besten Modelle des ersten Vergleichs. Er
  zeigt, ob der Gewinn auf andere Modelle übergeht.
- Für Luna zusätzlich die Reasoning-Stufen unter und über `low`.
- Ein Vergleichslauf setzt nie den Bestand. Meldet OpenRouter
  `no_provider_endpoint`, steht das Modell als „kein ZDR-Endpunkt“ in der
  Übersicht; der Lauf bricht nicht ab.

### Übersichten

`ai-eval.html` entsteht weiter aus dem Ledger:

- **Bestand** je Anfragetyp, ergänzt um Richterrauschen und Fallen.
- **Verlauf** je Anfragetyp wie heute.
- **Modellvergleich** (neu): je Anfragetyp eine Zeile je Modell und
  Reasoning mit Hauptwert und Intervall, kritischen Kriterien,
  Vertragsablehnungen, Zeitüberschreitungen, Kosten je Antwort und Latenz;
  dazu ein Diagramm Hauptwert gegen Kosten je Antwort.
- **Bilanz** (neu): Läufe, Antworten, Kosten gesamt, bewertete Einträge und
  Anteil aus dem Cache, je Anfragetyp Baseline, bester Stand und Ziel.

Der Bericht je Lauf mit Grenzfällen und Fehlerliste bleibt lokal, weil er
Inhalte zeigt.

### Daten und Kosten

| Ort | Inhalt | In Git |
| --- | --- | --- |
| `fixtures/ai-eval/` | Prüfkarten, Kernaussagen, Ledger, je eingetragenem Lauf eine Ergebnisdatei ohne Inhalte (Fall, Wiederholung, Kriterien, Kosten, Latenz) | ja |
| `CORE_AI_EVAL_DIR` (Benutzer-Umgebungsvariable; ohne sie `output/ai-eval`) | Korpusfälle, Antworten mit Transkript, Blöcke, Urteile, Cache, Kandidaten, Berichte | nein |

Der gepaarte Vergleich liest die versionierte Ergebnisdatei des Bestands und
hängt damit an keinem Worktree.

| Posten | Schätzung |
| --- | --- |
| Variante, KI hilft | 0,0001–0,0002 USD je Antwort |
| Karten aus einer Quelle | 0,001–0,003 USD je Abschnitt |
| Zusammenfassung | 0,005–0,03 USD |
| Baseline aller Anfragetypen | etwa 2 USD |
| eine Runde Varianten oder KI hilft | etwa 0,15 USD |
| eine Runde Karten aus einer Quelle | etwa 0,50 USD |
| eine Runde Zusammenfassung | etwa 1 USD |
| erster Modellvergleich | 5–6 USD |

`generate` bricht ab, sobald die Kosten des Laufs `--budget` übersteigen;
das Limit des Schlüssels bleibt die zweite Bremse. Runden zu Quellenkarten
und Zusammenfassung laufen ohne die langen Quellen und Materialsätze; die
kommen nur zur Baseline, in den Strukturversuchen und am Wellenende dran.

Den Richter trägt die Subscription. Die Baseline aller Anfragetypen sind
etwa 200 Blöcke, eine Runde danach 5–15. Stellschraube ist die Fallzahl je
Anfragetyp.

## Arbeitspakete

Buchstaben wie in `todo.md`. Jedes Paket ist ein Pull Request mit
`npm run typecheck`, den Modultests unter `scripts/aiEval/`, einem
Trockenlauf von `cases` bis `score` und `npm run check:docs`.

| Paket | Änderungen | Fertig, wenn |
| --- | --- | --- |
| A Grundsätze und Zugang | ADR-049 neu fassen: Generator nur OpenRouter, Kandidat mit Modell, drei Teile, Richter Opus in Blöcken ohne Kalibrierung mit Grenzfällen, Übernahme über den Fingerabdruck. `operations.md`: Limit und `CORE_AI_EVAL_DIR`. `status.md` nennt alle vier Routen. | ADR-049 angenommen; Schlüssel und Ordner vom Nutzer gesetzt |
| B Runner reparieren | `generate.ts`: Antwortklassen statt Codeliste (R1, R3), Fingerabdruck (R4), `--budget`, `--concurrency`, Warten bei 429 (R12). `definitions.ts`: M7 mit `expect` je Fall (R2), H0 und H8 (R8). `cases.ts`: drei Teile, Gruppen (R9), Neuaufteilung. `runner.test.ts`. | Trockenlauf mit nachgebildeten Ablehnungen und Zeitüberschreitung endet vollständig |
| C Kandidaten und Richter | `cli.ts`, `generate.ts`: `--model`, `--reasoning`, `--candidate` (R11). `judge.ts`, `eval-judge.md`, Skill: Blöcke, Sicherheit, Doppelurteile, Cache, Fingerabdruck (R6, R7). `--record` ohne Kalibrierung (R13). | Zwei Kandidaten laufen nebeneinander; ein Block je Subagent; ein zweiter Lauf mit gleichen Ausgaben braucht keinen Richter |
| D Auswertung und Übersicht | `definitions.ts`: Auftrag aus mehreren Anfragen, Messgrößen (R10). `score.ts`: Entscheidungsregel, Fallen, Zuverlässigkeit, Grenzfälle im Bericht. `ledger.ts`: Art des Laufs, Teil, Fingerabdrücke, Richterangaben, Messgrößen; Ergebnisdateien (R5). `page.ts`: Modellvergleich und Bilanz. `ai-eval.md`. | Seite zeigt beide neuen Abschnitte aus einem Testledger; Vergleich läuft ohne `output/` |
| E Fallsätze Varianten und KI hilft | Prüfkarten nach „Fallsätze“ schreiben, Korpusfälle ziehen. | je Anfragetyp etwa 200 Fälle in drei Teilen; Stichprobe vom Nutzer gesehen |
| F Karten aus einer Quelle | Registereintrag, Definition auf Dokumentebene über `runAiSourceCards` mit Payload-Builder und Antwortprüfung der Route, Profile, Prüfdokumente und Kernaussagen. | Trockenlauf über alle Dokumente; die Messung vom 2026-11-22 ist mit dem Runner nachgestellt |
| G Zusammenfassung | Definition, Materialsätze, Kernaussagen, Profile. | Trockenlauf; ein echter Lauf über drei Materialsätze |
| H Baseline und erster Modellvergleich | Messen, eintragen, `npm run docs:build`. | Ledger und Seite; **Haltepunkt:** Nutzer legt Zielwerte, Referenzmodell und Reihenfolge fest |
| I Hillclimb, erste Welle | je Anfragetyp ein Pull Request mit Promptänderung, neuer Version und Ledger-Einträgen; Strukturversuche. | Abbruchregel je Anfragetyp erreicht |
| J Abschluss | Rückhalt, zweiter Modellvergleich, Kostenziele nach `operations.md`, `status.md`, `history.md`, Reste nach `todo.md`, diese Datei löschen. | Seite zeigt Bestand, Verlauf, Modellvergleich und Bilanz |

Freigaben: Ein bezahlter Lauf braucht keine Einzelfreigabe mehr, solange
er im Budget seines Pakets bleibt (B–G 2 USD für Probeläufe, H 8 USD, I
20 USD, J 8 USD); die Sitzung nennt vor jedem Lauf Anfragetyp, Fallzahl und
erwartete Kosten. Ein Eintrag ins Ledger braucht keine Rückfrage, wenn die
Gates halten. Ein geänderter Prompt erreicht `main` nur über den Pull
Request, den der Nutzer freigibt.

## Zielwerte (Entwurf)

Festgelegt werden sie am Haltepunkt von Paket H.

| Anfragetyp | Hauptwert am Rückhalt | Kritisch | Weitere |
| --- | --- | --- | --- |
| Varianten | ≥ 95 % | Fallen zu Richtung, Reihenfolge und Verneinung: 0 Fehler bei mindestens 120 Antworten | Kosten höchstens das 1,2-Fache der Baseline, Latenz p90 ≤ 4 s |
| KI hilft | ≥ 90 % | H2: höchstens 2 Fehler je 100 Antworten; H6: 0 Fehler in den Fallen bei mindestens 90 Antworten | Streaming erst, wenn die Latenz im Median über 4 s liegt |
| Karten aus einer Quelle | ≥ 90 % | Q2 ≥ 98 % der bewerteten Karten | Q6 ≥ 80 % bei Normal, keine Dubletten, Kartenmenge 60 % und 140 %, jede erlaubte Form kommt vor, wo das Dokument sie trägt |
| Zusammenfassung | ≥ 95 % | Z6 ≥ 98 % der Abschnitte | Z2 ≥ 90 %, Z8 ≥ 80 %, jeder eingebaute Widerspruch gemeldet |

## Risiken

- **Richter ohne Kalibrierung:** Ein systematischer Fehler bleibt
  unsichtbar. Dagegen stehen automatische Kriterien, wo immer eine Regel
  prüfbar ist, das Richterrauschen und die Grenzfälle je Bericht.
- **Richter und Haiku vom selben Hersteller:** Im Modellvergleich kann Opus
  Haiku bevorzugen. Fällt Haiku dort auf, braucht die Entscheidung einen
  zweiten Richter.
- **Limits der Subscription:** Die Baseline sind etwa 200 Richterblöcke. Sie
  läuft je Anfragetyp getrennt und lässt sich fortsetzen.
- **Selbst geschriebene Fälle:** Sie sind leichter als echte Karten.
  Deshalb die Korpusfälle und die Fallen.
- **ZDR-Endpunkte:** Nicht jedes Vergleichsmodell hat einen; die Liste steht
  erst nach dem ersten Vergleich fest.

## Bewusst nicht enthalten

Handkalibrierung und Kontrolleinträge, ein zweiter Richter, ein Richter über
die API, ein Generator über eine Subscription, die Batch-Endpunkte, eine
Bibliothek zur automatischen Promptoptimierung, ein Lauf in CI, der
Modellwechsel selbst und das KI-Kontingent.
