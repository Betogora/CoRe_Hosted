# Specs

**Stand:** 2026-11-12

Die Specs beschreiben, was CoRe tun soll und warum: je Funktion die Absicht, ihre Regeln und die Entscheidungen, die der Code umsetzt. Wer sie liest, soll das Produkt prüfen können, ohne in den Code zu schauen.

## Pflege dieser Datei

Hinein gehört je Funktion:

- **Zweck:** wozu es sie gibt, in einem Satz.
- **Regeln:** was unter welcher Bedingung geschieht, in fachlichen Begriffen.
- **Daten:** was gespeichert wird, was erhalten bleibt und was Gerät oder Konto verlässt. Bei KI: was hineingeht, was zurückkommt und was daraus wird.
- **Entscheidungen:** der gewählte Weg und bewusste Grenzen („Bewusst nicht“), mit Verweis auf das ADR, wenn es eines gibt.
- **Zahlen** nur, wenn sie das Verhalten fachlich bestimmen (Schwellen, Standards, Obergrenzen).

Nicht hinein gehört:

- **Oberfläche:** Bedienelemente, Beschriftungen, Anordnung, Maße, Farben, Breakpoints, Tastenkürzel, Gesten und Eingabegeräte. Das steht im Code und im [UI-Katalog](ui-elements.html).
- **Zustände einzelner Ansichten** (Laden, leer, Fehler, Bestätigung) und Meldungstexte. Dafür gelten einmal die Regeln unter [Rückmeldungen und Zuverlässigkeit](#rückmeldungen-und-zuverlässigkeit).
- **Technik:** Module, Tabellen, Routen und Protokolle stehen in [`architecture.md`](architecture.md), Messwerte und Budgets in [`test-portfolio.md`](test-portfolio.md), Offenes in [`todo.md`](todo.md).
- **Vollständige Aufzählungen,** die die App selbst zeigt (Suchsyntax, Tastenkürzel, Formatlisten).

Probe: Ein Satz gehört hinein, wenn er nach einer vollständigen Neugestaltung der Oberfläche unverändert gälte und eine Abweichung davon ein fachlicher Fehler wäre.

Form: Stichpunkte, ein Gedanke je Punkt. Eine neue Regel ersetzt die alte, statt sie zu ergänzen. Wo Funktionen logisch voneinander abhängen, steht ein Schaubild als `schaubild`-Block direkt beim Text und wird mit ihm geändert (Schreibweise in [`README.md`](README.md#pflege)). In Schaubildern sind KI-Schritte blau, Ergebnisse grün markiert.

## 1. Produkt

### Vision und Zielgruppen

CoRe startet Anki-kompatibel, hält das Lernen ruhig und behandelt jede planbare Karte als eigene Lerneinheit. Gelernt wird der Inhalt, nicht Layout, Wortlaut oder Lückenposition.

- Für Studierende und Auszubildende mit großen, langfristig gepflegten Kartenbeständen.
- Für Anki-Nutzer, die vorhandene Stapel weiterverwenden wollen.

### Prinzipien

1. **Anki-kompatibel starten:** Import und bekannte Kartenformen senken die Einstiegshürde.
2. **Karten bleiben eigenständig:** Jede Karte besitzt genau einen Lernstand; ihre KI-Umformulierungen teilen ihn.
3. **Review first:** Vor dem Aufdecken ist nicht erkennbar, ob eine Karte oder eine Umformulierung abgefragt wird.
4. **Lernen bleibt privat:** Stapel und Lerndaten gehören zum Konto und werden nicht veröffentlicht.
5. **Stapelweise steuerbar:** Content Repetition ist je Stapel an- oder ausgeschaltet.
6. **Sparsam ausbauen:** Nicht jede Karte wird variiert; neue Produktflächen brauchen einen belegten Auftrag ([ADR-001](decisions.md#adr-001--produktumfang-nur-mit-auftrag)).

### Umfang

Den aktuellen Stand und bekannte Lücken nennt [`status.md`](status.md).

- **Kern:** Konto mit E-Mail und Passwort, Heute, Erstellen (manuell, Bildverdeckung, Anki-Import), Lernen mit vier Bewertungen und Content Repetition, Kartenverwaltung und Karteneditor, Prüfungsplanung, Zusammenfassungen und Mindmaps, Statistik, Einstellungen, Hilfe, Simulator, kontogebundene Speicherung mit Sync.
- **Vorbereitet, nicht aktiv:** [Karten automatisch aus einer Quelle](#automatisch-aus-einer-quelle).
- **Abgeschaltet:** Anki-Pakete über 2 GiB, Magic Link, DOCX und OCR in der manuellen Erstellung und bei Zusammenfassungen, vollständige Datenauskunft und Kontolöschung.
- **Nichtziele:** Community, Rankings und soziale Leistungsmetriken; generische Backend-, Auth- oder KI-Adapter; KI-Chat ohne Kartenbezug; Bildübertragung an die KI; Admin-Portal, Zahlungen, Abonnements; Push-Benachrichtigungen; vollständige Ausführung von Anki-Templates.

### Bereiche und Gesamtbild

- Hauptbereiche sind `Heute`, `Lernen`, `Erstellen`, `Karten` und `Prüfung`; Statistik, Hilfe und Einstellungen ergänzen sie.
- `Lernen` führt vom Stapel in die Sitzung, `Karten` verwaltet alle Karten aller Stapel. Beide teilen den zuletzt gewählten Stapel.
- Ansicht, Stapel, Karte und Sitzung sind Teil des Links: Reload, Direktlink und Browser-Zurück führen an dieselbe Stelle.

```schaubild
Titel: Wie die Bereiche zusammenspielen
Gruppe: Karten kommen hinein (Erstellen)
Anki-Import | Paket wird auf dem Gerät übersetzt
Manuell | Felder, Auswahl, Lücken, Bildverdeckung
[primär] Automatisch aus einer Quelle | vorbereitet, noch nicht aktiv
Pfeil: werden zu
Gruppe: Bestand
Stapel | Hierarchie mit eigenen Lernoptionen
Inhalt | Felder, Tags und Medien, einmal gespeichert
Karte | eine Abfrage mit eigenem Lernstand
[primär] Variante | KI-Umformulierung, teilt den Lernstand der Karte
Pfeil: wird gelernt
Folge: Lernen
Tagesrunde | fällige und neue Karten innerhalb der Limits
Sitzung | Frage, Antwort, vier Bewertungen
Scheduler | nächster Termin, Haltbarkeit, Reife
[erfolg] Bewertungsverlauf | unveränderliche Ereignisse
Pfeil: speist
Gruppe: Überblick und Vertiefung
Heute | Tagesstand und Lernstart
Statistik | Aktivität, Planung, Gedächtnismodell
Prüfung | verteilt den Stoff bis zum Termin
[primär] Zusammenfassung und Mindmap | verdichten einen Stapel
Pfeil: alles
Gruppe:
[info] Lokal zuerst | jede Änderung wird erst auf dem Gerät gespeichert und danach mit dem Konto synchronisiert
```

## 2. Begriffe und Kartenmodell

### Begriffe

Abweichende Code- und Tabellennamen erklärt [`architecture.md`](architecture.md#inhalte-und-karten).

| Begriff | Bedeutung |
| --- | --- |
| Stapel (Deck) | Hierarchisch geordnete Sammlung von Karten mit eigenen Lernoptionen |
| Inhalt (Note) | Einmal gespeicherte Felder mit Rollen, Tags, Medien und Markierung; erzeugt eine oder mehrere Karten |
| Karte (Card) | Eigenständig planbare Abfrage eines Inhalts mit Stapel, eigenem Lernstand, Flagge und Aussetzung |
| Variante | KI-Umformulierung einer Karte ohne eigenen Lernstand oder Termin |
| CoRe-Modus | Stapeleinstellung `An` oder `Aus` für Content Repetition |
| Lernstand (Review State) | Persönlicher Planungszustand einer Karte: Phase, Termin, Gedächtniswerte |
| Bewertungsereignis (Review Event) | Unveränderlicher Eintrag einer Bewertung oder einer manuellen Aktion am Lernstand |
| Haltbarkeit | Tage, bis die Erinnerung an eine Karte auf 90 % fällt; folgt dem Gedächtnis, nicht der Zielerinnerung |
| Reife | Aus dem Lernstand abgeleitete Stufe `Neu`, `Lernen`, `Jung` oder `Reif`; nie gesammelt oder gezählt |
| Tag | Schlagwort eines Inhalts im Anki-Format; `::` bildet die Hierarchie |
| Flagge | Farbige Kennzeichnung einer Karte (1–7 wie in Anki), auf Wunsch mit eigenem Namen |
| Lernbremse | Zustand einer wiederholt vergessenen Karte (Anki „Leech“); getrennt von der Aussetzung |
| Aussetzen | Karte pausieren, bis sie reaktiviert wird; der Lernstand bleibt unverändert |
| Zurückstellen | Karte bis zum nächsten Lerntag aus der Runde nehmen |

### Inhalt, Karte und Variante

Ein Inhalt wird einmal gespeichert; planbar sind seine Karten ([ADR-032](decisions.md#adr-032--inhaltsmodell-note-und-card)).

```schaubild
Titel: Ein Inhalt, mehrere Karten, ein Lernstand je Karte
Folge:
Inhalt | Felder mit Rollen, Tags, Medien, Markierung
-> erzeugt eine oder mehrere
Karte | eine Abfrage: Richtung, Lücke oder Maske; dazu Stapel, Flagge, Aussetzung
-> besitzt genau einen
[erfolg] Lernstand | Phase, Termin, Haltbarkeit; aus dem Bewertungsverlauf berechnet
Pfeil: bei eingeschaltetem CoRe-Modus zusätzlich
Folge:
Karte
-> hat keine bis mehrere
[primär] Variante | andere Formulierung von Frage und Antwort
-> teilt
[erfolg] Lernstand der Karte | eine Antwort auf die Variante zählt wie eine Antwort auf die Karte
```

- Der Inhalt besitzt Felder, Tags, Medien und Markierung genau einmal; jede Karte besitzt Stapel, Abfrage, Status, Lernstand und Varianten.
- Medien sind optionaler Teil eines Inhalts, kein eigener Kartentyp. Die Karte speichert nur Verweise; die Dateien liegen im Medienspeicher des Kontos.
- Gespeichert werden Felder, nie die fertig dargestellte Karte.
- **Bewusst nicht:** Quelldokumente, Inhaltsversionen, ein CoRe-eigenes Export- oder Importformat.

### Inhaltsformen

- **Frage–Antwort:** optional mit Rückrichtung; dann entstehen zwei unabhängige Karten mit eigenem Lernstand.
- **Lückentext:** Jede Lückengruppe ist eine eigene Karte.
- **Auswahl:** Single Choice (genau eine richtige von mindestens zwei Optionen), Multiple Choice (mindestens eine richtige und eine falsche) und Kprim (je Aussage richtig oder falsch; nur aus Anki-Importen). Ein Inhalt ergibt genau eine Karte; nicht mit Lücken oder Rückrichtung kombinierbar.
- **Bildverdeckung:** Jede Maskengruppe ist eine eigene Karte ([Bildverdeckung](#bildverdeckung)).
- **Antwort eintippen:** Baustein für Frage–Antwort; die Eingabe wird zeichengenau wie in Anki verglichen.
- **Zusätzliche Felder** tragen eine Rolle: `Zusatzfrage` (Teil der Frage, in Rückrichtung Teil der Antwort), `Hinweis` (vor der Antwort aufdeckbar), `Zusatz` und `Quelle` (erst nach der Antwort), `Notiz` (nur im Editor).
- Felder sind formatierter Text, der vor Speicherung und Darstellung bereinigt wird.

### Kartendarstellung

- Review, Vorschau, Editor und Importvorschau zeigen dieselbe Karte gleich, im CoRe-Design.
- Beim Aufdecken bleibt die Frage stehen; die Antwort folgt und wiederholt die Frage nicht.
- Single Choice deckt mit der Auswahl auf, Multiple Choice und Kprim erst nach ausdrücklicher Prüfung.
- **Ausnahme Originallayout** ([ADR-047](decisions.md#adr-047--originallayout-importierter-karten)): Importierte Karten, deren Notiztyp eigenes CSS ohne Script mitbringt und generisch übersetzt wurde, erscheinen im Layout ihres Autors. Es gibt dafür keinen Schalter; die Bedienung um die Karte bleibt CoRe. Bleibt die Vorderseite leer, erscheint die Karte im CoRe-Design mit Hinweis.
- Formeln werden gesetzt; bei Fehlern bleibt der Quelltext sichtbar.
- Skripte aus Karten werden nie ausgeführt.

### Tags

- Tags werden genau wie in Anki gespeichert und erst in der Oberfläche vereinfacht ([ADR-045](decisions.md#adr-045--tags-flaggen-und-lernbremse-ankitreu-speichern)); ein späterer Export bleibt verlustfrei möglich.
- Tags, die sich nur in Groß- und Kleinschreibung unterscheiden, sind ein Tag; die zuerst gespeicherte Schreibweise gilt.
- Eine Tag-Änderung ist keine Inhaltsänderung: Sie wirkt sofort und hält spätere Import-Updates der Felder nicht auf.
- Ein importierter Inhalt merkt sich die Tags seines letzten Imports getrennt von den eigenen.
- Ein Reimport führt Tags zusammen: Lokal ergänzte bleiben, lokal entfernte bleiben entfernt, im Paket neue kommen dazu, im Paket entfallene gehen.

### Flaggen, Markierung und Lernbremse

- Flaggen sind die sieben Anki-Farben je Karte; eigene Namen gelten kontoweit. Anki-Flaggen werden übernommen, Flaggennamen nicht, weil das Paket sie nicht enthält.
- Die Markierung gehört zum Inhalt (Anki-Tag `marked`), die Lernbremse zur Karte (Anki-Tag `leech`); beide erscheinen danach nicht mehr als Tag.
- Eine Karte erhält die Lernbremse, wenn ein `Nochmal` in der Wiederholung die Fehlerschwelle des Stapels erreicht (Standard 8), danach bei jeder weiteren halben Schwelle. Frühere Fehler lösen nicht rückwirkend aus.
- Der Stapel legt fest, ob die Lernbremse nur kennzeichnet (Standard) oder die Karte aussetzt. Sie lässt sich zurücksetzen.
- Lokal gesetzte Flaggen, Markierung und Lernbremse überstehen einen Reimport.

### Stapel

- Stapel bilden eine Hierarchie ohne Tiefenlimit ([ADR-041](decisions.md#adr-041--stapelhierarchie-und-stapelsammlung)); ein Elternstapel fasst alle Unterstapel zusammen. Sortiert wird je Ebene alphabetisch wie in Anki.
- Jeder Stapel trägt eigene Lernoptionen. Ein neuer Stapel erhält den Standard als eigene Werte; ein Reimport lässt lokale Einstellungen unverändert.
- Verschieben macht einen Stapel samt Unterbaum zum direkten Unterstapel des Ziels oder zum Hauptstapel. Ausgeschlossen sind nur der Stapel selbst und seine Nachfahren. Importherkunft und Tags bleiben.
- Das Löschen eines Stapelbaums ist endgültig, nennt vorher Unterstapel und Kartenzahl und wird durch späteren Sync nicht rückgängig.
- Je Stapel zeigen `Heute` und `Lernen` die Tageszahlen `Neu`, `Offen` und `Fällig` nach [Tagesrunde und Limits](#tagesrunde-und-limits); Elternstapel zählen ihren Teilbaum.
- Ein geöffneter Stapel bündelt Unterstapel, die Karten des ganzen Teilbaums, Zusammenfassungen und Mindmap und startet das Lernen. `Quiz` und `Quelle` sind dort Platzhalter.
- Wo ein Stapel gewählt wird, steht sein vollständiger Pfad, damit gleichnamige Unterstapel unterscheidbar bleiben.

## 3. Kernjourneys

Jede Journey nennt Zweck, Ablauf und Akzeptanz. Sie ist bestanden, wenn ihr Ablauf ohne Entwicklerwissen gelingt und alle verlinkten Regeln erfüllt sind.

### Account öffnen und Produktzustand verstehen

Ein neuer oder bestehender Account zeigt sofort, was CoRe kann und was als Nächstes zu tun ist.

Ablauf:

1. Anmelden oder registrieren.
2. Leeren oder bestehenden Account sehen.
3. Import, manuelle Karte oder Demo wählen.
4. Tagesstand und Lernaktion auf `Heute` sehen.

Akzeptanz:

- Anmeldung und Start folgen [Konto und Anmeldung](#konto-und-anmeldung) und [App-Start und neues Gerät](#app-start-und-neues-gerät).
- Der leere Account, die Demo und der Tagesstand folgen [Heute](#heute).
- Sync-, Offline- und Konfliktstatus folgen [Sync und Konflikte](#sync-und-konflikte).

### Stapel importieren oder manuell anlegen

Vorhandene Anki-Stapel und neue Karten gelangen ohne Datenverlust in CoRe.

Ablauf:

1. `Erstellen` öffnen und einen Weg wählen.
2. Paket analysieren oder Karte eingeben.
3. Vorschau und Inhalt prüfen.
4. Lokal speichern.
5. Synchronisierung oder Teilabschluss sehen.

Akzeptanz:

- Der Import folgt [Anki-Import](#anki-import), [Übersetzung von Anki-Paketen](#übersetzung-von-anki-paketen) und [Reimport und Neuübersetzung](#reimport-und-neuübersetzung).
- Die manuelle Erstellung folgt [Manuell erstellen](#manuell-erstellen) und [Bildverdeckung](#bildverdeckung).
- Der vorbereitete dritte Weg folgt [Automatisch aus einer Quelle](#automatisch-aus-einer-quelle).

### Karten bearbeiten und eine Sitzung starten

Stapel lassen sich ordnen, Karten suchen, gemeinsam ändern und bearbeiten; eine Sitzung startet mit der ersten verfügbaren Karte oder mit den Treffern einer Suche.

Ablauf:

1. `Lernen` oder `Karten` öffnen.
2. Stapel ordnen; Karten suchen, filtern und auswählen.
3. Karten gemeinsam ändern oder einzeln im Editor prüfen.
4. Sitzung des Stapels oder der Treffer starten.
5. Erste verfügbare Karte lernen.

Akzeptanz:

- Stapel folgen [Stapel](#stapel).
- Karten folgen [Kartenverwaltung](#kartenverwaltung), [Kartensuche](#kartensuche), [Massenaktionen und Pflege](#massenaktionen-und-pflege), [Karteneditor](#karteneditor) und [Karten löschen und duplizieren](#karten-löschen-und-duplizieren).
- Lernwerte folgen [Einstellungen und Geltungsbereiche](#einstellungen-und-geltungsbereiche) und [Tagesrunde und Lernprofile](#tagesrunde-und-lernprofile).
- Der Start folgt [Lernsitzung](#lernsitzung) und [Gezielt lernen und üben](#gezielt-lernen-und-üben).

### Karte bewerten, neu laden und fortfahren

Eine Sitzung bleibt über Bewertung, Reload und Netzausfall vorhersehbar.

Ablauf:

1. Frage sehen.
2. Antwort aufdecken.
3. `Nochmal`, `Schwer`, `Gut` oder `Leicht` wählen.
4. Bewertung lokal sichern.
5. Nächste Karte, Lernschritt oder Abschluss sehen.

Akzeptanz:

- Die Sitzung folgt [Lernsitzung](#lernsitzung) und [KI hilft](#ki-hilft).
- Planung und Tagesmenge folgen [Lernphasen und Bewertungen](#lernphasen-und-bewertungen), [Lerntag und Vorziehen](#lerntag-und-vorziehen) und [Tagesrunde und Limits](#tagesrunde-und-limits).
- Offline-Lernen folgt [Offline lernen](#offline-lernen).

### CoRe-Variante lernen und Ursprung prüfen

Reife Karten erscheinen im Wechsel mit ihren KI-Umformulierungen; die Herkunft bleibt bis zur Antwort verborgen.

Ablauf:

1. Geeignete Karte lernen.
2. Original oder KI-Umformulierung sehen.
3. Antwort aufdecken.
4. Ursprung prüfen und Varianten verwalten.

Akzeptanz:

- Wann Varianten erscheinen, regelt [Freigabe der Varianten](#freigabe-der-varianten); Beispiele zeigt [Lernverlauf einer Karte](#lernverlauf-einer-karte).
- Darstellung und Verwaltung folgen [Varianten im Review](#varianten-im-review), [Varianten verwalten](#varianten-verwalten) und [CoRe-Modus](#core-modus).
- Das Erzeugen folgt [Kartenvarianten erzeugen](#kartenvarianten-erzeugen).

### Prüfung planen und vorbereiten

Eine oder mehrere Prüfungen verteilen den Lernstoff bis zum Termin auf Tagesaufgaben, die sich direkt lernen lassen.

Ablauf:

1. `Prüfung` öffnen.
2. Prüfung, Lernstoff und Lernzeit einrichten.
3. Plan in der Vorschau prüfen und speichern.
4. Tagesaufgaben auf `Heute` oder im Planer lernen.
5. Fortschritt der Prüfung verfolgen.

Akzeptanz:

- Einrichtung und Verteilung folgen [Prüfung einrichten](#prüfung-einrichten), [Lernzeit](#lernzeit) und [Kontaktplanung](#kontaktplanung).
- Kalender und Lernen folgen [Kalender und Lernblöcke](#kalender-und-lernblöcke), [Tagesaufgaben und Prüfungssitzung](#tagesaufgaben-und-prüfungssitzung) und [Leseaufgaben](#leseaufgaben).
- Fortschritt und Offline-Verhalten folgen [Fortschritt und Lebenszyklus](#fortschritt-und-lebenszyklus) und [Prüfung offline](#prüfung-offline).

### Zusammenfassung und Mindmap erstellen

Aus den Karten eines Stapels entsteht eine überprüfbare Zusammenfassung und daraus eine bearbeitbare Mindmap.

Ablauf:

1. Stapelinhalte öffnen.
2. Zusammenfassung mit KI erstellen oder selbst schreiben.
3. Fassung bearbeiten und beim Verlassen speichern.
4. Mindmap aus der Zusammenfassung erzeugen.
5. Mindmap gestalten; sie speichert automatisch.

Akzeptanz:

- Zusammenfassungen folgen [Zusammenfassungen](#zusammenfassungen), [KI-Zusammenfassung](#ki-zusammenfassung) und [Zusammenfassung bearbeiten und speichern](#zusammenfassung-bearbeiten-und-speichern).
- Mindmaps folgen [Mindmap erzeugen](#mindmap-erzeugen) und [Mindmap bearbeiten und speichern](#mindmap-bearbeiten-und-speichern).

### Lernlogik verstehen

Die Hilfe erklärt, warum CoRe Abrufreize wechselt und wie der Scheduler plant, ohne den Lernstand zu verändern.

Ablauf:

1. Hilfe öffnen.
2. Active Recall und Spaced Repetition verstehen.
3. Smarter Recall und Content Repetition verstehen.
4. Scheduler und Varianten nachvollziehen.

Akzeptanz:

- Inhalt und Wirkung folgen [Hilfe](#hilfe).
- Erklärte Regeln stimmen mit [Lernphasen und Bewertungen](#lernphasen-und-bewertungen), [Reife und Haltbarkeit](#reife-und-haltbarkeit) und [Freigabe der Varianten](#freigabe-der-varianten) überein.

### Lernfortschritt über simulierte Tage prüfen

Der Simulator zeigt, wie sich vorhandene Karten über Minuten und Tage entwickeln, ohne Karten durch bloßes Umstellen zu verändern.

Ablauf:

1. Simulator öffnen.
2. Lernzeit verschieben.
3. Verfügbare Karten und Planung prüfen.
4. Bei Bedarf bewerten oder Zeit zurücksetzen.

Akzeptanz:

- Bedienung und Wirkung folgen [Simulator](#simulator).
- Bewertungen im Zukunftsmodus folgen [Lernphasen und Bewertungen](#lernphasen-und-bewertungen) und [Sync und Konflikte](#sync-und-konflikte).

## 4. Karten erstellen und importieren

### Erstellungswege

Karten entstehen manuell, durch Anki-Import oder, vorbereitet, automatisch aus einer Quelle. Manuelle Erstellung und Import speichern zuerst auf dem Gerät und synchronisieren danach.

### Manuell erstellen

Karten entstehen ohne Dokumentquelle; mehrere Karten nacheinander sind der Normalfall.

- Die Erstellung beginnt mit Vorder- und Rückseite; Auswahlfragen, Bildverdeckung, Lücken, Formeln und Bausteine folgen den [Inhaltsformen](#inhaltsformen).
- Nach dem Speichern bleibt der Entwurf offen: Der Zielstapel bleibt gewählt, bewusst festgehaltene Felder bleiben gefüllt.
- Bilder stehen direkt in den Feldern. Große JPEG-, PNG- und WebP-Bilder werden vor dem Speichern auf Full HD verkleinert; alle anderen bleiben unverändert.
- Die Vorschau zeigt den Entwurf so, wie die Karte später gelernt wird.
- Neben dem Entwurf lässt sich eine Quelle (PDF, Text, Markdown, CSV, TSV) öffnen, um Text zu übernehmen; sie wird nicht gespeichert.
- Speichern ist ein einzelner, exklusiver Versuch: erst Bilder auf dem Gerät, dann die Karte auf dem Gerät, dann der Upload. Mehrfaches Auslösen erzeugt höchstens eine Karte.
- Scheitert etwas vor der lokalen Kartenspeicherung, bleibt der Entwurf. Danach gilt die Karte als gespeichert, und Upload und Sync werden nachgeholt.
- Ein nichtleerer Entwurf wird nur nach Rückfrage verworfen; bereits gespeicherte Karten bleiben.
- **Bewusst nicht:** automatisches Speichern von Entwürfen im Konto.

### Bildverdeckung

Bildverdeckungen entstehen im Masken-Editor oder kommen aus Anki (Ankis Bildverdeckung, Image Occlusion Enhanced).

- Jede Maske ist eine eigene Karte; gruppierte Masken werden gemeinsam abgefragt.
- Eine Maske kann dauerhaft verdeckt bleiben: Sie verdeckt auf allen Karten, ohne selbst abgefragt zu werden.
- Je Inhalt gilt: Beim Abfragen sind alle Masken verdeckt oder nur die abgefragte.
- Überschrift und Zusatz sind optional; Hinweis-, Zusatz- und Quellenfelder bleiben möglich, Eintippen und Rückrichtung nicht.
- Gespeichert wird erst mit Bild und mindestens einer abgefragten Maske. Ein Bildwechsel verwirft die Masken nach Rückfrage.
- Beim späteren Bearbeiten behalten verbleibende Masken ihre Karte und damit ihren Lernstand; das Bild lässt sich nicht austauschen.

### Anki-Import

Vorhandene Anki-Stapel werden vollständig auf dem Gerät gelesen und übernommen.

```schaubild
Titel: Vom Anki-Paket zur lernbaren Karte
Folge: Auf dem Gerät
Paket wählen | Anki-Paket bis 2 GiB
Analyse | abbrechbar, ändert nichts
Bericht und Vorschau | je Notiztyp: Karten, Lernstand, Warnungen
Übernahme | lokal gespeichert, Medien eingereiht
[erfolg] Lernbar | sofort, auch vor dem Sync
Pfeil: danach im Hintergrund, je für sich
Gruppe: Synchronisierung ins Konto
[info] Inhalte und Karten
[info] Lernstand und Verlauf
[info] Medien
```

- Angenommen werden nur Anki-Pakete. Pakete bis 2 GiB verarbeitet der Browser selbst; größere werden abgewiesen.
- Analyse und Übernahme sind getrennte Schritte: Die Analyse lässt sich abbrechen und ändert nichts, die Übernahme läuft durch.
- Der Bericht nennt je Notiztyp, wie übersetzt wird, wie viele Inhalte und Karten entstehen, wie viel Lernstand übernommen wird, was nur generisch oder gar nicht übernommen wird, welche Medien fehlen und ob die Karten im Originallayout erscheinen. Beispielkarten erscheinen wie im Review. Technische Kennungen erscheinen nicht.
- Jede Anki-Notiz wird ein Inhalt, jede Anki-Karte eine CoRe-Karte; die Stapelhierarchie bleibt vollständig.
- Die Übernahme ist fertig, sobald alles geprüft auf dem Gerät gespeichert und die Medien zum Upload eingereiht sind. Scheitert der Sync danach, bleiben die Karten lokal und lernbar.
- Medien werden erst bei der Übernahme gelesen und gegen ihre Prüfsumme geprüft.
- Fehler beim Lesen des Pakets bleiben sichtbar und werden nicht durch einen stillen Ersatzweg verdeckt.
- Ein laufender Import übersteht den Wechsel in andere App-Bereiche, nicht aber einen Reload.
- **Bewusst nicht:** Serverimport, Upload-Fallback, Text- und Tabellenimport.

### Übersetzung von Anki-Paketen

- Registrierte Übersetzer bilden bekannte Notiztypen auf CoRe-Inhalte mit Feldrollen und Inhaltsform ab. Unbekannte Notiztypen werden generisch als Feldliste übernommen.
- Importierte Inhalte behalten Feldnamen, Feldreihenfolge und Anki-Vorlage; nur die Werte sind bearbeitbar.
- Template-JavaScript und Add-on-Filter werden nicht ausgeführt. Die Quellwerte bleiben unsichtbar erhalten, damit eine spätere Neuübersetzung möglich ist; Abweichungen erscheinen als Hinweis.
- Der Bewertungsverlauf aus Anki wird als Analysehistorie übernommen, soweit Karten eindeutig zuordenbar sind.
- Der erste Lernstand entsteht in dieser Reihenfolge: Nachrechnen der vollständigen Anki-Historie mit dem CoRe-Scheduler, sonst Ankis gespeicherter FSRS-Gedächtniszustand, sonst der klassische Kartenstatus, sonst neue Karte. Nach der ersten Antwort in CoRe gilt nur noch der CoRe-Scheduler.

### Reimport und Neuübersetzung

- Ein Reimport erkennt Inhalte und Karten an ihren Anki-Kennungen, auch wenn sie nur im Konto und nicht auf dem Gerät liegen.
- Unbearbeitete Inhalte übernehmen den Paketinhalt; lokal bearbeitete bleiben unverändert und werden gezählt.
- Lernstand, Aussetzung, Markierung, Flaggen und Stapelzuordnung bleiben immer. Neue Abfragen werden neue Karten; im Paket fehlende Karten bleiben und werden gezählt.
- Tags werden nach [Tags](#tags) zusammengeführt; lokale Stapeleinstellungen bleiben.
- Verbessert sich ein Übersetzer, übersetzt CoRe unbearbeitete Importe einmal automatisch neu, ohne eine Karte mit Lernstand zu verlieren, und nennt die Zahl der verbesserten Inhalte.

### Automatisch aus einer Quelle

Vorbereitet: Der Auftrag lässt sich bis zur Prüfung zusammenstellen. Es werden noch keine Dateien ausgelesen oder übertragen und keine Karten angelegt.

- Ein Auftrag besteht aus Quelle (eine Datei oder eingefügter Text), genau einem Zielstapel (neu oder vorhanden), Lernwünschen und erlaubten Kartenformen.
- Lernwünsche sind Stoffabdeckung, Antwortumfang, Sprache, Formulierung, Vorwissen und freie Wünsche. Abdeckung und Antwortumfang sind unabhängig: Mehr Abdeckung bedeutet mehr Karten, nicht längere Antworten.
- Kartenformen (Frage–Antwort, Lückentext, Single Choice, Multiple Choice) werden erlaubt, nicht erzwungen; passende Abruf-, Verständnis- und Anwendungsfragen werden ohne feste Quoten gemischt.
- Standard ist „nur meine Quelle“. Erlaubte Ergänzungen müssen überall als außerhalb der Quelle gekennzeichnet sein; Belege werden nie erfunden.
- **Bewusst nicht:** Kartenanzahl, Mischungsverhältnisse, Lernzielauswahl.

## 5. Lernen

Die Lernlogik bestimmt Termine, Tagesmenge und den Wechsel zwischen Karte und Varianten. Sie ist eine reine Funktion aus Stapeleinstellungen, Lernstand und Bewertungsverlauf.

### Lernphasen und Bewertungen

```schaubild
Titel: Phasen einer Karte
Folge: Normaler Weg
Neu | noch nie beantwortet
-> erste Antwort
Lernen | Lernschritte nach 1 und 10 Minuten
-> letzter Schritt „Gut“ oder jederzeit „Leicht“
Wiederholung, jung | Abstände in Tagen nach dem Gedächtnismodell
-> Haltbarkeit ab 21 Tagen
[erfolg] Wiederholung, reif | ab der Stapelschwelle können Varianten erscheinen
Pfeil: „Nochmal“ in der Wiederholung zählt als Fehler
Folge: Nach einem Fehler
[gefahr] Wiederlernen | Schritt nach 10 Minuten, die Haltbarkeit bricht ein
-> „Gut“ oder „Leicht“
Wiederholung, jung | zunächst kurze Abstände, bis die Haltbarkeit wieder wächst
```

- Es gibt vier Bewertungen: `Nochmal`, `Schwer`, `Gut`, `Leicht`. Geplant wird mit FSRS-7 und den offiziellen Standardparametern ([ADR-044](decisions.md#adr-044--fsrs-7-scheduler-und-reife-aus-der-haltbarkeit)); eine persönliche Optimierung ist nicht aktiv.
- Standard sind 92 % Zielerinnerung, Lernschritte nach 1 und 10 Minuten und ein Wiederlernschritt nach 10 Minuten; jeder Stapel kann abweichen.
- `Gut` geht einen Lernschritt weiter und führt nach dem letzten in die Wiederholung. `Leicht` beendet die Lernphase sofort. `Schwer` bleibt mit kürzerem Abstand in der Phase. `Nochmal` beginnt die Lernschritte von vorn und führt aus der Wiederholung ins Wiederlernen.
- Eingestellte Lernschritte haben Vorrang vor einem längeren Abstand aus dem Modell.
- Jede Bewertung nennt vorab ihren Abstand; angezeigter und angewandter Wert sind derselbe.
- Jede Bewertung wird als unveränderliches Ereignis mit gemessener Antwortzeit gespeichert; der Lernstand ergibt sich daraus.
- **Bewusst nicht:** KI-Erzeugung beim Antworten; interne Schedulerzustände in der Oberfläche.

### Lernverlauf einer Karte

Die Tabellen und Zeitleisten der Leseseite zu diesem Abschnitt werden mit dem echten Scheduler aus getesteten Beispielketten berechnet. Sie gelten unter festen Annahmen (Antwort am Fälligkeitstermin, Standardlernschritte, eine aktive Variante) und sind keine Zusage für einzelne Karten.

### Reife und Haltbarkeit

- Haltbarkeit sind die Tage, bis die Erinnerung auf 90 % fällt. Sie folgt dem Gedächtnis; eine höhere Zielerinnerung verkürzt nur die Abstände.
- Eine Karte in der Wiederholung ist ab 21 Tagen Haltbarkeit `Reif`, darunter `Jung`; Lern- und Wiederlernphase zählen als `Lernen`.
- Reife wird bei jeder Antwort neu aus dem Lernstand abgeleitet; ein Fehler senkt sie sofort.

### Lerntag und Vorziehen

- Ein Lerntag beginnt zum kontoweiten Tagesbeginn in der Zeitzone des Profils, ersatzweise des Browsers.
- Wiederholungen werden tageweise freigegeben und sind am ganzen Fälligkeitstag verfügbar. Lernschritte haben minutengenaue Termine.
- Das kontoweite Vorziehfenster (Standard 20 Minuten) erlaubt, einen Lernschritt früher zu zeigen, wenn er am selben Lerntag liegt und weniger als das Fenster entfernt ist. Wiederholungen werden nie vorgezogen, und nichts über die Tagesgrenze.
- Eine Sitzung arbeitet zuerst ihre Karten ab und zeigt danach berechtigte Lernschritte. Warten nur noch nicht berechtigte Lernschritte, endet die Runde vorläufig; die Karten bleiben `Offen`.
- Eine von Hand auf einen künftigen Lerntag gesetzte Karte bleibt bis dahin in jeder Phase zurückgestellt.

### Tagesrunde und Limits

```schaubild
Titel: Wie die Tagesrunde eines Stapels entsteht
Folge:
Alle Karten des Stapelbaums
-> ohne ausgesetzte, zurückgestellte, begrabene und Konfliktkarten
Heute relevant | fällige Wiederholungen, Lernschritte, neue Karten
-> Limits des Stapels und seiner Elternstapel
Tagesrunde | Wiederholungen vor neuen Karten
-> Reihenfolge des gestarteten Stapels
[erfolg] Sitzung | stabiler Plan ab dem Start
Pfeil: jede Karte zählt genau einmal
Gruppe: Tagesstand
Neu | ausgewählte neue Karten
Offen | heutige Lernschritte, auch noch nicht verfügbare
Fällig | ausgewählte Wiederholungen
[erfolg] Gelernt | heute beantwortet, kein weiterer Schritt heute
```

- Jeder Stapel hat ein Tageslimit für neue Karten und eines für Wiederholungen. Das Wiederholungslimit umfasst fällige Karten, Lernschritte aus Vortagen und neue Karten; Wiederholungen haben Vorrang.
- Lernschritte desselben Tages umgehen die Limits.
- Wird ein Stapelbaum gelernt, braucht eine Karte Budget in ihrem Stapel und in allen Elternstapeln bis zum gestarteten Stapel. Ein direkt gestarteter Unterstapel beachtet die Eltern darüber nicht.
- Der gestartete Stapel bestimmt die Reihenfolge: fällige zuerst, neue zuerst oder gemischt; neue nach Alter oder stabilem Tageszufall, fällige nach Überfälligkeit oder Abrufwahrscheinlichkeit.
- Der Sitzungsstart bildet einen stabilen Plan. Nachgeladene Karten gehören dazu; ein Nachladefehler verkleinert den Tagesumfang nicht und täuscht keinen Abschluss vor.
- Eine Karte zählt genau einmal, auch wenn sie als Variante oder mehrfach erscheint. Sie ist `Gelernt`, sobald heute kein weiterer Schritt ansteht.
- Halten nur die Limits Karten zurück, sagt CoRe das und nennt, wie viele fällige und neue Karten warten.
- Ist das Tagesziel erreicht, lassen sich für einen Stapel zusätzliche neue Karten nur für den aktuellen Lerntag freigeben. Wiederholungen werden dadurch nicht vorgezogen; eine Änderung des Limits hebt die Freigabe auf.

### Begraben und Zurückstellen

- Wie in Anki lässt sich je Stapel einstellen, ob neue, fällige und tagesübergreifende Lernkarten warten, wenn heute schon eine Geschwisterkarte desselben Inhalts dran war. Standard ist aus.
- Eine begrabene Karte wartet bis zum nächsten Lerntag, verbraucht kein Limit und behält Lernstand und Termin. Lernschritte des Tages werden nie begraben.
- `Zurückstellen` nimmt eine einzelne Karte auf dieselbe Weise bis zum nächsten Lerntag aus Runde und Tageszahlen.
- Beides wird nicht an der Karte gespeichert, sondern folgt aus den Ereignissen des Lerntags; es übersteht Reload und endet mit dem Tagesbeginn.
- Bekannte Abweichung von Anki: Zwei noch unbeantwortete Geschwister zählen in den Tageszahlen bis zur ersten Antwort beide.

### Easy Days

- Je Wochentag gilt kontoweit eine Stufe `Normal`, `Weniger` oder `Minimal` ([ADR-019](decisions.md#adr-019--easy-days-als-globaler-wochenrhythmus)).
- Easy Days verschiebt nur neu berechnete Wiederholungstermine innerhalb des Spielraums, den der Scheduler ohnehin hat, hin zu Tagen mit geringerer erwarteter Last und höherer Stufe.
- Es ändert nur Termin und Abstand, nie den Gedächtniszustand; Vorschau und Speichern rechnen mit derselben Last.

### Lernsitzung

- Vor dem Aufdecken zeigt die Sitzung nur den Lerninhalt, ohne Hinweis auf Herkunft, Variante, Reife oder Planung.
- Sie nennt Stapel und Tagesfortschritt, aber keine Kartenposition.
- Die gezeigte Karte wechselt erst mit ihrer Bewertung; die nächsten Karten samt Medien werden währenddessen vorbereitet.
- Es gibt keinen eigenen Sitzungsstand: Nach Reload, Verlassen und Sync ergibt sich der Fortschritt aus gespeicherten Bewertungen und Lernständen.
- Das Ende nennt die Zahl beantworteter Karten und führt zum Ausgangspunkt zurück. Ein Reload erhält Sitzung und Rückweg; fremde Rücksprungziele werden nicht angenommen.
- Ist ein Stapel oder eine Karte nicht verfügbar, folgt eine verständliche nächste Aktion; nie öffnet sich stillschweigend eine andere Karte.
- Aus der Sitzung heraus wirken sofort: Flagge, Markierung, Aussetzen, Kartenreihenfolge und Timer. Editor und Stapeleinstellungen öffnen sich über der Sitzung und führen an dieselbe Karte zurück.
- Aussetzen pausiert die Karte samt Varianten, ohne ihren Lernstand zu ändern; sie fehlt dann in Runde, Tageszahlen und Fortschritt. Nach dem Reaktivieren ist ein vergangener Termin sofort wieder relevant.
- Löst eine Bewertung die Lernbremse aus, weist die Sitzung einmal darauf hin.
- Inhalte mit Vorlese-Angabe aus Anki lassen sich über die Sprachausgabe des Geräts vorlesen.
- Markierter Text lässt sich in AMBOSS nachschlagen. Erst der ausdrückliche Klick öffnet die Suche; übertragen wird nur der markierte Text.
- Nach dem Aufdecken steht [KI hilft](#ki-hilft) bereit.

### Pomodoro-Timer

- Je Konto gibt es genau einen Timer in diesem Browser. Er läuft mit echter Uhrzeit, übersteht Navigation, Reload und weitere Tabs und nutzt weder das Konto noch die simulierte Lernzeit.
- Er lässt sich aus der Sitzung, von `Heute` und aus den Einstellungen starten, anhalten und zurücksetzen; überall ist es derselbe Timer.
- Ein laufender Timer ist in der ganzen App sichtbar; sein Ablauf wird gemeldet.
- **Bewusst nicht:** Töne, automatische Pausenzyklen.

### Freigabe der Varianten

Bei eingeschaltetem CoRe-Modus wechseln sich gefestigte Karten im Review mit ihren Varianten ab ([ADR-039](decisions.md#adr-039--core-modus-anaus-und-wirksame-variantenregeln)).

```schaubild
Titel: Wann statt der Karte eine Variante abgefragt wird
Folge: Alle vier Bedingungen müssen gelten
CoRe-Modus | im Stapel der Karte eingeschaltet
-> und
Phase | die Karte ist in der Wiederholung
-> und
Letzte Bewertung | war nicht „Nochmal“
-> und
Haltbarkeit | erreicht die Schwelle des Stapels
-> dann
[primär] Wechsel | Karte und aktive Varianten reihum
Pfeil: sonst
Gruppe:
Originalkarte | wird selbst abgefragt; nach einem Fehler so lange, bis sie wieder richtig beantwortet ist
```

- Die Schwelle `Varianten einsetzen ab Haltbarkeit` beträgt je Stapel 7, 21 (Standard) oder 60 Tage.
- Die Originalkarte bleibt Teil des Wechsels. Abgefragt werden höchstens so viele Varianten, wie der Stapel als aktive Varianten pro Karte erlaubt (1 bis 3), die ältesten zuerst.
- Eine Antwort auf eine Variante wirkt auf den Lernstand der Karte wie eine Antwort auf die Karte selbst.
- Nach `Nochmal` bricht die Haltbarkeit ein; Varianten erscheinen erst wieder, wenn die Schwelle erneut erreicht ist.

### Varianten im Review

- Vor der Antwort deutet nichts auf eine Variante hin. Erst danach ist sie gekennzeichnet, und die Originalkarte lässt sich aufdecken.
- Von dort führt der Weg in die Variantenverwaltung der Karte und zurück in die Sitzung.
- Fehlt eine Variante oder ist sie fehlerhaft, wird die Karte selbst abgefragt.
- Eine Variante ersetzt nur Frage und Antwort; Hinweise, Zusatz und Quelle bleiben. Vorgelesen wird nur, was die Variante unverändert übernimmt.
- Persönliche Lerndaten werden nie in einer Variante gespeichert.

### Varianten verwalten

- Jede Variante ist `aktiv`, `abgeschaltet`, `gemeldet` (inhaltlich falsch oder unklar formuliert) oder `veraltet`.
- Ändert sich Frage oder Antwort der Karte, werden ihre aktiven Varianten `veraltet` und nicht mehr abgefragt; das Speichern nennt ihre Zahl.
- Varianten lassen sich bearbeiten, abschalten, reaktivieren, neu erzeugen und löschen. Eine bearbeitete Variante gilt als eigene und wird von einer Neuerzeugung für den Stapel nicht ersetzt.
- Abgeschaltete und gemeldete Varianten lassen sich reaktivieren, solange die Höchstzahl aktiver Varianten nicht erreicht ist; veraltete nicht.
- Löschen entfernt die Variante auf allen Geräten; Karte und Lernstand bleiben.

### CoRe-Modus

- Der CoRe-Modus ist je Stapel `An` oder `Aus`. Varianten entstehen nie automatisch, nur auf ausdrückliche Aktion.
- Das Einschalten erklärt Wirkung, Schwelle und Datenschutz und bietet an, sofort Varianten für die ersten Karten des Stapels zu erzeugen ([Kartenvarianten erzeugen](#kartenvarianten-erzeugen)).
- CoRe-Modus, Schwelle und Zahl aktiver Varianten gehören nicht zu Lernprofilen und bleiben bei einem Profilwechsel unverändert.
- **Bewusst nicht:** ein eigener Lernmodus nur mit oder nur ohne Varianten.

## 6. KI-Funktionen

CoRe nutzt KI an drei Stellen: als Lernhilfe zur aufgedeckten Karte, zum Umformulieren von Karten und zum Zusammenfassen eines Stapels. Ein vierter Einsatz, Karten aus einer Quelle, ist [vorbereitet](#automatisch-aus-einer-quelle).

### Anbindung und Datenschutz

```schaubild
Titel: Weg jeder KI-Anfrage
Folge:
App im Browser | ausdrückliche Aktion; baut den Auftrag aus bereinigtem Text
-> nur angemeldet
Eigene Server-Route | prüft Anmeldung, Herkunft und Größe; hält den Schlüssel
-> ohne Speicherung, ohne Training
[primär] Modell über OpenRouter | ein festes Modell, eine strukturierte Antwort
-> Antwort
Prüfung | Struktur und Grenzen werden validiert
-> nur wenn gültig
[erfolg] Ergebnis in der App | Antwort, Variante oder Entwurf
```

- Jede KI-Funktion hat genau eine schmale, eigene Server-Route ([ADR-011](decisions.md#adr-011--schmale-ki-routen-über-openrouter)). Der Browser spricht nie direkt mit dem Anbieter; der Schlüssel liegt nur auf dem Server.
- Alle Funktionen nutzen dasselbe, serverseitig festgelegte, bezahlte Modell über OpenRouter. Der Anbieter darf Texte weder speichern noch damit trainieren. Welches Modell gilt, nennt [`architecture.md`](architecture.md#api-vertrag).
- An die KI geht nur der bereinigte Text, den die jeweilige Funktion braucht: nie Medien, Tags, Kennungen oder Lerndaten.
- Die KI antwortet in einer vorgegebenen Struktur. Eine Antwort, die die Struktur oder ihre Grenzen verletzt, wird verworfen statt angezeigt.
- KI läuft nur auf ausdrückliche Aktion, nie beim Antworten oder im Hintergrund. Jede Anfrage hat eine feste Frist; Fehler ändern nichts und werden nicht automatisch wiederholt.
- Die Kosten begrenzt das Limit des Schlüssels; jede Anfrage wird mit ihren Kosten protokolliert, ohne Inhalte.
- Prompt, Antwortstruktur oder Modell sollen sich künftig nur mit gemessenem Nachweis ändern ([ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis), vorgeschlagen; Stand unter [KI-Eval](ai-eval.md)).
- **Bewusst nicht:** Modellwahl durch Nutzer, Ersatzmodelle ohne Speicherverbot, Serverwarteschlange, gespeicherte Chatverläufe. Ein Kontingent je Nutzer ist Voraussetzung, bevor die Lernhilfe externen Nutzern offensteht.

### Überblick der KI-Funktionen

| Funktion | Auslöser | Geht an die KI | Kommt zurück | Was daraus wird |
| --- | --- | --- | --- | --- |
| [KI hilft](#ki-hilft) | Frage zur aufgedeckten Karte | Text der Karte wie abgefragt, Hinweis-, Zusatz- und Notizfelder, die Frage, bis zu sechs frühere Antworten | eine Antwort als reiner Text | flüchtiger Verlauf, der mit der Karte endet |
| [Kartenvariante](#kartenvarianten-erzeugen) | Aktion an einer Karte oder für einen Stapel | Frage und Antwort der Karte, Fragen ihrer vorhandenen Varianten | eine Umformulierung von Frage und Antwort | Variante an der Karte, falls neu und Karte unverändert |
| [Zusammenfassung](#ki-zusammenfassung) | Erstellen einer Fassung | lesbare Inhalte des Stapels, optional eine Quelle, die Wünsche als getrennter Auftrag | Abschnitte, Stichpunkte, Belege, Querbezüge | ungespeicherter Entwurf; den Text baut die App |

### KI hilft

Eine Lernhilfe zu genau der Karte, die gerade aufgedeckt ist.

- Angeboten werden Erklären, ein Beispiel und eine eigene Frage.
- Die KI sieht die Karte so, wie sie abgefragt wurde: Bei Lückentext ist nur die eigene Lücke verdeckt, bei Auswahlfragen sind richtige und falsche Optionen benannt. Das Quellenfeld bleibt auf dem Gerät.
- Der Verlauf bleibt nur, solange die Karte offen ist, und wird nie gespeichert; ein Kartenwechsel bricht eine laufende Anfrage ab.
- Bildverdeckungen und Karten ohne lesbaren Text bekommen keine Lernhilfe.
- **Bewusst nicht:** Chat ohne Kartenbezug, Bilder.

### Kartenvarianten erzeugen

Eine Variante fragt denselben Inhalt mit anderer Formulierung ab.

- Varianten gibt es für Frage–Antwort-, Lückentext- und Auswahlkarten; Bildverdeckungen und Karten ohne Fragetext erhalten keine.
- Eine Lückentext-Variante fragt dieselbe Lückengruppe mit derselben Lösung; andere Lücken stehen als Text. Eine Variante mit anderer Lücke, anderer Lösung oder einer Lösung im übrigen Text wird abgewiesen; selbst bearbeitet muss sie Lücke und Lösung behalten.
- Bei einer Karte mit eingetippter Antwort bleibt die Antwort zeichengleich, und die Variante wird ebenfalls eingetippt.
- Ergibt eine Karte keinen erkennbaren Sinn oder ist sie nur mit privatem Kontext verständlich, meldet die KI sie als nicht umformulierbar, statt eine Deutung zu erfinden; es entsteht keine Variante, und die Stapelerzeugung zählt solche Karten getrennt.
- Eine Auswahl-Variante formuliert Frage und Optionen um; jede Option bleibt genau so richtig oder falsch wie auf der Karte. Eine verneinte Frage oder geänderte Optionen werden abgewiesen. Die Variante zeigt die Optionen in einer eigenen, festen Reihenfolge; selbst bearbeitet wird nur die Frage.
- Die KI erhält Frage und Antwort, den Lückentext oder Frage und Optionen in begrenzter Länge und die Fragen vorhandener Varianten, damit die neue sich davon unterscheidet. Sie soll die Frage möglichst anders beginnen als das Original; das ist eine Anweisung, keine Prüfung.
- Gespeichert wird nur, wenn die Karte während der Anfrage unverändert blieb und dieselbe Formulierung noch nicht existiert.
- Eine Karte kann weitere Varianten erhalten, bis die Höchstzahl aktiver Varianten ihres Stapels erreicht ist.
- **Für einen Stapel:** Eine Erzeugung bearbeitet nacheinander die ersten bis zu 50 passenden Karten ohne aktive Variante, je Karte eine Variante, und speichert jede sofort. Ein weiterer Start nimmt die nächsten Karten.
- Die Stapelerzeugung läuft im geöffneten Tab, höchstens eine zur selben Zeit, mit sichtbarem Fortschritt. Abbrechen behält Erzeugtes; ein Fehler, der jede Karte träfe, hält den Lauf an.
- Varianten aus einer älteren Fassung der Erzeugung lassen sich für einen Stapel nach Rückfrage ersetzen; Karten und Lernstand bleiben.

### KI-Zusammenfassung

Aus den Karten eines Stapels entsteht eine gegliederte, belegte Fassung zum Lesen.

- **Material:** die Karten des Stapels, auf Wunsch samt Unterstapeln, und optional eine angehängte Quelle (PDF, Text, Markdown, CSV, TSV). Die Quelle kann die Karten ergänzen oder ersetzen und wird nicht gespeichert.
- Jeder Inhalt geht genau einmal ein, unabhängig von der Zahl seiner Karten; Varianten zählen nicht. Bei Auswahlkarten sind richtige und falsche Optionen unterschieden.
- Das Material wird vor der Anfrage vollständig geladen. Ist es größer als die Obergrenze (3.000 Inhalte oder 400.000 Zeichen), wird die Erstellung sichtbar abgewiesen und nie still gekürzt.
- **Wünsche:** Länge, Detailgrad, Darstellung, Lernziel, Fokus, Sprachniveau, Beispiele, sichtbare Verweise. Länge und Detailgrad sind unabhängig; die Länge ist ein Richtwert von etwa 1–2, 3–5 oder 6–10 Minuten Lesezeit. Die Wünsche bilden einen eigenen Auftrag; Fokus und Material können die Anweisungen nicht überschreiben.
- **Materialtreue:** Die KI darf nur wiedergeben, was im Material steht. Definitionen, Zahlen, Einheiten, Formeln, Verneinungen, Bedingungen und Ausnahmen bleiben erhalten; Widersprüche werden mit beiden Fundstellen genannt, fehlendes Material als Hinweis. Bei knapper Länge haben Fokus und zentrale Konzepte Vorrang. Wenig Material wird nicht aufgefüllt.
- **Antwort:** Hauptabschnitte mit höchstens einer Ebene Unterabschnitten, darin Absätze und Stichpunkte aus Stichwort und Aussage, je Abschnitt Verweise auf das Material und optional belegte Querbezüge zwischen Stichworten.
- Den Text der Fassung baut die App aus dieser Struktur. Verweise auf Karten führen zu vorhandenen Karten, Verweise auf die Quelle nennen Datei und Seite. Unbekannte Verweise, leere Abschnitte und abgeschnittene Antworten werden abgewiesen.
- Das Ergebnis öffnet als ungespeicherter Entwurf; erst das Speichern übernimmt ihn. Modell, Promptfassung und Erstellungszeit bleiben an der Fassung.
- Abbrechen beendet die Anfrage; eine verspätete Antwort wird nicht übernommen. Ein Fehler erhält den Auftrag.
- Bilder, Ton und gescannte Seiten ohne Text werden nicht ausgewertet; was ausgelassen wurde, steht im Ergebnis.
- **Grenze:** Der Prompt allein garantiert keine Faktentreue; deshalb die Belege. Ausgabesprache ist Deutsch.

## 7. Prüfungsplanung

Der Prüfungsplaner verteilt den Stoff aller Prüfungen eines Kontos auf Lerntage und macht daraus Tagesaufgaben, die sich direkt lernen lassen ([ADR-042](decisions.md#adr-042--globaler-prüfungsplaner-mit-gemeinsamer-kontaktplanung)).

### Prüfungsplaner

```schaubild
Titel: Von der Prüfung zur Tagesaufgabe
Folge:
Prüfung | Termin, Ziel, Stapel, Lernstart, Lernzeit
-> alle Prüfungen gemeinsam
Kontaktplanung | rechnet die erwartete Last mit dem echten Scheduler voraus
-> je Lerntag
Tagesaufgaben | je Thema neue Karten und Wiederholungen
-> starten
Prüfungssitzung | normale Sitzung mit der Zielerinnerung der Prüfung
-> Antworten
[erfolg] Fortschritt | gesehen und gefestigt
```

- Prüfungen gehören zum Konto, nicht zu einem Stapel: Mehrere Prüfungen teilen Lernzeit und Karten.
- Geplant werden Kartenmengen, keine Dauer: Es gibt keine Zeitschätzung je Karte.
- Nach tatsächlichen Antworten wird nur noch ungesehener Stoff neu verteilt.
- Der Planer ändert keine Stapeleinstellungen; nach der Prüfung plant der normale Scheduler weiter.
- **Bewusst nicht:** Priorität zwischen Prüfungen, Machbarkeits- oder Zeitplanstatus, Prognose der Beherrschung, Quiz, Altfragen und Prüfungssimulation.

### Prüfung einrichten

- Eine Prüfung hat Name, Termin, Farbe, Ziel, Lernstart, Stapelauswahl, Lernzeit und Themenreihenfolge.
- Das Ziel setzt die Zielerinnerung: „Bestehen“ 85 %, „Gute Note“ 90 % (Standard), „Sehr gute Note“ 95 %, „Bestmöglich abschneiden“ 97 %. Es ist eine Lernabsicht, keine Garantie.
- Der Lernstart ist standardmäßig heute; davor entstehen keine Aufgaben.
- Ein gewählter Oberstapel schließt seine Unterstapel ein, auch später neue; einzelne lassen sich abwählen.
- Der Einführungsstichtag legt fest, wie viele Tage vor der Prüfung die letzte neue Karte eingeführt sein soll; danach wird nur noch wiederholt.
- Unterstapel sind die Themen; ihre Reihenfolge ist je Prüfung änderbar. Innerhalb eines Themas gilt die Erstellreihenfolge.
- Mit Name, künftigem Termin und mindestens einem Stapel lässt sich immer speichern, auch ohne fertige Vorschau. Unrealistische Mengen erzeugen nur einen Hinweis.

### Lernzeit

- Die Lernzeit je Prüfung wird entweder als Lerntage mit durchschnittlichen Minuten oder genau je Wochentag angegeben; einzelne Tage lassen sich ausnehmen.
- Die Planung nutzt nur das Verhältnis der Tage zueinander: Gleichmäßig skalierte Vorgaben ergeben dieselbe Verteilung.
- Prüfungstage bleiben frei.

### Kontaktplanung

- Alle noch ungesehenen Karten aller Prüfungen werden gemeinsam auf die verbleibenden Einführungstage verteilt.
- Teilen sich Prüfungen Stapel, wird jede Karte genau einmal eingeführt, spätestens zum frühesten Stichtag ihrer Prüfungen, und erscheint nur unter der Prüfung, die sie einführt.
- Die erwartete Last (erste Kontakte, Lernschritte, Wiederholungen) wird mit dem echten Scheduler vorausgerechnet. Die bisherige Bewertungsverteilung liefert die Annahmen; ohne ausreichende Historie gilt ein vereinfachter Normalverlauf.
- Ziel ist zuerst die geringste höchste Tageslast im Verhältnis zur Lernzeit, dann wenig Schwankung, dann die prognostizierte Erinnerung. Die Suche ist begrenzt und deterministisch und behauptet kein Optimum.
- Themen werden zusammenhängend eingeführt, ohne spätere vorzuziehen; ganze Themen und Halbierungen werden nahe am Tagesziel bevorzugt. Ein Thema kann einen frühesten Starttag bekommen und schiebt dann spätere mit.
- Stoff, der sich nicht mehr einplanen lässt, bleibt ausdrücklich offen und wird nicht stillschweigend hinter den Stichtag verschoben.
- Heutige Tagesziele bleiben beim Neuberechnen stabil. Eine ausdrückliche Planänderung ersetzt offene Ziele; Erledigtes bleibt.

### Kalender und Lernblöcke

- Der Kalender zeigt Prüfungstermine und je Tag die Lernaufgaben nach Prüfung, als Monat oder Woche; jede Prüfung lässt sich ein- und ausblenden, ohne die Planung zu ändern.
- Ein Lernblock reserviert Zeit an einem Tag. Einer Prüfung zugeordnet, setzt er deren Lernzeit an diesem Tag; ohne Zuordnung ist er eine Notiz ohne Wirkung auf die Verteilung. Blöcke überlappen nicht.
- Änderungen am Kalender werden mit neu berechneter Vorschau ausdrücklich gespeichert oder verworfen.

### Tagesaufgaben und Prüfungssitzung

- Je Thema gibt es eine Aufgabe mit eindeutiger Kartenmenge. Sie startet die Vereinigung ihrer neuen Karten und Wiederholungen; die ganze heutige Einheit lässt sich gemeinsam starten.
- Vorschau, Aufgabenliste und Sitzung nutzen dieselben Zielkarten.
- Prüfungssitzungen sind normale Lernsitzungen mit der Zielerinnerung der Prüfung. Sie gelten ohne die Tageslimits der Stapel und halten die Themenreihenfolge ein.
- Eine Aufgabe gilt automatisch als erledigt, wenn alle ihre Zielkarten seit dem Einplanen bewertet wurden, in der Wiederholung sind und erst nach diesem Lerntag wieder fällig werden. Wird eine Bewertung zurückgenommen, öffnet sie sich wieder.
- Von Hand gesetzte Häkchen sind widerrufbar und ändern keinen Lernstand.
- Die Zielkarten gelten für den aktuellen Lerntag; der nächste Lerntag beginnt eine neue Liste.
- `Heute` zeigt die Aufgaben aller aktiven Prüfungen.

### Leseaufgaben

- Auf Wunsch steht am ersten Einführungstag eines Themas eine Leseaufgabe vor den Karten.
- Sie öffnet vorhandene Zusammenfassungen des Stapels, wird von Hand abgehakt und bleibt je Prüfung und Thema erledigt.
- Sie blockiert das Lernen nicht und erzeugt keine Inhalte.

### Fortschritt und Lebenszyklus

- Der Fortschritt nennt den Anteil `Gesehen` und darin den Anteil `Gefestigt`, bezogen auf alle gewählten Karten.
- Gefestigt ist eine aktive Karte mit der Reife `Reif`; nach `Nochmal` zählt sie nicht mehr. Antworten auf Varianten zählen für die Karte.
- Eine Prüfung lässt sich pausieren, fortsetzen, abschließen und löschen. Ab dem Tag nach ihrem Termin gilt sie als abgeschlossen.
- Löschen entfernt Plan, Lernblöcke und Aufgaben; Karten und Lernstände bleiben.

### Prüfung offline

- Ohne Verbindung gelten die zuletzt gespeicherten Tagesziele. Die Einheit startet mit den Zielkarten, die auf dem Gerät liegen, und nennt den Rest.
- Neu geplant wird nur online, automatisch bei Wiederverbindung.

## 8. Zusammenfassungen und Mindmaps

Zusammenfassungen und Mindmaps verdichten die Karten eines Stapels zu lesbaren Fassungen und einer frei gestaltbaren Landkarte des Stoffs.

```schaubild
Titel: Von den Karten zur Mindmap
Folge:
Material | Karten des Stapels, optional eine Quelle
-> vollständig geladen
[primär] KI-Zusammenfassung | Abschnitte, Stichpunkte, Belege, Querbezüge
-> die App baut den Text
Entwurf | prüfen, bearbeiten, zeichnen
-> Speichern beim Verlassen
Fassung | im Konto, mehrere je Stapel
-> auf dem Gerät, ohne KI
[erfolg] Mindmap | Überschriften werden Äste, Stichworte Karten
```

### Zusammenfassungen

- Ein Stapel hat beliebig viele benannte Fassungen; eine neue überschreibt keine bestehende.
- Eine Fassung entsteht per [KI-Zusammenfassung](#ki-zusammenfassung) oder von Hand aus einem leeren Entwurf.
- Jede Fassung nennt Titel, Umfang, Detailgrad und die aus dem tatsächlichen Text berechnete Lesezeit.
- Fassungen liegen im Konto und erscheinen auf jedem Gerät ([ADR-043](decisions.md#adr-043--zusammenfassungen-und-mindmaps-als-versionierte-online-dokumente)).
- Löschen entfernt eine Fassung auf allen Geräten; daraus erzeugte Mindmap-Karten bleiben.

### Zusammenfassung bearbeiten und speichern

- Die Fassung steht auf einer durchgehenden Schreibfläche mit formatiertem Text und Handzeichnungen.
- Eine Textmarkierung gehört zum Text und wandert mit ihm; freie Striche liegen auf der Zeichenfläche.
- Gespeichert wird beim Verlassen: Ein geänderter Entwurf fragt nach Speichern, Verwerfen oder Weiterbearbeiten. Es gibt kein automatisches Speichern.
- Ohne Verbindung wird lokal gespeichert, als noch nicht synchronisiert gekennzeichnet und beim nächsten Öffnen hochgeladen.
- Hat ein anderes Gerät dieselbe Fassung inzwischen geändert, bleibt dessen Stand; die eigenen Änderungen werden eine eigene „Konfliktfassung“.
- **Bewusst nicht:** Seiten und Seitenformate, Export.

### Mindmap erzeugen

- Jeder Stapel hat genau eine unbegrenzte Fläche; darauf können mehrere Bäume stehen.
- Aus einer gespeicherten Fassung desselben Stapels entsteht ein Baum auf dem Gerät, ohne KI: Überschriften werden Äste, Stichworte, kurze Absätze und Listenpunkte werden Karten, längere Absätze bleiben Text ihrer Abschnittskarte. Materialhinweise und Belege erzeugen keine Karten.
- Belegte Querbezüge aus der Zusammenfassung werden Querverbindungen.
- Jede erzeugte Karte behält ihre Textstelle als unveränderliche Quelle; spätere Änderungen der Zusammenfassung überschreiben sie nicht.
- Erneutes Erzeugen ersetzt den Baum dieser Fassung an seiner Stelle. Wurde er bearbeitet, fragt CoRe: überschreiben, daneben anlegen oder abbrechen. Andere Karten der Fläche bleiben.
- Hat der Stapel noch keine Fassung und ist die Fläche leer, entstehen Zusammenfassung und Mindmap in einem Zug. Eine Mindmap ohne gespeicherte Zusammenfassung entsteht nicht.

### Mindmap bearbeiten und speichern

- Karten sind Stichwortkarten (Text eingeklappt) oder Textkarten (Text sichtbar), mit formatiertem Text und Bildern.
- Die Hierarchie ist zyklenfrei; Querverbindungen sind davon getrennt und dürfen Kreise bilden.
- Eine Klammer fasst benachbarte Geschwister unter einer eigenen, frei schreibbaren Karte zusammen, ohne KI. Eine Umrandung gruppiert Karten nur optisch. Beide lassen sich entfernen, ohne Karten zu verlieren.
- Dazu kommen freie Zeichnungen und freier Text.
- Automatisch platzierte Karten weichen wachsenden Nachbarn aus; von Hand platzierte bleiben, wo sie sind.
- Änderungen speichern automatisch nach kurzer Pause. Rückgängig und Wiederholen umfassen alle Inhaltsänderungen, nicht die Ansicht.
- Die Mindmap liegt samt Bildern im Konto. Ohne Verbindung wird lokal gespeichert und später hochgeladen. Hat ein anderes Gerät inzwischen gespeichert, gewinnt der zuletzt gespeicherte Stand, mit Hinweis.
- Eine Mindmap hat feste Obergrenzen, darunter 2.000 Karten; eine Änderung darüber hinaus wird mit Grenze und aktuellem Wert abgewiesen.
- **Bewusst nicht:** Export, gemeinsames Bearbeiten.

## 9. Überblick und Verwaltung

### Heute

`Heute` ist die Startseite: Tagesstand, Lernstart und persönliche Werkzeuge an einem Ort.

- Die Seite besteht aus frei wählbaren und anordenbaren Bausteinen: Tagesstand, Motivationsimpuls, Lerntimer, aktive Stapel, To-dos, Lern-Heatmap und Prüfungsaufgaben. Anordnung und eigene To-dos gelten je Konto nur in diesem Browser.
- **Erststart:** Ein neues Konto beginnt ohne erfundene Daten. Ohne Stapel führt die Seite zu Import, manueller Karte oder Demo. Demo-Stapel entstehen nur auf ausdrückliche Aktion, einmalig und ohne Lernhistorie.
- **Tagesstand:** Er fasst alle Hauptstapel ohne Doppelzählung in `Gelernt`, `Neu`, `Offen` und `Fällig` zusammen ([Tagesrunde und Limits](#tagesrunde-und-limits)).
- **Lernstart:** Er startet den ersten Hauptstapel in alphabetischer Reihenfolge, der verfügbare Karten hat. Warten nur noch nicht verfügbare Lernschritte, kündigt er späteres Weiterlernen an; ist alles gelernt, meldet er das erreichte Tagesziel und bietet zusätzliche neue Karten an.
- **Motivationsimpuls:** einer von 60 eigenen Lernimpulsen, je Lerntag stabil, auch offline.
- **To-dos:** eigene Aufgaben und Aufgaben aus dem Prüfungsplaner; Planeraufgaben lassen sich direkt lernen. Wird der Baustein entfernt, bleiben die Aufgaben.
- **Aktive Stapel:** höchstens drei Hauptstapel, vorrangig die mit jetzt startbaren Karten.
- **Bewusst nicht:** Zeitprognosen.

### Kartenverwaltung

`Karten` ist die Gesamtverwaltung aller Karten aller Stapel: suchen, auswählen, gemeinsam ändern, pflegen und gezielt lernen.

- Die Kartenverwaltung zeigt eine flache, sortierbare Liste; die Stapelstruktur ordnet `Lernen`. Ein geöffneter Stapel zeigt dieselbe Liste, begrenzt auf seinen Teilbaum.
- Ausgesetzte, markierte, geflaggte und zu klärende Karten bleiben sichtbar und sind als solche gekennzeichnet.
- Suche, Sortierung und Blättern arbeiten über den ganzen Bestand, ohne ihn vollständig zu laden ([Große Bestände](#große-bestände)).
- **Bewusst nicht:** Kartenerstellung und Stapelaktionen an dieser Stelle.

### Kartensuche

- Die Suche umfasst alle Felder, Antwortoptionen und Tags; Stapel, deren Pfad passt, werden zusätzlich als Filter angeboten.
- Sie versteht Ankis Suchschreibweise: Status, Reife, Fälligkeit, Flagge, Tag, Stapel, Inhaltsform, Notiztyp, Zeiträume, Lernwerte und einzelne Felder, mit Verneinung, `or` und Klammern. Dieselben Filter lassen sich ohne Schreibweise zusammenstellen.
- Noch nicht unterstützte Anki-Begriffe werden benannt und als Text gesucht. Die vollständige Schreibweise erklärt die App selbst.
- Online- und Offline-Suche liefern dieselben Treffer ([ADR-048](decisions.md#adr-048--kartensuche-lokal-über-den-vollständigen-katalog)).
- Gespeicherte Suchen gehören zum Konto; relative Begriffe wie „heute“ gelten für den Tag der Anwendung.
- **Bewusst nicht:** reguläre Ausdrücke.

### Massenaktionen und Pflege

- Ausgewählt werden einzelne Karten, Bereiche oder alle Treffer einer Suche.
- Gemeinsame Aktionen: Stapel ändern, Tags hinzufügen und entfernen, Flagge, Markierung, Aussetzen und Reaktivieren, Zurückstellen, Fälligkeit setzen (ein Datum oder ein Zeitraum, in dem jede Karte einen zufälligen Tag bekommt), Lernstand zurücksetzen, Varianten erzeugen, Löschen.
- Jede Aktion fragt nach, nennt danach die Zahl der Karten und lässt sich zurücknehmen. Rückgängig ist eine neue Änderung: Karten, die seither anders geändert wurden, behalten ihren neuen Stand.
- Flagge, Aussetzung und Stapel gelten je Karte, Markierung und Tags für den Inhalt.
- Offline wirken Massenaktionen nur, wenn die betroffenen Karten auf dem Gerät liegen; sonst ändern sie nichts und sagen das.
- **Suchen und Ersetzen** ersetzt wörtlichen Text in Feldern oder Tags der Auswahl, nie Formatierung oder Links, mit Vorschau. Ein Inhalt, dessen Karten sich dadurch ändern würden (etwa eine andere Lückennummer), bleibt unverändert und wird gezählt. Das Ersetzen gilt als lokale Bearbeitung: Ein Reimport überschreibt den Inhalt nicht mehr, betroffene Varianten veralten, der Lernstand bleibt.
- **Duplikate finden** vergleicht Inhalte nach Vorderseite oder einem gewählten Feld, ohne Groß- und Kleinschreibung und mehrfache Leerzeichen, und kann die Gruppen mit einem Tag versehen.
- **Tags verwalten** benennt Tags kontoweit um (samt Untertags; ein vorhandener Name führt zusammen) und löscht sie. Tags existieren nur an Inhalten; ungenutzte gibt es nicht.

### Gezielt lernen und üben

- Treffer einer Suche oder eine Auswahl lassen sich unabhängig von Fälligkeit und Tageslimits lernen, ohne ausgesetzte und heute zurückgestellte Karten.
- **Vorziehen** (Standard) ist eine normale Sitzung mit gespeicherten Bewertungen. Noch nicht fällige Karten zählen als vorgezogene Wiederholung; der Scheduler rechnet mit den tatsächlich vergangenen Tagen. Jede Karte folgt den Optionen ihres Stapels, Geschwister werden nicht zurückgestellt, und Tageslimits werden nicht verbraucht.
- **Nur üben** ändert nichts: kein Lernstand, kein Termin, kein Bewertungsereignis. `Nochmal` und `Schwer` holen die Karte in derselben Übung zurück, `Gut` und `Leicht` beenden sie.

### Karteneditor

Derselbe Editor öffnet sich aus Kartenverwaltung, Stapelinhalten und Sitzung und führt dorthin zurück.

- **Allgemein** wirkt sofort und ist rückgängig: Flagge, Markierung, Aussetzen, Zurückstellen, Neu planen, Verschieben in einen anderen Stapel, Tags. Der Bereich zeigt alle Karten desselben Inhalts und ähnliche Inhalte.
- `Neu planen` setzt nur die Fälligkeit auf den Beginn des gewählten Lerntags; Gedächtniswerte und Aussetzung bleiben.
- **Inhalt** ist ein Entwurf, der ausdrücklich gespeichert wird, mit Vorschau wie beim Lernen. Öffnen und Schließen ohne Eingabe ändert nichts, auch nicht an importiertem Text.
- Vor dem Speichern nennt der Editor die Wirkung: neue Karten (etwa eine Rückrichtung), entfallende Karten (etwa eine gelöschte Lücke) und veraltende Varianten. Der Lernstand entfallender Karten wird erst nach Bestätigung gelöscht; neue Abfragen werden neue Karten im Stapel des Inhalts.
- Eine gespeicherte Inhaltsänderung macht den Inhalt lokal bearbeitet; ein Reimport überschreibt ihn dann nicht mehr.
- Importierte Inhalte behalten ihr Feldschema und ihre Abfragen; nur eigene Inhalte lassen sich in Lernrichtung, Bausteinen und Masken umbauen.
- **Varianten** zeigt Original und Varianten nebeneinander, mit Zustand, Aktionen und der Auskunft, ob die Karte die Schwelle erreicht hat ([Varianten verwalten](#varianten-verwalten)).
- **Lernen** zeigt Fälligkeit, Haltbarkeit, Abrufwahrscheinlichkeit, Schwierigkeit, Wiederholungen, Fehler, Reife und Lernbremse, dazu den Abrufverlauf und alle Bewertungen.
- `Lernstand zurücksetzen` setzt die Zähler auf null und hebt die Lernbremse auf; die Karte wird wieder wie eine neue gelernt. Der Verlauf bleibt und erhält einen manuellen Eintrag.

### Karten löschen und duplizieren

- Löschen verlangt eine Bestätigung und betrifft den Inhalt mit allen seinen Karten, auch in anderen Stapeln und auf allen Geräten.
- Gelöscht wird sofort auf dem Gerät; ein ausstehender Sync hält das nicht auf. Rückgängig stellt die Karten samt Lernstand wieder her.
- Duplizieren legt einen eigenständigen Inhalt mit neuen Karten in denselben Stapeln an: Felder, Tags und Medien bleiben, der Lernstand beginnt neu.

### Statistik

Die Statistik zeigt Lernaktivität, Planung und Gedächtnismodell für gewählte Stapel und Zeiträume ([ADR-015](decisions.md#adr-015--globale-fsrs-statistik-und-anki-historie)).

- Ein gemeinsamer Filter aus Zeitraum und Umfang (ganze Sammlung oder Stapel, Unterstapel ohne Doppelzählung) steuert alle Bereiche außer der Heatmap.
- Die Bereiche sind Überblick, Lernaktivität, Planung und Kartenbestand, Gedächtnismodell, Antwortverhalten und Stapelvergleich.
- Drei Arten von Werten bleiben unterscheidbar: Historie (was gelernt wurde), Momentaufnahme (heutiger Stand von Reife, Schwierigkeit, Haltbarkeit, Abrufwahrscheinlichkeit) und Ausblick (Rückstand und künftige Fälligkeiten).
- Verteilungen des Kartenbestands (Intervalle, Stabilität, Schwierigkeit, Abrufwahrscheinlichkeit) haben feste Töpfe, die immer vollständig erscheinen; Schwierigkeit, Stabilität und Abrufwahrscheinlichkeit zählen nur bereits gelernte Karten.
- Ausgewertet wird im Konto; noch nicht synchronisierte Bewertungen fließen sofort ein.
- Die wahre Erinnerungsquote zählt je Karte und Lerntag nur die erste Wiederholung nach mindestens einem Tag Abstand.
- Historische Kategorien folgen Anki und dem Zustand vor der Antwort; der Kartenstatus zählt die Reife.
- Die Lern-Heatmap zeigt Aktivität je Lerntag und den Streak der gewählten Stapel; ein Lerntag zählt ab einer gültigen Bewertung. Für die Zukunft zeigt sie je aktiver Karte genau deren nächste Fälligkeit, ohne Folgetermine zu simulieren.
- Fehlen Historie, Zeitmessung oder Stichprobe, wird das erklärt; es werden keine Nullwerte erfunden.
- **Bewusst nicht:** Ankis klassische Leichtigkeit.

### Einstellungen und Geltungsbereiche

Jede Einstellung gilt für genau einen Bereich.

| Gilt für | Einstellungen |
| --- | --- |
| Konto, auf allen Geräten | Tagesbeginn, Vorziehfenster, Easy Days, Lernprofile, Standard für neue Stapel, Flaggennamen, gespeicherte Suchen, Prüfungspläne |
| Einen Stapel | Tageslimits, Reihenfolge und Sortierung, Begraben, Lernschritte, Zielerinnerung, maximales Intervall, CoRe-Modus, Variantenschwelle, aktive Varianten, Lernbremse, Name und Aussehen, Offline-Nutzung |
| Diesen Browser | heller oder dunkler Modus, Anordnung von `Heute` und eigene To-dos, Pomodoro-Timer, Simulationsuhr |

- Einstellungen werden als Entwurf geändert und ausdrücklich gespeichert oder verworfen; ein ungespeicherter Entwurf hält jedes Verlassen auf.
- Stapeleinstellungen lassen sich für nur diesen Stapel oder samt Unterstapeln speichern; übertragen werden dabei nur die geänderten Werte.
- Kontowerte werden nie in Stapel kopiert und von Lernprofilen nicht verändert.
- Sofort, ohne Entwurf, wirken das Anwenden eines Lernprofils, der manuelle Sync und die Lerneinstellungen einer laufenden Sitzung.
- Version und Rechtstexte stehen nur in den Einstellungen.

### Tagesrunde und Lernprofile

- Ein Lernprofil ist eine kontoweite Vorlage für Tageslimits, maximales Intervall, Reihenfolge, Sortierung und Begraben ([ADR-018](decisions.md#adr-018--lernprofile-als-copy-on-apply-vorlagen)).
- Feste Vorlagen sind `Standard` (20 neue Karten, 200 Wiederholungen, höchstens 1.000 Tage Abstand), `Intensiv` (30, 300, 365) und `Entspannt` (10, 100, 2.000); eigene Profile kommen dazu.
- Anwenden kopiert die Werte in genau einen Stapel oder in den Standard für neue Stapel. Es gibt keine Vererbung: Ein später geändertes, umbenanntes oder gelöschtes Profil ändert keinen Stapel; eine neuere Fassung lässt sich bewusst erneut anwenden.
- Der Standard lässt sich für alle neuen Stapel speichern oder zusätzlich in alle vorhandenen kopieren; Name, Hierarchie, CoRe-Modus, Karten und Verlauf bleiben dabei.

### Konto und Anmeldung

- Angemeldet wird mit E-Mail und Passwort.
- Das Profil enthält Anzeigename und Login-E-Mail. Die Oberfläche ist deutsch.
- Sicherheitskritische Aktionen sind von Profil- und Lernoptionen getrennt.

### Hilfe

- Die Hilfe erklärt in zwei geführten Geschichten, warum CoRe Abrufreize wechselt (Active Recall wird Smarter Recall) und wie der Scheduler plant (Spaced Repetition wird Content Repetition).
- Sie erklärt Abrufwahrscheinlichkeit, Haltbarkeit und Schwierigkeit qualitativ, ohne scheinbar exakte Werte, und verspricht keine feste Wiederholungsnummer für Varianten.
- Ein Nachschlageteil erklärt Prüfungssitzung und Kartenverwaltung samt Suchschreibweise.
- Die Hilfe verändert weder Karten noch Lernstand; ihre Aussagen stimmen mit Kapitel [Lernen](#5-lernen) überein.

### Simulator

Der Simulator verschiebt die Lernzeit der eigenen Karten in die Zukunft, um Planung und Verlauf zu prüfen ([ADR-013](decisions.md#adr-013--transiente-lernuhr-für-echte-accountkarten)).

- Das Umstellen der Uhr verändert keine Karte. Alle Bereiche rechnen dann mit demselben simulierten Zeitpunkt.
- Bewertungen im Zukunftsmodus sind echte Bewertungen mit simuliertem Zeitpunkt und gehen den normalen Speicher- und Syncweg. Die Rückkehr zu heute setzt nur die Uhr zurück; solche Bewertungen bleiben.
- Die Simulation gilt nur in diesem Browser und endet mit Reload oder Abmelden. Eine aktive Simulation ist überall sichtbar; während einer Sitzung lässt sich die Zeit nicht umstellen.
- Sync, Anmeldung, Medien und Bearbeitungszeiten nutzen immer die echte Uhr.

## 10. Sync, Offline und Rückgängig

### Lokal zuerst

Jede Änderung wird zuerst auf dem Gerät gespeichert und danach mit dem Konto synchronisiert ([ADR-034](decisions.md#adr-034--persistenz-web-replica-und-sync)).

```schaubild
Titel: Weg einer Änderung
Folge:
Änderung | Bewertung, Bearbeitung, Import
-> sofort
Auf dem Gerät gespeichert | übersteht Reload und Browserende
-> Sync
[info] Konto | erst senden, dann laden, dann Status
-> nächster Sync dort
Andere Geräte
Pfeil: nur wenn zwei Geräte dieselbe Sache unterschiedlich geändert haben
Gruppe:
[warnung] Konflikt | betrifft nur diese Karte oder diesen Stapel und wartet auf eine Entscheidung
```

- Ausstehende Änderungen gelten nie als gespeichert im Konto und sind als ausstehend erkennbar.
- Die App ist ohne Netz nutzbar, soweit die Daten auf dem Gerät liegen.

### Sync und Konflikte

- Ein Sync sendet zuerst lokale Änderungen, lädt dann Neues aus dem Konto und aktualisiert zuletzt den Status. Manueller und automatischer Sync sind derselbe Ablauf.
- Der automatische Sync läuft nach Änderungen, bei Netzrückkehr und in einem wählbaren Intervall; er lässt sich abschalten, dann wird von Hand synchronisiert.
- Solange alles läuft, meldet die App nichts; sichtbar werden nur Offline, Fehler und Konflikte.
- Lernstand und Inhalt sind getrennt: Eine Bewertung auf einem Gerät und eine Inhaltskorrektur auf einem anderen erzeugen keinen Konflikt.
- Bewertungen gehen nie verloren: Die Ereignisse beider Geräte bleiben, das jüngste bestimmt den Lernstand. Bei Neuplanungen bestimmt die spätere Aktion den Termin.
- Ein Konflikt betrifft nur seine Karte oder seinen Stapel. Vor der Entscheidung zwischen dem Stand dieses Browsers und dem des Kontos zeigt CoRe die Folgen beider Richtungen.
- Konfliktkarten bleiben bis zur Entscheidung außerhalb der Lernrunde und sind in der Kartenverwaltung gekennzeichnet.
- Status und Konflikte sind ohne technische Begriffe verständlich.

### App-Start und neues Gerät

- Ein eingerichtetes Gerät zeigt sofort den lokalen Stand, vor jedem Netzabgleich, und startet auch offline mit der gespeicherten Anmeldung ([ADR-038](decisions.md#adr-038--anmeldung-und-sitzungsstart)).
- Online bestätigt der Server die Anmeldung parallel; lehnt er sie ab, erscheint die Anmeldung mit Hinweis.
- Ein neues Gerät wartet nur auf den ersten Teil der Kontodaten; der Rest lädt fortsetzbar im Hintergrund.
- Scheitert dieser erste Abruf, bietet CoRe Wiederholen an und zeigt nie ein scheinbar leeres Konto.

### Große Bestände

- Start, Kartenliste und Lernstart laden nie ganze Stapel, sondern ein Verzeichnis aller Karten und die Inhalte bei Bedarf.
- Liegt das Verzeichnis vollständig auf dem Gerät, laufen Suche, Sortierung und Blättern lokal, online wie offline.
- Solange es unvollständig ist, ergänzt online das Konto die Suche; offline wird nur durchsucht, was vorhanden ist, und das wird gesagt.

### Offline lernen

- Eine Sitzung hält die nächsten Karteninhalte vor, bei sparsamer oder langsamer Verbindung weniger.
- Fällt das Netz aus, läuft die Sitzung mit dem Vorrat weiter und pausiert dann, ohne fällige Karten zu überspringen; bei Netzrückkehr lädt sie selbst weiter.
- Ein Stapel lässt sich ausdrücklich offline verfügbar machen: Karten, Inhalte, Varianten und Medien werden fortsetzbar geladen und gelten erst nach Prüfung auf Vollständigkeit als verfügbar.

### Speicherplatz

- Wird der Speicher knapp, entfernt CoRe nur Inhalte und Medien, die im Konto bestätigt und nicht ausdrücklich offline verfügbar gemacht sind. Ausstehende Änderungen, Konflikte, Downloads und gerade gelernte Karten bleiben.
- Die Einstellungen zeigen, ob der Speicher dauerhaft ist und wie viel belegt und frei ist. Ohne dauerhafte Speicherfreigabe kann der Browser Daten entfernen.
- Programmteile werden erst bei absehbarer Nutzung vorgeladen, nie pauschal bei sparsamer oder langsamer Verbindung.

### Rückgängig und manuelle Ereignisse

- Sofortaktionen an Karten lassen sich direkt zurücknehmen. Rückgängig ist eine neue, synchronisierte Änderung; hat sich die Karte inzwischen geändert, entfällt es mit Hinweis.
- Neu planen, Lernstand zurücksetzen, Lernbremse setzen oder zurücksetzen, Zurückstellen und ihr Rückgängig sind je genau ein manuelles Ereignis im Verlauf. Es zählt nicht als Lernen und kollidiert nie mit Bewertungen oder Inhaltsänderungen anderer Geräte.
- Das Rückgängig einer Löschung stellt dieselbe Karte mit demselben Lernstand wieder her.
- **Bewusst nicht:** ein wiederherstellbarer Versionsverlauf von Karteninhalten.

## 11. Qualität und Abnahme

### Sicherheit und Datenschutz

- Kontodaten und Inhalte sind nur für ihr Konto lesbar und schreibbar.
- Geheimnisse liegen nur auf dem Server und nie in Protokollen.
- Daten von außen (Pakete, Dateien, KI-Antworten, Kontodaten) werden vor dem Speichern geprüft.
- Inhalte verlassen CoRe nur über die [KI-Funktionen](#6-ki-funktionen) und die ausdrücklich angeklickte AMBOSS-Suche.
- Datenschutztexte versprechen nur, was technisch wirksam ist.

### Bedienbarkeit

- CoRe ist auf Desktop und Smartphone vollständig bedienbar; die abzunehmenden Größen nennt die [visuelle Pflichtmatrix](test-portfolio.md#visuelle-pflichtmatrix).
- Kernabläufe funktionieren mit Tastatur, Touch und Screenreader, bei 200 % Zoom und mit reduzierter Bewegung. Bedeutung wird nie nur durch Farbe vermittelt.
- Abbrechen eines Dialogs verändert keine Fachdaten.
- Texte sind korrektes Deutsch; technische Bezeichnungen gelangen nicht ungefiltert in die Oberfläche.
- Es gibt einen hellen und einen dunklen Modus, von Hand gewählt. Die Designsprache regelt [ADR-046](decisions.md#adr-046--vollständige-toolbox-designsprache), die Bausteine zeigt der [UI-Katalog](ui-elements.html).
- Hinweistexte erklären nur Folgen, Abwägungen und nicht offensichtliches Verhalten.

### Rückmeldungen und Zuverlässigkeit

- Jeder Ablauf, der warten muss, hat einen Lade-, Fehler-, Wiederholen- und Erfolgszustand.
- Fehler, laufende Vorgänge und Ergebnisse mit Folgeaktion bleiben an ihrer Stelle sichtbar; kurze Erfolge erscheinen vorübergehend.
- Ein ungespeicherter Entwurf geht nie stillschweigend verloren: Verlassen, Schließen und Reload fragen nach.
- Ausstehende Änderungen und Konflikte überleben Reload und Browserende.
- Fehler werden nicht durch stille Ersatzwege verdeckt.
- Ein Release braucht die Betriebsfreigabe aus [`operations.md`](operations.md).

### Performance

- Der lokale Stand erscheint vor dem Netz; Sync blockiert nie den Start.
- Eine Bewertung ist gespeichert, bevor die nächste Karte erscheint.
- CoRe zeichnet die Dauer von Start, Aufdecken, Bewertung und Kartensuche nur auf dem Gerät auf, ohne Inhalte. Übertragen wird nichts; Lernende kopieren die Zusammenfassung selbst und geben sie weiter, wenn sie wollen ([ADR-050](decisions.md#adr-050--leistungsdaten-nur-lokal)).
- Zielwerte und Messung stehen unter [Performance-Gates](test-portfolio.md#performance-gates).

### Beta-Abnahme

Der Beta-Kern gilt als erfüllt, wenn:

1. alle neun [Kernjourneys](#3-kernjourneys) automatisiert und manuell bestehen;
2. ein neuer Account, kleiner Import, manuelle Erstellung, Review und Reload ohne Entwicklerwissen bedienbar sind;
3. eine Variante vor dem Aufdecken nicht erkennbar ist;
4. keine Labs-Navigation, Labs-Route oder ausgemusterte API ausgeliefert wird;
5. keine sichtbare Einstellung eine nicht vorhandene Wirkung verspricht;
6. Zielgrößen, Tastatur, Screenreader, Zoom, lange Inhalte und mindestens ein realistischer Fehlerfall abgenommen sind;
7. keine Blocker oder ungeklärten hohen Reibungsverluste aus moderierten Tests verbleiben;
8. automatisierte Tests konkrete Produkt- und Sicherheitsverträge schützen, ohne Testanzahl als Produktabnahme zu behandeln.

Offene Gates und Nachweise stehen ausschließlich in [`todo.md`](todo.md).
