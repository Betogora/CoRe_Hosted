# Specs

**Stand:** 2026-11-05

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

Die verbindliche Reifeentscheidung steht in [ADR-001](decisions.md#adr-001--produktumfang-nur-mit-auftrag), der aktuelle Stand in [`status.md`](status.md).

### Core

- E-Mail-/Passwort-Account und verständlicher leerer Zustand.
- Heute-Dashboard und klarer Lernstart.
- APKG-Import bis 2 GiB.
- Manuelle Stapel- und Kartenerstellung einschließlich Bildverdeckung mit Masken-Editor.
- Karten- und Stapelverwaltung.
- Review mit vier Bewertungen und Content Repetition; nach der Antwort ist die zugrunde liegende Karte einsehbar.
- Prüfungsplanung mit Kalender, Tagesaufgaben und Prüfungssitzungen.
- Zusammenfassungen und Mindmaps je Stapel.
- Simulator für die Lernzeit.
- Direkt erreichbare Hilfe zu FSRS, CoRe und Varianten.
- Accountgebundene Speicherung mit Sync- und Konfliktstatus.
- Grundlegende Statistik und verständliche Einstellungen.

### Disabled

- Anki-Pakete über 2 GiB; sie werden lokal abgewiesen.
- Google und Magic Link, solange ihr jeweiliges Auth-Flag deaktiviert ist.
- DOCX als Quelle der manuellen Erstellung und der Zusammenfassungen sowie OCR. Nur die [automatische Erstellung](#automatisch-aus-einer-quelle) nimmt DOCX und PPTX als Quelle ihres Auftrags an.
- Vollständige Art.-15-Auskunft und Account-Löschung.

## 4. Domänensprache

Abweichende Code- und Tabellennamen erklärt [`architecture.md`](architecture.md#inhalte-und-karten). Verbindlich sind die hier und in den Bereichen zitierten fachlichen Begriffe; für alle übrigen Bedienelemente legen die Specs Funktion und Wirkung fest, nicht Beschriftung, Anordnung oder Aussehen.

| Begriff | Produktbedeutung |
| --- | --- |
| Deck / Stapel | Hierarchisch organisierte Sammlung von Karten und Lernoptionen |
| Inhalt (Note) | Einmal gespeicherte Felder mit Rollen, Tags, Medien und Markierung; erzeugt eine oder mehrere Karten |
| Tag | Schlagwort eines Inhalts im Anki-Format; `::` bildet die Hierarchie, Groß-/Kleinschreibung spielt keine Rolle |
| Flagge | Farbige Kennzeichnung einer Karte (1–7 wie in Anki), auf Wunsch mit eigenem Namen |
| Lernbremse | Zustand einer Karte, die wiederholt vergessen wurde (Anki „Leech“); getrennt von der Aussetzung |
| Zurückstellen | Eine Karte bis zum nächsten Lerntag aus der Runde nehmen, wie begrabene Geschwister |
| Karte (Card) | Eigenständig planbare Abfrage eines Inhalts mit Stapel, eigenem Lernstand, Aussetzung und Varianten |
| Variante (Card Variant) | KI-Umformulierung einer Karte ohne eigenen Lernstand oder Termin |
| CoRe-Modus | Stapeleinstellung `An` oder `Aus` für Content Repetition |
| Haltbarkeit | Tage, bis die Erinnerung an eine Karte auf 90 % fällt; aus dem FSRS-7-Gedächtniszustand berechnet und unabhängig von der Zielerinnerung |
| Reife | Aus dem Lernstand abgeleitete Stufe einer Karte: `Neu`, `Lernen` (Lern- und Wiederlernphase), `Jung` und `Reif` (Wiederholung ab 21 Tagen Haltbarkeit); nie gesammelt oder gezählt |
| Review State | Persönlicher Schedulingzustand einer Karte |
| Review Event | Unveränderliches Bewertungsereignis oder manuelles Ereignis (Neu planen, Lernstand zurücksetzen, Lernbremse, Zurückstellen, Rückgängig) |

## 5. Kernjourneys

Jede Journey nennt Zweck, Ablauf und Akzeptanz. Die verbindlichen Regeln stehen in den verlinkten Bereichsabschnitten; eine Journey ist bestanden, wenn ihr Ablauf ohne Entwicklerwissen gelingt und alle verlinkten Regeln erfüllt sind.

### Account öffnen und Produktzustand verstehen

Ein neuer oder bestehender Account zeigt sofort, was CoRe kann und was als Nächstes zu tun ist.

Ablauf:

1. Anmelden oder registrieren.
2. Leeren oder bestehenden Account sehen.
3. Import, manuelle Karte oder Demo wählen.
4. Tagesstand und Lernaktion auf `Heute` sehen.

Akzeptanz:

- Anmeldung, Profil und Login-E-Mail folgen [Konto und Anmeldung](#konto-und-anmeldung).
- Der leere Account und die Demo folgen [Erststart und Demo](#erststart-und-demo).
- `Heute` folgt [Heute-Dashboard](#heute-dashboard) und [Dein Lernen heute](#dein-lernen-heute).
- Sync-, Offline- und Konfliktstatus folgen [Sync-Status und Konflikte](#sync-status-und-konflikte).
- Datenschutztexte folgen [Sicherheit und Datenschutz](#sicherheit-und-datenschutz).

### Stapel importieren oder manuell anlegen

Vorhandene Anki-Stapel und neue Karten gelangen ohne Datenverlust in CoRe.

Ablauf:

1. `Erstellen` öffnen und einen Weg wählen.
2. APKG analysieren oder Karte eingeben.
3. Vorschau und Inhalt prüfen.
4. Lokal speichern.
5. Synchronisierung oder Teilabschluss sehen.

Akzeptanz:

- Die Wege folgen [Erstellungswege](#erstellungswege).
- Der Import folgt [APKG-Import](#apkg-import), [Import übernehmen und Abschluss](#import-übernehmen-und-abschluss) und [Import und Reimport](#17-import-und-reimport).
- Die manuelle Erstellung folgt [Manuell erstellen](#manuell-erstellen), [Manuell speichern und abschließen](#manuell-speichern-und-abschließen) und [Bildverdeckung](#bildverdeckung).
- Die automatische Erstellung folgt [Automatisch aus einer Quelle](#automatisch-aus-einer-quelle).

### Karten bearbeiten und eine Sitzung starten

Stapel und Karten lassen sich ordnen, prüfen und bearbeiten; eine Sitzung startet mit der ersten verfügbaren Karte.

Ablauf:

1. `Lernen` oder `Karten` öffnen.
2. Stapel und Karten verwalten.
3. Inhalt und Lernwerte prüfen.
4. Sitzung vorbereiten.
5. Erste verfügbare Karte lernen.

Akzeptanz:

- Navigation und Seitenkopf folgen [App-Shell und Navigation](#app-shell-und-navigation).
- Stapel folgen [Stapelübersicht](#stapelübersicht), [Stapelbäume](#stapelbäume), [Stapeloptionen, Verschieben und Löschen](#stapeloptionen-verschieben-und-löschen) und [Stapelinhalte](#stapelinhalte).
- Karten folgen [Kartenverwaltung](#kartenverwaltung), [Kartensuche](#kartensuche), [Karten löschen](#karten-löschen) und [Kartendetail und Editor](#kartendetail-und-editor).
- Lern- und Stapelwerte folgen [Tagesrunde und Lernprofile](#tagesrunde-und-lernprofile), [Stapeleinstellungen](#stapeleinstellungen) und [Speicherleiste](#speicherleiste).
- Der Start folgt [Start, Ende und Wiederaufnahme](#start-ende-und-wiederaufnahme).

### Karte bewerten, neu laden und fortfahren

Eine Sitzung bleibt über Bewertung, Reload und Netzausfall vorhersehbar.

Ablauf:

1. Frage sehen.
2. Antwort aufdecken.
3. `Nochmal`, `Schwer`, `Gut` oder `Leicht` wählen.
4. Bewertung lokal sichern.
5. Nächste Karte, Lernschritt oder Abschluss sehen.

Akzeptanz:

- Die Sitzung folgt [Lernsitzung](#lernsitzung), [Werkzeuge auf der Karte](#werkzeuge-auf-der-karte) und [Sitzungs-Overlay](#sitzungs-overlay).
- Tagesmenge und Planung folgen [Tagesmenge und Limits](#tagesmenge-und-limits), [Scheduler](#scheduler) und [Vorziehen und Lerntag](#vorziehen-und-lerntag).
- Reload, Rückkehr und Abschluss folgen [Start, Ende und Wiederaufnahme](#start-ende-und-wiederaufnahme).
- Offline-Lernen folgt [Offline lernen und Downloads](#offline-lernen-und-downloads).

### CoRe-Variante lernen und Ursprung prüfen

Reife Karten erscheinen im Wechsel mit ihren KI-Umformulierungen; die Herkunft bleibt bis zur Antwort verborgen.

Ablauf:

1. Geeignete Karte lernen.
2. Original oder KI-Umformulierung sehen.
3. Antwort aufdecken.
4. Ursprung prüfen und Varianten verwalten.

Akzeptanz:

- Wann Varianten erscheinen, regelt [Freigabe der Varianten](#freigabe-der-varianten); Beispiele zeigt [Lernverlauf einer Karte](#lernverlauf-einer-karte).
- Darstellung und Ursprung folgen [Varianten im Review](#varianten-im-review).
- Erzeugen und Verwalten folgen [Varianten erzeugen](#varianten-erzeugen), [Varianten verwalten](#varianten-verwalten) und [CoRe-Modus und Stapelgenerierung](#core-modus-und-stapelgenerierung).

### Prüfung planen und vorbereiten

Eine oder mehrere Prüfungen verteilen den Lernstoff bis zum Termin auf Tagesaufgaben, die sich direkt lernen lassen.

Ablauf:

1. `Prüfung` öffnen.
2. Prüfung, Lernstoff und Lernzeit einrichten.
3. Plan in der Vorschau prüfen und speichern.
4. Tagesaufgaben auf `Heute` oder im Planer lernen.
5. Fortschritt der Prüfung verfolgen.

Akzeptanz:

- Einstieg und Einrichtung folgen [Prüfungsübersicht](#prüfungsübersicht), [Prüfung einrichten](#prüfung-einrichten) und [Lernzeit je Klausur](#lernzeit-je-klausur).
- Die Verteilung folgt [Kontaktplanung und Themen](#kontaktplanung-und-themen) und [Plan-Vorschau](#plan-vorschau).
- Kalender und Lernblöcke folgen [Prüfungskalender](#prüfungskalender), [Wochenansicht und Lernblöcke](#wochenansicht-und-lernblöcke) und [Tagesansicht im Kalender](#tagesansicht-im-kalender).
- Lernen und Fortschritt folgen [Tagesaufgaben und Prüfungssitzung](#tagesaufgaben-und-prüfungssitzung), [Leseaufgaben vor neuen Themen](#leseaufgaben-vor-neuen-themen), [Prüfungskarten](#prüfungskarten) und [Prüfung offline](#prüfung-offline).

### Zusammenfassung und Mindmap erstellen

Aus den Karten eines Stapels entsteht eine überprüfbare Zusammenfassung und daraus eine bearbeitbare Mindmap.

Ablauf:

1. Stapelinhalte öffnen.
2. Zusammenfassung mit KI erstellen oder selbst schreiben.
3. Fassung bearbeiten und beim Verlassen speichern.
4. Mindmap aus der Zusammenfassung erzeugen.
5. Mindmap gestalten; sie speichert automatisch.

Akzeptanz:

- Zusammenfassungen folgen [Zusammenfassungsliste](#zusammenfassungsliste), [KI-Erstellung einer Zusammenfassung](#ki-erstellung-einer-zusammenfassung), [Zusammenfassungseditor](#zusammenfassungseditor) und [Zusammenfassungen speichern](#zusammenfassungen-speichern).
- Mindmaps folgen [Mindmap anlegen und erzeugen](#mindmap-anlegen-und-erzeugen), [Mindmap-Karten bearbeiten](#mindmap-karten-bearbeiten), [Mindmap-Struktur und Werkzeuge](#mindmap-struktur-und-werkzeuge), [Mindmap bedienen](#mindmap-bedienen) und [Mindmap gestalten und speichern](#mindmap-gestalten-und-speichern).

### Lernlogik verstehen

Die Hilfe erklärt, warum CoRe Abrufreize wechselt und wie FSRS plant, ohne den Lernstand zu verändern.

Ablauf:

1. Hilfe öffnen.
2. Active Recall und Spaced Repetition verstehen.
3. Smarter Recall und Content Repetition verstehen.
4. FSRS und Varianten nachvollziehen.

Akzeptanz:

- Inhalt und Bedienung folgen [Hilfe](#hilfe), [Hilfe: Active Recall](#hilfe-active-recall) und [Hilfe: Spaced Repetition und FSRS](#hilfe-spaced-repetition-und-fsrs).
- Erklärte Regeln stimmen mit [Scheduler](#scheduler), [Reife und Haltbarkeit](#reife-und-haltbarkeit) und [Freigabe der Varianten](#freigabe-der-varianten) überein.

### Lernfortschritt über simulierte Tage prüfen

Der Simulator zeigt, wie sich vorhandene Karten über Minuten und Tage entwickeln, ohne Karten durch bloßes Umstellen zu verändern.

Ablauf:

1. Simulator öffnen.
2. Lernzeit verschieben.
3. Verfügbare Karten und Planung prüfen.
4. Bei Bedarf bewerten oder Zeit zurücksetzen.

Akzeptanz:

- Bedienung und Wirkung folgen [Simulator](#simulator).
- Bewertungen im Zukunftsmodus folgen [Scheduler](#scheduler) und [Sync-Status und Konflikte](#sync-status-und-konflikte).

## 6. Heute

`Heute` ist die Startseite: Tagesstand, Lernstart und persönliche Werkzeuge an einem Ort.

### Heute-Dashboard

Zweck:

Die befüllte Heute-Seite ist ein modulares Dashboard aus Widgets.

Einstieg:

Hauptreiter `Heute` oder der Schriftzug `CoRe` (siehe [App-Shell und Navigation](#app-shell-und-navigation)).

Verhalten:

- Vorausgewählt sind `Dein Lernen heute`, `Dein Motivationsimpuls`, `Lerntimer`, `Aktive Stapel`, `To-dos` und die Lern-Heatmap.
- Die Begrüßung nennt den Profilnamen.
- Die Lern-Heatmap folgt [Lern-Heatmap](#lern-heatmap), das Prüfungswidget [Tagesaufgaben und Prüfungssitzung](#tagesaufgaben-und-prüfungssitzung).

### Erststart und Demo

Verhalten:

- Neue Accounts starten ohne erfundene Profildaten, Demo-Stapel oder fremde Lernhistorie. Ohne Stapel erklärt das Dashboard den Kernnutzen und führt zu Import, manueller Karte oder bewusst gewählter Demo.
- Demo-Daten entstehen nur durch eine ausdrückliche Nutzeraktion oder im Entwicklungs-/Testmodus. Die Demo legt Beispielstapel mit neuen Karten ohne Lernhistorie an, startet bei mehrfacher Auslösung nur einmal und meldet Fehler sichtbar.
- Die Demo „Welt-Hauptstädte“ fragt mit deutschen Hauptstadtnamen und grammatisch passendem Ländernamen („Hauptstadt der Schweiz“) und gliedert sich in Unterstapel je Kontinent.

### Dashboard bearbeiten

Einstieg:

Eine Bearbeiten-Aktion im Seitenkopf schaltet die Seite in den Bearbeitungsmodus, ohne sie zu verlassen.

Verhalten:

- Eine Widget-Auswahl zeigt alle Widgets mit Vorschau und Auswahlzustand. Antippen fügt ein fehlendes Widget hinten an oder entfernt ein ausgewähltes; Ziehen aus der Auswahl platziert ein fehlendes Widget an der gewählten Stelle. Eine Aktion stellt die Vorauswahl wieder her.
- Im Bearbeitungsmodus lässt sich jedes Widget per Ziehen oder Tastatur verschieben, in der Größe ändern und entfernen.
- Erst das Ablegen speichert eine neue Reihenfolge; ein abgebrochenes Ziehen stellt den vorherigen Stand wieder her.
- Layout und eigene To-dos werden pro Konto auf diesem Browser gespeichert.

### Dein Lernen heute

Zweck:

Das Widget `Dein Lernen heute` zeigt den Tagesstand und startet das Lernen, statt nur Fälligkeiten zu zählen.

Verhalten:

- Es fasst alle Hauptstapel samt Unterstapeln ohne Doppelzählung zusammen.
- Der Tagesstand gliedert sich in `Gelernt`, `Neu`, `Offen` und `Fällig`; der Zähler nennt gelernte von allen eindeutigen, heute relevanten Karten. Wie gezählt wird, regelt [Tagesmenge und Limits](#tagesmenge-und-limits).
- Die Lernaktion startet die Session des ersten Hauptstapels in alphabetischer Reihenfolge, der verfügbare Karten hat. Warten nur noch nicht verfügbare heutige Lernschritte, ist sie deaktiviert und kündigt späteres Weiterlernen an; ist alles gelernt, meldet das Widget das erreichte Tagesziel (auch bei null heute relevanten Karten).
- Nach Zielerreichung lassen sich zusätzliche neue Karten lernen, sofern ein Stapel weitere neue Karten jenseits seines Tageslimits hat: Hauptstapel und Menge (5, 10 oder 20) sind wählbar und auf den tatsächlichen Rest begrenzt.
- Die Bestätigung erhöht nur das Neulimit dieses Stapels für den aktuellen Lerntag (Tages-Override) und startet die Session; Wiederholungen werden nicht vorgezogen.

Zustände und Meldungen:

Veraltete Auswahlen ändern nichts und melden einen verständlichen Fehler.

Grenzen:

Eine Zeitprognose und Plan-Vorschauen gibt es nicht.

### Motivationsimpuls

Zweck:

`Dein Motivationsimpuls` zeigt einen von 60 eigenen deutschen Lernimpulsen ohne Autorenzuschreibung mit einem fest zugeordneten freundlichen Gehirn-Motiv.

Verhalten:

- Die Kombination bleibt innerhalb des Lerntags stabil, funktioniert offline und wechselt zum kontoweiten Tagesbeginn in der Profilzeitzone (ersatzweise Browserzeitzone), auch in einem zwischenzeitlich inaktiven Tab. Die Datumssimulation gilt ebenfalls. Nach 60 Lerntagen beginnt der Vorrat erneut.
- Antippen des Motivs löst eine kurze Textreaktion aus; der Impuls wechselt dabei nicht.
- Bestehende gespeicherte Layouts erhalten das Widget einmalig; wird es danach entfernt, bleibt es entfernt.

### Lerntimer

Zweck:

Der Lerntimer auf `Heute` zeigt und steuert den kontogebundenen [Pomodoro-Timer](#pomodoro-timer).

Verhalten:

Im Stillstand lassen sich Minuten und Sekunden direkt eingeben oder schrittweise verstellen; Start, Pause und Zurücksetzen folgen [Pomodoro-Timer](#pomodoro-timer).

Grenzen:

Voreinstellungen oder eine Dauerauswahl gibt es hier nicht.

### To-dos

Verhalten:

- Eigene Aufgaben lassen sich hinzufügen, abhaken und löschen.
- Die Vorschau zeigt höchstens drei offene Aufgaben: eine eigene und zwei aus dem Prüfungsplaner; freie Plätze füllt die andere Gruppe. Eigene Aufgaben behalten ihre Reihenfolge, Planeraufgaben folgen Prüfungstermin und Aufgabentyp.
- Die vollständige Liste lässt sich öffnen; erledigte Aufgaben bleiben getrennt einsehbar.
- Planeraufgaben lassen sich direkt lernen; der Planer bleibt von hier erreichbar.

Grenzen:

Das Entfernen des Widgets löscht keine Aufgaben.

### Aktive Stapel auf Heute

Verhalten:

- `Aktive Stapel` zeigt dieselbe Stapelsammlung wie `Lernen` ([Stapelbäume](#stapelbäume)), beschränkt auf höchstens drei Hauptstapel samt Unterstapeln, priorisiert nach aktuell startbaren Karten.
- Gibt es mehr Hauptstapel, führt ein Verweis zu `Lernen`.

## 7. Lernen

`Lernen` führt vom Stapel zur Sitzung: Stapelübersicht, Stapelinhalte, Lernsitzung und ihre Werkzeuge.

### Stapelübersicht

Zweck:

`Lernen` zeigt die Stapelübersicht als schnellen Sitzungseinstieg.

Verhalten:

- `Lernen` und die Kartenverwaltung sind getrennte Hauptbereiche mit gemeinsamem Stapelkontext; beide öffnen die Lerneinstellungen im Bereich `Lerntag & Planung` des [Einstellungsdialogs](#einstellungsdialog).
- Ein Schnellformular legt jederzeit einen neuen Stapel mit Name und Ebene an, auch ohne vorhandene Stapel.
- Links auf Lernen, Kartenverwaltung und Erstellen erhalten Stapel und Karte über Reload und Direktlink; gleichnamige Unterstapel unterscheidet der vollständige Pfad.

### Stapelbäume

Zweck:

`Heute` und `Lernen` zeigen dieselbe Stapelhierarchie mit denselben Stapelaktionen; die Kartenverwaltung listet Karten flach und nennt je Karte ihren Stapel.

Verhalten:

- Stapel bilden Eltern- und Unterstapel ohne Tiefenlimit; APKG-Hierarchien bleiben mit unmittelbaren Eltern und vollständigen Pfaden erhalten. Einklappen verbirgt den gesamten Unterbaum; Eltern aggregieren alle Unterstapel.
- Stapelbäume sind je Ebene alphabetisch wie in Anki sortiert, ohne numerische Sonderbehandlung (`Stapel 10` vor `Stapel 9`); Elternstapel bleiben mit ihrem Unterbaum zusammen.
- `Heute` und `Lernen` zeigen je Stapel nur die disjunkten Tageszahlen `Neu`, `Offen` und `Fällig`, ohne Gesamtzahl; die Kartenverwaltung zeigt keine Tageszahlen.
- Die Tageszahlen berücksichtigen verbleibende Limits: ausgewählte neue Karten (`Neu`), heutiges Learning/Relearning, auch noch nicht vorziehbares (`Offen`), und ausgewählte fällige Reviews (`Fällig`). Elternzeilen aggregieren den Teilbaum nach den Einstellungen des dargestellten Stapels. Ausgesetzte und begrabene Karten zählen nirgends.
- Dashboard und `Lernen` bieten eine Listen- und eine Kachelansicht; die Wahl gilt browserlokal und je Bereich getrennt. In der Liste lassen sich alle Elternstapel gemeinsam auf- und zuklappen.
- Ein Stapel öffnet seine [Stapelinhalte](#stapelinhalte); eine eigene Lernaktion startet ihn samt Unterstapeln und Limits. In der Kachelansicht führen Kacheln mit Unterstapeln Ebene für Ebene zu ihren Unterstapeln und zu den Stapelinhalten; eine Kachel ohne Unterstapel öffnet direkt die Stapelinhalte.
- Auf-/Zuklappzustände von `Heute` und `Lernen` sind je Ansicht kontogebunden und überstehen Navigation, Reload und Neuanmeldung.
- Stapelauswahlen nennen den vollständigen Pfad, ordnen die Stapel als alphabetischen Baum und bieten bei vielen Stapeln eine Pfadsuche.

### Stapeloptionen, Verschieben und Löschen

Einstieg:

Jeder Stapel bietet dasselbe Optionsmenü mit CoRe-Modus (`Aus`/`An`), Einstellungen und bestätigtem Verschieben.

Verhalten:

- `An` öffnet zuerst den Einschaltdialog ([CoRe-Modus und Stapelgenerierung](#core-modus-und-stapelgenerierung)); `Aus` wirkt sofort.
- In Dashboard und `Lernen` lässt sich ein Stapel samt Unterbaum mit Maus oder Trackpad direkt auf einen anderen Stapel ziehen und wird dessen direkter Unterstapel; eine eigene Ablagezone macht ihn zum Hauptstapel. Kartenverwaltung, Touch, Tastatur und assistive Bedienung verwenden den bestätigten Verschiebedialog.
- Selbst-, Nachfahren- und unveränderte Ziele ändern nichts; ein beendetes Ziehen öffnet den Stapel nicht.
- Stapelanzahl und Verschieben samt Unterbaum haben kein fachliches Limit. APKG-Hierarchien behalten Elternbeziehung, Pfad, Importidentitäten und Anki-Stapelpfad; Inhalts- und Anki-Tags bleiben unverändert.
- Die Stapellöschung nennt Stapelname, Unterstapelzahl und aktive Kartenanzahl; Abbruch ändert nichts. Das Löschen eines Baums ist destruktiv, bestätigt und darf gelöschte Inhalte nicht durch späteren Sync reaktivieren.

Zustände und Meldungen:

Erfolg, Fehler und wirkungsloses Ablegen eines Ziehens werden gemeldet, auch für Screenreader; Bestätigung und Rückgängig gibt es dabei nicht.

### Stapelinhalte

Zweck:

Die Inhaltsansicht eines Stapels bündelt Unterstapel, Karten, Zusammenfassungen, Mindmap und den direkten Lernstart.

Einstieg:

Ein Stapel in `Heute`, `Lernen` oder einem Stapelpfad.

Verhalten:

- Der Stapelpfad führt zu jedem übergeordneten Stapel; eine Rückaktion führt eine Ebene zurück, auf der Hauptebene zur Stapelübersicht.
- Die Reiter lauten `Unterstapel`, `Zusammenfassungen`, `Quiz`, `Mind Map`, `Karten` und `Quelle`; zu Beginn ist `Unterstapel` aktiv. Der Reiter ist Teil des Links und bleibt beim Rückweg aus einer Sitzung erhalten; ein geöffneter Karteneditor öffnet `Karten`.
- Reiterwechsel und Stapelpfad schützen ungespeicherte Entwürfe mit demselben Speichern-/Verwerfen-Dialog.
- `Unterstapel` zeigt den Zweig des geöffneten Stapels wie die Liste in `Lernen` mit Tageszahlen, Lernaktion und Stapeloptionen je Stapel; anfangs sind nur die direkten Unterstapel aufgeklappt. Ein Unterstapel öffnet seine eigenen Stapelinhalte. Ohne Unterstapel bietet der Reiter direkt das Lernen der Karten an.
- `Karten` zeigt die Karten des Stapels samt aller Unterstapel als eine flache Liste mit gemeinsamer Suche und Sortierung; jede Zeile nennt ihren Unterstapel. Der Reiter nutzt dieselben Kartenzeilen, denselben Editor und dieselben Änderungen wie die [Kartenverwaltung](#kartenverwaltung); Aktionen wirken im tatsächlich zugehörigen Unterstapel. Ein Kartenlink und das Schließen des Editors erhalten den Inhaltskontext auch nach Reload. Elternstapel und andere Zweige bleiben ausgeschlossen.
- `Zusammenfassungen` und `Mind Map` folgen [Zusammenfassungen und Mindmaps](#11-zusammenfassungen-und-mindmaps).
- In allen Reitern startet eine Lernaktion die Sitzung samt Unterstapeln. Sie ist nur bei leerem Stapelbaum deaktiviert; die Suche beeinflusst sie nicht. Das Verlassen der Sitzung führt zu den Stapelinhalten zurück.

Grenzen:

`Quiz` und `Quelle` bleiben bis zu ihrer Umsetzung Platzhalter.

### Lernsitzung

Zweck:

Vier Bewertungen aktualisieren den Lernzustand.

Verhalten:

- Vor dem Aufdecken zeigt die Sitzung nur den Lerninhalt und die Aktion zum Aufdecken, ohne Herkunfts-, Varianten-, Reife- oder Schedulerhinweise. Die Kartenfläche folgt [Kartenflächen](#kartenflächen).
- Die Sitzung nennt den Stapel und den Tagesfortschritt, aber keine Kartenposition oder Wiederholungsnummer.
- Die gezeigte Karte wechselt erst mit ihrer Bewertung; nachgeladene Karten reihen sich nur dahinter ein. Die nächsten Karten samt Medien werden während des Lernens vorbereitet, damit sie ohne Ladezustand erscheinen.
- `Nochmal`, `Schwer`, `Gut` und `Leicht` sind per Zeiger und mit den Tasten `1` bis `4` wählbar. Jede Bewertung nennt ihr Intervall; die Vorschau stimmt mit der tatsächlich angewendeten Bewertung überein.
- Der Tagesfortschritt gliedert sich in `Gelernt`, `Neu`, `Offen` und `Fällig`. Jede abgeschlossene Karte wechselt nach `Gelernt`; ein abgeschlossener Tag besteht ganz aus `Gelernt`. Der Zähler nennt gelernte und heute relevante Karten; die Zählung regelt [Tagesmenge und Limits](#tagesmenge-und-limits).
- Nur während eines laufenden Pomodoro-Timers zeigt die Sitzung dessen Restzeit.
- Varianten erscheinen nach [Freigabe der Varianten](#freigabe-der-varianten) und [Varianten im Review](#varianten-im-review).

### Werkzeuge auf der Karte

Verhalten:

- Inhalte mit Vorlese-Angabe (aus Anki-`tts`) lassen sich über die Sprachausgabe des Systems in der hinterlegten Sprache vorlesen; ohne Sprachausgabe ist die Aktion deaktiviert, ein Fehler wird gemeldet.
- Markierter Text auf einer Karte lässt sich in AMBOSS nachschlagen. Erst dieser ausdrückliche Klick öffnet die AMBOSS-Suche in einem neuen Tab; dabei geht ausschließlich der markierte Text als Suchbegriff an AMBOSS, ohne Referrer und ohne weitere Karten- oder Kontodaten.

Grenzen:

Ohne Markierung gibt es kein AMBOSS-Angebot; Werkzeuge erscheinen nur, wenn sie verfügbar sind.

### Sitzungs-Overlay

Zweck:

Die Lerneinstellungen einer Sitzung gliedern sich in `Karte` und `Sitzung` und wirken unmittelbar, ohne Speicherleiste.

Verhalten:

- Aus der Sitzung lassen sich der Editor der Karte im Reiter `Inhalt` und die Stapeleinstellungen des Sitzungsstapels öffnen. Der Editor führt auch nach Reload in dieselbe Sitzung zurück; die Stapeleinstellungen liegen über der Sitzung, deren Tastenkürzel ruhen, solange der Dialog offen ist, und Schließen setzt die Sitzung an derselben Karte fort, auch nach Reload.
- Die Flagge der Karte lässt sich setzen oder entfernen, auch per Tastenkürzel, ohne Bestätigungsmeldung.
- Markieren schaltet die Markierung um und verändert die Queue nicht.
- Aussetzen pausiert die Karte samt Varianten, ohne Lernzustand, Schritt, Fälligkeit, FSRS-Werte oder Historie zu ändern; ausgesetzte Karten fehlen in Queue, Tageszahlen und Fortschritt. Die aktuelle Karte verschwindet ohne Bewertung aus allen offenen Positionen, und die nächste Karte folgt. Reaktivieren lässt den Review State unverändert; ein vergangener Termin ist sofort relevant.
- `Kartenreihenfolge` bietet `Fällige Karten zuerst`, `Neue und fällige mischen` und `Neue Karten zuerst`. Die Wahl wird im gestarteten Wurzelstapel gespeichert und sortiert nur noch unbeantwortete Karten des Sitzungsbeginns neu.
- Der Pomodoro-Timer lässt sich mit 15, 25 (Standard) oder 45 Minuten oder einer eigenen positiven Ganzzahl starten; er startet erst auf ausdrücklichen Start.

Zustände und Meldungen:

- Nach dem Aussetzen meldet CoRe, dass der Lernstand erhalten bleibt und die Karte im Editor reaktiviert werden kann.
- Löst eine Bewertung die Lernbremse aus, nennt ein einmaliger Hinweis die Zahl der Fehler und öffnet auf Wunsch den Editor im Reiter `Inhalt`.

Grenzen:

Kartenverwaltung, Zurücksetzen, Mischen und ein Lernen nur mit normalen Karten gehören nicht zu diesen Einstellungen.

### Pomodoro-Timer

Einstieg:

Derselbe Start steht im [Sitzungs-Overlay](#sitzungs-overlay) und unter `Einstellungen → Fokuswerkzeuge`; der [Lerntimer](#lerntimer) auf `Heute` zeigt denselben Timer.

Verhalten:

- Jeder Start ersetzt einen laufenden Countdown; ein Start setzt eine unveränderte Pause fort oder übernimmt eine neu eingegebene Dauer.
- Es gibt accountbezogen genau einen browserlokalen Timer mit realer Endzeit. Er übersteht Navigation, Hintergrund, Reload und weitere Tabs, nutzt aber weder Cloud, Deckdaten noch simulierte Lernzeit.
- Während des Laufs zeigen Sitzung und App-Navigation den Fortschritt.
- Pause hält die verbleibende Zeit an; sie übersteht Reload und Kontowechsel. Während der Pause entfallen die laufenden Fortschrittsanzeigen.
- Zurücksetzen bricht einen laufenden oder pausierten Durchlauf überall ab, stellt seine ursprüngliche Startdauer wieder her, startet nicht neu und löst keine Ablaufmeldung aus.

Zustände und Meldungen:

Beim Ablauf verschwinden die Anzeigen und eine schließbare Meldung nennt den Ablauf.

Grenzen:

Töne und automatische Pausenzyklen gibt es nicht.

### Start, Ende und Wiederaufnahme

Verhalten:

- Lernstart und direkt geladener Sitzungslink bereiten die Queue vor, bevor die Sitzung beginnt.
- Das Ende nennt die Zahl beantworteter Karten und führt zum Ausgangspunkt zurück.
- Ein Reload erhält Sitzungsstapel und Rückkontext (`Heute`, `Lernen` oder Kartenverwaltung); freie Rücksprungadressen werden nicht akzeptiert. Eine Sitzung aus der Kartenverwaltung kehrt zu Stapel und Karte zurück, eine aus `Lernen` zum Stapelkontext.
- Browser-Zurück und -Vorwärts stellen Ansicht, Stapel, Karte und Sitzungskontext ohne History-Schleifen wieder her.
- Nach Speichern, Verlassen, Reload und Sync wird der Lernfortschritt aus gespeicherten Review Events und Review States rekonstruiert, ohne separaten Sitzungsstand.

Zustände und Meldungen:

- Ist die Queue leer, bleibt die Ausgangsansicht sichtbar und CoRe meldet, dass keine Karten fällig sind.
- Halten nur Tageslimits fällige oder neue Karten zurück, meldet CoRe, dass das Tageslimit erreicht ist, mit der Anzahl zurückgehaltener fälliger und neuer Karten. Gibt es ungenutzte neue Karten, öffnet eine Aktion die Stapeleinstellungen über der Ausgangsansicht beim Feld `Neue Karten pro Tag`, ohne den Wert zu ändern.
- Warten nur Learning-/Relearning-Wiederholungen außerhalb des Vorziehfensters, endet die Runde vorläufig; die Karten bleiben `Offen`, ohne Countdown oder Hintergrundtimer.
- Unbekannte oder nicht verfügbare Stapel und Karten führen zu verständlichen Folgeaktionen und öffnen nie still eine andere Karte.
- Offline- und Konfliktzustände sind sichtbar; ausstehende Änderungen gelten nie als gespeichert.
- Offline-Pausen und Nachladen folgen [Offline lernen und Downloads](#offline-lernen-und-downloads).

## 8. Erstellen

`Erstellen` bringt Karten in CoRe: manuell, als Bildverdeckung, per APKG-Import oder als Auftrag zur automatischen Erstellung.

### Erstellungswege

Zweck:

Nutzer wählen zwischen manueller Erstellung, APKG-Import und automatischer Erstellung.

Verhalten:

- Manuelle Erstellung und Import speichern zuerst lokal und synchronisieren danach; die automatische Erstellung führt vorerst nur bis zur Auftragsprüfung.

### Manuell erstellen

Zweck:

Karten entstehen auch ohne Dokumentquelle; mehrere Karten nacheinander sind der Standardfluss.

Verhalten:

- Die Erstellung beginnt ohne Kartentypauswahl mit Vorder- und Rückseite.
- `Fragentyp` bietet `Standard`, `Single Choice`, `Multiple Choice` und `Bildverdeckung` ([Bildverdeckung](#bildverdeckung)).
- Bilder werden per Werkzeug, Einfügen oder Ablegen an der Cursorposition in Vorderseite, Rückseite und Zusatzfelder eingefügt; eigene Bildfelder gibt es nicht. Bild-Bytes liegen im accountgebundenen Medienspeicher, die Karte speichert nur stabile Referenzen.
- Eine Lückenaktion macht die markierte Textauswahl zur Cloze-Gruppe, eine Formelaktion zur Formel. Rückrichtung, Single Choice und Multiple Choice sind direkt wählbar; bei Auswahltypen pflegt der Editor die Antwortoptionen.
- Gemeinsame Bausteine sind `Antwort eintippen` (nur für Frage und Antwort ohne Auswahl; die Rückseite wird beim Lernen eingetippt und verglichen) sowie weitere Felder mit den Rollen `Zusatzfrage` (Teil der Frage, in Rückrichtung Teil der Antwort), `Hinweis` (aufdeckbar auf der Frageseite), `Zusatz` und `Quelle` (beide nach der Antwort).
- Zusätzliche Felder tragen einen frei benennbaren Namen und eine änderbare Rolle und lassen sich umsortieren; neue Felder heißen wie ihre Rolle, bei Wiederholung mit Nummer.
- Die Vorschau zeigt den ungespeicherten Entwurf mit derselben Projektion wie das Speichern ([Vorschau und Darstellung](#vorschau-und-darstellung)).
- An den Entwurf lässt sich eine Quelle anfügen: PDF, Text, Markdown, CSV oder TSV. Andere Formate werden mit Meldung abgelehnt, ohne eine geöffnete Quelle zu ersetzen; Schließen verwirft den Anhang.
- Aus einem lesbaren Dokument kann Text in Vorder- oder Rückseite übernommen werden; das Dokument wird nicht als Quelle gespeichert.

### Manuell speichern und abschließen

Verhalten:

- Nach dem Speichern bleibt der Editor offen: Angeheftete Felder bleiben, andere werden geleert, das Zieldeck bleibt gewählt, und die Eingabe beginnt im ersten freien Pflichtfeld. Anheften steuert nur das Leeren nach erfolgreichem Speichern; einen Cloud-Autosave für Entwürfe gibt es nicht.
- Speichern startet genau einen exklusiven Versuch. Entwurf, Zielstapel, Abschluss und interne Navigation bleiben bis zu seinem Ende gesperrt; mehrfaches Auslösen erzeugt höchstens eine Karte. Reload und Tab-Schließen warnen währenddessen.
- Bilder werden vor der Karte im accountgebundenen lokalen Medienspeicher gesichert, danach wird die Karte lokal gespeichert und der Upload versucht. Ein Fehler vor der lokalen Kartenspeicherung erhält den Entwurf und erhöht den Sitzungszähler nicht. Ein späterer Medien- oder Cloudfehler zählt die lokale Karte genau einmal und erzwingt kein erneutes Speichern.
- JPEG, PNG und WebP oberhalb Full HD werden vor Prüfsumme und lokaler Sicherung proportional verkleinert: Querformat auf höchstens 1920 × 1080, Hochformat auf 1080 × 1920. Kleinere Dateien, SVG, GIF und AVIF bleiben bytegenau; APKG-Medien sind ausgenommen.
- Ein monotoner Fortschritt nennt die Phasen lokale Bildsicherung, lokale Kartenspeicherung und Upload; vollständig ist er erst am Ende des Versuchs.
- Erst der Abschluss der Erstellung nennt Sitzungsanzahl und Zielpfad und führt zum Lernen oder Prüfen der Karten.
- Gespeicherte Karten bleiben bei einem später verworfenen Entwurf erhalten.

Zustände und Meldungen:

- Ein vollständiger Cloudabschluss meldet den Erfolg; ein erneut versuchbarer oder Offline-Teilabschluss meldet, dass Karte und Bilder lokal gespeichert sind und die Synchronisierung automatisch fortgesetzt wird; ein nicht erneut versuchbarer Medienfehler nach lokaler Speicherung erscheint als unvollständiger Medienzustand.
- Bei nichtleerem Entwurf fragt der Abschluss, ob der Entwurf verworfen werden soll.
- Interne Navigation mit nichtleerem Entwurf verlangt eine Entscheidung: Weiterbearbeiten erhält den Inhalt, Verwerfen verwirft nur den aktuellen Entwurf. Während eines Speicherversuchs bleibt die Navigation ohne Verwerfoption auf der Seite.

### Bildverdeckung

Zweck:

Bildverdeckungen entstehen mit dem Masken-Editor oder kommen aus Anki-Importen (Ankis Bildverdeckung, Image Occlusion Enhanced); jede Maskengruppe ist eine eigenständige Karte.

Verhalten:

- Bei `Bildverdeckung` wird die Vorderseite zur optionalen `Überschrift`, die Rückseite zum optionalen `Zusatz`. Hinweis-, Zusatz- und Quellenfelder bleiben möglich, Eintippen und Rückrichtung nicht.
- Das Bild wird per Auswahl, Ablegen oder Einfügen gewählt und wie eingefügte Bilder lokal vorbereitet, verkleinert und hochgeladen.
- Der Masken-Editor zeichnet Rechtecke, Ellipsen, Polygone und Text, gruppiert und löst Masken, markiert Masken als `Bleibt verdeckt` und löscht sie. Der Verdeckungsmodus ist `Alle` (alle Masken verdeckt) oder `Nur eine`; eine Kartenliste zeigt die entstehenden Karten.
- Jede neue Maske ist eine eigene Karte; gruppierte Masken werden gemeinsam abgefragt; `Bleibt verdeckt` verdeckt eine Maske auf allen Karten ohne eigene Abfrage.
- Masken lassen sich mit Maus, Stift und Touch zeichnen und vollständig per Tastatur auswählen, verschieben, gruppieren und löschen.
- Ein Bildwechsel verwirft vorhandene Masken nach Rückfrage, weil sie nur zum bisherigen Bild passen.

Grenzen:

Gespeichert wird erst mit Bild und mindestens einer abgefragten Maske. Die Bearbeitung vorhandener Bildverdeckungen regelt [Editor-Reiter Inhalt](#editor-reiter-inhalt).

### APKG-Import

Zweck:

Der Importbereich nimmt ausschließlich Anki-Pakete (`.apkg`, `.colpkg`) an; Text-, CSV- und Tabellenimporte gibt es nicht.

Verhalten:

- Das Paket wird zuerst analysiert. Vorschau und Übernahme sind getrennte Schritte.
- Pakete bis 2 GiB werden lokal im Browser verarbeitet; Medien werden erst beim Übernehmen einzeln gelesen und gegen ihre SHA-1 geprüft.
- Hierarchien werden ohne fachliches Tiefenlimit importiert. Jeder Stapel verweist auf seinen unmittelbaren Anki-Elternstapel und behält den Quellpfad.
- Der Bericht nennt Datei, Stapel, Karten, vorhandene und fehlende Medien sowie verständliche Warnungen. Medienreferenzen werden sicher aufgelöst.
- Je Notiztyp nennt der Bericht Übersetzer, Inhalte, Karten, übernommenen Lernstand, generisch als Feldliste übernommene und übersprungene Inhalte, nur im Editor sichtbare Felder, fehlende Medien und ob die Karten im `Originallayout` oder im `CoRe-Design` erscheinen.
- Bis zu drei Beispielkarten erscheinen wie im Review mit Frage, Antwort und Beispielmedien. Tatsächliche Darstellungsabweichungen und Diagnosen bleiben sichtbar.
- Warnungen sind zusammengefasst und vollständig einsehbar; technische Kennungen wie Notetype-IDs, Template-Ordinals, SHA-1-Listen und Importidentitäten erscheinen nicht.
- Die Analyse lässt sich abbrechen; dann wird nichts übernommen. Die Übernahme selbst ist nicht abbrechbar.
- Analyse, Übernahme, Cloud-Synchronisierung und Mediensynchronisierung zeigen je einen eigenen monotonen Fortschritt; vollständig heißt abgeschlossen.
- Eine accountgebundene Importsitzung erhält bei App-Navigation Datei-Metadaten, Vorschau, Fortschritt und Abschluss und erscheint in `Erstellen` wieder. Zurück zu `Erstellen`, Logout und bestätigter Abschluss setzen sie zurück; Reload erhält weder Datei noch Vorschau oder laufende Verarbeitung.
- Wie Notiztypen übersetzt und Reimporte zugeordnet werden, regelt [Import und Reimport](#17-import-und-reimport).

Zustände und Meldungen:

- Abbruch, erneut versuchbarer Fehler, terminaler Fehler, Teilabschluss und Erfolg sind getrennte Zustände mit jeweils passender Folgeaktion.
- Importfehler bleiben sichtbar und enthalten eine sinnvolle nächste Aktion.
- Größere Dateien enden sofort mit verständlicher Meldung und der Möglichkeit, eine andere Datei zu wählen.

Grenzen:

Einen Serverjob oder Upload-Fallback gibt es nicht.

### Import übernehmen und Abschluss

Verhalten:

- Die Übernahme endet, sobald alles lokal validiert gespeichert und die vorhandenen Medien dauerhaft zum Upload eingereiht sind. Jede Anki-Notiz wird ein Inhalt, jede reale Anki-Karte eine eigenständige CoRe-Karte dieses Inhalts.
- Inhalte, Karten, Reviews und Medien synchronisieren danach getrennt; Anki-Vorlagen und rohe Felder bleiben unsichtbar für spätere Neuübersetzungen erhalten.
- Nach einem Reimport nennen Bereich und Abschluss, wie viele lokal bearbeitete Inhalte unverändert blieben und wie viele Karten im Paket fehlen.
- Nach bestätigtem Erfolg erscheint genau einmal der Abschluss mit verifizierter Kartenzahl und Stapelpfad. Er startet das Lernen des importierten Wurzelstapels samt Unterstapeln oder führt zu `Heute`.

Zustände und Meldungen:

- Offline- und erneut versuchbare Fehler melden, dass die Karten lokal gespeichert sind und die Synchronisierung noch aussteht; ausstehende Änderungen und Medien bleiben eingereiht. Nicht erneut versuchbare Konflikte bleiben sichtbar und entfernen die lokalen Karten nicht.
- Wird ein Teilabschluss mit sofortiger Nutzung der Karten beendet, gilt der Import als lokal abgeschlossen, und die Ansicht nennt die im Hintergrund weiterlaufende Synchronisierung.

### Automatisch aus einer Quelle

Zweck:

Der dritte Erstellungsweg, die automatische Erstellung, bereitet einen Erstellungsauftrag bis zur Prüfung vor.

Verhalten:

- Der Auftrag gliedert sich in Quelle und Ziel, Lernwünsche und Kartenformen. Die Eingaben bleiben beim Wechsel zwischen den Teilen erhalten.
- Quelle ist eine Datei oder eingefügter Text. Eine einzelne PDF-, TXT-, Markdown-, CSV-, TSV-, DOCX- oder PPTX-Datei wird nur temporär im Browser gehalten und lässt sich ersetzen oder entfernen.
- Text darf nicht nur aus Leerzeichen bestehen. Beim Wechsel der Quellenart bleiben beide Eingaben erhalten; validiert und geprüft wird nur die aktive Quelle. Die erweiterten Dateiformate gelten nur für diesen Weg.
- Ziel ist ein neuer Stapel mit Namen oder ein vorhandener Stapel. Es gibt genau ein Stapelziel, das auch bei den Kartenformen angezeigt und dort geändert werden kann.
- Ein übergebenes Stapelziel wird vorausgewählt. Andernfalls ist ein neuer Stapel vorgesehen; sein bearbeitbarer Namensvorschlag stammt aus dem Dateinamen. Ein bestehender Stapel muss verfügbar und ein neuer Name nicht leer sein.
- Die Lernwünsche enthalten Stoffabdeckung (Überblick, Gründlich, Sehr genau), Antwortumfang (Knapp, Mit kurzer Erklärung, Ausführlicher erklärt), Sprache (Deutsch, Englisch, Wie in der Quelle), Formulierung (Einfach verständlich, Fachbegriffe erklären, Fachsprache verwenden), Vorwissen (Neu im Thema, Grundkenntnisse, Fortgeschritten) und optionale Freitextwünsche. Standards: Gründlich, Mit kurzer Erklärung, Deutsch, Fachbegriffe erklären, Grundkenntnisse.
- Eine gesonderte Auswahl des Lernziels entfällt; passende Abruf-, Verständnis- und Anwendungsfragen werden ohne feste Quoten kombiniert.
- Stoffabdeckung und Antwortumfang bleiben unabhängig: Mehr Abdeckung bedeutet bei Bedarf mehr gezielte Karten; die erwartete Antwort bleibt kurz, Erklärungen stehen getrennt davon.
- Als Kartenformen stehen Frage–Antwort, Lückentext, Single Choice und Multiple Choice zur Wahl; standardmäßig sind alle vier ausgewählt. Mindestens eine Form ist erforderlich; ihre Auswahl erlaubt sie, erzwingt sie aber nicht.
- Für Informationen außerhalb der Quelle gilt „Nur meine Quelle verwenden“ (Standard) oder „Ergänzungen erlauben und kennzeichnen“. Erlaubte Ergänzungen dürfen fachliche Lücken schließen und müssen auch in Fragen oder erwarteten Antworten als „Ergänzung – außerhalb der Quelle“ gekennzeichnet sein. Quellenbelege dürfen nicht erfunden werden. Ohne Ergänzungen müssen Fragen, Antworten und Erklärungen aus der Quelle stammen.
- Die Auftragsprüfung validiert aktive Quelle, Kartenformen und Ziel und zeigt dann alle wirksamen Angaben einschließlich des eingefügten Texts. Zurück zur Bearbeitung erhält Quelle und Einstellungen.
- Der Entwurfsschutz gilt beim Verlassen, auch über Browser-Zurück/-Vorwärts; bestätigtes Verlassen und Reload verwerfen den Entwurf.

Zustände und Meldungen:

- Leere und nicht unterstützte Dateien werden mit Meldung abgelehnt, eine gültige vorherige Auswahl bleibt erhalten.
- Bereits der Auftrag meldet, dass die automatische Erstellung noch nicht verfügbar ist; in der Auftragsprüfung bleibt das Erstellen deaktiviert.

Grenzen:

- Prozente, Mischungsverhältnisse oder eine Kartenanzahl werden nicht abgefragt.
- Es werden keine Dateien ausgelesen oder übertragen und keine Karten oder Stapel angelegt; erfundene Kartenzahlen und Ergebnisse erscheinen nicht.

## 9. Karten

Der Hauptreiter `Karten` verwaltet alle Karten aller Stapel; derselbe Editor öffnet sich aus Kartenverwaltung, Stapelinhalten und Sitzung.

### Kartenverwaltung

Zweck:

Der Hauptreiter `Karten` ist die direktlinkfähige Gesamtverwaltung für Karten, Stapelstruktur, Inhalt und erweiterte Optionen aller Stapel.

Verhalten:

- Die Kartenverwaltung verbindet die [Kartensuche](#kartensuche) mit einer flachen Liste aller Karten; Stapelzeilen, Auf- und Zuklappen und das Stapelmenü gibt es dort nicht. Stapelaktionen bleiben in `Heute`, `Lernen` und den Stapeleinstellungen.
- Die Tabelle zeigt je Karte nur `Sortierfeld` (bereinigte Vorderseite), `Datum` (`Neu` oder `TT.MM.JJJJ`) und `Variante` (Zahl der aktiven Varianten, ohne Variante ein zugänglich beschrifteter Strich). Alle Spalten sind auf- und absteigend sortierbar; Standard ist `Sortierfeld` A–Z, einheitlich für alle Sektionen und nicht persistiert. Der Spaltenkopf bleibt beim Scrollen stehen. Aufgeklappte Stapel ohne Karten und ohne Unterstapel zeigen `Keine Karten`; Elternstapel ohne eigene Karten zeigen keine Leerzeile.
- Ausgesetzte Karten bleiben mit unverändertem Datum sichtbar, sind sichtbar hervorgehoben und tragen die zugängliche Kennzeichnung `Ausgesetzt`. Markierte Karten sind sichtbar und zugänglich als markiert gekennzeichnet. Beides kann gleichzeitig erscheinen.
- Eine gesetzte Flagge erscheint als Farbpunkt mit zugänglichem Namen.
- Kartenzeilen sind kompakt (etwa 29 px, eine dünne Trennlinie) und einzeilig: die Vorderseite, ab `sm` rechts daneben gedämpft der Stapelpfad (höchstens 40 % der Breite), beide mit Ellipsen. Umfasst die Liste nur einen Stapel, entfällt der Pfad. `Datum` und `Variante` stehen rechts und bleiben ungekürzt; die Kartenverwaltung erzeugt keinen horizontalen Überlauf.
- Die Kartenliste ist durchgehend, ohne Seiten: Gerendert werden nur die Zeilen nahe am sichtbaren Bereich. Noch nicht geladene Zeilen halten als ruhige Platzhalter ihren Platz und füllen sich beim Scrollen.
- Die Tabelle zeigt mit und ohne Suche eine flache Liste aller Karten beziehungsweise Treffer im Bereich (alle Stapel, in geöffneten Stapelinhalten deren Unterstapel) in der gewählten Sortierung. Mit Suche stehen Stapel, deren Pfad jedes Suchwort enthält, stehen über der Liste als `Passende Stapel`; ein Klick filtert auf diesen Stapel.
- Bis die Seite einer geänderten Suche oder Sortierung da ist, bleiben die bisherigen Zeilen gedimmt stehen und unter dem Spaltenkopf läuft der Ladebalken der Statistik; `Keine Karten` erscheint erst mit der Antwort.
- Mehrfachauswahl: `Karten auswählen` im Kopf der ersten Spalte, Strg- oder Cmd-Klick, Umschalt-Klick (Bereich der geladenen Zeilen seit der zuletzt gewählten) oder Langdrücken (500 ms) auf Touch starten die Auswahl. Solange sie läuft, trägt jede Kartenzeile ein Kontrollkästchen, ein Klick wählt statt zu öffnen, und eine Auswahlleiste ersetzt die Sortierköpfe: Anzahl, `Alle N Karten auswählen` (mit Suche `Alle N Treffer auswählen`), `Aktionen` und `Auswahl aufheben`. Eine neue Suche oder ein anderer Bereich hebt die Auswahl auf; aus der Lernsitzung geöffnet gibt es keine Auswahl.
- `Aktionen` bietet `Stapel ändern`, `Tags hinzufügen`, `Tags entfernen`, `Flagge setzen`, `Flagge entfernen`, `Markieren`, `Markierung entfernen`, `Aussetzen`, `Reaktivieren`, `Zurückstellen`, `Fälligkeit setzen` (Datum oder Zeitraum; jede Karte bekommt einen zufälligen Tag darin), `Lernstand zurücksetzen`, `Varianten generieren` (für ausgewählte Karten ohne Variante, wie die Stapelgenerierung) und `Löschen` (die Inhalte der Karten samt ihrer weiteren Karten). Jede Aktion fragt ab einer Karte nach und meldet danach `<Aktion>: N Karten` mit `Rückgängig`. Rückgängig ist eine neue Änderung: Karten, die seither anders geändert wurden, behalten ihren neuen Stand, und die Meldung nennt ihre Zahl. Flagge, Aussetzen und Stapel gelten je Karte, Markierung und Tags für den Inhalt. Offline wirken Massenaktionen nur auf Karten, die auf dem Gerät liegen; sonst meldet die Aktion, dass die Karten noch nicht offline verfügbar sind, und ändert nichts.
- Tastenkürzel der Liste: `/` setzt den Fokus in die Suche; auf einer Kartenzeile wechseln ↑/↓ die Zeile, Enter öffnet die Karte, `X` wählt sie aus oder ab (mit Umschalt einen Bereich), Escape hebt die Auswahl auf. `1`–`7` setzt eine Flagge, `0` entfernt sie, `M` markiert oder entfernt die Markierung, `A` setzt aus oder reaktiviert, `S` ändert den Stapel, `T` fügt Tags hinzu, `Entf` löscht; jede Taste öffnet die Bestätigung der Aktion für die Auswahl oder, ohne Auswahl, für die Karte der Zeile, die danach den Fokus zurückbekommt. Strg+Z (⌘Z) nimmt außerhalb von Textfeldern die letzte Massenaktion zurück. In Dialogen, Menüs, Textfeldern und im Editor gelten deren eigene Tasten; Browser-Kürzel bleiben unberührt. `Aktionen` nennt die Taste neben jedem Eintrag.
- `Suchen und Ersetzen` (in `Aktionen` nach `Stapel ändern`) ersetzt wörtlichen Text in den Inhalten der ausgewählten Karten, ohne reguläre Ausdrücke: in `Alle Felder`, einem Feld der ausgewählten Inhalte oder `Tags`, wahlweise mit `Groß-/Kleinschreibung beachten`. Ersetzt wird nur sichtbarer Text, nie Formatierung oder Links. Während der Eingabe zeigt die Vorschau, wie viele Karten sich ändern, und bis zu 20 Inhalte mit Stelle, altem und neuem Text. Ein Inhalt, dessen Karten sich dadurch ändern würden (etwa eine andere Lückennummer), bleibt unverändert und wird gezählt. Das Ersetzen in Feldern gilt als lokale Bearbeitung: Ein Reimport überschreibt den Inhalt nicht mehr, Varianten geänderter Abfragen werden veraltet, der Lernstand bleibt. `Rückgängig` stellt den früheren Text her, außer bei Inhalten, die seither bearbeitet wurden.
- `Treffer lernen` steht bei einer Suche am Ende der Trefferzeile, `Auswahl lernen` in `Aktionen`. Gelernt werden die Treffer beziehungsweise die ausgewählten Karten ohne ausgesetzte und heute zurückgestellte, unabhängig von Fälligkeit und Tageslimits. Der Startdialog nennt die Kartenzahl und bietet `Vorziehen` (Standard) oder `Nur üben` sowie die Reihenfolge `Wie die Liste` (die aktuelle Sortierung) oder `Gemischt`. Mit `Vorziehen` startet `Lernen` eine normale Sitzung `Treffer lernen` mit gespeicherten Bewertungen. Noch nicht fällige Karten zählen als vorgezogene Wiederholung, FSRS rechnet mit den tatsächlich vergangenen Tagen. Jede Karte folgt den Optionen ihres Stapels; Geschwister werden in dieser Sitzung nicht zurückgestellt. Die Bewertungen verbrauchen keine Tageslimits für neue Karten und Wiederholungen. Nach einem Neuladen ist die Sitzung beendet und meldet das.
- `Nur üben` läuft als Vollbild über der Kartenverwaltung wie eine Sitzung (Frage, `Antwort anzeigen`, Bewerten, Tasten wie beim Lernen, `Escape` beendet). `Nochmal` holt die Karte nach drei anderen zurück, `Schwer` noch einmal ans Ende, `Gut` und `Leicht` beenden sie für diese Übung; der Fortschritt zählt gewusste Karten. Lernstand, Fälligkeit, FSRS-Werte und Lernbremse bleiben unverändert, es entsteht kein Bewertungseintrag. Am Ende stehen `Übung abgeschlossen`, die Zahl der geübten Karten und der `Nochmal`-Antworten, `Nochmal üben` für Karten mit `Nochmal` oder `Schwer` und `Fertig`.
- `Duplikate finden` im Kopf der Kartenverwaltung vergleicht die Inhalte der Liste nach `Sortierfeld` oder einem Feld (Name wie bei `Feld:`-Suchen), ohne Groß-/Kleinschreibung und mehrfache Leerzeichen; leere Felder zählen nicht. Bei einer Suche ist `Nur in den Treffern` vorausgewählt. Der Dialog nennt Gruppen und Inhalte, größte Gruppen zuerst; ein Inhalt öffnet im Editor (dort auch `Löschen`). `Duplikate taggen` gibt allen Inhalten der Gruppen den Tag `Duplikat` und meldet das mit `Rückgängig`. Die Suche braucht alle Karten auf dem Gerät; solange der Abgleich läuft, meldet der Dialog das mit `Erneut versuchen`.
- `Tags verwalten` steht in der erweiterten Suche über den Tags und gilt für das ganze Konto. Die Liste lässt sich durchsuchen und nennt je Tag die Zahl der Inhalte und, wie viele davon ihn aus einem Import tragen. `Umbenennen` nimmt die Untertags mit (`A::x` wird `B::x`); ein vorhandener Name führt zusammen, der Dialog sagt das vorher, die vorhandene Schreibweise bleibt. `Löschen` entfernt den Tag samt Untertags nach einer Bestätigung in der Zeile. Beides läuft als Massenaktion mit `Rückgängig`; die Liste zeigt die Änderung sofort, das vollständige Verzeichnis aus der Cloud beim nächsten Öffnen. Ungenutzte Tags gibt es nicht: Tags existieren nur an Inhalten, ein `Bereinigen` entfällt deshalb.
- Wie große Bestände laden, regelt [Laden großer Bestände](#laden-großer-bestände); Konfliktkarten folgen [Sync-Status und Konflikte](#sync-status-und-konflikte).

Grenzen:

Einen Direkteinstieg zur Kartenerstellung gibt es dort nicht.

### Kartensuche

Verhalten:

- Die Suchzeile ist einzeilig: Suchfeld `Karten durchsuchen`, ab `md` daneben der Stapelfilter (`Alle Stapel` oder ein Stapel samt Unterstapeln) und rechts `Erweiterte Suche` mit der Zahl der aktiven Filter; schmal bleibt dort nur das Filter-Icon. Das Suchfeld zeigt nur den freien Text; fertig getippte Begriffe wie `tag:x ` werden zu Filtern.
- Unter der Suchzeile stehen bei aktiven Filtern die Trefferzahl, je Filter ein Chip aus Kategorie und Wert (verneint als `ohne <Kategorie>` in Gefahrfarbe) mit Entfernen-Knopf sowie `Alle zurücksetzen`. Ein geöffnetes Menü steht über den Chips, damit neue Chips es nicht verschieben.
- `Erweiterte Suche` öffnet unter der Suchzeile ein Menü mit dem vollständigen Suchausdruck samt Kopier- und Speicherknopf, `Zurücksetzen` und den Kategorien `Heute` (fällig, überfällig, morgen fällig, gelernt, `Nochmal`, erstmals gelernt, hinzugefügt, bearbeitet, neu geplant), `Kartenstatus` (mit `Manuell zurückgestellt`), `Flaggen`, `Stapel`, `Tags` (als Baum, mit `Ohne Tags`), `Inhalt` (Variante, veraltete Variante, die Inhaltsformen `Frage–Antwort`, `Auswahl`, `Lückentext`, `Bildverdeckung`, `Abfrage 1 (vorwärts)`, `Abfrage 2 (rückwärts)` und je Anki-Notiztyp eine Zeile `Notiztyp <Name>`, gleichnamige zusammengefasst), `Zeitraum`, `Werte`, `Felder` und `Gespeichert & Syntax`; jede Kategorie zählt ihre aktiven Filter. Jede Zeile trägt einen Dreifachschalter `Mit`/`Egal`/`Ohne` und, außer bei Stapeln, ihren Begriff. `Zeitraum` fügt einen Begriff für die letzten N Tage hinzu (gelernt, je Bewertung, erstmals gelernt, hinzugefügt, bearbeitet, neu geplant), `Werte` einen Vergleich für Intervall, Schwierigkeit, Wiederholungen oder Fehler, `Felder` einen Begriff `Feld:Text`; darunter stehen die so geschriebenen Begriffe mit eigenem Schalter, Chips nennen sie lesbar (`Nochmal, letzte 7 Tage`, `Intervall ≥ 21 Tage`). `Gespeichert & Syntax` zeigt oben die gespeicherten Suchen und darunter die Erklärung der Schreibweise. Unter `md` ist das Menü ein Vollbild: erst die Kategorienliste, dann die Kategorie mit Zurück-Pfeil, unten Zurücksetzen und `N Karten anzeigen`.
- Die Suche umfasst alle Felder, Antwortoptionen und Tags (Stapelpfade über `Passende Stapel`), startet 250 ms nach der letzten Eingabe und bricht veraltete Anfragen ab. Einen Modusfilter gibt es nicht.
- Die Suche versteht Begriffe in Anki-Schreibweise: `flag:1` bis `flag:7` (`flag:0` ohne Flagge), `tag:x` (auch Unter-Tags, ohne Rücksicht auf Groß-/Kleinschreibung), `tag:none`, `tag:leech` (Lernbremse), `tag:marked`, `is:suspended`, `is:new`, `is:learn` (auch Wiederlernen), `is:review`, `is:young` und `is:mature` (Reife `Jung` beziehungsweise `Reif`), `is:due` (bis Ende des Lerntags fällig und lernbar), `prop:due` mit `<`, `<=`, `=`, `>=`, `>` und Tagen ab heute (`prop:due<0` überfällig, `prop:due=1` morgen fällig; neue Karten sind nie fällig), `did:<Stapel-ID>` und `deck:Name` (Stapel nach vollem Pfad `A::B` samt Unterstapeln, `*` beliebiger Text, `_` ein Zeichen), `has:variant` (mit aktiver Variante), `added:n`, `edited:n`, `introduced:n` (erste Antwort) und `resched:n` (manuell neu geplant) für heute und die n − 1 Tage davor, `rated:n` und `rated:n:1` bis `rated:n:4` (beantwortet, mit `Nochmal`, `Schwer`, `Gut`, `Einfach`), `prop:ivl`, `prop:d` (Schwierigkeit 1 bis 10), `prop:s` (Haltbarkeit in Tagen), `prop:reps` und `prop:lapses` mit `<`, `<=`, `=`, `!=`, `>=`, `>` (Intervall, Schwierigkeit und Haltbarkeit nur für Karten, die nicht neu sind; die Haltbarkeit kennt eine Karte erst ab ihrer nächsten Antwort), die Inhaltsformen `is:reveal`, `is:choice`, `is:cloze`, `is:occlusion`, `note:Name` (Anki-Notiztyp mit denselben Platzhaltern wie `deck:`, Leerzeichen als `_`) und `mid:<Notiztyp-ID>`, `has:outdated` (mit veralteter Variante), `card:N` (Nummer der Abfrage wie in Anki: Vorlage, Lücke oder Maske; `forward` ist 1, `reverse` 2), `is:buried` (heute manuell zurückgestellt und nicht wieder hervorgeholt; zurückgestellte Geschwister entstehen erst in der Lernsitzung und zählen nicht) und `Feld:Text` (Text nur in dem Feld dieses Namens, ohne Rücksicht auf Groß-/Kleinschreibung, Leerzeichen im Feldnamen als `_`, etwa `ursprung:scaleni` oder `back_extra:merke`); ein vorangestelltes `-` verneint einen Begriff. Jedes Wort und jeder Begriff muss zutreffen. `"…"` sucht eine Wortfolge am Stück und fasst Begriffe mit Leerzeichen zusammen (`deck:"Anatomie 1"`); `or` verlangt nur eine Seite und bindet schwächer als das Nebeneinander (`and` ist erlaubt und ändert nichts); Klammern fassen zusammen, `-(…)` verneint eine ganze Gruppe. Im Menü verlangen mehrere Zeilen einer Kategorie auf `Mit` nur eine davon: Sie stehen als Gruppe `(a or b)` im Ausdruck und als ein Filter `a oder b`. Eine Suche, die über 1.024 Bedingungen ergäbe, findet nichts. Lerntag und Stapelbaum gehen aufgelöst in die Anfrage, daher liefern Online- und Offline-Suche dieselben Treffer. Weitere Anki-Begriffe wie `prop:r` oder `card:Name` nennt eine Zeile unter der Suche als noch nicht unterstützt; sie werden als Text gesucht.
- Gespeicherte Suchen gehören zum Konto und synchronisieren mit den Oberflächeneinstellungen (höchstens 100, Name höchstens 60 Zeichen). Der Speicherknopf am Suchausdruck öffnet `Gespeichert & Syntax` mit einem Namensfeld, vorbelegt mit den lesbaren Filtern und dem Text; `Speichern` legt die Suche an und bestätigt es. Ein Klick auf eine gespeicherte Suche ersetzt den Suchausdruck; die gerade aktive ist markiert. Relative Begriffe wie `rated:1` gelten beim Anwenden für den jeweiligen Tag. Umbenennen geschieht in der Zeile, Löschen sofort mit `Rückgängig` in der Meldung.

Grenzen:

Einen Modusfilter und reguläre Ausdrücke gibt es nicht.

### Karten löschen

Verhalten:

- Löschen verlangt eine Bestätigung. Bei einer Karte nennt sie, dass die Karte auf allen Geräten gelöscht wird; hat der Inhalt mehrere Karten, nennt sie deren Anzahl und dass alle Karten des Inhalts auch in anderen Stapeln gelöscht werden.
- Bestätigtes Löschen löscht lokal persistent (Soft Delete) und schließt das Kartendetail. Eine ausstehende Synchronisierung blockiert den Abschluss nicht.

Zustände und Meldungen:

Das Löschen meldet den Erfolg mit sofortigem Rückgängig samt Lernstand ([Undo und Änderungsprotokoll](#undo-und-änderungsprotokoll)).

### Kartendetail und Editor

Zweck:

Ein Kartenklick öffnet den Karteneditor.

Einstieg:

Aus der Kartenverwaltung öffnet `Allgemein`, aus einer Sitzung (mit validiertem Rückkontext) `Inhalt`.

Verhalten:

- Ab 1280 px Breite öffnet der Editor in der Kartenverwaltung neben der Liste (Suchzeile darüber, Liste links, Editor rechts in voller Fensterhöhe, beim Scrollen der Liste stehend); die Liste bleibt bedienbar, behält Auswahl und Scrollposition, und ein Klick auf eine andere Zeile wechselt die Karte. Darunter und außerhalb der Kartenliste (etwa aus einer Sitzung) bleibt er ein Dialog über der Ansicht.
- Stapel, Karte und Reiter sind Teil des Links; nur bekannte Reiter sind erlaubt. Reload und Browser-Zurück/-Vorwärts bleiben deterministisch, ein Reiterwechsel fragt nie nach.
- Aus der Kartenverwaltung blättert der Editor mit Vor/Zurück durch alle Zeilen der Tabelle in ihrer Reihenfolge (`12 / 48`); eine noch nicht geladene Zeile öffnet, sobald ihre Seite da ist, die benachbarten Treffer werden vorgeladen, und die Zeile der geöffneten Karte rückt beim Wechsel in den sichtbaren Bereich. Ohne Trefferliste, etwa aus einer Sitzung, entfällt das Blättern.
- Der Editor nennt den Status der Karte (Markierung, Flagge, Aussetzung, Lernbremse) und bietet Duplizieren und Löschen.
- Die Reiter lauten `Allgemein`, `Inhalt`, `Varianten` und `Lernen`.
- Speichern, Flagge, Markierung und der Wechsel zur vorigen oder nächsten Karte haben Tastenkürzel.

### Editor-Reiter Allgemein

Zweck:

`Allgemein` wirkt sofort und übernimmt keine ungespeicherten Inhaltsänderungen.

Verhalten:

- Der Reiter bündelt Flagge, Markierung, Planung und Stapel sowie Tags, `Karten aus diesem Inhalt`, `Ähnliche Inhalte` und `Details`.
- `Neu planen` setzt die Fälligkeit DST-sicher auf den Beginn des gewählten Lerntags und lässt eine Aussetzung bestehen. Dazu kommen `Aussetzen` und `Zurückstellen` (bis zum nächsten Lerntag).
- `Verschieben` wählt den Zielstapel im selben Dialog wie das Verschieben von Stapeln. Verlässt die Karte damit den geöffneten Stapelbaum, schließt der Editor; das Rückgängig öffnet die Karte wieder im früheren Stapel. Der frühere Stapel zeigt die verschobene Karte nicht mehr.
- Tags zeigen ihre Hierarchie; importierte Tags sind getrennt von eigenen zusammengefasst und lassen sich bearbeiten ([Tags](#tags)). Vorschläge kommen aus dem Tag-Verzeichnis des Kontos.
- `Karten aus diesem Inhalt` listet alle Geschwister mit Abfrage, Stapel und Lernzustand, kennzeichnet die geöffnete und zeigt Abfragen, die erst beim Speichern entstehen, als neu.
- `Ähnliche Inhalte` zeigt bis zu drei Inhalte mit ähnlichem Text; offline entfällt der Bereich. `Details` nennt Quelle, Prüfung und kopierbare IDs.

Zustände und Meldungen:

Verschieben, Zurückstellen, Neu planen, Lernbremse zurücksetzen und Tag entfernen bestätigen sich mit einer Meldung samt Rückgängig; eine neue Meldung ersetzt die vorige. Flagge, Markierung, Aussetzen und Tag hinzufügen wirken ohne Meldung und lassen sich direkt wieder zurücknehmen. Rückgängig folgt [Undo und Änderungsprotokoll](#undo-und-änderungsprotokoll).

### Editor-Reiter Inhalt

Zweck:

`Inhalt` ist der Entwurf.

Verhalten:

- Eine Live-Vorschau begleitet die Eingabe. Sie zeigt die geöffnete Karte, wechselt zu Geschwistern einschließlich neuer Abfragen und zwischen Vorder- und Rückseite; Auswahlfragen werden wie beim Erstellen nur transient simuliert. Gerendertes HTML wird nie gespeichert.
- Jedes Feld ist ein Rich-Text-Editor mit den gespeicherten Bildern. Öffnen und Schließen ohne Eingabe ändert nichts, auch nicht an importiertem HTML; die Änderung eines Felds schreibt die anderen nicht um.
- Auswahlfragen zeigen Antwortoptionen samt richtiger Antwort. Neue Bilder werden wie bei der Erstellung eingefügt und erst beim Speichern lokal gesichert; vorhandene Bilder, auch importierte Anki-Dateien, bleiben erhalten. Lückentexte erklären die Schreibweise `{{c1::Begriff}}`.
- `Antwort eintippen` gilt für die Abfrage. Eigene Inhalte mit Frage und Antwort bieten `Lernrichtung` (`Standard`, `Beide Richtungen`) und dieselben Bausteine wie bei der Erstellung.
- Hinzugefügte Felder lassen sich umbenennen, in der Rolle ändern und umsortieren; Vorder- und Rückseite bleiben vorn, der Lernstand bleibt. Die Felder mit der letzten Frage oder Antwort einer Abfrage lassen sich nicht entfernen.
- Die Medienliste nennt die Dateien des Inhalts, ihre Größe nur, wenn bekannt; ungenutzte lassen sich entfernen.
- Eigene Bildverdeckungen bearbeitet der Masken-Editor; Gruppennummern bleiben beim Löschen erhalten, sodass verbleibende Karten ihren Lernstand behalten. Das Bild lässt sich nicht austauschen.
- Importierte Inhalte behalten Feldschema und Abfragen; Lernrichtung, Bausteine und Masken-Editor gibt es dort nicht.
- Vor dem Speichern nennt der Editor die Wirkung, etwa eine neue Karte (Rückwärts), eine entfallende Karte (Lücke 2) und eine veraltende Variante. Neue Abfragen werden neue Karten im Stapel des Inhalts.

Zustände und Meldungen:

- Entfallen Karten, listet eine Rückfrage jede mit Abfrage, Stapel und Lernzustand; ihr Lernstand wird erst nach Bestätigung gelöscht.
- Ungespeicherte Änderungen an Feldern und Antwortoptionen verlangen beim Schließen, Kartenwechsel oder interner Navigation die Wahl zwischen Speichern, Verwerfen und Weiterbearbeiten; über Reiterwechsel bleibt der Entwurf erhalten.

Grenzen:

Tags, Sofortaktionen und Variantenbearbeitung gehören nicht zum Entwurf.

### Editor-Reiter Varianten

Verhalten:

- Der Reiter zeigt Original und Varianten gemeinsam.
- Jede Variante nennt ihren Zustand und lässt sich bearbeiten, neu generieren, abschalten bzw. reaktivieren und löschen; veraltete Varianten lassen sich ersetzen, ein Verweis führt zu den Stapeleinstellungen.
- Bearbeitungen werden sofort gespeichert; eine bearbeitete Variante gilt als eigene, eine Stapel-Neugenerierung ersetzt sie nicht, eine Inhaltsänderung macht sie wie alle veraltet.
- Der Reiter zeigt die Variantenbereitschaft nach Haltbarkeit ([Freigabe der Varianten](#freigabe-der-varianten)). Kennzahlen, Zustände und Aktionen regeln [Varianten erzeugen](#varianten-erzeugen) und [Varianten verwalten](#varianten-verwalten).

### Editor-Reiter Lernen

Verhalten:

- Kennzahlen aus Lernstand und FSRS-7, darunter Fälligkeit, Haltbarkeit, Abrufwahrscheinlichkeit, Schwierigkeit, Wiederholungen und Fehler, die Reife (`Neu`, `Lernen`, `Jung`, `Reif`) und eine Lernbremse mit Zeitpunkt.
- Der `Abrufverlauf` zeigt die Lernkurve: Die Abrufwahrscheinlichkeit springt nach jeder Bewertung auf 100 % und fällt bis zur nächsten; die Ziel-Abrufwahrscheinlichkeit des Stapels dient als Bezug, `Nochmal`-Bewertungen sind eingetragen. `Lernstand zurücksetzen` beginnt die Kurve neu.
- Die Liste `Bewertungen` nennt alle Bewertungen; lokal vorhandene erscheinen sofort, online ergänzt die Cloud den Rest.
- `Lernstand zurücksetzen` setzt nach Bestätigung Wiederholungs- und Fehlerzähler auf 0 und hebt die Lernbremse auf; danach wird die Karte wie eine neue gelernt. Der Bewertungsverlauf bleibt mit einem manuellen Eintrag, die Karte steht wieder an ihrer ursprünglichen Stelle unter den neuen Karten.

### Duplizieren und Löschen im Editor

Verhalten:

- `Duplizieren` legt eine eigenständige Kopie mit neuen Karten in denselben Stapeln an; die Frage erhält einmalig `(Kopie)`. Felder, Tags und Medien bleiben, Karten-, Review- und Scheduleridentitäten sind neu.
- Löschen fragt wie in der Kartenverwaltung nach ([Karten löschen](#karten-löschen)), schließt danach den Editor und bietet Rückgängig.

## 10. Prüfung

Der Prüfungsplaner verteilt den Stoff mehrerer Prüfungen auf Lerntage und macht daraus abhakbare, direkt lernbare Tagesaufgaben. Die Entscheidung steht in [ADR-042](decisions.md#adr-042--globaler-prüfungsplaner-mit-gemeinsamer-kontaktplanung).

### Prüfungsübersicht

Zweck:

`Prüfung` zeigt alle Prüfungen eines Kontos gemeinsam mit Kalender, heutigen Aufgaben und Prüfungsfortschritt.

Einstieg:

- Hauptreiter `Prüfung`.
- Ohne geplante Prüfung führt die Übersicht direkt in die Einrichtung der ersten Prüfung; mit Prüfungen lässt sich jederzeit eine weitere planen. Beides ist während des Speicherns, bei ungespeicherten Kalenderänderungen oder ohne vorhandenen Stapel deaktiviert.

Verhalten:

- Prüfungen lassen sich direkt in der Übersicht öffnen und bearbeiten ([Prüfungskarten](#prüfungskarten)).
- Übersicht und `Heute` nennen Kartenmengen statt geschätzter Dauer.

Zustände und Meldungen:

Ohne vorhandenen Stapel verweist die Übersicht auf das Erstellen oder Importieren eines Stapels.

### Prüfung einrichten

Zweck:

Vier Einrichtungsschritte führen durch Prüfung, Lernstoff mit Einführungsstichtag und Themenreihenfolge, Lernzeit je Klausur und Vorschau.

Verhalten:

- Zu vorherigen Schritten lässt sich direkt wechseln, vorwärts genau einen Schritt mit denselben Eingabeprüfungen wie beim Weitergehen; auch bereits besuchte Schritte lassen sich vorwärts nicht überspringen.
- Neben Name und Termin fragt die Einrichtung das Prüfungsziel: „Bestehen“, „Gute Note“, „Sehr gute Note“ und „Bestmöglich abschneiden“ setzen das FSRS-Abrufziel auf 85, 90, 95 beziehungsweise 97 Prozent; Standard ist „Gute Note“ (90 Prozent). Das Ziel bleibt beim Bearbeiten änderbar.
- Der Lernstart ist standardmäßig heute und liegt spätestens einen Tag vor der Prüfung. Er bleibt mit der Prüfung gespeichert und ist änderbar; alte Pläne ohne Lernstart planen ab heute.
- Vor dem Lernstart entstehen keine Lernaufgaben, geplanten Minuten oder Lerntage. Spätere Änderungen verwerfen früher zugeordnete Lernblöcke und passen offene Tagesziele an.
- Jede Prüfung hat eine frei wählbare Farbe, die mit dem Plan gespeichert wird und ihre Termine, Aufgaben und Lernblöcke überall kennzeichnet.
- Ein Oberstapel wählt rekursiv seine Unterstapel; einzelne Unterstapel lassen sich abwählen. Neue Unterstapel eines gewählten Stapels gehören automatisch dazu; abgewählte bleiben samt ihren Unterstapeln draußen. Eine Suche findet auch eingeklappte Unterstapel mit ihrem Hierarchiekontext; Auf- und Zuklappen verändert die Auswahl nicht.
- Die Zahl der Tage, die die letzte neue Karte vor der Klausur liegen soll, bestimmt den kalendarischen Einführungsstichtag. Bei Prüfung am 20. und Eingabe 4 gilt spätestens der 16.; freie Tage verschieben die Einführung früher. Die kleinste Eingabe 1 erlaubt neue Karten bis zum Vortag. Das resultierende Datum wird angezeigt.
- Wahlweise gehen neuen Themen Leseaufgaben voraus ([Leseaufgaben vor neuen Themen](#leseaufgaben-vor-neuen-themen)); bestehende Prüfungen ändern die Option bei ihren Lernzeiteinstellungen.

Grenzen:

Die Ziele sind Lernabsichten, keine Noten- oder Bestehensgarantie.

### Lernzeit je Klausur

Zweck:

Die Lernzeit wird je Klausur über einen von zwei alternativen Eingabewegen festgelegt.

Verhalten:

- Standard ist die Auswahl der Lerntage mit durchschnittlichen Minuten pro Lerntag. Beim Wechsel zur genauen Wochentagseingabe werden gewählte Tage mit diesem Durchschnitt und freie Tage mit 0 Minuten vorbelegt.
- In der Wochentagseingabe aktiviert ein positiver Wert den Tag, 0 Minuten setzt ihn frei. Diese Einzelwerte bestimmen die Planung.
- Beim Zurückwechseln wird der gerundete Durchschnitt der positiven Tageswerte übernommen; die gewählten Tage bleiben erhalten. Ein erneuter Wechsel übernimmt die dann aktuellen Durchschnittsangaben. Datums-Ausnahmen und gespeicherte konkrete Blöcke bleiben erhalten.
- Lernzeiten werden in ganzen Minuten eingegeben.
- Die Planung gewichtet ausschließlich das Verhältnis der Tage; proportional skalierte Vorgaben ergeben dieselbe Verteilung. Tagesausnahmen gelten je Klausur und übersteuern deren Rhythmus.
- Konkrete zugeordnete Kartenlernblöcke ersetzen die Vorgabe nur für ihr Fach und Datum; andere Tage und Fächer behalten ihre Vorgaben. Blöcke ohne Fach sind Kalendernotizen und verändern die Verteilung nicht. Prüfungstage bleiben frei.

### Kontaktplanung und Themen

Zweck:

Die begrenzte deterministische Kontaktplanung verteilt alle noch ungesehenen aktiven Karten gemeinsam auf die verbleibenden Einführungstage.

Verhalten:

- Teilen sich Prüfungen Stapel, wird jede Karte genau einmal eingeführt, spätestens zum frühesten Einführungsstichtag ihrer Prüfungen, und erscheint nur in deren Tagesaufgaben; später geplante Prüfungen berücksichtigen diese Last beim Ausgleich. Gemeinsame Karten erscheinen nur unter der Prüfung, die sie einführt.
- FSRS-7 simuliert Erstkontakte, Lern-, Wiederlern- und Wiederholungskontakte ohne Antwortzeiten oder Bearbeitungsminuten pro Karte. Karten mit identischem Lernstand und Profil werden als Kohorte gerechnet. Tatsächliche Bewertungsverteilungen liefern Szenarioannahmen; ohne ausreichende Historie gilt die vereinfachte Normal-Laufbahn.
- Zuerst wird die höchste relative Tageslast minimiert, danach deren Schwankungen und danach die prognostizierte Gesamterinnerung berücksichtigt. Eine feste Abnahmekurve gibt es nicht. Neue Karten kommen dadurch im Regelfall früher häufiger; Einzelmengen dürfen wieder steigen.
- Unterstapel bilden die Themen; ihre anfängliche Baumreihenfolge ist je Klausur per Ziehen oder Tastatur änderbar. Erst das Ablegen innerhalb der Liste übernimmt die neue Reihenfolge.
- Innerhalb eines Themas gilt die Erstellreihenfolge. Neue Karten werden zusammenhängend zugeteilt, ohne spätere Themen vorzuziehen.
- Ganze Themen und danach Halbierungen werden innerhalb von 25 Prozent des rechnerischen Tagesziels bevorzugt; große Themen werden fortlaufend geteilt, Rundungsreste auf Folgetage verteilt.
- Ein Themenstarttag bedeutet „frühestens ab“ und kann spätere Themen mitverschieben; die Themenliste zeigt immer den tatsächlich geplanten Start, und kein Thema kann vor dem Start des vorherigen beginnen.
- Nach tatsächlichen Antworten wird nur noch ungesehener Stoff neu verteilt; manuelle Häkchen verändern keinen Lernstand. Heutige gespeicherte Zielkarten bleiben beim Neuberechnen stabil, tatsächliche Fälligkeiten werden ergänzt. Explizite Planänderungen ersetzen offene Ziele, erledigte Aufgaben bleiben erhalten.
- Vorschau, Checkliste und Sitzung nutzen dieselben Ziele; Prüfungssitzungen erhalten die Themenreihenfolge und begrenzen den Plan nicht durch normale Tageslimits.

Zustände und Meldungen:

- Hohe Tagesmengen verhindern das Speichern nicht; mehr als zwei neue Karten pro Minute eingeplanter Lernzeit nennen Vorschau und Tagesdetails als Hinweis.
- Ohne verfügbaren Einführungstag bleiben Entwurf und Erklärung sichtbar.
- Nicht zuordenbarer neuer Stoff bleibt ausdrücklich offen. Nach verstrichenem Einführungsstichtag bleibt neuer Stoff offen und wird nicht stillschweigend in den Puffer verschoben.

Grenzen:

Die Suche behauptet kein globales Optimum.

### Plan-Vorschau

Verhalten:

- Die Vorschau nennt Karten, verbleibende neue Karten, Lerntage und die Summe der selbst eingeplanten Lernzeit.
- Lerntage zählen alle Tage mit positiver eingeplanter Lernzeit ab dem späteren Datum aus heute und Lernstart bis vor die Prüfung, einschließlich der Wiederholungsphase nach dem Stichtag für neue Karten. Freie Tage und Prüfungstage zählen nicht; Tagesausnahmen und zugeordnete Lernblöcke werden berücksichtigt.
- Die Themenfolge nennt je Thema den geplanten Lernbeginn oder seinen Einführungsstatus. Führt eine andere Prüfung ein gemeinsames Thema ein, nennt der Eintrag sie.
- Mit Name, künftigem Termin und mindestens einem Stapel ist Speichern immer möglich, auch ohne Verbindung oder fertige Vorschau; nicht mehr einplanbare neue Karten erscheinen als offen.

Grenzen:

Benötigte Zeit, Machbarkeit, Gefährdungsaktivierung und Zeitplanstatus gibt es nicht.

### Prüfungskalender

Zweck:

Die Prüfungsübersicht beginnt auch ohne angelegte Prüfungen mit einem Kalender von Montag bis Sonntag, umschaltbar zwischen Monat und Woche.

Verhalten:

- Der Kalender zeigt Klausurtermine und je Tag die Lernaufgaben nach Fach; neue Karten und Leseaufgaben eines Fachs gehören zusammen.
- Die Standardansicht beginnt mit der aktuellen Woche und blendet vergangene Wochen aus; frühere Wochen und Monate lassen sich zurückblättern.
- Jede Prüfung lässt sich unabhängig ein- oder ausblenden, auch mehrere oder keine. Die Auswahl gilt gemeinsam für Monat, Woche und Tagesdetails einschließlich zugeordneter Lernblöcke; unzugeordnete Blöcke bleiben sichtbar. Sie ändert keine gespeicherte Planung. Standardmäßig sind alle Prüfungen eingeblendet, in der Einrichtung zunächst die aktuelle.
- Ein Tag zeigt sämtliche Klausuren und Lernaufgaben mit Fachnamen und Kartenmengen ([Tagesansicht im Kalender](#tagesansicht-im-kalender)).
- Änderungen am bestehenden Kalender werden mit neu berechneter Vorschau ausdrücklich gespeichert oder verworfen; Speichern wartet nicht auf die Vorschau.

Grenzen:

Die Monatsübersicht nennt Kartenmengen, keine Minuten, Uhrzeiten oder Wiederholungszähler.

### Wochenansicht und Lernblöcke

Verhalten:

- Die Wochenansicht zeigt von Montag bis Sonntag die To-dos und ein Zeitraster von 7 bis 24 Uhr.
- Lernzeit wird in 30-Minuten-Schritten als Block markiert, zunächst ohne Fach. Eine Kartenaufgabe ordnet ihr Fach einem Block zu, per Ziehen, Auswahl oder Tastatur; Zeiten lassen sich auch über Datum und Von-/Bis-Angaben eingeben.
- Blöcke ohne Fach bleiben als Notiz speicherbar; zugeordnete Blöcke setzen die Lernzeit ihres Fachs an diesem Tag.
- Überlappungen werden abgelehnt; Blöcke lassen sich direkt löschen.
- Blöcke lassen sich per Zeiger oder Tastatur in 30-Minuten-Schritten verlängern, verkürzen und mit gleicher Dauer verschieben; die Mindestdauer beträgt 30 Minuten, alle Blöcke liegen zwischen 7 und 24 Uhr. Erst das Loslassen übernimmt eine Änderung.

Grenzen:

Tag und Woche teilen einen Bearbeitungshorizont: ab heute ein Jahr, Prüfungstage bleiben frei.

### Tagesansicht im Kalender

Verhalten:

- Ein ausgewählter Tag öffnet seine Tagesansicht, ohne den Kalender zu verlassen.
- Er zeigt je Fach die neuen Karten mit Themen und Leseaufgaben sowie die eigene Tageslernzeit in Minuten; nur eigene Lernblöcke dieses Fachs ersetzen und sperren diese Eingabe.
- Dazu kommen Zeitreservierungen mit oder ohne Fach und, bei einer gewählten Prüfung, Themenverschiebung und -tausch.

### Prüfungskarten

Zweck:

Jede Prüfung erscheint in der Übersicht als Karte mit Name, Termin und Resttagen; pausierte und abgeschlossene Prüfungen tragen ihren Status `Pausiert` bzw. `Abgeschlossen`, aktive keinen.

Verhalten:

- Geöffnet zeigt sie Kennzahlen und Aktionen: „Mindestens einmal gelernt“ (mit Gesamtzahl) und „Noch ungesehen“.
- Der Fortschritt nennt den Anteil `Gesehen` und darin den Anteil `Gefestigt` in Prozent. Beide beziehen sich auf alle ausgewählten Karten und werden nicht addiert; auch pausierte, abgeschlossene und vergangene Prüfungen zeigen ihren tatsächlichen Lernstand.
- Gefestigt sind aktive Karten mit der Reife `Reif`, also in der Wiederholungsphase mit mindestens 21 Tagen Haltbarkeit; nach `Nochmal` zählt eine Karte nicht mehr. Variantenantworten tragen zur gemeinsamen Kartenreife bei. Lern- und Wiederlernschritte zählen nicht als gefestigt.
- Bearbeiten öffnet alle Angaben der Prüfung (Name, Farbe, Termin, Stapelauswahl, Ziel-, Zeit- und Planungseinstellungen) direkt in ihrer Karte. Neue Prüfungen verwenden die geführten Einrichtungsschritte.
- Prüfungen lassen sich bearbeiten sowie nach Bestätigung pausieren, fortsetzen, abschließen und löschen. Ab dem Tag nach ihrem Termin gilt eine Prüfung automatisch als abgeschlossen. Abgeschlossene Prüfungen lassen sich vor ihrem Termin wieder öffnen; nach dem Termin muss zuerst das Datum angepasst werden.
- Löschen entfernt ihre Zeitreservierungen und Tagesaufgaben, Karten und Lernstände bleiben erhalten. Innerhalb der Ansicht stellt Rückgängig die zuletzt gelöschte Prüfung einschließlich dieser Zuordnungen wieder her.

Zustände und Meldungen:

Ungespeicherte Änderungen werden beim Abbrechen, Schließen oder Wechseln der Bearbeitung nur nach Bestätigung verworfen; das gilt ebenso für Kalenderentwürfe und beim Wechsel über die Hauptnavigation.

Grenzen:

Eine Einschätzung der sicheren Beherrschung, eine geschätzte Abrufsicherheit und ein Zeitplanstatus („Gut im Zeitplan“, „Im Zeitplan“, „Mehr Lernzeit nötig“) samt Prognose erscheinen nicht.

### Tagesaufgaben und Prüfungssitzung

Zweck:

Pro Thema gibt es eine abhakbare Lernaufgabe mit eindeutiger Kartenmenge und Startaktion, ohne Dauerschätzung; auch abgehakte Aufgaben lassen sich starten.

Verhalten:

- Die heutige Einheit lässt sich gemeinsam starten; einzelne Themen bleiben direkt startbar. Eine Themenaufgabe startet die Vereinigung ihrer neuen Karten und Wiederholungen, die Gesamtaktion die heutige Einheit.
- `Heute` enthält ein Prüfungswidget für alle aktiven Prüfungen, ebenfalls ohne Zeitplanstatus.
- Je Prüfung stehen offene Aufgaben vor erledigten; die vollständige Liste lässt sich je Prüfung öffnen.
- Die Zielkarten der Checkliste bleiben für den aktuellen Lerntag im Profil gespeichert, höchstens 5.000 je Lerntag; weitere neue Karten plant CoRe auf Folgetage; explizite Planänderungen dürfen offene Ziele ersetzen.
- Manuelle Häkchen sind widerrufbar und ändern keinen Kartenlernstand.
- Automatisch wird eine Lernaufgabe abgehakt, wenn alle Zielkarten seit ihrem Einplanen bewertet wurden, im Wiederholungszustand sind und erst nach diesem Lerntag wieder fällig werden. Fehlende Karten, offene Lernschritte und heutige Fälligkeiten gelten nicht als erledigt; Rückgängigmachen im Lernstand öffnet ein automatisches Häkchen wieder.
- Der nächste Lerntag beginnt eine neue Checkliste.
- Prüfungssitzungen verwenden die Zielsicherheit ohne normale Tageslimits und ändern keine gespeicherten Stapeleinstellungen.

Grenzen:

Erwartete zukünftige Kontakte dienen nur intern zur Verteilung; sichtbar sind heute ausschließlich tatsächliche Fälligkeiten und Lernschritte, ohne errechnete Zeitgrenze. Quiz, Altfragen und Prüfungssimulation gehören nicht zum Prüfungsplaner; Quizplanung kommt erst mit einem eigenen Quiz-Feature.

### Leseaufgaben vor neuen Themen

Verhalten:

- Optional ergänzt die Planung am ersten Einführungstag eines Themas eine manuell abhakbare Leseaufgabe vor den Karten; hat das Thema schon begonnen, steht sie auf `Heute`, bis sie abgehakt ist oder alle Karten des Themas eingeführt sind.
- Sie öffnet vorhandene Zusammenfassungen des Stapels; fehlende oder nicht prüfbare Inhalte werden genannt.
- Die Erledigung bleibt je Klausur und Thema über Tageswechsel erhalten.
- Die Kalender zeigen die Leseaufgabe ebenfalls.

Grenzen:

Sie blockiert den Lernstart nicht, generiert keine Inhalte und erhält keine Lesezeitschätzung.

### Prüfung offline

Verhalten:

- Ohne Verbindung zeigen `Heute` und `Prüfung` die zuletzt gespeicherten Tagesziele als zuletzt geplante Aufgaben und den Kalender ohne Kartenmengen.
- Häkchen und Start bleiben nutzbar; die Einheit startet mit den Zielkarten, die auf dem Gerät liegen, und CoRe nennt je Aufgabe den Rest, der erst online verfügbar ist.
- Neu geplant wird erst wieder online, automatisch beim Wiederverbinden.

Zustände und Meldungen:

Ohne gespeicherte Tagesziele meldet der Planer den Verbindungsbedarf.

## 11. Zusammenfassungen und Mindmaps

Die Reiter `Zusammenfassungen` und `Mind Map` der [Stapelinhalte](#stapelinhalte) verdichten die Karten eines Stapels zu lesbaren Fassungen und einer frei gestaltbaren Karte des Stoffs.

### Zusammenfassungsliste

Zweck:

`Zusammenfassungen` listet mehrere benannte Fassungen des ausgewählten Stapels.

Verhalten:

- Die Liste ist durchsuchbar.
- Jede Fassung nennt Titel, Zielumfang, Detailgrad und die aus dem tatsächlichen Text berechnete Lesezeit und zeigt einen Textausschnitt; Öffnen zeigt den ganzen Text im Editor.
- Jede Fassung lässt sich nach Rückfrage auf allen Geräten löschen; ohne Verbindung verschwindet sie sofort aus der Liste, und die Löschung wird beim nächsten Öffnen hochgeladen. Aus ihr erzeugte Mindmap-Karten bleiben.
- Die [KI-Erstellung](#ki-erstellung-einer-zusammenfassung) fragt Titel (vorbelegt) und Umfang (nur dieser Stapel oder samt Unterstapeln) ab.
- Weitere Einstellungen sind Material, Länge, Detailgrad, Darstellung, Lernziel, optionaler thematischer Fokus, einfache oder fachnahe Sprache, Beispiele und sichtbare Verweise. Länge und Detailgrad sind unabhängig; kurz und detailliert ist eine gültige Kombination.
- Der manuelle Weg öffnet direkt einen leeren, noch ungespeicherten Editor mit dem Stapelnamen als änderbarem Titel.
- Eine weitere Fassung überschreibt keine bestehende.

### KI-Erstellung einer Zusammenfassung

Zweck:

Die KI-Erstellung übermittelt ausschließlich lesbare Inhalte und die gewählten Wünsche an die authentifizierte serverseitige OpenRouter-Route. Die Wünsche bilden einen getrennten, strukturierten Auftrag.

Verhalten:

- Richtwerte für die KI-Erstellung: kurz etwa 1–2 Minuten bzw. 150–300 Wörter, mittel 3–5 Minuten bzw. 450–750 Wörter, lang 6–10 Minuten bzw. 900–1500 Wörter. Wenig Material wird nicht künstlich aufgefüllt. Die tatsächliche Lesezeit wird unabhängig davon aus dem geschriebenen Text berechnet.
- Alle Einstellungen vervollständigen den deutschen Prompt; Fokus und Material dürfen keine Systemanweisungen überschreiben. Die KI darf nur belegte Fakten und Beispiele übernehmen, muss Einschränkungen erhalten und Widersprüche benennen. Richtige Antworten bei Auswahlkarten werden ausdrücklich von Distraktoren unterschieden.
- Die Fassung bleibt beim Material ohne externes Wissen: Definitionen, Zahlen, Einheiten, Formeln, Verneinungen, Bedingungen und Ausnahmen bleiben erhalten, Widersprüche erscheinen mit beiden Fundstellen und fehlendes Material als Hinweis; bei knapper Länge haben Fokus und zentrale Konzepte Vorrang, Prüfungsrelevanz wird nicht erfunden.
- Für eine Erstellung lässt sich eine Quelle anfügen: PDF, Text, Markdown, CSV oder TSV bis 20 MiB. Ein lesbarer Anhang erlaubt das Material `Karten und Quelle` sowie `Nur Quelle`; Entfernen setzt es auf `Nur Karten` zurück. Die Quelldatei wird nicht dauerhaft gespeichert. Ein Anki-Quellenlink allein gilt nicht als gelesener Quelleninhalt.
- Vor der KI-Anfrage wird das gewählte Material vollständig und eindeutig geladen; Kartenvarianten zählen nicht als neue Inhalte. Karten werden für den gewählten Stapel beziehungsweise ganzen Unterstapelbaum vollständig geladen; jeder Inhalt wird unabhängig von seinen Karten einmal verarbeitet.
- Die KI liefert genau einen validierten Werkzeugaufruf mit Hauptabschnitten, höchstens einer Ebene Unterabschnitte, Absätzen und Stichpunkten aus Stichwort und Aussage sowie Materialverweisen je Abschnitt; optional nennt sie bis zu zwölf belegte Querbezüge zwischen Stichworten, die mit der Fassung gespeichert werden.
- Das Editor-HTML erzeugt die App selbst aus der strukturierten Antwort.
- In der Darstellung `Gegliedert` erklären Absätze Zusammenhänge ausführlich; Stichpunkte ergänzen nur Begriffe, Kriterien und Merksätze, die der Fließtext nicht schon ausführt, und wiederholen ihn nicht.
- Mit sichtbaren Verweisen erhält jeder Abschnitt seine Belege; Kartenbelege verweisen auf vorhandene Karten, Quellenbelege nennen Datei und PDF-Seite.
- Während der Erstellung bleibt der Auftrag erhalten; Abbrechen beendet die Anfrage, und eine verspätete Antwort wird nicht übernommen.
- Ein erfolgreicher Inhalt öffnet als ungespeicherter Entwurf im Editor. Erst die Speicherentscheidung beim Verlassen übernimmt ihn. Modell, Promptversion, Erstellungszeit und Datenschutzmodus bleiben mit der Fassung gespeichert.
- Auftrag, Prompt und Werkzeugvertrag regelt [`architecture.md`](architecture.md#zusammenfassungen-und-mindmaps).

Zustände und Meldungen:

- Unbekannte Verweise, leere Abschnitte und abgeschnittene Antworten werden abgewiesen.
- KI-Fehler erhalten die Auswahl.
- Größere Bereiche werden sichtbar abgewiesen und niemals still abgeschnitten; das Laden bricht ab, sobald die Grenze überschritten ist.

Grenzen:

- Eine KI-Fassung unterstützt bis 3.000 Materialeinheiten und insgesamt 400.000 Zeichen.
- Bilder, Ton und gescannte PDF-Seiten ohne Textlayer werden nicht ausgewertet; ausgelassene Bildverdeckungen und Quellenseiten stehen ausdrücklich im Ergebnis.
- Die Ausgabesprache ist zunächst Deutsch. Größere Materialmengen als die Grenze werden später thematisch in Teilen verdichtet, wobei die Belegzuordnung bis ins Endergebnis erhalten bleiben muss. Der Prompt allein garantiert keine Faktentreue.

### Zusammenfassungseditor

Zweck:

Die vollständige Fassung steht auf einer zusammenhängenden Schreibfläche, die mit Text und Zeichnungen wächst.

Verhalten:

- Bestehende mehrseitige Texte erscheinen zusammenhängend; vorhandene Zeichenstriche bleiben erhalten.
- Der Editor kennt die Modi Schreiben, Stift, Zeichenmarker und Radierer, je mit eigenem Rückgängig/Wiederholen, und eine bildschirmfüllende Arbeitsfläche.
- Stift und Marker merken sich getrennt Farbe und Stärke.
- Der Marker arbeitet `Gerade auf Textzeile` (Standard) oder `Freihand`. Gerade hebt genau den überstrichenen Text einer Zeile als Textformatierung hervor, sodass die Markierung bei Umbruch und Schriftgröße mit dem Text wandert; außerhalb von Text entsteht keine Markierung. Freihand zeichnet transparent auf die Zeichenfläche.
- Der Radierer entfernt angetippte Striche; alle Zeichnungen lassen sich auf einmal entfernen; beides ist rückgängig machbar.
- Der Text bietet übliche Dokumentformatierungen (Hervorhebungen, Farbe, Listen, Formatierung entfernen) sowie eine globale Schriftart (Standard oder Serif) und Schriftgröße, die mit der Fassung erhalten bleiben.
- Gespeichert wird beim Verlassen: Über Zurück, Inhaltsreiter oder andere App-Bereiche fragt die App bei geänderten Entwürfen nach Speichern, Verwerfen oder Weiterbearbeiten. Speichern übernimmt Titel, Text, Schrift und Zeichnungen. Auch ein geändertes Erstellungsformular wird geschützt.

Zustände und Meldungen:

Browser-Reload warnt bei einem offenen geänderten Entwurf. Speicherfehler bleiben sichtbar und erhalten die Bearbeitung.

Grenzen:

- Duplizieren, Löschen und Neu erzeugen gibt es nur in der Zusammenfassungsliste, nicht im Editor.
- Es gibt keine Seitenumbrüche, Seitenanzahl, Seitenformate oder Ansichtsumschaltung.

### Zusammenfassungen speichern

Verhalten:

- Zusammenfassungen liegen im Konto online und erscheinen auf jedem angemeldeten Gerät.
- Ohne Verbindung wird eine Fassung lokal gespeichert, als noch nicht synchronisiert gekennzeichnet und beim nächsten Öffnen hochgeladen.

Zustände und Meldungen:

Wurde dieselbe Fassung zwischenzeitlich auf einem anderen Gerät geändert, behält sie dessen Stand, die eigenen Änderungen erscheinen als eigene Fassung `Konfliktfassung von …`, und ein Hinweis nennt sie.

Grenzen:

Export und dauerhafte Hintergrundjobs gehören nicht zu diesem Speichervertrag.

### Mindmap anlegen und erzeugen

Zweck:

`Mind Map` öffnet unmittelbar genau eine unbegrenzte, verschiebbare Fläche je Stapel. Auf ihr können mehrere getrennte Mindmaps entstehen.

Verhalten:

- Das Erzeugen aus einer Zusammenfassung macht aus einer gespeicherten Fassung desselben Stapels lokal ohne KI einen Kartenbaum auf der vorhandenen Fläche; bei mehreren Fassungen ist die zuletzt bearbeitete vorgewählt.
- Überschriften werden Äste, fette Stichworte und kurze Absätze oder Listenpunkte werden Karten; längere Absätze bleiben vollständig als Text ihrer Abschnittskarte, nur Absätze ohne Überschrift erhalten eine eigene Karte mit gekürztem Titel. Der Abschnitt `Hinweise zum Material` und Belege erzeugen keine Karten.
- Erzeugte Karten enthalten die zugehörige Zusammenfassungspassage als normal bearbeitbaren Text.
- Die letzte Karte jedes Zweigs ist eine Textkarte mit direkt sichtbarem Text, alle übergeordneten Karten sind Stichwortkarten mit eingeklapptem Text; diese Vorgabe gilt bei der Erzeugung und kann danach manuell geändert werden.
- Von der KI belegte Querbezüge zwischen Stichworten werden Querverbindungen.
- Besteht bereits ein Baum aus dieser Fassung, ersetzt erneutes Erzeugen ihn an seiner Stelle; wurde er seit dem Erzeugen bearbeitet, fragt CoRe, ob er überschrieben, daneben neu angelegt oder abgebrochen werden soll. Andere Karten der Fläche bleiben erhalten.
- Hat der Stapel noch keine Zusammenfassung und ist die Fläche leer, erzeugt der Reiter direkt Zusammenfassung und Mindmap, wahlweise mit Unterstapeln (Standard: einbezogen); eine Mindmap ohne gespeicherte Zusammenfassung entsteht nicht.

### Mindmap-Karten bearbeiten

Verhalten:

- Stichwortkarten zeigen ihren Titel und, falls vorhanden, dass sie Text oder Bilder enthalten; aufgeklappt zeigen sie diese Inhalte. Textkarten zeigen Text und Bilder direkt auf der Fläche.
- Titel und Rich Text einer Karte lassen sich direkt auf der Fläche bearbeiten.
- Generierte Karten behalten ihre Textstelle als unveränderliche Quelle; beim Bearbeiten oder Aufklappen bleibt die gespeicherte Zusammenfassungsfassung erreichbar; spätere Änderungen der Zusammenfassung überschreiben sie nicht.
- Je Karte sind bis zu vier PNG-, JPEG-, WebP- oder GIF-Bilder möglich, je Map höchstens zehn verschiedene; danach lassen sich keine Bilder mehr hinzufügen. Gewählte Dateien dürfen bis 20 MB groß sein; JPEG, PNG und WebP werden auf höchstens 1600 px verkleinert und als WebP gespeichert, jedes gespeicherte Bild höchstens 2 MB. Kopierte Karten teilen ihre Bilder mit dem Original.
- Kasten-, Stift-, Rahmen- und Hintergrundfarben sind frei wählbar. Sind mehrere Karten gewählt, gelten Kastenfarbe und Kastenart für alle; Bilder bleiben eine Aktion für einzelne Karten.
- Duplizieren kopiert die gewählten Karten samt Unterbäumen, internen Querverbindungen, Umrandungen und Klammern neben das Original.

### Mindmap-Struktur und Werkzeuge

Verhalten:

- **Struktur:** Eine ausgewählte Karte erhält Geschwister und Unterknoten. Neue Hauptäste verteilen sich um das zentrale Thema; bestehende Karten behalten ihre Positionen.
- **Verbindungen:** Die Hierarchie ist zyklenfrei und von Querverbindungen unterscheidbar; Querverbindungen dürfen Zyklen bilden, erneutes Verbinden desselben Paars löst sie. `Verknüpfen` hängt lose Karten als Unterknoten an einen Ast und verbindet bereits angegliederte Karten quer. Umhängen oder Entfernen eines Elternknotens erhält andere Karten und ihre Positionen. Die Linienfarbe ist wählbar und wird mit der Map gespeichert.
- **Werkzeuge:** Es gibt Stichwort- und Textkarten, die Modi `Verknüpfen`, `Karte bearbeiten`, `Gestalten` und `Hinzufügen`, Rückgängig/Wiederholen und bei vorhandener gespeicherter Zusammenfassung das Erzeugen aus ihr; ohne Zusammenfassung bleibt das Erzeugen von Zusammenfassung und Mindmap erreichbar.
- **Hinzufügen:** `Hinzufügen` bietet Mehrfachauswahl, Zusammenfassungsklammer und Umrandung; Kontextmenüs führen zu denselben Werkzeugen.
- **Zusammenfassungsklammer:** Sie umfasst benachbarte gleichrangige Karten eines Astes und trägt eine eigene, frei bearbeitbare Zusammenfassungskarte, die Unterknoten haben kann. Der erfasste Bereich ist änderbar, die Klammer folgt ihren Karten und Unterbäumen. Entfernen erhält die Karten. Es erfolgt keine KI-Anfrage.
- **Umrandung:** Sie gruppiert ausgewählte Karten mit wählbarer Form, Beschriftung und Gestaltung. Sie folgt ihrem Inhalt; Verschieben bewegt die Karten mit, Entfernen erhält Karten und Hierarchie.

### Mindmap bedienen

Verhalten:

- **Bewegen und Ansicht:** Karten lassen sich auswählen, verschieben und bearbeiten; die Fläche lässt sich verschieben und zoomen. Die Gesamtansicht umfasst Karten, Umrandungen samt Beschriftung und Zeichnungen.
- **Platzierung:** Neue Karten werden kollisionsarm platziert; wächst eine Karte, rücken automatisch platzierte Karten bei Überlagerung nach, gezogene oder manuell platzierte Karten bleiben unverändert.
- **Tastatur:** Die Mindmap ist vollständig per Tastatur bedienbar: entlang der Hierarchie zwischen Karten wechseln, verschieben, bearbeiten, Unterknoten und Geschwister anlegen, entfernen, kopieren, einfügen, duplizieren, rückgängig machen, alles auswählen, zoomen, verknüpfen und Klammerbereiche ändern. Eine Übersicht nennt alle Kürzel; jede Funktion ist auch ohne Tastatur erreichbar.
- **Touch und Screenreader:** Bearbeiten, Auswählen, Zoomen und Verschieben funktionieren auch per Touch, einschließlich iOS. Jede Karte ist für Screenreader benannt und einzeln auswählbar.
- **Vollbild:** Ein Vollbildmodus zeigt die ganze Mindmap samt Werkzeugen.

### Mindmap gestalten und speichern

Verhalten:

- **Gestalten:** Zeichnen in Farben und Stärken, Radieren einzelner Linien und freier Text ohne Kartenrahmen; bei einer ausgewählten Karte bearbeitet Schreiben deren Text. Freier Text nutzt denselben Rich-Text-Editor und lässt sich auswählen, bewegen, bearbeiten und entfernen.
- **Fläche leeren:** Leeren fragt nach und entfernt alle Karten, Verbindungen, Klammern, Umrandungen, Zeichnungen und Bilder; Titel und Linienfarbe bleiben, Rückgängig stellt alles in einem Schritt wieder her.
- **Verlauf:** Rückgängig/Wiederholen umfasst alle Inhaltsänderungen, nicht aber Ansicht und Zoom; das Tippen in einer Karte zählt vom Öffnen bis zum Schließen als ein Schritt, die Historie umfasst 100 Schritte.
- **Speichern:** Änderungen werden nach kurzer Eingabepause automatisch gespeichert; Änderungen während einer laufenden Speicherung werden anschließend ebenfalls gespeichert. Entwurfsschutz gilt für Zurück, Inhaltsreiter, andere App-Bereiche und Browser-Reload; ein laufender Bildimport gehört dazu, und Speichern beim Bereichswechsel wartet auf ihn.
- **Konto und Offline:** Die Map liegt je Stapel samt ihrer Bilder im Konto online und erscheint auf jedem angemeldeten Gerät. Ohne Verbindung wird sie lokal gespeichert, als noch nicht synchronisiert gekennzeichnet und beim nächsten Öffnen hochgeladen. Hat ein anderes Gerät zwischenzeitlich gespeichert, gewinnt der zuletzt gespeicherte Stand; der Hinweis nennt das Ersetzen.

Zustände und Meldungen:

- Speicherfehler bleiben sichtbar, erhalten den Entwurf und bieten erneutes Speichern; eine erfolgreiche Speicherung wird für assistive Technik angekündigt.
- Eine Änderung, die eine Grenze überschreiten würde, wird mit Grenze und aktuellem Wert abgewiesen; an der Kartengrenze lassen sich keine Karten mehr anlegen.

Grenzen:

- Eine Map umfasst höchstens 2.000 Karten und freie Texte, 10.000 Querverbindungen, 2.000 Linien sowie jeweils 500 Zusammenfassungsklammern und Umrandungen.
- Export und kollaborative Bearbeitung sind nicht implementiert.

## 12. Statistik

Die Statistik zeigt Lernaktivität, Planung und Gedächtnismodell für die gewählten Stapel und Zeiträume.

### Statistik laden und filtern

Einstieg:

`Statistik` in der App-Navigation ([App-Shell und Navigation](#app-shell-und-navigation)).

Verhalten:

- Ein gemeinsamer Filter steuert alles außer der Heatmap: Zeitraum `30 Tage`, `90 Tage`, `1 Jahr` oder `Gesamt` und Umfang `Gesamte Sammlung`, ein oder mehrere Stapel. Standard ist `Gesamte Sammlung · 1 Jahr`; Oberstapel schließen Unterstapel dedupliziert ein.
- Die Stapelauswahl ist durchsuchbar und zeigt eingeschlossene Unterstapel als eingeschlossen.
- Bei einem Filterwechsel bleibt das letzte Ergebnis sichtbar, bis das neue vorliegt; verspätete Antworten überschreiben keine neuere Auswahl.
- Die Statistik beruht auf serverseitigen Auswertungen; noch nicht bestätigte Bewertungen fließen sofort ein, noch nicht bestätigte Neuplanungen nicht.

Zustände und Meldungen:

- Beim ersten Öffnen zeigt die Statistik ihren Ladezustand, auch für Screenreader.
- Fehler erhalten Filter und letzte Daten mit Wiederholungsaktion.

### Statistikbereiche

Verhalten:

- Die Statistik gliedert sich in `Überblick`, `Lernaktivität`, `Planung & Kartenbestand`, `FSRS-Gedächtnismodell`, `Antwortverhalten` und gegebenenfalls `Stapelvergleich`. Der Überblick fasst die wichtigsten Kennzahlen zusammen.
- Historische Bereiche: Übersicht, Wiederholungen nach Art, gemessene Lernzeit mit Abdeckung, hinzugefügte Karten, Lern-Heatmap, Antwortzeitpunkt, Antwortknöpfe, wahre Erinnerungsquote und Stapelvergleich.
- Die Planung zeigt Rückstand, künftige Fälligkeiten, kumulierten Verlauf und geschätztes Tagespensum; der Zeitraum ist ihr Zukunftshorizont.
- Status, FSRS-Schwierigkeit, Stabilität und aktuelle Abrufwahrscheinlichkeit sind Momentaufnahmen des heutigen Stands; bei Intervallen begrenzt der Zeitraum nur die Anzeige.
- Der Stapelvergleich nennt je Stapel seine Kennzahlen; der Stapelname öffnet die Stapelinhalte.
- Diagrammwerte sind als Text und per Zeiger, Touch und Tastatur im Detail abrufbar.

Zustände und Meldungen:

Fehlende Historie, Zeitmessung oder Stichprobe wird erklärt; die Oberfläche erfindet keine Nullwerte.

### Lern-Heatmap

Zweck:

Die Lern-Heatmap erscheint auf `Heute` und in der Statistik.

Verhalten:

- Die Heatmap folgt nur der Stapelauswahl und wählt ihren Zeitraum selbst (`Woche`, `Monat`, `Jahr`; Standard die letzten sieben Lerntage). Monat und Jahr zeigen ganze Kalenderzeiträume; geblättert wird um einen ganzen Zeitraum.
- Ihre Farbe ist wählbar und gilt browserlokal für `Heute` und Statistik gemeinsam.
- Der Titel nennt den Streak der gewählten Stapel; ein Lerntag zählt ab einem validen Review, der sichtbare Zeitraum begrenzt den Streak nicht.
- Von morgen bis Tag +365 zeigt eine von der Aktivität unterscheidbare Prognose die nächste Fälligkeit jeder aktiven Karte genau einmal (ohne Varianten, Entwürfe, gelöschte, ausgesetzte und begrabene Karten), ohne Folgetermine zu simulieren.

### Kennzahlen und Kategorien

Verhalten:

- Die wahre Erinnerungsquote verwendet nur die erste geeignete Wiederholung einer Karte je Lerntag mit vorherigem Intervall von mindestens einem Tag. Ändert sich der Tagesbeginn, werden Reviews neu gruppiert.
- Historische Kategorien kommen Anki-kompatibel aus dem Zustand vor der Antwort: Lernen, Wiederlernen, `Intervall unter 21 Tagen` und `Intervall ab 21 Tagen`. Der Kartenstatus zählt dagegen die Reife (`Neu`, `Lernen`, `Jung`, `Reif`).

Grenzen:

Klassische Anki-Leichtigkeit und ein separater Schwierigkeitsstatus werden nicht angezeigt; der FSRS-Parameter Schwierigkeit bleibt.

## 13. Einstellungen

Allgemeine Einstellungen und Lerneinstellungen liegen im Einstellungsdialog, die Werte einzelner Stapel in den Stapeleinstellungen. Beide speichern über dieselbe Speicherleiste.

### Einstellungsdialog

Zweck:

Allgemeine und Lerneinstellungen bilden einen Dialog `Einstellungen` über der aktuellen Ansicht.

Einstieg:

- `Einstellungen` in der App-Navigation, die Lerneinstellungen in Lernen und Kartenverwaltung (`Lerntag & Planung`), der Querverweis der Stapeleinstellungen (`Tagesrunde & Lernprofile`), das Benennen von Flaggen (`Flaggen`) und der Sync-Status (`Daten & Synchronisierung`, bei Konflikten direkt bei den Konflikten).
- Aus dem Karteneditor wird zuerst die Karte verlassen. Ein Direktaufruf öffnet den Dialog über der aufgerufenen Ansicht.

Verhalten:

- Die Bereiche bilden zwei Gruppen: `Allgemein` mit `Konto`, `Daten & Synchronisierung` und `Über uns`, `Lernen` mit `Lerntag & Planung`, `Tagesrunde & Lernprofile`, `Scheduler & CoRe`, `Flaggen` und `Fokuswerkzeuge`. Angezeigt wird genau der gewählte Bereich.
- Der Bereich ist Teil des Links; ein Bereichswechsel erzeugt keinen neuen History-Eintrag, Browser-Zurück schließt den Dialog.
- Unter 768 px füllt der Dialog den Bildschirm und zeigt zuerst die Bereichsliste, dann den Bereich mit `Zurück zu den Bereichen`. Einstellungen stehen als Zeilen ohne Kästen; die Zeilenregeln beschreibt [`src/ui/README.md`](../src/ui/README.md).
- `Daten & Synchronisierung` folgt [Sync-Status und Konflikte](#sync-status-und-konflikte) und [Speicherplatz und Vorladen](#speicherplatz-und-vorladen). `Fokuswerkzeuge` enthält den Start des [Pomodoro-Timers](#pomodoro-timer) und den Einstieg zum [Simulator](#simulator).
- `Über uns` verweist auf die Hilfe, nennt `Impressum` und `Datenschutzerklärung` als in Vorbereitung und zeigt die Paketversion. Keine andere Oberfläche zeigt Version, Umgebung oder Commit.
- Zahlenwerte werden beim Verlassen des Felds auf ihren gültigen Bereich begrenzt.

### Konto und Anmeldung

Verhalten:

- E-Mail und Passwort sind die freigegebene Kernanmeldung.
- Das Profil enthält Anzeigename und Login-E-Mail; Hochschule, Fachgebiet und Spracheinstellung gibt es nicht, die Oberfläche ist deutsch. Die Login-E-Mail erscheint als Accountwert und nicht als wirkungslose Profiländerung.
- Sicherheitskritische Aktionen sind von Profil- und Lernoptionen getrennt.
- Sitzungsstart, abgelaufene Sitzung und Offline-Start folgen [App-Start und neues Gerät](#app-start-und-neues-gerät).

Grenzen:

Ohne Community-Funktion gibt es keinen Privatsphäre-Bereich.

### Speicherleiste

Zweck:

Weicht ein Einstellungsfeld vom gespeicherten Stand ab, bietet genau eine Speicherleiste Speichern und Verwerfen an, im Dialog wie in den Stapeleinstellungen.

Verhalten:

- Verwerfen verwirft den ganzen Entwurf; während des Speicherns sind beide Aktionen gesperrt.
- Reichweiten: allgemeine Einstellungen eine Speicheraktion, Lerneinstellungen `Auf alle Stapel anwenden` und `Auf alle neuen Stapel anwenden`, Stapeleinstellungen Stapel oder Stapelbaum. Erfolg schließt die Leiste und meldet die Reichweite einmal; Fehler lassen sie offen und erscheinen beim betroffenen Bereich.
- In den Stapeleinstellungen speichert die Hauptaktion bei vorhandenen Unterstapeln Stapel und Unterstapel und überträgt dabei rekursiv nur die geänderten Darstellungs-, Lern-, Scheduler- und CoRe-Werte; daneben lässt sich nur dieser Stapel speichern. Beides speichert lokal persistent in einer Änderung, lässt den Dialog offen und bestätigt den Geltungsbereich.
- Ungespeicherte Einstellungen halten App-Navigation, Querverweise, Zurück, Stapelwechsel, Abmelden und Browser-Zurück/-Vorwärts auf, im Dialog auch das Schließen und den Wechsel zwischen `Allgemein` und `Lernen`; Bereiche derselben Gruppe teilen einen Entwurf.
- Lernprofil-Aktionen, `Auf diesen Stapel anwenden`, manueller Sync und die Lerneinstellungen einer Sitzung wirken unmittelbar.

Zustände und Meldungen:

- Scheitert das Speichern, meldet die Leiste den Fehler mit erneutem Versuch, und der Entwurf bleibt erhalten.
- Lehnt die Validierung den Entwurf ab, etwa bei leerem Stapelnamen, erscheint der Hinweis beim Feld und die Leiste bleibt offen.

### Lerntag und Planung

Verhalten:

- `Lerntag & Planung` enthält accountweit den Tagesbeginn (0–23 Uhr), das Vorziehfenster (0–720 Minuten, Standard 20, 0 deaktiviert) und den Wochenrhythmus der Easy Days mit je einer Stufe `Normal`, `Weniger` oder `Minimal` pro Wochentag (sieben gleiche Werte sind neutral).
- Bei Tagesbeginn 3 gehört 02:59:59 noch zum Vortag. Das Vorziehfenster gilt für Queue und laufende Sitzung aller Stapel ([Vorziehen und Lerntag](#vorziehen-und-lerntag)); die Easy-Days-Wirkung regelt [Easy Days](#easy-days).
- Lerntage werden in der Profilzeitzone gerechnet, ersatzweise in der Browserzeitzone; der Bereich zeigt sie an. Eine fehlende Profilzeitzone verhindert das Speichern nicht.
- Diese Werte werden weder in Stapel kopiert noch von Lernprofilen verändert.
- Tagesbeginn, Vorziehfenster, Easy Days, Lernprofile und der globale Stapelstandard sind accountweite Scheduler-Präferenzen im Profil-Sync.

### Tagesrunde und Lernprofile

Verhalten:

- `Neue Karten pro Tag` (0–500), `Wiederholungen pro Tag` (0–2.000) und `Maximales Intervall` (30–36.500 Tage) gelten je Stapel in den Stapeleinstellungen und als Standard für neue Stapel in den Lerneinstellungen. Eine Änderung des Neulimits hebt einen Tages-Override auf. Ohne bewusste Änderung bleibt die geplante Sitzungsgröße stabil.
- Die unveränderlichen Vorlagen `Standard`, `Intensiv` und `Entspannt` setzen neue Karten, tägliche Wiederholungen und maximales Intervall auf `20 / 200 / 1.000`, `30 / 300 / 365` bzw. `10 / 100 / 2.000`, dazu die Position und Sortierung neuer Karten (Alter oder stabiler Lerntagszufall) und die Sortierung fälliger Karten (Überfälligkeit oder Abrufwahrscheinlichkeit).
- Eigene benannte Lernprofile sind kontoweite Vorlagen in Lern- und Stapeleinstellungen. `Auf diesen Stapel anwenden` kopiert Werte und Herkunftsversion in genau einen Stapel; `Als Standardprofil verwenden` übernimmt sie in den globalen Standard.
- Es gibt keine Live-Vererbung: Direkte Änderungen machen Stapel bzw. Standard zu `Eigene Einstellungen`; Umbenennen, Aktualisieren oder bestätigtes Löschen ändert keinen Stapel; eine neuere Version wird an älteren Kopien sichtbar und kann erneut angewandt werden.
- `Tagesrunde & Lernprofile` und `Scheduler & CoRe` definieren den Standard für neue Stapel: Tageslimits, Kartenreihenfolge, Schedulerprofil, Haltbarkeitsschwelle für Varianten und aktive Varianten.
- `Auf alle neuen Stapel anwenden` speichert nur den Standard; `Auf alle Stapel anwenden` kopiert ihn zusätzlich in alle Stapel, wobei Name, Hierarchie, Darstellung, CoRe-Modus, Karten und Verlauf erhalten bleiben. Ein abweichendes Neulimit hebt den Tages-Override auf.
- Manuelle, importierte und Demo-Stapel erhalten den Standard; Reimporte behalten lokale Einstellungen.
- Die Begraben-Optionen gehören ebenfalls zu Lernprofilen und Standard ([Begraben und Zurückstellen](#begraben-und-zurückstellen)).

### Flaggennamen

Verhalten:

Eigene Flaggennamen sind eine accountweite Einstellung im Profil-Sync und werden im Bereich `Flaggen` vergeben, der auch vom Setzen einer Flagge aus erreichbar ist; ein leerer Name steht für den Farbnamen.

### Stapeleinstellungen

Zweck:

Die Stapeleinstellungen sind ein eigener Dialog im Rahmen des [Einstellungsdialogs](#einstellungsdialog) über der Ansicht oder Sitzung, aus der sie geöffnet wurden, mit den Bereichen `Stapel`, `Tagesrunde & Lernprofile` und `Scheduler & CoRe`.

Einstieg:

`Einstellungen` in den [Stapeloptionen](#stapeloptionen-verschieben-und-löschen) in Dashboard, `Lernen` und Kartenverwaltung, das [Sitzungs-Overlay](#sitzungs-overlay), der Hinweis auf ein erreichtes Tageslimit und die Zeile `Stapeleinstellungen` unter `Einstellungen → Tagesrunde & Lernprofile`. Aus dem Karteneditor wird zuerst die Karte verlassen.

Verhalten:

- Der Abschnitt `Stapel` bündelt Name, Icon, Farbe, den `CoRe-Modus`, bei eingeschaltetem CoRe die `Kartenvarianten`, die Lernbremse, `Offline-Nutzung`, das Anlegen von Unterstapeln und das Löschen. Unterstapel entstehen dort mit vorausgewähltem Elternstapel oder über die Ebenenauswahl des Schnellformulars.
- Stapelname, Icon, Farbe, Tagespensum, `Kartenreihenfolge`, `Neue Karten sortieren`, `Fällige Karten sortieren`, die drei Begraben-Optionen, Schedulerwerte (Lernschritte, Wiederlernschritt, gewünschte Erinnerungsrate, maximales Intervall), CoRe-Modus, `Varianten einsetzen ab Haltbarkeit` (7, 21, 60 Tage), `Aktive Varianten pro Karte` (1, 2, 3) und die Lernbremse (Fehlerschwelle, Aktion `Nur kennzeichnen`/`Aussetzen`) bilden einen gemeinsamen Entwurf und werden atomar über die [Speicherleiste](#speicherleiste) übernommen.
- Das Reviewlimit umfasst fällige, tagesübergreifende Lern- und neue Karten; Wiederholungen haben Vorrang.
- CoRe-Modus und Variantenwerte gehören nicht zu Lernprofilen und bleiben bei einem Profilwechsel unverändert.
- Der Kopf zeigt Stapel-Icon und Name; über den Bereichen stehen der Stapelwechsel und `Standardwerte`, das `Einstellungen → Tagesrunde & Lernprofile` öffnet. Der Wechsel zwischen beiden Dialogen ersetzt den offenen; es liegt nie einer über dem anderen.
- Der Link trägt den Dialog als `settingsDeck=` mit dem Bereich in `settings=`, auch auf der Sitzungsroute; eine eigene Seite und einen Rückweg gibt es nicht. Über `Lernen` und der Kartenverwaltung wird der Stapel zum Fokus der Liste darunter und bleibt es nach dem Schließen. Ein Direktaufruf öffnet den Dialog über der aufgerufenen Ansicht, ein unbekannter Stapel zeigt eine durchsuchbare Stapelauswahl.
- Bereiche desselben Stapels teilen einen Entwurf; Stapelwechsel und der Wechsel in den Einstellungsdialog sind bei ungespeicherten Änderungen gesperrt ([Speicherleiste](#speicherleiste)).
- Neue Stapel erhalten die Standardwerte als eigene Werte, importierte behalten ihre Werte.

Grenzen:

Normales und variantenfokussiertes Lernen wird nicht angeboten.

## 14. Hilfe und Simulator

Hilfe und Simulator erklären und erproben die Lernlogik, ohne Lernstände durch bloßes Ansehen oder Umstellen zu verändern.

### Hilfe

Zweck:

Ein Einstieg und zwei geführte Geschichten erklären wechselnde Abrufreize und die FSRS-Kurve, ohne Workspace oder Scheduler zu verändern. Der Nachschlageteil erklärt außerdem, wie eine Prüfungssitzung abläuft.

Einstieg:

`Hilfe` in der App-Navigation; `Über uns` in den Einstellungen verweist ebenfalls dorthin.

Verhalten:

- Der Einstieg fragt nach Grundsätzen nachhaltigen Lernens und verbindet `Active Recall → Smarter Recall` und `Spaced Repetition → Content Repetition`.
- Die beiden Methoden führen direkt zu ihrer Geschichte.

### Hilfe: Active Recall

Verhalten:

Drei Textschritte begleiten eine Kartenvisualisierung: die lesbare Originalkarte mit ihren Schlüsselstellen, dieselbe Form mit unkenntlich gemachtem Fragetext und schließlich zwei Variantenkarten mit derselben Antwort. So wird sichtbar, dass der Inhalt und nicht die Form der Frage gelernt wird.

### Hilfe: Spaced Repetition und FSRS

Verhalten:

- Die Erklärung nennt `R` (Abrufwahrscheinlichkeit), `S` (Stabilität, die Zeit, in der `R` von 100 auf 90 Prozent fällt), `D` (Schwierigkeit), Zielerinnerung, Intervall, Original und Variante und zeigt die Kette Bewertung → Gedächtniszustand → Vergessensprognose → nächster Termin.
- FSRS-7 berücksichtigt alle Reviews einschließlich mehrerer Abrufe am selben Tag. CoRe nutzt die offiziellen Standardparameter; persönliche Optimierung ist noch nicht aktiviert. Höhere Zielerinnerung bedeutet mehr Reviews bei geringerem Vergessensrisiko.
- Stabilität wird als Haltbarkeit erklärt (Tage, bis die Erinnerung auf 90 % fällt). Die Hilfe erklärt die [Freigabe der Varianten](#freigabe-der-varianten) einschließlich der Rückkehr zur Originalkarte nach einem Fehler. Eine feste Reviewnummer wird nicht versprochen.
- Eine als vereinfacht gekennzeichnete Lernkurve führt zu einer gemeinsamen Wiederholung und fächert in die vier Pfade `Nochmal`, `Schwer`, `Gut` und `Leicht` mit ihren Intervallen auf. Am Ende des längsten Intervalls folgt eine Wiederholung mit einer Variante.
- `R` zeigt sich an Kurven und Zielerinnerung, `S` an den Intervallspannen und `D` an den Wiederholungen; die Darstellung bleibt qualitativ ohne scheinbar exakte Werte.
- Die Geschichte führt schrittweise durch Grundidee, erste Wiederholung, die vier Antwortpfade, Variantenwiederholung sowie `D`, `R` und `S`. Wiederholungen und Begriffe der Grafik sind per Zeiger, Touch und Tastatur wählbar und führen zum zugehörigen Schritt.
- Die offizielle FSRS-Einführung ist als externer weiterführender Link gekennzeichnet.

### Simulator

Zweck:

Der Simulator verschiebt die Lernzeit vorhandener Accountkarten minuten- oder tageweise um bis zu 3.650 Tage ab heute. Zeitwechsel verändern keine Karte; Reviews sind echte Bewertungen mit simuliertem Zeitpunkt.

Einstieg:

Direkt über seinen Link und unter `Einstellungen → Fokuswerkzeuge`.

Verhalten:

- Wählbar sind Minuten-, Stunden- und Tagesschritte, ein Datum und die Rückkehr zu heute. Die simulierte lokale Uhrzeit bleibt sichtbar; ungültige Werte werden auf den Bereich begrenzt.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Sitzung verwenden denselben simulierten Zeitpunkt für Fälligkeit, Queue, Heatmaps, Reife, Intervallvorschau und Bewertung.
- Ein aktiver Zukunftszeitpunkt bleibt in der ganzen App sichtbar; während einer Sitzung wird die Zeit nicht umgeschaltet.
- Die Simulationsuhr verändert durch bloßes Umstellen keinen Workspace-, Cloud- oder Kartenstatus; Bewertungen im Zukunftsmodus nutzen absichtlich den simulierten Zeitpunkt und den normalen Speicher- und Syncpfad.
- Die Rückkehr zu heute setzt nur die Uhr zurück; gespeicherte Zukunftsreviews und daraus berechnete Termine bleiben.

Grenzen:

Der Versatz ist lokal und vorübergehend: Reload und Logout kehren zu heute zurück. Sync-, Auth-, Medien-, Autosave- und Bearbeitungsmetadaten nutzen die echte Systemzeit.

## 15. Kartenmodell und Inhaltsformen

Inhalte, Karten und ihre Formen gelten in Erstellung, Editor, Import, Vorschau und Review gleich.

### Inhalte und Karten

Verhalten:

- Der kanonische Vertrag besteht aus `Note` (Felder mit Rollen, Interaktion, Tags, Medienzuordnung Name → SHA-1) und den abgeleiteten `Card`-Abfragen. Strukturierte Felder überstehen den Cloud-Roundtrip.
- Medien sind optionaler Inhalt, kein eigener Kartentyp.

Grenzen:

Quelldokumente, Quellsnapshots und Inhaltsversionen werden nicht gespeichert. Einen CoRe-JSON-Export oder -Import gibt es nicht.

### Inhaltsformen

Verhalten:

- Vorderseite, Rückseite und Zusatzfelder sind Rich Text, der vor Speicherung und Darstellung sanitisiert wird; Pflichtfelder werden direkt am Feld validiert.
- Rückrichtung erzeugt zwei unabhängige Karten mit eigenem Lernstand und eigener Fälligkeit; für Single und Multiple Choice wird sie nicht angeboten.
- Cloze ist eine Editoraktion; jede Lückengruppe wird eine eigenständige Karte.
- Single Choice, Multiple Choice und Kprim sind Antwortformate eines Inhalts mit genau einer Karte, kombinierbar mit Medien und Zusatzfeldern, aber nicht mit Cloze.
- Single Choice verlangt Frage, mindestens zwei eindeutige Optionen, genau eine richtige Option und eine optionale Erklärung. Multiple Choice erlaubt mehrere richtige Optionen und verlangt jederzeit mindestens eine richtige und eine falsche.
- Kprim entsteht aus Anki-Importen und fragt je Aussage `richtig` oder `falsch` ab; das Feedback nennt die Zahl richtig beurteilter Aussagen. Anzeige und Bewertung verwenden dieselbe gespeicherte Antwortmenge.
- Bildverdeckungen folgen [Bildverdeckung](#bildverdeckung).

### Vorschau und Darstellung

Verhalten:

- Die Vorschau beim Erstellen zeigt zunächst die unbeantwortete Vorderseite und auf Wunsch den aufgedeckten Zustand aus Frage und Antwort, ohne Bewertungen.
- Auswahl samt Feedback wird nur transient simuliert: Single Choice deckt nach einer Auswahl auf, Multiple Choice und Kprim nach ausdrücklicher Prüfung; die Rückkehr zur Vorderseite setzt die Auswahl zurück.
- Kartenrenderer erhalten Rich-Text-HTML mit Absätzen, Hervorhebungen, Listen und Medien; wörtliche Markdown-Syntax wird nicht interpretiert. Die Kartenfläche folgt dem aktiven Theme; Anki-CSS wird außerhalb des Originallayouts nicht übernommen.
- Vorschau und Review verwenden dieselbe Komposition, sodass die sichtbare Frage außerhalb der Antwort bleibt.
- Anki-Bedingungen prüfen den nichtleeren Feldinhalt: Reines Bild-, Audio- oder Video-Markup erfüllt eine positive Bedingung und unterdrückt die invertierte; reine Leerzeichen gelten als leer.
- Die Kartenfläche, das Originallayout importierter Karten und ihre Ausnahmen regelt [Kartenflächen](#kartenflächen).

### Tags

Verhalten:

- Tags werden wie in Anki gespeichert: `#`, `,`, `;`, `^`, `&`, `/`, Klammern und `::` bleiben Teil des Tags, `::` bildet die Hierarchie. Leerraum und Steuerzeichen sind unzulässig, ein leerer `::`-Teil wird `blank`, Schreibweisen werden NFC-normalisiert.
- Tags, die sich nur in Groß-/Kleinschreibung unterscheiden, sind ein Tag; die zuerst gespeicherte Schreibweise gewinnt.
- Bei Eingabe und Einfügen trennt Leerraum die Tags.
- Eine Tag-Änderung ist keine Inhaltsänderung: Sie wirkt sofort und hält spätere Import-Updates der Felder nicht auf.
- Ein importierter Inhalt merkt sich die Tags seines letzten Imports; sie stehen zusammengefasst getrennt von den eigenen Tags.
- Ein Reimport führt die Tags auch bei lokal bearbeitetem Inhalt zusammen: Lokal ergänzte bleiben, lokal entfernte bleiben entfernt, im Paket neue kommen dazu, im Paket entfallene gehen.

### Flaggen und Lernbremse

Verhalten:

- Flaggen sind die sieben Anki-Farben je Karte (1 Rot bis 7 Lila); eigene Namen vergibt [Flaggennamen](#flaggennamen).
- Das Anki-Tag `marked` wird zur Markierung des Inhalts, `leech` zur Lernbremse: Karten des Inhalts mit mindestens einem Fehler erhalten sie, hat keine einen, alle. Beide erscheinen danach nicht als Tag.
- Anki-Flaggen werden übernommen, Flaggennamen nicht, weil `.apkg` sie nicht enthält.
- Beim Lernen erhält eine Karte die Lernbremse, wenn ein `Nochmal` in der Wiederholung die Fehlerschwelle des Stapels erreicht (Standard 8) und danach bei jeder halben Schwelle erneut; frühere Fehler lösen nicht rückwirkend aus.
- Der Stapel wählt `Nur kennzeichnen` (Standard) oder `Aussetzen`. Die Lernbremse lässt sich im Editor zurücksetzen; `Lernstand zurücksetzen` hebt sie auf.
- Lokal gesetzte Flaggen, Markierung und Lernbremse bleiben beim Reimport; neue Karten übernehmen die importierte Flagge.

## 16. Lernlogik

Die Lernlogik bestimmt Termine, Tagesmenge und die Freigabe der Varianten.

### Scheduler

Verhalten:

- Review verwendet vier Bewertungen und einen gekapselten FSRS-7-Scheduler mit offiziellen Standardparametern; die Standardzielerinnerung ist 92 %, die Lernschritte sind 1 und 10 Minuten, der Wiederlernschritt 10 Minuten.
- `Gut` geht genau einen Lernschritt weiter und wechselt erst am letzten Schritt in den Reviewzustand. `Leicht` beendet die Lernphase sofort mit dem unveränderten Modellintervall; `Nochmal` und `Schwer` folgen der Standard-Lernschrittstrategie des Schedulers ([`architecture.md`](architecture.md#domäneninvarianten)).
- Konfigurierte Lernschritte haben Vorrang vor einem längeren Modellintervall. Die Wirkung jeder Bewertung je Lage der Karte zeigt [Lernverlauf einer Karte](#lernverlauf-einer-karte).
- Der gestartete Stapel bestimmt für die Runde die Sortierung neuer Karten (Alter oder stabiler Lerntagszufall) und fälliger Karten (Überfälligkeit oder Abrufwahrscheinlichkeit).
- Der Scheduler löst keine KI-Erzeugung im Antwortrequest aus.
- Die Antwortzeit wird von der Darstellung bis zur Bewertung monoton gemessen, bei 60 Sekunden gedeckelt und im Review Event gespeichert; simulierte Zeit verändert sie nicht.

Grenzen:

Nutzer sehen verständliche Intervalle, keine internen Schedulerzustände.

### Vorziehen und Lerntag

Verhalten:

- Eine Sitzung arbeitet zuerst ihre eindeutigen Karten ab und zeigt danach berechtigte Learning-/Relearning-Wiederholungen.
- Das accountweite Vorziehfenster gilt einheitlich für alle Stapel einer Sitzung. Ein Termin darf nur am selben (auch simulierten) Lerntag und strikt weniger als das Fenster vorgezogen werden; Reviewkarten nie. Ein früherer, noch nicht berechtigter Eintrag blockiert keine spätere berechtigte Wiederholung.
- Reviewkarten werden tageweise freigegeben; Learning und Relearning behalten minutengenaue Termine, ihr Vorziehen überschreitet den Lerntag nicht.
- Eine manuell auf einen künftigen Lerntag gesetzte Karte bleibt bis dahin in jeder Phase zurückgestellt.
- Die Tagesprojektion berücksichtigt das Vorziehfenster auch nach Verlassen und erneutem Öffnen der Sitzung; über die Tagesgrenze wird nie vorgezogen.
- Tagesbeginn und Fenster stellt [Lerntag und Planung](#lerntag-und-planung) ein.

### Tagesmenge und Limits

Verhalten:

- Die Tagesmenge vereinigt die nach Stapel- und Tageslimits ausgewählte Queue mit den heute bereits bearbeiteten, weiterhin reviewbaren Karten.
- Der Sitzungsstart bildet daraus einen stabilen Plan; Zähler und Fortschritt nutzen dessen Gesamtzahl unabhängig vom Puffer. Nachladeseiten gehören zur Sitzung; ein Nachladefehler verkleinert den Tagesumfang nicht und täuscht keinen Abschluss vor.
- Eine heute beantwortete Karte zählt als `Gelernt`, sobald heute kein weiterer Schritt ansteht; steht noch ein Schritt am selben Lerntag an, wechselt sie nach `Offen`. Eine Learning-Karte mit nächstem Schritt morgen zählt heute als `Gelernt` und morgen als `Offen`.
- Reviewkarten sind am ganzen Fälligkeitstag verfügbar; Varianten und Wiederholungen zählen dieselbe Karte nicht mehrfach.
- Intraday-Schritte umgehen Tageslimits; tagesübergreifende Lernschritte verbrauchen Reviewbudget.
- In einer Baumrunde brauchen Kartenstapel und alle aktiven Vorfahren Budget; direkte Unterstapelstarts ignorieren äußere Vorfahren. Reviews belegen das gemeinsame Budget vor neuen Karten.

Zustände und Meldungen:

Sind Karten nur durch Limits verborgen, melden Start oder Abschluss, dass das Tageslimit erreicht ist, und weisen die Anzahl fälliger und neuer Karten aus ([Start, Ende und Wiederaufnahme](#start-ende-und-wiederaufnahme)).

### Begraben und Zurückstellen

Verhalten:

- `Geschwisterkarten begraben` bietet wie Anki drei standardmäßig ausgeschaltete Optionen: neue, fällige und tagesübergreifende Lern-Geschwisterkarten. Sie gehören zu Lernprofilen, Stapeleinstellungen und globalem Standard; die drei Vorlagen lassen sie aus.
- Ist eine Option aktiv, wartet eine Karte dieser Art bis zum nächsten Lerntag, sobald heute eine Geschwisterkarte beantwortet wurde oder in der Queue vor ihr steht.
- Die Queue sieht Geschwister in Ankis Reihenfolge (heute beantwortet, Lernschritte des Tages, tagesübergreifende Lern- und fällige, neue Karten); Lernschritte des Tages werden nie begraben. Es entscheiden die Optionen der Stapel der vorher gesehenen Geschwister; eine Antwort außerhalb der gelernten Auswahl gilt mit den Optionen des gelernten Stapels.
- Begrabene Karten verbrauchen keine Limits und behalten Lernstand und Fälligkeit.
- Das Begraben ist kein gespeicherter Zustand, übersteht aber Reload und Neustart innerhalb des Lerntags und endet mit dem Tagesbeginn oder einem simulierten Folgetag.
- Eine Antwort entfernt offene Geschwister aus der Sitzung samt Zähler und Fortschritt. Stapelübersicht, `Heute` und Lernstart zählen Geschwister heute beantworteter Inhalte nicht; zwei noch unbeantwortete Geschwister zählen dort bis zur ersten Antwort beide.
- `Zurückstellen` nimmt eine einzelne Karte bis zum nächsten Lerntag aus Runde und Tageszahlen, wie begrabene Geschwister; Termin und Lernstand bleiben. Wie das Begraben folgt es aus den Ereignissen des Lerntags und wird nicht an der Karte gespeichert.

### Easy Days

Verhalten:

- Easy Days verändert nur neu berechnete Review-Intervalle von 3 bis 90 Tagen: Innerhalb des FSRS-Fuzz-Fensters wählt der Scheduler anhand der accountweiten 90-Tage-Last und der Tagesstufe (`Normal` 1, `Weniger` 0,5, `Minimal` 0,0001); bei Gleichstand gewinnt die geringste Abweichung, dann der frühere Termin.
- Die Last ist die lokal gepflegte Kontoprognose bei Sitzungsbeginn; in der Sitzung neu geplante Karten wechseln darin sofort ihren Tag. Fehlt eine Prognose für den aktuellen Lerntag, zählen nur die Sitzungskarten.
- Nur Fälligkeit und Intervall ändern sich; Vorschau und Speichern verwenden dieselbe Lastmomentaufnahme und DST-sichere Kalenderaddition.
- Die Stufen je Wochentag stellt [Lerntag und Planung](#lerntag-und-planung) ein.

### Reife und Haltbarkeit

Verhalten:

- Haltbarkeit sind die Tage, bis die Erinnerung auf 90 % fällt; sie folgt dem Gedächtniszustand, nicht der Zielerinnerung. Eine höhere Zielerinnerung verkürzt nur die Abstände.
- Eine Karte in der Wiederholung ist ab 21 Tagen Haltbarkeit `Reif`, darunter `Jung`; Lern- und Wiederlernphase zählen als `Lernen`.
- Reife wird nicht gesammelt, sondern bei jeder Antwort aus dem Lernstand abgeleitet; ein Fehler senkt sie sofort.

### Freigabe der Varianten

Zweck:

Bei eingeschaltetem CoRe-Modus wechseln sich Karten, deren Haltbarkeit die Stapelschwelle erreicht, im Review mit ihren KI-Umformulierungen ab.

Verhalten:

- Varianten erscheinen nur, wenn der CoRe-Modus des Kartenstapels `An` ist, die Karte in der Wiederholungsphase (Review) ist, ihre letzte Bewertung nicht `Nochmal` war und ihre Haltbarkeit die Stapelschwelle `Varianten einsetzen ab Haltbarkeit` (7, 21 oder 60 Tage; Standard 21) erreicht. Sonst wird die Karte selbst abgefragt.
- Die Haltbarkeit folgt ausschließlich dem FSRS-7-Lernstand; Antworten auf eine Variante wirken auf den Lernstand der Karte wie Antworten auf die Karte selbst. Nach `Nochmal` bricht die Haltbarkeit ein, die Karte wird erst nach erneutem Erreichen der Schwelle wieder umformuliert.
- Eine reife Karte wechselt reihum zwischen sich selbst und ihren aktiven Varianten; die Originalkarte bleibt Teil des Wechsels. Abgefragt werden höchstens so viele Varianten, wie `Aktive Varianten pro Karte` (1, 2 oder 3) erlaubt, die ältesten zuerst.
- Nach einem Fehler fragt CoRe die Originalkarte ab, bis sie wieder richtig beantwortet ist.
- Beispiele, wann das geschieht, stehen in [Lernverlauf einer Karte](#lernverlauf-einer-karte); die Darstellung im Review regelt [Varianten im Review](#varianten-im-review).

### Lernverlauf einer Karte

Für Bearbeitende: wie eine Karte durch Lernschritte, Wiederholung und Wiederlernen läuft, wann sie reif wird und wann Varianten erscheinen. Die Tabellen und Zeitleisten zu diesem Abschnitt werden mit dem Scheduler aus getesteten Beispielketten erzeugt. Sie gelten unter festen Annahmen (Antwort am Fälligkeitstermin, Standardlernschritte, eine aktive Variante) und sind keine Zusage für einzelne Karten.

- **Neue Karte:** `Nochmal` startet den ersten Lernschritt (1 Minute), `Schwer` bleibt mit kürzerem Abstand als `Gut` in der Lernphase, `Gut` führt zum zweiten Lernschritt (10 Minuten), `Leicht` beendet die Lernphase sofort und plant die erste Wiederholung nach dem Modellintervall.
- **Lernschritt:** `Nochmal` beginnt die Schritte von vorn, `Schwer` bleibt in der Lernphase, `Gut` geht zum nächsten Schritt oder beendet nach dem letzten die Lernphase, `Leicht` beendet sie sofort mit längerem Abstand.
- **Wiederholung:** `Schwer`, `Gut` und `Leicht` planen nach FSRS-7 und der Zielerinnerung des Stapels mit steigendem Abstand. `Nochmal` zählt als Fehler, schickt die Karte ins Wiederlernen (10 Minuten) und lässt die Haltbarkeit einbrechen.
- **Wiederlernen:** `Nochmal` und `Schwer` bleiben im Wiederlernen, `Gut` und `Leicht` führen zurück in die Wiederholung, zunächst mit kurzem Abstand, weil die Haltbarkeit erst wieder wachsen muss.
- **Haltbarkeit und Reife:** siehe [Reife und Haltbarkeit](#reife-und-haltbarkeit).
- **Varianten:** siehe [Freigabe der Varianten](#freigabe-der-varianten).

## 17. Import und Reimport

Wie Anki-Pakete in CoRe-Inhalte übersetzt und bei erneutem Import zugeordnet werden. Bedienung, Bericht und Abschluss regeln [APKG-Import](#apkg-import) und [Import übernehmen und Abschluss](#import-übernehmen-und-abschluss).

### Übersetzung von Anki-Paketen

Verhalten:

- Anki-Pakete werden über registrierte Übersetzer in CoRe-Inhalte mit Feldrollen und Interaktion übersetzt und im CoRe-Design dargestellt.
- Generisch übersetzte Notiztypen mit eigenem CSS und ohne Script erscheinen stattdessen im Originallayout ihres Autors (ADR-047); deren Schriften und Bilder (`_`-Dateien) kommen mit. Unbekannte Notiztypen werden generisch als Feldliste übernommen.
- Template-JavaScript, Add-on-/Custom-Filter und andere nicht portable Funktionen werden nicht ausgeführt; Quellwerte bleiben unsichtbar erhalten und Abweichungen erscheinen als Diagnose.
- Importierte Inhalte zeigen Felder in ursprünglicher Reihenfolge und mit ursprünglichen Namen; Werte sind editierbar, Feldschema und Anki-Vorlage bleiben.
- Tags, `marked`, `leech` und Flaggen folgen [Tags](#tags) und [Flaggen und Lernbremse](#flaggen-und-lernbremse).
- APKG-`revlog` wird als append-only Analysehistorie übernommen, soweit eine Anki-Karte eindeutig einer CoRe-Karte zugeordnet werden kann, und beim Reimport dedupliziert.
- Der initiale Review State folgt der Reihenfolge chronologisches FSRS-7-Replay einer vollständigen Historie ab neuer Karte, gültiger Anki-FSRS-Memory-State (bei abgeschnittener oder fehlender Historie), klassischer Kartenstatus, neue Karte; nach dem ersten CoRe-Review gilt ausschließlich FSRS-7.

Grenzen:

Importfehler führen nicht zum Verlust des letzten verlässlichen Inhalts.

### Reimport

Verhalten:

- Reimport erkennt Inhalte ausschließlich über die Anki-GUID und Karten über die Anki-Karten-ID, auch wenn sie nur in der Cloud vorliegen; dazu lädt CoRe vorher die vorhandenen Inhalte und Karten zu den Anki-GUIDs.
- Unbearbeitete Inhalte übernehmen den Paketinhalt, lokal bearbeitete bleiben unverändert.
- Lernstand, Markierung, Aussetzung und Stapelordnung bleiben; neue Abfragen werden neue Karten, im Paket fehlende Karten bleiben und werden gezählt.
- Reimporte behalten lokale Stapeleinstellungen; Tags und Flaggen führen [Tags](#tags) und [Flaggen und Lernbremse](#flaggen-und-lernbremse) zusammen.

### Automatische Neuübersetzung

Verhalten:

Nach einem Übersetzer-Update übersetzt CoRe unbearbeitete Importe automatisch einmal neu, ohne Karten mit Lernstand zu verlieren.

Zustände und Meldungen:

Die Neuübersetzung meldet die Zahl der Inhalte, deren Darstellung dadurch verbessert wurde.

## 18. KI-Varianten

KI-Varianten formulieren reife Karten um, ohne eigenen Lernstand. Wann sie im Review erscheinen, regelt [Freigabe der Varianten](#freigabe-der-varianten).

### Varianten erzeugen

Verhalten:

- In der Oberfläche heißen generierte Umformulierungen `Variante` bzw. `Kartenvariante`; Aktionen sprechen von `generieren`, nur der Datenschutzhinweis nennt das Modell.
- Eine Karte mit Frage und Antwort kann eine Variante erhalten; bei Lückentexten, Auswahlfragen, Bildverdeckungen und Karten ohne Fragetext ist die Aktion deaktiviert und begründet. Dasselbe gilt bei ausgeschaltetem CoRe-Modus oder erreichter Höchstzahl aktiver Varianten des Stapels.
- Die Variante bleibt der Karte untergeordnet, besitzt keinen eigenen Lernstand und wird nicht als Karte gezählt.
- An den Anbieter gehen ausschließlich der bereinigte Text von Frage und Antwort mit je höchstens 1.200 Zeichen sowie die Fragen bis zu fünf vorhandener Varianten derselben Karte, damit die neue Variante sich davon unterscheidet; Tags, IDs, Quellen, Reviewdaten, Metadaten und Medien nicht. Der Anbieter darf den Text weder speichern noch damit trainieren.
- Die neue Frage soll möglichst nicht mit denselben ersten Wörtern beginnen wie das Original; das ist eine Anweisung an die KI, keine harte Prüfung.
- Eine Karte kann weitere Varianten erhalten, solange die Höchstzahl aktiver Varianten nicht erreicht ist.
- CoRe speichert die Variante nur, wenn die Karte während des Aufrufs unverändert blieb und dieselbe Kombination aus Frage und Antwort noch nicht existiert. Fehler verändern nichts; während des Aufrufs ist die Aktion gesperrt.

Zustände und Meldungen:

Liefert die Generierung dennoch eine vorhandene Formulierung, wird nichts gespeichert und die Meldung bittet um einen neuen Versuch.

### Varianten verwalten

Verhalten:

- Das Kartendetail nennt die Zahl aktiver Varianten im Verhältnis zur Höchstzahl, die Haltbarkeit im Verhältnis zur Schwelle und ob Varianten im Review erscheinen. Bedienung im Editor: [Editor-Reiter Varianten](#editor-reiter-varianten).
- Ändert eine Inhaltsänderung Frage oder Antwort, werden aktive Umformulierungen `veraltet` und nicht mehr abgefragt; die Speichermeldung nennt ihre Zahl. Neu generieren ersetzt die veralteten Varianten durch eine neue.
- Jede Variante hat einen der Zustände `aktiv`, `abgeschaltet`, `gemeldet: inhaltlich falsch`, `gemeldet: unklar formuliert` oder `veraltet`.
- Abgeschaltete und früher gemeldete Varianten lassen sich reaktivieren, solange die Höchstzahl aktiver Varianten nicht erreicht ist; der Meldeverlauf bleibt. Veraltete nicht.
- Löschen entfernt eine Variante nach Rückfrage auf allen Geräten; Grundkarte und Lernstand bleiben.

### CoRe-Modus und Stapelgenerierung

Verhalten:

- Beim Einschalten über die Stapeloptionen erklärt ein Dialog Wirkung, Haltbarkeitsschwelle und Datenschutz; die vorausgewählte Option, sofort Varianten für bis zu 50 Karten zu generieren, startet nach dem Einschalten die Stapelgenerierung. Abbrechen lässt den CoRe-Modus aus. Läuft bereits eine Generierung, ist die Option gesperrt.
- Bei eingeschaltetem CoRe-Modus bieten die Stapeleinstellungen `Varianten generieren` und `Varianten neu generieren`.
- `Varianten neu generieren` ersetzt nach Rückfrage die Varianten von Karten, deren aktive Varianten aus einer älteren Version der Generierung stammen, durch je eine neue und löscht dabei deren bisherige Varianten; Lernstand und Karten bleiben.
- Eine Generierung erzeugt je Karte genau eine Variante und bearbeitet nacheinander die ersten höchstens 50 passenden Karten in Stapelreihenfolge; `Varianten generieren` nimmt Karten ohne aktive Variante; Karten ohne Frage-/Antwort-Abfrage werden übersprungen. Jede Variante wird sofort gespeichert; ein weiterer Start bearbeitet die nächsten Karten.
- Während der Generierung nennt eine app-weite Fortschrittsanzeige Stapel und Fortschritt und erlaubt das Abbrechen; Abbrechen behält Erzeugtes.

Zustände und Meldungen:

Ein vollständiger Erfolg, ein Abbruch oder kein Fund endet mit einer kurzen Meldung; einzelne Fehlschläge oder ein Stopp bei Fehlern, die jede Karte träfen (Anmeldung, Verbindung, Budget, Anfragelimit), bleiben mit Zahl und Grund in der Fortschrittsanzeige, bis sie geschlossen wird.

Grenzen:

App-weit läuft höchstens eine Generierung, solange CoRe geöffnet ist.

### Varianten im Review

Verhalten:

- Jede Variante ist an genau eine Karte gebunden und teilt deren Lernstand und Termin. Bei fehlender oder fehlerhafter Variante bleibt die Karte sicher lernbar.
- Erst nach der Antwort ist eine Variante als `Variante` gekennzeichnet; vorher deutet nichts darauf hin. Die zugrunde liegende `Originalkarte` lässt sich dann aufdecken.
- Von dort öffnet die Variantenverwaltung den Karteneditor dieser Karte im Reiter `Varianten`; Schließen führt zurück in die Sitzung. Bearbeiten, neu Generieren, Abschalten und Löschen liegen dort; eine Meldung aus der Sitzung gibt es nicht.
- Persönliche Reviewdaten gelangen nicht in Variantenobjekte.

## 19. Sync, Offline und Undo

Alle Änderungen werden zuerst lokal gespeichert und danach accountgebunden synchronisiert. Den technischen Ablauf regelt [`architecture.md`](architecture.md#persistenz-sync-und-medien).

### Sync-Status und Konflikte

Verhalten:

- Sync-, Offline- und Konfliktstatus sind ohne Tabellen-, Revisions- oder Geräteterminologie verständlich.
- Ein Sync-Zyklus überträgt zuerst lokal gespeicherte Änderungen, lädt danach neue Cloud-Daten und aktualisiert zuletzt Konflikt- und Statusanzeigen. Ein Konflikt blockiert nur seine Entität.
- Manueller und automatischer Sync nutzen denselben Zyklus. Ein Sync ohne gesendete Änderungen, neue Cloud-Daten oder Konflikte baut die Oberfläche nicht neu auf. Startet die App offline, beginnt das Intervall mit der Rückkehr des Netzes.
- Der automatische Sync läuft nach lokalen Änderungen, bei Netzrückkehr, Fokus und im sichtbaren Tab alle 1, 5, 15 oder 30 Minuten (Standard 5); `Aus` heißt manuell. Er endet bei Logout oder Accountwechsel.
- Bei automatischem Sync meldet die App-Navigation nur Offline, Fehler und Konflikte (mit Anzahl); das führt zu `Daten & Synchronisierung`, bei Konflikten direkt zu ihrer Lösung. Bei `Aus` bietet die App-Navigation dauerhaft eine Aktion, die sofort synchronisiert und ausstehende Änderungen anzeigt.
- `Daten & Synchronisierung` zeigt Intervall, den letzten Erfolg dieser Sitzung auch während ausstehender oder Offline-Änderungen, ausstehende Änderungen und den manuellen Sync.
- Lernstand und Inhalt sind getrennte Konfliktgrenzen: Review und Inhaltskorrektur auf zwei Geräten erzeugen keinen Konflikt, Geräte-, Zeit- und Zählerangaben allein ebenfalls nicht.
- Reviewereignisse sind unveränderlich und idempotent; beide Geräteereignisse bleiben, nur das jüngste projiziert den Lernstand. Bei Neuplanungen auf mehreren Geräten bestimmt die jeweils spätere Aktion den Termin.
- Für Konflikte zeigt CoRe die Folgen beider Richtungen als hinzugefügte, aktualisierte und entfernte Stapel, Karten und Varianten. Die Entscheidung für `Dieser Browser` oder `Cloud im Account` betrifft nur diese Konflikte; die Vorschau wird vor Ausführung gegen den aktuellen Cloudstand geprüft. Konflikte lassen sich auch einzeln lösen.
- Konfliktkarten bleiben bis zur Entscheidung außerhalb der Lernqueue und sind in der Kartenverwaltung als zu klären gekennzeichnet.
- Ausstehende Änderungen überleben Reload und Browserende.

Grenzen:

Ein letzter Website-Sync ist nicht garantiert.

### App-Start und neues Gerät

Verhalten:

- Online startet eine gespeicherte Sitzung sofort, während der Server sie parallel bestätigt.
- Der lokale Workspace erscheint vor Bootstrap, Deltas, Konflikten und Medien. Eingerichtete Geräte starten offline mit der gespeicherten Anmeldung; einen lokalen Login gibt es nicht.
- Ein neuer Browser wartet nur auf die erste gültige Bootstrap-Seite. Weitere Daten und der Katalog laden fortsetzbar im Hintergrund.

Zustände und Meldungen:

- Lehnt der Server die Sitzung ab, erscheint die Anmeldung mit dem Hinweis, dass die Sitzung abgelaufen ist.
- Scheitert die erste Bootstrap-Seite, erscheint ein Wiederholen-Zustand statt eines vermeintlich leeren Accounts.

### Laden großer Bestände

Verhalten:

- Ist der Katalog auf dem Gerät vollständig, sucht, sortiert und blättert die Kartenverwaltung lokal über alle Felder, Antwortoptionen und Tags, online wie offline und ohne Warten auf die Cloud. Solange er unvollständig ist, zeigt sie vorhandene 50er-Previewseiten sofort und ergänzt online serverseitige Suche, Sortierung und Keyset-Pagination; die erste Suchseite aller aufgeklappten Stapel kommt in einer Anfrage, danach blättert jeder Stapel unabhängig weiter; erst Öffnen lädt den Kartenkörper, bei Fehlern bleiben Preview und Wiederholen sichtbar. Offline durchsucht CoRe transparent nur den vorhandenen Katalog; der Hinweis darauf erscheint nur offline oder nach einem Cloudfehler, nie für eine durch neue Eingabe ersetzte Anfrage.
- Offline durchsucht CoRe transparent nur den vorhandenen Katalog.
- App-Start, Kartenliste und Lernstart laden keine vollständigen Stapel.

Zustände und Meldungen:

Bei Fehlern bleiben Vorschau und Wiederholen verfügbar.

### Offline lernen und Downloads

Verhalten:

- Lernen bestimmt die Reihenfolge aus dem Katalog, puffert bis zu 50 Karteninhalte und lädt bei 25 verbleibenden nach; bei Datensparmodus oder langsamer Verbindung beträgt der Puffer fünf.
- Die Runde startet mit der ersten verfügbaren Karte; nach Netzausfall läuft der Puffer weiter und pausiert dann, ohne fällige Karten zu überspringen; bei Netzrückkehr lädt die Sitzung selbst weiter.
- Geöffnete Stapel landen in einem bereinigbaren Cache. `Offline verfügbar machen` lädt Karten, Inhalte, Varianten und Medien fortsetzbar in Paketen und gilt erst nach Anzahl-, Revisions- und Hashprüfung als verfügbar.

Zustände und Meldungen:

- Die Pause meldet, dass das Lernen offline pausiert.
- Scheitert schon der Lernstart offline, nennt CoRe `Offline verfügbar machen` als Weg.
- Ein durch Schließen des Tabs unterbrochener Download erscheint nach dem Neuladen als nicht abgeschlossen und lässt sich fortsetzen oder entfernen.

### Speicherplatz und Vorladen

Verhalten:

- Wird der Browserspeicher knapp, entfernt CoRe nur bestätigte Karteninhalte und Medien, die nicht offline verfügbar gemacht wurden; ausstehende Änderungen, Konflikte, Downloads und aktive Lernkarten bleiben. Die Schwellen regelt [`architecture.md`](architecture.md#persistenz-sync-und-medien).
- Nach lokaler Bereitschaft dürfen Stapelübersicht und Kartenverwaltung vorsichtig vorbereitet werden; Datensparmodus, langsame Verbindung, unsichtbarer Tab oder Interaktion stoppen das. Andere Bereiche lädt CoRe erst bei absehbarer Nutzung vor, APKG, PDF, Statistik, Simulator und große Medien nie pauschal.
- Die Einstellungen zeigen, ob der Speicher dauerhaft ist, sowie belegten und verfügbaren Platz. Die App-Hülle ist offline verfügbar; Medien bleiben selektiv, und ohne dauerhafte Speicherfreigabe kann der Browser Daten entfernen.

Zustände und Meldungen:

Ein unvollständiger Katalog bleibt als lokal eingeschränkter Zustand sichtbar.

### Undo und Änderungsprotokoll

Verhalten:

- Karteninhalte sind direkt prüfbar; einen wiederherstellbaren Versionsverlauf gibt es nicht.
- Manuelle Neuplanung ändert nur die Fälligkeit und die technische Aktualisierungszeit; Phase, Lernschritt, Intervalle, Wiederholungen, Schwierigkeit, Stabilität, letzter Reviewzeitpunkt, FSRS-Werte, Reife sowie Inhaltsrevisionen bleiben. Genau ein manuelles Review Event hält alten und neuen Termin fest und zählt nicht als Lernen, Fortschritt oder FSRS-Bewertung.
- Dasselbe gilt für `Lernstand zurücksetzen`, das Setzen und Zurücksetzen der Lernbremse, `Zurückstellen` und das Rückgängigmachen dieser Aktionen: Jede ist genau ein manuelles Review Event mit ihrer Art und kollidiert nie mit Bewertungen oder Inhaltsänderungen auf anderen Geräten.
- Rückgängig nach einer Sofortaktion ist eine neue, synchronisierte Änderung mit neuer Revision; hat sich die Karte inzwischen geändert, entfällt es mit Meldung.
- Ein Karten-Undo nimmt die Löschung revisionsgeprüft zurück, ohne neue Karte oder zweiten Review State.

## 20. Visueller Produktvertrag

Die Specs legen für die Oberfläche nur Grundsätze fest; Maße, Anordnung und Bedienelemente stehen im Code und im [`src/ui`-Katalog](../src/ui/README.md).

### Designsprache und Theme

- Die Designsprache regelt [ADR-046](decisions.md#adr-046--vollständige-toolbox-designsprache).
- Es gibt einen hellen und einen dunklen Modus. Er wird von Hand gewechselt und browserlokal gemerkt; die Systempräferenz schaltet ihn nicht automatisch.
- Hinweistexte erklären nur Folgen, Abwägungen, Warnungen oder nicht offensichtliches Verhalten; fachliche Warnungen und Folgeaktionen sind nicht versteckt.
- Bestehendes Karten-HTML und gespeicherte Farben werden nicht umgeschrieben.

### Kartenflächen

Alle Inhalte erscheinen im CoRe-Design, in Review, Vorschau, Editor und Importvorschau gleich.

Ausnahme ist das Originallayout importierter Karten (ADR-047): Die Karte zeigt Template und CSS ihres Anki-Autors ohne Script, ohne Schalter und ohne Kontrastanpassung; die Bedienung um die Karte bleibt CoRe. Beim Aufdecken wechselt sie wie in Anki auf ihre Rückseite und springt zur Antwort, statt Frage und Antwort getrennt zu zeigen. Im Dark Mode erhält sie Ankis Nachtmodus. Bleibt die Vorderseite leer, erscheint die Karte im CoRe-Design mit dem Hinweis, dass das Originallayout nicht darstellbar ist.

- Frage und Antwort erscheinen ohne Feldbeschriftung; beim Aufdecken bleibt die Frage stehen, die Antwort folgt, und sie wiederholt die Frage nicht.
- Hinweise sind auf der Frageseite aufdeckbar. `Zusatz` und `Quelle` erscheinen erst nach dem Aufdecken, `Notiz` nur im Editor.
- Lückentext verbirgt die aktive Lücke; Bildverdeckung kennzeichnet die abgefragte Maske und gibt nach dem Aufdecken den verdeckten Bereich frei.
- Eintippen vergleicht zeichengenau wie Anki; Single Choice deckt direkt auf, Multiple Choice und Kprim nach ausdrücklicher Prüfung.
- Formeln werden gesetzt, bei Fehlern bleibt der Quelltext sichtbar. Farbiger Text aus Karten wird nur so weit angepasst, dass er ausreichend Kontrast erreicht.

### App-Shell und Navigation

- Die Hauptnavigation lautet `Heute`, `Lernen`, `Erstellen`, `Karten`, `Prüfung`. `Statistik`, Hilfe, Einstellungen, der Theme-Wechsel und bei Bedarf der Sync-Status ([Sync-Status und Konflikte](#sync-status-und-konflikte)) sind ergänzende Aktionen, keine Reiter.
- `Lernen` öffnet stets die Stapelübersicht, `Karten` die Kartenverwaltung aller Stapel; beide übernehmen den zuletzt gewählten Stapel als Fokus. Der Schriftzug `CoRe` führt zu `Heute`.
- Die Kartenverwaltung gehört zum Bereich `Karten`, Stapelinhalte und Simulator gehören zu `Lernen`; ein geöffneter Einstellungsdialog wechselt den Bereich nicht.
- Ein laufender Pomodoro-Timer und eine aktive Simulation sind in der ganzen App sichtbar.
- Eine Profilvorschau gibt es nicht.

### Rückmeldungen

- Kurze abgeschlossene Erfolgsmeldungen erscheinen vorübergehend und lassen sich schließen.
- Fehler, laufende Vorgänge und Ergebnisse mit Details oder Folgeaktionen bleiben im fachlichen Kontext sichtbar.

## 21. Nichtfunktionale Anforderungen

### Sicherheit und Datenschutz

- Accountdaten und Inhalte sind durch RLS und Ownership geschützt.
- Service-Secrets bleiben außerhalb des Browsers; Logs enthalten keine Secrets.
- Unvalidierte externe Payloads werden nicht direkt persistiert.
- Inhalte verlassen CoRe nur über die KI-Route (bereinigter Text von Frage und Antwort) und die ausdrücklich angeklickte AMBOSS-Suche (markierter Text).
- Datenschutztexte versprechen nur technisch wirksames Verhalten.

### Accessibility

- Kernflows sind vollständig per Tastatur bedienbar; der Tastaturfokus ist sichtbar (WCAG 2.4.7).
- Bedeutung wird nie nur durch Farbe vermittelt, sondern immer zusätzlich durch Text, Icon oder Zahl.
- Dialoge und Overlays besitzen eine nachvollziehbare Fokusreihenfolge, halten den Fokus und geben ihn beim Schließen zurück. Escape und ein Klick neben einen Bestätigungsdialog wirken wie Abbrechen; Abbrechen verändert keine Fachdaten.
- Bei Touch-Bedienung haben Bedienelemente ausreichend große Zielflächen.
- Bei 200 % Zoom bleibt der Kernflow ohne horizontales Hauptscrolling bedienbar.
- Bewegungen beachten die Systemeinstellung für reduzierte Bewegung.

### Viewports und Sprache

- CoRe ist auf Desktop und Smartphone vollständig bedienbar; die abzunehmenden Viewports nennt die [visuelle Pflichtmatrix](test-portfolio.md#visuelle-pflichtmatrix).
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
| Statistik-Tab (gzip) | Ziel ≤ 175 KiB, Grenze 200 KiB; die Diagrammbibliothek macht rund 80 % aus |
| Bootstrapdaten | < 200 KiB komprimiert, ohne Kartenkörper oder Medien |
| Hintergrundarbeit | Portionen von höchstens 50 ms |

## 22. Beta-Abnahme

Der Beta-Kern gilt als erfüllt, wenn:

1. alle neun [Kernjourneys](#5-kernjourneys) automatisiert und manuell bestehen;
2. ein neuer Account, kleiner Import, manuelle Erstellung, Review und Reload ohne Entwicklerwissen bedienbar sind;
3. eine Variante vor dem Reveal nicht erkennbar ist;
4. keine Labs-Navigation, Labs-Route oder ausgemusterte API ausgeliefert wird;
5. keine sichtbare Einstellung eine nicht vorhandene Wirkung verspricht;
6. Zielviewports, Tastatur, Screenreader, Zoom, lange Inhalte und mindestens ein realistischer Fehlerfall abgenommen sind;
7. keine Blocker oder ungeklärten hohen Reibungsverluste aus moderierten Tests verbleiben;
8. automatisierte Tests konkrete Produkt- und Sicherheitsverträge schützen, ohne Testanzahl als Produktabnahme zu behandeln.

Offene Gates und Evidenz stehen ausschließlich in [`todo.md`](todo.md).

## 23. Nichtziele des Beta-Kerns

- Community, Rankings oder soziale Leistungsmetriken.
- Generische Backend-, Auth- oder LLM-Adapter.
- Externer KI-Chat oder breite bzw. multimodale Kartenerstellung jenseits der textbasierten Variantenroute.
- Vollständiges Admin-Portal, Zahlungen oder Abonnements.
- Native Store-Apps oder Push-Benachrichtigungen.
- KI-Bildvariation, breiter OCR-Worker oder vollständige Anki-Template-Ausführung.
