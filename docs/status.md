# CoRe-Status

**Rolle:** einzige kanonische Quelle für den aktuellen, verifizierten Implementierungsstand.
**Stand:** 2026-08-03

Diese Datei beschreibt, was heute vorhanden ist. Produktversprechen stehen in [`specs.md`](specs.md), offene Arbeit in [`todo.md`](todo.md) und datierte Abnahmen in [`history.md`](history.md).

## Gesamtbild

CoRe ist ein auf den freigegebenen Kartenlern-Kern reduzierter Web-MVP. Vercel und Supabase sind angebunden. Der technische Unterbau für Account, lokalen Import, Review, Varianten, Cloud-Sync, Konflikte und APKG-Medien ist vorhanden; die manuelle Produkt-, Accessibility- und Hosted-Betriebsabnahme ist noch nicht vollständig.

## Implementiert

- Pflichtlogin mit Supabase E-Mail/Passwort, Profil-Upsert und accountgebundenem Browser-Cache.
- Cloud-first Autosave, Offline-Outbox, Wiederverbindung, revisionsgeprüfte Mutationen, Konfliktauflösung und Soft-Deletes.
- Leerer Standardaccount ohne automatische Demo-Daten; Demo-Seed nur explizit beziehungsweise in Entwicklung/E2E.
- Typgerechte Erstellung und Bearbeitung für Basic, Reverse, Cloze und Multiple Choice mit Rich Text, Feldvalidierung, strukturierter Speicherung und auditierbaren Versionen.
- Manuelle Batch-Erstellung bleibt nach jedem Save im Editor, erhält Pins und Zieldeck, setzt freie Felder und Fokus deterministisch zurück und endet erst über `Fertig`.
- Nichtleere Erstellungsentwürfe sind bei interner Navigation durch einen zugänglichen Dialog und bei Browser-Unload durch den Browser-Fallback geschützt.
- Karten- und Stapellöschung verwenden produktspezifische Auswirkungsdialoge; Karten bieten ein revisionsgeprüftes unmittelbares Undo über denselben Datensatz.
- Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen mit einem gemeinsamen kanonischen URL-Kontext für Deck, Karte, Erstellziel und allowlist-basierten Review-Rückweg; Reload, Direktlink sowie Browser-Zurück/-Vorwärts erhalten den semantischen Kontext.
- Ungültige oder nicht verfügbare Deck-/Kartenlinks zeigen sichere deutsche Fallbacks und öffnen nicht still eine andere Karte.
- Reverse-Richtungen, Cloze-Lückengruppen und Multiple-Choice-Lösung werden beim Speichern atomar in ihre reviewbaren Formen projiziert; Reimport, Cloud und Portabilität erhalten lokale strukturierte Änderungen.
- APKG-, Text-, CSV- und Tabellenimport mit getrennten UI-Phasen und Terminalzuständen; Formatwechsel verwerfen alte Vorschau- und Commit-Zustände.
- Accountgebundener Mediencache mit privaten Storage-Objekten, Standardupload bis 6 MiB, TUS darüber und URL-Fallback.
- Review mit vier Bewertungen, echtem FSRS-6 auf offiziellen Standardparametern, Tastatursteuerung und deterministischer Intervallvorschau. Neue Karten erhalten einen verpflichtenden zweiten Tageskontakt; Sitzungen arbeiten eindeutige Karten vor vorgezogenen Wiederholungen ab und zählen beide getrennt.
- Isolierter, direkt verlinkbarer FSRS-Testmodus mit eigenem Fünf-Karten-Stapel, simulierter Tagesnavigation, echter Review- und Wiederholungslogik sowie sichtbarem Verlauf für nächsten Tag, Zustand, Stabilität und Schwierigkeit; keine Testbewertung gelangt in Workspace, Cloud oder echte Statistik.
- Direkt verlinkbare Hilfeseite in der Reihenfolge Einführung, `R`/`S`/`D`, Entscheidungsgrafik, Bewertungen, Spaced Repetition und Content Repetition. Die zugängliche Grafik verzweigt nach einem Review in vier mögliche Bewertungsintervalle, hebt `4 Leicht` didaktisch hervor und verlinkt ihre Bestandteile auf stabile Abschnittsanker; eine mögliche Variante am langen Intervall ist keine feste Freigabeschwelle.
- Content-Repetition-Varianten mit genau einem Originalanker, Eligibility, Reife, Deaktivierung und kontrolliertem Fehlerfeedback.
- Statistik, Sync-/Konfliktstatus und begrenzter JSON-Portabilitätsexport.
- Lazy geladene Produktscreens, sicherer React-Fehlerfallback und sichtbare Release-Information.
- Produktweites semantisches CoRe-Theme mit Light und Dark Mode, lokal persistiertem zugänglichem Sidebar-Schalter, hellen dekorativen Rahmenlinien, Amulya/Synonym-Typografie sowie dokumentierten wiederverwendbaren Action-, Feedback-, Struktur- und Formularbausteinen.
- Es werden keine eigenen CoRe-Serverendpunkte ausgeliefert.
- Das produktive CoRe-Schema entspricht dem Core-Zielzustand: pensionierte Labs-/Jobtabellen und -spalten sowie `core-imports` fehlen; das verifizierte Rückbaumanifest enthielt keine zu löschenden Labs-Pfade in `core-media`.

## Reifestatus

### Core

Account, Heute, Erstellen/Import, Lernen, Kartenstapelverwaltung, Statistik, Einstellungen, accountgebundene Persistenz und der freigegebene APKG-Pfad bilden den vorgesehenen Beta-Kern.

### Entfernt

Es gibt keine Labs-Oberflächen oder Labs-Routen. Die früheren Labs-Funktionen und ihre Persistenz wurden entfernt.

### Disabled

APKG über 250 MiB wird ohne Serverfallback abgewiesen. Google und Magic Link bleiben separat konfigurierbar. DOCX/OCR/Bildregionen sowie vollständige Account-Auskunft und -Löschung sind nicht freigegeben.

Die verbindliche Reifeentscheidung steht in [ADR-001](decisions.md#adr-001--core-labs-und-disabled).

## Bekannte Lücken

- Das P0-Produktgate mit moderierten Tests, Zielviewports, Tastatur- und Screenreader-Abnahme ist offen.
- Hosted-Account-Lifecycle, vollständiger Art.-15-Export und Löschung fehlen.
- Das ausführbare Beta-Core-Gate und der minimale Monitoring-/Alarmvertrag sind vorhanden; realer Alarmempfang sowie getrennte DB-/Storage-Restore-Proben fehlen noch.
- Vollständiger Offline-Kaltstart/PWA und Medienexport fehlen.

## Verifikation

Die ausführbaren Testkategorien und Gates stehen in [`test-portfolio.md`](test-portfolio.md). Zeitgebundene grüne Läufe und Release-Abnahmen stehen ausschließlich in [`history.md`](history.md); sie werden hier nicht als dauerhafter Produktvertrag wiederholt.
