# Betriebssysteme und Rechnernetze

Dieser Lehrtext führt in zwei Grundlagenfächer des Informatikstudiums ein, die eng zusammengehören. Ein Betriebssystem verwaltet die Betriebsmittel eines einzelnen Rechners: Prozessor, Hauptspeicher, Geräte und Dateien. Ein Rechnernetz verbindet viele solcher Rechner, damit Programme auf verschiedenen Maschinen Daten austauschen können. Beide Fächer beantworten im Kern dieselbe Frage: Wie teilen sich viele Beteiligte knappe Ressourcen, ohne sich gegenseitig zu stören?

Der erste Teil behandelt Prozesse und Threads, die Zuteilung des Prozessors durch Scheduling-Verfahren, die Synchronisation nebenläufiger Abläufe einschließlich Verklemmungen, die Speicherverwaltung mit virtuellem Speicher sowie Dateisysteme. Der zweite Teil behandelt die Schichtenmodelle OSI und TCP/IP, die IP-Adressierung mit Subnetzen, die Transportprotokolle TCP und UDP, das Domain Name System sowie HTTP und TLS.

## Aufgaben eines Betriebssystems

Ein Betriebssystem erfüllt zwei Hauptaufgaben. Erstens abstrahiert es die Hardware: Anwendungen arbeiten mit Dateien, Prozessen und Sockets statt mit Plattensektoren, Interrupt-Leitungen und Netzwerkkarten. Zweitens verwaltet es die Betriebsmittel und verteilt sie gerecht und sicher auf die laufenden Programme. Ohne Betriebssystem müsste jedes Programm seine Geräte selbst ansteuern und könnte ungehindert in den Speicher anderer Programme schreiben.

### Kernel und Benutzermodus

Moderne Prozessoren kennen mindestens zwei Privilegstufen. Im Kernelmodus (auch Systemmodus) darf der Code alle Maschinenbefehle ausführen, auf alle Speicherbereiche zugreifen und Geräte direkt ansteuern. Im Benutzermodus sind privilegierte Befehle gesperrt; versucht ein Programm dennoch, einen solchen Befehl auszuführen, löst der Prozessor eine Ausnahme aus, und das Betriebssystem übernimmt die Kontrolle.

Der Kern des Betriebssystems, der Kernel, läuft im Kernelmodus. Anwendungen laufen im Benutzermodus. Diese Trennung ist die Grundlage für Schutz und Stabilität: Ein fehlerhaftes Anwendungsprogramm kann nur sich selbst zum Absturz bringen, nicht aber den Kernel oder andere Programme.

### Systemaufrufe

Braucht eine Anwendung einen Dienst des Betriebssystems, etwa das Lesen einer Datei, ruft sie einen Systemaufruf (System Call) auf. Dabei wechselt der Prozessor über einen speziellen Befehl kontrolliert in den Kernelmodus und springt an eine vom Kernel festgelegte Einsprungadresse. Die Anwendung kann also nicht an beliebiger Stelle in den Kernel springen, sondern nur über die vorgesehenen Eingänge.

Typische Systemaufrufe unter Unix-artigen Systemen sind:

- `open`, `read`, `write` und `close` für Dateien,
- `fork`, `exec`, `wait` und `exit` für Prozesse,
- `mmap` für das Einblenden von Speicherbereichen,
- `socket`, `connect`, `send` und `recv` für Netzwerkverbindungen.

Ein Systemaufruf ist deutlich teurer als ein gewöhnlicher Funktionsaufruf, weil Privilegstufe und oft auch Teile des Prozessorzustands gewechselt werden müssen. Programme puffern deshalb Ein- und Ausgaben, um die Zahl der Systemaufrufe klein zu halten.

### Kernelarchitekturen

Bei einem monolithischen Kernel laufen Gerätetreiber, Dateisysteme und Netzwerkstapel gemeinsam im Kernelmodus und im selben Adressraum. Das ist schnell, weil Aufrufe zwischen den Teilen einfache Funktionsaufrufe sind, aber ein Fehler in einem Treiber kann das ganze System lahmlegen. Linux ist im Kern monolithisch, lädt aber Treiber als Module nach.

Ein Mikrokernel enthält nur das Nötigste: Adressraumverwaltung, Scheduling und Nachrichtenaustausch zwischen Prozessen. Treiber und Dateisysteme laufen als eigene Prozesse im Benutzermodus. Das erhöht die Robustheit, kostet aber Leistung, weil jede Anfrage über Nachrichten zwischen Prozessen läuft. Viele heutige Systeme sind Mischformen, die man als hybride Kernel bezeichnet.

### Unterbrechungen

Geräte melden Ereignisse über Unterbrechungen (Interrupts). Wenn etwa die Netzwerkkarte ein Paket empfangen hat, unterbricht sie den Prozessor; dieser sichert den aktuellen Zustand und führt die zugehörige Unterbrechungsbehandlung im Kernel aus. Ohne Interrupts müsste das Betriebssystem alle Geräte ständig abfragen (Polling), was Rechenzeit verschwendet.

Man unterscheidet Hardware-Interrupts, die von Geräten ausgelöst werden, von Ausnahmen (Exceptions), die der Prozessor selbst bei der Befehlsausführung auslöst, etwa bei einer Division durch null oder einem Zugriff auf eine nicht eingeblendete Speicherseite. Ein Timer-Interrupt, der in festen Abständen eintrifft, ist die Voraussetzung dafür, dass das Betriebssystem einem laufenden Programm den Prozessor überhaupt entziehen kann.

## Prozesse und Threads

Ein Programm ist eine passive Datei mit Maschinencode. Ein Prozess ist ein Programm in Ausführung. Zu einem Prozess gehören sein Adressraum mit Code, Daten, Heap und Stack, die Registerinhalte einschließlich des Befehlszählers, die geöffneten Dateien und weitere Verwaltungsinformationen. Dasselbe Programm kann gleichzeitig in mehreren Prozessen laufen, etwa wenn zwei Benutzer denselben Editor starten.

### Der Prozesskontrollblock

Für jeden Prozess führt der Kernel einen Prozesskontrollblock (Process Control Block, PCB). Er enthält unter anderem:

- die Prozessnummer (PID) und die Nummer des Elternprozesses,
- den Prozesszustand,
- die gesicherten Register und den Befehlszähler,
- Informationen zur Speicherverwaltung, etwa einen Verweis auf die Seitentabelle,
- die Liste der geöffneten Dateien,
- Scheduling-Informationen wie Priorität und verbrauchte Rechenzeit.

### Prozesszustände

Ein Prozess durchläuft während seiner Lebenszeit mehrere Zustände. Im Zustand „neu“ wird er gerade angelegt. Im Zustand „bereit“ könnte er rechnen, wartet aber darauf, dass ihm der Scheduler einen Prozessor zuteilt. Im Zustand „laufend“ führt ein Prozessor seine Befehle aus. Im Zustand „blockiert“ (auch „wartend“) wartet er auf ein Ereignis, etwa auf das Ende einer Plattenoperation oder auf eine Tastatureingabe. Im Zustand „beendet“ hat er seine Arbeit abgeschlossen, und der Kernel gibt seine Ressourcen frei.

Wichtig sind die erlaubten Übergänge. Ein laufender Prozess wird blockiert, wenn er auf ein Ereignis wartet; tritt das Ereignis ein, wird er bereit und nicht sofort laufend. Ein blockierter Prozess kann also niemals direkt in den Zustand „laufend“ wechseln, sondern muss immer zuerst bereit werden und auf die Zuteilung warten. Ein laufender Prozess kann außerdem zurück in den Zustand „bereit“ versetzt werden, wenn der Scheduler ihm den Prozessor entzieht, etwa weil seine Zeitscheibe abgelaufen ist.

Auf einem Rechner mit einem Prozessorkern ist zu jedem Zeitpunkt höchstens ein Prozess im Zustand „laufend“. Auf einem Rechner mit vier Kernen können höchstens vier Prozesse gleichzeitig laufen; alle übrigen sind bereit, blockiert oder in einem der anderen Zustände.

### Kontextwechsel

Beim Kontextwechsel sichert der Kernel den Zustand des bisher laufenden Prozesses in dessen PCB und lädt den Zustand des nächsten Prozesses aus seinem PCB. Während des Wechsels leistet das System keine nützliche Arbeit für die Anwendungen; der Kontextwechsel ist reiner Verwaltungsaufwand. Hinzu kommen indirekte Kosten, weil die Caches und der TLB nach dem Wechsel Daten des neuen Prozesses erst wieder laden müssen. Zu häufige Kontextwechsel verschlechtern deshalb den Durchsatz.

### Prozesserzeugung unter Unix

Unter Unix erzeugt der Systemaufruf `fork` eine nahezu exakte Kopie des aufrufenden Prozesses. Beide Prozesse setzen die Ausführung direkt nach dem Aufruf fort. Sie unterscheiden sich am Rückgabewert: Der Kindprozess erhält 0, der Elternprozess erhält die PID des Kindes. Schlägt `fork` fehl, erhält der Elternprozess −1, und es entsteht kein Kind.

Damit das Kopieren nicht teuer wird, kopiert der Kernel den Adressraum nicht sofort, sondern nutzt das Verfahren Copy-on-Write: Eltern- und Kindprozess teilen sich zunächst alle Speicherseiten schreibgeschützt. Erst wenn einer der beiden eine Seite verändert, wird genau diese Seite kopiert.

Der Systemaufruf `exec` ersetzt das Programm im aktuellen Prozess durch ein neues Programm; die PID bleibt dabei erhalten. Eine Shell startet einen Befehl daher typischerweise mit `fork` und ruft im Kindprozess `exec` auf. Mit `wait` wartet der Elternprozess auf das Ende des Kindes und holt dessen Rückgabewert ab.

Ein beendeter Prozess, dessen Rückgabewert der Elternprozess noch nicht mit `wait` abgeholt hat, heißt Zombie. Er belegt keinen Speicher mehr, aber noch einen Eintrag in der Prozesstabelle. Stirbt der Elternprozess vor dem Kind, wird das Kind zum Waisen und von einem Systemprozess übernommen, unter Linux traditionell vom Prozess mit der PID 1.

### Threads

Ein Thread ist ein Ausführungsstrang innerhalb eines Prozesses. Alle Threads eines Prozesses teilen sich den Adressraum, die globalen Daten, den Heap und die geöffneten Dateien. Jeder Thread hat jedoch seinen eigenen Befehlszähler, seine eigenen Register und seinen eigenen Stack. Weil Threads sich den Adressraum teilen, ist das Erzeugen eines Threads und der Wechsel zwischen Threads desselben Prozesses deutlich billiger als bei Prozessen.

