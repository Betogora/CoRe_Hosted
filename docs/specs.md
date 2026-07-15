# CoRe — Produktvertrag und Kernjourneys

**Rolle:** einzige kanonische Quelle für Produktversprechen, Kernjourneys, funktionale Anforderungen und Produktabnahme.
**Status:** Arbeitsfassung
**Stand:** 2026-07-15

Diese Spezifikation beschreibt ausschließlich, was CoRe für Nutzer leisten soll. Aktuelle Implementierung, Architektur, Betrieb, Entscheidungen, Verlauf und offene Roadmap haben eigene Quellen in der [Dokumentenlandkarte](index.md).

---

## 1. Produktvision

CoRe erweitert klassische Spaced Repetition um inhaltliche Wiederholung. Lernende sollen Inhalte auch bei veränderter Fragestellung abrufen, statt Layout, Wortlaut oder Lückenposition wiederzuerkennen.

CoRe startet Anki-kompatibel, bleibt beim Lernen ruhig und fokussiert und macht Varianten durch Original- und Quellenanker überprüfbar. KI-Ausgaben werden nicht unsichtbar als verlässliche Lerninhalte behandelt.

### Zielgruppen

- Studierende und Auszubildende mit großen, langfristig gepflegten Kartenbeständen;
- Anki-Nutzer, die vorhandene Stapel weiterverwenden wollen;
- Lerngruppen, die Inhalte teilen möchten, ohne private Lernstände offenzulegen.

### Kernnutzen

1. Bestehende und neue Lerninhalte schnell in ein gemeinsames Modell bringen.
2. Eine ruhige, vorhersehbare Review-Sitzung mit vier Bewertungen anbieten.
3. Geeignete reife Inhalte kontrolliert variieren.
4. Nach der Antwort Original und Quelle als Vertrauensanker zeigen.
5. Nutzerinhalte accountgebunden, nachvollziehbar und portabel halten.

## 2. Produktprinzipien

1. **Anki-kompatibel starten:** APKG-Import und bekannte Kartenformen senken die Einstiegshürde.
2. **Originale bleiben Anker:** Jede Variante gehört zu genau einem Learning Item und dessen Original.
3. **Review first:** Varianten sind vor der Antwort nicht als solche erkennbar.
4. **KI ist überprüfbar:** Neue KI-Inhalte sind Entwürfe; Quellen, Validierung und Nutzerannahme bleiben sichtbar.
5. **Lernen bleibt privat:** Community-Flächen zeigen keine fremden Lernstände, Streaks oder Online-Aktivität.
6. **Stapelweise steuerbar:** Content Repetition kann pro Stapel aus, automatisch oder manuell sein.
7. **Sparsam ausbauen:** Nicht jede Karte wird variiert; nicht reife Produktflächen bleiben Labs oder Disabled.

## 3. Produktreife

### Core

- E-Mail-/Passwort-Account und verständlicher leerer Zustand;
- Heute-Dashboard und klarer Lernstart;
- APKG im freigegebenen Größenbereich, Text, CSV und Tabellenimport;
- manuelle Stapel- und Kartenerstellung;
- Karten- und Stapelverwaltung;
- Review mit vier Bewertungen und Content-Repetition;
- Original- und Quellenanker nach der Antwort;
- accountgebundene Speicherung, Sync- und Konfliktstatus;
- grundlegende Statistik und verständliche Einstellungen.

### Labs

- Chat-your-Deck und Lernplan;
- lokaler deterministischer Kartenentwurf;
- Deck-Graph;
- lokale Community-Demo;
- externer Varianten-JSON-Flow;
- AI-Job-Historie;
- erweiterte APKG-Diagnose.

### Disabled

- APKG über 250 MiB bis zur Hosted-Abnahme;
- Google und Magic Link bis zum vollständigen Hosted-Roundtrip;
- echte Community-Mitgliedschaften und Freigaberechte;
- produktive externe Karten-, Varianten- und Graphgenerierung;
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
| Community | Kleine, berechtigte Gruppe zum Teilen von Inhalten, nicht von Lernmetriken |

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

Nutzer wählen zuerst zwischen manueller Erstellung und Import. Labs-Entwürfe sind separat und als lokal beziehungsweise experimentell gekennzeichnet.

Akzeptanz:

