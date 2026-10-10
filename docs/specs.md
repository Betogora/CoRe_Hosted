# CoRe — Produktvertrag und Kernjourneys

**Rolle:** einzige kanonische Quelle für Produktversprechen, Kernjourneys, funktionale Anforderungen und Produktabnahme.
**Status:** Arbeitsfassung
**Stand:** 2026-10-10

CoRe ergänzt Spaced Repetition um Content Repetition: Wissen auch bei veränderter Frage abrufen. Implementierung, Architektur, Betrieb, Entscheidungen, Verlauf und Roadmap stehen in der [Dokumentenlandkarte](README.md).

## 1. Produktvision

CoRe startet Anki-kompatibel, hält das Lernen ruhig und behandelt jede planbare Karte als eigene Lerneinheit. Gelernt wird der Inhalt, nicht Layout, Wortlaut oder Lückenposition.

### Zielgruppen

- Studierende und Auszubildende mit großen, langfristig gepflegten Kartenbeständen.
- Anki-Nutzer, die vorhandene Stapel weiterverwenden wollen.

### Kernnutzen

1. Bestehende und neue Lerninhalte schnell in ein gemeinsames Modell bringen.
2. Eine ruhige, vorhersehbare Review-Sitzung mit vier Bewertungen anbieten.
3. Reife Karten kontrolliert durch KI-Umformulierungen variieren.
4. Jede Umformulierung auf ihre zugrunde liegende Karte zurückführen.
5. Nutzerinhalte accountgebunden und nachvollziehbar halten.

## 2. Produktprinzipien

1. **Anki-kompatibel starten:** APKG-Import und bekannte Kartenformen senken die Einstiegshürde.
2. **Karten bleiben eigenständig:** Jede Karte besitzt genau einen Lernstand; ihre KI-Umformulierungen teilen ihn.
3. **Review first:** Vor dem Aufdecken ist nicht erkennbar, ob eine Karte oder eine Umformulierung abgefragt wird.
4. **Lernen bleibt privat:** Stapel und Reviewdaten sind accountgebunden und werden nicht veröffentlicht.
5. **Stapelweise steuerbar:** Content Repetition ist je Stapel an- oder ausgeschaltet.
6. **Sparsam ausbauen:** Nicht jede Karte wird variiert; neue Produktflächen brauchen einen belegten Core-Auftrag.

## 3. Produktreife

