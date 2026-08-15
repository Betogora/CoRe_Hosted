# CoRe TODO

Stand: 2026-08-15

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

- [ ] Gedrosselte Chromium-Messartefakte für einen leeren Account, 10k/250k
      und 100k/1m erzeugen und mit `npm run performance:gates` in das
      Release-Gate aufnehmen.
- [ ] `DeckStudySummary` als dauerhaft gepflegte O(Stapel)-Projektion umsetzen,
      damit Hauptmenü und Tagesgrenze keinen Kartenindex mehr scannen.
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
