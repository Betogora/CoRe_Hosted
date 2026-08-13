# CoRe TODO — Beta-Basis

Stand: 2026-08-13

Dieses Dokument ist die einzige operative Roadmap. Es enthält ausschließlich
offene und ausdrücklich autorisierte Arbeit. Abgeschlossene Pakete und
Nachweise stehen in [`history.md`](history.md).

## 1. Arbeitsregeln und Eingangsgate

- [ ] Der Arbeitsbaum ist sauber und der Ausgangs-Commit dokumentiert.
- [ ] `npm run test:beta`, `npm run typecheck` und `npm run build` sind für
      genau diesen Commit grün.
- [ ] Das Paket besitzt einen engen fachlichen Scope und führt keine
      abgeschlossene Aufgabe erneut als offen.
- [ ] Produktcode, Persistenz oder Datenbank werden nur geändert, wenn das
      jeweilige offene Akzeptanzkriterium dies erfordert.

## 2. P0 — Reviewabschluss und begleitete Beta

Ziel: Eine Sitzung endet verständlich und verliert auch offline keine
Bewertung.

- [ ] Der Sitzungsabschluss zeigt die Ratingverteilung.
- [ ] Der Sitzungsabschluss zeigt verbleibende heutige Karten.
- [ ] Eine leere Queue bietet sichere Aktionen zurück zu `Lernen`, zum
      Erstellen neuer Karten und zur Kartenverwaltung.
- [ ] Eine Offlinebewertung mit anschließendem Reconnect erzeugt genau ein
      Reviewevent.
- [ ] Die vollständige Reviewjourney einschließlich Reveal, Bewertungen,
      Wiederholung und Abschluss ist per Tastatur bedienbar.

Abnahme:

- [ ] Browsertests decken Summary, Empty State und Offline/Reconnect ab.
- [ ] Intervallvorschau und gespeicherter Schedulerzustand bleiben identisch.
- [ ] `npm run test:beta` ist auf dem Freigabe-Commit grün.

## 3. P1 — Kartenbrowser und Self-Service

Ziel: Eine große Sammlung ist vollständig auffindbar und per Tastatur
verwaltbar. Die vorhandene globale Inhalts- und Deckpfadsuche, Direktlinks und
100er-Pagination bleiben der Produktpfad; neue Kartentyp- oder Statusfilter sind
nicht Teil dieses Pakets.

- [ ] Eine deterministische Fixture mit 1.000 Karten laden.
- [ ] Karte 999 über eindeutigen Inhalt finden und öffnen.
- [ ] Karte 999 bearbeiten, reloaden und erneut über Suche oder Direktlink
      öffnen.
- [ ] Pagination und Ergebnisnavigation vollständig per Tastatur bedienen.
- [ ] Die Journey bleibt bei 1280 × 720 ohne horizontalen Hauptscroll
      nutzbar.

Abnahme:

- [ ] Keine Karte wird still abgeschnitten.
- [ ] Gleichnamige Unterstapel bleiben über ihren vollständigen Pfad eindeutig.
- [ ] Fokus und URL-Selektion bleiben über Seitenwechsel und Reload stabil.

## 4. Abnahme und Betrieb

Vor begleiteter Beta:

- [ ] Axe meldet in den Kernjourneys keine kritischen oder ernsten Findings.
- [ ] Eine manuelle Screenreader-Stichprobe prüft Review, Import,
      Kartenverwaltung und Fehlerzustände.
- [ ] Datenbank- und Storage-Restore werden getrennt in einem vorgesehenen
      Testprojekt geprüft und in `history.md` dokumentiert.
- [ ] Für mindestens ein Kernsignal ist realer Alarmempfang ohne Nutzerinhalte
      nachgewiesen.

Vor unbegleiteter Self-Service-Beta zusätzlich:

- [ ] Alle offenen P0- und P1-Kriterien sind auf dem Freigabe-Commit erfüllt.
- [ ] Ein frischer Hosted-Smoke läuft auf Preview und staged Production mit
      Login, Accountladen, Review, Sync/Reload und Logout erfolgreich durch.
- [ ] `npm run test:release` sowie Production-Build und Chunkbudgets sind auf
      demselben Commit grün.

### Bewusst nicht geplant

- KI-Zuordnung für CSV-/Tabellenfelder;
- Leech-Erkennung oder persönliche FSRS-Parameteroptimierung;
- vollständige Accountauskunft oder Accountlöschung;
- moderierte Nutzertests;
- Community, Graph, breite KI- oder Labs-Flächen;
- PWA, Push, native Apps, OCR/DOCX oder ein manueller
  Image-Occlusion-Maskeneditor;
- serverseitiger APKG-Import oder eine Anhebung über 250 MB;
- neue Kartentyp- oder Statusfilter im Kartenbrowser.