- APKG, Text, CSV und Tabellen-Paste sind ohne Kenntnis interner Anki-Begriffe auffindbar.
- Unterstützte Quellanhänge sind PDF, Text, Markdown, CSV und TSV; nicht lesbare Formate sind nicht auswählbar.
- APKG wird zuerst analysiert. Vorschau und `Import übernehmen` sind getrennte Schritte.
- Der Hauptbericht nennt Datei, Stapel, Karten, vorhandene und fehlende Medien sowie verständliche Warnungen.
- Notetype-IDs, Template-Ordinals, Hashes und Importidentitäten dominieren den Hauptflow nicht.
- Ein erfolgreicher Flow endet mit einem konkreten Ziel wie `Jetzt lernen`, `Karten prüfen` oder `Zur Bibliothek`.

### 5.3 Karten bearbeiten und eine Sitzung starten

`Lernen` ist der schnelle Einstieg in eine Sitzung. `Kartenstapel` dient Struktur, Inhalt, Versionen und erweiterten Optionen.

Akzeptanz:

- Ein Klick auf eine Lernzeile startet Lernen.
- Verschieben, Outdent und Löschen sind explizite, bestätigte Verwaltungsaktionen.
- Basic, Reverse, Cloze und Multiple Choice laufen durch dieselbe fachliche Erstellung.
- Vorder- und Rückseite unterstützen sanitisiertes Rich Text.
- Quellenanker bleiben beim Bearbeiten erhalten und nachvollziehbar.
- Lokale Inhaltsänderungen werden bei APKG-Reimport nicht still überschrieben.

### 5.4 Karte bewerten, neu laden und fortfahren

Vor der Antwort zeigt der Review ausschließlich den Lerninhalt und die Aktion zum Aufdecken. Nach dem Aufdecken bleiben Frage und Antwort sichtbar; vier Bewertungen aktualisieren den Lernzustand.

Akzeptanz:

- `Again`, `Hard`, `Good` und `Easy` sind per Maus und Tastatur erreichbar.
- Intervallvorschauen passen zur tatsächlich angewendeten Bewertung.
- Vor dem Reveal erscheinen keine Herkunfts-, Varianten-, Reife- oder Schedulerhinweise.
- Die geplante Sitzungsgröße bleibt während der Sitzung stabil.
- Das Ende nennt die beantwortete Anzahl und führt gezielt zur Lernen-Übersicht.
- Nach erfolgreichem Save und Reload bleibt der Lernfortschritt erhalten.
- Offline- oder Konfliktzustände werden sichtbar und niemals als gespeichert ausgegeben, solange Änderungen ausstehen.

### 5.5 CoRe-Variante lernen und Ursprung prüfen

Geeignete Learning Items können nach ausreichender Reife als konservative Umformulierungen erscheinen. Die Herkunft bleibt bis zur Antwort verborgen.

Akzeptanz:

- Nicht geeignete Inhalte wie sehr kurze Vokabelkarten können von Variation ausgeschlossen werden.
- Jede Variante ist an genau ein Original gebunden.
- Nach der Antwort ist der Originalanker genau einmal kompakt erreichbar; ein Quellenanker erscheint, wenn vorhanden.
- Fehlerhafte oder unklare Varianten können deaktiviert oder kontrolliert gemeldet werden.
- Persönliche Reviewdaten gelangen nicht in geteilte Varianten oder Feedbackobjekte.
- Bei fehlender oder fehlerhafter Variante bleibt das Original sicher lernbar.

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
- Suche und Filter helfen bei großen Bibliotheken.
- Stapelname, Lernoptionen und Content-Repetition-Modus sind bearbeitbar.
- Löschen eines Baums ist destruktiv, bestätigt und darf gelöschte Inhalte nicht durch späteren Sync reaktivieren.

### 6.3 Import

- Unbekannte Note Types werden sicher und transparent projiziert; beliebige Templates werden nicht ausgeführt.
- Importfehler bleiben sichtbar und enthalten eine sinnvolle nächste Aktion.
- Reimport erkennt stabile Anki-Identitäten vor heuristischen Fingerprints.
- Review-Rohdaten können erhalten werden, ohne importierte Karten automatisch als gelernt zu markieren.
- Medienreferenzen werden sicher aufgelöst; fehlende Medien werden im Bericht genannt.

### 6.4 Manuelle Erstellung und Quellen

