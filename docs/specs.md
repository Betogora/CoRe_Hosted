# CoRe — Produktvertrag und Kernjourneys

**Rolle:** einzige kanonische Quelle für Produktversprechen, Kernjourneys, funktionale Anforderungen und Produktabnahme.
**Status:** Arbeitsfassung
**Stand:** 2026-08-03

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

`Lernen` ist der primäre schnelle Einstieg in eine Sitzung. `Kartenstapel` bleibt eine getrennte, sekundäre Verwaltungsoberfläche für Struktur, Inhalt, Versionen und erweiterte Optionen; sie ist aus Lernen über `Karten verwalten` erreichbar.

Akzeptanz:

- Dashboard, Lernen und Kartenverwaltung verwenden dieselbe einklappbare Stapelkarte mit dem Icon als erstem Zeileninhalt, Name, eindeutigem Hierarchiepfad bei Unterstapeln sowie den immer sichtbaren Teilbaum-Kennzahlen `Neu`, `Fällig` und `Gesamt`.
- Jede Stapelkarte zeigt rechts von den Kennzahlen den Fortschrittsdonut und ganz rechts die Stapeloptionen. Das Dashboard zeigt den vollständigen Stapelbaum ohne feste Zeilenbegrenzung.
- In Dashboard und Lernen startet die neutrale Kartenfläche eine Sitzung. In der Kartenverwaltung wählt sie den Stapel und öffnet beziehungsweise fokussiert dessen Kartenliste und Editor.
- Auf-/Zuklappen, Stapeloptionen und andere eigene Bedienelemente lösen die Flächenaktion nicht aus. Die Flächenaktion ist per Enter und Leertaste bedienbar und besitzt einen eindeutigen zugänglichen Namen.
- Lernen besitzt keinen zusätzlichen Tabellenkopf oder separaten Lernen-Button; Donut und Stapeloptionen bleiben pro Stapel erreichbar.
- Die Kartenverwaltung zeigt Donut und Stapeloptionen in jeder Zeile. Die erweiterten Stapelwerkzeuge bleiben einmal gruppiert beim ausgewählten Stapel: CoRe-Modus, Einstellungen, Umbenennen, bestätigtes Verschieben, Unterstapel, normales und variantenfokussiertes Lernen sowie getrenntes Löschen.
- Das fokussierte Deck ist in Lernen und Kartenverwaltung derselbe URL-reproduzierbare Kontext, ohne parallele lokale Deckidentität.
- Lernen-, Kartenverwaltungs- und Erstelllinks erhalten ihr Deck beziehungsweise ihre ausgewählte Karte über Reload und Direktlink.
- Stapeloptionen merken sich ihren URL-reproduzierbaren Ursprung. Der Rückweg führt zum Dashboard, nach Lernen oder zum zuvor ausgewählten Stapel und optional zur Karte; Direktlinks ohne Ursprung fallen sicher auf Lernen zurück.
- Gleichnamige Unterstapel werden in relevanten Links und Auswahlen durch ihren vollständigen Hierarchiepfad unterschieden.
- In Dashboard, Lernen und Kartenverwaltung verschiebt ein Drop auf eine Stapelkarte den gezogenen Baum unmittelbar als Unterstapel; ein Drop auf die sichtbare freie Hauptebenen-Zone entfernt die Elternzuordnung. Die durchgehende neutrale Zeilenfläche reagiert nach einer kurzen Bewegungsschwelle direkt auf Maus- und Trackpad-Pointer, sodass kein langes Halten nötig ist. Selbst-, Nachfahren- und unveränderte Ziele bleiben ohne Strukturänderung.
- Interaktiv angelegte oder verschobene Stapelbäume besitzen höchstens vier sichtbare Ebenen: Hauptstapel, Unterstapel, Unter-Unterstapel und Unter-Unter-Unterstapel. Ein zu tiefes Ziel wird ohne Mutation mit `Maximal vier Stapel-Ebenen sind möglich.` abgelehnt.
- Tiefere APKG-Hierarchien bleiben beim Import unverändert. Ihre Darstellung verwendet ab der vierten Ebene den tiefsten Gruppenton; spätere Moves müssen die Vier-Ebenen-Grenze einhalten oder den vorhandenen Baum nachweislich flacher machen.
- Ein beendeter Drag startet keine Sitzung. Erfolg, Fehler und No-op werden deutsch über eine Live-Region gemeldet; es gibt keine Bestätigung und kein Rückgängig-Angebot.
- Die Kartenverwaltung behält zusätzlich das explizite bestätigte Verschieben als Tastatur-, Touch- und Accessibility-Fallback.
- Kartenlöschung zeigt den betroffenen Inhalt, verwendet Soft Delete und bietet unmittelbar ein Undo, das denselben Datensatz samt Review State wiederherstellt.
- Stapellöschung zeigt Stapelname, Unterstapelzahl und aktive Kartenanzahl; ein Abbruch verändert nichts.
- Basic, Reverse, Cloze und Multiple Choice laufen durch dieselbe fachliche Erstellung.
- Basic und Reverse bearbeiten Vorder- und Rückseite als sanitisiertes Rich Text; Pflichtfelder werden direkt am Feld validiert.
- Reverse zeigt im normalen Review die Originalrichtung und im ausdrücklich gestarteten Variantenreview die atomar synchronisierte Rückrichtung.
- Cloze bearbeitet den kanonischen Lückentext mit sichtbarer `{{c1::…}}`-Syntaxhilfe. Speichern ist nur mit gültigen Lücken möglich; aktive Reviewvarianten entsprechen danach exakt den vorhandenen Lückengruppen.
- Multiple Choice bearbeitet Frage, mindestens zwei eindeutige Optionen, genau eine richtige Option und eine optionale Erklärung gemeinsam. Reviewanzeige und Bewertung verwenden dieselbe gespeicherte richtige Option.
- Quellenanker bleiben beim Bearbeiten erhalten und nachvollziehbar.
- Importierte Rohfelder bleiben unter den Details read-only; Quellen, Versionen und Wiederherstellung werden progressiv offengelegt.
- Eine erfolgreiche Bearbeitung erzeugt einen auditierbaren Versionseintrag; Wiederherstellung umfasst auch strukturierte Cloze- und Multiple-Choice-Inhalte.
- Lokale typgerechte Inhaltsänderungen werden bei APKG-Reimport nicht still überschrieben.
- Strukturierte Kartenfelder überleben den accountgebundenen Cloud-Roundtrip und den Portabilitätsexport.