Die verbindliche Reifeentscheidung steht in [ADR-001](decisions.md#adr-001--core-labs-und-disabled), der aktuelle Stand in [`status.md`](status.md).

### Core

- E-Mail-/Passwort-Account und verständlicher leerer Zustand.
- Heute-Dashboard und klarer Lernstart.
- APKG-Import bis 2 GiB.
- Manuelle Stapel- und Kartenerstellung einschließlich Bildverdeckung mit Masken-Editor.
- Karten- und Stapelverwaltung.
- Review mit vier Bewertungen und Content Repetition; nach der Antwort ist die zugrunde liegende Karte einsehbar.
- Direkt erreichbare Hilfe zu FSRS, CoRe und Varianten.
- Accountgebundene Speicherung mit Sync- und Konfliktstatus.
- Grundlegende Statistik und verständliche Einstellungen.

### Disabled

- Anki-Pakete über 2 GiB; sie werden lokal abgewiesen.
- Google und Magic Link, solange ihr jeweiliges Auth-Flag deaktiviert ist.
- DOCX und OCR.
- Vollständige Art.-15-Auskunft und Account-Löschung.

## 4. Domänensprache

Abweichende Code- und Tabellennamen erklärt [`architecture.md`](architecture.md#inhalte-und-karten).

| Begriff | Produktbedeutung |
| --- | --- |
| Deck / Stapel | Hierarchisch organisierte Sammlung von Karten und Lernoptionen |
| Inhalt (Note) | Einmal gespeicherte Felder mit Rollen, Tags, Medien und Markierung; erzeugt eine oder mehrere Karten |
| Karte (Card) | Eigenständig planbare Abfrage eines Inhalts mit Stapel, eigenem Lernstand, Aussetzung und Varianten |
| Variante (Card Variant) | KI-Umformulierung einer Karte ohne eigenen Lernstand oder Termin |
| CoRe-Modus | Stapeleinstellung `An` oder `Aus` für Content Repetition |
| Lernstufe | Aus Bewertungen abgeleitete Erfahrungspunkte (XP) einer Karte; ab der Stapelschwelle erscheinen Varianten |
| Review State | Persönlicher Schedulingzustand einer Karte |
| Review Event | Unveränderliches Bewertungs- oder manuelles Neuplanungsereignis |

## 5. Kernjourneys

### 5.1 Account öffnen und Produktzustand verstehen

Neue Accounts starten ohne erfundene Profildaten, Demo-Stapel oder fremde Lernhistorie. Das Dashboard erklärt den Kernnutzen und führt zu Import, manueller Karte oder bewusst gewählter Demo.

Akzeptanz:

- Die Login-E-Mail erscheint als Accountwert und nicht als wirkungslose Profiländerung.
- Datenschutztexte versprechen nur technisch wirksames Verhalten.
- Sync-, Offline- und Konfliktstatus sind ohne Tabellen-, Revisions- oder Geräteterminologie verständlich.
- Demo-Daten entstehen nur durch eine ausdrückliche Nutzeraktion oder im Entwicklungs-/Testmodus.
- Die Begrüßung trennt `Willkommen zurück,` vom kleineren, vollständig umbrechbaren Profilnamen.

#### Tageslernfläche

- Ein befülltes Dashboard zeigt genau eine Tageslernfläche statt eines Fälligkeitszählers. Sie aggregiert die alphabetisch sortierten Hauptstapel-Sessions samt Unterstapeln ohne Doppelzählung.
- `Gelernt`, `Neu`, `Offen` und `Fällig` folgen den Reviewfarben in vollständig gefüllter Segmentreihenfolge; `Gelernt` bleibt neutral grau. `X / Y Karten` zählt eindeutige heute relevante Karten. Fünftes Segment, Untertitel, Zeitprognose und Konfetti entfallen.
- Zustände: `Dein Lernen heute`, deaktiviertes `Später weiterlernen` bei noch nicht verfügbaren heutigen Lernschritten oder der grüne Abschluss `Tagesziel erreicht` (auch bei `0 / 0 Karten`).
- Das randlose Play-Icon oben rechts entspricht der Stapel-Lernaktion und startet als `Jetzt lernen` die erste verfügbare Hauptstapel-Session. Name und Tooltip folgen dem Zustand; im Wartezustand ist es deaktiviert. Buttonspalte und Plan-Vorschauen entfallen.
- Die vier Kennzahlen zeigen einzeilige Zahlen und Labels gleicher Schriftgröße; nur ihre Gruppen umbrechen.
- Nach Zielerreichung öffnet `Zusätzliche Karten lernen` nur bei weiteren neuen Karten jenseits des Tageslimits einen Dialog. Hauptstapel und `+5`, `+10` oder `+20` sind auf den tatsächlichen Rest begrenzt. Bestätigung erhöht nur `newCardsTodayOverride` dieses Stapels für den aktuellen Lerntag und startet die Session; Wiederholungen werden nicht vorgezogen. Veraltete Auswahlen ändern nichts und melden einen verständlichen Fehler.

### 5.2 Stapel importieren oder manuell anlegen

Nutzer wählen zwischen manueller Erstellung und APKG-Import. Beide Wege speichern zuerst lokal und synchronisieren danach.

Akzeptanz:

#### APKG-Import

- Der Importbereich bietet ausschließlich Anki-Pakete (`.apkg`, `.colpkg`) an; Text-, CSV- und Tabellenimporte gibt es nicht.
- Das Paket wird zuerst analysiert. Vorschau und `Import übernehmen` sind getrennte Schritte.
- Hierarchien werden ohne fachliches Tiefenlimit importiert. Jeder Stapel verweist auf seinen unmittelbaren Anki-Elternstapel und behält den Quellpfad; eine Abflachungswarnung gibt es nicht.
- Der Bericht nennt Datei, Stapel, Karten, vorhandene und fehlende Medien sowie verständliche Warnungen. Der Abschnitt `Notiztypen` zeigt je Notiztyp Übersetzer, Inhalte, Karten, übernommenen Lernstand, generisch als Feldliste übernommene und übersprungene Inhalte, nur im Editor sichtbare Felder und fehlende Medien.
- Bis zu drei Beispielkarten erscheinen im Reviewrenderer mit Frage, Antwort und Beispielmedien. Tatsächliche Darstellungsabweichungen und Diagnosen bleiben sichtbar; pauschale Originaltreue- und Sicherheitshinweise entfallen. Notetype-IDs, Template-Ordinals, Hashes und Importidentitäten dominieren den Hauptflow nicht.
- Eine accountgebundene APKG-Sitzung erhält bei App-Navigation Datei-Metadaten, Vorschau, Fortschritt und Abschluss; `Erstellen → Import` stellt sie wieder dar. Die Zurückaktion `Erstellen`, Logout und bestätigter Abschluss setzen sie zurück. Reload erhält weder Datei noch Vorschau oder Worker.
- `Import übernehmen` endet nach dem lokal validierten IndexedDB-Commit und dem dauerhaften Einreihen vorhandener Medien. Jede Anki-Notiz wird ein Inhalt, jede reale Anki-Karte eine eigenständige CoRe-Karte dieses Inhalts. Inhalte, Karten, Reviews und Medien synchronisieren danach getrennt; Anki-Vorlagen und rohe Felder bleiben unsichtbar für spätere Neuübersetzungen erhalten.
- Nach einem Reimport nennt der Bereich, wie viele lokal bearbeitete Inhalte unverändert blieben und wie viele Karten im Paket fehlen.
- Offline- und erneut versuchbare Fehler melden `Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus.` und lassen Outbox und Medienqueue bestehen. Nicht erneut versuchbare Konflikte bleiben sichtbar und entfernen die lokalen Karten nicht.
- Abbruch, erneut versuchbarer Fehler, terminaler Fehler, Teilabschluss und Erfolg sind getrennte Zustände mit jeweils passender Folgeaktion.
- Nach bestätigtem Erfolg öffnet sich ohne Zwischenbutton genau einmal `Import erfolgreich` mit verifizierter Kartenzahl und Stapelpfad. `Jetzt lernen` startet den importierten Wurzelstapel samt Unterstapeln, `Zur Übersicht` führt zu `Heute`. `Karten prüfen` und `Weitere Karten erstellen` gehören nicht zu dieser Ansicht.

#### Manuelle Erstellung

- Die Erstellung beginnt ohne Kartentypauswahl mit Vorder- und Rückseite. `Fragentyp` und `Lernrichtung` teilen ab 768 px eine Zeile, sobald beide ohne Überlauf hineinpassen, sonst umbrechen sie in zwei Gruppen.
- Die Fragentyp-Pill bietet `Standard`, `Single Choice`, `Multiple Choice` und `Bildverdeckung`. Beschriftungen dürfen auf schmalen Ansichten in der unveränderten 44-px-Höhe zweizeilig werden (`Bild-verdeckung`); unter 360 px stehen die vier Typen in zwei Reihen.
- Bilder werden über die Rich-Text-Toolbar, Einfügen oder Drag-and-drop an der Cursorposition in Vorderseite, Rückseite und Zusatzfelder eingefügt; separate Bild-Ablagefelder gibt es nicht.
- `Lücke` markiert die gespeicherte Textauswahl als Cloze-Gruppe. Rückrichtung, Single Choice und Multiple Choice sind direkte Steuerungen; bei Auswahltypen stehen die Antwortoptionen unmittelbar unter der Frage. `Auswahl als Formel setzen` macht die markierte Auswahl zur Formel.
- Die gemeinsamen Bausteine unter den Feldern: `Antwort eintippen` (nur Frage und Antwort ohne Auswahl; die Rückseite wird beim Lernen eingetippt und verglichen) sowie neue Felder mit den Rollen `Zusatzfrage` (Teil der Frage, in Rückrichtung Teil der Antwort), `Hinweis` (aufdeckbar auf der Frageseite), `Zusatz` und `Quelle` (beide nach der Antwort).
- Zusätzliche Felder tragen einen frei benennbaren Namen und eine änderbare Rolle; neue Felder heißen wie ihre Rolle, bei Wiederholung mit Nummer. Verschiebepfeile erscheinen erst ab zwei Zusatzfeldern und nur für mögliche Richtungen.
- `Vorschau` im Erstellkopf öffnet den gemeinsamen Kartendialog aus dem ungespeicherten Entwurf mit derselben Projektion wie Speichern. Eine zusätzliche `Live-Vorschau` und pauschale Sicherheits- oder Originaltreue-Werbung entfallen.
- `PDF/Text anfügen` steht in der Zurückzeile direkt neben `Erstellen`. Unterstützte Quellen sind PDF, Text, Markdown, CSV und TSV; nicht lesbare Formate sind nicht auswählbar.
- Nach `Speichern` bleibt der Editor offen: Angeheftete Felder bleiben, andere werden geleert, das Zieldeck bleibt gewählt, und der Fokus springt in das erste freie Pflichtfeld.
- Speichern startet genau einen exklusiven Versuch. Entwurf, Zielstapel, `Fertig` und interne Navigation bleiben bis zum Abschluss gesperrt; Mehrfachklick und Tastaturaktivierung erzeugen höchstens eine Karte. Reload und Tab-Schließen zeigen währenddessen die Browserwarnung.
- Bilder werden vor der Karte im accountgebundenen lokalen Medienspeicher gesichert, danach wird die Karte lokal gespeichert und der Upload versucht. Ein Fehler vor der lokalen Kartenspeicherung erhält den Entwurf und erhöht den Sitzungszähler nicht. Ein späterer Medien- oder Cloudfehler zählt die lokale Karte genau einmal und erzwingt keinen erneuten Save.
- JPEG, PNG und WebP oberhalb Full HD werden vor Prüfsumme und lokaler Sicherung proportional verkleinert: Querformat auf höchstens 1920 × 1080, Hochformat auf 1080 × 1920. Kleinere Dateien, SVG, GIF und AVIF bleiben bytegenau; APKG-Medien sind ausgenommen.
- Ein zugänglicher, monotoner Fortschrittsbalken zeigt die Phasen `Bilder werden lokal gesichert`, `Karte wird lokal gespeichert` und den Upload mit ursprünglichem Dateinamen und Byteangaben. 100 Prozent erscheinen erst am Ende des Versuchs; Reduced Motion wird berücksichtigt.
- Meldungen: Vollständiger Cloudabschluss meldet `Karte wurde erfolgreich gespeichert.`; ein erneut versuchbarer oder Offline-Teilabschluss `Karte und Bilder sind lokal gespeichert. Die Cloud-Synchronisierung wird automatisch fortgesetzt.`; ein nicht erneut versuchbarer Medienfehler nach lokaler Speicherung erscheint als unvollständiger Medienzustand.
- Zielauswahlen zeigen vollständige Stapelpfade. Erst `Fertig` öffnet den Abschluss mit Sitzungsanzahl, Zielpfad, `Jetzt lernen` und `Karten prüfen`.
- Interne Navigation mit nichtleerem Entwurf verlangt eine Bestätigung: `Weiter bearbeiten` erhält Inhalt und Fokus, `Verwerfen und verlassen` verwirft nur den aktuellen Entwurf. Während eines Speicherversuchs bleibt die Navigation ohne Verwerfoption auf der Seite und fokussiert den Fortschritt.

#### Bildverdeckung

- Bei `Bildverdeckung` wird die Vorderseite zur optionalen `Überschrift`, die Rückseite zum optionalen `Zusatz`. Hinweis-, Zusatz- und Quellenfelder bleiben möglich, Eintippen und Rückrichtung nicht.
- Das Bild wird per Auswahl, Drag-and-drop oder Einfügen gewählt und wie Inline-Bilder lokal vorbereitet, verkleinert und hochgeladen.
- Der Editor `Bild und Masken` zeigt links das Bild und rechts `Werkzeuge` (Auswählen, Rechteck, Ellipse, Polygon, Text), `Auswahl` (Gruppieren, Auflösen, Bleibt verdeckt, Löschen), `Verdecken` (`Alle` Masken oder `Nur eine`) und die Kartenliste. Unter 1024 px steht die Spalte unter dem Bild, Werkzeuge erscheinen als Symbole.
- Jede neue Maske ist eine eigene Karte; gruppierte Masken werden gemeinsam abgefragt; `Bleibt verdeckt` verdeckt eine Maske auf allen Karten ohne eigene Abfrage.
- Maus, Stift und Touch zeichnen per Ziehen, Polygone per Punkten (erster Punkt, Doppelklick oder Enter schließt). Per Tastatur sind Masken fokussierbar: Pfeiltasten verschieben, Entf löscht, Strg+G gruppiert, Strg+Umschalt+G löst auf, Escape hebt die Auswahl auf, Buchstaben wählen das Werkzeug.
- Gespeichert wird erst mit Bild und mindestens einer abgefragten Maske.

### 5.3 Karten bearbeiten und eine Sitzung starten

`Lernen` bündelt `Stapelübersicht` und `Kartenverwaltung` als schnellen Sitzungseinstieg; `Lerneinstellungen` öffnet die accountweite Planung unter `/karten-einstellungen`. Die direktlinkfähige Gesamtverwaltung für Karten, Stapelstruktur, Inhalt und erweiterte Optionen liegt unter der verborgenen Route `/kartenstapel`.

Akzeptanz:

#### Navigation und Seitenkopf

- Die Hauptnavigation lautet exakt `Heute`, `Lernen`, `Erstellen`, `Statistik`. Auf `/kartenstapel` ist `Lernen` aktiv; ein Klick auf `Lernen` öffnet stets die Stapelübersicht. Der Schriftzug `CoRe` navigiert zu `Heute`.
- Beide Lernen-Bereiche zeigen `REVIEW` und `Lernen` im Seitenkopf. Das segmentierte Control und der sekundäre Button `Lerneinstellungen` teilen Bedienhöhe und Typografie; `Lerneinstellungen` behält sein Icon und steht links vor der rechtsbündigen Bereichs-Pill.
- Über 42 rem Kopfbreite stehen die Controls rechts neben der Überschrift, zwischen 32 und 42 rem gemeinsam darunter. Bis 32 rem steht `Lerneinstellungen` neben `Lernen`, und die Bereichsauswahl füllt die nächste Zeile. Nichts überlagert sich, kein horizontaler Seitenüberlauf.
- Der Auswahlindikator aller segmentierten Controls (auch `Woche`, `Monat`, `Jahr`) gleitet zwischen den Positionen und passt seine Breite an; bei reduzierter Bewegung entfällt der Übergang.

#### Stapelbäume

- `Heute`, `Lernen` und `Kartenverwaltung` teilen Stapeldaten, Tiefenfarbe, Chevron, Icon und Drei-Punkte-Aktion. Die Hierarchie ist unbegrenzt; Einrückung (8 px je Ebene, höchstens 40 px), Tiefenfarbe und `data-deck-depth` bleiben ab Ebene 6 konstant. Jeder Elternstapel behält seinen Chevron; Einklappen verbirgt den gesamten Unterbaum.
- Zeilen zeigen lokale Namen; nur zu lange Namen werden zweizeilig. Stapelbäume sind je Ebene alphabetisch wie in Anki sortiert, ohne numerische Sonderbehandlung (`Stapel 10` vor `Stapel 9`); Elternstapel bleiben mit ihrem Unterbaum zusammen.
- `Heute` und `Lernen` zeigen `Neu`, `Offen`, `Fällig` und den Gesamtfortschrittsdonut unter einer etwa 28 px hohen, nicht sortierbaren Kopfzeile. Auf schmalen Panels entfallen Kennzahllabel ohne Abkürzung; Zahlen behalten zugängliche Namen. Die Kartenverwaltung zeigt auf keiner Ebene Kennzahlen oder Donut, auch nicht assistiv.
- Die Tageszahlen berücksichtigen verbleibende Limits: ausgewählte neue Karten (`Neu`), heutiges Learning/Relearning (`Offen`) und ausgewählte fällige Reviews (`Fällig`). Der Donut zeigt den gesamten aktiven Bestand ohne Limits als `Neu`, `Offen`, `Fällig` und `Gelernt`. Elternzeilen aggregieren den Teilbaum nach den Einstellungen des dargestellten Stapels. Ausgesetzte und begrabene Karten zählen nirgends.
- Die Stapelfläche öffnet `/kartenstapel?deck=<ID>&content=1`. Ein eigener randloser Play-Button links von `Neu` startet den Reviewpfad samt Unterstapeln und Limits; sein zugänglicher Name enthält den Stapelpfad, sein Tooltip den lokalen Namen mit Stapel-Icon. Auf-/Zuklappen, Lernen und Stapeloptionen lösen die Flächenaktion nicht aus; die Fläche ist per Enter und Leertaste bedienbar.
- Donut, Play-Button und Stapeloptionen haben gleiche schmale Abstände und 44-px-Klickflächen; die Drei-Punkte-Grafik misst 32 px. Icons füllen sich bei Hover, Betätigung und offenem Menü ohne zusätzliche Hoverfläche. Pointer-Hover füllt Zeilen neutral grau; Stapelköpfe haben keine Trennlinie, Kartenzeilen behalten ihre dünnen Grenzen.
- Dashboard und Lernen verwenden dasselbe Panel `Aktive Stapel`; nur das Dashboard zeigt `Alle ansehen`. Lernen zeigt darunter dauerhaft das Schnellformular `Stapelname`, `Ebene`, `Anlegen`, auch ohne Stapel und nach dem Anlegen.
- Auf-/Zuklappzustände sind je Ansicht kontogebunden und überstehen Navigation, Reload und Neuanmeldung. Ohne Präferenz starten die Sektionen der Kartenverwaltung eingeklappt; ein fokussierter Stapel oder eine verlinkte Karte öffnet und speichert die betroffene Sektion. Eine leere, als `Nicht festgelegt` dargestellte Profilzeitzone blockiert das Speichern nicht.

#### Stapelinhalte

- Die Inhaltsansicht zeigt die Karten des Stapels samt aller Unterstapel mit gemeinsamer Suche, Sortierung und Seitenwechsel. Mit Unterstapeln verwendet sie die hierarchischen Stapelköpfe der Kartenverwaltung, initial geöffnet und lokal auf- und zuklappbar; ohne Unterstapel entfällt der Kopf. `Aktive Stapel` und der Bereichsumschalter entfallen.
- Sie nutzt dieselben Kartenzeilen, denselben Editor und dieselben Mutationen wie die Gesamtverwaltung; Aktionen wirken im tatsächlich zugehörigen Unterstapel. Ein Kartenlink und das Schließen des Editors erhalten den Inhaltskontext auch nach Reload. Elternstapel und andere Zweige bleiben ausgeschlossen.
- Darüber steht eine segmentierte Navigation mit gleitendem Indikator: `Karteikarten`, `Notizen`, `Mind Map`, `Quiz`, `Quelle`. Unter 768 px füllt sie die Breite, darüber höchstens 24 rem. Nur die aktive Auswahl zeigt Icon und Wort. Initial ist `Karteikarten` aktiv; die übrigen Bereiche zeigen Icon, Namen und `Demnächst verfügbar`.
- Rechts neben der Suche startet ein unbeschrifteter Dreieck-Button (`<Stapelname> lernen`) die Sitzung samt Unterstapeln. Er hat Rahmen und Rundung des Suchfelds, füllt sich beim Hover und ist nur bei leerem Stapelbaum deaktiviert; die Suche beeinflusst ihn nicht. Das Verlassen der Sitzung führt zu den Stapelinhalten zurück.

#### Kartenverwaltung

- Ein gemeinsames Panel bündelt `Aktive Stapel`, die Suche mit sichtbarem Label `Karten durchsuchen` und die gruppierte Gesamttabelle. Einen Direkteinstieg zur Kartenerstellung gibt es dort nicht.
- Die Tabelle zeigt je Karte nur `Sortierfeld` (bereinigte Vorderseite), `Datum` (`Neu` oder `TT.MM.JJJJ`) und `Variante` (grauer Haken bei aktiven Varianten, sonst grauer Strich, gleich breit und zugänglich beschriftet). Alle Spalten sind auf- und absteigend sortierbar; Standard ist `Sortierfeld` A–Z, einheitlich für alle Sektionen und nicht persistiert. Leere aufgeklappte Stapel zeigen `Keine Karten`.
- Ausgesetzte Karten bleiben mit unverändertem Datum sichtbar, erhalten eine gelbe Warnfläche über die ganze Zeile und die zugängliche Kennzeichnung `Ausgesetzt`. Markierte Karten zeigen rechts neben dem Variantenicon einen gelben Stern in einer gleich ausgerichteten Spalte. Beides kann gleichzeitig erscheinen.
- Zeilen und Köpfe bleiben einzeilig und etwa 28 px hoch; lange Sortierfelder erhalten Ellipsen. Stapelköpfe sind höchstens etwa 48 px hoch. Kartenverwaltung und `Aktive Stapel` erzeugen keinen horizontalen Überlauf; `Datum` und `Variante` bleiben ungekürzt. Bis 24 rem Zeilenbreite steht in Dashboard und Lernen der Name über Aktion, Kennzahlen und Optionen.
- Bei mehreren Seiten stehen darunter umrundete Chevron-Pfeile wie in der Heatmap mit `Seite X von Y` in Kartenfragen-Schriftgröße; an den Enden ist der Pfeil deaktiviert.
- Die Suche umfasst Stapelpfad, alle Felder, Antwortoptionen und Tags, startet 250 ms nach der letzten Eingabe, bricht veraltete Anfragen ab und öffnet passende Sektionen nur während der Suche. Einen Modusfilter gibt es nicht.

#### Stapeloptionen, Verschieben und Löschen

- Jede Stapelgruppe besitzt dasselbe Drei-Punkte-Menü mit Icon, lokalem Namen, CoRe-Modus (`Aus`/`An`), `Einstellungen` und bestätigtem `Verschieben`. Der randlose Trigger trägt den Tooltip `Stapeloptionen für <lokaler Stapelname>` mit 16-px-Stapel-Icon; sein zugänglicher Name enthält den vollständigen Pfad. Auch `Stapel umbenennen` zeigt dieses Icon.
- Der Bereich `Stapel` in den Stapeleinstellungen ordnet Name, Icon und Farbe sowie darunter ohne Trennlinie `Unterstapel anlegen`, den segmentierten `CoRe-Modus` und `Löschen` an. Unterstapel entstehen dort mit vorausgewähltem Elternstapel oder über die Ebenenauswahl des Schnellformulars.
- In Dashboard und Lernen verschiebt ein Desktop-Drag den vollständigen Baum als direkten Unterstapel des hervorgehobenen Ziels; die Hauptebenen-Zone entfernt die Elternzuordnung. Nach kurzer Bewegungsschwelle reagiert die Zeile direkt auf Maus und Trackpad und hält den Griff auch außerhalb der Zeile.
- Während des Drags dunkelt ein Fokus-Overlay die Oberfläche ab; Quelle (eckig ausgespart), aktuelles Ziel und Hauptebenen-Zone bleiben hell. Die Zone ersetzt nahezu vollflächig die Desktop-Sidebar oder positionsgetreu die mobile Bottom-Bar; im Panelkopf erscheint keine zweite Zone. Gültige Ziele tragen einen verstärkten Warnfarb-Indikator, ein erfolgreicher Drop klappt das Ziel auf. Selbst-, Nachfahren- und unveränderte Ziele ändern nichts.
- Ein beendeter Drag startet keine Sitzung. Erfolg, Fehler und No-op werden über eine Live-Region gemeldet; Bestätigung und Rückgängig gibt es dabei nicht. Die Kartenverwaltung, Touch, Tastatur und assistive Bedienung verwenden den bestätigten Verschiebedialog.
- Stapelanzahl und Verschieben samt Unterbaum haben kein fachliches Limit. APKG-Hierarchien behalten Elternbeziehung, Pfad, Importidentitäten und `ankiDeckPath`; Inhalts- und Anki-Tags bleiben unverändert.
- Stapellöschung zeigt Stapelname, Unterstapelzahl und aktive Kartenanzahl; Abbruch ändert nichts.
- Kartenlöschung verwendet `Karte löschen?` mit `Nein` (Kreuz) und `Ja` (Haken), bei mehreren Karten `Inhalt mit N Karten löschen?` mit dem Hinweis, dass alle Karten des Inhalts auch in anderen Stapeln gelöscht werden. `Nein`, Escape und Außenklick brechen ab; der Außenklick schließt zusätzlich das Detail. `Ja` löscht lokal persistent (Soft Delete), schließt Dialog und Detail, hält die Scrollposition und meldet oben rechts `Karte wurde erfolgreich gelöscht.` bzw. `Inhalt mit N Karten wurde erfolgreich gelöscht.` mit sofortigem Undo samt Lernstand. Eine ausstehende Synchronisierung blockiert den Abschluss nicht.
- Programmatische Fokusführung, Fokusfallen und Tastaturbedienung bleiben erhalten; sichtbare Fokusrahmen, Fokus-Rings und reine `focus-within`-Rahmen werden appweit nicht dargestellt.

#### Kartendetail und Editor

- Ein Kartenklick setzt Deck- und Karten-ID in die URL und öffnet rechts ein nicht-modales, eigenständig scrollendes `aside`: ab 1024 px über der rechten Tabellenhälfte, darunter in voller Breite. X, Escape und Außenklick schließen es; ein Klick auf eine andere Kartenzeile wechselt dorthin. Reload und Browser-Zurück/-Vorwärts bleiben deterministisch; danach kehrt der Fokus zur Zeile zurück.
- Aus einer Review-Sitzung über `Karte bearbeiten` geöffnet, trägt die URL einen allowlist-validierten Rückkontext; Schließen führt in die Sitzung zurück.
- Das Detail zeigt den Inhaltseditor mit `Speichern`, `Vorschau`, `Kopieren` und `Löschen`. Unter dem Titel stehen Inhaltsform, Abfrage der Karte (`Lückentext · Lücke 2 von 3`, `Rückwärts`, `Maske 1`) und bei mehreren Karten deren Zahl. `Karten aus diesem Inhalt` listet alle Geschwister mit Abfrage, Stapel und Lernzustand; die geöffnete ist hervorgehoben.
- Der Editor zeigt je Feld einen Rich-Text-Editor, bei Auswahlfragen Antwortoptionen samt richtiger Antwort, und die Tags. Lückentexte erklären `{{c1::Begriff}}`. Bei eigenen Inhalten mit Frage und Antwort stehen darüber `Lernrichtung` (`Standard`, `Beide Richtungen`) und darunter dieselben Bausteine wie bei der Erstellung; die Felder mit der letzten Frage oder Antwort einer Abfrage lassen sich nicht entfernen.
- Eigene Bildverdeckungen zeigen den Masken-Editor; Gruppennummern bleiben beim Löschen erhalten, sodass verbleibende Karten ihren Lernstand behalten. Das Bild lässt sich dort nicht austauschen. Importierte Inhalte behalten Feldschema und Abfragen; Lernrichtung, Bausteine und Masken-Editor erscheinen dort nicht.
- Eine Live-Zeile nennt vor dem Speichern die Wirkung (`Beim Speichern: 1 neue Karte (Rückwärts) · 1 Karte entfällt (Lücke 2) · 1 KI-Umformulierung wird veraltet.`). Entfallen Karten, listet `Karten entfernen?` jede mit Abfrage, Stapel und Lernzustand; ihr Lernstand wird erst nach Bestätigung gelöscht. Neue Abfragen werden neue Karten im Stapel des Inhalts.
- Ungespeicherte Änderungen an Feldern, Antwortoptionen und Tags lösen beim Schließen, Kartenwechsel oder interner Navigation einen Dialog mit `Speichern`, `Verwerfen` und `Weiter bearbeiten` aus. Varianteneingaben und Terminwahl sind davon ausgenommen.
- `Markieren` (gehört zum Inhalt, alle Geschwister zeigen den Stern) und `Aussetzen` (gehört zur einzelnen Karte) sind sofort gespeicherte Aktionen ohne Übernahme ungespeicherter Inhaltsänderungen.
- Darunter zeigt `Nächste Fälligkeit` den gemeinsamen Datumspicker (deutsche Wochentage, Monats- und Jahresnavigation, Light/Dark). `Neu planen` wird erst für einen anderen, mindestens nächsten Lerntag aktiv, setzt `dueAt` DST-sicher auf den Lerntagesbeginn in Profilzeitzone, lässt eine Aussetzung bestehen und bestätigt den Erfolg separat. Der Simulator nutzt denselben Picker mit Zehnjahresgrenze.
- `Kopieren` legt eine eigenständige Kopie mit neuen Karten in denselben Stapeln an; die Frage erhält einmalig `(Kopie)`. Felder, Tags und Medien bleiben, Karten-, Review- und Scheduleridentitäten sind neu.
- Einen Herkunfts-, Versions-, Vergleichs- oder Restore-Abschnitt gibt es nicht.

#### Vorschau und Darstellung

- Der modale Vorschau-Dialog zeigt zunächst nur die unbeantwortete Vorderseite und wechselt über eine segmentierte Seitenauswahl zum aufgedeckten Zustand aus Frage, einmaliger 2-px-Trennlinie und Antwort. `Antwort anzeigen` und Bewertungen erscheinen dort nicht.
- Auswahl samt Feedback wird nur transient simuliert: Single Choice deckt nach einer Auswahl auf, Multiple Choice und Kprim über `Antwort prüfen`; die Rückkehr zur Vorderseite setzt die Auswahl zurück. Der Dialog folgt dem Theme, ist auf Desktop leicht vergrößert, füllt mobil den Viewport und besitzt Fokusfalle, Escape, Außenklick und Fokuswiederherstellung.
- Kartenrenderer erhalten Rich-Text-HTML mit Absätzen, Fettung, Listen und Medien; wörtliche Markdown-Syntax wird nicht interpretiert. Die Kartenfläche verwendet Manrope und die Farben des aktiven Themes; Anki-CSS wird nicht übernommen.
- Vorschau und Review verwenden dieselbe Komposition, sodass die sichtbare Frage außerhalb der Antwort bleibt.
- Anki-Bedingungen prüfen den nichtleeren Feldinhalt: Reines Bild-, Audio- oder Video-Markup erfüllt eine positive Bedingung und unterdrückt die invertierte; reine Leerzeichen gelten als leer.

#### Inhaltsformen

- Vorderseite, Rückseite und Zusatzfelder sind sanitisiertes Rich Text; Pflichtfelder werden direkt am Feld validiert. Medien sind optionaler Inhalt, kein eigener Kartentyp.
- Rückrichtung erzeugt zwei unabhängige Karten mit eigenem Lernstand und eigener Fälligkeit; für Single und Multiple Choice wird sie nicht angeboten.
- Cloze ist eine Editoraktion; jede Lückengruppe wird eine eigenständige Karte.
- Single Choice, Multiple Choice und Kprim sind Antwortformate eines Inhalts mit genau einer Karte, kombinierbar mit Medien und Zusatzfeldern, aber nicht mit Cloze.
- Single Choice verlangt Frage, mindestens zwei eindeutige Optionen, genau eine richtige Option und eine optionale Erklärung. Multiple Choice erlaubt mehrere richtige Optionen und verlangt jederzeit mindestens eine richtige und eine falsche. Kprim entsteht aus Anki-Importen und fragt je Aussage `richtig` oder `falsch` ab; das Feedback nennt die Zahl richtig beurteilter Aussagen. Anzeige und Bewertung verwenden dieselbe gespeicherte Antwortmenge.
- Importierte Inhalte zeigen Felder in ursprünglicher Reihenfolge und mit ursprünglichen Namen; Werte sind editierbar, Feldschema und Anki-Vorlage bleiben. Nach einem Übersetzer-Update übersetzt CoRe unbearbeitete Importe automatisch einmal neu, ohne Karten mit Lernstand zu verlieren, und meldet `N Inhalte mit verbesserter Darstellung aktualisiert.`
- APKG-Reimport ordnet Inhalte über die Anki-GUID und Karten über die Anki-Karten-ID zu. Unbearbeitete Inhalte übernehmen den Paketinhalt, lokal bearbeitete bleiben unverändert. Lernstand, Markierung, Aussetzung und Stapelordnung bleiben; neue Abfragen werden neue Karten, im Paket fehlende Karten bleiben und werden gezählt.
- Der kanonische Vertrag besteht aus `Note` (Felder mit Rollen, Interaktion, Tags, Medienzuordnung Name → SHA-1) und den abgeleiteten `Card`-Abfragen. Quelldokumente, Quellsnapshots und Inhaltsversionen werden nicht gespeichert. Strukturierte Felder überstehen den Cloud-Roundtrip; einen CoRe-JSON-Export oder -Import gibt es nicht.

#### KI-Umformulierungen

- Eine Karte mit Frage und Antwort kann als KI-Variante umformuliert werden; Lückentexte, Auswahlfragen, Bildverdeckungen und Karten ohne Fragetext erklären den deaktivierten Zugang. Bei ausgeschaltetem CoRe-Modus oder erreichter Höchstzahl aktiver Varianten des Stapels ist die Aktion ebenfalls deaktiviert und begründet.
- Die Variante bleibt der Karte untergeordnet, besitzt keinen eigenen Lernstand und wird nicht als Karte gezählt.
- An den Anbieter gehen ausschließlich der bereinigte Text von Frage und Antwort mit je höchstens 1.200 Zeichen; Tags, IDs, Quellen, Reviewdaten, Metadaten und Medien nicht.
- CoRe speichert die Variante nur, wenn die Karte während des Aufrufs unverändert blieb und dieselbe Front/Back-Kombination noch nicht existiert. Fehler verändern nichts; während des Aufrufs ist die Aktion gesperrt. Nach einem kostenlosen Non-ZDR-Fallback erscheint eine sichtbare Warnung.
- Das Detail zeigt `Lernstufe` (`X von Y XP` und ob Varianten im Review erscheinen) und `Aktive Varianten` (`X von Y`). Ändert eine Inhaltsänderung Frage oder Antwort, werden aktive Umformulierungen `veraltet` und nicht mehr abgefragt; die Speichermeldung nennt ihre Zahl. `KI-Variante neu erzeugen` ersetzt die veralteten Umformulierungen durch eine neue.

### 5.4 Karte bewerten, neu laden und fortfahren

Vor der Antwort zeigt der Review nur den Lerninhalt und die Aktion zum Aufdecken, direkt auf der Seitenfläche ohne großen Kartencontainer, gerahmte Teilflächen oder Abschnittslabels. Nach dem Aufdecken bleiben Frage und Antwort sichtbar, getrennt durch eine 2-px-Linie; die Antwort wiederholt die Frage nicht. Vier Bewertungen aktualisieren den Lernzustand.

Akzeptanz:

#### Bewertung und Tagesfortschritt

- `Nochmal`, `Schwer`, `Gut` und `Leicht` sind per Maus und Tastatur (`1` bis `4`) erreichbar. Die kompakten Flächen zeigen zweizeilig die Bewertung und darunter kleiner das dynamische Intervall (`min` für Minuten); die Ziffern erscheinen nur in den Tooltips `Taste 1` bis `Taste 4`. Intervallvorschauen passen zur tatsächlich angewendeten Bewertung.
- Vor dem Aufdecken erscheinen keine Herkunfts-, Varianten-, Reife- oder Schedulerhinweise.
- Über der Karte steht ein beschrifteter, vollständig gefüllter Tagesfortschritt mit vier Segmenten: `Gelernt` (grau), `Neu` (Pink wie `Nochmal`), `Offen` (Orange wie `Schwer`) und `Fällig` (Gelb wie `Gut`). Jede abgeschlossene Karte wechselt nach `Gelernt`; ein abgeschlossener Tag ist ganz grau. Jedes Segment zeigt beim Hover einen einzeiligen Tooltip mit farbigem Squircle, Bezeichnung und Anzahl. Der Zähler nennt gelernte und heute relevante Karten; ein zugänglicher Text nennt alle vier Werte.
- Die Tagesmenge vereinigt die nach Stapel- und Tageslimits ausgewählte Queue mit den heute bereits bearbeiteten, weiterhin reviewbaren Karten. Der Sitzungsstart bildet daraus einen stabilen Plan; Zähler und Fortschritt nutzen dessen Gesamtzahl unabhängig vom Puffer. Nachladeseiten gehören zur Sitzung; ein Nachladefehler verkleinert den Tagesumfang nicht und täuscht keinen Abschluss vor.
- Eine heute beantwortete Karte zählt als `Gelernt`, sobald heute kein weiterer Schritt ansteht; steht noch ein Schritt am selben Lerntag an, wechselt sie nach `Offen`. Eine Learning-Karte mit nächstem Schritt morgen zählt heute als `Gelernt` und morgen als `Offen`. Reviewkarten sind am ganzen Fälligkeitstag verfügbar; Varianten und Wiederholungen zählen dieselbe Karte nicht mehrfach.
- Nur während eines laufenden Pomodoro-Timers zeigt ein schlanker Balken darunter die aufgerundeten Restminuten und den sekündlich sinkenden Anteil.

#### Werkzeuge auf der Karte

- Inhalte mit Vorlese-Angabe (aus Anki-`tts`) bieten `<Feld> vorlesen`. Vorgelesen wird über die Sprachausgabe des Systems in der hinterlegten Sprache; ohne Sprachausgabe ist die Aktion deaktiviert, ein Fehler wird gemeldet.
- Markierter Text auf einer Review-Karte bietet `In AMBOSS nachschlagen`. Erst dieser ausdrückliche Klick öffnet die AMBOSS-Suche in einem neuen Tab; dabei geht ausschließlich der markierte Text als Suchbegriff an AMBOSS, ohne Referrer und ohne weitere Karten- oder Kontodaten. Ohne Markierung steht dort nur der Hinweis `Begriff auf der Karte markieren, um ihn in AMBOSS nachzuschlagen.`

#### Sitzungs-Overlay

- Die Lerneinstellungen der Sitzung erscheinen unter 768 px als Bottom Sheet, darüber als zentriertes Overlay, beide in normaler App-Typografie mit den Abschnitten `Karte` und `Sitzung`, verdichtet auf die Bedienhöhe und ohne Trennlinien oder Icon-Hintergründe. Escape und Außenklick schließen; der Fokus bleibt im Dialog und kehrt danach zurück.
- `Karte bearbeiten` öffnet den Einzelkarten-Editor. `Stapel bearbeiten` öffnet die Einstellungen des Sitzungsstapels und kehrt auch nach Reload in dieselbe Sitzung zurück. Anki-Flaggen werden appweit weder angeboten noch dargestellt.
- `Markieren` ist ein gelber Stern-Button mit `aria-pressed`; der aktive Zustand ist gefüllt und verändert die Queue nicht.
- `Aussetzen` ist ein rechtsbündiges Segment `Nicht aussetzen` / `Aussetzen`. Aussetzen pausiert die Karte samt Varianten, ohne Lernzustand, Schritt, Fälligkeit, FSRS-Werte oder Historie zu ändern; ausgesetzte Karten fehlen in Queue, Tageszahlen, Fortschritt und Donut. Die aktuelle Karte verschwindet ohne Bewertung aus allen offenen Positionen, das Overlay schließt, die nächste Karte erhält den Fokus und der Toast lautet `Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.` Reaktivieren lässt den Review State unverändert; ein vergangener Termin ist sofort relevant.
- `Kartenreihenfolge` bietet `Fällige Karten zuerst`, `Neue und fällige mischen` und `Neue Karten zuerst`. Die Wahl wird im gestarteten Wurzelstapel gespeichert und sortiert nur noch unbeantwortete Initialkarten neu.
- `Pomodoro-Timer` klappt im Abschnitt `Sitzung` auf (neutrales Tomaten-Icon) und bietet `15`, `25` (Standard) und `45` Minuten im segmentierten Control sowie eigene positive Ganzzahlen. Erst `Start` startet; auf Desktop stehen Dauer, Schnellauswahl und Start in einer Zeile. Ein Start schließt den Dialog; beim nächsten Öffnen ist der Timer eingeklappt. Kartenverwaltung, Reset, Mischen und `Nur normale Karten` gehören nicht zu diesen Einstellungen.

#### Pomodoro-Timer

- Derselbe ausklappbare Start steht unter `Lerneinstellungen → Fokuswerkzeuge` unter dem Simulator. Jeder Start ersetzt einen laufenden Countdown.
- Es gibt accountbezogen genau einen browserlokalen Timer mit realer Endzeit. Er übersteht Navigation, Hintergrund, Reload und weitere Tabs, nutzt aber weder Cloud, Deckdaten noch simulierte Lernzeit.
- Während des Laufs erscheint der Fortschritt im Review, ab 1280 px unten in der Sidebar über der Utility-Gruppe und darunter im kompakten Kopf zwischen `CoRe` und Utility-Gruppe. Beim Ablauf verschwinden die Anzeigen und ein schließbarer Toast meldet `Timer abgelaufen.` Pause, Stopp, Töne und Pausenzyklen gibt es nicht.

#### Tagesgrenzen, Lerntag und Lernprofile

- `Neue Karten pro Tag` (0–500) und `Wiederholungen pro Tag` (0–2.000) werden nur in den Stapeleinstellungen als kompakte Ganzzahlfelder ohne Slider bearbeitet; `Maximales Intervall in Tagen` (30–36.500) ebenso. Eine Änderung des Neulimits hebt einen Tages-Override auf. Ohne bewusste Änderung bleibt die geplante Sitzungsgröße stabil.
- `Lerneinstellungen → Lerntag & Planung` enthält accountweit den Tagesbeginn (0–23 Uhr), das Vorziehfenster (0–720 Minuten, Standard 20, 0 deaktiviert) und den Wochenrhythmus aus sieben Easy-Days-Stufen (`Normal`, `Weniger`, `Minimal`; sieben gleiche Werte sind neutral). Bei Tagesbeginn 3 gehört 02:59:59 noch zum Vortag. Das Vorziehfenster gilt für Queue und laufende Sitzung aller Stapel. Diese Werte werden weder in Stapel kopiert noch von Lernprofilen verändert.
- Die unveränderlichen Vorlagen `Standard`, `Intensiv` und `Entspannt` setzen neue Karten, tägliche Wiederholungen und maximales Intervall auf `20 / 200 / 1.000`, `30 / 300 / 365` bzw. `10 / 100 / 2.000`, dazu die Position und Sortierung neuer Karten (Alter oder stabiler Lerntagszufall) und die Sortierung fälliger Karten (Überfälligkeit oder Abrufwahrscheinlichkeit).
- Eigene benannte Lernprofile sind kontoweite Vorlagen in Lern- und Stapeleinstellungen. `Auf diesen Stapel anwenden` kopiert Werte und Herkunftsversion in genau einen Stapel; `Als Standardprofil verwenden` übernimmt sie in den globalen Standard. Es gibt keine Live-Vererbung: Direkte Änderungen machen Stapel bzw. Standard zu `Eigene Einstellungen`; Umbenennen, Aktualisieren oder bestätigtes Löschen ändert keinen Stapel; eine neuere Version wird an älteren Kopien sichtbar und kann erneut angewandt werden.
- `Tagesrunde & Lernprofile` und `Scheduler & CoRe` definieren den Standard für neue Stapel: Tageslimits, Kartenreihenfolge, Schedulerprofil, Varianten-Lernstufe und aktive Varianten. `Auf alle neuen Stapel anwenden` speichert nur den Standard; `Auf alle Stapel anwenden` kopiert ihn zusätzlich in alle Stapel, wobei Name, Hierarchie, Darstellung, CoRe-Modus, Karten und Verlauf erhalten bleiben. Ein abweichendes Neulimit hebt den Tages-Override auf. Manuelle, importierte und Demo-Stapel erhalten den Standard; Reimporte behalten lokale Einstellungen.
- `Geschwisterkarten begraben` bietet wie Anki drei standardmäßig ausgeschaltete Optionen: neue, fällige und tagesübergreifende Lern-Geschwisterkarten. Sie gehören zu Lernprofilen, Stapeleinstellungen und globalem Standard; die drei Vorlagen lassen sie aus.
- Ist eine Option aktiv, wartet eine Karte dieser Art bis zum nächsten Lerntag, sobald heute eine Geschwisterkarte beantwortet wurde oder in der Queue vor ihr steht. Die Queue sieht Geschwister in Ankis Reihenfolge (heute beantwortet, Lernschritte des Tages, tagesübergreifende Lern- und fällige, neue Karten); Lernschritte des Tages werden nie begraben. Es entscheiden die Optionen der Stapel der vorher gesehenen Geschwister; eine Antwort außerhalb der gelernten Auswahl gilt mit den Optionen des gelernten Stapels.
- Begrabene Karten verbrauchen keine Limits und behalten Lernstand und Fälligkeit. Das Begraben ist kein gespeicherter Zustand, übersteht aber Reload und Neustart innerhalb des Lerntags und endet mit dem Tagesbeginn oder einem simulierten Folgetag. Eine Antwort entfernt offene Geschwister aus der Sitzung samt Zähler und Fortschritt. Stapelübersicht, `Heute` und Lernstart zählen Geschwister heute beantworteter Inhalte nicht; zwei noch unbeantwortete Geschwister zählen dort bis zur ersten Antwort beide.

#### Start, Ende und Wiederaufnahme

- Lernstart und direkt geladene Review-URL bereiten die Queue vor dem Vollbildmodus vor. Ist sie leer, bleibt die Ausgangsansicht sichtbar und ein Dialog meldet `Keine fälligen Karten`. Halten nur Tageslimits fällige oder neue Karten zurück, lautet der Titel `Tageslimit erreicht` und der Text nennt die Anzahl zurückgehaltener fälliger und neuer Karten. Sind ungenutzte neue Karten vorhanden, öffnet `Neue Karten pro Tag anpassen` den Stapel beim fokussierten Feld `Neue Karten pro Tag`, ohne den Wert zu ändern; sonst gibt es nur `Schließen`.
- Das Ende nennt die beantwortete Anzahl und führt zum URL-kodierten Ausgangspunkt zurück. Warten nur Learning-/Relearning-Wiederholungen außerhalb des Vorziehfensters, endet die Runde mit `Für jetzt geschafft`; die Karten bleiben `Offen`, ohne Countdown oder Hintergrundtimer.
- Ein Review-Reload erhält Reviewdeck und den allowlist-basierten Rückkontext `today`, `learn` oder `decks`; freie Rück-URLs werden nicht akzeptiert. Review aus der Kartenverwaltung kehrt zu Deck und Karte zurück, Review aus Lernen zum Lern-Deckkontext.
- Browser-Zurück und -Vorwärts rekonstruieren View, Deck, Karte und Reviewkontext ohne History-Schleifen. Unbekannte oder nicht verfügbare Deck- und Karten-IDs zeigen verständliche deutsche Folgeaktionen und öffnen nie still eine andere Karte.
- Nach Save, Verlassen, Reload und Sync wird der Lernfortschritt aus gespeicherten Review-Events und Review States rekonstruiert, ohne separaten Sitzungssnapshot.
- Offline- oder Konfliktzustände sind sichtbar und gelten nie als gespeichert, solange Änderungen ausstehen.

### 5.5 CoRe-Variante lernen und Ursprung prüfen

Bei eingeschaltetem CoRe-Modus wechseln sich reife Karten im Review mit ihren KI-Umformulierungen ab. Die Herkunft bleibt bis zur Antwort verborgen.

Akzeptanz:

- Varianten erscheinen nur, wenn der CoRe-Modus des Kartenstapels `An` ist, die Karte in der Wiederholungsphase (Review) ist, ihre letzte Bewertung nicht `Nochmal` war und ihre Lernstufe die Stapelschwelle `Varianten einsetzen ab Lernstufe` (81, 121 oder 181 XP) erreicht. Sonst wird die Karte selbst abgefragt.
- Die Lernstufe steigt mit `Schwer`, `Gut` und `Leicht` (`Gut` und `Leicht` auf einer Variante geben einen kleinen Bonus) und sinkt nach `Nochmal`.
- Eine reife Karte wechselt reihum zwischen sich selbst und ihren aktiven Varianten; die Originalkarte bleibt Teil des Wechsels. Abgefragt werden höchstens so viele Varianten, wie `Aktive Varianten pro Karte` (1, 2 oder 3) erlaubt, die ältesten zuerst.
- Nach einem Fehler fragt CoRe die Originalkarte ab, bis sie wieder richtig beantwortet ist.
- Jede Variante ist an genau eine Karte gebunden und teilt deren Lernstand und Termin. Bei fehlender oder fehlerhafter Variante bleibt die Karte sicher lernbar.
- Nach der Antwort einer Variante blendet `Grundkarte anzeigen` die zugrunde liegende Karte kompakt ein.
- Eine Variante lässt sich nach der Antwort mit `Nicht mehr zeigen` deaktivieren oder als `Inhaltlich falsch` oder `Unklar formuliert` melden; beides deaktiviert sie. Persönliche Reviewdaten gelangen nicht in Feedbackobjekte.

### 5.6 Lernlogik verstehen

Das Fragezeichen neben dem Theme-Schalter öffnet `/hilfe` in der App-Shell. Ein Einstieg und zwei Scrollgeschichten erklären wechselnde Abrufreize und die FSRS-Kurve, ohne Workspace oder Scheduler zu verändern.

Akzeptanz:

#### Einstieg

- Der Einstieg zeigt ein Kartenstapel-Muster: weiße Vorderkarte, dahinter eine hellblaue nach links oben und eine dunklere blaue nach rechts oben gedrehte Karte. Im Dark Mode wechseln alle Ebenen ins dunkle Gegenstück mit gleicher Ebenenfolge und Kontraststufung. Einstiegs- und Originalstapel haben dieselbe responsive Größe; alle Ebenen teilen Größe, Radien, Abstände und Schatten.
- Der Einstieg fragt nach Grundsätzen nachhaltigen Lernens. `Grundsätze`, `nutzt CoRe`, `Lernen` und `nachhaltig zu gestalten` sind pink markiert; gelbe Pfeile verbinden `Active Recall → Smarter Recall` und `Spaced Repetition → Content Repetition`.
- Die beiden Methodeneinträge sind eine Abschnittsnavigation mit dünnen oberen Linien; nur der fokussierte Eintrag wird kräftiger. Beide scrollen gleich lang und flüssig zu ihrer Überschrift, ohne Sprung im Bereich der Active-Recall-Schritte; bei reduzierter Bewegung sofort. Auf kleineren Ansichten scrollt das Dokument, ab Desktopbreite der Inhaltsbereich.

#### Active Recall

- Die Überschrift lautet `Active Recall`. Drei Textschritte steuern eine rahmenlose Kartenvisualisierung: lesbare Originalkarte mit orange hervorgehobenen Schlüsselstellen, dieselbe Form mit verpixeltem Fragetext und schließlich zwei versetzte Variantenkarten mit derselben Antwort und gelben Sternen.
- Beim Verpixeln bleiben Textfluss, Umbrüche, Trennlinie und Antwort an ihrer Position. Inaktive Textschritte bleiben lesbar. Ab Desktopbreite bleibt die Visualisierung im Abschnitt stehen und wechselt mit dem aktiven Schritt; darunter ist die Abfolge linear.

#### Spaced Repetition und FSRS

- Die Erklärung nennt `R` (Abrufwahrscheinlichkeit), `S` (Stabilität, die Zeit, in der `R` von 100 auf 90 Prozent fällt), `D` (Schwierigkeit), Zielerinnerung, Intervall, Original und Variante und zeigt die Kette Bewertung → Gedächtniszustand → Vergessensprognose → nächster Termin.
- FSRS-6 berücksichtigt alle Reviews einschließlich mehrerer Abrufe am selben Tag und verwendet 21 Modellparameter. CoRe nutzt die offiziellen Standardparameter; persönliche Optimierung ist noch nicht aktiviert. Höhere Zielerinnerung bedeutet mehr Reviews bei geringerem Vergessensrisiko.
- Variantenbereitschaft wird als Lernstufe aus Bewertungen erklärt: Varianten erscheinen erst ab der Stapelschwelle und nur in der Wiederholungsphase; nach einem Fehler folgt die Originalkarte. Eine feste Reviewnummer wird nicht versprochen.
- Eine als vereinfacht gekennzeichnete Lernkurve führt zu einer gemeinsamen Wiederholung und fächert in die vier Pfade `Nochmal`, `Schwer`, `Gut` und `Leicht` mit nach rechts zeigenden Intervallpfeilen auf. Am Ende des längsten Intervalls folgt eine Wiederholung mit naher Variante (Kreis mit `…`, Beschriftung `x. Wiederholung · Variante`, Stern über der oberen Markierung). Zwei diagonale Striche kennzeichnen die unterbrochene Y-Achse.
- `R` ist an Kurven und Zielerinnerung, `S` an den vier Intervallspannen und `D` an den beiden Wiederholungspunkten sichtbar; die Darstellung bleibt qualitativ ohne scheinbar exakte Werte.
- Die Geschichte führt in zehn Textschritten durch Grundidee, erste Wiederholung, Antwortpfade, Variantenwiederholung sowie `R`, `S` und `D`. Ab Desktopbreite bleibt das Diagramm stehen und hebt den erklärten Teil hervor; kleinere Ansichten sind linear, ohne verschachtelten Scrollcontainer.
- Kurvenabschnitte reagieren auf Mausberührung; Wiederholungspunkte und `R`-, `S`- und `D`-Texte sind per Maus, Touch und Tastatur auswählbar und führen zum zugehörigen Schritt.
- Farbe ist nie der einzige Bedeutungsträger. Begriffe, Reviewübersicht und Bewertungen verwenden eine ruhige Gliederung mit Trennlinien. Mobil scrollt nur der Grafikbereich horizontal, ohne Dokument-Overflow und ohne Sticky-Projektion.
- Die offizielle FSRS-Einführung ist als externer weiterführender Link gekennzeichnet.

### 5.7 Lernfortschritt über simulierte Tage prüfen

`/simulator` ist direkt und unter `Lerneinstellungen → Fokuswerkzeuge` erreichbar. Er verschiebt die Lernzeit vorhandener Accountkarten minuten- oder tageweise um bis zu 3.650 Tage ab „Heute“. Zeitwechsel verändern keine Karte; Reviews sind echte Bewertungen mit simuliertem Zeitpunkt.

Akzeptanz:

- „Heute“, `+10`, `+15` und `+30 Minuten`, `+1`, `+2` und `+4 Stunden`, „Morgen“, `+3`, `+7`, `+14` und `+30 Tage`, einzelne Tagesschritte und ein begrenztes Datumsfeld sind per Tastatur erreichbar. Die simulierte lokale Uhrzeit bleibt sichtbar; ungültige Werte werden auf den Bereich begrenzt.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Review verwenden denselben simulierten Zeitpunkt für Fälligkeit, Queue, Heatmaps, Lernstufe, Intervallvorschau und Bewertung.
- Ein aktiver Zukunftszeitpunkt bleibt in App-Shell und Lernmodus sichtbar; während einer Sitzung wird die Zeit nicht umgeschaltet.
- Der Offset ist lokal und transient: Reload und Logout stellen „Heute“ wieder her. Sync-, Auth-, Medien-, Autosave- und Bearbeitungsmetadaten nutzen die echte Systemzeit.
- „Heute“ setzt nur die Uhr zurück; gespeicherte Zukunftsreviews und daraus berechnete Termine bleiben.

## 6. Funktionale Anforderungen

### 6.1 Account und Einstellungen

- E-Mail und Passwort sind die freigegebene Kernanmeldung.
- Das Profil enthält Anzeigename und Login-E-Mail; Hochschule, Fachgebiet und Spracheinstellung gibt es nicht, die Oberfläche ist deutsch. Ohne Community-Funktion gibt es keinen Privatsphäre-Bereich.
- Das Zahnrad öffnet `Allgemeine Einstellungen` mit `Konto`, `Daten & Synchronisierung` und `Über uns`. Die Seite `Lerneinstellungen` gliedert sich in `Lerntag & Planung`, `Tagesrunde & Lernprofile`, `Scheduler & CoRe` und `Fokuswerkzeuge`; Stapeleinstellungen in `Stapel`, `Tagesrunde & Lernprofile` und `Scheduler & CoRe`.
- Alle Seiten haben Querlinks und dieselbe iconunterstützte Inhaltsnavigation: ab 1.280 px eine vertikale Sticky-Rail, darunter ein Sticky-Disclosure mit dem aktuellen Abschnitt. Scrollspy markiert genau einen Abschnitt; Auswahl nutzt Hashlinks und Browser-Zurück. Auf Karten- und Simulatorrouten bleibt `Lernen` aktiv; nur die allgemeinen Einstellungen markieren das Zahnrad.
- `Über uns` verlinkt auf `/hilfe`, zeigt `Impressum` und `Datenschutzerklärung` als `In Vorbereitung` und die Paketversion mit `v`. Keine andere Oberfläche zeigt Version, Umgebung oder Commit.
- Weicht ein Einstellungsfeld vom gespeicherten Stand ab, erscheint seitenweit genau eine nichtmodale Leiste `Änderungen speichern?` unten im Viewport mit dezentem CoRe-Pink-Akzent, nebeneinander auf breiten, untereinander auf mobilen Ansichten. Ein Kreuz verwirft den Seitenentwurf; während des Speicherns sind beide Aktionen gesperrt.
- Reichweiten: allgemeine Einstellungen eine Speicheraktion, Lerneinstellungen `Auf alle Stapel anwenden` und `Auf alle neuen Stapel anwenden`, Stapeleinstellungen Stapel oder Stapelbaum. Erfolg schließt die Leiste und meldet die Reichweite einmal; Fehler lassen sie offen und erscheinen beim betroffenen Bereich.
- Bei ungespeicherten Einstellungen werden App-Navigation, Querlinks, Zurück, Stapelwechsel, Abmelden und Browser-Zurück/-Vorwärts abgebrochen. Lernprofil-Aktionen, `Auf diesen Stapel anwenden`, manueller Sync und die Lerneinstellungen einer Sitzung wirken unmittelbar.
- Tagesbeginn, Vorziehfenster, Easy Days, Lernprofile und der globale Stapelstandard sind accountweite Scheduler-Präferenzen im Profil-Sync.
- Sicherheitskritische Aktionen sind von Profil- und Lernoptionen getrennt.

### 6.2 Deck-Hierarchie und Stapeleinstellungen

- Stapel bilden Eltern- und Unterstapel; APKG-Hierarchien bleiben ohne Tiefenlimit mit unmittelbaren Eltern und vollständigen Pfaden erhalten.
- Dashboard und Lernen projizieren denselben einklappbaren Stapelbaum als flache Folge kompakter Zeilen; Eltern aggregieren alle Unterstapel. Die Kartenverwaltung projiziert dieselben Zeilen in der gruppierten Tabelle.
- Lernen und Kartenverwaltung sind getrennte, lazy geladene Bereiche derselben Hauptseite mit gemeinsamem Deckkontext ohne parallele lokale Deckidentität. Lernen-, Kartenverwaltungs- und Erstelllinks erhalten Deck und Karte über Reload und Direktlink; gleichnamige Unterstapel unterscheidet der vollständige Pfad.
- Direktes Drag-and-drop ist eine Desktop-Interaktion in Dashboard und Lernen für Maus und Trackpad und markiert keinen Zeilentext; sonst gilt der bestätigte Verschiebeablauf.
- Stapelbezogene Auswahlfelder zeigen geschlossen Icon und vollständigen Pfad. Geöffnet sind sie eine höchstens 320 px hohe, je Ebene alphabetisch sortierte Baumliste mit Icon, einzeiligem Namen und derselben Einrückung wie die Stapellisten. Ab fünf auswählbaren Stapeln erscheint eine Pfadsuche; Sonderziele zählen nicht mit. Auswahl zeigt eine neutrale Fläche mit Haken rechts.
- Stapelname, Icon, Farbe, Tagespensum, `Kartenreihenfolge`, `Neue Karten sortieren`, `Fällige Karten sortieren`, die drei Begraben-Optionen, Schedulerwerte (Lernschritte, Wiederlernschritt, gewünschte Erinnerungsrate, maximales Intervall), CoRe-Modus, `Varianten einsetzen ab Lernstufe` (81, 121, 181 XP) und `Aktive Varianten pro Karte` (1, 2, 3) bilden einen gemeinsamen Entwurf und werden atomar über die Speicherleiste übernommen. Die Reviewpriorität heißt `Wahrscheinlich vergessen zuerst`; der Text zum Reviewlimit erklärt, dass es fällige, tagesübergreifende Lern- und neue Karten umfasst und Wiederholungen Vorrang haben.
- CoRe-Modus und Variantenwerte gehören nicht zu Lernprofilen und bleiben bei einem Profilwechsel unverändert. Normales und variantenfokussiertes Lernen wird nicht angeboten.
- Die Speicherleiste bezeichnet ihre Aktion ausdrücklich. Mit Unterstapeln ist `Stapel und Unterstapel speichern` die Hauptaktion vor `Nur diesen Stapel speichern`; sie überträgt rekursiv nur die geänderten Darstellungs-, Lern-, Scheduler- und CoRe-Werte. Ohne Unterstapel gibt es nur `Stapeleinstellungen speichern`. Beide speichern lokal persistent in einer Mutation, bleiben auf der Seite und bestätigen den Geltungsbereich. Das Kreuz verwirft den Entwurf.
- Stapeloptionen merken sich ihren URL-reproduzierbaren Ursprung (Dashboard, Lernen, Stapel, optional Karte); Direktlinks ohne Ursprung fallen auf Lernen zurück. Ohne gewählten Stapel zeigt die Route eine suchbare Stapelauswahl. Titel, Zurück und Quernavigation bleiben bei 390 px sichtbar.
- Neue Stapel erhalten materialisierte Standardwerte, importierte behalten ihre Werte.
- Löschen eines Baums ist destruktiv, bestätigt und darf gelöschte Inhalte nicht durch späteren Sync reaktivieren.

### 6.3 Import

- Anki-Pakete werden über registrierte Übersetzer in CoRe-Inhalte mit Feldrollen und Interaktion übersetzt und im CoRe-Design gerendert; Anki-Vorlagen und -CSS werden nicht angezeigt. Unbekannte Notiztypen werden generisch als Feldliste übernommen. Template-JavaScript, Add-on-/Custom-Filter und andere nicht portable Funktionen werden nicht ausgeführt; Quellwerte bleiben unsichtbar erhalten und Abweichungen erscheinen als Diagnose.
- Importfehler bleiben sichtbar und enthalten eine sinnvolle nächste Aktion.
- Die Importsteuerung unterscheidet `idle`, `analyzing`, `preview`, `committing`, `syncing_cloud`, `syncing_media`, `succeeded`, `partial`, `failed_retryable`, `failed_terminal` und `cancelled`.
- Die Phasen `analyzing`, `committing`, `syncing_cloud` und `syncing_media` zeigen in der Dateizeile einen eigenen monotonen Fortschritt; Zwischenwerte bleiben unter 100 Prozent, 100 Prozent heißt abgeschlossen.
- Warnungen werden zusammengefasst und vollständig aufklappbar angeboten; Notetype-IDs, SHA-1-Listen und Importidentitäten erscheinen nicht.
- Pakete bis 2 GiB werden lokal in einem Worker verarbeitet; Medien werden erst beim Übernehmen einzeln gelesen und gegen ihre SHA-1 geprüft. Größere Dateien enden sofort mit verständlicher Meldung und `Andere Datei auswählen`; einen Serverjob oder Upload-Fallback gibt es nicht.
- Reimport erkennt Inhalte ausschließlich über stabile Anki-Identitäten (GUID, Karten-ID), auch wenn sie nur in der Cloud vorliegen.
- APKG-`revlog` wird als append-only Analysehistorie übernommen, soweit eine Anki-Karte eindeutig einer CoRe-Karte zugeordnet werden kann, und beim Reimport dedupliziert. Der initiale Review State folgt der Reihenfolge gültiger FSRS-Memory-State, chronologisches Revlog-Replay, klassischer Kartenstatus, neue Karte; nach dem ersten CoRe-Review gilt ausschließlich FSRS-6.
- Medienreferenzen werden sicher aufgelöst; fehlende Medien nennt der Bericht.

### 6.4 Manuelle Erstellung und Quellen

- Karten entstehen auch ohne Dokumentquelle; mehrere Karten nacheinander sind der Standardfluss. Gespeicherte Karten bleiben bei einem später verworfenen Entwurf erhalten.
- Bilder werden an der Cursorposition in Rich-Text- und Zusatzfelder eingefügt; Bild-Bytes liegen im accountgebundenen Medienspeicher, die Karte speichert nur stabile Referenzen.
- Pinning steuert nur den Reset nach erfolgreichem Speichern; ein Cloud-Autosave für Entwürfe existiert nicht.
- Aus einem lesbaren Dokument kann Text in Vorder- oder Rückseite übernommen werden; das Dokument wird nicht als Quelle gespeichert.
- Rich Text wird vor Speicherung und Darstellung sanitisiert.
- Bildverdeckungen entstehen mit dem Masken-Editor oder kommen aus Anki-Importen (Ankis Bildverdeckung, Image Occlusion Enhanced); jede Maskengruppe ist eine eigenständige Karte.

### 6.5 Review und Scheduling

- Review verwendet vier Bewertungen und einen gekapselten FSRS-6-Scheduler mit offiziellen Standardparametern.
- `Gut` geht genau einen Lernschritt weiter und wechselt erst am letzten Schritt in den Reviewzustand. `Leicht` beendet die Lernphase sofort mit dem unveränderten `ts-fsrs`-Intervall; `Nochmal` und `Schwer` folgen der Standard-Lernschrittstrategie von `ts-fsrs`.
- Eine Sitzung arbeitet zuerst ihre eindeutigen Karten ab und zeigt danach berechtigte Learning-/Relearning-Wiederholungen. Das accountweite Vorziehfenster gilt einheitlich für alle Stapel einer Sitzung. Ein Termin darf nur am selben (auch simulierten) Lerntag und strikt weniger als das Fenster vorgezogen werden; Reviewkarten nie. Ein früherer, noch nicht berechtigter Eintrag blockiert keine spätere berechtigte Wiederholung.
- Reviewkarten werden tageweise freigegeben; Learning und Relearning behalten minutengenaue Termine, ihr Vorziehen überschreitet den Lerntag nicht. Eine manuell auf einen künftigen Lerntag gesetzte Karte bleibt bis dahin in jeder Phase zurückgestellt.
- Intraday-Schritte umgehen Tageslimits; tagesübergreifende Lernschritte verbrauchen Reviewbudget. In einer Baumrunde brauchen Kartenstapel und alle aktiven Vorfahren Budget; direkte Unterstapelstarts ignorieren äußere Vorfahren. Reviews belegen das gemeinsame Budget vor neuen Karten. Sind Karten nur durch Limits verborgen, nennt Start oder Abschluss `Tageslimit erreicht` und weist die Anzahl fälliger und neuer Karten aus.
- Der gestartete Stapel bestimmt für die Runde die Sortierung neuer Karten (Alter oder stabiler Lerntagszufall) und fälliger Karten (Überfälligkeit oder Abrufwahrscheinlichkeit).
- Easy Days verändert nur neu berechnete Review-Intervalle von 3 bis 90 Tagen: Innerhalb des FSRS-Fuzz-Fensters wählt der Scheduler anhand der accountweiten 90-Tage-Last und der Tagesstufe (`Normal` 1, `Weniger` 0,5, `Minimal` 0,0001); bei Gleichstand gewinnt die geringste Abweichung, dann der frühere Termin. Nur `dueAt` und das Intervall ändern sich; Vorschau und Commit verwenden dieselbe Lastmomentaufnahme und DST-sichere Kalenderaddition.
- Die Tagesprojektion berücksichtigt das Vorziehfenster auch nach Verlassen und erneutem Öffnen der Sitzung; über die Tagesgrenze wird nie vorgezogen.
- Nutzer sehen verständliche Intervalle, keine internen Schedulerzustände.
- KI-Umformulierungen teilen ausschließlich Review State und Termin ihrer Karte. Der Scheduler löst keine KI-Erzeugung im Antwortrequest aus.
- Die Antwortzeit wird von der Darstellung bis zur Bewertung monoton gemessen, bei 60 Sekunden gedeckelt und im Review Event gespeichert; simulierte Zeit verändert sie nicht.
- Die Simulationsuhr verändert durch bloßes Umstellen keinen Workspace-, Cloud- oder Kartenstatus; Bewertungen im Zukunftsmodus nutzen absichtlich den simulierten Zeitpunkt und den normalen Speicher- und Syncpfad.

### 6.6 Vertrauen, Änderungsprotokoll und Undo

- Karteninhalte sind direkt prüfbar; einen wiederherstellbaren Versionsverlauf gibt es nicht.
- Manuelle Neuplanung ändert nur `dueAt` und die technische Aktualisierungszeit; Phase, Lernschritt, Intervalle, Wiederholungen, Difficulty, Stability, letzter Reviewzeitpunkt, FSRS- und Lernstufenwerte sowie Inhaltsrevisionen bleiben. Genau ein `ReviewEvent` mit `rating: "manual"` hält alten und neuen Termin fest und zählt nicht als Lernen, Fortschritt oder FSRS-Bewertung.
- Ein Karten-Undo nimmt den Soft-Delete-Tombstone revisionsgeprüft zurück, ohne neue Karte oder zweiten Review State.
- Importfehler führen nicht zum Verlust des letzten verlässlichen Inhalts.

### 6.7 Statistik

- Beim ersten Eintritt zeigt die Statistik ihren Ladezustand. Zeitraum- und Stapelwechsel lassen Filter, Diagramme und Kennzahlen sichtbar: Die Auswahl reagiert sofort, das letzte Ergebnis bleibt abgeblendet bis zum Ersatz. Ein unbestimmter 3-px-Prozessindikator unter den Filtern hat immer reservierten Platz (inklusive 8 px Abstand), keinen Ladetext und keinen Höhensprung; Screenreader erhalten Namen und Live-Status. Fehler erhalten Filter und letzte Daten mit Wiederholungsaktion. Fokus und Scrollposition bleiben, verspätete Antworten überschreiben keine neuere Auswahl. Lazy Loading bleibt ohne zusätzliche Abfragen, Vorladungen oder Zeitraum-Caches.
- Eine globale Filterleiste steuert alles außer der Heatmap: `30 Tage`, `90 Tage`, `1 Jahr`, `Gesamt` sowie gesamte Sammlung, ein oder mehrere Stapel. Standard ist `Gesamte Sammlung · 1 Jahr`; Oberstapel schließen Unterstapel dedupliziert ein. In der Stapelauswahl stehen Suche, `Gesamte Sammlung` und Baum untereinander mit einer Trennlinie nur vor dem Baum; eingeschlossene Unterstapel bleiben markiert und deaktiviert, ohne Gruppentöne.
- Die Inhaltsnavigation gliedert in `Überblick`, `Lernaktivität`, `Planung & Kartenbestand`, `FSRS-Gedächtnismodell`, `Antwortverhalten` und gegebenenfalls `Stapelvergleich`: ab 1280 px als scrollbare Sticky-Rail, darunter als Sticky-Disclosure. Der Überblick zeigt in einer umrandeten Fläche sieben Kennzahlen als rand- und schattenlose graue Flächen ohne Icons.
- Historische Bereiche: Übersicht, gestapelte Wiederholungen, gemessene Lernzeit mit Abdeckung, hinzugefügte Karten, Lern-Heatmap, Antwortzeitpunkt, Antwortknöpfe, wahre Erinnerungsquote und Stapelvergleich.
- Die Heatmap folgt nur dem Stapel-Scope und wählt ihren Zeitraum lokal (`Woche`, `Monat`, `Jahr`; Standard die letzten sieben Lerntage) über das gemeinsame Dropdown. Die Wochenansicht zeigt Kürzel und Datum zweizeilig (`Fr` über `25.09.`); Monat und Jahr zeigen ganze Kalenderzeiträume, Pfeile wechseln einen ganzen Zeitraum, das Jahresraster scrollt schmal horizontal. Farbauswahl, Zeitraum und Pfeile bilden eine feste Gruppe; ab 37 rem steht sie neben dem Streak, darunter dauerhaft unter dem Titel.
- Der Titel zeigt den Streak der gewählten Stapel; ein Lerntag zählt ab einem validen Review, der sichtbare Zeitraum begrenzt den Streak nicht. Von morgen bis Tag +365 zeigt eine getrennte Grauskala die nächste Fälligkeit jeder aktiven Karte genau einmal (ohne Varianten, Entwürfe, gelöschte, ausgesetzte und begrabene Karten), ohne Folgetermine zu simulieren. Spätere Resttage sind abgeblendet und beschriftet.
- Die Legende `Weniger` bis `Mehr` erklärt nur vergangene Aktivität. Ihre browserlokal für Dashboard und Statistik gemeinsame Grundfarbe ist über ein 2×2-Raster auf `Gelernt`, `Neu`, `Offen` und `Fällig` beschränkt; Standard ist CoRe-Lila (`Neu`), ungültige Werte werden darauf normalisiert. Prognose-Grauskala und blauer Heute-Rahmen bleiben unberührt.
- Die wahre Erinnerungsquote verwendet nur die erste geeignete Wiederholung einer Karte je Lerntag mit vorherigem Intervall von mindestens einem Tag. Ändert sich der Tagesbeginn, werden Reviews neu gruppiert.
- Der Stapelvergleich zeigt auf schmalen Flächen je Stapel sechs beschriftete Kennzahlflächen, breit eine Tabelle. Der lokale Stapelname öffnet die Stapelinhalte ohne zusätzlichen Pfad.
- Planung zeigt Rückstand, künftige Fälligkeiten, kumulierten Verlauf und geschätztes Tagespensum; der Zeitraum ist ihr Zukunftshorizont.
- Status, FSRS-Schwierigkeit, Stabilität und aktuelle Abrufwahrscheinlichkeit sind Momentaufnahmen mit `Stand heute`; bei Intervallen begrenzt der Zeitraum nur die Anzeige.
- Historische Kategorien kommen aus dem Zustand vor der Antwort: Lernen, Wiederlernen, Jung, Reif (ab 21 Tagen). Klassische Anki-Leichtigkeit und ein separater Schwierigkeitsstatus werden nicht angezeigt; der FSRS-Parameter Schwierigkeit bleibt.
- Diagramme nutzen begrenzte adaptive Zeitgruppen, zugängliche Textlegenden und Details für Maus, Touch und Tastatur. Fehlende Historie, Zeitmessung oder Stichprobe wird erklärt; die Oberfläche erfindet keine Nullwerte.

### 6.8 Synchronisierung

- Ein Sync-Zyklus schreibt zuerst lokale IndexedDB-Transaktionen, überträgt dann nur vorgemerkte Outbox-Mutationen, lädt alle Cloud-Deltas seit den gespeicherten `sync_change_id`-Cursorn und aktualisiert zuletzt Konflikt- und Statusdaten. Ein Konflikt blockiert nur seine Entität.
- Manueller und automatischer Sync nutzen denselben Zyklus. Automatik läuft entprellt nach lokalen Änderungen, bei Netzrückkehr, Fokus und im sichtbaren Tab alle 1, 5, 15 oder 30 Minuten (Standard 5); `Aus` heißt manuell. Sie endet bei Logout oder Accountwechsel.
- Der Sync-Button in Desktop-Navigation und mobilem Kopf zeigt synchronisiert, ausstehend, laufend, offline oder die Konfliktanzahl. `Daten & Synchronisierung` zeigt Intervall, letzten Erfolg, ausstehende Änderungen und den manuellen Sync.
- `revision` ist die fachliche Entitätsversion; der Lernstand besitzt mit `studyRevision` eine eigene Grenze, sodass Review und Inhaltskorrektur auf zwei Geräten keinen Konflikt erzeugen. Geräte-, Zeit-, Zähler-, Importzusammenfassungs-, Eigentümer- und Schedulerprojektionen erzeugen allein keinen Inhaltskonflikt. Kartenwrites erhalten den Cloud-Lernstand, Varianteninhaltswrites ihre Performance.
- Reviewereignisse sind unveränderlich und idempotent; beide Geräteereignisse bleiben, nur das jüngste projiziert den Lernstand. Neuplanungen laufen als manuelle Reviewereignisse über dieselbe offline persistente `review-atomic`-Outbox und `record_review_atomic`; die jeweils spätere Aktion bestimmt den Termin.
- Für Konflikte zeigt CoRe die Folgen beider Richtungen als hinzugefügte, aktualisierte und entfernte Stapel, Karten und Varianten. `Dieser Browser` oder `Cloud im Account` betrifft nur diese Konflikte; die Vorschau wird vor Ausführung gegen aktuelle Remote-Revisionen geprüft. Der Einzelauflöser bleibt eingeklappt verfügbar.
- Konfliktkarten bleiben bis zur Entscheidung außerhalb der Lernqueue und tragen in der Verwaltung `Synchronisierung klären`. Ausstehende Änderungen überleben Reload und Browserende in IndexedDB; ein letzter Website-Sync ist nicht garantiert.
- Online startet eine gespeicherte Sitzung Workspace und Bootstrap, während der Server sie parallel bestätigt; lehnt er ab, erscheint die Anmeldung mit `Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.` Der lokale Workspace erscheint vor Bootstrap, Deltas, Konflikten und Medien. Eingerichtete Geräte starten offline mit der persistierten Supabase-Sitzung; einen lokalen Login gibt es nicht.
- Ein neuer Browser wartet nur auf die erste gültige, höchstens 200 KiB große Bootstrap-Seite; scheitert sie, erscheint ein Wiederholen-Zustand statt eines vermeintlich leeren Accounts. Weitere Hüllen und der Katalog laden fortsetzbar im Hintergrund.
- Die Kartenverwaltung zeigt vorhandene 50er-Previewseiten sofort und ergänzt online serverseitige Suche, Sortierung und Keyset-Pagination; erst Öffnen lädt den Kartenkörper, bei Fehlern bleiben Preview und Wiederholen sichtbar. Offline durchsucht CoRe transparent nur den vorhandenen Katalog.
- Lernen bestimmt die Reihenfolge aus dem Katalog, puffert bis zu 50 Körper und lädt bei 25 verbleibenden nach; bei Datensparmodus oder langsamer Verbindung beträgt der Puffer fünf. Die Runde startet mit der ersten verfügbaren Karte; nach Netzausfall läuft der Puffer weiter und pausiert sichtbar, ohne fällige Karten zu überspringen. App-Start, Kartenliste und Lernstart materialisieren keine vollständigen Stapel.
- `Öffnen` erzeugt einen bereinigbaren Cache. `Offline verfügbar machen` lädt Karten, Inhalte, Varianten und Medien fortsetzbar in 50er-Paketen und gilt erst nach Anzahl-, Revisions- und Hashprüfung als verfügbar.
- Ab 80 Prozent Browserquote entfernt CoRe ungepinnte, bestätigte Kartenkörper und Medien nach LRU bis höchstens 70 Prozent; Hüllen, Summaries, Katalog, Outbox, Konflikte, Downloads und aktive Lernkarten bleiben. Ein unvollständiger Katalog bleibt als lokal eingeschränkter Zustand sichtbar.
- Statistiken kommen aus serverseitigen Aggregaten mit lokalem Cache; unbestätigte Bewertungen ergänzen sie optimistisch, Neuplanungen nicht. Vor einem Reimport lädt CoRe die vorhandenen Inhalte und Karten zu den Anki-GUIDs.
- Nach lokaler Bereitschaft dürfen Stapelübersicht und Kartenverwaltung vorsichtig vorbereitet werden; Save-Data, 2G, unsichtbarer Tab oder Interaktion stoppen das. Andere Ziele lädt CoRe nur bei Hover, Fokus oder Touchstart vor, APKG, PDF, Statistik, Simulator und große Medien nie pauschal.
- Die Einstellungen zeigen persistenten Speicher sowie belegten und verfügbaren Platz. Die PWA cached die App-Shell; Browsermedien bleiben selektiv, Eviction ist ohne persistente Freigabe möglich.

## 7. Visueller Produktvertrag

Der [`src/ui`-Katalog](../src/ui/README.md) beschreibt die Wiederverwendung. Bestehende Module werden bei passender Fachsemantik genutzt; lokale Controls behalten dieselben Theme-, Typografie-, Fokus- und Disabled-Rollen.

### Kartenflächen

Alle Inhalte erscheinen im CoRe-Design (ADR-033), in Review, Vorschau, Editor und Importvorschau gleich.

- Frage und Antwort ohne Feldbeschriftung; beim Aufdecken bleibt die Frage stehen, darunter eine Trennlinie und die Antwort. Ein fester Anweisungstext steht klein über der Frage.
- Hinweise sind zugeklappte, per Tastatur bedienbare Abschnitte unter der Frage. `Zusatz` und `Quelle` (als Link-Chips) erscheinen erst nach dem Aufdecken, `Notiz` nur im Editor.
- Lückentext zeigt die aktive Lücke als `[…]` mit Akzent; Bildverdeckung die aktive Maske in Akzentfarbe, nach dem Aufdecken nur ihren Umriss.
- Eintippen vergleicht zeichengenau wie Anki; Single Choice deckt direkt auf, Multiple Choice und Kprim über `Antwort prüfen`.
- Formeln rendern mit KaTeX, bei Fehlern bleibt der Quelltext sichtbar. Farbiger Text wird nur so weit aufgehellt oder abgedunkelt, dass er 4,5 : 1 Kontrast erreicht.

### Farben und Theme

- Die produktive UI verwendet die CoRe-Palette Slate `#6F7E9E`, Mist `#A9B5C7`, Cloud `#DDE3EC`, Coral `#E28B68`, Lilac `#D6A3D2`, Marigold `#E4BF63` und die Dark-Werte Midnight `#181D25`, Graphite `#262E3A`, Highlight `#8FA0BF`, Coral Glow `#F0A07E`, Lilac Glow `#E4B5E1`, Golden Glow `#F0CC77` ausschließlich über semantische Theme-Rollen.
- Light und Dark nutzen denselben Tokensatz. Ein Iconbutton wechselt über `data-core-theme`; Sonne bzw. Mond zeigen den aktuellen Modus, der zugängliche Name die Aktion. Theme und Timer bleiben lokal im Browser; keine automatische Aktivierung über die Systempräferenz.
- Dekorative Rahmen sind heller als interaktive Feld-, Auswahl- und Fokusgrenzen. Bedeutung ist immer zusätzlich durch Text, Icon oder Zahl erkennbar.
- Bestehendes Karten-HTML und persistierte Farben werden nicht umgeschrieben. Neue oder ungültige Stapeldarstellungen verwenden Slate. Rich-Text-Schnellfarben stammen aus der CoRe-Palette.

### App-Shell und Navigation

- App-Shell, Login, Sitzungsprüfung, lokale Datenübernahme und Fehlerzustand füllen den dynamischen Viewport ohne äußeren Rahmen, Radius oder Schatten; der horizontale Innenabstand beträgt 10, 16 bzw. 24 px.
- Unter 1280 px ersetzt eine schwebende, Safe-Area-fähige Bottom Bar mit `Heute`, `Lernen`, `Erstellen` und `Statistik` die Sidebar, stabil am unteren Rand. Ein kompakter Kopf zeigt `CoRe` (zu `Heute`), bei aktivem Timer dessen Balken und rechts die Utility-Gruppe aus Sync, Theme, Hilfe und Einstellungen. Eine aktive Simulation hat eine eigene Statuszeile.
- Ab 1280 px gibt es eine schwebende, 15 rem breite Sidebar ohne Markenunterzeile und Kopfleiste; ihre Utility-Gruppe steht unten in einer Reihe: Sync, Hilfe, Einstellungen, Theme. Das Fragezeichen hat einen eigenen aktiven Zustand; nur Einstellungen und Simulator teilen den Einstellungszustand. Eine Profilvorschau erscheint nicht.
- Die Hauptnavigation nutzt denselben gleitenden Indikator wie segmentierte Controls; Icon und Name stehen zweizeilig. Reduced Motion deaktiviert Gleitbewegung und Statistik-Laufanimation.

### Bedienelemente

- Primäre, sekundäre, tertiäre und destruktive Actions sowie Info-, Erfolgs-, Warn- und Fehlerzustände haben einheitliche Hover-, Active-, Focus- und Disabled-Zustände.
- Einzeilige Buttons, Icon-Aktionen, Eingaben und Auswahlfelder nutzen `--core-control-height`: 40 px bei feinem Zeiger ab 768 px, sonst 44 × 44 px. Fachliche Großflächen wie Auswahlantworten und Bewertungen dürfen höher sein.
- Auswahlfelder nutzen denselben Trigger und ein erhöhtes, abgerundetes Overlay. Erneutes Antippen, Außenberührung und Escape schließen ohne Wertänderung; gewählte und fokussierte Optionen sind zusätzlich zur Farbe markiert und per Tastatur bedienbar.
- Modale Bestätigungsdialoge behandeln Escape und Klick auf den Hintergrund wie Abbrechen; Klicks im Dialog oder einem Auswahl-Overlay schließen nicht. Abbrechen verändert keine Fachdaten und stellt den Fokus wieder her.
- Einstellungsfelder haben eindeutige Titel ohne wiederholende Untertitel; Hinweise erklären nur Folgen, Abwägungen, Warnungen oder nicht offensichtliches Verhalten.
- Fachliche Inhalte, Warnungen und Folgeaktionen bleiben ohne generische Disclosure-Flächen sichtbar; ausklappbar sind nur Navigation, Hierarchien und kompakte Werkzeuge.
- Die Rich-Text-Toolbar zeigt Fett, Kursiv sowie Bild- und Lückenaktionen direkt; `Weitere Textwerkzeuge` klappt Zusatzaktionen an Ort und Stelle aus und erhält die Textauswahl.

### Rückmeldungen

- Kurze abgeschlossene Erfolgsmeldungen erscheinen als schließbares Overlay oben rechts mit Erfolgsicon. Nach zehn Sekunden blenden sie mit kurzer Deckkraft-/Transformationsanimation aus (ohne Übergang bei reduzierter Bewegung) und halten schmal den Seitenabstand ein.
- Fehler, laufende Vorgänge und Ergebnisse mit Details oder Folgeaktionen bleiben im fachlichen Kontext sichtbar.

### Stapeldarstellung

- Stapelgruppen nutzen die gerahmten Flächen `--core-group-depth-0` bis `--core-group-depth-5`: Hauptstapel Depth 0 ohne Schatten, Unterebenen Depth 1 bis 5. Die Töne interpolieren linear in sRGB, größere Tiefe wird auf 5 begrenzt; Light wird mit der Tiefe dunkler, Dark heller. Hover füllt neutral; Auswahl, Fokus und Drop-Ziele reagieren am Außenrand ohne eingerückte Ebene.
- Stapelkarten in Dashboard und Lernen zeigen nur die disjunkten, budgetbegrenzten Kennzahlen `Neu`, `Offen` (Learning und Relearning heute, auch noch nicht vorziehbar) und `Fällig` in den Rollen von `Nochmal`, `Schwer` und `Gut`; eine Gesamtzahl erscheint nicht. Unter 44 rem Zeilenbreite entfallen die sichtbaren Labels bei erhaltenen zugänglichen Namen.
- Der Donut verwendet für `Neu`, `Offen`, `Fällig` und `Gelernt` die Rollen von `Nochmal`, `Schwer`, `Gut` und `Leicht`. Seine Segmente beginnen bei zwölf Uhr, haben dünne Rahmenlinien und ein transparentes Zentrum; ein leerer Bestand zeigt einen neutralen Ring. Die zugängliche Beschriftung nennt Gesamtzahl und alle vier Werte.
- Stapel-Icons sind rund mit Symbol und Rand in der gewählten Farbe und dezenter Tönung. Die Stapeleinstellungen zeigen im Titel Icon und gespeicherten Namen; der Bereich `Stapel` enthält Namensfeld, ein 5×5-Raster aus 25 Lucide-Icons und den Farbkreis, alle im gemeinsamen Seitenentwurf.

### Typografie

- Die gesamte Oberfläche einschließlich Kartenfläche nutzt die lokal eingebettete variable Schrift Manrope im Stil „Soft Minimal“: Überschriften `30/36`, `22/28` und `18/24` mit leicht verringerter Laufweite, Body Large `16/24`, Body und Controls `14/20`, Caption und Statuslabel `12/16`.
- Kennzahl-, Abschnitts- und Tabellenbeschriftungen stehen in normaler Schreibung; nur Eyebrows über Titeln sind klein in Versalien. Semantische HTML-Ebene und visuelle Stufe dürfen abweichen.

## 8. Nichtfunktionale Anforderungen

### Sicherheit und Datenschutz

- Accountdaten und Inhalte sind durch RLS und Ownership geschützt.
- Service-Secrets bleiben außerhalb des Browsers; Logs enthalten keine Secrets.
- Unvalidierte externe Payloads werden nicht direkt persistiert.
- Inhalte verlassen CoRe nur über die KI-Route (bereinigter Text von Frage und Antwort) und die ausdrücklich angeklickte AMBOSS-Suche (markierter Text).

### Accessibility

- Kernflows sind per Tastatur bedienbar.
- Wichtige Zustände werden nicht nur durch Farbe vermittelt.
- Dialoge und Overlays besitzen nachvollziehbare Fokusreihenfolge und -wiederherstellung.
- Bei 200 % Zoom bleibt der Kernflow ohne horizontales Hauptscrolling bedienbar.
- Bewegungen beachten `prefers-reduced-motion`.

### Viewports und Sprache

- Primärer Zielviewport ist 1440 × 900 px, Desktop-Mindestziel 1280 × 720 px.
- Unter 1280 px gilt der kompakte App-Modus mit Kopf und Bottom Bar, darüber die Sidebar. Fachliche Komponenten wählen ihre Dichte anhand der verfügbaren Containerbreite und behalten ihre dokumentierten Scrollbereiche.
- Nutzertexte sind korrektes Deutsch mit Unicode-Schreibweise; technische Bezeichnungen gelangen nicht ungefiltert in die UI.

### Zuverlässigkeit

- Asynchrone Kernflows besitzen Lade-, Fehler-, Retry- und Erfolgszustände.
- Aktive Parserfehler werden nicht durch stille Fallbacks verdeckt.
- Pending- und Konfliktzustände überleben Reload accountgebunden.
- Ein Produktrelease braucht die Betriebsfreigabe aus [`operations.md`](operations.md).

### Performance

| Messgröße | Ziel |
| --- | --- |
| LCP / INP / CLS / TTFB (p75) | ≤ 2,5 s / ≤ 200 ms / ≤ 0,1 / ≤ 800 ms |
| Wiederkehrendes oder offline eingerichtetes Gerät bis lokaler Workspace | p75 ≤ 1,5 s, p95 ≤ 3 s |
| Neues Gerät bis Stapel-Bootstrap | p75 ≤ 3 s; Vollabgleich läuft danach weiter |
| Sichtbare Tab- oder Reviewreaktion | Beginn ≤ 100 ms |
| Vorgeladener Tab vollständig bereit | p75 ≤ 300 ms, p95 ≤ 750 ms |
| Nicht vorgeladener Tab vollständig bereit | p75 ≤ 1 s, p95 ≤ 2 s |
| Erste Seite eines 100k-Stapels und Lernstart | p75 ≤ 1 s, p95 ≤ 2 s |
| Review lokal dauerhaft gespeichert | p95 ≤ 250 ms |
| Normaler Delta-Sync | p75 ≤ 2 s, p95 ≤ 5 s, nie startblockierend |
| Initiales JavaScript (gzip) | Ziel ≤ 250 KiB, Grenze 300 KiB |
| Normaler Feature-Tab (gzip) | Ziel ≤ 150 KiB, Grenze 200 KiB |
| Bootstrapdaten | < 200 KiB komprimiert, ohne Kartenkörper oder Medien |
| Hintergrundarbeit | Portionen von höchstens 50 ms |

## 9. Beta-Abnahme

Der Beta-Kern gilt als erfüllt, wenn:

1. alle sieben Kernjourneys automatisiert und manuell bestehen;
2. ein neuer Account, kleiner Import, manuelle Erstellung, Review und Reload ohne Entwicklerwissen bedienbar sind;
3. eine Variante vor dem Reveal nicht erkennbar ist;
4. keine Labs-Navigation, Labs-Route oder ausgemusterte API ausgeliefert wird;
5. keine sichtbare Einstellung eine nicht vorhandene Wirkung verspricht;
6. Zielviewports, Tastatur, Screenreader, Zoom, lange Inhalte und mindestens ein realistischer Fehlerfall abgenommen sind;
7. keine Blocker oder ungeklärten hohen Reibungsverluste aus moderierten Tests verbleiben;
8. automatisierte Tests konkrete Produkt- und Sicherheitsverträge schützen, ohne Testanzahl als Produktabnahme zu behandeln.

Offene Gates und Evidenz stehen ausschließlich in [`todo.md`](todo.md).

## 10. Nichtziele des Beta-Kerns

- Community, Rankings oder soziale Leistungsmetriken.
- Generische Backend-, Auth- oder LLM-Adapter.
- Externer KI-Chat oder breite bzw. multimodale Kartenerstellung jenseits der textbasierten Variantenroute.
- Vollständiges Admin-Portal, Zahlungen oder Abonnements.
- Native Store-Apps oder Push-Benachrichtigungen.
- KI-Bildvariation, breiter OCR-Worker oder vollständige Anki-Template-Ausführung.