Threads lohnen sich in zwei Situationen. Auf Mehrkernprozessoren können mehrere Threads eines Prozesses tatsächlich gleichzeitig rechnen. Und auch auf einem einzigen Kern kann ein Programm weiterarbeiten, während einer seiner Threads auf eine Eingabe oder Ausgabe wartet. Der Preis dafür ist, dass Threads ohne Schutz gegenseitig ihre Daten verändern können; deshalb ist Synchronisation nötig.

Man unterscheidet Benutzer-Threads und Kernel-Threads. Benutzer-Threads verwaltet eine Bibliothek im Benutzermodus, ohne dass der Kernel sie kennt. Ihr Wechsel ist sehr schnell, aber wenn ein Benutzer-Thread einen blockierenden Systemaufruf ausführt, blockiert der ganze Prozess, weil der Kernel nur den Prozess sieht. Außerdem können reine Benutzer-Threads eines Prozesses nicht auf mehrere Kerne verteilt werden. Kernel-Threads kennt und plant der Kernel selbst; blockiert einer, können die anderen weiterlaufen. Linux und Windows bilden heute jeden Thread einer Anwendung auf einen eigenen Kernel-Thread ab (1:1-Modell).

### Prozesse oder Threads?

Prozesse bieten Isolation: Stürzt ein Prozess ab, laufen die anderen weiter, und ein Prozess kann den Speicher eines anderen nicht lesen. Threads bieten schnelle Kommunikation über gemeinsamen Speicher, aber keine Isolation: Ein fehlerhafter Thread kann den ganzen Prozess zum Absturz bringen. Webbrowser verwenden aus diesem Grund für jede Webseite oder Gruppe von Seiten einen eigenen Prozess, damit ein Fehler in einer Seite nicht den ganzen Browser beendet.

Prozesse kommunizieren über Mechanismen der Interprozesskommunikation, etwa Pipes, Nachrichtenwarteschlangen, Sockets oder ausdrücklich angelegten gemeinsamen Speicher. Eine Pipe überträgt einen Bytestrom in genau eine Richtung; für Kommunikation in beide Richtungen braucht man zwei Pipes.

## Scheduling-Verfahren

Der Scheduler entscheidet, welcher bereite Prozess oder Thread als Nächstes einen Prozessor erhält. Die eigentliche Umschaltung übernimmt der Dispatcher. Weil es meist mehr bereite Threads als Kerne gibt, ist diese Entscheidung ständig zu treffen.

### Ziele und Kennzahlen

Ein Scheduler verfolgt mehrere, teils widersprüchliche Ziele:

- hohe Prozessorauslastung, damit der Prozessor möglichst selten untätig ist,
- hoher Durchsatz, also viele abgeschlossene Aufträge je Zeiteinheit,
- kurze Durchlaufzeit (Turnaround), also die Zeit von der Ankunft bis zur Fertigstellung eines Auftrags,
- kurze Wartezeit, also die Summe der Zeit, die ein Auftrag im Zustand „bereit“ verbringt,
- kurze Antwortzeit, also die Zeit bis zur ersten Reaktion, die für interaktive Programme entscheidend ist,
- Fairness, damit kein Prozess dauerhaft benachteiligt wird.

Die Wartezeit eines Auftrags berechnet man als Durchlaufzeit minus Rechenzeit. Wer etwa um 2 ankommt, 9 Zeiteinheiten Rechenzeit braucht und um 26 fertig ist, hat eine Durchlaufzeit von 24 und eine Wartezeit von 15.

### Nicht unterbrechende und unterbrechende Verfahren

Bei nicht unterbrechendem (kooperativem) Scheduling behält ein Prozess den Prozessor, bis er ihn selbst abgibt, weil er blockiert oder endet. Bei unterbrechendem (präemptivem) Scheduling kann das Betriebssystem einem laufenden Prozess den Prozessor entziehen, etwa per Timer-Interrupt oder weil ein wichtigerer Prozess bereit geworden ist. Alle heutigen Desktop- und Serverbetriebssysteme verwenden präemptives Scheduling, weil sonst ein einziges Programm in einer Endlosschleife das ganze System blockieren könnte.

### First Come, First Served

Beim Verfahren First Come, First Served (FCFS) erhalten die Prozesse den Prozessor in der Reihenfolge ihrer Ankunft und behalten ihn bis zum Ende ihres Rechenabschnitts. FCFS ist einfach und verhungert niemanden, ist aber nicht unterbrechend und anfällig für den Konvoi-Effekt: Ein langer Prozess am Anfang der Warteschlange lässt viele kurze Prozesse hinter sich warten, wodurch die mittlere Wartezeit stark steigt.

### Shortest Job First und Shortest Remaining Time First

Shortest Job First (SJF) wählt unter den bereiten Prozessen den mit der kürzesten nächsten Rechenzeit. Für nicht unterbrechende Verfahren liefert SJF nachweislich die kleinste mittlere Wartezeit. Die unterbrechende Variante heißt Shortest Remaining Time First (SRTF): Trifft ein neuer Prozess ein, dessen Rechenzeit kürzer ist als die Restlaufzeit des laufenden Prozesses, wird der laufende Prozess verdrängt.

Beide Verfahren haben zwei Nachteile. Erstens kennt das Betriebssystem die künftige Rechenzeit nicht, sondern kann sie nur schätzen, meist mit einem exponentiell gewichteten Mittelwert der bisherigen Rechenabschnitte. Zweitens können lange Prozesse verhungern (Starvation), wenn immer wieder kürzere Prozesse eintreffen.

### Round Robin

Round Robin (RR) teilt jedem Prozess der Reihe nach eine feste Zeitscheibe (Quantum) zu, typischerweise einige Millisekunden. Ist die Zeitscheibe abgelaufen und der Prozess noch nicht fertig, wird er unterbrochen und an das Ende der Bereit-Warteschlange gestellt. Round Robin ist fair und sorgt für gute Antwortzeiten, hat aber meist eine höhere mittlere Durchlaufzeit als SJF.

Die Wahl der Zeitscheibe ist entscheidend. Ist sie sehr groß, verhält sich Round Robin wie FCFS. Ist sie sehr klein, verbringt das System einen großen Teil der Zeit mit Kontextwechseln. Als Faustregel sollte die Zeitscheibe so lang sein, dass etwa 80 Prozent der Rechenabschnitte innerhalb einer Zeitscheibe enden.

### Beispiel zum Vergleich

Vier Prozesse treffen nacheinander ein: P1 zum Zeitpunkt 0 mit 8 Zeiteinheiten Rechenzeit, P2 zum Zeitpunkt 1 mit 4, P3 zum Zeitpunkt 2 mit 9 und P4 zum Zeitpunkt 3 mit 5 Zeiteinheiten. Die mittleren Wartezeiten der Verfahren ergeben sich wie folgt:

- FCFS rechnet in der Reihenfolge P1, P2, P3, P4; die Wartezeiten sind 0, 7, 10 und 18, im Mittel also 8,75.
- Nicht unterbrechendes SJF rechnet P1, P2, P4, P3; die mittlere Wartezeit beträgt 7,75.
- SRTF verdrängt P1 zum Zeitpunkt 1 durch P2, rechnet danach P4, dann den Rest von P1 und zuletzt P3; die mittlere Wartezeit beträgt 6,5.
- Round Robin mit einer Zeitscheibe von 4 kommt auf eine mittlere Wartezeit von 11,75, reagiert aber auf jeden Prozess spätestens nach wenigen Zeitscheiben.

Das Beispiel zeigt den typischen Zielkonflikt: SRTF minimiert die Wartezeit, Round Robin optimiert die Reaktionsfähigkeit.

### Prioritäten und mehrstufige Warteschlangen

Beim Prioritäts-Scheduling erhält jeder Prozess eine Priorität, und der bereite Prozess mit der höchsten Priorität rechnet. Das Risiko ist wieder das Verhungern von Prozessen niedriger Priorität. Die übliche Abhilfe heißt Altern (Aging): Je länger ein Prozess wartet, desto höher steigt seine Priorität, bis er schließlich an die Reihe kommt.

Ein besonderes Problem ist die Prioritätsinversion. Sie entsteht, wenn ein Prozess hoher Priorität auf eine Sperre wartet, die ein Prozess niedriger Priorität hält, und dieser wiederum von einem Prozess mittlerer Priorität verdrängt wird. Dann wartet der wichtigste Prozess indirekt auf einen unwichtigeren. Abhilfe schafft die Prioritätsvererbung: Der Sperrinhaber erhält vorübergehend die Priorität des höchsten Wartenden, bis er die Sperre freigibt.

Die mehrstufige Rückkopplungswarteschlange (Multilevel Feedback Queue) kombiniert mehrere Warteschlangen unterschiedlicher Priorität. Ein neuer Prozess beginnt in der obersten Schlange mit kurzer Zeitscheibe. Verbraucht er seine Zeitscheibe vollständig, gilt er als rechenintensiv und rutscht eine Stufe nach unten, wo die Zeitscheiben länger, die Prioritäten aber niedriger sind. Gibt er den Prozessor vor Ablauf ab, weil er auf Eingaben wartet, bleibt er oben. So werden interaktive Programme bevorzugt, ohne dass das Verfahren die Rechenzeiten im Voraus kennen muss.

### Scheduling in der Praxis

Der Linux-Scheduler Completely Fair Scheduler (CFS) verteilte die Rechenzeit lange Zeit nach dem Prinzip der virtuellen Laufzeit: Es rechnet immer der Thread, der bisher am wenigsten gewichtete Rechenzeit erhalten hat. Seit Version 6.6 verwendet Linux das Verfahren EEVDF, das dieselbe Fairness mit besserer Berücksichtigung von Antwortzeiten verbindet. Für Echtzeitaufgaben bietet Linux zusätzlich feste Prioritätsklassen, die immer Vorrang vor gewöhnlichen Threads haben.

Bei Echtzeitsystemen kommt es nicht auf die mittlere, sondern auf die garantierte Reaktionszeit an. Ein hartes Echtzeitsystem gilt als fehlerhaft, wenn eine Frist auch nur einmal überschritten wird, etwa bei der Steuerung eines Airbags. Bei weicher Echtzeit, etwa bei der Videowiedergabe, sind gelegentliche Überschreitungen ärgerlich, aber hinnehmbar.

## Synchronisation