### 5.4 Karte bewerten, neu laden und fortfahren

Vor der Antwort zeigt der Review ausschließlich den Lerninhalt und die Aktion zum Aufdecken. Nach dem Aufdecken bleiben Frage und Antwort sichtbar; vier Bewertungen aktualisieren den Lernzustand.

Akzeptanz:

- `Again`, `Hard`, `Good` und `Easy` sind per Maus und Tastatur erreichbar.
- Intervallvorschauen passen zur tatsächlich angewendeten Bewertung.
- Der Reviewkopf zeigt statt eines Fortschrittsbalkens die aktuell eingeplanten Anzahlen für `Fällig` und `Neu`.
- Frage und Antwort stehen ohne dekorative Trennlinie auf derselben Kartenfläche; die kompakten, dezent akzentuierten Bewertungsaktionen sind Teil dieser Fläche.
- Vor dem Reveal erscheinen keine Herkunfts-, Varianten-, Reife- oder Schedulerhinweise.
- Die geplante Sitzungsgröße bleibt während der Sitzung stabil.
- Das Ende nennt die beantwortete Anzahl und führt gezielt zum URL-kodierten Ausgangspunkt zurück.
- Ein Review-Reload erhält Reviewdeck und den allowlist-basierten Rückkontext `today`, `learn` oder `decks`; eine freie Rück-URL wird nicht akzeptiert.
- Review aus der Kartenverwaltung kehrt zu demselben Deck und derselben Karte zurück, Review aus Lernen zu demselben Lern-Deckkontext.
- Browser-Zurück und -Vorwärts rekonstruieren View, Deck, Karte und Reviewkontext ohne zusätzliche History-Schleifen.
- Unbekannte oder nicht verfügbare Deck- und Karten-IDs zeigen verständliche deutsche Folgeaktionen und öffnen niemals still eine andere Karte.
- Nach erfolgreichem Save und Reload bleibt der Lernfortschritt erhalten.
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

