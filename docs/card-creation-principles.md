# CoRe Card Creation Principles

## Gemeinsames Modell

Alle Lerninhalte gehoeren zu einem `CoreDeck` beziehungsweise Kartenstapel. Die Quelle kann aktuell sein:

- `anki-apkg`
- `manual`
- `ai-assisted`

Alle Quellen erzeugen `CoreCard`-Objekte ueber dieselbe Modellschicht in `src/coreModel.js`.

## Immutable Original

Jede Karte besitzt eine unveraenderliche Originalrepraesentation in `immutableOriginal`. Varianten duerfen spaeter nur separat entstehen und nie `originalFront`, `originalBack`, `originalFields`, `originalHtml` oder `immutableOriginal` ueberschreiben.

## Manuelle Erstellung

Der MVP-Screen unter `Import` unterstuetzt die Anki-nahen Kartentypen:

- Basic front/back
- Basic reversed
- Cloze deletion
- Image occlusion
- Multiple choice
- Free text

Textdokumente koennen direkt im Browser gelesen werden. PDF, DOCX und Bilder werden als Dokumentkontext erfasst; ihre robuste Textextraktion sollte spaeter serverseitig erfolgen.

## KI-Erstellung

KI-assistierte Erstellung ist review-first:

- Sprache
- Kartenanzahl
- Detailgrad
- Quellennaehe
- Kartentypen
- Schwierigkeit
- Fach/Kontext
- Stil

Im MVP wird keine KI-API aufgerufen. Die UI bereitet den Review-Bereich und die Konfiguration vor. Sobald eine Generierung angebunden wird, muessen generierte Karten `draftStatus: "draft"` behalten, bis der Nutzer sie akzeptiert.