Sobald mehrere Threads oder Prozesse auf gemeinsame Daten zugreifen, hängt das Ergebnis unter Umständen von der zufälligen Reihenfolge ihrer Ausführung ab. Eine solche Situation heißt Wettlaufsituation (Race Condition). Sie ist besonders tückisch, weil der Fehler nur selten und kaum reproduzierbar auftritt.

### Ein einfaches Beispiel

Zwei Threads erhöhen jeweils eine gemeinsame Variable `zaehler` um eins. Die Anweisung `zaehler = zaehler + 1` besteht auf Maschinenebene aus drei Schritten: Wert laden, im Register erhöhen, Wert zurückschreiben. Lädt der erste Thread den Wert 5 und wird dann unterbrochen, lädt der zweite Thread ebenfalls 5, erhöht auf 6 und schreibt 6 zurück. Danach schreibt auch der erste Thread 6 zurück. Statt 7 steht am Ende 6 im Speicher; eine Erhöhung ist verloren gegangen.

### Kritischer Abschnitt

Ein kritischer Abschnitt ist ein Programmteil, in dem auf gemeinsame Daten zugegriffen wird. Eine korrekte Lösung des Problems des kritischen Abschnitts muss drei Bedingungen erfüllen:

1. Wechselseitiger Ausschluss: Höchstens ein Thread befindet sich zu jedem Zeitpunkt im kritischen Abschnitt.
2. Fortschritt: Wenn sich niemand im kritischen Abschnitt befindet und jemand hinein will, darf diese Entscheidung nicht unbegrenzt aufgeschoben werden.
3. Begrenztes Warten: Nachdem ein Thread den Eintritt verlangt hat, dürfen andere Threads nur begrenzt oft vor ihm eintreten.

Das bloße Abschalten von Interrupts ist keine allgemeine Lösung. Es funktioniert nur auf Einprozessorsystemen und nur im Kernelmodus; auf Mehrkernprozessoren laufen die anderen Kerne trotzdem weiter, und Anwendungen dürfen Interrupts ohnehin nicht abschalten.

### Atomare Befehle und Spinlocks

Moderne Prozessoren bieten atomare Befehle, die Lesen und Schreiben einer Speicherzelle untrennbar verbinden, etwa Test-and-Set oder Compare-and-Swap. Compare-and-Swap schreibt einen neuen Wert nur dann, wenn die Speicherzelle noch den erwarteten alten Wert enthält, und meldet zurück, ob das gelungen ist.

Auf solchen Befehlen beruht der Spinlock: Ein Thread, der die Sperre nicht bekommt, prüft in einer Schleife immer wieder, ob sie frei geworden ist. Dieses aktive Warten verschwendet Rechenzeit. Spinlocks lohnen sich deshalb nur, wenn die Sperre sehr kurz gehalten wird und mehrere Kerne vorhanden sind. Auf einem Einprozessorsystem ist aktives Warten sinnlos, weil der Sperrinhaber gar nicht weiterrechnen kann, solange der Wartende den einzigen Prozessor belegt.

### Mutex

Ein Mutex (von „mutual exclusion“) ist eine Sperre mit zwei Operationen: `lock` und `unlock`. Ist der Mutex belegt, wird der anfragende Thread blockiert und vom Scheduler schlafen gelegt, statt aktiv zu warten. Einen Mutex darf nur der Thread freigeben, der ihn auch gesperrt hat. Darin unterscheidet er sich von einem Semaphor.

### Semaphore

Ein Semaphor ist eine ganzzahlige Variable mit zwei atomaren Operationen, die Edsger W. Dijkstra 1965 eingeführt hat. Die Operation P (auch `wait` oder `down`) verringert den Wert um eins; würde der Wert dadurch negativ, blockiert der aufrufende Thread. Die Operation V (auch `signal` oder `up`) erhöht den Wert um eins und weckt, falls Threads warten, einen von ihnen auf.

Ein Semaphor mit dem Anfangswert 1 heißt binärer Semaphor und kann als Sperre dienen. Ein zählender Semaphor mit dem Anfangswert n lässt höchstens n Threads gleichzeitig passieren und eignet sich etwa, um die Zahl gleichzeitiger Datenbankverbindungen zu begrenzen. Anders als bei einem Mutex darf ein beliebiger Thread V aufrufen; Semaphore eignen sich deshalb auch, um Ereignisse zwischen Threads zu signalisieren.

### Das Erzeuger-Verbraucher-Problem

Ein Erzeuger legt Elemente in einen Puffer mit N Plätzen, ein Verbraucher entnimmt sie. Der Erzeuger darf nur schreiben, wenn ein Platz frei ist, und der Verbraucher darf nur lesen, wenn ein Element vorhanden ist. Die klassische Lösung verwendet drei Semaphore: `frei` mit dem Anfangswert N, `belegt` mit dem Anfangswert 0 und `mutex` mit dem Anfangswert 1 für den Zugriff auf den Puffer selbst.

```c
void erzeuger(void) {
    while (1) {
        element e = erzeuge();
        P(&frei);
        P(&mutex);
        lege_ab(e);
        V(&mutex);
        V(&belegt);
    }
}

void verbraucher(void) {
    while (1) {
        P(&belegt);
        P(&mutex);
        element e = entnimm();
        V(&mutex);
        V(&frei);
        verbrauche(e);
    }
}
```

Die Reihenfolge der P-Operationen ist dabei nicht beliebig. Vertauscht der Erzeuger `P(&frei)` und `P(&mutex)`, kann er bei vollem Puffer den Mutex halten und auf einen freien Platz warten, während der Verbraucher auf den Mutex wartet und nie einen Platz freigeben kann. Beide warten dann ewig aufeinander: ein Deadlock.

### Monitore und Bedingungsvariablen

Semaphore sind fehleranfällig, weil ein einziges vergessenes V oder eine vertauschte Reihenfolge das Programm blockiert. Ein Monitor ist eine höhere Sprachkonstruktion, die gemeinsame Daten mit den Prozeduren bündelt, die auf sie zugreifen, und automatisch dafür sorgt, dass höchstens ein Thread gleichzeitig eine Monitorprozedur ausführt. Java setzt das Konzept mit dem Schlüsselwort `synchronized` um.

Innerhalb eines Monitors warten Threads über Bedingungsvariablen auf Zustandsänderungen. Die Operation `wait` gibt die Monitorsperre frei und legt den Thread schlafen; `signal` weckt einen wartenden Thread. Weil ein geweckter Thread nicht sofort weiterläuft und sich der Zustand in der Zwischenzeit ändern kann, muss die Wartebedingung nach dem Aufwachen erneut geprüft werden. Deshalb steht `wait` in einer `while`-Schleife und nicht in einer einfachen `if`-Abfrage.

### Leser-Schreiber-Problem

Viele Daten werden häufig gelesen und selten geschrieben. Eine Leser-Schreiber-Sperre erlaubt beliebig vielen Lesern gleichzeitig den Zugriff, einem Schreiber aber nur exklusiv, also ohne gleichzeitige Leser oder weitere Schreiber. Bevorzugt die Sperre die Leser, können Schreiber verhungern, wenn ständig neue Leser eintreffen; bevorzugt sie die Schreiber, gilt das Umgekehrte.

## Deadlocks

Ein Deadlock (Verklemmung) ist ein Zustand, in dem eine Menge von Prozessen dauerhaft blockiert ist, weil jeder Prozess der Menge auf ein Ereignis wartet, das nur ein anderer Prozess derselben Menge auslösen kann. Das bekannteste Bild dafür ist das Problem der speisenden Philosophen: Fünf Philosophen sitzen an einem runden Tisch, zwischen je zwei Tellern liegt eine Gabel, und jeder braucht zum Essen beide benachbarten Gabeln. Greifen alle gleichzeitig zur linken Gabel, wartet jeder ewig auf die rechte.

### Die vier Coffman-Bedingungen

Ein Deadlock kann nur entstehen, wenn alle vier der folgenden Bedingungen gleichzeitig erfüllt sind. Sie wurden 1971 von Edward G. Coffman und Kollegen formuliert:

1. Wechselseitiger Ausschluss: Ein Betriebsmittel kann zu jedem Zeitpunkt nur von einem Prozess genutzt werden.
2. Halten und Warten (Hold and Wait): Ein Prozess hält bereits Betriebsmittel und wartet auf weitere.
3. Keine Verdrängung (No Preemption): Einem Prozess können zugeteilte Betriebsmittel nicht entzogen werden; er gibt sie nur freiwillig zurück.
4. Zyklisches Warten: Es gibt eine geschlossene Kette von Prozessen, in der jeder auf ein Betriebsmittel wartet, das der nächste in der Kette hält.

Die ersten drei Bedingungen sind notwendig, aber nicht hinreichend. Erst wenn zusätzlich zyklisches Warten auftritt, liegt ein Deadlock vor. Umgekehrt genügt es, eine einzige der vier Bedingungen dauerhaft auszuschließen, um Deadlocks unmöglich zu machen.

### Betriebsmittelgraph

Deadlocks lassen sich mit einem Betriebsmittelbelegungsgraphen darstellen. Prozesse und Betriebsmittel sind Knoten; eine Kante vom Prozess zum Betriebsmittel bedeutet eine Anforderung, eine Kante vom Betriebsmittel zum Prozess eine Zuteilung. Gibt es von jedem Betriebsmittel nur ein Exemplar, so liegt genau dann ein Deadlock vor, wenn der Graph einen Zyklus enthält. Gibt es von einem Betriebsmittel mehrere Exemplare, ist ein Zyklus zwar notwendig, aber nicht hinreichend für einen Deadlock.

### Vier Strategien

Betriebssysteme gehen auf vier Arten mit Deadlocks um.

Die erste Strategie ist das Ignorieren, scherzhaft Vogel-Strauß-Algorithmus genannt. Man nimmt an, dass Deadlocks so selten sind, dass sich der Aufwand für ihre Verhinderung nicht lohnt, und überlässt es notfalls dem Benutzer, einen hängenden Prozess zu beenden. Die meisten Allzweckbetriebssysteme verfahren bei Anwendungsprozessen so.

Die zweite Strategie ist die Verhinderung (Prävention). Man schließt durch den Systementwurf eine der vier Bedingungen aus. Am wirksamsten ist es, zyklisches Warten zu verhindern, indem alle Betriebsmittel durchnummeriert werden und jeder Prozess sie nur in aufsteigender Reihenfolge anfordern darf. Halten und Warten lässt sich verhindern, indem ein Prozess alle Betriebsmittel auf einmal zu Beginn anfordert, was aber zu schlechter Auslastung führt. Wechselseitiger Ausschluss lässt sich bei Druckern oder Schreibzugriffen meist nicht vermeiden.