Ein Fragezeichen neben dem Theme-Schalter öffnet die direkt verlinkbare Hilfeseite `/hilfe` im normalen App-Shell-Inhaltsbereich. Die Seite folgt der festen Reihenfolge Einführung, Grundbegriffe, Entscheidungsgrafik, vier Bewertungen, Spaced Repetition und Content Repetition.

Akzeptanz:

- Die Einführung erklärt knapp, dass CoRe Spaced Repetition für den Zeitpunkt mit Content Repetition für wechselnde Fragestellungen verbindet. Die Grundbegriffe enthalten ausschließlich Abrufwahrscheinlichkeit `R`, Stabilität `S` und Schwierigkeit `D` als ruhige Textdefinitionen; `S` ist die Zeit, in der `R` von 100 auf 90 Prozent fällt.
- Die als vereinfacht gekennzeichnete Grafik zeigt eine erste Vergessenskurve bis zu einem Review und danach vier alternative Intervalle für `1 Nochmal`, `2 Schwer`, `3 Gut` und `4 Leicht`. `4 Leicht` ist standardmäßig deutlich hervorgehoben und endet an einem beschrifteten möglichen Variantenpunkt; dies ist weder eine feste Reviewnummer noch eine Scheduler- oder Variantenschwelle.
- Die durch zwei diagonale Striche unterbrochene Y-Achse macht kenntlich, dass nur der Ausschnitt von 90 bis 100 Prozent Abrufwahrscheinlichkeit gezeigt wird. `R`, `S` und `D` bleiben qualitativ in der Grafik sichtbar; es werden keine scheinbar exakten Gedächtniswerte erfunden.
- Mausberührung und Tastaturfokus heben die jeweilige Bewertungskurve vorübergehend durch Strichstärke und Opazität hervor. Nach Verlassen ist wieder `4 Leicht` aktiv. Nummer, Bewertungsname, Symbol und Text ergänzen die Farbe als Bedeutungsträger.
- Die Grafik dient zugleich als Sprungnavigation: `R`, `S` und `D` führen zu `#grundbegriffe`, die erste Vergessenskurve zu `#spaced-repetition`, alle vier Bewertungskurven zu `#bewertungen` und der Variantenpunkt zu `#content-repetition`. Die Links besitzen verständliche Namen, sichtbare Fokuszustände und mindestens 44 px große Bedienflächen.
- Der Spaced-Repetition-Abschnitt erklärt Gedächtniszustand, Vergessensprognose, Zielerinnerung und CoRes Einsatz von FSRS-6 mit den offiziellen 21 Standardparametern unter Einbeziehung aller Reviews. Persönliche Parameteroptimierung ist noch nicht aktiviert; eine höhere Zielerinnerung bedeutet mehr Reviews bei geringerem Vergessensrisiko.
- Der Content-Repetition-Abschnitt begrenzt Varianten auf dieselbe Wissenseinheit ohne neue Fakten. Eine ausreichend stabile Originalkarte kann eine nahe Variante erhalten; das Original bleibt nach der Antwort erreichbar und Fehler führen zurück zum Original oder zu einer einfacheren Variante.
- Bewertungen und Erklärungen verwenden typografische Textbereiche mit Trennlinien statt wiederholter Kartenflächen. Die mobile Darstellung begrenzt horizontales Scrollen auf den Grafikbereich, erzeugt keinen Dokument-Overflow und bleibt im Dark Mode sowie bei reduzierter Bewegung verständlich.

### 5.7 FSRS über simulierte Tage prüfen

