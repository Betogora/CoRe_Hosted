# CoRe TODO — Beta-Basis klassisches Karteikartenprodukt

Stand: 2026-07-16

Dieses Dokument ist die einzige operative Roadmap für offene Arbeit.

## Ziel

CoRe wird zuerst als überzeugendes klassisches Karteikartenprodukt beta-fähig:

> Anki-kompatibles Lernen mit ruhigerer, verständlicherer,
> konsistenterer und zugänglicherer UX.

Aktiver Scope:

- Einstieg und Orientierung
- Stapel und Unterstapel
- Karten erstellen und bearbeiten
- APKG-Import
- klassischer Review-Modus
- Statistik
- globale und stapelspezifische Einstellungen
- Fehlertoleranz
- Accessibility der Kernjourneys
- Vereinfachung der aktiven Codepfade

Nicht im aktiven Scope:

- neue KI-Capabilities
- neue Modellprovider
- KI-Kartenerstellung oder KI-Varianten ausbauen
- Graph-Ausbau
- Community-Ausbau
- neue Plattform- oder Infrastrukturfeatures ohne direkten Beta-Nutzen
- neue Kartentypen
- Mobile-/PWA-Ausbau
- neues Designsystem als eigenständiges Projekt

## Arbeitsregeln

1. Datenintegrität hat Vorrang vor LOC-Reduktion.
2. Keine Compatibility-Oberfläche ohne nachgewiesene Migration entfernen.
3. Keine Datenbankmigration, wenn das Paket mit bestehenden Formen lösbar ist.
4. `coreModel`, Scheduler, APKG, Sync, Medien, Cloudvalidierung und RLS
   bleiben geschützte tiefe Modulgrenzen.
5. Neue Tests schützen konkrete Produkt-, Daten- oder Sicherheitsverträge.
6. Keine zweite Roadmap-Datei anlegen.
7. Abgeschlossene Historie gehört nicht in diese Datei.
8. Sichtbare Core-Texte bleiben deutsch.

## Globales Eingangsgate

Vor Beginn jedes Arbeitspakets:

- [ ] Arbeitsbaum ist sauber.
- [ ] Ausgangs-Commit ist dokumentiert.
- [ ] `npm run test:beta` ist für exakt diesen Commit grün.
- [ ] `npm run typecheck` ist grün.
- [ ] `npm run build` ist grün.
- [ ] Kein Paket beginnt mit einem ungeklärten Fehler im Kartenkern.

Vor Merge jedes Arbeitspakets:

- [ ] fokussierte neue Tests sind grün
- [ ] bestehende Unit-/Contracttests sind grün
- [ ] Production-Build und Chunkbudget sind grün
- [ ] `npm run test:beta` ist grün
- [ ] keine neue KI-, Provider- oder Adapterarchitektur
- [ ] keine nicht autorisierte Datenbankmigration
- [ ] deutsche UI und Core/Labs-Trennung sind erhalten

# P0 — Vor begleiteter Beta

## P0.2 Batch-Erstellung und Fehlertoleranz

Abhängigkeit: Globales Eingangsgate

Ziel:
Mehrere Karten lassen sich in einem zusammenhängenden Arbeitsfluss erstellen.
Drafts, Löschungen und Importterminalzustände sind fehlertolerant.

### Batch-Erstellung

- [ ] Nach `Speichern` im manuellen Editor bleiben.
- [ ] Kompakte Bestätigung `Karte gespeichert` anzeigen.
- [ ] Anzahl der in dieser Session erstellten Karten anzeigen.
- [ ] Nicht angeheftete Felder leeren.
- [ ] Angeheftete Felder unverändert behalten.
- [ ] Zieldeck standardmäßig behalten.
- [ ] Fokus in das erste erforderliche, nicht angeheftete Feld setzen.
- [ ] `Fertig` als explizite Abschlussaktion ergänzen.
- [ ] Abschluss zeigt Anzahl, Zieldeck, `Jetzt lernen` und `Karten prüfen`.
- [ ] Pin-Beschriftungen beschreiben die tatsächliche Wirkung.

### Draft-Sicherheit