Die dritte Strategie ist die Vermeidung. Das System prüft bei jeder Anforderung, ob die Zuteilung in einen unsicheren Zustand führen würde, und schiebt sie in diesem Fall auf. Das bekannteste Verfahren ist der Bankiersalgorithmus von Dijkstra. Ein Zustand heißt sicher, wenn es mindestens eine Reihenfolge gibt, in der alle Prozesse ihren angemeldeten Höchstbedarf erhalten und beendet werden können. Ein unsicherer Zustand ist noch kein Deadlock, kann aber in einen führen. Der Bankiersalgorithmus setzt voraus, dass jeder Prozess seinen Höchstbedarf im Voraus angibt; das ist in Allzwecksystemen selten erfüllt.

Die vierte Strategie ist die Erkennung und Behebung. Das System lässt Deadlocks zu, sucht aber regelmäßig nach Zyklen im Wartegraphen. Findet es einen, bricht es einen oder mehrere beteiligte Prozesse ab oder entzieht ihnen Betriebsmittel und setzt sie auf einen früheren Zustand zurück. Datenbanksysteme gehen so vor: Sie erkennen verklemmte Transaktionen und brechen eine davon ab, die anschließend wiederholt werden kann.

### Livelock und Verhungern

Ein Livelock ähnelt einem Deadlock, doch die beteiligten Prozesse sind nicht blockiert: Sie reagieren ständig aufeinander, kommen aber trotzdem nicht voran, wie zwei Menschen, die sich im Flur immer wieder gleichzeitig in dieselbe Richtung ausweichen. Beim Verhungern (Starvation) dagegen kommen die übrigen Prozesse voran, und nur ein einzelner Prozess wird dauerhaft übergangen.

## Speicherverwaltung

Der Hauptspeicher ist ein großes Feld von Bytes, die über physische Adressen angesprochen werden. Die Speicherverwaltung muss mehrere Prozesse gleichzeitig im Speicher halten, sie voneinander schützen und jedem Prozess einen eigenen, zusammenhängend erscheinenden Adressraum bieten.

### Logische und physische Adressen

Ein Programm arbeitet mit logischen (virtuellen) Adressen. Die Speicherverwaltungseinheit (Memory Management Unit, MMU) des Prozessors übersetzt jede logische Adresse bei jedem Zugriff in eine physische Adresse. Der Prozess sieht deshalb nur seinen eigenen Adressraum und kann physische Speicherbereiche anderer Prozesse gar nicht adressieren. Die Übersetzung geschieht in Hardware, weil sie bei jedem einzelnen Speicherzugriff nötig ist und in Software viel zu langsam wäre.

### Zusammenhängende Zuteilung und Fragmentierung

Die einfachste Lösung gibt jedem Prozess einen zusammenhängenden Block physischen Speichers. Ein Basisregister enthält die Anfangsadresse, ein Grenzregister die Länge; jede Adresse außerhalb der Grenze löst eine Schutzverletzung aus. Für die Wahl eines freien Blocks gibt es mehrere Strategien: First Fit nimmt den ersten passenden Block, Best Fit den kleinsten passenden und Worst Fit den größten.

Das Hauptproblem dieser Lösung ist die externe Fragmentierung: Nach vielen Zuteilungen und Freigaben ist der freie Speicher in viele kleine Lücken zerstückelt. Insgesamt wäre genug Speicher frei, aber keine einzelne Lücke ist groß genug. Abhilfe schafft das Verschieben der Prozesse (Kompaktierung), das jedoch teuer ist. Interne Fragmentierung dagegen entsteht, wenn ein Prozess einen Block erhält, der größer ist als benötigt, und der Rest innerhalb des Blocks ungenutzt bleibt.

### Paging

Paging beseitigt die externe Fragmentierung. Der logische Adressraum wird in Seiten (Pages) gleicher Größe zerlegt, der physische Speicher in Kacheln (Frames) derselben Größe. Jede Seite kann in eine beliebige freie Kachel geladen werden; die Seiten eines Prozesses müssen im physischen Speicher also nicht zusammenhängen. Eine Seitentabelle je Prozess hält fest, welche Seite in welcher Kachel liegt.

Eine logische Adresse zerfällt in die Seitennummer und den Versatz (Offset) innerhalb der Seite. Bei einer Seitengröße von 4 KiB, also 4.096 Byte, braucht der Versatz 12 Bit. Bei einem 32-Bit-Adressraum bleiben damit 20 Bit für die Seitennummer, sodass ein Prozess bis zu 2 hoch 20, also rund eine Million Seiten haben kann. Die MMU ersetzt die Seitennummer durch die Kachelnummer aus der Seitentabelle; der Versatz bleibt unverändert.

Paging kennt keine externe Fragmentierung, wohl aber interne: Die letzte Seite eines Prozesses ist im Mittel nur halb gefüllt. Größere Seiten verkleinern die Seitentabellen, vergrößern aber die interne Fragmentierung.

Jeder Eintrag der Seitentabelle enthält neben der Kachelnummer mehrere Steuerbits: ein Präsenzbit, ob die Seite überhaupt im Hauptspeicher liegt, ein Schreibschutzbit, ein Bit für den Zugriff aus dem Benutzermodus, ein Referenzbit, das die Hardware bei jedem Zugriff setzt, und ein Dirty-Bit, das bei jedem Schreibzugriff gesetzt wird.

### Mehrstufige Seitentabellen

Eine einstufige Seitentabelle für einen 64-Bit-Adressraum wäre unbezahlbar groß. Deshalb verwenden moderne Systeme mehrstufige Seitentabellen: Die Seitennummer wird in mehrere Teile zerlegt, die nacheinander Tabellen auf verschiedenen Stufen indizieren. Tabellen für nicht genutzte Bereiche des Adressraums müssen gar nicht existieren. Die x86-64-Architektur verwendet üblicherweise vier Stufen und nutzt 48 Bit der virtuellen Adresse; neuere Prozessoren unterstützen optional fünf Stufen mit 57 Bit.

### Translation Lookaside Buffer

Ohne weitere Hilfe bräuchte jeder Speicherzugriff zusätzliche Zugriffe auf die Seitentabellen, bei vier Stufen also vier zusätzliche. Der Translation Lookaside Buffer (TLB) ist ein kleiner, sehr schneller Zwischenspeicher in der MMU, der kürzlich benutzte Übersetzungen von Seiten- auf Kachelnummern enthält. Findet die MMU eine Übersetzung im TLB (TLB-Treffer), entfällt der Tabellenzugriff. Wegen der Lokalität der Zugriffe liegen die Trefferquoten in der Praxis meist deutlich über 99 Prozent.

Weil jeder Prozess eigene Übersetzungen hat, muss der TLB beim Wechsel des Adressraums geleert werden, sofern seine Einträge nicht mit einer Kennung des Adressraums versehen sind. Bei einem Wechsel zwischen Threads desselben Prozesses bleibt der TLB dagegen gültig, weil der Adressraum gleich bleibt.

### Segmentierung

Bei der Segmentierung besteht der Adressraum aus mehreren Segmenten variabler Länge, etwa für Code, Daten und Stack, die der logischen Struktur des Programms entsprechen. Eine logische Adresse besteht aus einer Segmentnummer und einem Versatz. Weil Segmente unterschiedlich groß sind, tritt wieder externe Fragmentierung auf. Heutige Systeme auf x86-64 nutzen die Segmentierung praktisch nicht mehr und verlassen sich auf Paging.

## Virtueller Speicher

Virtueller Speicher trennt den logischen Adressraum eines Prozesses vollständig vom physischen Speicher. Ein Prozess muss nicht vollständig im Hauptspeicher liegen, um zu laufen; es genügt, wenn die gerade benötigten Seiten vorhanden sind. Der Rest liegt auf einem Hintergrundspeicher, meist einer Auslagerungsdatei oder Auslagerungspartition auf SSD oder Festplatte. Dadurch kann die Summe aller virtuellen Adressräume größer sein als der physische Speicher.

### Demand Paging und Seitenfehler

Beim Demand Paging lädt das Betriebssystem eine Seite erst dann in den Hauptspeicher, wenn tatsächlich auf sie zugegriffen wird. Greift ein Prozess auf eine Seite zu, deren Präsenzbit nicht gesetzt ist, löst die MMU einen Seitenfehler (Page Fault) aus. Ein Seitenfehler ist trotz seines Namens kein Programmfehler, sondern ein normaler Vorgang der Speicherverwaltung.

Die Behandlung eines Seitenfehlers läuft in festen Schritten ab:

1. Der Kernel prüft, ob der Zugriff überhaupt erlaubt war. Ist die Adresse ungültig, wird der Prozess wegen einer Schutzverletzung beendet; unter Unix erhält er das Signal SIGSEGV.
2. Der Kernel sucht eine freie Kachel. Gibt es keine, wählt ein Seitenersetzungsverfahren eine Opferseite aus.
3. Ist die Opferseite verändert worden, also ihr Dirty-Bit gesetzt, wird sie zuerst auf den Hintergrundspeicher zurückgeschrieben. Eine unveränderte Seite kann einfach verworfen werden, weil ihre Kopie auf dem Hintergrundspeicher noch aktuell ist.
4. Die benötigte Seite wird in die Kachel geladen, und die Seitentabelle wird aktualisiert.
5. Der unterbrochene Befehl wird erneut ausgeführt, diesmal mit Erfolg.

Ein Zugriff auf den Hauptspeicher dauert etwa 100 Nanosekunden, das Laden einer Seite von einer SSD dagegen etwa 100 Mikrosekunden und von einer Festplatte mehrere Millisekunden. Schon eine Seitenfehlerrate von einem Fehler pro Million Zugriffe verlangsamt die mittlere Zugriffszeit deshalb spürbar.

### Seitenersetzungsverfahren

Ein Seitenersetzungsverfahren entscheidet, welche Seite verdrängt wird, wenn keine Kachel frei ist. Ziel ist eine möglichst kleine Zahl von Seitenfehlern. Verglichen werden die Verfahren meist an einer Referenzfolge, also einer Folge von Seitennummern in der Reihenfolge der Zugriffe.

Das optimale Verfahren (OPT, nach seinem Entdecker auch Belady-Algorithmus) verdrängt die Seite, die am längsten nicht mehr benötigt wird. Es erzeugt nachweislich die wenigsten Seitenfehler, ist aber nicht umsetzbar, weil es die zukünftigen Zugriffe kennen müsste. Es dient nur als Vergleichsmaßstab.

