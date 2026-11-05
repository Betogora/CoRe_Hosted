# CoRe-Grundbibliothek

Kuratierte Beispielstapel, die CoRe mitbringt. Jeder Stapel hat eine versionierte
Quelle (`<stapel>.source.json`) als einzige Wahrheit; Pakete und App-Inhalte werden
daraus erzeugt und nie von Hand bearbeitet.

| Stapel | Inhalt | Erzeugt |
| --- | --- | --- |
| `world-capitals/` | Welt-Hauptstädte, 245 Karten in 7 Kontinent-Unterstapeln mit eigener Farbe. Daten: [mledoze/countries](https://github.com/mledoze/countries) (ODbL-1.0), deutsche Hauptstadt- und Fragetexte in `scripts/create_world_capitals_apkg.py` | „Demo ausprobieren“ im Dashboard (`src/fixtures/worldCapitals.ts`) und das Testpaket `fixtures/apkg/world-capitals.apkg` |

## Erzeugen

```bash
python scripts/create_world_capitals_apkg.py
```