Der direkt verlinkbare `/testmodus` ist in der Sidebar bei Theme und Hilfe erreichbar. Er stellt einen eigenen FSRS-Teststapel bereit und lässt Lernende Tag 1, 2, 3 und weitere simulierte Tage auswählen, ohne die echte Accountzeit oder echte Lerninhalte zu verändern.

Akzeptanz:

- Teststapel, Reviews, Bewertungsverteilung und Schedulerzustände bleiben ausschließlich im transienten Testmodus und werden weder gespeichert noch synchronisiert oder in echte Statistiken übernommen.
- Der Testmodus verwendet denselben FSRS-6-Scheduler und dieselbe Sitzungslogik wie das Produkt; es gibt keine vereinfachte Testformel.
- Jeder simulierte Tag zeigt nur neue sowie bis zu diesem Tag fällige oder überfällige Testkarten. Tage ohne Karten erklären, dass FSRS keine Wiederholung geplant hat.
- Tagesnavigation, Zurücksetzen und Bewertungen sind per Tastatur erreichbar. Eine laufende Testsitzung behandelt den verpflichtenden zweiten Kontakt und vorgezogene Wiederholungen genauso wie eine echte Sitzung.
- Ein sichtbarer Simulationsverlauf nennt Bewertung, nächsten simulierten Tag, Zustand, Stabilität und Schwierigkeit, ohne interne Daten in den Account zu schreiben.

## 6. Funktionale Anforderungen

### 6.1 Account und Einstellungen

- E-Mail-/Passwort ist die freigegebene Kernanmeldung.
- Hochschule und Fachgebiet sind optionale Profildaten und blockieren keinen Lernstart.
- Einstellungen sind in `Account`, `Lernen`, `Daten und Sync` und `Erweitert` gegliedert.
- Der Portabilitätsexport nennt vor dem Download seine Grenzen: keine Medienbytes, Authdaten, Serverrechte oder vollständige Art.-15-Auskunft.
- Sicherheitskritische Aktionen sind klar von Profil- und Lernoptionen getrennt.

### 6.2 Deck-Hierarchie

- Decks können Eltern- und Unterstapel bilden.
- Hierarchie bleibt beim unterstützten APKG-Import erhalten.
- Dashboard, Lernen und Kartenverwaltung projizieren denselben kanonischen, lokal einklappbaren Stapelbaum; Elternkennzahlen aggregieren sämtliche Unterstapel.
- Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen mit einem gemeinsamen kanonischen Deckkontext und einer gemeinsamen Stapelkarten-Darstellung.
- Lernen ist Teil der Hauptnavigation; die direktlinkfähige Kartenverwaltung wird sekundär aus Lernen geöffnet.
- Dashboard, Lernen und Kartenverwaltung erlauben direktes Drag-and-drop für Parent-/Child-Zuordnung und Outdent zur Hauptebene. Die Kartenverwaltung bietet dieselbe fachliche Mutation zusätzlich über einen expliziten bestätigten Fallback an.
- Direktes Drag-and-drop ist eine Desktop-Interaktion für Maus und Trackpad und markiert während der Geste keinen Zeilentext. Touch, Tastatur und assistive Bedienung verwenden den bestätigten Fallback; manuelle Elternauswahlen und Verschiebeziele bieten keine fünfte sichtbare Ebene an.
- Suche und Filter helfen bei großen Bibliotheken.
- Stapelname, Lernoptionen und Content-Repetition-Modus sind bearbeitbar.
- Löschen eines Baums ist destruktiv, bestätigt und darf gelöschte Inhalte nicht durch späteren Sync reaktivieren.

### 6.3 Import