FIFO (First In, First Out) verdrängt die Seite, die am längsten im Speicher liegt. FIFO ist einfach, berücksichtigt aber nicht, wie häufig eine Seite benutzt wird, und verdrängt deshalb auch häufig benötigte Seiten.

LRU (Least Recently Used) verdrängt die Seite, deren letzter Zugriff am längsten zurückliegt. LRU nutzt die Vergangenheit als Schätzung für die Zukunft und kommt in der Praxis nahe an das optimale Verfahren heran. Eine exakte Umsetzung wäre jedoch teuer, weil bei jedem einzelnen Speicherzugriff ein Zeitstempel oder eine Liste aktualisiert werden müsste.

Das Clock-Verfahren (Second Chance) nähert LRU mit dem Referenzbit an. Die Kacheln sind wie auf einem Zifferblatt im Kreis angeordnet, und ein Zeiger läuft über sie. Ist das Referenzbit der Seite unter dem Zeiger gesetzt, wird es gelöscht und der Zeiger rückt weiter; die Seite erhält also eine zweite Chance. Ist das Referenzbit nicht gesetzt, wird die Seite verdrängt.

Für die klassische Referenzfolge 7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1 mit drei Kacheln erzeugt FIFO 15 Seitenfehler, LRU 12 und das optimale Verfahren 9 Seitenfehler.

### Beladys Anomalie

Man würde erwarten, dass mehr Kacheln immer weniger Seitenfehler bedeuten. Für FIFO gilt das nicht: Bei bestimmten Referenzfolgen erzeugt FIFO mit vier Kacheln mehr Seitenfehler als mit drei. Dieses Verhalten heißt Beladys Anomalie. Die Referenzfolge 1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5 erzeugt mit drei Kacheln 9, mit vier Kacheln aber 10 Seitenfehler. LRU und das optimale Verfahren gehören dagegen zu den Stapelalgorithmen und zeigen diese Anomalie nie.

### Thrashing und Arbeitsmenge

Hat ein Prozess weniger Kacheln, als er für seine aktuell benutzten Seiten braucht, verdrängt jeder Seitenfehler eine Seite, die gleich wieder benötigt wird. Der Prozess verbringt dann mehr Zeit mit Seitenwechseln als mit Rechnen. Dieser Zustand heißt Thrashing (Seitenflattern). Ein naiver Scheduler verschlimmert ihn, wenn er die sinkende Prozessorauslastung bemerkt und zusätzliche Prozesse startet, die noch mehr Kacheln beanspruchen.

Die Arbeitsmenge (Working Set) eines Prozesses ist die Menge der Seiten, auf die er in einem zurückliegenden Zeitfenster zugegriffen hat. Thrashing wird vermieden, wenn jeder laufende Prozess mindestens so viele Kacheln erhält, wie seine Arbeitsmenge umfasst. Reicht der Speicher dafür nicht aus, ist es besser, einzelne Prozesse vollständig auszulagern, als alle Prozesse gleichzeitig mit zu wenig Kacheln laufen zu lassen.

### Weitere Anwendungen

Virtueller Speicher ermöglicht neben der Auslagerung weitere Techniken. Gemeinsam genutzte Bibliotheken liegen nur einmal im physischen Speicher und werden in die Adressräume aller Prozesse eingeblendet, die sie benutzen. Mit `mmap` lässt sich eine Datei direkt in den Adressraum einblenden, sodass Lesezugriffe auf den Speicher die Datei seitenweise laden. Copy-on-Write beim `fork` beruht ebenfalls auf dem Schreibschutzbit der Seitentabelle.

## Dateisysteme

Ein Dateisystem organisiert die Daten auf einem Massenspeicher in Dateien und Verzeichnissen. Für Anwendungen ist eine Datei eine benannte Folge von Bytes; das Dateisystem bildet diese Folge auf Blöcke des Datenträgers ab, die typischerweise 4 KiB groß sind. Zu jeder Datei speichert es außerdem Metadaten wie Größe, Besitzer, Zugriffsrechte und Zeitstempel.

### Zugriffsrechte unter Unix

Unix unterscheidet für jede Datei die Rechte Lesen (r), Schreiben (w) und Ausführen (x) jeweils für den Besitzer, die Gruppe und alle anderen. Die Rechte `rwxr-x---` bedeuten: Der Besitzer darf alles, die Gruppe darf lesen und ausführen, alle anderen dürfen nichts. In oktaler Schreibweise entspricht das 750.

Bei Verzeichnissen haben die Rechte eine eigene Bedeutung. Das Leserecht erlaubt, die Namen im Verzeichnis aufzulisten, das Ausführungsrecht erlaubt, das Verzeichnis zu betreten und auf die darin liegenden Dateien zuzugreifen. Um eine Datei zu löschen, braucht man Schreibrecht auf das Verzeichnis, nicht auf die Datei selbst. Der Superuser root unterliegt diesen Prüfungen nicht.

### Zuteilungsverfahren

Wie die Blöcke einer Datei auf dem Datenträger angeordnet werden, bestimmt das Zuteilungsverfahren.

Bei der zusammenhängenden Zuteilung belegt eine Datei aufeinanderfolgende Blöcke. Lesen ist sehr schnell, und jeder Block lässt sich direkt berechnen. Es entsteht aber externe Fragmentierung, und eine Datei kann nur schwer wachsen. Dieses Verfahren eignet sich vor allem für nur einmal beschriebene Datenträger wie CD-ROMs.

Bei der verketteten Zuteilung enthält jeder Block einen Verweis auf den nächsten. Es gibt keine externe Fragmentierung, doch ein wahlfreier Zugriff auf den hundertsten Block erfordert, die ersten 99 Blöcke zu durchlaufen. Das Dateisystem FAT (File Allocation Table) lagert diese Verweise in eine eigene Tabelle am Anfang des Datenträgers aus, die im Speicher gehalten werden kann. FAT32 ist bis heute auf USB-Sticks und Speicherkarten verbreitet, erlaubt aber keine Dateien ab 4 GiB Größe und kennt keine Unix-Zugriffsrechte.

Bei der indizierten Zuteilung besitzt jede Datei einen Indexblock mit den Adressen aller ihrer Datenblöcke. Wahlfreier Zugriff ist schnell, und es entsteht keine externe Fragmentierung.

### Inodes

Unix-Dateisysteme wie ext4 speichern die Metadaten einer Datei in einem Inode (Index Node). Ein Inode enthält Dateityp, Zugriffsrechte, Besitzer, Größe, Zeitstempel, die Zahl der auf ihn verweisenden Verzeichniseinträge und die Verweise auf die Datenblöcke. Der Dateiname steht dagegen nicht im Inode, sondern im Verzeichnis.

Im klassischen Unix-Schema enthält ein Inode zwölf direkte Blockverweise, dazu einen einfach indirekten Verweis auf einen Block voller Blockadressen, einen zweifach indirekten und einen dreifach indirekten Verweis. Kleine Dateien kommen so ohne zusätzliche Indexblöcke aus, während große Dateien über die indirekten Verweise trotzdem adressierbar bleiben. Das moderne ext4 verwaltet große Dateien stattdessen über Extents, also zusammenhängende Blockbereiche, die mit Anfangsblock und Länge beschrieben werden.

### Verzeichnisse und Links

Ein Verzeichnis ist unter Unix eine spezielle Datei, die Paare aus Namen und Inode-Nummer enthält. Ein harter Link ist ein weiterer Verzeichniseintrag, der auf denselben Inode verweist; beide Namen sind völlig gleichwertig. Der Inode zählt seine Verweise mit, und die Datei wird erst dann wirklich gelöscht, wenn der Verweiszähler auf null fällt und kein Prozess die Datei mehr geöffnet hat.

Harte Links haben zwei Einschränkungen: Sie können nur innerhalb desselben Dateisystems angelegt werden, weil Inode-Nummern nur innerhalb eines Dateisystems eindeutig sind, und sie dürfen in der Regel nicht auf Verzeichnisse zeigen, damit im Verzeichnisbaum keine Zyklen entstehen.

Ein symbolischer Link (Softlink) ist dagegen eine eigene kleine Datei, die einen Pfadnamen enthält. Er darf auf Verzeichnisse und über Dateisystemgrenzen hinweg zeigen. Wird das Ziel gelöscht oder umbenannt, bleibt der symbolische Link als verwaister Verweis zurück, der ins Leere zeigt.

### Konsistenz und Journaling

Viele Dateisystemoperationen verändern mehrere Blöcke: Beim Anlegen einer Datei müssen ein Inode belegt, ein Verzeichniseintrag geschrieben und die Freiliste aktualisiert werden. Fällt der Strom mitten in diesem Vorgang aus, bleibt das Dateisystem inkonsistent zurück. Ältere Systeme mussten deshalb nach einem Absturz den ganzen Datenträger mit einem Prüfprogramm wie `fsck` durchsuchen, was bei großen Platten Stunden dauern konnte.

Ein Journaling-Dateisystem schreibt jede zusammengehörige Änderung zuerst als Transaktion in ein Journal und erst danach an die endgültige Stelle. Nach einem Absturz genügt es, das Journal zu lesen: Vollständig protokollierte Transaktionen werden nachgeholt, unvollständige verworfen. Die meisten Journaling-Dateisysteme sichern standardmäßig nur die Metadaten über das Journal ab, nicht die Dateiinhalte selbst. Das Dateisystem bleibt dann zwar strukturell konsistent, doch eine Datei kann nach einem Absturz noch alte oder unvollständige Inhalte enthalten. Beispiele für Journaling-Dateisysteme sind ext4, NTFS und XFS.

Copy-on-Write-Dateisysteme wie ZFS und Btrfs gehen einen anderen Weg: Sie überschreiben Daten nie an Ort und Stelle, sondern schreiben veränderte Blöcke immer an eine neue Stelle und schalten erst am Ende einen Verweis um. Dadurch sind Momentaufnahmen (Snapshots) des Dateisystems nahezu kostenlos.

## Schichtenmodelle für Rechnernetze

Damit Rechner unterschiedlicher Hersteller miteinander kommunizieren können, müssen sie sich an gemeinsame Protokolle halten. Ein Protokoll legt Format, Bedeutung und Reihenfolge der ausgetauschten Nachrichten fest. Weil Netzkommunikation sehr viele Teilaufgaben umfasst, ordnet man die Protokolle in Schichten an. Jede Schicht nutzt die Dienste der darunterliegenden Schicht und bietet der darüberliegenden einen Dienst an, ohne deren Inneres kennen zu müssen.