- [ ] Dirty-State aus fachlich relevanten Feldern ableiten.
- [ ] Interne Navigation mit eigenem Dialog absichern.
- [ ] Reload/Tab-Schließen über `beforeunload` absichern.
- [ ] Abbrechen darf gespeicherte Karten nicht zurückrollen.
- [ ] Kein Cloud-Draft-Autosave in diesem Paket.

### Löschen

- [ ] Kartenlöschung mit eigenem Bestätigungsdialog.
- [ ] Nach Kartenlöschung unmittelbares Undo anbieten.
- [ ] Undo darf keinen zweiten Datensatz erzeugen.
- [ ] Stapellöschung zeigt:
  - [ ] Deckname
  - [ ] Zahl der Unterstapel
  - [ ] Zahl der aktiven Karten
- [ ] `window.confirm` aus den Core-Löschflüssen entfernen.
- [ ] Soft Delete, Tombstones und Sync-Verträge erhalten.
- [ ] Kein vollständiger Papierkorb in diesem Paket.

### Importzustände

- [ ] Importmodus als diskriminierte State-Union modellieren.
- [ ] Wechsel des Importformats verwirft alte Vorschau und Commitfähigkeit.
- [ ] Terminalzustände trennen:
  - [ ] cancelled
  - [ ] failed_retryable
  - [ ] failed_terminal
  - [ ] partial
  - [ ] succeeded
- [ ] Jeder Terminalzustand zeigt eine eindeutige nächste Aktion.
- [ ] Warnungen zunächst zusammenfassen und vollständig aufklappbar machen.
- [ ] Technische IDs und Hashes unter `Technische Details` belassen.
- [ ] APKG-Parser, Reimport und Medienlogik nicht umbauen.

### Akzeptanzgates

- [ ] Fünf Karten ohne Verlassen des Editors erstellen.
- [ ] Pins, Reset und Fokus funktionieren für Front und Back.
- [ ] Gleichnamige Unterstapel sind über vollständige Pfade unterscheidbar.
- [ ] Navigation mit Draft warnt; `Bleiben` erhält Inhalte.
- [ ] Kartenlöschung abbrechen, bestätigen und rückgängig machen.
- [ ] Decklöschung erklärt die Auswirkung.
- [ ] Text → CSV → APKG zeigt nie eine alte Vorschau.
- [ ] Partial- und Failure-Zustände besitzen sichere Folgeaktionen.
- [ ] Keine Datenbankmigration.

### Tests

- [ ] Unit-/Componenttests für Batchreset und Pins.
- [ ] Browsertest für fünf Karten.
- [ ] Browsertest für Dirty-Navigation.
- [ ] Browsertest für Card Delete und Undo.
- [ ] Browsertest für Deck-Delete-Dialog.
- [ ] Import-State-Transition-Tests.
- [ ] Accessibility für Dialoge, Toast und Fokus.

## P0.3 Stapel-IA und URL-Kontext

Abhängigkeit: P0.2

Ziel:
`LearnScreen` und `DecksScreen` bleiben getrennte Aufgabenoberflächen,
teilen aber einen kanonischen Deck- und Kartenkontext.

### Screenrollen

- [ ] `LearnScreen` beantwortet ausschließlich `Was lerne ich jetzt?`.
- [ ] `DecksScreen` beantwortet `Was besitze und verwalte ich?`.
- [ ] Kartenverwaltung als sekundäre Aktion aus Lernen erreichbar machen.
- [ ] Keine doppelte Tagesqueue in der Bibliothek anzeigen.
- [ ] Inventarzahlen ausdrücklich als `im Stapel` kennzeichnen.
- [ ] Graph, Community und Assistant nicht in Core-Navigation aufnehmen.

### URL-Vertrag

- [ ] Deck-ID in Learn- und Bibliotheks-URLs serialisieren.
- [ ] Karten-ID in Bibliotheks-URL serialisieren.
- [ ] Erstellmodus und Zieldeck serialisieren.
- [ ] Reviewdeck und optionale Variante serialisieren.
- [ ] Review-Rückweg als allowlist-basierten Kontext serialisieren:
  - [ ] returnView
  - [ ] returnDeck
  - [ ] returnCard