- Unbekannte Note Types werden sicher und transparent projiziert; beliebige Templates werden nicht ausgeführt.
- Importfehler bleiben sichtbar und enthalten eine sinnvolle nächste Aktion.
- Die sichtbare Importsteuerung unterscheidet `idle`, `analyzing`, `preview`, `committing`, `syncing_media`, `succeeded`, `partial`, `failed_retryable`, `failed_terminal` und `cancelled`.
- Warnungen werden zunächst zusammengefasst und vollständig aufklappbar angeboten; Notetype-IDs, SHA-1-Listen und Importidentitäten erscheinen nicht in der Produktoberfläche.
- APKG-Dateien bis einschließlich 250 MiB werden lokal verarbeitet. Größere Dateien enden sofort mit einer verständlichen Meldung und `Andere Datei auswählen`; es gibt keinen Serverjob oder Upload-Fallback.
- Reimport erkennt stabile Anki-Identitäten vor heuristischen Fingerprints.
- Review-Rohdaten können erhalten werden, ohne importierte Karten automatisch als gelernt zu markieren.
- Medienreferenzen werden sicher aufgelöst; fehlende Medien werden im Bericht genannt.

### 6.4 Manuelle Erstellung und Quellen

- Karten können ohne Dokumentquelle erstellt werden.
- Mehrere Karten nacheinander zu erstellen ist der Standardfluss; gespeicherte Karten bleiben bei einem später verworfenen Entwurf erhalten.
- Pinning steuert ausschließlich den Reset nach erfolgreichem Speichern. Es gibt kein Cloud-Autosave für ungespeicherte Entwürfe.
- Aus einem lesbaren Dokument kann Text in Vorder- oder Rückseite übernommen werden.
- Ein Quellenanker speichert Dokument, Seite beziehungsweise Textbereich und bleibt editierbar.
- Rich Text wird vor Speicherung und Darstellung sanitisiert.
- Image Occlusion ist kein Bestandteil des Beta-Kerns.

### 6.5 Review und Scheduling

- Review verwendet vier Bewertungen und einen intern gekapselten FSRS-6-Schedulervertrag mit offiziellen Standardparametern.
- Neue Karten bleiben unabhängig von der ersten Bewertung bis zu einem zweiten Kontakt am selben Tag in der Lernphase. Standardmäßig plant `Gut` und beim Erstkontakt auch `Leicht` diesen Kontakt nach 15 Minuten; `Nochmal` und `Schwer` verwenden kürzere Lernschritte.
- Eine laufende Sitzung arbeitet zuerst ihre eindeutigen Karten ab und zeigt anschließend vorgemerkte Wiederholungen. Diese dürfen innerhalb der Sitzung vor ihrem gespeicherten Termin erscheinen und werden dann als vorgezogen gekennzeichnet.
- Erst ein erfolgreicher Abschluss der Lernschritte wechselt eine neue Karte in den langfristigen FSRS-Reviewzustand; Fehler können zusätzliche Wiederholungen erzeugen.
- Nutzer sehen verständliche Intervalle, nicht interne Schedulerzustände.
- Varianten dürfen eigenen Review State tragen; Familieninformationen dürfen Auswahl und Fallback unterstützen.
- Der Scheduler darf keine KI-Erzeugung im Antwortrequest auslösen.
- Der isolierte Testmodus führt Bewertungen mit einer simulierten Uhr durch und darf niemals Workspace-, Cloud- oder Statistikzustand mutieren.

### 6.6 Vertrauen, Versionen und Undo

- Originalinhalt und Quellenanker bleiben prüfbar.
- Nutzeränderungen erzeugen nachvollziehbare Versionen.
- Restore ist explizit, auditierbar und überschreibt nicht still neuere Inhalte.
- Ein unmittelbares Karten-Undo nimmt den bestehenden Soft-Delete-Tombstone revisionsgeprüft zurück; es erzeugt weder eine neue Karte noch einen zweiten Review State.
- Importfehler dürfen nicht zum Verlust des letzten verlässlichen Inhalts führen.

### 6.7 Statistik

- Statistik zeigt Lernaktivität, Erfolgsquote, Bewertungsverteilung, Streaks und schwache Bereiche aus eigenen Reviewdaten.
- Sie zeigt keine fremden Lernmetriken und erfindet im leeren Zustand keine Aktivität.

## 7. Zurückgebauter Produktscope

