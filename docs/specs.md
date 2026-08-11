# CoRe — Produktvertrag und Kernjourneys

**Rolle:** einzige kanonische Quelle für Produktversprechen, Kernjourneys, funktionale Anforderungen und Produktabnahme.
**Status:** Arbeitsfassung
**Stand:** 2026-08-11

Diese Spezifikation beschreibt ausschließlich, was CoRe für Nutzer leisten soll. Aktuelle Implementierung, Architektur, Betrieb, Entscheidungen, Verlauf und offene Roadmap haben eigene Quellen in der [Dokumentenlandkarte](index.md).

---

## 1. Produktvision

CoRe erweitert klassische Spaced Repetition um inhaltliche Wiederholung. Lernende sollen Inhalte auch bei veränderter Fragestellung abrufen, statt Layout, Wortlaut oder Lückenposition wiederzuerkennen.

CoRe startet Anki-kompatibel, bleibt beim Lernen ruhig und fokussiert und macht Varianten durch Original- und Quellenanker überprüfbar.

### Zielgruppen

- Studierende und Auszubildende mit großen, langfristig gepflegten Kartenbeständen;
- Anki-Nutzer, die vorhandene Stapel weiterverwenden wollen;

### Kernnutzen

1. Bestehende und neue Lerninhalte schnell in ein gemeinsames Modell bringen.
2. Eine ruhige, vorhersehbare Review-Sitzung mit vier Bewertungen anbieten.
3. Geeignete reife Inhalte kontrolliert variieren.
4. Nach der Antwort einer Variante das Original und, wenn vorhanden, die Quelle als Vertrauensanker zeigen.
5. Nutzerinhalte accountgebunden, nachvollziehbar und portabel halten.

## 2. Produktprinzipien

1. **Anki-kompatibel starten:** APKG-Import und bekannte Kartenformen senken die Einstiegshürde.
2. **Originale bleiben Anker:** Jede Variante gehört zu genau einem Learning Item und dessen Original.
3. **Review first:** Varianten sind vor der Antwort nicht als solche erkennbar.
4. **Lernen bleibt privat:** Stapel und Reviewdaten sind accountgebunden und werden nicht veröffentlicht.
5. **Stapelweise steuerbar:** Content Repetition kann pro Stapel aus, automatisch oder manuell sein.
6. **Sparsam ausbauen:** Nicht jede Karte wird variiert; neue Produktflächen brauchen einen belegten Core-Auftrag.

## 3. Produktreife

### Core

- E-Mail-/Passwort-Account und verständlicher leerer Zustand;
- Heute-Dashboard und klarer Lernstart;
- APKG im freigegebenen Größenbereich, Text, CSV und Tabellenimport;
- manuelle Stapel- und Kartenerstellung;
- Karten- und Stapelverwaltung;
- Review mit vier Bewertungen und Content-Repetition;
- direkt erreichbare Hilfe zu FSRS, CoRe und Kartenvarianten;
- Originalanker nach der Antwort einer Variante und Quellenanker, wenn vorhanden;
- accountgebundene Speicherung, Sync- und Konfliktstatus;
- grundlegende Statistik und verständliche Einstellungen.

### Entfernt

CoRe besitzt keine experimentellen Produktoberflächen. Frühere Labs-Routen fallen auf `Heute` zurück und begründen keinen Kompatibilitätsvertrag.

### Disabled

- APKG über 250 MiB; solche Dateien werden lokal abgewiesen;
- Google und Magic Link, wenn ihr jeweiliges eigenes Auth-Flag deaktiviert ist;
- DOCX, OCR und Bildregionen;
- vollständige Art.-15-Auskunft und Account-Löschung.

