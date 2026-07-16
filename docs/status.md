# CoRe-Status

**Rolle:** einzige kanonische Quelle für den aktuellen, verifizierten Implementierungsstand.
**Stand:** 2026-07-16

Diese Datei beschreibt, was heute vorhanden ist. Produktversprechen stehen in [`specs.md`](specs.md), offene Arbeit in [`todo.md`](todo.md) und datierte Abnahmen in [`history.md`](history.md).

## Gesamtbild

CoRe ist ein breiter Web-MVP mit einem abgegrenzten Beta-Kern, Labs-Flächen und deaktivierten Ausbaupfaden. Vercel und Supabase sind angebunden. Der technische Unterbau für Account, Import, Review, Varianten, Cloud-Sync, Konflikte und APKG-Medien ist vorhanden; die manuelle Produkt-, Accessibility- und Hosted-Betriebsabnahme ist noch nicht vollständig.

## Implementiert

- Pflichtlogin mit Supabase E-Mail/Passwort, Profil-Upsert und accountgebundenem Browser-Cache.
- Cloud-first Autosave, Offline-Outbox, Wiederverbindung, revisionsgeprüfte Mutationen, Konfliktauflösung und Soft-Deletes.
- Leerer Standardaccount ohne automatische Demo-Daten; Demo-Seed nur explizit beziehungsweise in Entwicklung/E2E.
- Typgerechte Erstellung und Bearbeitung für Basic, Reverse, Cloze und Multiple Choice mit Rich Text, Feldvalidierung, strukturierter Speicherung und auditierbaren Versionen.
- Manuelle Batch-Erstellung bleibt nach jedem Save im Editor, erhält Pins und Zieldeck, setzt freie Felder und Fokus deterministisch zurück und endet erst über `Fertig`.
- Nichtleere Erstellungsentwürfe sind bei interner Navigation durch einen zugänglichen Dialog und bei Browser-Unload durch den Browser-Fallback geschützt.
- Karten- und Stapellöschung verwenden produktspezifische Auswirkungsdialoge; Karten bieten ein revisionsgeprüftes unmittelbares Undo über denselben Datensatz.
- Reverse-Richtungen, Cloze-Lückengruppen und Multiple-Choice-Lösung werden beim Speichern atomar in ihre reviewbaren Formen projiziert; Reimport, Cloud und Portabilität erhalten lokale strukturierte Änderungen.
- APKG-, Text-, CSV- und Tabellenimport mit getrennten UI-Phasen und Terminalzuständen; Formatwechsel verwerfen alte Vorschau- und Commit-Zustände.
- Accountgebundener Mediencache mit privaten Storage-Objekten, Standardupload bis 6 MiB, TUS darüber und URL-Fallback.
- Review mit vier Bewertungen, Tastatursteuerung, Intervallvorschau und stabilem Sitzungsabschluss.
- Content-Repetition-Varianten mit genau einem Originalanker, Eligibility, Reife, Deaktivierung und kontrolliertem Fehlerfeedback.
- Statistik, Sync-/Konfliktstatus und begrenzter JSON-Portabilitätsexport.
- Lazy geladene Produktscreens, sicherer React-Fehlerfallback und sichtbare Release-Information.
- Implementierte Serverendpunkte sind in [`architecture.md`](architecture.md#71-implementierte-endpunkte) aufgelistet.

## Reifestatus

### Core

Account, Heute, Erstellen/Import, Lernen, Kartenstapelverwaltung, Statistik, Einstellungen, accountgebundene Persistenz und der freigegebene APKG-Pfad bilden den vorgesehenen Beta-Kern.

### Labs

Chat-your-Deck, Lernplan, lokaler deterministischer Entwurfsassistent, Deck-Graph, lokale Community-Demo, externer Varianten-JSON-Flow, AI-Job-Historie und erweiterte APKG-Diagnose sind experimentell und nicht Teil des Kernversprechens.

### Disabled

Der APKG-Pfad über 250 MiB, nicht hosted abgenommene Google-/Magic-Link-Flows, echte Community-Rechte, produktive externe Karten-/Varianten-/Graph-Generierung, DOCX/OCR/Bildregionen sowie vollständige Account-Auskunft und -Löschung sind nicht freigegeben.

Die verbindliche Reifeentscheidung steht in [ADR-001](decisions.md#adr-001--core-labs-und-disabled).

## Bekannte Lücken

- Das P0-Produktgate mit moderierten Tests, Zielviewports, Tastatur- und Screenreader-Abnahme ist offen.
- Hosted-Account-Lifecycle, vollständiger Art.-15-Export und Löschung fehlen.
- Das ausführbare Beta-Core-Gate und der minimale Monitoring-/Alarmvertrag sind vorhanden; realer Alarmempfang sowie getrennte DB-/Storage-Restore-Proben fehlen noch.
- Vollständiger Offline-Kaltstart/PWA, Medienexport und Community-Sharing von Medien fehlen.
- Der vorbereitete Großdatei-APKG-Pfad ist nicht hosted freigegeben.
- Labs haben noch keine vollständigen Graduations- oder Rückbauentscheidungen.

## Verifikation

Die ausführbaren Testkategorien und Gates stehen in [`test-portfolio.md`](test-portfolio.md). Zeitgebundene grüne Läufe und Release-Abnahmen stehen ausschließlich in [`history.md`](history.md); sie werden hier nicht als dauerhafter Produktvertrag wiederholt.
