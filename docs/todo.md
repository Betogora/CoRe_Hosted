# CoRe TODO

Stand: 2026-08-16

Dieses Dokument enthält ausschließlich offene, autorisierte Arbeit. `NOW`
blockiert die begleitete Beta. `LATER` folgt danach auf dem Weg zur
unbegleiteten Self-Service-Beta. Abgeschlossene Arbeit und Nachweise stehen in
[`history.md`](history.md).

## NOW — Begleitete Beta freigeben

### Reviewabschluss

- [ ] Am Sitzungsende die Ratingverteilung und die verbleibenden heutigen
      Karten anzeigen.
- [ ] Bei leerer Queue sichere Wege zu `Lernen`, Kartenerstellung und
      Kartenverwaltung anbieten.
- [ ] Sicherstellen, dass eine Offlinebewertung nach dem Reconnect genau ein
      Reviewevent erzeugt.
- [ ] Die vollständige Reviewjourney mit Reveal, Bewertung, Wiederholung und
      Abschluss per Tastatur bedienbar machen.

Abnahme:

- [ ] Browsertests decken Summary, Empty State und Offline/Reconnect ab.
- [ ] Intervallvorschau und gespeicherter Schedulerzustand bleiben identisch.
- [ ] `npm run test:beta`, `npm run typecheck` und `npm run build` sind auf dem
      Freigabe-Commit grün.

### Barrierefreiheit und Betrieb

- [ ] In den Kernjourneys alle kritischen und ernsten Axe-Findings beheben.
- [ ] Review, Import, Kartenverwaltung und Fehlerzustände manuell mit einem
      Screenreader prüfen.
- [ ] Datenbank- und Storage-Restore getrennt in einem vorgesehenen Testprojekt
      prüfen und in `history.md` dokumentieren.
- [ ] Für mindestens ein Kernsignal realen Alarmempfang ohne Nutzerinhalte
      nachweisen.

### Performance-Freigabeblocker

Die Mess-, Boot- und Profilkorrekturen aus `codex/performance-hardening` sind
eine eigenständig mergefähige Grundlage. Der belegte 231-ms-Hintergrundtask
blockiert weiterhin die begleitete Beta, aber nicht den Merge dieser Grundlage.
Der folgende Projektionsumbau erfolgt deshalb getrennt auf
`codex/deck-study-projection`.

- [ ] Automatisches Idle-Preloading nur bei `4g` oder fehlender
      Network-Information zulassen. Auf `3g` ausschließlich nach Hover, Fokus
      oder Touchstart vorladen; bei `2g`, `slow-2g`, Save-Data oder
      unsichtbarem Tab gar nicht spekulieren.
- [ ] Die kontrollierte Startmessung um einen 4G-Kontext ergänzen und dort
      Lernen und Karten seriell vorladen. Bleibt der Karten-Preload über 50 ms,
      Editor, Detaildialoge, Vorschau und Rich-Text-Logik erst beim Öffnen einer
      Karte laden.
- [ ] `DeckStudySummary` als löschbare lokale O(Stapel)-Projektion in IndexedDB
      umsetzen. Einzelwrites pflegen sie atomar; Bulk- und Cloud-Writes
      markieren betroffene Stapel dirty und bauen sie fortsetzbar in
      250er-Chunks mit spätestens 25 ms Main-Thread-Zeit neu auf.
- [ ] Das IndexedDB-Upgrade legt nur Projektion, Fälligkeits-Buckets,
      Kartenindex und Rebuild-Checkpoint an. Die Erstbefüllung startet nach dem
      nutzbaren Workspace, ein Dirty-Token schützt parallele Änderungen und
      Kontextwechsel bei Zeitzone oder Tagesbeginn lösen einen neuen Rebuild
      aus.

Abnahme:

- [ ] `npm run performance:measure:local` besteht mit je zehn Läufen für den
      wiederkehrenden, frischen, Service-Worker-freien und Offline-Kontext.
- [ ] Ein zusätzlicher kontrollierter 4G-Lauf belegt serielle automatische
      Lernen-/Karten-Preloads; ein 3G-Lauf belegt, dass kein automatischer
      Preload startet.
- [ ] Der persistierte Summary-Read hat p75 höchstens 50 ms. Jeder Summary-,
      Rebuild- und automatische Preload-Task bleibt im festen 50-ms-Budget.
- [ ] Unterbrochener Rebuild, Reload, Review, Kartenänderung, Cloud-Delta und
      -Reset, Konflikte, Tagesgrenze sowie Zeitzonenwechsel sind durch
      Repositorytests abgedeckt. Ein 100k-Repositoryvertrag kommt ohne
      vollständigen Kartenread aus.
- [ ] Der Service Worker bleibt unverändert, solange der kontrollierte Vergleich
      keinen p75-Nachteil von mindestens 100 ms zeigt.

## LATER — Self-Service und Skalierung absichern

### Kartenbrowser mit großen Sammlungen

- [ ] Eine deterministische Fixture mit 1.000 Karten laden.
- [ ] Karte 999 über eindeutigen Inhalt finden und öffnen.
- [ ] Karte 999 bearbeiten, reloaden und erneut über Suche oder Direktlink
      öffnen.
- [ ] Die bestehende 50er-Pagination und Ergebnisnavigation vollständig per
      Tastatur bedienen.
- [ ] Die Journey bei 1280 × 720 ohne horizontalen Hauptscroll nutzbar halten.

Abnahme:

- [ ] Keine Karte wird still abgeschnitten.
- [ ] Gleichnamige Unterstapel bleiben über ihren vollständigen Pfad eindeutig.
- [ ] Fokus und URL-Selektion bleiben über Seitenwechsel und Reload stabil.

### Performance-Härtung

- [ ] Das bestehende Start- und Preload-Artefakt um deterministische 10k/250k- und
      100k/1m-Fixtures erweitern und in das Release-Gate aufnehmen.
- [ ] Große Kartenkörper und Dokumentfelder nach belastbarer Größenmessung vom
      kompakten Kartenindex trennen; die Migration läuft in fortsetzbaren
      Chunks und ohne Dual Writes.
- [ ] Browser-Quota, `QuotaExceededError`, unterbrochene IndexedDB-Migration
      und Zwei-Geräte-Delta-Sync mit den 100k-/1m-Fixtures automatisiert
      abnehmen.
- [ ] Feld-p75/p95 und die Supabase-Exit-Gates instrumentieren.

### Self-Service-Freigabe

- [ ] Alle vorherigen `NOW`- und `LATER`-Kriterien auf dem Freigabe-Commit
      erfüllen.
- [ ] Einen frischen Hosted-Smoke auf Preview und staged Production mit Login,
      Accountladen, Review, Sync/Reload und Logout erfolgreich durchführen.
- [ ] `npm run test:release`, Production-Build und Chunkbudgets auf demselben
      Commit erfolgreich ausführen.