Chat-your-Deck, Lernplan, lokaler KI-Entwurf, Deck-Graph, Community-Demo, KI-Job-Historie, externer Varianten-JSON-Flow und serverseitiger APKG-Import sind entfernt. Es gibt dafür keine Navigation, Route, Persistenz, API oder zugesagte Importkompatibilität.

## 8. Visueller Produktvertrag

- Die produktive UI verwendet die CoRe-Palette Slate `#6F7E9E`, Mist `#A9B5C7`, Cloud `#DDE3EC`, Coral `#E28B68`, Lilac `#D6A3D2`, Marigold `#E4BF63` sowie die vorbereiteten Dark-Werte Midnight `#181D25`, Graphite `#262E3A`, Highlight `#8FA0BF`, Coral Glow `#F0A07E`, Lilac Glow `#E4B5E1` und Golden Glow `#F0CC77` ausschließlich über semantische Theme-Rollen.
- Light und Dark Mode verwenden denselben vollständigen semantischen Tokensatz. Ein zugänglicher Schalter direkt oberhalb der Einstellungen unten in der Sidebar aktiviert den Dark Mode über `data-core-theme="dark"`; daneben öffnet ein zugänglicher Fragezeichen-Button die Hilfeseite. Die Theme-Auswahl bleibt lokal im Browser erhalten. Es gibt keine automatische Aktivierung über die Systempräferenz.
- Dekorative Rahmenlinien sind bewusst heller und zurückhaltender als interaktive Feld-, Auswahl- und Fokusgrenzen.
- Primäre, sekundäre, tertiäre und destruktive Actions sowie Info-, Erfolgs-, Warn- und Fehlerzustände besitzen produktweit einheitliche Hover-, Active-, Focus- und Disabled-Zustände. Bedeutung bleibt durch Text, Icon oder Zahl zusätzlich zur Farbe erkennbar.
- Gewöhnliche einzeilige Buttons, Icon-Aktionen, Eingaben und Auswahlfelder verwenden produktweit eine Mindesthöhe beziehungsweise ein Touchziel von `44 × 44 px`. Fachliche Großflächen wie MCQ-Antworten und Reviewratings dürfen höher bleiben.
- Stapelgruppen verwenden dauerhaft die einfachen, gerahmten Flächen `--core-group-depth-0` bis `--core-group-depth-3`: Hauptstapel verwenden die ungefüllte Oberflächenfarbe von Depth 0 ohne Schatten, die drei Unterebenen jeweils Depth 1 bis 3. Tiefere Importe verwenden weiterhin Stufe 3. Hover, Auswahl, Fokus und Drop-Ziele reagieren am bestehenden Außenrand, ohne einen eingerückten Hover-Layer oder eine erhöhte Stapelfläche zu erzeugen.
- Stapelkarten zeigen `Neu` in der semantischen Lilac-Textrolle, `Fällig` in Slate und `Gesamt` gedämpft. Die sichtbaren Labels bleiben in allen Themes und Breiten erhalten, sodass Farbe nie allein Bedeutung trägt.
- Amulya definiert die visuellen Überschriftenstufen `36/44`, `28/36` und `22/30`; Synonym definiert Body Large `16/24`, Body und Controls `14/20` sowie Caption und Statuslabel `12/16`. Semantische HTML-Ebene und visuelle Stufe dürfen voneinander abweichen.
- Bestehendes Karten-HTML und persistierte benutzerdefinierte Farben werden nicht umgeschrieben. Neue oder ungültige Stapeldarstellungen verwenden Slate `#6F7E9E`. Stapel-Icons erscheinen produktweit rund mit Symbol und Rand in der gewählten Farbe sowie einer dezenten transparenten Flächentönung derselben Farbe; die Stapel-Einstellungen wählen diese Farbe über ein kompaktes Farbfeld und einen zugänglichen runden Farbkreis. Rich-Text-Schnellfarben stammen weiterhin aus der CoRe-Palette.

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
- Unter 1024 px genügt vorerst eine lesbare responsive Fallback-Nutzung; Mobile ist kein eigener Produktfokus.
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
- externe KI-Chat- oder Kartenerstellung;
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
