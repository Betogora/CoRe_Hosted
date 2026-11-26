# Prüfdokumente „Karten aus einer Quelle“

Selbst geschriebene Lerntexte, je Format eines, für die Stichprobe vor der Freigabe (P2c) und als spätere Fälle des KI-Evals (P5). Keine fremden Texte, keine Lizenzauflagen.

| Datei | Format | Prüft vor allem |
| --- | --- | --- |
| `zellatmung.md` | Markdown | Überschriften als Stellen, Zahlen und Formel, Bedingungen („nur“, „keine“) |
| `gewaltenteilung.txt` | Text | Absätze ohne Überschrift, Ausnahmen und Abgrenzungen, Artikelangaben |
| `netzwerk-glossar.csv` | CSV | Begriff–Erklärung-Zeilen mit Kopfzeile, Felder in Anführungszeichen |
| `franzoesische-revolution.tsv` | TSV | Daten und Reihenfolgen, drei Spalten |
| `ohmsches-gesetz.pdf` | PDF | Seiten als Stellen, Formeln, eine Seite ohne Textlayer (Seite 2) |

Dazu kommen für das KI-Eval (Paket L) neunzehn weitere Dokumente über sieben Fächer in Markdown, Text, CSV und TSV, darunter vier lange Quellen über 60.000 Zeichen (`herz-kreislauf.md`, `betriebswirtschaft-grundlagen.txt`, `betriebssysteme-netze.md`, `europa-19-jahrhundert.txt`), deren Kernaussagen sich gleichmäßig über Anfang, Mitte und Ende verteilen.

Das PDF erzeugt `python scripts/create_ai_source_fixtures.py`.
