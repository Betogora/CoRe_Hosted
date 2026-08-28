# CoRe TODO

Stand: 2026-08-28

Dieses Dokument enthält ausschließlich die wenigen noch offenen Abnahmen vor
der begleiteten Beta. Ausführbare Gates und Releaseabläufe stehen in
[`operations.md`](operations.md), bekannte technische Grenzen in
[`status.md`](status.md) und abgeschlossene Nachweise in
[`history.md`](history.md).

## Vor der begleiteten Beta

- [ ] KI-Umformulierungen nach einer Änderung ihrer Grundkarte erkennen und
      gezielt neu erzeugen können; bis dahin bleiben bestehende Varianten
      unverändert und werden nicht automatisch regeneriert.
- [ ] Das Tag-System um Katalog, hierarchische Navigation und eindeutige
      Herkunft erweitern. Beim APKG-Import abgeflachte Überlaufpfade werden
      dann aus der erhaltenen Importherkunft als schreibgeschützte System-Tags
      zur Laufzeit abgeleitet; sie werden weder in `LearningItem.tags`
      persistiert noch zur kanonischen Speicherung der Stapelbeziehung.
- [ ] Kernjourneys bei den Zielviewports sowie per Tastatur, Axe und
      Screenreader abschließend abnehmen.
- [ ] Datenbank- und Storage-Restore getrennt in einem vorgesehenen Testprojekt
      prüfen und in `history.md` dokumentieren.
- [ ] Für mindestens ein Kernsignal realen Alarmempfang ohne Nutzerinhalte
      nachweisen.
