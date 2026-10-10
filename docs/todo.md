# CoRe TODO

Stand: 2026-10-10

Dieses Dokument enthält ausschließlich offene Arbeit. Der heutige Ist-Stand
steht in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), abgeschlossene Arbeit mit Nachweisen in
[`history.md`](history.md), ausführbare Gates in [`operations.md`](operations.md)
und [`test-portfolio.md`](test-portfolio.md).

Die Kartenmodell-Roadmap (ADR-032 bis ADR-038) ist technisch abgeschlossen; ihre
Phasen und K-Nummern sind in `history.md` datiert belegt. Offen sind nur zwei
Abnahmen, die Personen oder echte Anki-Daten brauchen.

## Offene Abnahmen der Kartenmodell-Roadmap

- [ ] **Gerätenachweise (Phase 3).** Echte Smartphone-Bildschirmtastatur,
      physischer Touch und Screenreader, hörbare System-Sprachausgabe und
      nativer 200-%-Browserzoom auf den Kartenflächen. Die Chromium-Matrix und
      die CSS-Zoomprobe ersetzen diese Nachweise nicht.
- [ ] **Korpusabnahme (Phase 5).** Mit bereitgestelltem Korpus sind mindestens
      95 % der Ankizin- und AnKing-Inhalte voll übersetzt und 0 % nicht
      darstellbar. Ankizin v5, echte Image-Occlusion-Enhanced-Inhalte, Ankis
      eingebaute Bildverdeckung und ein echter Export mit FSRS-Lernstand sind
      belegt. Offen sind AnKing und ein Lernstand mit Lern-, Wiederlern-,
      ausgesetzten, begrabenen und geflaggten Karten; diese Zustände sind bis
      dahin nur synthetisch über die Matrix belegt. Die Stapel bleiben lokal in
      `fixtures/apkg/corpus/`.
      **Prüfung:** `npm run report:apkg-corpus`, `npm run benchmark:apkg`,
      `npm run benchmark:apkg:large`.

## Spätere Roadmaps

Diese Themen sind entschieden oder angedacht, aber noch nicht geplant:

- Native App nach ADR-036: Capacitor, SQLite-Vollreplik, alle Medien auf dem
  Gerät, Store-Veröffentlichung, Push, Login- und Kontolöschungspflichten,
  KI-Route für App-Origins.
- AMBOSS-Tooltips ausschließlich über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen; der Editor
  speichert dafür noch keine neuen Medien.
