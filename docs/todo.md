# CoRe TODO — Beta-Basis klassisches Karteikartenprodukt

Stand: 2026-08-11

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

- Wiedereinführung der entfernten breiten KI-, Graph-, Community- oder Labs-Flächen; die freigegebene Basic-Variantenroute ist davon ausgenommen
- serverseitiger APKG-Import oder Dateien über 250 MiB
- neue Plattform- oder Infrastrukturfeatures ohne direkten Beta-Nutzen
- Mobile-/PWA-Ausbau
- neues Designsystem als eigenständiges Projekt

## Arbeitsregeln

1. Datenintegrität hat Vorrang vor LOC-Reduktion.
2. Keine Compatibility-Oberfläche ohne nachgewiesene Migration entfernen.
3. Keine Datenbankmigration, wenn das Paket mit bestehenden Formen lösbar ist; der beschlossene irreversible Labs-Rückbau ist die dokumentierte Ausnahme.
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
- [ ] keine Wiedereinführung ausgemusterter Labs-, breiter KI- oder Groß-APKG-Pfade jenseits der freigegebenen Basic-Variantenroute
- [ ] keine nicht autorisierte Datenbankmigration
- [ ] deutsche UI und statische Core-Navigation sind erhalten

# P0 — Vor begleiteter Beta

## P0.4 Reviewqueue, Zahlenwahrheit und Again-Semantik

Abhängigkeit: Globales Eingangsgate

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

- [ ] Repeat-Due-Zeit berücksichtigen.
- [ ] Limitänderung erweitert eine Session nur nach expliziter Nutzeraktion.

### Summary und Empty States

- [ ] Eindeutige Karten anzeigen.
- [ ] Ratingverteilung anzeigen.
- [ ] Verbleibende heutige Karten anzeigen.
- [ ] Leere Queue bietet:
  - [ ] Zurück zu Lernen
  - [ ] Neue Karten erstellen
  - [ ] Karten prüfen

### Akzeptanzgates

- [ ] Dashboard, Lernen und Review zeigen dieselben Heute-Zahlen.
- [ ] Neu/Fällig überschneiden sich nicht.
- [ ] Intervallvorschau entspricht weiterhin dem angewandten Schedulerzustand.
- [ ] Reviewevent wird genau einmal gespeichert.

### Tests

- [ ] Queue-Projektion mit gemischten neuen und fälligen Karten.
- [ ] Again als erste, mittlere und letzte Karte.
- [ ] Reload mit bestätigten Reviews.
- [ ] Offline-/Reconnect-Reviewevent.
- [ ] Browser-Summary und Empty State.
- [ ] Tastaturjourney vollständig.

# P1 — Vor unbegleiteter Self-Service-Beta

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

- [ ] P0.4 abgeschlossen.
- [ ] `npm run test:beta` auf Freigabe-SHA grün.
- [ ] DB-Restore-Probe in einem ausschließlich dafür vorgesehenen Testprojekt bestanden und in `history.md` dokumentiert.
- [ ] Storage-Restore-Probe getrennt von der Datenbank bestanden und in `history.md` dokumentiert.
- [ ] Realen Alarmempfang für mindestens ein Kernsignal ohne Nutzerinhalte nachgewiesen.
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
- [ ] globale Settings überschreiben keine Decks implizit.
- [ ] Empty-, Error- und Partial-States besitzen sichere Folgeaktionen.
- [ ] vollständige Kernjourney-Abnahme auf Freigabe-SHA.

# Geparkter Scope bis Beta-Basis

- [ ] keine Wiedereinführung ausgemusterter Labs-, breiter KI-, Graph- oder Community-Flächen jenseits der freigegebenen Basic-Variantenroute
- [ ] kein serverseitiger APKG-Pfad und keine Anhebung über 250 MiB
- [ ] keine neue generische Adapterarchitektur
- [ ] keine weiteren Scheduleroptionen
- [ ] kein OCR-/DOCX-/Image-Occlusion-Ausbau
- [ ] kein Mobile-/PWA-Ausbau
- [ ] kein eigenständiges Designsystemprojekt
- [ ] keine neue Roadmap-Datei