- Karten können ohne Dokumentquelle erstellt werden.
- Aus einem lesbaren Dokument kann Text in Vorder- oder Rückseite übernommen werden.
- Ein Quellenanker speichert Dokument, Seite beziehungsweise Textbereich und bleibt editierbar.
- Rich Text wird vor Speicherung und Darstellung sanitisiert.
- Image Occlusion ist kein Bestandteil des Beta-Kerns.

### 6.5 Review und Scheduling

- Review verwendet vier Bewertungen und einen FSRS-artigen, intern gekapselten Schedulervertrag.
- Nutzer sehen verständliche Intervalle, nicht interne Schedulerzustände.
- Varianten dürfen eigenen Review State tragen; Familieninformationen dürfen Auswahl und Fallback unterstützen.
- Der Scheduler darf keine KI-Erzeugung im Antwortrequest auslösen.

### 6.6 Vertrauen, Versionen und Undo

- Originalinhalt und Quellenanker bleiben prüfbar.
- Nutzeränderungen erzeugen nachvollziehbare Versionen.
- Restore ist explizit, auditierbar und überschreibt nicht still neuere Inhalte.
- KI- oder Importfehler dürfen nicht zum Verlust des letzten verlässlichen Inhalts führen.

### 6.7 Statistik

- Statistik zeigt Lernaktivität, Erfolgsquote, Bewertungsverteilung, Streaks und schwache Bereiche aus eigenen Reviewdaten.
- Sie zeigt keine fremden Lernmetriken und erfindet im leeren Zustand keine Aktivität.

## 7. Labs-Verträge

### Chat-your-Deck

Freie externe Antworten und quellengebundene Antworten bleiben klar unterscheidbar. Vor externem Transfer wird die erforderliche Einwilligung eingeholt. Quellengebundene Antworten verwenden nur eine kleine, bereinigte Evidenzmenge. Providerfehler zeigen einen deutschen Fehlerzustand; Secrets oder vollständige Prompts erscheinen nicht in UI oder Logs.

### Lokaler Entwurfsassistent

Der lokale Assistent ist deterministisch, verursacht keine externen Modellkosten und erzeugt überprüfbare Entwürfe. Entwürfe werden erst nach Nutzerannahme zu regulären Lerninhalten.

### Community

Die lokale Demo darf kleine Gruppen, Ordner und Deck-Kopien zeigen. Sie verspricht keine echten Mitgliedschaftsrechte. Geteilte Inhalte enthalten keine privaten Review Events oder Lernstände.

### Deck-Graph

Der Graph visualisiert Karten und Themen eines Stapels. Er ist ein Kontextwerkzeug, kein Ersatz für Lernstart, Statistik oder Deckverwaltung.

### Lernplan

Ein Lernplan kann Zieltermin, verfügbare Zeit, neue Karten, fällige Reviews und schwache Bereiche in Tagesquoten übersetzen. Er ist kein Kalender- oder Benachrichtigungsadapter.

## 8. Nichtfunktionale Anforderungen

### Sicherheit und Datenschutz

- Accountdaten und Inhalte sind durch RLS und Ownership geschützt.
- Provider- und Service-Secrets bleiben serverseitig.
- Community teilt keine privaten Lernmetriken.
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

## 9. Beta-Abnahme

Der Beta-Kern gilt als erfüllt, wenn:

1. alle fünf Kernjourneys automatisiert und manuell bestehen;
2. ein neuer Account, kleiner Import, manuelle Erstellung, Review und Reload ohne Entwicklerwissen bedienbar sind;
3. eine Variante vor dem Reveal nicht erkennbar ist;
4. keine normale Oberfläche lokale Demo-Logik als echte Community oder KI ausgibt;
5. keine sichtbare Einstellung eine nicht vorhandene Wirkung verspricht;
6. die Zielviewports, Tastatur, Screenreader, Zoom, lange Inhalte und mindestens ein realistischer Fehlerfall abgenommen sind;
7. keine Blocker oder ungeklärten hohen Reibungsverluste aus moderierten Tests verbleiben;
8. automatisierte Tests konkrete Produkt- und Sicherheitsverträge schützen, ohne Testanzahl als Produktabnahme zu behandeln.

Offene Gates und Evidenz stehen ausschließlich in [`todo.md`](todo.md).

## 10. Nichtziele des Beta-Kerns

- öffentliche Community, Rankings oder soziale Leistungsmetriken;
- generische Backend-, Auth- oder LLM-Adapter;
- mehrere gleichzeitig unterstützte KI-Provider;
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