- [ ] Keine freie Return-URL akzeptieren.
- [ ] Parser und Serializer als Roundtripvertrag testen.
- [ ] Lokale parallele Deck-/Kartenselektion entfernen.

### History-Verhalten

- [ ] Reload erhält Deck und ausgewählte Karte.
- [ ] Reload während Review erhält Rückweg.
- [ ] Browser-Zurück stellt den vorherigen semantischen Kontext wieder her.
- [ ] Browser-Vorwärts stellt ihn erneut her.
- [ ] Ungültige Deck-/Karten-ID zeigt einen deutschen Fallback.
- [ ] Gelöschte Entitäten führen nicht zu leerem oder falschem Editor.

### Akzeptanzgates

- [ ] Bibliothek → Karte → Review → Reload → Beenden kehrt zur Karte zurück.
- [ ] Lernen → Unterstapel → Reload bleibt im Unterstapelkontext.
- [ ] Direktlink zu einer Karte öffnet genau diese Karte.
- [ ] Back/Forward erzeugt keine zusätzliche History-Schleife.
- [ ] Keine neue Routerbibliothek.
- [ ] Keine Datenbankmigration.

### Tests

- [ ] AppRoute Parse-/Serialize-Contracttests.
- [ ] Not-found- und invalid-ID-Tests.
- [ ] Browser-Back-/Forward-Test.
- [ ] Reload aus Learn, Bibliothek und Review.
- [ ] Accessibility der Fallbackzustände.

## P0.4 Reviewqueue, Zahlenwahrheit und Again-Semantik

Abhängigkeit: P0.3

Ziel:
Dashboard, Lernen, Review und Summary verwenden dieselbe heutige Queue.
`Nochmal` führt innerhalb derselben Session zu einer Wiederholung.

### Begriffe

- [ ] `Neu` = noch nie bewertete, nach Neu-Limit ausgewählte Karten.
- [ ] `Fällig` = bereits bewertete, heute fällige, nach Review-Limit ausgewählte Karten.
- [ ] `Heute` = Neu + Fällig.
- [ ] Neu und Fällig sind disjunkt.
- [ ] Bibliotheksinventar separat benennen.

### Sessionmodell

- [ ] Initiale Queue mit stabilem Ziel eindeutiger Karten erstellen.
- [ ] Bewertete eindeutige Karten separat verfolgen.
- [ ] `Again` in eine Repeat Queue aufnehmen.
- [ ] Repeat-Due-Zeit berücksichtigen.
- [ ] Wiederholung nach anderen Karten oder nach Wartezeit zeigen.
- [ ] Session nicht endgültig abschließen, solange Repeat pending ist.
- [ ] Bewusste Aktion `Session trotzdem beenden` anbieten.
- [ ] Wiederholungen separat von eindeutigen Karten zählen.
- [ ] Limitänderung erweitert eine Session nur nach expliziter Nutzeraktion.

### Summary und Empty States

- [ ] Eindeutige Karten anzeigen.
- [ ] Wiederholungen anzeigen.
- [ ] Ratingverteilung anzeigen.
- [ ] Verbleibende heutige Karten anzeigen.
- [ ] Leere Queue bietet:
  - [ ] Zurück zu Lernen
  - [ ] Neue Karten erstellen
  - [ ] Karten prüfen

### Akzeptanzgates

- [ ] Letzte Karte mit `Again` beendet die Session nicht sofort.
- [ ] Dashboard, Lernen und Review zeigen dieselben Heute-Zahlen.
- [ ] Neu/Fällig überschneiden sich nicht.
- [ ] Intervallvorschau entspricht weiterhin dem angewandten Schedulerzustand.
- [ ] Reviewevent wird genau einmal gespeichert.
- [ ] Keine Änderung der Schedulerparameter.

### Tests

- [ ] Queue-Projektion mit gemischten neuen und fälligen Karten.
- [ ] Unterdeck- und Rootlimits.
- [ ] Again als erste, mittlere und letzte Karte.
- [ ] Reload mit bestätigten Reviews.
- [ ] Offline-/Reconnect-Reviewevent.
- [ ] Browser-Summary und Empty State.
- [ ] Tastaturjourney vollständig.