### Kapselung

Beim Senden gibt jede Schicht die Daten der oberen Schicht nach unten weiter und setzt ihren eigenen Kopf (Header) davor. Eine Webseite wird so zuerst in ein TCP-Segment, dieses in ein IP-Paket und dieses in einen Ethernet-Rahmen verpackt. Der Empfänger entfernt die Köpfe in umgekehrter Reihenfolge wieder. Diesen Vorgang nennt man Kapselung. Die Dateneinheiten heißen je nach Schicht Bits, Rahmen (Frames), Pakete, Segmente oder Datagramme.

### Das OSI-Modell und das TCP/IP-Modell

Das OSI-Referenzmodell der Internationalen Organisation für Normung (ISO) aus dem Jahr 1984 unterscheidet sieben Schichten. Es ist vor allem ein Denkmodell, um Protokolle einzuordnen; die nach ihm entworfenen OSI-Protokolle haben sich nicht durchgesetzt. Das Internet beruht auf dem älteren und schlankeren TCP/IP-Modell mit vier Schichten. Die folgende Tabelle stellt beide Modelle gegenüber.

| OSI-Schicht | Name | TCP/IP-Schicht | Beispiele | Adressen und Einheiten |
| --- | --- | --- | --- | --- |
| 7 | Anwendungsschicht | Anwendungsschicht | HTTP, DNS, SMTP, SSH | Nachrichten |
| 6 | Darstellungsschicht | Anwendungsschicht | Kodierung, Kompression | – |
| 5 | Sitzungsschicht | Anwendungsschicht | Sitzungsverwaltung | – |
| 4 | Transportschicht | Transportschicht | TCP, UDP | Portnummern, Segmente |
| 3 | Vermittlungsschicht | Internetschicht | IPv4, IPv6, ICMP | IP-Adressen, Pakete |
| 2 | Sicherungsschicht | Netzzugangsschicht | Ethernet, WLAN | MAC-Adressen, Rahmen |
| 1 | Bitübertragungsschicht | Netzzugangsschicht | Kabel, Funk, Glasfaser | Bits |

Das TCP/IP-Modell fasst also die OSI-Schichten 5 bis 7 zu einer einzigen Anwendungsschicht und die Schichten 1 und 2 zu einer Netzzugangsschicht zusammen. Manche Lehrbücher verwenden ein Hybridmodell mit fünf Schichten, das die Bitübertragungsschicht und die Sicherungsschicht getrennt aufführt.

### Aufgaben der unteren Schichten

Die Bitübertragungsschicht überträgt einzelne Bits über ein Medium, etwa als Spannungspegel im Kupferkabel, als Lichtimpulse in der Glasfaser oder als Funkwellen. Die Sicherungsschicht überträgt Rahmen zwischen direkt verbundenen Geräten im selben lokalen Netz. Sie erkennt Übertragungsfehler mit einer Prüfsumme; bei Ethernet ist das eine 32-Bit-Prüfsumme (CRC). Fehlerhafte Rahmen verwirft Ethernet einfach, ohne sie erneut anzufordern.

Geräte im lokalen Netz werden über MAC-Adressen angesprochen. Eine MAC-Adresse ist 48 Bit lang und wird hexadezimal geschrieben, etwa `3c:52:82:1a:9f:04`. Ein Switch arbeitet auf der Sicherungsschicht: Er lernt, an welchem Anschluss welche MAC-Adresse erreichbar ist, und leitet Rahmen gezielt nur an diesen Anschluss weiter. Ein Router arbeitet dagegen auf der Vermittlungsschicht und verbindet verschiedene IP-Netze miteinander.

Die maximale Nutzlast eines Ethernet-Rahmens, die Maximum Transmission Unit (MTU), beträgt standardmäßig 1.500 Byte. Größere IP-Pakete müssen entweder fragmentiert oder von vornherein kleiner gewählt werden.

## IP-Adressierung und Subnetze

Das Internet Protocol (IP) transportiert Pakete von einem Rechner zu einem anderen, auch über viele Netze und Router hinweg. IP arbeitet verbindungslos und nach dem Prinzip „best effort“: Es garantiert weder, dass ein Paket ankommt, noch dass Pakete in der richtigen Reihenfolge ankommen, noch dass sie nur einmal ankommen. Für Zuverlässigkeit sorgen erst die höheren Schichten.

### IPv4-Adressen

Eine IPv4-Adresse ist 32 Bit lang und wird in Punktschreibweise als vier Dezimalzahlen von 0 bis 255 geschrieben, etwa `192.168.10.37`. Damit gibt es rechnerisch knapp 4,3 Milliarden Adressen, was für das heutige Internet nicht ausreicht. Die zentralen Adressvorräte der regionalen Vergabestellen sind seit den 2010er-Jahren erschöpft.

Jede Adresse besteht aus einem Netzanteil und einem Hostanteil. Wie viele Bits zum Netzanteil gehören, gibt die Präfixlänge an, die in der CIDR-Schreibweise (Classless Inter-Domain Routing) hinter einem Schrägstrich steht. Die Angabe `192.168.10.0/24` bedeutet, dass die ersten 24 Bit das Netz bezeichnen und die letzten 8 Bit für die Hosts bleiben. Gleichwertig ist die Subnetzmaske `255.255.255.0`. Die früheren festen Adressklassen A, B und C wurden 1993 durch CIDR abgelöst und spielen für die Vergabe keine Rolle mehr.

In jedem Subnetz sind zwei Adressen reserviert: Die Adresse mit lauter Nullen im Hostanteil bezeichnet das Netz selbst, die Adresse mit lauter Einsen im Hostanteil ist die Broadcast-Adresse, die alle Hosts des Netzes erreicht. Bei h Hostbits stehen deshalb 2 hoch h minus 2 Adressen für Geräte zur Verfügung. Ein /24-Netz umfasst 256 Adressen, von denen 254 an Geräte vergeben werden können. Eine Ausnahme bilden /31-Netze für Punkt-zu-Punkt-Verbindungen zwischen genau zwei Routern; dort werden beide Adressen genutzt, weil eine Broadcast-Adresse überflüssig ist.

### Besondere Adressbereiche

Einige Bereiche haben eine feste Sonderbedeutung:

- `10.0.0.0/8`, `172.16.0.0/12` und `192.168.0.0/16` sind private Adressen nach RFC 1918. Sie dürfen in jedem lokalen Netz verwendet werden, werden aber im öffentlichen Internet nicht weitergeleitet.
- `127.0.0.0/8` ist der Loopback-Bereich; die Adresse `127.0.0.1` bezeichnet immer den eigenen Rechner.
- `169.254.0.0/16` ist für link-lokale Adressen reserviert, die sich ein Gerät selbst gibt, wenn es keine Adresse per DHCP erhalten hat.

### Subnetze bilden

Ein Netz lässt sich in kleinere Subnetze teilen, indem man Bits vom Hostanteil zum Netzanteil hinzunimmt. Jedes zusätzliche Bit verdoppelt die Zahl der Subnetze und halbiert ihre Größe. Teilt man `192.168.10.0/24` in vier gleich große Subnetze, braucht man zwei zusätzliche Bits; die Präfixlänge wird /26. Jedes Subnetz umfasst dann 64 Adressen, von denen 62 für Geräte nutzbar sind:

- `192.168.10.0/26` mit den Geräteadressen `.1` bis `.62` und der Broadcast-Adresse `.63`,
- `192.168.10.64/26` mit `.65` bis `.126` und Broadcast `.127`,
- `192.168.10.128/26` mit `.129` bis `.190` und Broadcast `.191`,
- `192.168.10.192/26` mit `.193` bis `.254` und Broadcast `.255`.

Ob zwei Rechner im selben Subnetz liegen, prüft man, indem man beide Adressen bitweise mit der Subnetzmaske verknüpft (UND-Verknüpfung). Sind die Ergebnisse gleich, liegen sie im selben Netz und können sich direkt erreichen. Andernfalls schickt der Sender das Paket an sein Standard-Gateway, also den Router seines Netzes. So liegen `192.168.10.37` und `192.168.10.70` in einem /24-Netz zusammen, in einem /26-Netz dagegen in verschiedenen Subnetzen.

### Weiterleitung, TTL und ICMP

Router leiten Pakete anhand ihrer Routingtabelle weiter. Passen mehrere Einträge auf eine Zieladresse, gewinnt der Eintrag mit dem längsten passenden Präfix (Longest Prefix Match). Der Eintrag `0.0.0.0/0` passt auf jede Adresse und ist die Standardroute.

Jedes IPv4-Paket trägt im Kopf das Feld Time to Live (TTL). Jeder Router verringert die TTL um eins; erreicht sie null, verwirft er das Paket und schickt dem Absender eine ICMP-Fehlermeldung „Time Exceeded“. So können Pakete bei fehlerhaften Routen nicht endlos kreisen. Das Werkzeug `traceroute` nutzt genau diesen Mechanismus, indem es Pakete mit TTL 1, 2, 3 und so weiter verschickt und die zurückkommenden Fehlermeldungen auswertet. Auch `ping` beruht auf ICMP, nämlich auf den Nachrichten Echo Request und Echo Reply.

### ARP, DHCP und NAT

Innerhalb eines lokalen Netzes braucht der Sender zur IP-Adresse des Ziels dessen MAC-Adresse. Das Address Resolution Protocol (ARP) fragt per Broadcast, welches Gerät eine bestimmte IP-Adresse besitzt; das betreffende Gerät antwortet mit seiner MAC-Adresse. Die Antworten werden in einem ARP-Cache zwischengespeichert. ARP gibt es nur für IPv4; IPv6 verwendet dafür das Neighbor Discovery Protocol.

Das Dynamic Host Configuration Protocol (DHCP) teilt Geräten beim Start automatisch eine IP-Adresse, die Subnetzmaske, das Standard-Gateway und die DNS-Server zu. Die Zuteilung gilt nur für eine begrenzte Zeit, die Lease, und muss rechtzeitig verlängert werden.

Weil öffentliche IPv4-Adressen knapp sind, teilen sich in Haushalten meist alle Geräte eine einzige öffentliche Adresse. Der Router übersetzt dazu bei ausgehenden Paketen die private Quelladresse und den Quellport in seine öffentliche Adresse und einen eigenen Port und merkt sich die Zuordnung in einer Tabelle (Network Address Translation, genauer NAT mit Portübersetzung). Eingehende Verbindungen von außen sind dadurch nur möglich, wenn für sie ausdrücklich eine Portweiterleitung eingerichtet wurde.

