# CoRe-Status

Stand: 2026-11-23

Was heute vorhanden ist und was noch fehlt. Das Verhalten jeder Funktion steht
in [`specs.md`](specs.md), offene Arbeit in [`todo.md`](todo.md), datierte
Nachweise in [`history.md`](history.md).

## Gesamtbild

CoRe ist ein auf den freigegebenen Kartenlern-Kern reduzierter Web-MVP auf Vercel
und Supabase. Alle Bereiche der Hauptnavigation (`Heute`, `Lernen`, `Erstellen`,
`Karten`, `Prüfung`) sowie Statistik, Einstellungen, Hilfe und Simulator sind
gebaut und entsprechen den Specs, soweit unten keine Lücke genannt ist. Die
manuelle Produkt-, Accessibility- und Hosted-Betriebsabnahme ist noch nicht
vollständig.

## Plattform und Datenstand

- Production: `https://core-hosted.vercel.app`; Datenbank ist das Pre-Release-Projekt `CoRe-Database` (`hirbiuiydczmnjqtoyqx`), zuletzt am 2026-10-08 vollständig zurückgesetzt.
- Schema: einzige Baseline `20261030103636_kartenmodell_baseline.sql` plus spätere Migrationen; keine Upgrade- oder Backfillkette (ADR-034).
- Browser-Replica: IndexedDB `core.workspace.entities.v5.<userId>`, ohne Lesepfade für frühere lokale Datenbanken.
- Server: nur die authentifizierten KI-Routen `/api/ai/card-variant`, `/api/ai/card-help`, `/api/ai/summary` und `/api/ai/source-cards` über OpenRouter (ADR-011).
- KI-Eval: Runner für Varianten Frage/Antwort, Lückentext und Auswahl sowie `card-help` (`npm run ai-eval`, ADR-049) mit je 24 Prüfkarten in Training und Entscheidung, Antwortklassen, Budget, Kandidaten als Datei, Richterblöcken mit Urteilscache und versionierten Ergebnissen; `source-cards` fehlt im Register, die Zusammenfassung hat keine Definition. Ein Probelauf (2026-11-23), Ledger leer, Richter ohne Kalibrierung. Stand unter [KI-Eval](ai-eval.md), Umbau und Messung in [`todo.md`](todo.md) unter P5.
- Kartenmodell `Note`/`Card` in App, Import, Persistenz und Sync (ADR-032); Scheduler FSRS-7 mit Reife aus der Haltbarkeit (ADR-044).

## Reifestatus

- **Core:** Account, Heute, Erstellen (manuell, APKG-Import, Karten aus einer Quelle per KI), Lernen, Kartenverwaltung und Karteneditor, Prüfungsplaner, Zusammenfassungen und Mindmaps, Statistik, Einstellungen, accountgebundene Persistenz mit Sync. Bildverdeckung gehört zum Kern.
- **Disabled:** Anki-Pakete über 2 GiB (ohne Serverfallback abgewiesen), Magic Link (eigener Schalter), DOCX/OCR bei der manuellen Erstellung und bei Zusammenfassungen, vollständige Account-Auskunft und -Löschung.
- **Entfernt:** Labs-Oberflächen und -Routen, serverseitiger APKG-Import und ihre Persistenz.

Die verbindliche Reifeentscheidung steht in [ADR-001](decisions.md#adr-001--produktumfang-nur-mit-auftrag).

## Bekannte Lücken

- **Abnahmen:** P0-Produktgate mit Zielviewports, Tastatur- und Screenreader-Abnahme offen; Hosted-Account-Lifecycle, vollständiger Art.-15-Export und Löschung fehlen.
- **Betrieb:** realer Alarmempfang sowie getrennte DB- und Storage-Restore-Proben fehlen ([`operations.md`](operations.md#6-datenbank-rls-und-restore)).
- **Performance:** Alle gedrosselten Startgates bestehen („Neues Gerät bis Dashboard“ p75 2.574 ms bei 3.000 ms Grenze). Offen sind die vollständige 100k-Browserjourney, Feldwerte von Testgeräten (die App zeichnet sie lokal auf, ADR-050; eingesammelt ist noch nichts) und Hosted-Rohdatenkapazität: 1 Mio. physische `review_events` überschreiten das aktuelle Volume; der tägliche Statistikrollup funktioniert.
- **Import-Korpus:** Ankizin v5, Ankiphil, Dellas, Image Occlusion Enhanced, Anki-Bildverdeckung und ein Auszug mit FSRS-Lernstand werden vollständig übersetzt. AnKing sowie Lernstände mit Lern-, Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten fehlen im Korpus und sind nur synthetisch über die Matrix belegt.
- **Bewusst nicht ausgeführt:** Template-JavaScript, Add-on- und Custom-Filter, native LaTeX-Toolchains und nicht browserfähige Codecs bleiben erhalten, laufen aber nicht.
- **Bewusst anders als Anki:** Lücken, die nur in einem Feld außerhalb der Frage stehen, ergeben keine Karte (Anki erzeugt eine mit leerer Vorderseite). `{{C1::…}}` mit großem C gilt als Lücke, in Anki nicht; gespeicherte Inhalte hängen an dieser Lesart.
- **Begraben:** Stapelzähler zählen zwei noch unbeantwortete Geschwister bis zur ersten Antwort beide (Anki zeigt eines). Ein Gerät mit unvollständigem lokalen Katalog übernimmt Antworten erst mit dem nächsten Bootstrap in die Zähler.
- **Speicher:** Ein vollständiger 10-GB-Medienbestand ist im Browser nicht garantiert; Browser-Eviction bleibt Plattformgrenze. Die native App mit lokaler Vollreplik (ADR-036) ist nicht begonnen.
- **Karten aus einer Quelle:** Die Kartenmenge (weniger, normal, mehr) ändert die Zahl der Vorschläge bisher nicht (Messung im [Verlauf](history.md)); die Schätzung nennt daher je Stufe dieselbe Spanne. Ziel in [`todo.md`](todo.md) unter P5.
- **KI-Prompts:** Kein Prompt hat eine Baseline im Ledger. Der Probelauf vom 2026-11-23 ([Verlauf](history.md)) liegt bei Varianten unter dem Ziel von 95 % (Frage/Antwort 85 %, Lückentext 81 %, Auswahl 100 %) und bei KI hilft unter 90 % (77 %); Karten mit eingeschleuster Anweisung bricht der Inhaltsfilter des Anbieters mit irreführender Meldung ab.
- **Gerätelokal:** Dashboard-Layout und eigene To-dos liegen pro Konto nur im Browser und synchronisieren nicht.