# P1 — Vor unbegleiteter Self-Service-Beta

## P1.1 Globales und stapelspezifisches Settingsmodell

Abhängigkeit: P0.4

Ziel:
Globale Werte sind Defaults für neue und importierte Decks.
Bestehende Decks ändern sich nur über eine explizite Bulk-Aktion.

- [ ] Globales Speichern darf bestehende Decks nicht ändern.
- [ ] Defaults weiterhin im Profil persistieren.
- [ ] Neue manuelle Decks erhalten aktuelle Defaults.
- [ ] Neue importierte Decks erhalten aktuelle Defaults.
- [ ] Separate Aktion `Auf alle Stapel anwenden`.
- [ ] Bulk-Dialog zeigt:
  - [ ] Anzahl betroffener Decks
  - [ ] überschreibbare Werte
  - [ ] Hinweis auf individuelle Deckeinstellungen
- [ ] Bulk-Abbruch verändert nichts.
- [ ] Jedes Deck behält vollständige explizite Einstellungen.
- [ ] Keine Live-Vererbung oder Override-Graph einführen.
- [ ] Standardbereich:
  - [ ] Preset
  - [ ] neue Karten pro Tag
  - [ ] Reviews pro Tag
  - [ ] Reihenfolge
- [ ] Erweitert:
  - [ ] Lernschritte
  - [ ] Wiederlernschritte
  - [ ] Anfangsintervalle
  - [ ] Maximalintervall
  - [ ] Retention
  - [ ] CoRe-Parameter
- [ ] Sprache als `Deutsch (Beta)` read-only darstellen
      oder aus normalem UI entfernen.
- [ ] Gespeichertes Sprachfeld kompatibel erhalten.

Akzeptanz:

- [ ] Individueller Deckwert überlebt globales Save und Reload.
- [ ] Neues Deck erhält neuen Default.
- [ ] Bulk ändert alle Decks genau einmal nach Bestätigung.
- [ ] Sync-Konflikte bleiben fachlich auflösbar.
- [ ] Keine Datenbankmigration.

Tests:

- [ ] Profile-/Deck-Roundtrip.
- [ ] Neuer Deck- und Import-Default.
- [ ] Bulk-Abbruch und Bulk-Erfolg.
- [ ] Konflikt- und Reloadtest.
- [ ] Screenreaderlabels für Standard und Erweitert.

## P1.2 Kartenbrowser-Skalierung und globale Suche

Abhängigkeit: P0.3

Ziel:
Jede Karte einer großen oder verschachtelten Sammlung ist auffindbar
und direktlinkfähig.

- [ ] Hartes 80-Karten-Limit entfernen.
- [ ] Deterministische Pagination oder `Weitere laden` einführen.
- [ ] Standardbatch: 100 Karten.
- [ ] Gesamttrefferzahl anzeigen.
- [ ] Suche über:
  - [ ] Vorderseite
  - [ ] Rückseite
  - [ ] Tags
  - [ ] Deckname
  - [ ] vollständigen Deckpfad
- [ ] Suche deckübergreifend ermöglichen.
- [ ] Optional auf ausgewählten Deckunterbaum begrenzen.
- [ ] Filter für Kartentyp ergänzen.
- [ ] Statusfilter nur ergänzen, wenn aktive und gelöschte Daten
      sicher getrennt bleiben.
- [ ] Auswahl in URL schreiben.
- [ ] Ergebnisreihenfolge deterministisch halten.
- [ ] Keine serverseitige Suchplattform in diesem Paket.
- [ ] Keine Datenbankmigration.
- [ ] Virtualisierung erst nach Messung.

Akzeptanz:

- [ ] Fixture mit 1.000 Karten laden.
- [ ] Karte 999 über eindeutigen Inhalt finden.
- [ ] Karte öffnen, bearbeiten, reloaden und erneut öffnen.
- [ ] Gleichnamige Unterstapel sind eindeutig.
- [ ] Keine Karte wird still abgeschnitten.
- [ ] Bedienung bei 1280 × 720 bleibt ohne horizontalen Hauptscroll.