### IPv6

IPv6 verwendet 128 Bit lange Adressen, die in acht Gruppen zu je vier Hexadezimalziffern geschrieben werden, etwa `2001:0db8:0000:0000:0000:ff00:0042:8329`. Führende Nullen einer Gruppe dürfen entfallen, und eine einzige zusammenhängende Folge von Nullgruppen darf durch `::` ersetzt werden. Die Adresse oben lässt sich also als `2001:db8::ff00:42:8329` schreiben. Die Ersetzung durch `::` ist nur einmal je Adresse erlaubt, weil sonst nicht eindeutig wäre, wie viele Nullgruppen an welcher Stelle fehlen.

Ein lokales IPv6-Netz hat in der Regel die Präfixlänge /64, sodass für die Hosts 64 Bit bleiben. IPv6 kennt keine Broadcast-Adressen mehr, sondern nutzt Multicast. Außerdem fragmentieren Router IPv6-Pakete nicht mehr; ist ein Paket zu groß, verwirft der Router es und meldet dem Absender per ICMPv6 die zulässige Größe, sodass nur der Absender fragmentieren darf. Die Loopback-Adresse lautet `::1`.

## TCP und UDP

Die Transportschicht stellt die Verbindung zwischen Programmen her, nicht nur zwischen Rechnern. Dafür adressiert sie Anwendungen über 16 Bit lange Portnummern von 0 bis 65.535. Die Ports von 0 bis 1023 heißen Well-known Ports und sind Standarddiensten vorbehalten: 22 für SSH, 25 für SMTP, 53 für DNS, 80 für HTTP und 443 für HTTPS. Eine Verbindung wird eindeutig durch das Quintupel aus Protokoll, Quelladresse, Quellport, Zieladresse und Zielport bestimmt.

### UDP

Das User Datagram Protocol (UDP) ist ein schlankes, verbindungsloses Protokoll. Sein Kopf ist nur 8 Byte lang und enthält Quellport, Zielport, Länge und Prüfsumme. UDP garantiert weder Zustellung noch Reihenfolge und kennt weder Fluss- noch Staukontrolle. Ein verlorenes Datagramm wird nicht erneut gesendet.

Gerade diese Einfachheit macht UDP für bestimmte Anwendungen attraktiv: für kurze Anfrage-Antwort-Wechsel wie DNS, für Sprach- und Videotelefonie, bei der eine verspätete Nachricht wertlos ist, und für Online-Spiele. Auch das Protokoll QUIC, auf dem HTTP/3 beruht, setzt auf UDP auf und baut Zuverlässigkeit und Verschlüsselung selbst darüber.

### TCP

Das Transmission Control Protocol (TCP) bietet einen zuverlässigen, geordneten Bytestrom zwischen zwei Endpunkten. Es nummeriert jedes übertragene Byte mit einer Sequenznummer. Der Empfänger bestätigt den Empfang mit einer Bestätigungsnummer (Acknowledgement), die das nächste erwartete Byte angibt. Bleibt eine Bestätigung innerhalb einer Zeitschranke aus, sendet der Absender die Daten erneut. Der TCP-Kopf ist mindestens 20 Byte lang.

TCP ist verbindungsorientiert. Der Verbindungsaufbau erfolgt im Drei-Wege-Handschlag:

1. Der Client sendet ein Segment mit gesetztem SYN-Flag und seiner zufällig gewählten Anfangssequenznummer.
2. Der Server antwortet mit SYN und ACK, bestätigt damit die Sequenznummer des Clients und teilt seine eigene Anfangssequenznummer mit.
3. Der Client bestätigt mit ACK; ab jetzt ist die Verbindung in beide Richtungen aufgebaut.

Der Verbindungsabbau erfolgt getrennt für jede Richtung mit FIN und ACK, typischerweise also in vier Segmenten. Die Seite, die zuerst schließt, verharrt danach eine Weile im Zustand TIME_WAIT, nämlich doppelt so lange wie die maximale Lebensdauer eines Segments, damit verspätete Segmente der alten Verbindung keine neue Verbindung stören.

### Flusskontrolle und Staukontrolle

Flusskontrolle schützt den Empfänger vor Überlastung. Der Empfänger teilt in jedem Segment mit, wie viele Bytes er noch puffern kann (Empfangsfenster). Der Sender darf höchstens so viele unbestätigte Bytes unterwegs haben, wie dieses Fenster erlaubt. Meldet der Empfänger ein Fenster von null, muss der Sender pausieren.

Staukontrolle schützt dagegen das Netz vor Überlastung. Der Sender führt zusätzlich ein Staufenster (Congestion Window), und die Menge der unbestätigten Daten darf das Minimum aus Empfangsfenster und Staufenster nicht überschreiten. In der Phase Slow Start verdoppelt sich das Staufenster mit jeder Umlaufzeit, wächst also trotz des Namens exponentiell. Ab einem Schwellwert geht TCP in die Stauvermeidung über und vergrößert das Fenster nur noch linear um etwa ein Segment je Umlaufzeit.

Einen Paketverlust deutet TCP als Zeichen für einen Stau. Erhält der Sender drei doppelte Bestätigungen für dieselbe Stelle, sendet er das fehlende Segment sofort erneut, ohne den Ablauf der Zeitschranke abzuwarten (Fast Retransmit), und halbiert das Staufenster. Läuft dagegen die Zeitschranke ab, fällt das Staufenster auf ein Segment zurück, und Slow Start beginnt von vorn. Dieses Verhalten aus additiver Erhöhung und multiplikativer Verringerung heißt AIMD.

### Vergleich

TCP eignet sich, wenn alle Daten vollständig und in der richtigen Reihenfolge ankommen müssen, etwa bei Webseiten, E-Mails und Dateiübertragungen. UDP eignet sich, wenn geringe Verzögerung wichtiger ist als Vollständigkeit oder wenn die Anwendung ihre eigene Fehlerbehandlung mitbringt. Ein Nachteil von TCP ist die Head-of-Line-Blockierung: Geht ein Segment verloren, kann der Empfänger auch bereits angekommene spätere Daten nicht an die Anwendung weitergeben, bis die Lücke geschlossen ist.

## DNS

Menschen merken sich Namen wie `www.beispiel.de`, Router brauchen IP-Adressen. Das Domain Name System (DNS) übersetzt Namen in Adressen und ist dafür als weltweit verteilte, hierarchische Datenbank organisiert. Keine einzelne Stelle kennt alle Namen; jede Zone wird von ihren eigenen autoritativen Nameservern verwaltet.

### Hierarchie der Namen

Ein Domainname wird von rechts nach links gelesen. Ganz oben steht die Wurzel, die man als abschließenden Punkt schreiben kann. Darunter liegen die Top-Level-Domains wie `de`, `com` oder `org`, darunter die Second-Level-Domains wie `beispiel.de` und darunter beliebig viele weitere Ebenen wie `www.beispiel.de`. Jede Ebene kann die Verantwortung für ihre Unterbereiche an andere Nameserver übertragen (Delegation).

Für die Wurzel gibt es 13 logische Root-Server, die mit den Buchstaben A bis M bezeichnet werden. Hinter jedem dieser Namen stehen heute aber viele hundert über die Welt verteilte Server, die per Anycast unter derselben Adresse erreichbar sind. Die Zahl 13 beschreibt also nicht die Zahl der Rechner, sondern die Zahl der Root-Server-Adressen.

### Ablauf einer Namensauflösung

Ein Programm fragt zunächst den Stub-Resolver des eigenen Betriebssystems. Dieser schickt die Anfrage an einen rekursiven Resolver, etwa den des Internetanbieters. Kennt der rekursive Resolver die Antwort nicht aus seinem Zwischenspeicher, löst er den Namen schrittweise auf:

1. Er fragt einen Root-Server nach `www.beispiel.de` und erhält einen Verweis auf die Nameserver von `de`.
2. Er fragt einen Nameserver von `de` und erhält einen Verweis auf die Nameserver von `beispiel.de`.
3. Er fragt einen autoritativen Nameserver von `beispiel.de` und erhält die gesuchte Adresse.
4. Er speichert die Antwort zwischen und gibt sie an den Stub-Resolver zurück.

Die Anfrage des Clients an den rekursiven Resolver ist rekursiv, denn der Client erwartet eine fertige Antwort. Die Anfragen des Resolvers an Root-, TLD- und autoritative Server sind dagegen iterativ, denn diese Server liefern nur Verweise auf die nächste Ebene und erledigen die weitere Suche nicht selbst.

### Ressourceneinträge

Die Daten einer Zone stehen in Ressourceneinträgen (Resource Records). Die wichtigsten Typen sind:

- A für eine IPv4-Adresse und AAAA für eine IPv6-Adresse,
- CNAME für einen Aliasnamen, der auf einen anderen Namen verweist,
- MX für die Mailserver einer Domain, jeweils mit einer Priorität, bei der der kleinere Wert bevorzugt wird,
- NS für die autoritativen Nameserver einer Zone,
- TXT für beliebigen Text, etwa für Nachweise des Domainbesitzes oder Regeln gegen gefälschte E-Mails,
- PTR für die Rückwärtsauflösung einer IP-Adresse in einen Namen,
- SOA für die Verwaltungsdaten einer Zone.

Ein Name mit einem CNAME-Eintrag darf keine weiteren Einträge anderer Typen tragen. Deshalb kann die Wurzel einer Zone, also etwa `beispiel.de` selbst, kein CNAME sein, denn dort müssen mindestens die Einträge SOA und NS stehen.

### Zwischenspeicherung und Transport

Jeder Eintrag trägt eine Lebensdauer (TTL) in Sekunden, die angibt, wie lange Resolver ihn zwischenspeichern dürfen. Eine lange TTL entlastet die Nameserver und beschleunigt die Auflösung, verzögert aber die Verbreitung von Änderungen. Wer einen Umzug auf eine neue Adresse plant, senkt die TTL deshalb einige Zeit vorher. Auch das Ausbleiben eines Namens wird zwischengespeichert (negatives Caching).

DNS verwendet standardmäßig UDP auf Port 53, weil eine Anfrage und eine Antwort meist in je ein Datagramm passen. Für große Antworten und für die Übertragung ganzer Zonen zwischen Nameservern wird TCP auf Port 53 verwendet. Klassisches DNS ist unverschlüsselt, sodass jeder auf dem Übertragungsweg die abgefragten Namen mitlesen kann. DNS over HTTPS und DNS over TLS verschlüsseln die Anfragen. DNSSEC dagegen signiert die Einträge, damit gefälschte Antworten erkannt werden; es verschlüsselt jedoch nichts.

