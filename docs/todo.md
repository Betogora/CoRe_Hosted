# CoRe TODO

Stand: 2026-10-10

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## Offene Abnahmen der Kartenmodell-Roadmap

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones.
- [ ] **Korpus (Phase 5):** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel: mindestens
      95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## Betrieb

- [ ] **Gehostete Migrationen anwenden:** `20261010180000_drop_unused_variant_columns.sql`
      und `20261010190000_search_account_card_catalog.sql` im Pre-Release-Projekt
      nach dem App-Deploy einspielen (die neue App schreibt die entfernten Spalten
      nicht mehr; ältere geöffnete Tabs würden nach dem Entfernen beim Speichern
      von Varianten scheitern). Danach Schema-Prüfung und Hosted-Smoke.

## Später

- Native App nach ADR-036.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