Tests:

- [ ] Suchprojektion.
- [ ] Pagination und Filter.
- [ ] URL-Selektion.
- [ ] 1.000-Karten-Browserjourney.
- [ ] Fokus und Tastatur durch Resultate.

## P1.3 Statistik und handlungsorientierte Rückschau

Abhängigkeit: P0.4

Ziel:
Statistik zeigt wenige, konsistente und nutzbare Kennzahlen.

- [ ] Standardzeitraum 30 Tage.
- [ ] Zeiträume 7, 30, 90 Tage und Gesamt.
- [ ] Periodenfilter auf alle Periodenmetriken anwenden.
- [ ] Aktuelle Queue separat von Rückschau anzeigen.
- [ ] Beta-Kennzahlen:
  - [ ] Reviews
  - [ ] aktive Tage
  - [ ] Erfolgsquote
  - [ ] Ratingverteilung
  - [ ] Again-Rate
  - [ ] täglicher Trend
  - [ ] schwache Decks
  - [ ] schwache Karten, sofern stabil ableitbar
- [ ] Antwortzeit entfernen, solange sie nicht zuverlässig erhoben wird.
- [ ] Variantenmetriken aus Beta-Core entfernen.
- [ ] Grammatik für Singular und Plural korrigieren.
- [ ] Schwaches Deck direkt zu Lernen öffnen.
- [ ] Schwache Karte direkt im Kartenbrowser öffnen.
- [ ] Empty State für zu wenige Daten.

Akzeptanz:

- [ ] Zeitraumwechsel aktualisiert alle betroffenen Kennzahlen.
- [ ] Keine dauerhaft leere Kennzahl.
- [ ] CTA öffnet den korrekten URL-Kontext.
- [ ] Append-only Reviewevents bleiben einzige Ereignisquelle.
- [ ] Keine neue Tracking- oder KI-Infrastruktur.

Tests:

- [ ] Zeitfenstergrenzen.
- [ ] Singular/Plural.
- [ ] Rating- und Again-Auswertung.
- [ ] direkte Navigation.
- [ ] Empty State.

# P2 — Bereinigung nach stabiler Beta-Basis

## P2.1 Historische APIs, Testportfolio und UI-Konsolidierung

Abhängigkeit: P0 und P1 abgeschlossen

Ziel:
Die öffentliche Oberfläche enthält aktive Produktseams und dokumentierte
Compatibility-Verträge, aber keine rein testgetriebenen historischen Fassaden.

### Consumergraph

- [ ] Repositoryweiten Consumergraph erneut erstellen.
- [ ] Externe Nutzung wegen privatem Paket und dokumentierten Integrationen prüfen.
- [ ] Jeden Export klassifizieren:
  - [ ] aktiver Produktionsvertrag
  - [ ] Compatibility-Vertrag
  - [ ] test-only
  - [ ] intern
  - [ ] entfernbar nach Migration

### Review und Scheduler

- [ ] Tests von test-only Sessionfassaden auf aktive Reviewseams migrieren.
- [ ] Danach ungenutzte Reviewexports internalisieren oder entfernen.
- [ ] Scheduler-Simulation, Commit und Summary geschützt lassen.
- [ ] Keine Schedulerformel in diesem Paket ändern.

### Import und Auth

- [ ] Workspace-Importfassaden gegen aktiven Creation-Workflow prüfen.
- [ ] `mapAnkiToCoreDeck`, `commitImport` und lokale Authfassaden
      nur nach nachgewiesener Consumerfreiheit entfernen.
- [ ] Portabilitäts- und Legacy-Fixtures vor Entfernung grün halten.

### Root-State und Compatibility

- [ ] `WorkspaceState` als kanonischen aktiven Rootstate dokumentieren.
- [ ] `AppState`, `reps/repetitions`,
      `reviewState/learningItemState/coreState`
      nicht ohne Migrationsplan entfernen.
- [ ] Persistierte Cache-, Cloud- und Exportformen roundtriptesten.

### Testportfolio