## HTTP

Das Hypertext Transfer Protocol (HTTP) ist das Anwendungsprotokoll des World Wide Web. Ein Client, meist ein Browser, sendet eine Anfrage (Request), und der Server antwortet mit einer Antwort (Response). HTTP ist zustandslos: Der Server muss sich zwischen zwei Anfragen nichts merken, und jede Anfrage muss alle Informationen enthalten, die zu ihrer Bearbeitung nötig sind. Um dennoch Anmeldungen oder Warenkörbe zu ermöglichen, setzt der Server Cookies, die der Browser bei jeder weiteren Anfrage an diesen Server mitschickt.

### Aufbau von Anfrage und Antwort

Eine Anfrage besteht aus einer Anfragezeile mit Methode, Pfad und Protokollversion, aus Kopfzeilen (Headern) und optional aus einem Rumpf (Body). Seit HTTP/1.1 ist die Kopfzeile `Host` Pflicht; sie nennt den gewünschten Servernamen und erlaubt, dass viele Websites unter derselben IP-Adresse betrieben werden. Eine Antwort beginnt mit einer Statuszeile mit Statuscode, gefolgt von Kopfzeilen wie `Content-Type` und `Cache-Control` und dem Rumpf.

### Methoden

Die wichtigsten Methoden sind:

- GET ruft eine Ressource ab und darf den Zustand des Servers nicht verändern.
- HEAD verhält sich wie GET, liefert aber nur die Kopfzeilen ohne Rumpf.
- POST übergibt Daten zur Verarbeitung, etwa ein Formular oder eine Bestellung.
- PUT legt eine Ressource unter der angegebenen Adresse an oder ersetzt sie vollständig.
- PATCH ändert eine Ressource teilweise.
- DELETE löscht eine Ressource.

Eine Methode heißt sicher, wenn sie den Zustand des Servers nicht verändert; sicher sind GET, HEAD und OPTIONS. Eine Methode heißt idempotent, wenn eine mehrfache Ausführung dieselbe Wirkung hat wie eine einfache; idempotent sind alle sicheren Methoden sowie PUT und DELETE. POST ist weder sicher noch idempotent. Deshalb fragt ein Browser nach, bevor er ein abgeschicktes Formular beim Neuladen erneut per POST sendet, denn sonst könnte eine Bestellung doppelt ausgelöst werden.

### Statuscodes

Die erste Ziffer des dreistelligen Statuscodes gibt seine Klasse an: 1xx steht für Zwischenmeldungen, 2xx für Erfolg, 3xx für Umleitungen, 4xx für Fehler des Clients und 5xx für Fehler des Servers. Häufige Codes sind:

- 200 OK, 201 Created nach dem Anlegen einer Ressource und 204 No Content für Erfolg ohne Rumpf,
- 301 Moved Permanently für eine dauerhafte und 302 Found für eine vorübergehende Umleitung,
- 304 Not Modified, wenn sich eine zwischengespeicherte Ressource nicht geändert hat,
- 400 Bad Request für eine fehlerhafte Anfrage,
- 401 Unauthorized, wenn die Anmeldung fehlt oder ungültig ist, und 403 Forbidden, wenn der Client zwar bekannt ist, aber keine Berechtigung hat,
- 404 Not Found, wenn die Ressource nicht existiert,
- 500 Internal Server Error, 502 Bad Gateway und 503 Service Unavailable.

Die Unterscheidung zwischen 401 und 403 wird häufig verwechselt: 401 bedeutet trotz des Namens „nicht angemeldet“, 403 bedeutet „angemeldet, aber nicht berechtigt“.

### Versionen

HTTP/1.0 baute für jede Anfrage eine eigene TCP-Verbindung auf. HTTP/1.1 führte dauerhafte Verbindungen ein, über die mehrere Anfragen nacheinander laufen können. Die Antworten müssen dabei aber in der Reihenfolge der Anfragen kommen, sodass eine langsame Antwort alle folgenden aufhält. Browser öffneten deshalb mehrere parallele Verbindungen zu einem Server.

HTTP/2 überträgt die Nachrichten binär statt als Text, komprimiert die Kopfzeilen und führt viele parallele Datenströme über eine einzige TCP-Verbindung (Multiplexing). Auf der Ebene von TCP bleibt aber die Head-of-Line-Blockierung bestehen: Geht ein einziges TCP-Segment verloren, warten alle Datenströme. HTTP/3 löst dieses Problem, indem es statt TCP das Protokoll QUIC über UDP nutzt, in dem jeder Datenstrom für sich zuverlässig übertragen wird. Bei QUIC ist TLS 1.3 fest eingebaut; unverschlüsseltes HTTP/3 gibt es nicht.

### Zwischenspeicherung

Mit der Kopfzeile `Cache-Control` steuert der Server, ob und wie lange Browser und Zwischenspeicher eine Antwort wiederverwenden dürfen. Der Wert `no-store` verbietet jede Speicherung. Der Wert `no-cache` verbietet die Speicherung dagegen nicht, sondern verlangt nur, dass vor jeder Wiederverwendung beim Server nachgefragt wird. Für diese Nachfrage schickt der Browser etwa ein zuvor erhaltenes ETag in der Kopfzeile `If-None-Match` mit; hat sich die Ressource nicht geändert, antwortet der Server mit 304 ohne Rumpf.

## TLS

Transport Layer Security (TLS) sichert eine Verbindung zwischen zwei Programmen ab und liegt zwischen der Transportschicht und der Anwendung. HTTPS ist nichts anderes als HTTP über TLS, standardmäßig auf Port 443. TLS verfolgt drei Schutzziele: Vertraulichkeit, weil Dritte die Daten nicht mitlesen können, Integrität, weil Veränderungen auf dem Weg erkannt werden, und Authentizität, weil der Client prüfen kann, ob er wirklich mit dem gewünschten Server spricht.

### Versionen

TLS ist der Nachfolger des älteren SSL. Alle SSL-Versionen sowie TLS 1.0 und TLS 1.1 gelten als unsicher und sind seit 2021 offiziell abgekündigt. Verwendet werden heute nur noch TLS 1.2 und das 2018 veröffentlichte TLS 1.3. TLS 1.3 hat zahlreiche veraltete Verfahren gestrichen, darunter den statischen Schlüsselaustausch mit RSA, und erlaubt nur noch Verschlüsselungsverfahren mit gleichzeitiger Integritätssicherung (AEAD) wie AES-GCM und ChaCha20-Poly1305.

### Der Handshake in TLS 1.3

Zu Beginn der Verbindung handeln Client und Server im Handshake die Verfahren aus und vereinbaren einen gemeinsamen Schlüssel:

1. Der Client sendet ein ClientHello mit den unterstützten Verfahren, einer Zufallszahl und bereits seinem Anteil für einen Diffie-Hellman-Schlüsselaustausch. In der Erweiterung Server Name Indication (SNI) nennt er außerdem den gewünschten Servernamen.
2. Der Server antwortet mit einem ServerHello mit seinem eigenen Diffie-Hellman-Anteil. Beide Seiten können jetzt denselben geheimen Schlüssel berechnen; alles Weitere läuft bereits verschlüsselt.
3. Der Server schickt sein Zertifikat und eine Signatur über den bisherigen Handshake, mit der er beweist, dass er den privaten Schlüssel zum Zertifikat besitzt.
4. Beide Seiten bestätigen den Handshake mit einer Finished-Nachricht, und die Anwendungsdaten können fließen.

TLS 1.3 kommt damit mit einer einzigen Umlaufzeit für den Handshake aus, TLS 1.2 brauchte zwei. Bei einer Wiederaufnahme einer früheren Sitzung erlaubt TLS 1.3 sogar, Daten schon mit der ersten Nachricht zu senden (0-RTT). Diese frühen Daten können allerdings von Angreifern aufgezeichnet und erneut eingespielt werden; sie dürfen deshalb nur für Anfragen verwendet werden, deren Wiederholung keinen Schaden anrichtet, also etwa für idempotente GET-Anfragen.

### Vorwärtsgeheimhaltung

In TLS 1.3 wird für jede Verbindung ein neuer, flüchtiger Diffie-Hellman-Schlüssel erzeugt und danach verworfen. Selbst wenn ein Angreifer später den privaten Schlüssel des Serverzertifikats erbeutet, kann er aufgezeichnete frühere Verbindungen deshalb nicht entschlüsseln. Diese Eigenschaft heißt Vorwärtsgeheimhaltung (Forward Secrecy). Beim früheren RSA-Schlüsselaustausch fehlte sie: Wer den privaten Serverschlüssel kannte, konnte alle aufgezeichneten Verbindungen nachträglich entschlüsseln.

### Zertifikate und Vertrauen

Ein Zertifikat nach dem Standard X.509 bindet einen öffentlichen Schlüssel an einen Namen, etwa einen Domainnamen. Es ist von einer Zertifizierungsstelle (Certificate Authority, CA) signiert. Der Client vertraut einem Zertifikat nur, wenn er eine lückenlose Kette von Signaturen bis zu einem Wurzelzertifikat bilden kann, das in seinem Betriebssystem oder Browser als vertrauenswürdig hinterlegt ist. Zwischen Wurzel und Serverzertifikat stehen meist ein oder mehrere Zwischenzertifikate, die der Server mitschicken muss.

Bei der Prüfung kontrolliert der Client außerdem, ob das Zertifikat zeitlich gültig ist, ob der aufgerufene Name im Zertifikat steht und ob das Zertifikat widerrufen wurde. Schlägt eine dieser Prüfungen fehl, bricht der Browser die Verbindung ab oder zeigt eine Warnung. TLS sichert damit nur den Transportweg: Es garantiert, dass man mit dem Inhaber eines Domainnamens spricht, nicht aber, dass dieser Inhaber vertrauenswürdig ist. Auch eine betrügerische Website kann ein gültiges Zertifikat besitzen.

Mit der Kopfzeile `Strict-Transport-Security` (HSTS) teilt ein Server dem Browser mit, dass er für eine festgelegte Zeit ausschließlich über HTTPS erreichbar ist. Der Browser wandelt dann jeden späteren Aufruf über unverschlüsseltes HTTP selbst in HTTPS um, bevor er überhaupt eine Anfrage sendet. So wird verhindert, dass ein Angreifer die erste, noch unverschlüsselte Anfrage abfängt und den Nutzer auf einer ungesicherten Verbindung festhält.
