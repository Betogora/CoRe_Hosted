# CoRe — Produktvertrag und Kernjourneys

**Rolle:** einzige kanonische Quelle für Produktversprechen, Kernjourneys, funktionale Anforderungen und Produktabnahme.
**Status:** Arbeitsfassung
**Stand:** 2026-08-28

Diese Spezifikation beschreibt ausschließlich, was CoRe für Nutzer leisten soll. Aktuelle Implementierung, Architektur, Betrieb, Entscheidungen, Verlauf und offene Roadmap haben eigene Quellen in der [Dokumentenlandkarte](index.md).

---

## 1. Produktvision

CoRe erweitert klassische Spaced Repetition um inhaltliche Wiederholung. Lernende sollen Inhalte auch bei veränderter Fragestellung abrufen, statt Layout, Wortlaut oder Lückenposition wiederzuerkennen.

CoRe startet Anki-kompatibel, bleibt beim Lernen ruhig und fokussiert und behandelt jede planbare Karte als eigenständige Lerneinheit.

### Zielgruppen

- Studierende und Auszubildende mit großen, langfristig gepflegten Kartenbeständen;
- Anki-Nutzer, die vorhandene Stapel weiterverwenden wollen;

### Kernnutzen

1. Bestehende und neue Lerninhalte schnell in ein gemeinsames Modell bringen.
2. Eine ruhige, vorhersehbare Review-Sitzung mit vier Bewertungen anbieten.
3. Geeignete reife Inhalte kontrolliert variieren.
4. KI-Umformulierungen stets auf ihre zugrunde liegende Karte zurückführen.
5. Nutzerinhalte accountgebunden und nachvollziehbar halten.

## 2. Produktprinzipien

1. **Anki-kompatibel starten:** APKG-Import und bekannte Kartenformen senken die Einstiegshürde.
2. **Karten bleiben eigenständig:** Jede Karte besitzt genau einen Lernstatus; KI-Umformulierungen teilen ihn.
3. **Review first:** Varianten sind vor der Antwort nicht als solche erkennbar.
4. **Lernen bleibt privat:** Stapel und Reviewdaten sind accountgebunden und werden nicht veröffentlicht.
5. **Stapelweise steuerbar:** Content Repetition kann pro Stapel aus, automatisch oder manuell sein.
6. **Sparsam ausbauen:** Nicht jede Karte wird variiert; neue Produktflächen brauchen einen belegten Core-Auftrag.

## 3. Produktreife

### Core

- E-Mail-/Passwort-Account und verständlicher leerer Zustand;
- Heute-Dashboard und klarer Lernstart;
- APKG im freigegebenen Größenbereich;
- manuelle Stapel- und Kartenerstellung;
- Karten- und Stapelverwaltung;
- Review mit vier Bewertungen und Content-Repetition;
- direkt erreichbare Hilfe zu FSRS, CoRe und Kartenvarianten;
- zugrunde liegende Karte nach der Antwort einer KI-Umformulierung;
- accountgebundene Speicherung, Sync- und Konfliktstatus;
- grundlegende Statistik und verständliche Einstellungen.

### Entfernt

CoRe besitzt keine experimentellen Produktoberflächen. Frühere Labs-Routen fallen auf `Heute` zurück und begründen keinen Kompatibilitätsvertrag.

### Disabled

- APKG über 250 MB; solche Dateien werden lokal abgewiesen;
- Google und Magic Link, wenn ihr jeweiliges eigenes Auth-Flag deaktiviert ist;
- DOCX, OCR und Bildregionen;
- vollständige Art.-15-Auskunft und Account-Löschung.