- [ ] Breite Umbrella-Suites nach Produktjourney aufteilen.
- [ ] Tote APIs nicht allein für alte Tests erhalten.
- [ ] APKG-, Scheduler-, Sync-, RLS- und Originalvarianten-Tests behalten.
- [ ] Jeder Test nennt den geschützten Vertrag.
- [ ] Redundante Tests nur nach Coverage- und Mutation-Nachweis entfernen.

### UI-Konsolidierung

- [ ] Gemeinsame Primitives für:
  - [ ] Dialog
  - [ ] Toast/Undo
  - [ ] Empty State
  - [ ] Field Error
  - [ ] Pagination
  - [ ] Loading/Status
- [ ] Tailwind-Fragmente nur in berührten Screens konsolidieren.
- [ ] Kein neues Designsystemprojekt.
- [ ] Keine visuelle Komplettüberarbeitung.

Akzeptanz:

- [ ] Kein test-only Export ohne dokumentierten Grund.
- [ ] Aktive Produktseams bleiben klein und typisiert.
- [ ] Compatibility-Migrationen sind explizit dokumentiert.
- [ ] `npm run test:beta` bleibt grün.
- [ ] Erweiterte Tests bleiben mindestens informativ grün oder
      dokumentieren einen echten Betriebsblocker.

# Querschnitt: Accessibility-Abnahme

Accessibility ist Bestandteil jedes Pakets und kein nachträglicher Polish-Sprint.

Vor begleiteter Beta:

- [ ] Editor vollständig mit Tastatur bedienbar.
- [ ] Dialogfokus wird gesetzt und zurückgegeben.
- [ ] Save-, Error-, Pending- und Undo-Status werden angesagt.
- [ ] Review vollständig mit Tastatur bedienbar.
- [ ] Keine Aktion ausschließlich über Farbe vermittelt.
- [ ] Touchziele bleiben ausreichend groß.
- [ ] 1440 × 900 und 1280 × 720 ohne horizontalen Hauptscroll.

Vor Self-Service-Beta zusätzlich:

- [ ] Kartenbrowser und Pagination per Tastatur.
- [ ] Importzustände als Live-Status.
- [ ] Not-found- und Empty States verständlich.
- [ ] Axe-Prüfung ohne kritische oder ernste Findings.
- [ ] manuelle Screenreader-Stichprobe der zehn Kernjourneys.

# Beta-Gates

## Begleitete Beta

- [ ] P0.2 bis P0.4 abgeschlossen.
- [ ] `npm run test:beta` auf Freigabe-SHA grün.
- [ ] Keine semantische Kartenbeschädigung.
- [ ] Fünf-Karten-Batchjourney grün.
- [ ] sichere Karten- und Decklöschung.
- [ ] Review-Again-Vertrag grün.
- [ ] APKG-Import mit Success, Cancel und Failure grün.
- [ ] keine kritischen Accessibility-Blocker.

## Unbegleitete Self-Service-Beta

- [ ] Alle P0- und P1-Pakete abgeschlossen.
- [ ] Karteninhalt deckübergreifend durchsuchbar.
- [ ] 1.000-Karten-Fixture vollständig verwaltbar.
- [ ] URL-, Reload-, Back- und Forward-Verträge grün.
- [ ] globale Settings überschreiben keine Decks implizit.
- [ ] Statistik verwendet konsistente Zeiträume.
- [ ] Empty-, Error- und Partial-States besitzen sichere Folgeaktionen.
- [ ] vollständige Kernjourney-Abnahme auf Freigabe-SHA.

# Geparkter Scope bis Beta-Basis

- [ ] keine neue KI-Capability
- [ ] kein neuer Provider
- [ ] kein KI-Varianten-Ausbau
- [ ] kein Graph-Ausbau
- [ ] kein Community-Ausbau
- [ ] keine neue generische Adapterarchitektur
- [ ] keine neue Scheduleroption
- [ ] kein neuer Kartentyp
- [ ] kein OCR-/DOCX-/Image-Occlusion-Ausbau
- [ ] kein Mobile-/PWA-Ausbau
- [ ] kein eigenständiges Designsystemprojekt
- [ ] keine neue Roadmap-Datei
