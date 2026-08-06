# CoRe-Status

**Rolle:** einzige kanonische Quelle für den aktuellen, verifizierten Implementierungsstand.
**Stand:** 2026-08-06

Diese Datei beschreibt, was heute vorhanden ist. Produktversprechen stehen in [`specs.md`](specs.md), offene Arbeit in [`todo.md`](todo.md) und datierte Abnahmen in [`history.md`](history.md).

## Gesamtbild

CoRe ist ein auf den freigegebenen Kartenlern-Kern reduzierter Web-MVP. Vercel und Supabase sind angebunden. Der technische Unterbau für Account, lokalen Import, Review, Varianten, Cloud-Sync, Konflikte und APKG-Medien ist vorhanden; die manuelle Produkt-, Accessibility- und Hosted-Betriebsabnahme ist noch nicht vollständig.

## Implementiert

- Pflichtlogin mit Supabase E-Mail/Passwort, Profil-Upsert und accountgebundenem Browser-Cache.
- Cloud-first Autosave, Offline-Outbox, Wiederverbindung, revisionsgeprüfte Mutationen, Konfliktauflösung und Soft-Deletes.
- Leerer Standardaccount ohne automatische Demo-Daten; Demo-Seed nur explizit beziehungsweise in Entwicklung/E2E.
- Typgerechte Erstellung und Bearbeitung für Basic, Basic + Bilder, Reverse, Cloze und Multiple Choice mit Rich Text, Feldvalidierung, strukturierter Speicherung und auditierbaren Versionen. Die Kartentypauswahl besitzt typspezifische Icons; Basic + Bilder ergänzt optionale, per Strg+V, Drag-and-drop oder Dateiauswahl befüllbare Bildfelder für beide Kartenseiten.
- Manuelle Batch-Erstellung bleibt nach jedem Save im Editor, erhält Pins und Zieldeck, setzt freie Felder und Fokus deterministisch zurück und endet erst über `Fertig`.
- Nichtleere Erstellungsentwürfe sind bei interner Navigation durch einen zugänglichen Dialog und bei Browser-Unload durch den Browser-Fallback geschützt.
- Karten- und Stapellöschung verwenden produktspezifische Auswirkungsdialoge; Karten bieten ein revisionsgeprüftes unmittelbares Undo über denselben Datensatz.
- `Kartenverwaltung` ist die fünfte Hauptseite: eine unbegrenzte, nach Stapelhierarchie gruppierte Gesamttabelle mit standardmäßig eingeklappten Stapelköpfen, sortierbaren Spalten für Vorderseiten-Sortierfeld, Fälligkeit und Variantenstatus, Suche, einheitlichen Stapeloptionen und einem URL-gesteuerten rechten Detail-`aside`. Dashboard und Lernen teilen Panel und stabilen Desktop-Drag; alle drei Ansichten teilen CoRe-Modus, Einstellungen und bestätigtes Verschieben, während weitere Stapelaktionen in den Einstellungen liegen. Ungespeicherte Inhalts- und Tagänderungen sind beim Schließen, Kartenwechsel und interner Navigation geschützt.
- Basic, Basic + Bilder, Reverse, Cloze und Multiple Choice lassen sich direkt hinter dem Original als unabhängiges Learning Item mit frischen Identitäten und Review State kopieren. Der öffentliche, validierte Karteninhalt-Vertrag umfasst nur typgerechte Editorfelder und stabile Medienreferenzen.
- Basic-Karten können zusätzlich über OpenRouter als sofort gespeicherte, am Original verankerte `ai_generated`-Variante umformuliert werden. Die serverseitige Route überträgt nur bereinigte Vorder-/Rückseitentexte, erzwingt einen validierten Tool Call, wählt ausschließlich kostenlose textfähige Tool-Modelle und bevorzugt ZDR; der manuelle Variantenweg bleibt erhalten.
- Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen mit einem gemeinsamen kanonischen URL-Kontext für Deck, Karte, Erstellziel und allowlist-basierten Review-Rückweg; Reload, Direktlink sowie Browser-Zurück/-Vorwärts erhalten den semantischen Kontext.
- Ungültige oder nicht verfügbare Deck-/Kartenlinks zeigen sichere deutsche Fallbacks und öffnen nicht still eine andere Karte.
- Reverse-Richtungen, Cloze-Lückengruppen und Multiple-Choice-Lösung werden beim Speichern atomar in ihre reviewbaren Formen projiziert; Reimport, Cloud und Portabilität erhalten lokale strukturierte Änderungen.
- APKG-, Text-, CSV- und Tabellenimport mit getrennten UI-Phasen und Terminalzuständen; Formatwechsel verwerfen alte Vorschau- und Commit-Zustände.
- Accountgebundener Mediencache mit privaten Storage-Objekten, Standardupload bis 6 MiB, TUS darüber und URL-Fallback.
- Review mit vier Bewertungen, echtem FSRS-6 auf offiziellen Standardparametern, Tastatursteuerung und deterministischer Intervallvorschau. Neue Karten erhalten einen verpflichtenden zweiten Tageskontakt; Sitzungen arbeiten eindeutige Karten vor vorgezogenen Wiederholungen ab und zählen beide getrennt.
- Direkt verlinkbarer, lokal-transienter Zeitsimulator für die vorhandenen Accountkarten: Dashboard, Lernen, Kartenverwaltung, Statistik und Review projizieren Fälligkeit und Lernlogik bis zu 3.650 Tage in die Zukunft. Die Zeitwahl selbst mutiert nichts; Zukunftsreviews werden als echter Lernfortschritt gespeichert und synchronisiert. Reload und Logout stellen nur die Uhr auf „Heute“ zurück.
- Direkt verlinkbare Hilfeseite zu FSRS-6, der noch nicht aktivierten persönlichen Parameteroptimierung und Content Repetition mit zugänglicher interaktiver Lernkurve; Review 4 ist darin ausdrücklich ein vereinfachtes Variantenbeispiel.
- Content-Repetition-Varianten mit genau einem Originalanker, Eligibility, Reife, Deaktivierung und kontrolliertem Fehlerfeedback.
- Statistik, Sync-/Konfliktstatus und begrenzter JSON-Portabilitätsexport.
- Lazy geladene Produktscreens, sicherer React-Fehlerfallback und sichtbare Release-Information.
- Produktweites semantisches CoRe-Theme mit Light und Dark Mode, lokal persistiertem zugänglichem Sidebar-Schalter, hellen dekorativen Rahmenlinien, Amulya/Synonym-Typografie sowie dokumentierten wiederverwendbaren Action-, Feedback-, Struktur- und Formularbausteinen.
- Außer der authentifizierten Basic-Variantenroute `/api/ai/card-variant` werden keine eigenen CoRe-Serverendpunkte ausgeliefert.
- Das produktive CoRe-Schema entspricht dem Core-Zielzustand: pensionierte Labs-/Jobtabellen und -spalten sowie `core-imports` fehlen; das verifizierte Rückbaumanifest enthielt keine zu löschenden Labs-Pfade in `core-media`.

## Reifestatus

### Core

Account, Heute, Erstellen/Import, Lernen, Kartenverwaltung, Statistik, Einstellungen, accountgebundene Persistenz und der freigegebene APKG-Pfad bilden den vorgesehenen Beta-Kern.

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