Die dauerhafte Entscheidung und ihre Konsequenzen stehen in [ADR-001](decisions.md#adr-001--core-labs-und-disabled). Der heutige Projektionsstand steht in [`status.md`](status.md).

## 4. Domänensprache

| Begriff | Produktbedeutung |
| --- | --- |
| Deck / Stapel | Hierarchisch organisierte Sammlung von Learning Items und Lernoptionen |
| Learning Item | Kanonischer Lerninhalt mit Feldern, Tags, Quellen und Variantenfamilie |
| Originalvariante | Vertrauenswürdige reviewbare Darstellung des kanonischen Inhalts |
| Card Variant | Weitere reviewbare Darstellung desselben Learning Items |
| Review State | Persönlicher Schedulingzustand einer reviewbaren Einheit |
| Review Event | Unveränderliches Ereignis einer Bewertung |
| Quellenanker | Stabile Fundstelle in Dokument oder Importquelle |
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

### 5.2 Stapel importieren oder manuell anlegen

Nutzer wählen zwischen manueller Erstellung und Import.

Akzeptanz:

- APKG, Text, CSV und Tabellen-Paste sind ohne Kenntnis interner Anki-Begriffe auffindbar.
- Unterstützte Quellanhänge sind PDF, Text, Markdown, CSV und TSV; nicht lesbare Formate sind nicht auswählbar.
- APKG wird zuerst analysiert. Vorschau und `Import übernehmen` sind getrennte Schritte.
- Der Hauptbericht nennt Datei, Stapel, Karten, vorhandene und fehlende Medien sowie verständliche Warnungen.
- Notetype-IDs, Template-Ordinals, Hashes und Importidentitäten dominieren den Hauptflow nicht.
- Ein Wechsel zwischen APKG, Text, CSV und Tabelle verwirft die vorherige Vorschau, Commitfähigkeit, Fehler und Fortschritte vollständig.
- Abbruch, erneut versuchbarer Fehler, terminaler Fehler, Teilabschluss und Erfolg sind getrennte Zustände mit jeweils passender Folgeaktion.
- Ein erfolgreicher Flow endet mit einem konkreten Ziel wie `Jetzt lernen`, `Karten prüfen` oder `Zur Bibliothek`.
- Bei manueller Erstellung bleibt der Editor nach `Speichern` geöffnet. Angeheftete Felder bleiben erhalten, andere Felder werden geleert, das Zieldeck bleibt gewählt und der Fokus springt deterministisch in das erste freie Pflichtfeld.
- Zielauswahlen zeigen vollständige hierarchische Stapelpfade. Erst `Fertig` öffnet den Abschluss mit Sitzungsanzahl, Zielpfad, `Jetzt lernen` und `Karten prüfen`.
- Interne Navigation mit einem nichtleeren fachlichen Entwurf verlangt eine eigene Bestätigung. `Weiter bearbeiten` erhält Inhalt und Fokus; `Verwerfen und verlassen` verwirft nur den aktuellen Entwurf.

### 5.3 Karten bearbeiten und eine Sitzung starten

`Lernen` ist der primäre schnelle Einstieg in eine Sitzung. `Karten` ist die fünfte Hauptseite und die direktlinkfähige Verwaltungsoberfläche für alle Karten, Stapelstruktur, Inhalt, Versionen und erweiterte Optionen. Die bestehende Route bleibt `/kartenstapel`; in der mobilen Bottom Bar verwendet der direkte Einstieg ebenfalls die Bezeichnung `Karten` und das Stapel-Icon.

Akzeptanz:

- Die Hauptnavigation lautet exakt `Heute`, `Lernen`, `Erstellen`, `Statistik`, `Karten`.
- `Heute`, `Lernen` und `Kartenverwaltung` verwenden dieselben Stapeldaten mit Tiefenfarbe, Chevron, Icon, Kennzahlen, segmentiertem Gesamtfortschrittsdonut und Drei-Punkte-Aktion. Die Zeile zeigt bei jeder Breite ausschließlich den einzeiligen, bei Überlänge elliptisch gekürzten Stapelnamen und niemals den Hierarchiepfad. `Heute` und `Lernen` besitzen oberhalb ihrer Stapelzeilen genau eine ungefähr 28 px hohe, nicht sortierbare Kopfzeile mit `Stapel`, `Neu`, `In Arbeit` und `Fällig`; nur bei extrem schmaler verfügbarer Panelbreite werden die drei Kennzahlen platzsparend als `N`, `IA` und `F` abgekürzt. In den Zeilen bleiben nur die vollständig zugänglich beschrifteten Zahlen sichtbar. In der Kartenverwaltung bleiben die Kennzahllabel stattdessen in jedem Stapelkopf und werden nicht in die Kartentabellenüberschrift verschoben. Die drei Zahlen sind die durch verbleibende Tageslimits begrenzte Tagesprojektion: `Neu` enthält ausgewählte neue Karten, `In Arbeit` heute anstehende Learning-/Relearning-Karten und `Fällig` ausgewählte fällige Reviewkarten. Der Donut bleibt davon unabhängig und teilt den gesamten aktiven Kartenbestand ohne Tageslimits im Uhrzeigersinn in `Neu`, `In Arbeit`, aktuell `Fällig` und `Gelernt` auf; gelernt sind Reviewkarten mit einem zukünftigen Termin. Dashboard und Lernen aggregieren Zahlen und Donut über den Teilbaum mit den Einstellungen des dargestellten Elternstapels; in der Kartenverwaltung beziehen sie sich ausschließlich auf die direkten Karten des jeweiligen Stapels. Ausgesetzte oder vergrabene Karten fehlen in allen drei Zahlen und vollständig in der Donutverteilung.
- Übersicht, Lernen und Kartenverwaltung speichern ihren jeweiligen Auf-/Zuklappzustand kontogebunden und stellen ihn nach Navigation, Reload und erneuter Anmeldung wieder her. Ohne gespeicherte Präferenz starten die Stapelsektionen der Kartenverwaltung eingeklappt; ein fokussierter Stapel beziehungsweise eine direkt verlinkte Karte öffnet die betroffene Sektion und speichert diesen Zustand. Unterstapel und die drei Ansichten bleiben voneinander unabhängig.
- Alle Stapelbäume sind innerhalb jeder Hierarchieebene alphabetisch wie in Anki sortiert. Die Reihenfolge folgt dem Stapelnamen ohne numerische Sonderbehandlung, sodass beispielsweise `Stapel 10` vor `Stapel 9` steht; jeder Elternstapel bleibt unmittelbar mit seinem separat sortierten Unterbaum zusammen.
- Die Kartentabelle zeigt pro Karte ausschließlich `Sortierfeld`, `Datum` und `Variante`. `Sortierfeld` ist die bereinigte Vorderseitenvorschau, `Datum` zeigt für unbewertete Karten `Neu` und sonst `TT.MM.JJJJ`, `Variante` unterscheidet zusätzliche aktive Varianten als `Ja` oder `Nein`.
- Ausgesetzte Karten bleiben mit unverändertem, sortierbarem Datum in der Kartenverwaltung sichtbar und erhalten über die gesamte Zeile eine semantische gelbe Warnfläche; die Auswahl bleibt zusätzlich erkennbar und assistive Technik erhält die textliche Kennzeichnung `Ausgesetzt`. Markierte Karten zeigen unmittelbar rechts neben dem `Ja`-/`Nein`-Variantenstatus einen gelb gefüllten Stern. Beide Zustände können gleichzeitig erscheinen.
- Normale Kartenzeilen und beide Tabellenkopfvarianten bleiben einzeilig und ungefähr 28 px hoch; die sortierbaren Kartenüberschriften behalten Schrift und Pfeile. Lange Sortierfelder werden visuell mit Ellipse gekürzt, bleiben aber zugänglich und im Kartendetail vollständig verfügbar. Stapelköpfe bleiben mit höchstens ungefähr 48 px einheitlich kompakt. Die Kartenverwaltung und `Aktive Stapel` erzeugen bei keiner unterstützten Breite horizontales Scrollen: Stapelnamen und flexible Zellinhalte werden elliptisch gekürzt. In der Kartentabelle erhält `Sortierfeld` den verbleibenden Platz und wird zuerst gekürzt; die drei Spaltenüberschriften sowie die Werte in `Datum` und `Variante` bleiben vollständig und ungekürzt sichtbar.
- Alle drei Spalten sind auf- und absteigend sortierbar. Standard ist `Sortierfeld` A–Z; die gewählte Sortierung gilt einheitlich für alle Stapelsektionen und wird nicht persistiert. Leere aufgeklappte Stapel zeigen `Keine Karten`.
- Suche berücksichtigt Stapelpfad, Vorderseite, Rückseite und Tags und öffnet passende Sektionen nur für die Dauer der Suche. Die Kartenverwaltung besitzt keinen zusätzlichen Modusfilter.
- Auf-/Zuklappen, Stapeloptionen und andere eigene Bedienelemente lösen die Flächenaktion nicht aus. Die Flächenaktion ist per Enter und Leertaste bedienbar und besitzt einen eindeutigen zugänglichen Namen.
- Dashboard und Lernen verwenden dasselbe Panel `Aktive Stapel`; nur das Dashboard zeigt darin `Alle ansehen`. Titel und Aktion bleiben jeweils einzeilig und wechseln nur bei extremer Platzknappheit gemeinsam in zwei Zeilen. Während eines Drags erscheint die Hauptebenen-Zone ab 44 rem Panelbreite im Panelkopf auf derselben vertikalen Achse wie diese Aktion und darunter als vollständige zweite Zeile.
- Jede Stapelgruppe besitzt dasselbe kompakte Drei-Punkte-Menü mit individuellem Icon, lokalem Stapelnamen, CoRe-Modus, `Einstellungen` und bestätigtem `Verschieben`. Der randlose 44 × 44-px-Trigger übernimmt die jeweilige Zeilenfläche und trägt den sichtbaren Tooltip `Stapeloptionen für <lokaler Stapelname>` mit einem 16 × 16-px-Abbild des farbigen Stapel-Icons. Sein zugänglicher Name behält den vollständigen Pfad, damit gleichnamige Unterstapel unterscheidbar bleiben. Auch der Tooltip `Stapel umbenennen` verwendet dieses kompakte Stapel-Icon.
- Umbenennen, Unterstapel anlegen, normales und variantenfokussiertes Lernen sowie Löschen sind ausschließlich in den Stapel-Einstellungen erreichbar. Nach einer von dort gestarteten Sitzung führt der Rückweg zum URL-reproduzierbaren Ursprung.
- Ein Kartenklick setzt Deck- und Karten-ID gemeinsam in die URL und öffnet rechts ein nicht-modales, unabhängig scrollendes Detail-`aside`. Ab 1024 px überlagert es die rechte Hälfte der Tabelle, darunter die volle Inhaltsbreite. X, Escape und ein Außenklick schließen es; ein Außenklick auf eine andere Kartenzeile wechselt nach erfolgreicher Auflösung dorthin, andere Außenklicks schließen nur. Reload sowie Browser-Zurück/-Vorwärts bleiben deterministisch und der Zeilenfokus wird nach dem Schließen wiederhergestellt.
- Wird das Kartendetail über `Karte bearbeiten` aus einer Review-Sitzung geöffnet, trägt die URL zusätzlich einen allowlist-validierten Review-Rückkontext. Der sichtbare Schließenweg führt in diese Sitzung zurück; normale Kartenverwaltungsaufrufe ohne diesen Kontext schließen weiterhin zur Kartenliste.
- Änderungen an typgerechten Kartenfeldern und Tags werden gegen den letzten gespeicherten Stand geprüft. Beim Schließen, Kartenwechsel oder interner Navigation bietet ein modaler Dialog `Speichern`, `Verwerfen` und `Weiter bearbeiten`; nur erfolgreiches Speichern beziehungsweise bewusstes Verwerfen führt die vorgemerkte Aktion aus. Temporäre Varianten- und Restore-Eingaben bleiben davon unberührt.
- Der Detailbereich zeigt den typgerechten Editor, Speichern, Kopieren und Löschen primär; Varianten, Herkunft, Versionen und Restore bleiben progressiv offengelegt. Markieren und Aussetzen sind davon unabhängige, sofort gespeicherte Lernstatus-Aktionen, sodass insbesondere eine ausgesetzte Karte direkt reaktiviert werden kann, ohne ungespeicherte Inhaltsänderungen zu übernehmen.
- Das fokussierte Deck ist in Lernen und Kartenverwaltung derselbe URL-reproduzierbare Kontext, ohne parallele lokale Deckidentität.
- Lernen-, Kartenverwaltungs- und Erstelllinks erhalten ihr Deck beziehungsweise ihre ausgewählte Karte über Reload und Direktlink.
- Stapeloptionen merken sich ihren URL-reproduzierbaren Ursprung. Der Rückweg führt zum Dashboard, nach Lernen oder zum zuvor ausgewählten Stapel und optional zur Karte; Direktlinks ohne Ursprung fallen sicher auf Lernen zurück.
- Gleichnamige Unterstapel werden in relevanten Links und Auswahlen durch ihren vollständigen Hierarchiepfad unterschieden.
- Stapelbezogene Auswahlfelder zeigen im geschlossenen Zustand Stapel-Icon und vollständigen Hierarchiepfad. Das geöffnete Feld ist eine kompakte, höchstens 320 px hohe, innerhalb jeder Hierarchieebene alphabetisch sortierte Baumliste mit nativer Seiten-Scrollbar, individuellem Stapel-Icon, einzeiligem Namen und Einrückung je Hierarchieebene; ohne tatsächlichen Überlauf nutzen Zeilenflächen die vollständige Listenbreite. Ab fünf tatsächlich auswählbaren Ober- und Unterstapeln erscheint eine Suche über den vollständigen Pfad. Sonderziele wie Hauptstapel oder Hauptebene zählen nicht zur Suchschwelle. Single- und Statistik-Multi-Select markieren ausgewählte Zeilen mit einer neutralen Auswahlfläche und einem Haken rechts. In der Statistik stehen Suche, `Gesamte Sammlung` und Stapelbaum durch Trennlinien gegliedert untereinander; eingeschlossene Unterstapel bleiben markiert und deaktiviert. Die Gruppentöne für Tiefen 0 bis 3 werden dort nicht verwendet.
- In Dashboard und Lernen verschiebt ein Drop auf eine Stapelkarte den gezogenen Baum unmittelbar als Unterstapel; ein Drop auf die sichtbare Hauptebenen-Zone im Panelkopf entfernt die Elternzuordnung. Die durchgehende neutrale Zeilenfläche reagiert nach einer kurzen Bewegungsschwelle direkt auf Maus- und Trackpad-Pointer und hält den Griff auch außerhalb der Zeilenfläche. Der gezogene Stapel wird angehoben, gültige Ziele werden mit einem verstärkten Warnfarb-Indikator markiert. Selbst-, Nachfahren- und unveränderte Ziele bleiben ohne Strukturänderung.
- Interaktiv angelegte oder verschobene Stapelbäume besitzen höchstens vier sichtbare Ebenen: Hauptstapel, Unterstapel, Unter-Unterstapel und Unter-Unter-Unterstapel. Ein zu tiefes Ziel wird ohne Mutation mit `Maximal vier Stapel-Ebenen sind möglich.` abgelehnt.
- Tiefere APKG-Hierarchien bleiben beim Import unverändert. Ihre Darstellung verwendet ab der vierten Ebene den tiefsten Gruppenton; spätere Moves müssen die Vier-Ebenen-Grenze einhalten oder den vorhandenen Baum nachweislich flacher machen.
- Ein beendeter Drag startet keine Sitzung. Erfolg, Fehler und No-op werden deutsch über eine Live-Region gemeldet; es gibt keine Bestätigung und kein Rückgängig-Angebot.
- Die Kartenverwaltung bietet kein direktes Drag-and-drop; alle drei Stapelansichten verwenden für Tastatur, Touch und assistive Bedienung denselben expliziten bestätigten Verschiebedialog.
- Kartenlöschung verwendet den kompakten Standarddialog `Karte löschen` mit `Nein` samt Kreuz und `Ja` samt Haken. `Nein`, Escape und ein Klick auf den abgedunkelten Bereich brechen ohne Löschung ab; der Außenklick schließt zusätzlich den Kartendetailbereich. `Ja` führt den lokal persistenten Soft Delete aus, schließt Dialog und Detailbereich, zeigt oben rechts den schließbaren Erfolgsbanner `Karte wurde erfolgreich gelöscht.` und bietet unmittelbar ein Undo, das denselben Datensatz samt Review State wiederherstellt. Eine ausstehende Cloud-Synchronisierung bleibt in der Outbox und blockiert den sichtbaren Löschabschluss nicht.
- Programmatische DOM-Fokusführung, Fokusfallen und Tastaturbedienung bleiben erhalten; sichtbare Fokusrahmen, Fokus-Rings und reine `focus-within`-Rahmen werden appweit nicht dargestellt. Fachliche Auswahlzustände bleiben davon unberührt.
- Stapellöschung zeigt Stapelname, Unterstapelzahl und aktive Kartenanzahl; ein Abbruch verändert nichts.
- Basic, Basic + Bilder, Reverse, Cloze und Multiple Choice laufen durch dieselbe fachliche Erstellung. Die Kartentypauswahl zeigt für jeden Typ ein eigenes Icon links vom Namen.
- Basic, Basic + Bilder und Reverse bearbeiten Vorder- und Rückseite als sanitisiertes Rich Text; Pflichtfelder werden direkt am Feld validiert.
- Basic + Bilder ergänzt unter Vorder- und Rückseitentext je ein optionales Bildfeld. Jedes Feld akzeptiert genau ein Bild per Strg+V, Drag-and-drop oder Dateiauswahl, zeigt eine Vorschau und erlaubt Ersetzen oder Entfernen.
- Reverse zeigt im normalen Review die Originalrichtung und im ausdrücklich gestarteten Variantenreview die atomar synchronisierte Rückrichtung.
- Cloze bearbeitet den kanonischen Lückentext mit sichtbarer `{{c1::…}}`-Syntaxhilfe. Speichern ist nur mit gültigen Lücken möglich; aktive Reviewvarianten entsprechen danach exakt den vorhandenen Lückengruppen.
- Multiple Choice bearbeitet Frage, mindestens zwei eindeutige Optionen, genau eine richtige Option und eine optionale Erklärung gemeinsam. Reviewanzeige und Bewertung verwenden dieselbe gespeicherte richtige Option.
- Quellenanker bleiben beim Bearbeiten erhalten und nachvollziehbar.
- Importierte Rohfelder bleiben unter den Details read-only; Quellen, Versionen und Wiederherstellung werden progressiv offengelegt.
- Eine erfolgreiche Bearbeitung erzeugt einen auditierbaren Versionseintrag; Wiederherstellung umfasst auch strukturierte Cloze- und Multiple-Choice-Inhalte.
- Lokale typgerechte Inhaltsänderungen werden bei APKG-Reimport nicht still überschrieben.
- Numerische Anki-Kartenflaggen werden beim APKG-Import und Reimport unverändert als opakes `ankiCardFlagsRaw` in den Variantenmetadaten erhalten. CoRe dekodiert oder zeigt sie nicht und bildet sie weder auf Markierung noch Aussetzung ab; lokale CoRe-Markierung und Aussetzung überleben einen Reimport.
- Strukturierte Kartenfelder überleben den accountgebundenen Cloud-Roundtrip und den Portabilitätsexport.
- Basic, Basic + Bilder, Reverse, Cloze und Multiple Choice können als eigenständiges Learning Item direkt hinter dem Ausgangselement kopiert werden. Nur die Vorderseitenrepräsentation erhält einmalig `(Kopie)`; Rückseite, Typ, strukturierte Felder, Tags und stabile Medienreferenzen bleiben erhalten. Karten-, Varianten-, Review-, Import-, Quellen- und Versionsidentitäten sowie Schedulerzustand werden neu erzeugt beziehungsweise nicht übernommen; die Ausgangskarte bleibt ausgewählt.
- Der öffentliche Karteninhalt-Vertrag besteht ausschließlich aus `editorValue: CardEditorValue` und `mediaRefs: string[]`. Er ist laufzeitvalidiert und sanitisiert und enthält weder Deck-/Karten-/Varianten-/Review-/Quellen-/Versions-IDs noch Medienbytes oder Signed URLs.
- In den progressiv offengelegten Variantenwerkzeugen kann eine Basic-Karte unmittelbar als KI-Variante umformuliert werden. Die erzeugte Form ist kein neues Learning Item, sondern eine aktive Variante auf Level 2 mit `generationSource: "ai_generated"` und demselben Originalanker; das manuelle Front-/Back-Formular bleibt erhalten.
- An den Anbieter gelangen ausschließlich der bereinigte Text von Vorder- und Rückseite mit je höchstens 1.200 Zeichen. Tags, IDs, Quellen, Reviewdaten, Metadaten, Medienreferenzen und Medieninhalte werden nicht übertragen. Nicht-Basic-Karten erklären den deaktivierten KI-Zugang.
- CoRe speichert die KI-Variante erst, wenn die Ausgangskarte während des Aufrufs unverändert blieb und dieselbe Front-/Back-Kombination noch nicht existiert. Fehler verändern das Learning Item nicht; während des Aufrufs ist die Aktion gesperrt. Bei einem kostenlosen Non-ZDR-Fallback erscheint nach Erfolg eine sichtbare Warnung.

### 5.4 Karte bewerten, neu laden und fortfahren

Vor der Antwort zeigt der Review ausschließlich den Lerninhalt und die Aktion zum Aufdecken. Nach dem Aufdecken bleiben Frage und Antwort sichtbar; vier Bewertungen aktualisieren den Lernzustand.

Akzeptanz:

- `Again`, `Hard`, `Good` und `Easy` sind per Maus und Tastatur erreichbar.
- Intervallvorschauen passen zur tatsächlich angewendeten Bewertung.
- Die vier Bewertungsflächen zeigen nach dem Aufdecken zweizeilig die große deutsche Bewertung `Nochmal`, `Schwer`, `Gut` beziehungsweise `Leicht` und darunter das dynamische Intervall; Minuten werden als `min` abgekürzt. Die Ziffern `1` bis `4` bleiben als Tastenkürzel aktiv und erscheinen ausschließlich in den gemeinsamen Tooltips `Taste 1` bis `Taste 4`.
- Vor dem Reveal erscheinen keine Herkunfts-, Varianten-, Reife- oder Schedulerhinweise.
- Oberhalb der Lernkarte steht ein beschrifteter, vollständig gefüllter Tagesfortschritt. Seine vier proportionalen Segmente zeigen von links nach rechts `Heute geschafft` in Marigold, `Neu` in Lilac, `In Arbeit` für heute anstehendes Learning und Relearning in Coral sowie `Fällig` in Slate. Jedes vorhandene Segment zeigt beim Hover einen einzeiligen Tooltip im Statistikstil mit farbigem Squircle, Bezeichnung und Kartenanzahl. Der sichtbare Zähler nennt heute geschaffte und insgesamt heute relevante Learning Items; ein zugänglicher Text nennt zusätzlich alle vier Werte einschließlich leerer Gruppen. Darunter zeigt der schlanke `Pomodoro-Timer`-Balken ohne aktiven Lauf `Nicht gestartet` und während eines Laufs die aufgerundeten ganzen Restminuten sowie den sekündlich sinkenden Anteil.
- Die dynamische Tagesgesamtmenge vereinigt die nach aktuellen Stapel- und Tageslimits ausgewählte Queue mit den am fachlichen Lerntag bereits bearbeiteten, weiterhin reviewbaren Learning Items. Eine heute beantwortete Karte zählt als `Heute geschafft`, sobald an diesem Lerntag kein weiterer Schritt ansteht. Das gilt auch für eine intern noch im Zustand Learning befindliche Karte mit nächstem Schritt morgen; am Folgetag erscheint sie wieder als `In Arbeit`. Reviewkarten sind an ihrem gesamten fachlichen Fälligkeitstag verfügbar; Varianten und Wiederholungen zählen dasselbe Learning Item nicht mehrfach.
- Die Lerneinstellungen erscheinen unter 768 px als Bottom Sheet und ab 768 px als zentriertes modales Overlay. Beide Projektionen verwenden dieselbe Reihenfolge `Karte`, `Sitzung`, gliedern die Abschnitte ohne horizontale Trennlinien durch Abstand, schließen per Escape oder Außenklick, halten den Fokus im geöffneten Dialog und stellen ihn danach wieder her.
- `Karte bearbeiten` öffnet den Einzelkarten-Editor. `Stapel bearbeiten` öffnet die Einstellungen des Sitzungsstapels und kehrt auch nach einem Reload gezielt in dieselbe Review-Sitzung zurück. Eine Anki-Flaggenauswahl wird appweit weder angeboten noch dargestellt. `Markieren` ist ein zugänglicher Stern-Button mit `aria-pressed`; der aktive Zustand ist gelb gefüllt und verändert die Lern-Queue nicht. `Aussetzen` ist ein zugänglicher, gegenüber der Fälligkeit dominierender Switch und pausiert das gesamte Learning Item einschließlich aller Varianten, ohne Lernzustand, Lernschritt, Fälligkeit, FSRS-Werte oder Reviewhistorie zu verändern. Ausgesetzte Karten fehlen in Queue, Tageszahlen, Tagesfortschritt und Donut.
- Wird die aktuelle Karte ausgesetzt, verschwindet sie ohne Bewertung und ohne Fortschrittsgewinn aus allen offenen Initial- und Wiederholungspositionen der Sitzung. Das Overlay schließt, die nächste Karte beziehungsweise der Abschluss erhält den Fokus und der dauerhaft schließbare Erfolgstoast lautet `Karte ausgesetzt. Der Lernstand bleibt erhalten. Reaktivieren unter Karte bearbeiten.` Reaktivieren verändert den Review State nicht: New bleibt neu, Learning/Relearning behält Schritt und Termin, Review behält Intervall und Termin; ein inzwischen vergangener Termin ist sofort relevant, ein zukünftiger erst zu seinem Zeitpunkt.
- `Pomodoro-Timer` klappt im Abschnitt `Sitzung` nach unten auf und bietet ausschließlich ein Feld für positive ganze Minuten sowie `Start`; Kartenreihenfolge bleibt als noch nicht verfügbar gekennzeichnet und mutiert nichts. Derselbe ausklappbare Start steht in `Globale Einstellungen → Lerntag & Fokus` zwischen Simulator und Hilfe bereit. Jeder Start ersetzt einen laufenden Countdown sofort. Es existiert accountbezogen genau ein browserlokaler Timer, der Navigation, Hintergrund, Reload und weitere Tabs über eine reale Endzeit übersteht, aber weder Cloud, Export, Deckdaten noch simulierte Lernzeit verwendet. Während des Laufs erscheint derselbe Fortschritt im Review, ab 1280 px unten in der Sidebar oberhalb der Utility-Trennlinie und darunter im kompakten Kopf zwischen `CoRe` und Utility-Gruppe. Beim Ablauf verschwinden die Shell-Projektionen und der schließbare Toast lautet `Timer abgelaufen.` Pause, Stopp, akustische Signale und Pausenzyklen werden nicht angeboten. Kartenverwaltung, Reset, Mischen und `Nur normale Karten` sind nicht Bestandteil der Lerneinstellungen.
- `Neue Karten pro Tag`, `Wiederholungen pro Tag` und die Reihenfolge werden ausschließlich in den Stapeleinstellungen bearbeitet und nicht im Sitzungs-Overlay angeboten. Die beiden Tagesgrenzen sind kompakte Ganzzahlfelder ohne Slider; `Maximales Intervall in Tagen` ist ebenfalls ein reines Ganzzahlfeld. Die sichtbaren Grenzen sind 0 bis 500 neue Karten, 0 bis 2.000 Wiederholungen und 30 bis 36.500 Tage maximales Intervall. Eine Änderung des Neulimits hebt einen alten Tages-Override auf.
- Unter `Globale Einstellungen → Lerntag & Fokus` stehen ausschließlich accountweit der Tagesbeginn von 0 bis 23 Uhr und das Vorziehfenster von 0 bis 720 Minuten. Der Tagesbeginn 0 erhält Mitternacht als Grenze; bei 3 gehört 02:59:59 noch zum Vortag und um 03:00 beginnt der neue fachliche Lerntag. Das Vorziehfenster gilt für Queue und laufende Sitzung aller Stapel, ist standardmäßig 20 Minuten und wird durch 0 deaktiviert. Beide Werte werden weder in Stapel kopiert noch von Lernprofilen verändert.
- Die unveränderlichen Vorlagen `Standard`, `Intensiv` und `Entspannt` setzen neue Karten, tägliche Wiederholungen und maximales Intervall auf `20 / 200 / 1.000`, `30 / 300 / 365` beziehungsweise `10 / 100 / 2.000`. Eigene benannte Lernprofile sind konto-weite Vorlagen, werden aber ausschließlich in den Stapeleinstellungen verwaltet. `Auf diesen Stapel anwenden` kopiert ihre Werte und Herkunftsversion in genau einen Stapel; es gibt keine Live-Vererbung. Direkte Änderungen machen den Stapel zu `Eigene Einstellungen`. Umbenennen, Aktualisieren oder bestätigtes Löschen einer Vorlage verändert keinen anderen Stapel; eine neuere Inhaltsversion wird an älteren Kopien sichtbar und kann bewusst erneut angewandt werden.
- Ohne bewusste Änderung der beiden Tagesgrenzen in den Stapeleinstellungen bleibt die geplante Sitzungsgröße stabil.
- Das Ende nennt die beantwortete Anzahl und führt gezielt zum URL-kodierten Ausgangspunkt zurück. Warten ausschließlich Learning-/Relearning-Wiederholungen außerhalb des Vorziehfensters, endet die aktuelle Runde stattdessen mit `Für jetzt geschafft`; die Karten bleiben `In Arbeit` und es gibt keinen Countdown oder Hintergrundtimer.
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
- Nach der Antwort einer Variante ist der Originalanker ausschließlich dort genau einmal kompakt über eine Aktion mit Ankersymbol erreichbar; ein Quellenanker erscheint, wenn vorhanden.
- Fehlerhafte oder unklare Varianten können deaktiviert oder kontrolliert gemeldet werden.
- Persönliche Reviewdaten gelangen nicht in geteilte Varianten oder Feedbackobjekte.
- Bei fehlender oder fehlerhafter Variante bleibt das Original sicher lernbar.

### 5.6 Lernlogik verstehen

Ein Fragezeichen neben dem Theme-Schalter öffnet die direkt verlinkbare Hilfeseite `/hilfe` im normalen App-Shell-Inhaltsbereich. Sie erklärt die FSRS-Grundbegriffe, CoRes Einsatz von FSRS-6 mit offiziellen Standardparametern und wie Content Repetition dieselbe Wissenseinheit in einer anderen Form abfragen kann.

Akzeptanz:

- Die Erklärung nennt Abrufwahrscheinlichkeit `R`, Stabilität `S`, Schwierigkeit `D`, Zielerinnerung, Intervall, Original und Variante in verständlicher deutscher Sprache. Sie erklärt `S` als die Zeit, in der `R` von 100 auf 90 Prozent fällt, und zeigt die Kette von Bewertung über Gedächtniszustand und Vergessensprognose zum nächsten Termin.
- Die Hilfeseite erklärt, dass FSRS-6 alle Reviews einschließlich mehrerer Abrufe am selben Tag berücksichtigt und 21 Modellparameter verwendet. CoRe nutzt die offiziellen Standardparameter; persönliche Optimierung ist noch nicht aktiviert. Höhere Zielerinnerung wird transparent als mehr Reviews bei geringerem Vergessensrisiko beschrieben.
- CoRe erklärt Variantenbereitschaft als Reifeentscheidung aus erfolgreichen Abrufen, Stabilität, Intervall, Abrufwahrscheinlichkeit und Fehlerverlauf. Ausreichende Stabilität kann eine nahe Variante erlauben, aktuelle Fehler führen konservativ zum Original oder zu einer einfacheren Variante zurück; eine feste Reviewnummer wird nicht versprochen.
- Eine eigenständige, als vereinfacht gekennzeichnete Lernkurve zeigt vier erfolgreiche Reviews, wachsende Intervalle und beispielhaft beim vierten Review eine nahe CoRe-Variante; daraus entsteht keine garantierte Scheduler- oder Variantenschwelle. Die durch zwei diagonale Striche unterbrochene Y-Achse kennzeichnet transparent, dass nur der Ausschnitt von 90 bis 100 Prozent gezeigt wird.
- `R` ist an Kurven und Zielerinnerung, `S` an den wachsenden Intervallspannen und `D` als langsam veränderlicher Einfluss an den Reviewpunkten sichtbar. Die Darstellung bleibt qualitativ und erfindet keine scheinbar exakten Zustandswerte.
- Kurvenabschnitte und ihre vollständigen Diagrammflächen reagieren auf Mausberührung. Die vier Reviewpunkte, die Review-Textübersicht sowie die `R`-, `S`- und `D`-Texte sind per Maus, Touch und Tastatur gekoppelt auswählbar und aktualisieren dieselbe ausführliche Erklärung unterhalb der Grafik.
- Farbe ist nie der einzige Bedeutungsträger; Beschriftung, Strichstärke, Symbole, Fokuszustand und statische Textdefinitionen bleiben erhalten. Begriffe, Reviewübersicht und Bewertungen verwenden eine ruhige Textgliederung mit Trennlinien statt wiederholter Kartenflächen.
- Die mobile Darstellung begrenzt horizontales Scrollen auf den Grafikbereich und erzeugt keinen Dokument-Overflow.
- Die offizielle FSRS-Einführung ist als externer weiterführender Link gekennzeichnet.

### 5.7 Lernfortschritt über simulierte Tage prüfen

Der direkt verlinkbare `/simulator` ist im Einstellungsbereich `App und Bedienung` neben Pomodoro-Timer und Hilfe erreichbar. Er verschiebt die lernbezogene App-Zeit für die vorhandenen Accountkarten von „Heute“ aus minuten- oder tageweise um bis zu 3.650 Kalendertage in die Zukunft. Das Umstellen der Zeit verändert keine Karte; ein am simulierten Zeitpunkt ausgeführtes Review ist dagegen ein echtes Review und wird mit diesem Zeitpunkt gespeichert und synchronisiert.

Akzeptanz:

- „Heute“, `+10`, `+15` und `+30 Minuten`, `+1`, `+2` und `+4 Stunden`, „Morgen“, `+3`, `+7`, `+14` und `+30 Tage`, einzelne Tagesschritte und ein begrenztes Datumsfeld sind per Tastatur erreichbar. Die simulierte lokale Uhrzeit bleibt sichtbar. Vergangene oder mehr als 3.650 Tage entfernte Werte werden auf den gültigen Bereich begrenzt.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Review verwenden denselben simulierten Lernzeitpunkt für Fälligkeit, Queue, Heatmaps, Variantenreife, Intervallvorschau und Bewertung.
- Bei aktivem Zukunftszeitpunkt bleibt der Zustand in der App-Shell und im Vollbild-Lernmodus sichtbar. Während einer laufenden Lernsitzung wird die Zeit nicht umgeschaltet.
- Der Offset bleibt lokal und transient. Reload und Logout stellen „Heute“ wieder her; Sync-, Auth-, Medien-, Autosave- und normale Bearbeitungsmetadaten verwenden unverändert die echte Systemzeit.
- Die Aktion „Heute“ setzt ausschließlich die simulierte Uhr zurück. Bereits gespeicherte Zukunftsreviews, Kartenfortschritt und daraus berechnete nächste Termine bleiben erhalten.

## 6. Funktionale Anforderungen

### 6.1 Account und Einstellungen

- E-Mail-/Passwort ist die freigegebene Kernanmeldung.
- Hochschule und Fachgebiet sind optionale Profildaten und blockieren keinen Lernstart.
- Globale Einstellungen sind in `Konto & Datenschutz`, `Lerntag & Fokus` und `Daten & Synchronisierung` gegliedert. Stapeleinstellungen verwenden `Stapel`, `Tagesrunde & Lernprofile` und `Scheduler & CoRe`. Beide Seiten besitzen drei responsive Bereichskarten und einen direkten Querlink.
- Tagesbeginn und Vorziehfenster sind accountweite Scheduler-Präferenzen und werden über Profil-Sync sowie Export und Import transportiert. Tageslimits, Reihenfolge, Schedulerwerte, CoRe-Modus und Variantenparameter existieren nicht in den globalen Einstellungen.
- Sprache erscheint ehrlich als read-only `Deutsch (Beta)`; ein wirkungsloser englischer UI-Modus wird nicht angeboten.
- Der Portabilitätsexport nennt vor dem Download seine Grenzen: keine Medienbytes, Authdaten, Serverrechte oder vollständige Art.-15-Auskunft.
- Sicherheitskritische Aktionen sind klar von Profil- und Lernoptionen getrennt.

### 6.2 Deck-Hierarchie

- Decks können Eltern- und Unterstapel bilden.
- Hierarchie bleibt beim unterstützten APKG-Import erhalten.
- Dashboard und Lernen projizieren denselben kanonischen, lokal einklappbaren Stapelbaum als flache Folge kompakter Stapelzeilen; Elternkennzahlen aggregieren sämtliche Unterstapel. Die Kartenverwaltung projiziert dieselbe Zeilendarstellung innerhalb der gruppierten Gesamttabelle.
- Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen mit einem gemeinsamen kanonischen Deckkontext. Beide sind Teil der Hauptnavigation; die Kartenverwaltung bleibt zusätzlich aus Lernen erreichbar.
- Dashboard und Lernen erlauben direktes Drag-and-drop für Parent-/Child-Zuordnung und Outdent zur Hauptebene. Karten bietet dieselbe fachliche Mutation über einen expliziten bestätigten Ablauf an.
- Direktes Drag-and-drop ist in Dashboard und Lernen eine Desktop-Interaktion für Maus und Trackpad und markiert während der Geste keinen Zeilentext. In der Kartenverwaltung sowie für Touch, Tastatur und assistive Bedienung gilt der bestätigte Verschiebeablauf; manuelle Elternauswahlen und Verschiebeziele bieten keine fünfte sichtbare Ebene an.
- Die Suche hilft bei großen Bibliotheken; die Kartenverwaltung bietet keinen zusätzlichen Modusfilter.
- Stapelname, Icon und Farbe liegen im responsiven Bereich `Stapel` und werden ausschließlich über `Name und Darstellung speichern` übernommen. Seitentitel, Zurück-Button und Quernavigation bleiben dadurch auch bei 390 px vollständig sichtbar.
- Die Stapel-Lernoptionen besitzen die eigenständige Aktion `Stapeleinstellungen speichern`. Sie übernimmt Tagespensum, Schedulerwerte, CoRe-Modus, `Varianten einsetzen ab Lernstufe` mit den festen Stufen 81, 121 und 181 XP sowie `Aktive Varianten pro Karte` mit 1, 2 oder 3 Varianten. CoRe-Modus und Variantenparameter gehören nicht zu Lernprofilen und bleiben bei einem Profilwechsel unverändert.
- Ohne ausgewählten Stapel zeigt die Route eine vorhandene, bei großen Bibliotheken suchbare Stapelauswahl statt eines Fehlerzustands. Neue Stapel erhalten materialisierte Standardwerte; importierte Stapel behalten ihre wirksamen Werte.
- Löschen eines Baums ist destruktiv, bestätigt und darf gelöschte Inhalte nicht durch späteren Sync reaktivieren.

### 6.3 Import

- Unbekannte Note Types werden sicher und transparent projiziert; beliebige Templates werden nicht ausgeführt.
- Importfehler bleiben sichtbar und enthalten eine sinnvolle nächste Aktion.
- Die sichtbare Importsteuerung unterscheidet `idle`, `analyzing`, `preview`, `committing`, `syncing_media`, `succeeded`, `partial`, `failed_retryable`, `failed_terminal` und `cancelled`.
- Warnungen werden zunächst zusammengefasst und vollständig aufklappbar angeboten; Notetype-IDs, SHA-1-Listen und Importidentitäten erscheinen nicht in der Produktoberfläche.
- APKG-Dateien bis einschließlich 250 MiB werden lokal verarbeitet. Größere Dateien enden sofort mit einer verständlichen Meldung und `Andere Datei auswählen`; es gibt keinen Serverjob oder Upload-Fallback.
- Reimport erkennt stabile Anki-Identitäten vor heuristischen Fingerprints.
- APKG-`revlog` wird als append-only Analysehistorie übernommen, soweit eine Anki-Karte eindeutig einer CoRe-Variante zugeordnet werden kann. Wiederimport dedupliziert deterministisch; die Historie verändert niemals aktuellen Review State, Fälligkeit oder FSRS-Planung.
- Medienreferenzen werden sicher aufgelöst; fehlende Medien werden im Bericht genannt.

### 6.4 Manuelle Erstellung und Quellen

- Karten können ohne Dokumentquelle erstellt werden.
- Basic + Bilder bietet neben den beiden Rich-Text-Feldern je ein optionales Bildfeld für Vorder- und Rückseite; Bild-Bytes bleiben im accountgebundenen Medienspeicher und die Karte persistiert nur stabile Referenzen.
- Mehrere Karten nacheinander zu erstellen ist der Standardfluss; gespeicherte Karten bleiben bei einem später verworfenen Entwurf erhalten.
- Pinning steuert ausschließlich den Reset nach erfolgreichem Speichern. Es gibt kein Cloud-Autosave für ungespeicherte Entwürfe.
- Aus einem lesbaren Dokument kann Text in Vorder- oder Rückseite übernommen werden.
- Ein Quellenanker speichert Dokument, Seite beziehungsweise Textbereich und bleibt editierbar.
- Rich Text wird vor Speicherung und Darstellung sanitisiert.
- Image Occlusion ist kein Bestandteil des Beta-Kerns.

### 6.5 Review und Scheduling

- Review verwendet vier Bewertungen und einen intern gekapselten FSRS-6-Schedulervertrag mit offiziellen Standardparametern.
- `Gut` geht genau einen konfigurierten Lernschritt weiter und wechselt erst am letzten Schritt in den langfristigen FSRS-Reviewzustand. `Leicht` beendet die Lernphase jederzeit sofort und erhält das unverändert von `ts-fsrs` berechnete Reviewintervall; `Nochmal` und `Schwer` folgen ebenfalls der Standard-Lernschrittstrategie von `ts-fsrs`.
- Eine laufende Sitzung arbeitet zuerst ihre eindeutigen Karten ab und zeigt anschließend berechtigte Learning-/Relearning-Wiederholungen. Der gestartete Sitzungsstapel bestimmt das Vorziehfenster einheitlich für seinen gesamten Unterbaum. Ein Termin darf nur am selben lokalen beziehungsweise simulierten Lerntag und strikt weniger als das Fenster vorgezogen werden; Reviewkarten werden nie vorgezogen. Ein früherer noch nicht berechtigter FIFO-Eintrag blockiert keine spätere berechtigte Wiederholung.
- Reviewkarten werden tageweise über ihren fachlichen Fälligkeitstag freigegeben. Learning und Relearning behalten minutengenaue Termine; ihr Vorziehfenster darf den fachlichen Lerntag nicht überschreiten. FSRS-Formeln und gespeicherte Zeitstempel bleiben unverändert.
- Die Tagesprojektion berücksichtigt das Vorziehfenster auch nach Verlassen und erneutem Öffnen der Sitzung. Ein Vorziehen über die Tagesgrenze ist ausgeschlossen.
- Nutzer sehen verständliche Intervalle, nicht interne Schedulerzustände.
- Varianten dürfen eigenen Review State tragen; Familieninformationen dürfen Auswahl und Fallback unterstützen.
- Der Scheduler darf keine KI-Erzeugung im Antwortrequest auslösen.
- Der Reviewmodus misst die reale Zeit von der Kartendarstellung bis zur Bewertung monoton und auf höchstens 60 Sekunden begrenzt im vorhandenen Review Event. Simulierte Lernzeitpunkte verändern diese Dauer nicht.
- Die transiente Simulationsuhr darf durch bloßes Umstellen keinen Workspace-, Cloud- oder Kartenstatus verändern. Bewertungen im Zukunftsmodus verwenden jedoch absichtlich den simulierten Zeitpunkt und durchlaufen den normalen Workspace-, Statistik- und Sync-Pfad.

### 6.6 Vertrauen, Versionen und Undo

- Originalinhalt und Quellenanker bleiben prüfbar.
- Nutzeränderungen erzeugen nachvollziehbare Versionen.
- Restore ist explizit, auditierbar und überschreibt nicht still neuere Inhalte.
- Ein unmittelbares Karten-Undo nimmt den bestehenden Soft-Delete-Tombstone revisionsgeprüft zurück; es erzeugt weder eine neue Karte noch einen zweiten Review State.
- Importfehler dürfen nicht zum Verlust des letzten verlässlichen Inhalts führen.

### 6.7 Statistik

- Eine einzige globale Filterleiste steuert alle Bereiche außer dem eigenständigen Zeitraum der Lern-Heatmap: `30 Tage`, `90 Tage`, `1 Jahr` oder `Gesamt` sowie gesamte Sammlung, einen Stapel oder mehrere Stapel. Standard ist `Gesamte Sammlung · 1 Jahr`; ausgewählte Oberstapel schließen Unterstapel dedupliziert ein. Eingeschlossene Unterstapel bleiben über Auswahlfläche und rechten Haken markiert und deaktiviert, ohne zusätzliche Hinweiszeile; `Gesamte Sammlung` bleibt als eigene erste Auswahl erhalten.
- Historische Bereiche zeigen Übersicht, gestapelte Wiederholungen, gemessene Lernzeit mit Abdeckung, hinzugefügte Karten, die gemeinsame Lern-Heatmap, Antwortzeitpunkt, Antwortknöpfe, wahre Erinnerungsquote, Stapelvergleich und schwierige Karten. Die Heatmap folgt ausschließlich dem globalen Stapel-Scope und steuert ihren Zeitraum lokal über `Woche`, `Monat` oder `Jahr`; Standard sind die letzten sieben fachlichen Lerntage bis heute. Monat und Jahr zeigen vollständige Kalenderzeiträume, Pfeile wechseln jeweils einen ganzen Zeitraum, und das vollständige Jahresraster scrollt auf schmalen Ansichten horizontal. Streak und Zeitraumsteuerung stehen ab 34 rem Heatmapbreite in einer Zeile und darunter dauerhaft in zwei Zeilen, ohne bei weiterer Verkleinerung zurückzuspringen. Der Titel zeigt den aktuellen Streak der ausgewählten Stapel; ein Lerntag zählt, sobald mindestens ein valides Review mit beliebiger Bewertung gespeichert wurde, und der sichtbare Zeitraum begrenzt den Streak nicht. Von morgen bis einschließlich Tag +365 zeigt eine getrennt normalisierte Grauskala die aktuell gespeicherte nächste Fälligkeit jedes aktiven Learning Items genau einmal; Varianten, Entwürfe, gelöschte, ausgesetzte und vergrabene Karten zählen nicht. Dunkleres Grau bedeutet mehr voraussichtlich fällige Karten, ohne angenommene Bewertungen oder Folgetermine zu simulieren. Die Pfeile navigieren bis zum vollständigen Zeitraum mit Tag +365; spätere Resttage sind abgeblendet und als außerhalb der Prognose beschriftet. Die lila `Weniger`-bis-`Mehr`-Legende erklärt weiterhin ausschließlich vergangene Aktivität, und der blaue Heute-Rahmen bleibt erhalten. Dashboard und Statistik verwenden dieselbe Darstellung. Die wahre Erinnerungsquote verwendet nur die erste geeignete Wiederholung einer Variante je fachlichem Lerntag und verlangt ein vorheriges Intervall von mindestens einem Tag. Ändert sich der Tagesbeginn, werden historische Reviews dynamisch neu gruppiert.
- Planung zeigt Rückstand, künftige Fälligkeiten, kumulierten Verlauf und geschätztes tägliches Arbeitspensum. Der globale Zeitraum ist ihr Zukunftshorizont.
- Status, FSRS-Schwierigkeit, Stabilität und aktuelle Abrufwahrscheinlichkeit sind vollständige Momentaufnahmen der ausgewählten Stapel und tragen `Stand heute`. Der Zeitraum begrenzt bei Intervallen nur den sichtbaren Bereich.
- Historische Kategorien werden aus dem Schedulerzustand vor der Antwort als Lernen, Wiederlernen, Jung oder Reif bestimmt; Reif beginnt bei 21 Tagen. Klassische Anki-Leichtigkeit wird nicht als aktuelle CoRe-Metrik ausgegeben.
- Diagramme verwenden begrenzte, adaptive Zeitgruppen, zugängliche Textlegenden und strukturierte Details für Maus, Touch und Tastatur. Fehlende Historie, Zeitmessung oder Stichprobe wird erklärt; die Oberfläche erfindet keine Nullwerte oder Aktivität.

## 7. Zurückgebauter Produktscope

Chat-your-Deck, Lernplan, lokaler KI-Entwurf, Deck-Graph, Community-Demo, KI-Job-Historie, allgemeiner externer Varianten-JSON-Flow und serverseitiger APKG-Import sind entfernt. Davon ausgenommen ist ausschließlich die authentifizierte, textbasierte Basic-Variantenroute `/api/ai/card-variant`; sie besitzt keine eigene Navigation, Jobhistorie oder Persistenz neben der bestehenden Variantenmutation.

## 8. Visueller Produktvertrag

- Die produktive UI verwendet die CoRe-Palette Slate `#6F7E9E`, Mist `#A9B5C7`, Cloud `#DDE3EC`, Coral `#E28B68`, Lilac `#D6A3D2`, Marigold `#E4BF63` sowie die vorbereiteten Dark-Werte Midnight `#181D25`, Graphite `#262E3A`, Highlight `#8FA0BF`, Coral Glow `#F0A07E`, Lilac Glow `#E4B5E1` und Golden Glow `#F0CC77` ausschließlich über semantische Theme-Rollen.
- Light und Dark Mode verwenden denselben vollständigen semantischen Tokensatz. Ein normaler, zugänglicher Iconbutton in der responsiven App-Shell wechselt explizit zwischen beiden Modi über `data-core-theme`; Sonne beziehungsweise Mond zeigen den aktuellen Modus, während der zugängliche Name die ausgelöste Aktion beschreibt. Theme und Timer bleiben lokal im Browser erhalten. Es gibt keine automatische Aktivierung über die Systempräferenz.
- Unter 1280 px ersetzt eine schwebende, Safe-Area-fähige Bottom Bar die Sidebar. Sie bleibt unabhängig von Seitenlänge und vertikaler Browser-Scrollbar mit stabiler Breite am unteren Viewportrand sichtbar. Ihre fünf direkten Ziele sind `Heute`, `Lernen`, `Erstellen`, `Statistik` und `Karten`; `Karten` verwendet das Stapel-Icon und öffnet ohne Zwischenmenü die Kartenverwaltung. Ein kompakter Kopf zeigt `CoRe`, bei aktivem Timer dessen kleinen Fortschrittsbalken sowie rechts die gemeinsame Utility-Gruppe mit dem randlosen Theme-Button links und dem umrundeten Einstellungsrad ganz rechts. Eine aktive Simulation bleibt in der eigenen Statuszeile sichtbar. Ab 1280 px bleibt die Sidebar mit denselben fünf Hauptzielen, dem Pomodoro-Fortschritt und der trennlinienlosen Utility-Gruppe erhalten; sie beginnt links auf der Icon-Flucht mit dem Einstellungsrad und setzt den Theme-Button rechts daneben. Eine Profilvorschau erscheint dort nicht.
- Dekorative Rahmenlinien sind bewusst heller und zurückhaltender als interaktive Feld-, Auswahl- und Fokusgrenzen.
- Primäre, sekundäre, tertiäre und destruktive Actions sowie Info-, Erfolgs-, Warn- und Fehlerzustände besitzen produktweit einheitliche Hover-, Active-, Focus- und Disabled-Zustände. Bedeutung bleibt durch Text, Icon oder Zahl zusätzlich zur Farbe erkennbar.
- Gewöhnliche einzeilige Buttons, Icon-Aktionen, Eingaben und Auswahlfelder verwenden produktweit eine Mindesthöhe beziehungsweise ein Touchziel von `44 × 44 px`. Fachliche Großflächen wie MCQ-Antworten und Reviewratings dürfen höher bleiben.
- Selbsterklärende Einstellungsfelder verwenden ihren eindeutigen Titel ohne wiederholenden Untertitel. Hinweise bleiben nur sichtbar, wenn sie Folgen, Abwägungen, Warnungen oder nicht offensichtliches Verhalten erklären.
- Modale Bestätigungsdialoge behandeln Escape und einen Klick direkt auf den abgedunkelten Hintergrund wie ihre Abbrechen-Aktion; Klicks innerhalb des Dialogs oder eines zugehörigen Auswahl-Overlays schließen ihn nicht. Abbrechen bestätigt, verwirft oder verändert keine Fachdaten und stellt den vorgesehenen Fokus wieder her.
- Auswahlfelder verwenden produktweit denselben symmetrisch gepolsterten Trigger und ein erhöhtes, abgerundetes CoRe-Overlay. Gewählte und fokussierte Optionen bleiben zusätzlich zur Farbe durch eine sichtbare Markierung und vollständige Tastaturbedienung erkennbar.
- Kurze, abgeschlossene Erfolgsmeldungen erscheinen produktweit als schließbares Overlay oben rechts mit Erfolgsicon und zugänglicher Schließen-Aktion; auf schmalen Viewports halten sie den Seitenabstand ein und umbrechen ohne horizontales Hauptscrolling. Fehler, laufende Vorgänge sowie Ergebnisse mit Details oder Folgeaktionen bleiben im fachlichen Kontext sichtbar.
- Stapelgruppen verwenden dauerhaft die einfachen, gerahmten Flächen `--core-group-depth-0` bis `--core-group-depth-4`: Hauptstapel verwenden die ungefüllte Oberflächenfarbe von Depth 0 ohne Schatten, die drei interaktiv anlegbaren Unterebenen jeweils Depth 1 bis 3. Tiefere Importe verwenden Stufe 4. Die Skala wird im Light Mode mit zunehmender Tiefe dunkler und im Dark Mode spiegelbildlich heller. Hover, Auswahl, Fokus und Drop-Ziele reagieren am bestehenden Außenrand, ohne einen eingerückten Hover-Layer oder eine erhöhte Stapelfläche zu erzeugen.
- Stapelkarten zeigen in fester Reihenfolge ausschließlich die disjunkten, durch das verbleibende Tagesbudget begrenzten Kennzahlen `Neu`, `In Arbeit` und `Fällig`: `Neu` umfasst die ausgewählten New-Karten, `In Arbeit` heute anstehendes Learning und Relearning einschließlich noch nicht vorziehbarer Schritte, `Fällig` die ausgewählten Reviewkarten mit erreichtem Fälligkeitszeitpunkt. Ausgesetzte und vergrabene Karten zählen nirgends. Die Textfarben verwenden dieselben zentralen Lilac-, Coral- und Slate-Rollen wie der Tagesfortschritt; eine sichtbare Gesamtzahl erscheint nicht. Unter 44 rem tatsächlich verfügbarer Zeilenbreite werden die drei sichtbaren Labels zugunsten der einzeiligen Kompaktform ausgeblendet; ihre zugänglichen Namen bleiben erhalten. Ab dieser Breite bleiben die Labels sichtbar.
- Der Gesamtfortschrittsdonut verwendet für `Neu`, `In Arbeit`, `Fällig` und `Gelernt` dieselben Lilac-, Coral-, Slate- und Marigold-Rollen wie der Tagesfortschritt. Seine exakten SVG-Segmente beginnen bei zwölf Uhr, besitzen innen, außen und untereinander die dünne semantische Rahmenlinie und lassen im transparenten Zentrum stets die tatsächliche Light-/Dark-Tiefenfläche des Stapels sichtbar. Ein Bestand ohne aktive Karten zeigt einen neutralen Leer-Ring; die zugängliche Beschriftung nennt Gesamtzahl und alle vier Werte.
- Amulya definiert die visuellen Überschriftenstufen `36/44`, `28/36` und `22/30`; Synonym definiert Body Large `16/24`, Body und Controls `14/20` sowie Caption und Statuslabel `12/16`. Semantische HTML-Ebene und visuelle Stufe dürfen voneinander abweichen.
- Bestehendes Karten-HTML und persistierte benutzerdefinierte Farben werden nicht umgeschrieben. Neue oder ungültige Stapeldarstellungen verwenden Slate `#6F7E9E`. Stapel-Icons erscheinen produktweit rund mit Symbol und Rand in der gewählten Farbe sowie einer dezenten transparenten Flächentönung derselben Farbe. In den Stapel-Einstellungen zeigt der Seitentitel das aktuelle Icon in seiner Farbe, den Stapelnamen und eine randlose Stiftaktion für die Namensbearbeitung. Eine kompakte, sichtbar mit `Icon` und `Farbe` beschriftete Kopf-Toolbar enthält das zugängliche 5-mal-5-Raster mit 25 repräsentativen Lucide-Icons, den runden Farbkreis und `Name und Darstellung speichern`; eine eigene Darstellungsbox existiert nicht. Enter im Namensfeld übernimmt weiterhin Name, Icon und Farbe zusammen. Rich-Text-Schnellfarben stammen weiterhin aus der CoRe-Palette.

Der auffindbare, nicht verpflichtende Wiederverwendungsvertrag für neue Features steht im [`src/ui`-Katalog](../src/ui/README.md). Vorhandene Module sollen verwendet werden, wenn ihre Schnittstelle die Fachsemantik erhält; fachlich abweichende Controls dürfen lokal bleiben und nutzen dennoch dieselben Theme-, Typografie-, Fokus- und Disabled-Rollen.

## 9. Nichtfunktionale Anforderungen

### Sicherheit und Datenschutz

- Accountdaten und Inhalte sind durch RLS und Ownership geschützt.
- Service-Secrets bleiben außerhalb des Browsers.
- Exporte und Logs enthalten keine Secrets.
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
- native Apps, PWA-Offline-Kaltstart oder Push-Benachrichtigungen;
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
