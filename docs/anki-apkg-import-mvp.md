# Anki APKG Import MVP

## Unterstuetzt

- Upload und Validierung von `.apkg`-Dateien im Import-Screen.
- Lokales Lesen der APKG-Datei als ZIP-Archiv.
- Erkennung von `collection.anki2`, `collection.anki21` und `collection.anki21b`.
- Minimaler SQLite-Reader fuer die Anki-Tabellen `col`, `notes` und `cards`.
- Auslesen von Deck-Namen, Notes, Cards, Fields, Tags und Media-Mapping.
- Mapping in `CoreDeck` und `CoreCard`.
- Jede importierte Karte wird als Originalkarte gespeichert:
  - `isCoreReady: false`
  - `variantCount: 0`
  - `repetitionLevel: 0`
- Lokale Speicherung in `localStorage`, gekapselt hinter `createCoreRepository`.
- Sichere HTML-Vorschau mit Entfernung von Scripts, Event-Attributen und `javascript:`-URLs.

## Bewusst noch nicht unterstuetzt

- Vollstaendige Anki-Template-Auswertung.
- Vollstaendige Cloze-Review-Logik.
- Import und Persistenz der eigentlichen Mediendateien.
- Scheduling, Review-Historie und Revlog-Migration.
- Passwortgeschuetzte oder ungewoehnlich komprimierte ZIP-Varianten.
- Sehr grosse Decks ueber 250 MB direkt im Browser.

## Naechste Ausbaustufe

- Server- oder API-seitiges Parsing mit einer vollwertigen ZIP- und SQLite-Bibliothek.
- Persistenz in Supabase, Firebase oder Postgres hinter derselben Repository-Grenze.
- Vollstaendige Anki-Template-Renderpipeline fuer mehrere Card-Templates pro Note.
- Speichern der Mediendateien in einem Storage-Bucket und Ersetzen der Referenzen in der Kartenansicht.
- Uebernahme ausgewaehlter Scheduling-Daten, sobald die CoRe-Review-Logik final ist.

Die zentrale Produktregel bleibt: Importierte Anki-Karten sind der vertrauenswuerdige Wissensanker. CoRe-Varianten werden spaeter separat erzeugt und ueberschreiben nie das Original.