Die dauerhafte Entscheidung und ihre Konsequenzen stehen in [ADR-001](decisions.md#adr-001--core-labs-und-disabled). Der heutige Projektionsstand steht in [`status.md`](status.md).

## 4. Domänensprache

| Begriff | Produktbedeutung |
| --- | --- |
| Deck / Stapel | Hierarchisch organisierte Sammlung von Learning Items und Lernoptionen |
| Learning Item | Vollwertige, eigenständig planbare Karte mit Inhalt, Tags und Lernstatus |
| Card Variant | KI-Umformulierung einer Karte ohne eigenen Lernstatus oder Termin |
| Review State | Persönlicher Schedulingzustand einer Karte |
| Review Event | Unveränderliches Bewertungs- oder manuelles Neuplanungsereignis |
| Reifegrad | Aus Reviewdaten abgeleitete Eignung für anspruchsvollere Varianten |

Aktuelle Code- und Tabellennamen weichen teilweise aus Kompatibilitätsgründen ab. Diese technische Trennung steht ausschließlich in [`architecture.md`](architecture.md#4-heutiges-compatibility-modell).

## 5. Kernjourneys

### 5.1 Account öffnen und Produktzustand verstehen

Ein neuer Account startet ohne erfundene Profildaten, Demo-Stapel oder fremde Lernhistorie. Das Dashboard erklärt kurz das Kernversprechen und bietet klare Wege zum Import, zur ersten manuellen Karte oder zu einer ausdrücklich gewählten Demo.

Akzeptanz:

- Die Login-E-Mail wird als Accountwert gezeigt und nicht als wirkungslose Profiländerung angeboten.
- Datenschutztexte versprechen nur technisch wirksames Verhalten.
- Sync-, Offline- und Konfliktstatus sind ohne Tabellen-, Revisions- oder Geräteterminologie verständlich.
- Demo-Daten entstehen nur durch eine ausdrückliche Nutzeraktion oder klaren Entwicklungs-/Testmodus.
- Ein befülltes Dashboard ersetzt den bloßen Fälligkeitszähler durch genau eine Tageslernfläche. Sie aggregiert die alphabetisch sortierten Hauptstapel-Sessions einschließlich ihrer Unterstapel ohne Doppelzählung und zeigt `Gelernt`, `Neu`, `Offen` und `Fällig` mit denselben Farben und derselben vollständig gefüllten Segmentreihenfolge wie der Review. `X / Y Karten` zählt eindeutige heute relevante Learning Items; Untertitel, Zeitprognose, Konfetti und ein zusätzliches graues Segment existieren nicht.
- Die Tageslernfläche unterscheidet `Dein Lernen heute`, den deaktivierten Zwischenzustand `Später weiterlernen` für heute vorgemerkte, aktuell noch nicht verfügbare Lernschritte und den grün hervorgehobenen Abschluss `Tagesziel erreicht`. Auch `0 / 0 Karten` ist abgeschlossen. `Jetzt lernen` startet die erste aktuell verfügbare Hauptstapel-Session; die deaktivierten Aktionen `Plan ansehen` und `Plan für morgen ansehen` bleiben sichtbare Vorschauen ohne Ereignisbehandlung.
- Nach erreichtem Ziel öffnet `Zusätzliche Karten lernen` nur dann einen Dialog, wenn jenseits des heutigen Neulimits weitere neue Karten existieren. Nutzende wählen einen Hauptstapel und eine auf den tatsächlichen Rest begrenzte Menge aus `+5`, `+10` oder `+20`; die Auswahl erhöht ausschließlich dessen `newCardsTodayOverride` für den aktuellen fachlichen Lerntag und startet anschließend diese Session. Fällige oder künftige Wiederholungen werden nicht vorgezogen. Eine bei Bestätigung veraltete Auswahl mutiert nichts und meldet den Fehler verständlich.

### 5.2 Stapel importieren oder manuell anlegen

Nutzer wählen zwischen manueller Erstellung und Import.

Akzeptanz:

- Der Importbereich bietet ausschließlich APKG-Dateien an; Text-, CSV- und Tabellenimporte sind nicht verfügbar.
- Unterstützte Quellanhänge sind PDF, Text, Markdown, CSV und TSV; nicht lesbare Formate sind nicht auswählbar.
- APKG wird zuerst analysiert. Vorschau und `Import übernehmen` sind getrennte Schritte.
- Der Hauptbericht nennt Datei, Stapel, Karten, Notetypes, vorhandene und fehlende Medien sowie verständliche Kompatibilitäts- und Schedulerwarnungen. Höchstens drei repräsentative Karten werden mit demselben Renderer wie die spätere Kartenansicht und der Review gezeigt; Vorder- und Rückseite tragen innerhalb der Kartenfläche eine kompakte Seitenkennzeichnung. Der pauschale Hinweis auf originalgetreue und sichere Darstellung entfällt, tatsächliche Darstellungsabweichungen und Diagnosen bleiben sichtbar.
- Notetype-IDs, Template-Ordinals, Hashes und Importidentitäten dominieren den Hauptflow nicht.
- Eine laufende accountgebundene APKG-Sitzung bleibt bei Navigation innerhalb der App mit Datei-Metadaten, Vorschau, Fortschritt und Abschlusszustand erhalten. Die Rückkehr zu `Erstellen → Import` zeigt denselben Zustand; die Zurückaktion `Erstellen`, Logout oder bestätigter Abschluss setzen ihn zurück. Ein Browser-Reload übernimmt weder Datei noch Vorschau oder Worker.
- `Import übernehmen` endet nach dem lokal validierten IndexedDB-Commit und dem dauerhaften Einreihen vorhandener Medien. Jede reale Anki-Karte wird dabei zu einer eigenständigen CoRe-Karte. Danach werden Karten-, Review- und Mediendaten getrennt synchronisiert; Notiztypen bleiben reine Render-Schablonen.
- Offline- und erneut versuchbare Fehler melden `Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus.` und lassen Outbox sowie Medienqueue bestehen. Nicht erneut versuchbare Konflikte bleiben sichtbar und entfernen die lokalen Karten nicht.
- Abbruch, erneut versuchbarer Fehler, terminaler Fehler, Teilabschluss und Erfolg sind getrennte Zustände mit jeweils passender Folgeaktion.
- Nach dem bestätigten APKG-Erfolg öffnet sich ohne zusätzlichen Zwischenbutton genau einmal `Import erfolgreich`. Die Zusammenfassung nennt die verifizierte Kartenanzahl und den Stapelpfad. `Jetzt lernen` startet den importierten Wurzelstapel einschließlich seiner Unterstapel; `Zur Übersicht` führt zu `Heute`. `Karten prüfen` und `Weitere Karten erstellen` gehören nicht zu dieser Importabschlussansicht.
- Bei manueller Erstellung bleibt der Editor nach `Speichern` geöffnet. Angeheftete Felder bleiben erhalten, andere Felder werden geleert, das Zieldeck bleibt gewählt und der Fokus springt deterministisch in das erste freie Pflichtfeld.
- Ein gültiger manueller Speicherklick startet genau einen exklusiven Versuch. Entwurf, Zielstapel, `Fertig` und interne Navigation bleiben bis zu dessen Abschluss gesperrt; Mehrfachklick, Doppelklick und Tastaturaktivierung erzeugen höchstens eine Karte. Reload und Tab-Schließen behalten währenddessen die Browserwarnung.
- Bilder werden vor der Karte im accountgebundenen lokalen Medienspeicher gesichert. Erst danach wird die Karte lokal persistiert und der aktuelle Medien-Upload versucht. Ein Fehler vor der lokalen Kartenspeicherung erhält den vollständigen Entwurf und erhöht den Sitzungszähler nicht; ein späterer Medien- oder Cloudfehler zählt die bereits lokale Karte genau einmal und darf keinen erneuten Save zur Dublette erzwingen.
- Manuell eingefügte JPEG-, PNG- und WebP-Bilder oberhalb Full HD werden vor Prüfsumme und lokaler Sicherung unter Beibehaltung des Seitenverhältnisses verkleinert: Landschaft passt in 1920 × 1080, Hochformat in 1080 × 1920. Kleinere Dateien sowie SVG-, GIF- und AVIF-Dateien bleiben bytegenau unverändert; APKG-Medien werden nie durch diesen Pfad verändert.
- Während des Versuchs zeigt der Aktionsbereich einen zugänglichen, monotonen Fortschrittsbalken mit den Phasen `Bilder werden lokal gesichert`, `Karte wird lokal gespeichert`, Upload mit ursprünglichem Dateinamen und Byteangaben sowie `Medienverknüpfung wird gespeichert`. 100 Prozent erscheinen erst am Ende des gesamten Versuchs; Reduced Motion wird berücksichtigt.
- Vollständiger Cloudabschluss meldet `Karte wurde erfolgreich gespeichert.`. Ein erneut versuchbarer oder Offline-Teilabschluss meldet `Karte und Bilder sind lokal gespeichert. Die Cloud-Synchronisierung wird automatisch fortgesetzt.`; ein nicht erneut versuchbarer Medienfehler nach lokaler Speicherung wird als unvollständiger Medienzustand angezeigt.
- Im Kopf der manuellen Erstellungsfläche öffnet `Vorschau` den gemeinsamen modalen Karten-Vorschau-Dialog aus dem aktuellen ungespeicherten Entwurf. Text, Kartentyp, Zusatzfelder und optionale Vorder-/Rückseitenbilder stammen dabei aus derselben Projektion wie beim Speichern. Eine zusätzliche aufgeklappte `Live-Vorschau` wird in der Kartenerstellung nicht angezeigt. Die modale Vorschau verzichtet auf pauschale Sicherheits- oder Originaltreue-Werbung. `PDF/Text anfügen` steht in der oberen Zurückzeile direkt neben `Erstellen`.
- Die manuelle Erstellung beginnt ohne Kartentypauswahl mit Vorder- und Rückseite. `Fragentyp` und `Lernrichtung` stehen in getrennten Zeilen. Bilder können über dauerhaft sichtbare, ungefüllte Ablagefelder optional in beiden Feldern eingefügt werden; `Lücke` markiert die gespeicherte Textauswahl als Cloze-Gruppe, Rückrichtung, Single Choice und Multiple Choice werden als direkte Steuerungen angeboten. Bei beiden Auswahltypen stehen die Antwortoptionen unmittelbar unter der Frage und vor dem Vorderseitenbild. Zusätzliche benannte Felder erhalten eine Platzierung auf Vorderseite, Rückseite, beiden Seiten oder nur in Metadaten; `Feld hinzufügen` steht ohne ausklappbare Gruppenfläche direkt darunter.
- Zielauswahlen zeigen vollständige hierarchische Stapelpfade. Erst `Fertig` öffnet den Abschluss mit Sitzungsanzahl, Zielpfad, `Jetzt lernen` und `Karten prüfen`.
- Interne Navigation mit einem nichtleeren fachlichen Entwurf verlangt eine eigene Bestätigung. `Weiter bearbeiten` erhält Inhalt und Fokus; `Verwerfen und verlassen` verwirft nur den aktuellen Entwurf. Während eines laufenden Speicherversuchs bleibt die Navigation ohne Verwerfoption auf der Erstellungsseite und fokussiert den Fortschritt.

### 5.3 Karten bearbeiten und eine Sitzung starten

`Lernen` ist der primäre schnelle Einstieg in eine Sitzung und bündelt die beiden Bereiche `Stapelübersicht` und `Kartenverwaltung`. Die Auswahl erfolgt über ein reguläres segmentiertes Control rechts neben der Überschrift `Lernen`; die Route leitet den aktiven Bereich ab. Die direktlinkfähige Kartenverwaltung für alle Karten, Stapelstruktur, Inhalt, Herkunft und erweiterte Optionen behält die verborgene Route `/kartenstapel`.

Akzeptanz:

- Die Hauptnavigation lautet exakt `Heute`, `Lernen`, `Erstellen`, `Statistik`. Auch auf `/kartenstapel` ist `Lernen` aktiv; ein normaler Klick auf das Hauptziel `Lernen` öffnet stets die Stapelübersicht. Ein Klick auf den Schriftzug `CoRe` im App-Kopf beziehungsweise in der Sidebar navigiert zu `Heute`.
- Beide Lernen-Bereiche zeigen `REVIEW` und `Lernen` im Seitenkopf. Das segmentierte Control bleibt mit 44 px Höhe, vollständigen Beschriftungen und ohne Umbruch rechts neben der Überschrift; bei schmalen Viewports werden nur Schriftgröße und horizontaler Innenabstand verdichtet, ohne horizontalen Seitenüberlauf.
- `Heute`, `Lernen` und `Kartenverwaltung` verwenden dieselben Stapeldaten mit Tiefenfarbe, Chevron, Icon und Drei-Punkte-Aktion. Die Zeile zeigt bei jeder Breite ausschließlich den einzeiligen, bei Überlänge elliptisch gekürzten Stapelnamen und niemals den Hierarchiepfad. `Heute` und `Lernen` ergänzen die drei Kennzahlen `Neu`, `Offen` und `Fällig` sowie den segmentierten Gesamtfortschrittsdonut; oberhalb ihrer Stapelzeilen steht genau eine ungefähr 28 px hohe, nicht sortierbare Kopfzeile mit `Stapel` und diesen drei Kennzahlen. Nur bei extrem schmaler verfügbarer Panelbreite werden sie platzsparend als `N`, `O` und `F` abgekürzt; in den Zeilen bleiben ausschließlich die vollständig zugänglich beschrifteten Zahlen sichtbar. Die drei Zahlen sind die durch verbleibende Tageslimits begrenzte Tagesprojektion: `Neu` enthält ausgewählte neue Karten, `Offen` heute anstehende Learning-/Relearning-Karten und `Fällig` ausgewählte fällige Reviewkarten. Der Donut bleibt davon unabhängig und teilt den gesamten aktiven Kartenbestand ohne Tageslimits im Uhrzeigersinn in `Neu`, `Offen`, aktuell `Fällig` und `Gelernt` auf; gelernt sind Reviewkarten mit einem zukünftigen Termin. Dashboard und Lernen aggregieren Zahlen und Donut über den Teilbaum mit den Einstellungen des dargestellten Elternstapels. Stapelköpfe der Kartenverwaltung zeigen auf keiner Hierarchieebene diese Kennzahlen oder den Donut, auch nicht ausschließlich für assistive Technik. Ausgesetzte oder vergrabene Karten fehlen weiterhin in den Lernprojektionen.
- Übersicht, Lernen und Kartenverwaltung speichern ihren jeweiligen Auf-/Zuklappzustand kontogebunden und stellen ihn nach Navigation, Reload und erneuter Anmeldung wieder her. Ohne gespeicherte Präferenz starten die Stapelsektionen der Kartenverwaltung eingeklappt; ein fokussierter Stapel beziehungsweise eine direkt verlinkte Karte öffnet die betroffene Sektion und speichert diesen Zustand. Unterstapel und die drei Ansichten bleiben voneinander unabhängig.
- Eine vorhandene leere, als `Nicht festgelegt` dargestellte Profilzeitzone blockiert das Speichern dieser UI-Präferenzen nicht. Für zeitabhängige Laufzeitberechnungen bleibt der Fallback auf die Browserzeitzone aktiv.
- Alle Stapelbäume sind innerhalb jeder Hierarchieebene alphabetisch wie in Anki sortiert. Die Reihenfolge folgt dem Stapelnamen ohne numerische Sonderbehandlung, sodass beispielsweise `Stapel 10` vor `Stapel 9` steht; jeder Elternstapel bleibt unmittelbar mit seinem separat sortierten Unterbaum zusammen.
- Die Kartentabelle zeigt pro Karte ausschließlich `Sortierfeld`, `Datum` und `Variante`. `Sortierfeld` ist die bereinigte Vorderseitenvorschau, `Datum` zeigt für unbewertete Karten `Neu` und sonst `TT.MM.JJJJ`, `Variante` unterscheidet zusätzliche aktive Varianten als `Ja` oder `Nein`.
- Ausgesetzte Karten bleiben mit unverändertem, sortierbarem Datum in der Kartenverwaltung sichtbar und erhalten über die gesamte Zeile eine semantische gelbe Warnfläche; die Auswahl bleibt zusätzlich erkennbar und assistive Technik erhält die textliche Kennzeichnung `Ausgesetzt`. Markierte Karten zeigen unmittelbar rechts neben dem `Ja`-/`Nein`-Variantenstatus einen gelb gefüllten Stern. Beide Zustände können gleichzeitig erscheinen.
- Normale Kartenzeilen und beide Tabellenkopfvarianten bleiben einzeilig und ungefähr 28 px hoch; die sortierbaren Kartenüberschriften behalten Schrift und Pfeile. Lange Sortierfelder werden visuell mit Ellipse gekürzt, bleiben aber zugänglich und im Kartendetail vollständig verfügbar. Stapelköpfe bleiben mit höchstens ungefähr 48 px einheitlich kompakt. Die Kartenverwaltung und `Aktive Stapel` erzeugen bei keiner unterstützten Breite horizontales Scrollen: Stapelnamen und flexible Zellinhalte werden elliptisch gekürzt. In der Kartentabelle erhält `Sortierfeld` den verbleibenden Platz und wird zuerst gekürzt; die drei Spaltenüberschriften sowie die Werte in `Datum` und `Variante` bleiben vollständig und ungekürzt sichtbar.
- Alle drei Spalten sind auf- und absteigend sortierbar. Standard ist `Sortierfeld` A–Z; die gewählte Sortierung gilt einheitlich für alle Stapelsektionen und wird nicht persistiert. Leere aufgeklappte Stapel zeigen `Keine Karten`.
- Die Kartenverwaltung bündelt den Paneltitel `Aktive Stapel`, die Suche und die gruppierte Gesamttabelle in einem gemeinsamen Panel. Über dem Suchfeld steht das sichtbare Feldlabel `Karten durchsuchen` im Format von `Stapelname`. Es gibt dort keinen Direkteinstieg zur Kartenerstellung.
- Suche berücksichtigt Stapelpfad, Vorderseite, Rückseite und Tags und öffnet passende Sektionen nur für die Dauer der Suche. Die Kartenverwaltung besitzt keinen zusätzlichen Modusfilter.
- Auf-/Zuklappen, Stapeloptionen und andere eigene Bedienelemente lösen die Flächenaktion nicht aus. Die Flächenaktion ist per Enter und Leertaste bedienbar und besitzt einen eindeutigen zugänglichen Namen.
- Dashboard und Lernen verwenden dasselbe Panel `Aktive Stapel`; nur das Dashboard zeigt darin `Alle ansehen`. Lernen zeigt direkt unter dem Titel dauerhaft das Schnellformular aus `Stapelname`, `Ebene` und `Anlegen`, gefolgt von der Stapeltabelle; das Formular bleibt auch ohne vorhandene Stapel und nach erfolgreichem Anlegen sichtbar. Die früheren Schnellaktionen `Karten verwalten`, `Neue Karten` und `Stapel anlegen` oberhalb des Panels existieren nicht mehr. Titel und Dashboard-Aktion bleiben jeweils einzeilig und wechseln nur bei extremer Platzknappheit gemeinsam in zwei Zeilen. Während eines Drags ersetzt die Hauptebenen-Zone nahezu vollflächig die Desktop-Sidebar beziehungsweise bei ausgeblendeter Sidebar positions- und größengetreu die mobile Bottom-Bar; im Panelkopf erscheint keine parallele Zielzone.
- Pointer-Hover füllt Stapelzeilen in Dashboard, Lernen und Kartenverwaltung neutral mit derselben dunkleren Graufläche; eine bloße interaktive Rahmen- oder Unterstreichungsfarbe erscheint dabei nicht. In allen drei Ansichten besitzen Stapelköpfe unabhängig von Hauptstapel oder Hierarchieebene keine Trennlinie; die dünnen Grenzen zwischen einzelnen Kartenzeilen der Kartenverwaltung bleiben erhalten.
- Jede Stapelgruppe besitzt dasselbe kompakte Drei-Punkte-Menü mit individuellem Icon, lokalem Stapelnamen, CoRe-Modus, `Einstellungen` und bestätigtem `Verschieben`. Der randlose 44 × 44-px-Trigger übernimmt die jeweilige Zeilenfläche und trägt den sichtbaren Tooltip `Stapeloptionen für <lokaler Stapelname>` mit einem 16 × 16-px-Abbild des farbigen Stapel-Icons. Sein zugänglicher Name behält den vollständigen Pfad, damit gleichnamige Unterstapel unterscheidbar bleiben. Auch der Tooltip `Stapel umbenennen` verwendet dieses kompakte Stapel-Icon.
- Der Bereich `Stapel` ordnet Name, Icon und Farbe sowie direkt darunter ohne Trennlinie `Unterstapel anlegen`, den segmentierten `CoRe-Modus` und `Löschen` an. Normales und variantenfokussiertes Lernen wird in den Stapel-Einstellungen nicht angeboten. Unterstapel können dort mit vorausgewähltem Elternstapel oder über die Ebenenauswahl des dauerhaften Schnellformulars in Lernen angelegt werden.
- Die nichtmodale Speicherleiste der Stapeleinstellungen bezeichnet ihre stapelbezogene Aktion ausdrücklich. Besitzt der gewählte Stapel Unterstapel, bietet sie getrennt `Einstellungen für Stapel speichern` und `Einstellungen für Stapel und alle Unterstapel speichern` an. Die zweite Aktion übernimmt rekursiv nur die seit dem gespeicherten Stand geänderten Darstellungs-, Lern-, Scheduler- und CoRe-Werte; Unterstapelnamen sowie nicht geänderte individuelle Werte bleiben erhalten. Ohne Unterstapel erscheint nur die stapelbezogene Einzelaktion. Beide Wege speichern lokal persistent in einer gemeinsamen Mutation, bleiben auf der Einstellungsseite und bestätigen ihren jeweiligen Geltungsbereich.
- Ein Kartenklick setzt Deck- und Karten-ID gemeinsam in die URL und öffnet rechts ein nicht-modales, unabhängig scrollendes Detail-`aside`. Ab 1024 px überlagert es die rechte Hälfte der Tabelle, darunter die volle Inhaltsbreite. X, Escape und ein Außenklick schließen es; ein Außenklick auf eine andere Kartenzeile wechselt nach erfolgreicher Auflösung dorthin, andere Außenklicks schließen nur. Reload sowie Browser-Zurück/-Vorwärts bleiben deterministisch und der Zeilenfokus wird nach dem Schließen wiederhergestellt.
- Wird das Kartendetail über `Karte bearbeiten` aus einer Review-Sitzung geöffnet, trägt die URL zusätzlich einen allowlist-validierten Review-Rückkontext. Der sichtbare Schließenweg führt in diese Sitzung zurück; normale Kartenverwaltungsaufrufe ohne diesen Kontext schließen weiterhin zur Kartenliste.
- Änderungen an typgerechten Kartenfeldern und Tags werden gegen den letzten gespeicherten Stand geprüft. Beim Schließen, Kartenwechsel oder interner Navigation bietet ein modaler Dialog `Speichern`, `Verwerfen` und `Weiter bearbeiten`; nur erfolgreiches Speichern beziehungsweise bewusstes Verwerfen führt die vorgemerkte Aktion aus. Temporäre Varianteneingaben und die Terminwahl bleiben davon unberührt.
- Der Detailbereich zeigt den typgerechten Editor sowie `Speichern`, `Vorschau`, `Kopieren` und `Löschen` primär. Für Basic-Karten folgen KI-Umformulierungen; ein Herkunfts-, Versions-, Vergleichs- oder Restore-Abschnitt existiert nicht. Markieren und Aussetzen sind davon unabhängige, sofort gespeicherte Lernstatus-Aktionen, sodass insbesondere eine ausgesetzte Karte direkt reaktiviert werden kann, ohne ungespeicherte Inhaltsänderungen zu übernehmen.
- Direkt unter `Aussetzen` zeigt `Nächste Fälligkeit` den gemeinsamen, mit dem gespeicherten Lerntag vorbelegten CoRe-Datumspicker. Sein gerundetes Popover verwendet deutsche Wochentage, Monats- und Jahresnavigation sowie die semantischen Light-/Dark-Farben. `Neu planen` wird erst für einen anderen, mindestens nächsten fachlichen Lerntag aktiv; ein heutiger oder überfälliger gespeicherter Termin bleibt bis dahin sichtbar. Die getrennte Aktion setzt `dueAt` DST-sicher auf den Lerntagesbeginn in Profilzeitzone, lässt eine Aussetzung bestehen und bestätigt den Erfolg unabhängig vom Inhaltsspeichern. Der Simulator verwendet denselben Datumspicker mit seiner bisherigen Zehnjahresgrenze.
- Der gemeinsame modale Karten-Vorschau-Dialog zeigt bei jedem Öffnen zunächst ausschließlich den unbeantworteten Lerninhalt der Vorderseite und wechselt über eine segmentierte Seitenauswahl zum aufgedeckten Lernzustand aus Frage, einmaliger 2-px-Trennlinie und Antwort. Ein zusätzlicher Button `Antwort anzeigen` und die Review-Bewertungen erscheinen dort nicht. Single- und Multiple-Choice-Auswahl samt Feedback werden ausschließlich transient im Dialog simuliert; Single Choice deckt nach einer Auswahl direkt auf, Multiple Choice erst über `Antwort prüfen`. Die Rückkehr zur Vorderseite setzt die Auswahl zurück. Der Dialog folgt dem aktiven Light-/Dark-Theme, ist auf Desktop leicht vergrößert, füllt auf Mobilgeräten den Viewport und besitzt Fokusfalle, Escape-, Außenklick- und Fokuswiederherstellungsverhalten.
- Basic-Editoren lesen Frage und Antwort aus den semantisch zugeordneten Dokumentfeldern. Eine durch Anki-`FrontSide` materialisierte Frage ist deshalb kein Bestandteil des Rückseiten-Eingabefelds; Speichern erhält die rohe Antwort. Vorschau und Review verwenden dieselbe Lernkartenkomposition aus getrennter Frage- und Antwortprojektion, sodass die bereits sichtbare Frage außerhalb der Antwort bleibt und die Antwortprojektion weder eine CoRe-Frage noch Anki-`FrontSide` wiederholt.
- Kartenrenderer erhalten Rich-Text-HTML einschließlich Absätzen, Fettung, Listen, Listenabständen und Medien. Wörtliche Markdown-Syntax wird nicht zusätzlich interpretiert. Die isolierte Kartenfläche verwendet standardmäßig die lokale Synonym-Typografie und kann weiterhin durch erhaltenes Anki-CSS bewusst überschrieben werden.
- Anki-Bedingungen prüfen den nichtleeren Feldinhalt statt nur sichtbaren Text. Reines Bild-, Audio- oder Video-Markup erfüllt eine positive Bedingung und unterdrückt die zugehörige invertierte Bedingung; reine Whitespace-Felder gelten weiterhin als leer.
- Das fokussierte Deck ist in Lernen und Kartenverwaltung derselbe URL-reproduzierbare Kontext, ohne parallele lokale Deckidentität.
- Lernen-, Kartenverwaltungs- und Erstelllinks erhalten ihr Deck beziehungsweise ihre ausgewählte Karte über Reload und Direktlink.
- Stapeloptionen merken sich ihren URL-reproduzierbaren Ursprung. Der Rückweg führt zum Dashboard, nach Lernen oder zum zuvor ausgewählten Stapel und optional zur Karte; Direktlinks ohne Ursprung fallen sicher auf Lernen zurück.
- Gleichnamige Unterstapel werden in relevanten Links und Auswahlen durch ihren vollständigen Hierarchiepfad unterschieden.
- Stapelbezogene Auswahlfelder zeigen im geschlossenen Zustand Stapel-Icon und vollständigen Hierarchiepfad. Das geöffnete Feld ist eine kompakte, höchstens 320 px hohe, innerhalb jeder Hierarchieebene alphabetisch sortierte Baumliste mit nativer Seiten-Scrollbar, individuellem Stapel-Icon, einzeiligem Namen und Einrückung je Hierarchieebene; ohne tatsächlichen Überlauf nutzen Zeilenflächen die vollständige Listenbreite. Ab fünf tatsächlich auswählbaren Ober- und Unterstapeln erscheint eine Suche über den vollständigen Pfad. Sonderziele wie Hauptstapel oder Hauptebene zählen nicht zur Suchschwelle. Single- und Statistik-Multi-Select markieren ausgewählte Zeilen mit einer neutralen Auswahlfläche und einem Haken rechts. In der Statistik stehen Suche, `Gesamte Sammlung` und Stapelbaum untereinander; eine Trennlinie liegt ausschließlich zwischen `Gesamte Sammlung` und Stapelbaum. Eingeschlossene Unterstapel bleiben markiert und deaktiviert. Die Gruppentöne für Tiefen 0 bis 3 werden dort nicht verwendet.
- In Dashboard und Lernen verschiebt ein Drop auf eine Stapelkarte den gezogenen Baum unmittelbar als Unterstapel; ein Drop auf die sichtbare Hauptebenen-Zone entfernt die Elternzuordnung. Die durchgehende neutrale Zeilenfläche reagiert nach einer kurzen Bewegungsschwelle direkt auf Maus- und Trackpad-Pointer und hält den Griff auch außerhalb der Zeilenfläche. Während der Geste dunkelt ein globales Fokus-Overlay die gesamte Oberfläche ab; gezogener Stapel, aktuelles Stapelziel und Hauptebenen-Zone bleiben hell. Die ausgesparten Stapelzeilen behalten ihre eckige Zeilenform. Der gezogene Stapel wird angehoben, gültige Ziele werden mit einem verstärkten Warnfarb-Indikator markiert. Selbst-, Nachfahren- und unveränderte Ziele bleiben ohne Strukturänderung.
- Interaktiv angelegte oder verschobene Stapelbäume besitzen höchstens vier sichtbare Ebenen: Hauptstapel, Unterstapel, Unter-Unterstapel und Unter-Unter-Unterstapel. Ein zu tiefes Ziel wird ohne Mutation mit `Maximal vier Stapel-Ebenen sind möglich.` abgelehnt.
- Tiefere APKG-Hierarchien bleiben beim Import unverändert. Ihre Darstellung verwendet ab der vierten Ebene den tiefsten Gruppenton; spätere Moves müssen die Vier-Ebenen-Grenze einhalten oder den vorhandenen Baum nachweislich flacher machen.
- Ein beendeter Drag startet keine Sitzung. Erfolg, Fehler und No-op werden deutsch über eine Live-Region gemeldet; es gibt keine Bestätigung und kein Rückgängig-Angebot.
- Die Kartenverwaltung bietet kein direktes Drag-and-drop; alle drei Stapelansichten verwenden für Tastatur, Touch und assistive Bedienung denselben expliziten bestätigten Verschiebedialog.
- Kartenlöschung verwendet den kompakten Standarddialog `Karte löschen` mit `Nein` samt Kreuz und `Ja` samt Haken. `Nein`, Escape und ein Klick auf den abgedunkelten Bereich brechen ohne Löschung ab; der Außenklick schließt zusätzlich den Kartendetailbereich. `Ja` führt den lokal persistenten Soft Delete aus, schließt Dialog und Detailbereich, lässt die Kartenliste an ihrer aktuellen Scrollposition, zeigt oben rechts den schließbaren Erfolgsbanner `Karte wurde erfolgreich gelöscht.` und bietet unmittelbar ein Undo, das denselben Datensatz samt Review State wiederherstellt. Eine ausstehende Cloud-Synchronisierung bleibt in der Outbox und blockiert den sichtbaren Löschabschluss nicht.
- Programmatische DOM-Fokusführung, Fokusfallen und Tastaturbedienung bleiben erhalten; sichtbare Fokusrahmen, Fokus-Rings und reine `focus-within`-Rahmen werden appweit nicht dargestellt. Fachliche Auswahlzustände bleiben davon unberührt.
- Stapellöschung zeigt Stapelname, Unterstapelzahl und aktive Kartenanzahl; ein Abbruch verändert nichts.
- Vorderseite, Rückseite und Zusatzfelder werden als sanitisiertes Rich Text bearbeitet; Pflichtfelder werden direkt am Feld validiert. Medien sind optionale Inhalte und kein eigener Kartentyp.
- Reverse erzeugt zwei voneinander unabhängige Karten mit eigenem Lernstatus und eigener Fälligkeit. Rückrichtung wird für Single Choice und Multiple Choice nicht angeboten.
- Cloze ist eine Editoraktion. Jede Lückengruppe wird beim Speichern zu einer eigenständigen Karte mit eigenem Lernstatus und eigener Fälligkeit.
- Single Choice und Multiple Choice sind Antwortformate desselben Learning Items. Sie sind mit Medien und Zusatzfeldern kombinierbar, aber nicht zugleich die primäre Cloze-Interaktion.
- Single Choice bearbeitet Frage, mindestens zwei eindeutige Optionen, genau eine richtige Option und eine optionale Erklärung gemeinsam. Multiple Choice verwendet dieselben Felder, erlaubt mehrere richtige Optionen und verlangt jederzeit mindestens eine richtige und mindestens eine falsche Option. Reviewanzeige und Bewertung verwenden dieselbe gespeicherte Antwortmenge.
- PDF- und Textquellen helfen nur während der Erstellung; dauerhaft gespeichert werden der übernommene Karteninhalt und benötigte Medien.
- APKG-Reimport identifiziert Karten ausschließlich über die Anki-Karten-ID. Nur ein neuerer Anki-Änderungszeitpunkt ersetzt den vollständigen Karteninhalt; CoRe-Lernstatus, Markierung und Aussetzung bleiben erhalten.
- Importierte Anki-Karten zeigen Felder in ursprünglicher Reihenfolge und mit ursprünglichen Namen. Werte sind editierbar, während Feldschema, Templates und CSS strukturell schreibgeschützt bleiben.
- Strukturierte Kartenfelder überleben den accountgebundenen Cloud-Roundtrip. Einen CoRe-JSON-Export oder -Import gibt es nicht.
- Karten können als eigenständige Learning Items direkt hinter dem Ausgangselement kopiert werden. Inhalt, Tags und stabile Medienreferenzen bleiben erhalten; Karten-, Review- und Scheduleridentitäten werden neu erzeugt.
- Der kanonische Karteninhalt-Vertrag besteht aus `LearningItemDocumentV1`, einer `NoteTypeDefinitionV1` und stabilen Medienreferenzen. Persistierte Quelldokumente, Quellsnapshots und Inhaltsversionen gehören nicht zum Vertrag.
- Eine Basic-Karte kann unmittelbar als KI-Variante umformuliert werden. Diese Umformulierung bleibt der Karte untergeordnet, besitzt keinen eigenen Lernstatus und wird nicht als Karte gezählt.
- An den Anbieter gelangen ausschließlich der bereinigte Text von Vorder- und Rückseite mit je höchstens 1.200 Zeichen. Tags, IDs, Quellen, Reviewdaten, Metadaten, Medienreferenzen und Medieninhalte werden nicht übertragen. Nicht-Basic-Karten erklären den deaktivierten KI-Zugang.
- CoRe speichert die KI-Variante erst, wenn die Ausgangskarte während des Aufrufs unverändert blieb und dieselbe Front-/Back-Kombination noch nicht existiert. Fehler verändern das Learning Item nicht; während des Aufrufs ist die Aktion gesperrt. Bei einem kostenlosen Non-ZDR-Fallback erscheint nach Erfolg eine sichtbare Warnung.

### 5.4 Karte bewerten, neu laden und fortfahren

Vor der Antwort zeigt der Review ausschließlich den Lerninhalt und die Aktion zum Aufdecken. Der Lerninhalt liegt direkt auf der Seitenfläche ohne großen Kartencontainer, ohne gerahmte Teilflächen und ohne sichtbare Abschnittslabels für Frage oder Antwort. Nach dem Aufdecken bleiben Frage und Antwort sichtbar, getrennt durch eine markante 2-px-Linie; die Antwortprojektion enthält ausschließlich die Antwort und wiederholt die bereits sichtbare Frage nicht. Vier Bewertungen aktualisieren den Lernzustand.

Akzeptanz:

- `Again`, `Hard`, `Good` und `Easy` sind per Maus und Tastatur erreichbar.
- Intervallvorschauen passen zur tatsächlich angewendeten Bewertung.
- Die vier kompakten Bewertungsflächen zeigen nach dem Aufdecken zweizeilig die deutsche Bewertung `Nochmal`, `Schwer`, `Gut` beziehungsweise `Leicht` in normaler UI-Schriftgröße und darunter kleiner das dynamische Intervall; Minuten werden als `min` abgekürzt. Die Ziffern `1` bis `4` bleiben als Tastenkürzel aktiv und erscheinen ausschließlich in den gemeinsamen Tooltips `Taste 1` bis `Taste 4`.
- Vor dem Reveal erscheinen keine Herkunfts-, Varianten-, Reife- oder Schedulerhinweise.
- Oberhalb der Lernkarte steht ein beschrifteter, vollständig gefüllter Tagesfortschritt. Seine vier proportionalen Segmente zeigen von links nach rechts `Gelernt` im Blau von `Leicht`, `Neu` im Pink von `Nochmal`, `Offen` für heute anstehendes Learning und Relearning im Orange von `Schwer` sowie `Fällig` im Gelb von `Gut`. Jedes vorhandene Segment zeigt beim Hover einen einzeiligen Tooltip im Statistikstil mit farbigem Squircle, Bezeichnung und Kartenanzahl. Der sichtbare Zähler nennt heute gelernte und insgesamt heute relevante Learning Items; ein zugänglicher Text nennt zusätzlich alle vier Werte einschließlich leerer Gruppen. Nur während eines aktiven Laufs zeigt der schlanke `Pomodoro-Timer`-Balken darunter die aufgerundeten ganzen Restminuten sowie den sekündlich sinkenden Anteil.
- Die dynamische Tagesgesamtmenge vereinigt die nach aktuellen Stapel- und Tageslimits ausgewählte Queue mit den am fachlichen Lerntag bereits bearbeiteten, weiterhin reviewbaren Learning Items. Eine heute beantwortete Karte zählt als `Gelernt`, sobald an diesem Lerntag kein weiterer Schritt ansteht. Das gilt auch für eine intern noch im Zustand Learning befindliche Karte mit nächstem Schritt morgen; am Folgetag erscheint sie wieder als `Offen`. Reviewkarten sind an ihrem gesamten fachlichen Fälligkeitstag verfügbar; Varianten und Wiederholungen zählen dasselbe Learning Item nicht mehrfach.
- Die Lerneinstellungen erscheinen unter 768 px als Bottom Sheet und ab 768 px als zentriertes modales Overlay. Beide Projektionen verwenden dieselbe normale App-Typografie und die Reihenfolge `Karte`, `Sitzung`, verdichten die Einstellungen auf mindestens 44 px Bedienhöhe, gliedern sie ohne horizontale Trennlinien oder permanente Icon-Hintergründe durch Abstand, schließen per Escape oder Außenklick, halten den Fokus im geöffneten Dialog und stellen ihn danach wieder her.
- `Karte bearbeiten` öffnet den Einzelkarten-Editor. `Stapel bearbeiten` öffnet die Einstellungen des Sitzungsstapels und kehrt auch nach einem Reload gezielt in dieselbe Review-Sitzung zurück. Eine Anki-Flaggenauswahl wird appweit weder angeboten noch dargestellt. `Markieren` ist ein gelber, zugänglicher Stern-Button mit `aria-pressed`; der aktive Zustand ist gefüllt und verändert die Lern-Queue nicht. `Aussetzen` ist ein rechtsbündiges segmentiertes Control mit `Nicht aussetzen` und `Aussetzen`; der zweite Zustand pausiert das gesamte Learning Item einschließlich aller Varianten, ohne Lernzustand, Lernschritt, Fälligkeit, FSRS-Werte oder Reviewhistorie zu verändern. Ausgesetzte Karten fehlen in Queue, Tageszahlen, Tagesfortschritt und Donut.
- Wird die aktuelle Karte ausgesetzt, verschwindet sie ohne Bewertung und ohne Fortschrittsgewinn aus allen offenen Initial- und Wiederholungspositionen der Sitzung. Das Overlay schließt, die nächste Karte beziehungsweise der Abschluss erhält den Fokus und der dauerhaft schließbare Erfolgstoast lautet `Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.` Reaktivieren verändert den Review State nicht: New bleibt neu, Learning/Relearning behält Schritt und Termin, Review behält Intervall und Termin; ein inzwischen vergangener Termin ist sofort relevant, ein zukünftiger erst zu seinem Zeitpunkt.
- `Pomodoro-Timer` klappt im Abschnitt `Sitzung` nach unten auf, verwendet ein neutrales Tomaten-Icon und bietet die Vorgaben `15`, `25` und `45` Minuten über das gemeinsame segmentierte Control. `25` ist der Standard; das kompakte Feld akzeptiert weiterhin eigene positive Ganzzahlen und hebt dann die Presetauswahl auf. Auswahl und Eingabe starten erst über `Start`; auf Desktop stehen Dauer, gleich hohe Schnellauswahl und Start in einer Zeile. Ein erfolgreicher Start aus den Lerneinstellungen schließt den gesamten Dialog, und beim nächsten Öffnen ist der Timer wieder eingeklappt. Derselbe ausklappbare Start steht in `Globale Einstellungen → Lerntag & Fokus` direkt unter dem Simulator bereit. Jeder Start ersetzt einen laufenden Countdown sofort. Es existiert accountbezogen genau ein browserlokaler Timer, der Navigation, Hintergrund, Reload und weitere Tabs über eine reale Endzeit übersteht, aber weder Cloud, Deckdaten noch simulierte Lernzeit verwendet. Während des Laufs erscheint derselbe Fortschritt im Review, ab 1280 px unten in der Sidebar oberhalb der Utility-Gruppe und darunter im kompakten Kopf zwischen `CoRe` und Utility-Gruppe. Beim Ablauf verschwinden die Shell-Projektionen und der schließbare Toast lautet `Timer abgelaufen.` Pause, Stopp, akustische Signale und Pausenzyklen werden nicht angeboten. Kartenverwaltung, Reset, Mischen und `Nur normale Karten` sind nicht Bestandteil der Lerneinstellungen.
- `Kartenreihenfolge` bietet im Sitzungs-Overlay `Fällige Karten zuerst`, `Neue und fällige mischen` und `Neue Karten zuerst`. Die Auswahl wird im gestarteten Wurzelstapel gespeichert und sortiert ausschließlich noch unbeantwortete Initialkarten neu; die aktuelle Karte, abgeschlossene Karten, Wiederholungen und Bewertungszähler bleiben erhalten. `Neue Karten pro Tag` und `Wiederholungen pro Tag` werden ausschließlich in den Stapeleinstellungen bearbeitet. Die beiden Tagesgrenzen sind kompakte Ganzzahlfelder ohne Slider; `Maximales Intervall in Tagen` ist ebenfalls ein reines Ganzzahlfeld. Die sichtbaren Grenzen sind 0 bis 500 neue Karten, 0 bis 2.000 Wiederholungen und 30 bis 36.500 Tage maximales Intervall. Eine Änderung des Neulimits hebt einen alten Tages-Override auf.
- Unter `Globale Einstellungen → Lerntag & Fokus` stehen ausschließlich accountweit der Tagesbeginn von 0 bis 23 Uhr, das Vorziehfenster von 0 bis 720 Minuten und der Wochenrhythmus aus sieben Easy-Days-Stufen. Der Tagesbeginn 0 erhält Mitternacht als Grenze; bei 3 gehört 02:59:59 noch zum Vortag und um 03:00 beginnt der neue fachliche Lerntag. Das Vorziehfenster gilt für Queue und laufende Sitzung aller Stapel, ist standardmäßig 20 Minuten und wird durch 0 deaktiviert. Der Wochenrhythmus bietet je Wochentag `Normal`, `Weniger` oder `Minimal`; sieben gleiche Werte sind neutral. Diese Werte werden weder in Stapel kopiert noch von Lernprofilen verändert.
- Die unveränderlichen Vorlagen `Standard`, `Intensiv` und `Entspannt` setzen neue Karten, tägliche Wiederholungen und maximales Intervall auf `20 / 200 / 1.000`, `30 / 300 / 365` beziehungsweise `10 / 100 / 2.000`. Sie enthalten außerdem die Position neuer Karten sowie deren Sortierung nach Alter oder stabilem Lerntagszufall und die Sortierung fälliger Karten nach Überfälligkeit oder Abrufwahrscheinlichkeit. Eigene benannte Lernprofile sind konto-weite Vorlagen, werden aber ausschließlich in den Stapeleinstellungen verwaltet. `Auf diesen Stapel anwenden` kopiert ihre Werte und Herkunftsversion in genau einen Stapel; es gibt keine Live-Vererbung. Direkte Änderungen machen den Stapel zu `Eigene Einstellungen`. Umbenennen, Aktualisieren oder bestätigtes Löschen einer Vorlage verändert keinen anderen Stapel; eine neuere Inhaltsversion wird an älteren Kopien sichtbar und kann bewusst erneut angewandt werden.
- Ohne bewusste Änderung der beiden Tagesgrenzen in den Stapeleinstellungen bleibt die geplante Sitzungsgröße stabil.
- Ein normaler Lernstart und eine direkt geladene Review-URL bereiten die Queue vor der Navigation in den Vollbildmodus vor. Ist sie leer, bleibt die Ausgangsansicht sichtbar und ein Informationsdialog meldet `Keine fälligen Karten`; bei durch Tageslimits blockierten fälligen Karten lautet der Titel `Tageslimit erreicht`. Sind ungenutzte neue Karten vorhanden, öffnet `Neue Karten pro Tag anpassen` denselben Stapel gezielt beim fokussierten Feld `Neue Karten pro Tag`, ohne den Wert automatisch zu ändern. Sonst bietet der Dialog ausschließlich `Schließen`.
- Das Ende nennt die beantwortete Anzahl und führt gezielt zum URL-kodierten Ausgangspunkt zurück. Warten ausschließlich Learning-/Relearning-Wiederholungen außerhalb des Vorziehfensters, endet die aktuelle Runde stattdessen mit `Für jetzt geschafft`; die Karten bleiben `Offen` und es gibt keinen Countdown oder Hintergrundtimer.
- Ein Review-Reload erhält Reviewdeck und den allowlist-basierten Rückkontext `today`, `learn` oder `decks`; eine freie Rück-URL wird nicht akzeptiert.
- Review aus der Kartenverwaltung kehrt zu demselben Deck und derselben Karte zurück, Review aus Lernen zu demselben Lern-Deckkontext.
- Browser-Zurück und -Vorwärts rekonstruieren View, Deck, Karte und Reviewkontext ohne zusätzliche History-Schleifen.
- Unbekannte oder nicht verfügbare Deck- und Karten-IDs zeigen verständliche deutsche Folgeaktionen und öffnen niemals still eine andere Karte.
- Nach erfolgreichem Save, Verlassen des Stapels, Reload und Sync wird der Lernfortschritt ohne separaten Sitzungssnapshot aus den gespeicherten Review-Events und Review States rekonstruiert.
- Offline- oder Konfliktzustände werden sichtbar und niemals als gespeichert ausgegeben, solange Änderungen ausstehen.

### 5.5 CoRe-Variante lernen und Ursprung prüfen

Geeignete Learning Items können nach ausreichender Reife als konservative Umformulierungen erscheinen. Die Herkunft bleibt bis zur Antwort verborgen.

Akzeptanz:

- Nicht geeignete Inhalte wie sehr kurze Vokabelkarten können von Variation ausgeschlossen werden.
- Jede Variante ist an genau ein Original gebunden.
- Nach der Antwort einer KI-Umformulierung kann die zugrunde liegende Karte kompakt eingeblendet werden.
- Fehlerhafte oder unklare Varianten können deaktiviert oder kontrolliert gemeldet werden.
- Persönliche Reviewdaten gelangen nicht in geteilte Varianten oder Feedbackobjekte.
- Bei fehlender oder fehlerhafter Variante bleibt das Original sicher lernbar.

### 5.6 Lernlogik verstehen

Ein Fragezeichen neben dem Theme-Schalter öffnet die direkt verlinkbare Hilfeseite `/hilfe` im normalen App-Shell-Inhaltsbereich. Ein kurzer Einstieg ordnet CoRes Ziel ein. Beispielhafte Kartenstapel verwenden dort ein gemeinsames HTML-Muster mit austauschbarem Inhalt: Im Light Mode liegt eine weiße Vorderkarte über einer nach links oben gedrehten hellblauen und einer nach rechts oben gedrehten dunkleren blauen Karte. Im Dark Mode wechseln Vorderkarte, beide blauen Ebenen, Text, Trennlinie und Rahmen gemeinsam auf ihre dunklen Gegenstücke, ohne Ebenenfolge oder Kontrastabstufung zu verlieren. Einstiegs- und Originalkartenstapel verwenden dieselbe responsive mittlere Breite und Höhe; alle drei Ebenen eines Stapels sind gleich groß und folgen demselben Radius-, Abstands- und Schattenvertrag. Der Einstiegsstapel fragt, welche Grundsätze CoRe für möglichst nachhaltiges Lernen nutzt. `Grundsätze`, `nutzt CoRe`, `Lernen` und `nachhaltig zu gestalten` tragen eine pinke Textmarkierung; die gelben Pfeile verbinden `Active Recall → Smarter Recall` sowie `Spaced Repetition → Content Repetition`. Zwei anschließende Scrollgeschichten erklären erst den wechselnden Abrufreiz und danach die FSRS-Lernkurve, ohne Workspace- oder Schedulerzustand zu verändern.

Akzeptanz:

- Die Erklärung nennt Abrufwahrscheinlichkeit `R`, Stabilität `S`, Schwierigkeit `D`, Zielerinnerung, Intervall, Original und Variante in verständlicher deutscher Sprache. Sie erklärt `S` als die Zeit, in der `R` von 100 auf 90 Prozent fällt, und zeigt die Kette von Bewertung über Gedächtniszustand und Vergessensprognose zum nächsten Termin.
- Die erste Methodenüberschrift lautet ausschließlich `Active Recall`. Ihre Geschichte besitzt drei aufeinanderfolgende Textschritte und eine rahmenlose Kartenvisualisierung: Zuerst zeigt sie das gemeinsame Beispielstapel-Muster mit lesbarer Originalkarte und orange hervorgehobenen Schlüsselstellen, danach dieselbe vertraute Form mit verpixeltem neutralem Fragetext und schließlich zwei deutlich versetzte Variantenkarten mit derselben Antwort und gelben Sternen in den Ecken. Beim Verpixeln bleiben Textfluss, Zeilenumbrüche, Trennlinie und Antwort exakt an ihrer vorherigen Position. Die nicht aktiven Textschritte bleiben gut lesbar. Ab Desktopbreite bleibt die Kartenvisualisierung beim Scrollen innerhalb dieses Abschnitts stehen und wechselt synchron zum aktiven Textschritt; darunter bleibt die Abfolge linear. Einstiegs- und Originalkartenstapel verwenden bei gleicher Viewportbreite dieselbe Größe, Ebenenfolge, Farbpalette, gegenläufige Drehung und seitliche Staffelung; ausschließlich der Inhalt variiert.
- Die beiden Methodeneinträge im Einstieg sind als Abschnittsnavigation bedienbar. Beide oberen Linien bleiben im Ruhezustand dünn; nur der mit Maus oder Tastatur fokussierte Eintrag erhält kräftigere Schrift und eine stärkere obere Linie. Beide Einträge scrollen mit derselben Dauer in einer durchgehend flüssigen, deutlich wahrnehmbaren Bewegung zu ihrer Methodenüberschrift; bei reduzierter Bewegung erfolgt der Wechsel unmittelbar. Der Weg zu `Spaced Repetition` darf im Bereich der Active-Recall-Unterschritte keinen abrupten Positionssprung enthalten. Auf kleineren Ansichten scrollt die Navigation das Dokument, ab Desktopbreite den eigenen Inhaltsbereich.
- Die Hilfeseite erklärt, dass FSRS-6 alle Reviews einschließlich mehrerer Abrufe am selben Tag berücksichtigt und 21 Modellparameter verwendet. CoRe nutzt die offiziellen Standardparameter; persönliche Optimierung ist noch nicht aktiviert. Höhere Zielerinnerung wird transparent als mehr Reviews bei geringerem Vergessensrisiko beschrieben.
- CoRe erklärt Variantenbereitschaft als Reifeentscheidung aus erfolgreichen Abrufen, Stabilität, Intervall, Abrufwahrscheinlichkeit und Fehlerverlauf. Ausreichende Stabilität kann eine nahe Variante erlauben, aktuelle Fehler führen konservativ zum Original oder zu einer einfacheren Variante zurück; eine feste Reviewnummer wird nicht versprochen.
- Eine eigenständige, als vereinfacht gekennzeichnete Lernkurve führt zuerst zu einer gemeinsamen Wiederholung und fächert danach in die vier Antwortpfade `Nochmal`, `Schwer`, `Gut` und `Leicht` mit unterschiedlich langen Stabilitätsintervallen auf. Die vier Intervallpfeile zeigen nach rechts. Am Ende des längsten Beispielintervalls folgt eine weitere Wiederholung mit einer nahen CoRe-Variante; ein Kreis mit `…`, die Beschriftung `x. Wiederholung · Variante` und der Stern oberhalb der oberen Markierung an der gestrichelten Wiederholungslinie verdeutlichen, dass daraus keine garantierte Scheduler- oder Variantenschwelle entsteht. Zwei diagonale Striche kennzeichnen die unterbrochene Y-Achse; ein zusätzlicher Ausschnitt-Hinweis wird nicht angezeigt.
- `R` ist an Kurven und Zielerinnerung, `S` an den vier bewertungsabhängigen Intervallspannen und `D` als langsam veränderlicher Einfluss an den beiden Wiederholungspunkten sichtbar. Die Darstellung bleibt qualitativ und erfindet keine scheinbar exakten Zustandswerte.
- Die Spaced-Repetition-Geschichte führt in zehn Textschritten durch Grundidee, erste Wiederholung, die vier Antwortpfade, die beispielhafte Variantenwiederholung und `R`, `S` sowie `D`. Ab Desktopbreite bleibt das Diagramm innerhalb dieses Abschnitts stehen und hebt beim Seiten-Scrollen den jeweils erklärten Teil hervor; auf kleineren Ansichten erscheinen Diagramm und Schritte linear. Es gibt keinen verschachtelten vertikalen Scrollcontainer.
- Kurvenabschnitte reagieren zusätzlich auf Mausberührung. Die beiden Wiederholungspunkte sowie die `R`-, `S`- und `D`-Texte sind per Maus, Touch und Tastatur auswählbar und führen zum zugehörigen Textschritt.
- Farbe ist nie der einzige Bedeutungsträger; Beschriftung, Strichstärke, Symbole, Fokuszustand und statische Textdefinitionen bleiben erhalten. Begriffe, Reviewübersicht und Bewertungen verwenden eine ruhige Textgliederung mit Trennlinien statt wiederholter Kartenflächen.
- Die mobile Darstellung begrenzt horizontales Scrollen auf den Grafikbereich, deaktiviert die Sticky-Zweispaltenprojektion und erzeugt keinen Dokument-Overflow.
- Die offizielle FSRS-Einführung ist als externer weiterführender Link gekennzeichnet.

### 5.7 Lernfortschritt über simulierte Tage prüfen

Der direkt verlinkbare `/simulator` ist unter `Globale Einstellungen → Lerntag & Fokus` neben dem Pomodoro-Timer erreichbar. Er verschiebt die lernbezogene App-Zeit für die vorhandenen Accountkarten von „Heute“ aus minuten- oder tageweise um bis zu 3.650 Kalendertage in die Zukunft. Das Umstellen der Zeit verändert keine Karte; ein am simulierten Zeitpunkt ausgeführtes Review ist dagegen ein echtes Review und wird mit diesem Zeitpunkt gespeichert und synchronisiert.

Akzeptanz:

- „Heute“, `+10`, `+15` und `+30 Minuten`, `+1`, `+2` und `+4 Stunden`, „Morgen“, `+3`, `+7`, `+14` und `+30 Tage`, einzelne Tagesschritte und ein begrenztes Datumsfeld sind per Tastatur erreichbar. Die simulierte lokale Uhrzeit bleibt sichtbar. Vergangene oder mehr als 3.650 Tage entfernte Werte werden auf den gültigen Bereich begrenzt.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Review verwenden denselben simulierten Lernzeitpunkt für Fälligkeit, Queue, Heatmaps, Variantenreife, Intervallvorschau und Bewertung.
- Bei aktivem Zukunftszeitpunkt bleibt der Zustand in der App-Shell und im Vollbild-Lernmodus sichtbar. Während einer laufenden Lernsitzung wird die Zeit nicht umgeschaltet.
- Der Offset bleibt lokal und transient. Reload und Logout stellen „Heute“ wieder her; Sync-, Auth-, Medien-, Autosave- und normale Bearbeitungsmetadaten verwenden unverändert die echte Systemzeit.
- Die Aktion „Heute“ setzt ausschließlich die simulierte Uhr zurück. Bereits gespeicherte Zukunftsreviews, Kartenfortschritt und daraus berechnete nächste Termine bleiben erhalten.

## 6. Funktionale Anforderungen

### 6.1 Account und Einstellungen

- E-Mail-/Passwort ist die freigegebene Kernanmeldung.
- Das sichtbare und aktive Profil enthält Anzeigename und Login-E-Mail. Hochschule, Fachgebiet und eine Spracheinstellung sind nicht Teil des aktiven Profilmodells; die Oberfläche bleibt global deutsch. Solange die Community-Funktion deaktiviert ist, erscheint kein separater Privatsphäre-Bereich.
- Globale Einstellungen sind in `Konto`, `Lerntag & Fokus`, `Daten & Synchronisierung` und den abschließenden Bereich `Über uns` gegliedert. Stapeleinstellungen verwenden `Stapel`, `Tagesrunde & Lernprofile` und `Scheduler & CoRe`. Beide Seiten besitzen einen direkten Querlink und dieselbe iconunterstützte Seiteninhaltsnavigation: Ab 1.280 px steht eine vertikale Sticky-Rail neben dem Inhalt, darunter zeigt ein Sticky-Disclosure nur den aktuellen Abschnitt und klappt alle Bereiche auf. Scrollspy markiert genau einen Abschnitt; explizite Auswahl verwendet reproduzierbare Hashlinks und Browser-Zurück.
- `Über uns` verlinkt über die bestehende App-Navigation auf `/hilfe`, zeigt `Impressum` und `Datenschutzerklärung` ohne Scheinaktion als `In Vorbereitung` und nennt die aktuelle Paketversion mit vorangestelltem `v`. Diese Versionsnummer erscheint in keiner anderen Oberfläche; Login und Fehlerfallback zeigen weder Version noch Umgebung oder Commit.
- Sobald ein globales oder stapelbezogenes Einstellungsfeld vom letzten gespeicherten Seitenzustand abweicht, erscheint seitenweit genau eine kompakte, nichtmodale Leiste `Ungespeicherte Änderungen` im unteren Viewportbereich. Sie hebt sich mit einer lokal stärkeren Tiefenstufe ab, ordnet Status und Aktion auf breiten Ansichten nebeneinander sowie mobil untereinander an und bietet ausschließlich `Speichern`. Die Aktion übernimmt sämtliche Änderungen der Seite gemeinsam und ist während des Speicherns gesperrt. Erfolg schließt die Leiste und meldet genau einmal `Globale Einstellungen wurden gespeichert.` beziehungsweise `Stapeleinstellungen wurden gespeichert.`; Validierungs- und Speicherfehler lassen sie offen und erscheinen beim betroffenen Bereich.
- App-Navigation, Querlinks, Zurück, Stapelwechsel, Abmelden und Browser-Zurück/Vorwärts werden bei ungespeicherten Einstellungen abgebrochen. Lernprofil-CRUD, `Auf diesen Stapel anwenden`, manueller Sync und die Lerneinstellungen einer Kartensitzung behalten ihre unmittelbaren eigenen Aktionen.
- Tagesbeginn, Vorziehfenster und Easy Days sind accountweite Scheduler-Präferenzen und werden über Profil-Sync transportiert.
- Sicherheitskritische Aktionen sind klar von Profil- und Lernoptionen getrennt.

### 6.2 Deck-Hierarchie

- Decks können Eltern- und Unterstapel bilden.
- Hierarchie bleibt beim unterstützten APKG-Import erhalten.
- Dashboard und Lernen projizieren denselben kanonischen, lokal einklappbaren Stapelbaum als flache Folge kompakter Stapelzeilen; Elternkennzahlen aggregieren sämtliche Unterstapel. Die Kartenverwaltung projiziert dieselbe Zeilendarstellung innerhalb der gruppierten Gesamttabelle.
- Lernen und Kartenverwaltung bleiben getrennte, lazy geladene Aufgabenoberflächen mit einem gemeinsamen kanonischen Deckkontext und erscheinen als zwei Bereiche derselben Hauptseite `Lernen`. Der segmentierte Wechsel verwendet die bestehende Navigation; nur `Lernen` ist Teil der Hauptnavigation, während `/kartenstapel` direktlinkfähig bleibt.
- Dashboard und Lernen erlauben direktes Drag-and-drop für Parent-/Child-Zuordnung und Outdent zur Hauptebene. Karten bietet dieselbe fachliche Mutation über einen expliziten bestätigten Ablauf an.
- Direktes Drag-and-drop ist in Dashboard und Lernen eine Desktop-Interaktion für Maus und Trackpad und markiert während der Geste keinen Zeilentext. In der Kartenverwaltung sowie für Touch, Tastatur und assistive Bedienung gilt der bestätigte Verschiebeablauf; manuelle Elternauswahlen und Verschiebeziele bieten keine fünfte sichtbare Ebene an.
- Die Suche hilft bei großen Bibliotheken; die Kartenverwaltung bietet keinen zusätzlichen Modusfilter.
- Stapelname, Icon, Farbe, Tagespensum, die drei Selects `Kartenreihenfolge`, `Neue Karten sortieren` und `Fällige Karten sortieren`, Schedulerwerte, CoRe-Modus, `Varianten einsetzen ab Lernstufe` mit den festen Stufen 81, 121 und 181 XP sowie `Aktive Varianten pro Karte` mit 1, 2 oder 3 Varianten bilden einen gemeinsamen Stapeleinstellungsentwurf und werden atomar über die seitenweite Einstellungsleiste übernommen. Die verständliche Reviewpriorität heißt `Wahrscheinlich vergessen zuerst`. Unter dem Reviewlimit erklärt der Text, dass es fällige, tagesübergreifende Lern- und neue Karten umfasst und Wiederholungen Vorrang haben. CoRe-Modus und Variantenparameter gehören nicht zu Lernprofilen und bleiben bei einem Profilwechsel unverändert. Seitentitel, Zurück-Button und Quernavigation bleiben auch bei 390 px vollständig sichtbar.
- Ohne ausgewählten Stapel zeigt die Route eine vorhandene, bei großen Bibliotheken suchbare Stapelauswahl statt eines Fehlerzustands. Neue Stapel erhalten materialisierte Standardwerte; importierte Stapel behalten ihre wirksamen Werte.
- Löschen eines Baums ist destruktiv, bestätigt und darf gelöschte Inhalte nicht durch späteren Sync reaktivieren.

### 6.3 Import

- Dokumentierte statische Anki-Templates werden mit exakten Feldnamen, Conditionals, Standardfiltern, `FrontSide`, Special Fields, Cloze und CSS in einem opaken Sandbox-Frame gerendert. Script, externe Ressourcen, Add-on-/Custom-Filter und andere nicht portable Funktionen werden nicht ausgeführt; Quellwerte bleiben erhalten und die UI zeigt automatisch eine gekennzeichnete geordnete Feldansicht mit Diagnose.
- Importfehler bleiben sichtbar und enthalten eine sinnvolle nächste Aktion.
- Die sichtbare Importsteuerung unterscheidet `idle`, `analyzing`, `preview`, `committing`, `syncing_cloud`, `syncing_media`, `succeeded`, `partial`, `failed_retryable`, `failed_terminal` und `cancelled`.
- Die laufenden APKG-Phasen `analyzing`, `committing`, `syncing_cloud` und `syncing_media` zeigen in der Dateizeile einen eigenen monotonen Fortschritt. Geglättete Zwischenwerte bleiben unter 100 Prozent; 100 Prozent bedeutet immer, dass die jeweilige Phase tatsächlich abgeschlossen ist.
- Warnungen werden zunächst zusammengefasst und vollständig aufklappbar angeboten; Notetype-IDs, SHA-1-Listen und Importidentitäten erscheinen nicht in der Produktoberfläche.
- APKG-Dateien bis einschließlich 250 MB werden lokal verarbeitet. Größere Dateien enden sofort mit einer verständlichen Meldung und `Andere Datei auswählen`; es gibt keinen Serverjob oder Upload-Fallback.
- Reimport erkennt stabile Anki-Identitäten vor heuristischen Fingerprints.
- APKG-`revlog` wird als append-only Analysehistorie übernommen, soweit eine Anki-Karte eindeutig einer CoRe-Variante zugeordnet werden kann, und beim Wiederimport deterministisch dedupliziert. Für den initialen Review State gilt unabhängig davon die Reihenfolge gültiger FSRS-Memory-State, chronologisches Revlog-Replay, klassischer Kartenstatus und schließlich neue Karte; nach dem ersten CoRe-Review übernimmt ausschließlich FSRS-6.
- Medienreferenzen werden sicher aufgelöst; fehlende Medien werden im Bericht genannt.

### 6.4 Manuelle Erstellung und Quellen

- Karten können ohne Dokumentquelle erstellt werden.
- Bilder können an der aktuellen Cursorposition in Rich-Text- und Zusatzfelder eingefügt werden; Bild-Bytes bleiben im accountgebundenen Medienspeicher und die Karte persistiert nur stabile Referenzen.
- Mehrere Karten nacheinander zu erstellen ist der Standardfluss; gespeicherte Karten bleiben bei einem später verworfenen Entwurf erhalten.
- Pinning steuert ausschließlich den Reset nach erfolgreichem Speichern. Es gibt kein Cloud-Autosave für ungespeicherte Entwürfe.
- Aus einem lesbaren Dokument kann Text in Vorder- oder Rückseite übernommen werden.
- Eine Dokumentauswahl wird nach dem Übernehmen nicht als eigenes Quelldokument gespeichert.
- Rich Text wird vor Speicherung und Darstellung sanitisiert.
- Jede reale Anki-Image-Occlusion-Karte wird als eigenständige Karte importiert und sicher dargestellt. Ein manueller Maskeneditor ist kein Bestandteil dieses Ausbaus.

### 6.5 Review und Scheduling

- Review verwendet vier Bewertungen und einen intern gekapselten FSRS-6-Schedulervertrag mit offiziellen Standardparametern.
- `Gut` geht genau einen konfigurierten Lernschritt weiter und wechselt erst am letzten Schritt in den langfristigen FSRS-Reviewzustand. `Leicht` beendet die Lernphase jederzeit sofort und erhält das unverändert von `ts-fsrs` berechnete Reviewintervall; `Nochmal` und `Schwer` folgen ebenfalls der Standard-Lernschrittstrategie von `ts-fsrs`.
- Eine laufende Sitzung arbeitet zuerst ihre eindeutigen Karten ab und zeigt anschließend berechtigte Learning-/Relearning-Wiederholungen. Der gestartete Sitzungsstapel bestimmt das Vorziehfenster einheitlich für seinen gesamten Unterbaum. Ein Termin darf nur am selben lokalen beziehungsweise simulierten Lerntag und strikt weniger als das Fenster vorgezogen werden; Reviewkarten werden nie vorgezogen. Ein früherer noch nicht berechtigter FIFO-Eintrag blockiert keine spätere berechtigte Wiederholung.
- Reviewkarten werden tageweise über ihren fachlichen Fälligkeitstag freigegeben. Learning und Relearning behalten minutengenaue Termine; ihr Vorziehfenster darf den fachlichen Lerntag nicht überschreiten. Eine manuell auf einen künftigen Lerntag gesetzte New-, Learning-, Relearning- oder Reviewkarte bleibt bis zu diesem Lerntag vollständig zurückgestellt; ab dann gelten wieder Phasenlogik, Tageslimits und Vorziehfenster. Intraday-Schritte umgehen Tageslimits, tagesübergreifende Lernschritte verbrauchen Reviewbudget. Für eine gestartete Baumrunde müssen der Kartenstapel und alle aktiven Vorfahren Budget besitzen; direkte Unterstapelstarts ignorieren äußere Vorfahren. Reviews belegen das gemeinsame Reviewbudget vor neuen Karten. Sind Karten ausschließlich durch Limits verborgen, nennt Start oder Abschluss `Tageslimit erreicht` und weist die Anzahl fälliger und neuer Karten aus.
- Easy Days verändert ausschließlich neu berechnete Review-Tagesintervalle von 3 bis 90 Tagen. Der Scheduler wählt innerhalb des offiziellen FSRS-Fuzz-Fensters anhand der accountweiten 90-Tage-Last und der globalen Tagesstufe; `Normal`, `Weniger` und `Minimal` besitzen die Gewichte 1, 0,5 und 0,0001. Bei Gleichstand gewinnt die geringste Abweichung vom FSRS-Rohintervall und danach der frühere Termin. Nur `dueAt` und das tatsächliche Intervall ändern sich; FSRS-Stabilität, Schwierigkeit und Zielerinnerung bleiben unverändert. Vorschau und Commit verwenden dieselbe Lastmomentaufnahme und DST-sichere Kalenderaddition.
- Die Tagesprojektion berücksichtigt das Vorziehfenster auch nach Verlassen und erneutem Öffnen der Sitzung. Ein Vorziehen über die Tagesgrenze ist ausgeschlossen.
- Nutzer sehen verständliche Intervalle, nicht interne Schedulerzustände.
- KI-Umformulierungen teilen ausschließlich den Review State und Termin ihrer Karte; sie besitzen keinen eigenen Lernstatus.
- Der Scheduler darf keine KI-Erzeugung im Antwortrequest auslösen.
- Der Reviewmodus misst die reale Zeit von der Kartendarstellung bis zur Bewertung monoton und auf höchstens 60 Sekunden begrenzt im vorhandenen Review Event. Simulierte Lernzeitpunkte verändern diese Dauer nicht.
- Die transiente Simulationsuhr darf durch bloßes Umstellen keinen Workspace-, Cloud- oder Kartenstatus verändern. Bewertungen im Zukunftsmodus verwenden jedoch absichtlich den simulierten Zeitpunkt und durchlaufen den normalen Workspace-, Statistik- und Sync-Pfad.

### 6.6 Vertrauen, Änderungsprotokoll und Undo

- Karteninhalte sind direkt prüfbar; es gibt keinen wiederherstellbaren Kartenversionsverlauf.
- Manuelle Neuplanung ändert ausschließlich `dueAt` und die technische Aktualisierungszeit. Sie erhält Phase, Lernschritt, Intervalle, Wiederholungen, Difficulty, Stability, Ease, letzten echten Reviewzeitpunkt, Core-/FSRS-Werte und Inhaltsrevisionen. Genau ein `ReviewEvent` mit `rating: "manual"` hält alten und neuen Termin fest, ist nicht wiederherstellbar und zählt nicht als Lernen, Tagesfortschritt oder FSRS-Bewertung.
- Es gibt keinen Kartenversionsverlauf und keine Funktion zum Wiederherstellen früherer Karteninhalte.
- Ein unmittelbares Karten-Undo nimmt den bestehenden Soft-Delete-Tombstone revisionsgeprüft zurück; es erzeugt weder eine neue Karte noch einen zweiten Review State.
- Importfehler dürfen nicht zum Verlust des letzten verlässlichen Inhalts führen.

### 6.7 Statistik

- Eine einzige globale Filterleiste steuert alle Bereiche außer dem eigenständigen Zeitraum der Lern-Heatmap: `30 Tage`, `90 Tage`, `1 Jahr` oder `Gesamt` sowie gesamte Sammlung, einen Stapel oder mehrere Stapel. Standard ist `Gesamte Sammlung · 1 Jahr`; ausgewählte Oberstapel schließen Unterstapel dedupliziert ein. Eingeschlossene Unterstapel bleiben über Auswahlfläche und rechten Haken markiert und deaktiviert, ohne zusätzliche Hinweiszeile; `Gesamte Sammlung` bleibt als eigene erste Auswahl erhalten.
- Unterhalb der globalen Filterleiste gliedert die gemeinsame responsive Seiteninhaltsnavigation die Statistik in `Überblick`, `Lernaktivität`, `Planung & Kartenbestand`, `FSRS-Gedächtnismodell`, `Antwortverhalten` und, sofern sichtbar, `Stapelvergleich`. Ab 1280 px bleibt sie als vertikale, bei Bedarf scrollbar bleibende Sticky-Rail links sichtbar; darunter verwendet sie das gemeinsame kompakte Sticky-Disclosure. Der Überblick liegt in einer umrandeten Inhaltsfläche und zeigt seine sieben Kennzahlen ohne Icons als kompakte, rand- und schattenlose graue Kennzahlflächen im selben Format wie die Kennzahlen der Zeitplanung.
- Historische Bereiche zeigen Übersicht, gestapelte Wiederholungen, gemessene Lernzeit mit Abdeckung, hinzugefügte Karten, die gemeinsame Lern-Heatmap, Antwortzeitpunkt, Antwortknöpfe, wahre Erinnerungsquote und Stapelvergleich. Die Heatmap folgt ausschließlich dem globalen Stapel-Scope und steuert ihren Zeitraum lokal über `Woche`, `Monat` oder `Jahr`; Standard sind die letzten sieben fachlichen Lerntage bis heute. In der Wochenansicht stehen Wochentagskürzel und Datum gemeinsam semibold in einer Zeile, beispielsweise `Fr, 14.8.`. Monat und Jahr zeigen vollständige Kalenderzeiträume, Pfeile wechseln jeweils einen ganzen Zeitraum, und das vollständige Jahresraster scrollt auf schmalen Ansichten horizontal. Farbauswahl, Zeitraumsteuerung und Pfeile bilden mit einheitlichem Abstand eine feste Gruppe; der Farbauslöser trägt denselben neutralen Außenrand wie die Zeitraum-Pill. Streak und Steuerungsgruppe stehen ab 36 rem Heatmapbreite in einer Zeile, darunter springt die gesamte Gruppe dauerhaft unter den Titel, ohne dass die Farbauswahl separat stehen bleibt oder bei weiterer Verkleinerung zurückspringt. Der Titel zeigt den aktuellen Streak der ausgewählten Stapel; ein Lerntag zählt, sobald mindestens ein valides Review mit beliebiger Bewertung gespeichert wurde, und der sichtbare Zeitraum begrenzt den Streak nicht. Von morgen bis einschließlich Tag +365 zeigt eine getrennt normalisierte Grauskala die aktuell gespeicherte nächste Fälligkeit jedes aktiven Learning Items genau einmal; Varianten, Entwürfe, gelöschte, ausgesetzte und vergrabene Karten zählen nicht. Dunkleres Grau bedeutet mehr voraussichtlich fällige Karten, ohne angenommene Bewertungen oder Folgetermine zu simulieren. Die Pfeile navigieren bis zum vollständigen Zeitraum mit Tag +365; spätere Resttage sind abgeblendet und als außerhalb der Prognose beschriftet. Die `Weniger`-bis-`Mehr`-Legende erklärt weiterhin ausschließlich vergangene Aktivität. Ihre browserlokal für Dashboard und Statistik gemeinsame Grundfarbe ist über ein 2-mal-2-Raster auf die semantischen Lernstatusfarben `Gelernt`, `Neu`, `Offen` und `Fällig` beschränkt; CoRe-Lila (`Neu`) ist der Standard, ungültige gespeicherte Werte werden ohne Migrationspfad darauf normalisiert und alle Intensitätsstufen werden aus der gewählten Farbe abgestuft. Prognose-Grauskala und blauer Heute-Rahmen bleiben von der Auswahl unberührt. Die wahre Erinnerungsquote verwendet nur die erste geeignete Wiederholung einer Variante je fachlichem Lerntag und verlangt ein vorheriges Intervall von mindestens einem Tag. Ändert sich der Tagesbeginn, werden historische Reviews dynamisch neu gruppiert. Ein separat geführter Schwierigkeitsstatus wird weder aus CoRe-Bewertungen abgeleitet noch in der Statistik angezeigt; der numerische FSRS-Parameter Schwierigkeit bleibt davon unberührt.
- Planung zeigt Rückstand, künftige Fälligkeiten, kumulierten Verlauf und geschätztes tägliches Arbeitspensum. Der globale Zeitraum ist ihr Zukunftshorizont.
- Status, FSRS-Schwierigkeit, Stabilität und aktuelle Abrufwahrscheinlichkeit sind vollständige Momentaufnahmen der ausgewählten Stapel und tragen `Stand heute`. Der Zeitraum begrenzt bei Intervallen nur den sichtbaren Bereich.
- Historische Kategorien werden aus dem Schedulerzustand vor der Antwort als Lernen, Wiederlernen, Jung oder Reif bestimmt; Reif beginnt bei 21 Tagen. Klassische Anki-Leichtigkeit wird nicht als aktuelle CoRe-Metrik ausgegeben.
- Diagramme verwenden begrenzte, adaptive Zeitgruppen, zugängliche Textlegenden und strukturierte Details für Maus, Touch und Tastatur. Fehlende Historie, Zeitmessung oder Stichprobe wird erklärt; die Oberfläche erfindet keine Nullwerte oder Aktivität.

## 7. Zurückgebauter Produktscope

Chat-your-Deck, Lernplan, lokaler KI-Entwurf, Deck-Graph, Community-Demo, KI-Job-Historie, allgemeiner externer Varianten-JSON-Flow und serverseitiger APKG-Import sind entfernt. Davon ausgenommen ist ausschließlich die authentifizierte, textbasierte Basic-Variantenroute `/api/ai/card-variant`; sie besitzt keine eigene Navigation, Jobhistorie oder Persistenz neben der bestehenden Variantenmutation.

## 8. Visueller Produktvertrag

- Die produktive UI verwendet die CoRe-Palette Slate `#6F7E9E`, Mist `#A9B5C7`, Cloud `#DDE3EC`, Coral `#E28B68`, Lilac `#D6A3D2`, Marigold `#E4BF63` sowie die vorbereiteten Dark-Werte Midnight `#181D25`, Graphite `#262E3A`, Highlight `#8FA0BF`, Coral Glow `#F0A07E`, Lilac Glow `#E4B5E1` und Golden Glow `#F0CC77` ausschließlich über semantische Theme-Rollen.
- Light und Dark Mode verwenden denselben vollständigen semantischen Tokensatz. Ein normaler, zugänglicher Iconbutton in der responsiven App-Shell wechselt explizit zwischen beiden Modi über `data-core-theme`; Sonne beziehungsweise Mond zeigen den aktuellen Modus, während der zugängliche Name die ausgelöste Aktion beschreibt. Theme und Timer bleiben lokal im Browser erhalten. Es gibt keine automatische Aktivierung über die Systempräferenz.
- Angemeldete App-Shell, Login, Sitzungsprüfung, lokale Datenübernahme und sicherer Fehlerzustand füllen ohne äußeren Kartenrahmen, Außenradius oder Schatten mindestens den gesamten dynamischen Viewport. Fachliche Panels bleiben erhalten; der horizontale innere Inhaltsabstand beträgt responsiv 10, 16 beziehungsweise 24 px.
- Unter 1280 px ersetzt eine schwebende, Safe-Area-fähige Bottom Bar die Sidebar. Sie bleibt unabhängig von Seitenlänge und vertikaler Browser-Scrollbar mit stabiler Breite am unteren Viewportrand sichtbar. Ihre vier direkten Ziele sind `Heute`, `Lernen`, `Erstellen` und `Statistik`; die Kartenverwaltung wird über die Bereichsauswahl in `Lernen` geöffnet. Ein kompakter Kopf zeigt den zu `Heute` navigierenden Schriftzug `CoRe`, bei aktivem Timer dessen kleinen Fortschrittsbalken sowie rechts die einzeilige gemeinsame Utility-Gruppe aus Sync, umrundetem Theme-Button, Hilfe und Einstellungen. Eine aktive Simulation bleibt in der eigenen Statuszeile sichtbar. Ab 1280 px verwendet CoRe eine 9,5 rem breite Sidebar ohne Markenunterzeile; auch dort navigiert der Schriftzug `CoRe` zu `Heute`. Ihre trennlinienlose Utility-Gruppe steht ohne horizontalen Scrollpfad in einem festen 2-mal-2-Raster mit identischem Zeilen- und Spaltenabstand: Sync und Hilfe oben, Einstellungen und Theme unten. Das Fragezeichen öffnet `/hilfe` direkt und besitzt dort einen eigenen aktiven Zustand; nur Einstellungen und Simulator teilen den aktiven Einstellungszustand. Eine Profilvorschau erscheint dort nicht.
- Dekorative Rahmenlinien sind bewusst heller und zurückhaltender als interaktive Feld-, Auswahl- und Fokusgrenzen.
- Primäre, sekundäre, tertiäre und destruktive Actions sowie Info-, Erfolgs-, Warn- und Fehlerzustände besitzen produktweit einheitliche Hover-, Active-, Focus- und Disabled-Zustände. Bedeutung bleibt durch Text, Icon oder Zahl zusätzlich zur Farbe erkennbar.
- Gewöhnliche einzeilige Buttons, Icon-Aktionen, Eingaben und Auswahlfelder verwenden produktweit eine Mindesthöhe beziehungsweise ein Touchziel von `44 × 44 px`. Fachliche Großflächen wie MCQ-Antworten und Reviewratings dürfen höher bleiben.
- Selbsterklärende Einstellungsfelder verwenden ihren eindeutigen Titel ohne wiederholenden Untertitel. Hinweise bleiben nur sichtbar, wenn sie Folgen, Abwägungen, Warnungen oder nicht offensichtliches Verhalten erklären.
- Fachliche Inhalte, Warnungen und Folgeaktionen bleiben ohne generische Disclosure-Flächen dauerhaft sichtbar. Ausklappbar bleiben nur zweckgebundene Navigation, Hierarchien und kompakte Werkzeugsteuerungen, deren Zustand selbst Teil der Interaktion ist.
- Modale Bestätigungsdialoge behandeln Escape und einen Klick direkt auf den abgedunkelten Hintergrund wie ihre Abbrechen-Aktion; Klicks innerhalb des Dialogs oder eines zugehörigen Auswahl-Overlays schließen ihn nicht. Abbrechen bestätigt, verwirft oder verändert keine Fachdaten und stellt den vorgesehenen Fokus wieder her.
- Auswahlfelder verwenden produktweit denselben symmetrisch gepolsterten Trigger und ein erhöhtes, abgerundetes CoRe-Overlay. Gewählte und fokussierte Optionen bleiben zusätzlich zur Farbe durch eine sichtbare Markierung und vollständige Tastaturbedienung erkennbar.
- Kurze, abgeschlossene Erfolgsmeldungen erscheinen produktweit als schließbares Overlay oben rechts mit Erfolgsicon und zugänglicher Schließen-Aktion. Nach zehn Sekunden blenden sie sich mit einer kurzen, ressourcenschonenden Deckkraft-/Transformationsanimation automatisch aus; bei reduzierter Bewegung entfällt der sichtbare Übergang. Auf schmalen Viewports halten sie den Seitenabstand ein und umbrechen ohne horizontales Hauptscrolling. Fehler, laufende Vorgänge sowie Ergebnisse mit Details oder Folgeaktionen bleiben im fachlichen Kontext sichtbar.
- Stapelgruppen verwenden dauerhaft die einfachen, gerahmten Flächen `--core-group-depth-0` bis `--core-group-depth-4`: Hauptstapel verwenden die ungefüllte Oberflächenfarbe von Depth 0 ohne Schatten, die drei interaktiv anlegbaren Unterebenen jeweils Depth 1 bis 3. Tiefere Importe verwenden Stufe 4. Die Skala wird im Light Mode mit zunehmender Tiefe dunkler und im Dark Mode spiegelbildlich heller. Hover füllt die vorhandene Zeilenfläche neutral; Auswahl, Fokus und Drop-Ziele reagieren weiterhin am bestehenden Außenrand, ohne einen eingerückten Layer oder eine erhöhte Stapelfläche zu erzeugen.
- Stapelkarten in Dashboard und Lernen zeigen in fester Reihenfolge ausschließlich die disjunkten, durch das verbleibende Tagesbudget begrenzten Kennzahlen `Neu`, `Offen` und `Fällig`: `Neu` umfasst die ausgewählten New-Karten, `Offen` heute anstehendes Learning und Relearning einschließlich noch nicht vorziehbarer Schritte, `Fällig` die ausgewählten Reviewkarten mit erreichtem Fälligkeitszeitpunkt. Ausgesetzte und vergrabene Karten zählen nirgends. Die Textfarben verwenden dieselben zentralen Pink-, Orange- und Gelb-Rollen wie der Tagesfortschritt und die Bewertungsbuttons `Nochmal`, `Schwer` und `Gut`; eine sichtbare Gesamtzahl erscheint nicht. Unter 44 rem tatsächlich verfügbarer Zeilenbreite werden die drei sichtbaren Labels zugunsten der einzeiligen Kompaktform ausgeblendet; ihre zugänglichen Namen bleiben erhalten. Ab dieser Breite bleiben die Labels sichtbar. Stapelköpfe der Kartenverwaltung projizieren diese Kennzahlen weder sichtbar noch assistiv.
- Der Gesamtfortschrittsdonut in Dashboard und Lernen verwendet für `Neu`, `Offen`, `Fällig` und `Gelernt` dieselben Pink-, Orange-, Gelb- und Blau-Rollen wie der Tagesfortschritt und die Bewertungsbuttons `Nochmal`, `Schwer`, `Gut` und `Leicht`. Seine exakten SVG-Segmente beginnen bei zwölf Uhr, besitzen innen, außen und untereinander die dünne semantische Rahmenlinie und lassen im transparenten Zentrum stets die tatsächliche Light-/Dark-Tiefenfläche des Stapels sichtbar. Ein Bestand ohne aktive Karten zeigt einen neutralen Leer-Ring; die zugängliche Beschriftung nennt Gesamtzahl und alle vier Werte. Stapelköpfe der Kartenverwaltung rendern keinen Donut.
- Amulya definiert die visuellen Überschriftenstufen `36/44`, `28/36` und `22/30`; Synonym definiert Body Large `16/24`, Body und Controls `14/20` sowie Caption und Statuslabel `12/16`. Semantische HTML-Ebene und visuelle Stufe dürfen voneinander abweichen.
- Bestehendes Karten-HTML und persistierte benutzerdefinierte Farben werden nicht umgeschrieben. Neue oder ungültige Stapeldarstellungen verwenden Slate `#6F7E9E`. Stapel-Icons erscheinen produktweit rund mit Symbol und Rand in der gewählten Farbe sowie einer dezenten transparenten Flächentönung derselben Farbe. In den Stapel-Einstellungen zeigt der Seitentitel das aktuelle Icon in seiner Farbe und den gespeicherten Stapelnamen. Der Bereich `Stapel` enthält Namensfeld, das zugängliche 5-mal-5-Raster mit 25 repräsentativen Lucide-Icons und den runden Farbkreis; alle drei Werte gehören ohne eigene Speichern-Aktion zum gemeinsamen Seitendraft. Rich-Text-Schnellfarben stammen weiterhin aus der CoRe-Palette.

Der auffindbare, nicht verpflichtende Wiederverwendungsvertrag für neue Features steht im [`src/ui`-Katalog](../src/ui/README.md). Vorhandene Module sollen verwendet werden, wenn ihre Schnittstelle die Fachsemantik erhält; fachlich abweichende Controls dürfen lokal bleiben und nutzen dennoch dieselben Theme-, Typografie-, Fokus- und Disabled-Rollen.

### Synchronisierung

- Ein vollständiger Sync-Zyklus schreibt zuerst lokale IndexedDB-Transaktionen, überträgt danach ausschließlich vorgemerkte Outbox-Mutationen, lädt anschließend alle Cloud-Deltas seit den gespeicherten `sync_change_id`-Cursorn und aktualisiert zuletzt Konflikt- und Statusdaten. Ein Konflikt blockiert nur seine Entität; konfliktfreie Geschwister und Reviews laufen weiter.
- Manuelles Synchronisieren führt immer den vollständigen Upload-und-Download-Zyklus aus. Automatisch läuft derselbe Zyklus nach kurz entprellten lokalen Änderungen, bei wiederhergestellter Verbindung, erneutem Fokus und sichtbar alle 1, 5, 15 oder 30 Minuten; Standard sind 5 Minuten. `Aus` bedeutet ausschließlich manueller Sync. Automatik gehört nur zum aktiven angemeldeten Account und endet bei Logout oder Accountwechsel.
- Der sichtbare Sync-Button in Desktop-Navigation und mobilem Kopf zeigt synchronisiert, ausstehend, laufend, offline oder die Konfliktanzahl. `Daten & Synchronisierung` zeigt Intervall, letzten Erfolg, ausstehende Änderungen und den primären manuellen Sync.
- `revision` ist ausschließlich die fachliche Inhaltsversion. Geräte-, Zeit-, Zähler-, Importzusammenfassungs-, Eigentümer- und Schedulerprojektionen erzeugen allein keinen Inhaltskonflikt. Karteninhaltswrites erhalten den aktuellen Cloud-Lernstand; Varianteninhaltswrites erhalten ihre Performance.
- Reviewereignisse sind unveränderlich und idempotent. Beide Geräteereignisse bleiben erhalten, Reviewwrites verändern weder Stapel- noch Inhaltsrevisionen und nur das zeitlich jüngste Ereignis projiziert den Lernstand. Inhaltsbearbeitung und paralleles Review derselben Karte werden ohne Benutzerkonflikt zusammengeführt.
- Neuplanungen werden als manuelle Reviewereignisse über dieselbe offline persistente `review-atomic`-Outbox und `record_review_atomic` wie Bewertungen übertragen. Die Ereignis-ID macht Wiederholungen idempotent; bei zeitlich konkurrierenden Reviews und Neuplanungen bestimmt die jeweils spätere Aktion ausschließlich den projizierten Termin, während alle gültigen Reviewereignisse erhalten bleiben.
- Für die aktuelle Konfliktmenge zeigt CoRe die Folgen beider Richtungen als hinzugefügte, aktualisierte und entfernte Stapel, Karten und Varianten. `Dieser Browser` oder `Cloud im Account` betrifft ausschließlich diese Konflikte; konfliktfreie Inhalte, Reviews und Medien bleiben erhalten. Vor Ausführung wird die Vorschau gegen aktuelle Remote-Revisionen geprüft. Der Einzelauflöser bleibt eingeklappt verfügbar.
- Konfliktkarten sind bis zur Entscheidung aus der Lernwarteschlange ausgeschlossen und in der Kartenverwaltung mit `Synchronisierung klären` markiert. Nicht übertragene Änderungen bleiben bei Reload oder Browserende sicher in IndexedDB; ein letzter Website-Sync ist nur bestmöglich und wird nicht als garantiert dargestellt.
- Nach der einmaligen Accountprüfung wird ein vorhandener lokaler Workspace angezeigt, bevor Bootstrap, Deltas, Konflikte und Medien fertig sind. Ein eingerichtetes Gerät darf bei fehlendem Netz mit derselben persistierten Supabase-Sitzung offline kalt starten; es existiert weiterhin kein lokaler Login.
- Ein neuer Browser wartet nur auf die erste gültige, höchstens 200 KiB große Bootstrap-Seite aus Deck-Hüllen und Statistiken. Schlägt sie fehl, zeigt CoRe einen Wiederholen-Zustand und niemals einen vermeintlich leeren Account. Weitere Hüllen und der Kartenkatalog werden fortsetzbar im Hintergrund geladen; vollständige Reconciliation blockiert keine Navigation.
- Kartenverwaltung zeigt vorhandene 50er-Previewseiten sofort und ergänzt online per serverseitiger Suche, Sortierung und Keyset-Pagination. Erst Öffnen oder Direktlink lädt den vollständigen Kartenkörper; bei einem Fehler bleiben Preview und Wiederholen-Aktion sichtbar. Offline durchsucht CoRe transparent nur den vorhandenen Katalog.
- Lernen bestimmt die Reihenfolge aus dem Katalog. Bei normaler Verbindung werden bis zu 50 Körper vorbereitet und bei 25 verbleibenden Karten nachgeladen; bei Datensparmodus oder langsamer Verbindung beträgt der Puffer fünf. Die Runde darf mit der ersten verfügbaren fälligen Karte starten. Nach Netzausfall läuft der Puffer weiter und pausiert danach sichtbar, ohne eine fällige nicht geladene Karte zu überspringen.
- `Öffnen` erzeugt einen automatisch bereinigbaren Cache. `Offline verfügbar machen` lädt Karten, KI-Varianten, Darstellungsvorlagen und Medien fortsetzbar in 50er-Paketen und setzt den Zustand erst nach Anzahl-, Revisions- und Hashprüfung auf verfügbar.
- Ab 80 Prozent geschätzter Browserquote entfernt CoRe ungepinnte, bestätigte Kartenkörper und Medien nach LRU bis höchstens 70 Prozent. Deck-Hüllen, Summaries, Katalog, Outbox, Konflikte, Downloads und aktive Lernkarten werden nicht bereinigt. Ein unvollständiger Katalog bleibt sichtbar als lokal eingeschränkter Zustand.
- Statistiken werden aus serverseitigen Aggregaten geladen und lokal gecacht; lokale noch nicht bestätigte Bewertungen ergänzen sie optimistisch, manuelle Neuplanungen jedoch nicht. Vor einem APKG-Reimport werden bestehende betroffene Stapel vollständig hydriert.
- Die Kartenverwaltung lädt höchstens 50 Tabellenzeilen je Seite. Eine Lernsitzung wartet nur auf den ersten benötigten Kartenkörper, füllt danach im Hintergrund einen Puffer von höchstens 50 Karten und fordert bei 25 verbleibenden Karten die nächste 50er-Seite an. Vollständige Stapel dürfen weder für App-Start noch Kartenliste oder Lernstart materialisiert werden.
- Nach lokaler Bereitschaft dürfen Stapelübersicht und Kartenverwaltung vorsichtig im Hintergrund vorbereitet werden. Save-Data, 2G, unsichtbarer Tab oder neue Nutzerinteraktion verhindern weitere Hintergrundarbeit. Andere Hauptziele werden nur durch Hover, Fokus oder Touchstart vorbereitet; APKG, PDF, Statistik, Simulator und große Medien nie pauschal.
- Die Einstellungen zeigen, ob der Browser persistenten lokalen Speicher gewährt hat, sowie belegten und verfügbaren Speicher. Die PWA cached die App-Shell; Browsermedien bleiben selektiv und eine Eviction kann ohne persistente Freigabe nicht ausgeschlossen werden.

## 9. Nichtfunktionale Anforderungen

### Sicherheit und Datenschutz

- Accountdaten und Inhalte sind durch RLS und Ownership geschützt.
- Service-Secrets bleiben außerhalb des Browsers.
- Logs enthalten keine Secrets.
- Unvalidierte externe Payloads werden nicht direkt persistiert.

### Accessibility

- Kernflows sind per Tastatur bedienbar.
- Wichtige Zustände werden nicht nur durch Farbe vermittelt.
- Dialoge und Overlays besitzen nachvollziehbare Fokusreihenfolge und -wiederherstellung.
- Bei 200 % Zoom bleibt der Kernflow ohne horizontales Hauptscrolling bedienbar.
- Bewegungen beachten `prefers-reduced-motion`.

### Viewports und Sprache

- Primärer Zielviewport ist 1440 × 900 px, Desktop-Mindestziel 1280 × 720 px.
- Unter 1280 px besitzt CoRe den kompakten App-Modus mit Kopf und Bottom Bar; ab 1280 px gilt die Sidebar-Darstellung. Fachliche Komponenten wählen ihre interne Dichte anhand der tatsächlich verfügbaren Containerbreite und behalten ihre jeweils dokumentierten internen Scrollbereiche.
- Nutzertexte sind korrektes Deutsch mit Unicode-Schreibweise. Technische Bezeichnungen gelangen nicht ungefiltert in die UI.

### Zuverlässigkeit

- Asynchrone Kernflows besitzen Lade-, Fehler-, Retry- und Erfolgszustände.
- Aktive Parserfehler werden nicht durch stille Fallbacks verdeckt.
- Pending- und Konfliktzustände überleben Reload accountgebunden.
- Ein Produktrelease braucht die Betriebsfreigabe aus [`operations.md`](operations.md), ändert dadurch aber nicht diesen Produktvertrag.

### Performance

- LCP liegt am 75. Perzentil bei höchstens 2,5 Sekunden, INP bei höchstens 200 Millisekunden, CLS bei höchstens 0,1 und TTFB bei höchstens 800 Millisekunden.
- Ein wiederkehrendes oder offline eingerichtetes Gerät erreicht den lokalen Workspace p75 in höchstens 1,5 Sekunden und p95 in höchstens 3 Sekunden. Ein neues Gerät erreicht den Stapel-Bootstrap p75 in höchstens 3 Sekunden; der Vollabgleich läuft danach weiter.
- Eine sichtbare Tab- oder Reviewreaktion beginnt in höchstens 100 Millisekunden. Vorgeladene Tabs sind p75 in höchstens 300 Millisekunden und p95 in höchstens 750 Millisekunden vollständig bereit; nicht vorgeladene Tabs p75 in höchstens 1 Sekunde und p95 in höchstens 2 Sekunden.
- Erste Seite eines 100k-Stapels und Lernstart liegen p75 bei höchstens 1 Sekunde und p95 bei höchstens 2 Sekunden. Ein Review ist lokal p95 innerhalb 250 Millisekunden dauerhaft gespeichert. Normaler Delta-Sync liegt p75 bei höchstens 2 Sekunden und p95 bei höchstens 5 Sekunden und ist nie startblockierend.
- Initiales JavaScript zielt auf höchstens 250 KiB gzip und darf 300 KiB nicht überschreiten. Ein normaler Feature-Tab zielt auf 150 KiB und darf 200 KiB gzip nicht überschreiten. Bootstrapdaten bleiben unter 200 KiB komprimiert und enthalten keine Kartenkörper oder Medien. Hintergrundarbeit wird in Portionen von höchstens 50 Millisekunden geteilt.

## 10. Beta-Abnahme

Der Beta-Kern gilt als erfüllt, wenn:

1. alle fünf Kernjourneys automatisiert und manuell bestehen;
2. ein neuer Account, kleiner Import, manuelle Erstellung, Review und Reload ohne Entwicklerwissen bedienbar sind;
3. eine Variante vor dem Reveal nicht erkennbar ist;
4. keine Labs-Navigation, Labs-Route oder ausgemusterte API ausgeliefert wird;
5. keine sichtbare Einstellung eine nicht vorhandene Wirkung verspricht;
6. die Zielviewports, Tastatur, Screenreader, Zoom, lange Inhalte und mindestens ein realistischer Fehlerfall abgenommen sind;
7. keine Blocker oder ungeklärten hohen Reibungsverluste aus moderierten Tests verbleiben;
8. automatisierte Tests konkrete Produkt- und Sicherheitsverträge schützen, ohne Testanzahl als Produktabnahme zu behandeln.

Offene Gates und Evidenz stehen ausschließlich in [`todo.md`](todo.md).

## 10. Nichtziele des Beta-Kerns

- Community, Rankings oder soziale Leistungsmetriken;
- generische Backend-, Auth- oder LLM-Adapter;
- externe KI-Chat- oder breite beziehungsweise multimodale Kartenerstellung jenseits der Basic-Variantenroute;
- vollständiges Admin-Portal, Zahlungen oder Abonnements;
- native Store-Apps oder Push-Benachrichtigungen;
- KI-Bildvariation, breiter OCR-Worker oder vollständige Anki-Template-Ausführung.

## 11. Eindeutige Verweise für frühere Abschnittsrollen

Die frühere Sammelspezifikation enthielt zusätzliche Rollen. Diese Inhalte sind nicht entfallen, sondern haben jetzt genau eine kanonische Quelle:

- früherer Implementierungsstand und technischer Implementierungsanhang: [`status.md`](status.md)
- früheres Datenmodell, Architektur und Invarianten: [`architecture.md`](architecture.md)
- frühere API-Spezifikation: [implementierte und geplante APIs](architecture.md#7-api-vertrag)
- früheres Preview-/Production-/Rollback-Runbook: [`operations.md`](operations.md#3-preview--und-production-freigabe)
- frühere Release-Nachweise und Testzählungen: [`history.md`](history.md)
- frühere Produkt- und Architekturentscheidungen: [`decisions.md`](decisions.md)
- früherer Backlog und nächste Schritte: [`todo.md`](todo.md)

### 14.2.2 Preview-Smoke und Production-Rollback-Runbook

Dieser frühere Anker verweist auf das kanonische [Betriebsrunbook](operations.md#3-preview--und-production-freigabe).

### 19. Offene Entscheidungen

Entscheidungen stehen ausschließlich in [`decisions.md`](decisions.md); offene Umsetzungsarbeit ausschließlich in [`todo.md`](todo.md).

### 27. Technischer Implementierungsanhang

Der aktuelle Ist-Stand steht in [`status.md`](status.md), Modulgrenzen und technische Invarianten in [`architecture.md`](architecture.md).
