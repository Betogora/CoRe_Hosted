# CoRe TODO

Stand: 2026-10-06

Dieses Dokument enthält ausschließlich offene Arbeit. Es beschreibt die
Roadmap für das neue Kartenmodell nach [ADR-032 bis ADR-036](decisions.md).
Ausführbare Gates stehen in [`operations.md`](operations.md) und
[`test-portfolio.md`](test-portfolio.md), der heutige Ist-Stand in
[`status.md`](status.md), abgeschlossene Nachweise in [`history.md`](history.md).

## Ziel

CoRe besitzt ein dauerhaft stabiles Kartenmodell:

- Ein Inhalt existiert genau einmal; seine Karten sind leichte planbare
  Abfragen mit eigenem Lernstand (ADR-032).
- Es gibt keine Kartentypen, sondern ein universelles Inhaltsformat aus Feldern
  mit Rolle und optionalen Bausteinen, immer im CoRe-Design (ADR-033).
- Jede gängige APKG-Datei der letzten Anki-Generationen wird vollständig
  übernommen: Stapelbaum, Inhalte, Medien, Lernstand und Sonderformate wie
  Lückentext, Image Occlusion, Hinweise, Eintippen, Multiple Choice, Formeln
  und Links (ADR-033, ADR-035).
- Die Speicherung ist relational, schlanker als heute und ohne Umbau als
  SQLite-Replik einer späteren App spiegelbar (ADR-034, ADR-036).
- Eine Format-Matrix sichert das automatisch ab (ADR-035).

## Arbeitsregeln für diese Roadmap

- **Feature-Freeze:** Bis Phase 5 abgenommen ist, entstehen keine neuen
  Karten-, Editor- oder Importfunktionen außerhalb dieser Roadmap.
- **Tests zuerst:** Jede Lücke wird zuerst als offene Erwartung in der Matrix
  sichtbar (Phase 1) und gilt erst mit grüner Matrixzeile als geschlossen.
- **Keine Parallelpfade:** Altes Modell, alte Typen, alte Tabellen und alte
  Renderpfade werden in derselben Phase entfernt, in der ihr Ersatz fertig ist.
  Es gibt keine Migration und keinen Altlesepfad (ADR-028).
- **Dokumentation pro Phase:** Wenn eine Phase ihren Vertrag ändert, werden
  `specs.md`, `architecture.md`, `status.md`, `anki-format-analysis.md`,
  `test-portfolio.md`, `AGENTS.md` und der Kartentypen-Katalog in derselben
  Phase angepasst; erledigte Punkte wandern datiert nach `history.md`.
- **Messen statt annehmen:** Performance- und Speicherziele werden gegen eine
  vor Phase 2 erhobene Ausgangsmessung nachgewiesen.
- **Lizenzgrenze:** Anki- und Add-on-Code wird nur gelesen, nie kopiert.
  Realwelt-Stapel bleiben lokal.

## Reihenfolge

```text
Phase 0  Ausgangsmessung und Inhaltsschema
   │
Phase 1  Format-Matrix und Realwelt-Korpus  (zeigt alle Lücken als offen)
   │
Phase 2  Kanonisches Modell in TypeScript   ─┐
Phase 3  Renderer und Bausteine              ├─ parallel möglich, beide nur rein TS
   │                                         ─┘
Phase 4  Datenbank-Baseline, Replica und Sync
   │
Phase 5  APKG-Import und Übersetzer         (Matrix grün = Kernabnahme)
   │
Phase 6  Erstellen, Bearbeiten, Verwaltung und KI-Varianten
   │
Phase 7  Begraben von Geschwistern
   │
Phase 8  Gesamtabnahme
```

## Phase 0 — Ausgangsmessung und Inhaltsschema

Die Ausgangsmessung (K0.1) ist am 2026-10-06 in `history.md` festgehalten und
mit `npm run measure:footprint`, `npm run performance:measure:local` und
`npm run benchmark:apkg` reproduzierbar.

- [ ] **K0.2 Inhaltsschema `NoteContent` spezifizieren.** Felder mit stabiler
      ID, Name, Rolle (`prompt`, `answer`, `hint`, `extra`, `source`, `note`)
      und Rich-Text-Wert; Bausteine `cloze`, `imageOcclusion`, `choice`,
      `typeIn`, `directions`, `tts`; Tags; Medienreferenzen; Schemaversion.
      Eindeutige Regeln für Abfrageschlüssel (`default`, `reverse`, `cloze:N`,
      `io:N`, `choice`, `type`) und für ihre Ableitung aus den Bausteinen.
- [ ] **K0.3 Zulässiges Rich-Text-HTML festlegen.** Erhalten bleiben
      Struktur und Auszeichnung (fett, kursiv, unterstrichen, Hoch-/Tiefstellung,
      Farbe, Hintergrundmarkierung, Listen, Tabellen mit Rahmen, Abständen und
      Ausrichtung, Bilder, Audio, Video, Links, Ruby). Schriftfamilien entfallen,
      Schriftgrößen nur relativ, keine Positionierung, keine Formulare oder
      eingebetteten Fremdinhalte.

**Abnahme:** Schema und Regeln sind als Typen mit Validierung und Beispielen
reviewt.

## Phase 1 — Format-Matrix und Realwelt-Korpus

- [ ] **K1.1 Fixture-Generator ausbauen.** `scripts/create_apkg_quality_fixtures.py`
      erzeugt die Matrix deterministisch. Legacy-Pakete entstehen weiterhin
      synthetisch nach Schema 11, moderne Pakete über eine fest gepinnte
      Anki-Python-Bibliothek. Erzeugte Dateien bleiben klein genug für das
      Repository.
- [ ] **K1.2 Erwartungsformat v2.** Je Fixture: Paketformat, Stapelpfade,
      Inhalte mit GUID, Feldrollen und Bausteinen, Karten mit Abfrageschlüssel,
      Zielstapel und Lernstand, Medien mit Name, SHA-1 und Referenzort, erwartete
      Importwarnungen und eine Textfassung von Vorder- und Rückseite.
- [ ] **K1.3 Achse Paketversion:** `collection.anki2` (Anki 2.0),
      `collection.anki21` (2.1 und Legacy-Export), `collection.anki21b`
      (modern, Zstd und Protobuf), `.colpkg`, Paket mit Platzhalter-`anki2`
      neben `anki21b`, beschädigtes Paket, Paket ohne Karten.
- [ ] **K1.4 Achse Inhalt:** Basic; Basic und umgekehrt; optional umgekehrt
      mit und ohne Auslöserfeld; Antwort eintippen; Lückentext einfach, mit
      Hinweis, verschachtelt, mit `{{c1,2::…}}`, über mehrere Felder und in
      Formeln; native Image Occlusion mit Rechteck, Ellipse, Polygon und Text
      sowie beiden Verdeckungsmodi; Image Occlusion Enhanced; Nachbau eines
      AnKing-/Ankizin-artigen Notiztyps mit Script-Hinweisbuttons; Nachbau eines
      verbreiteten Multiple-Choice-Add-on-Typs; unbekannter Notiztyp mit
      statischem Text und Bedingungen; `{{hint:}}`, `{{type:}}`, `{{tts}}`,
      Furigana; MathJax inline und als Block; LaTeX als Bild; Audio und Video;
      Tabellen und Inline-Styles; farbiger Text; AMBOSS- und andere Links;
      Unicode-, Leerzeichen-, URL-kodierte und HTML-maskierte Mediennamen;
      fehlende Medien; über CSS referenzierte Schriftdateien.
- [ ] **K1.5 Achse Organisation:** tiefe Unterstapel, leere Elternstapel,
      Stapel `Default`, Geschwister einer Notiz in verschiedenen Stapeln,
      Template-Zielstapel, Karten in einem gefilterten Stapel beim Export
      (`odid`/`odue`).
- [ ] **K1.6 Achse Lernstand:** neu, lernend, Review, Relearning, ausgesetzt,
      begraben, Flaggen, Tag `marked`, moderner FSRS-Memory-State, nur
      Revlog-Historie, Export ohne Lernstand.
- [ ] **K1.7 Matrixtest im Contract-Gate.** Ein Test liest alle Fixtures über
      die öffentliche Import-Seam und vergleicht mit der Erwartung. Heute
      bekannte Lücken sind als ausdrücklich offene Erwartungen markiert und
      werden nicht still übersprungen. Laufzeitbudget im Contract-Gate
      festlegen.
- [ ] **K1.8 Realwelt-Korpus.** Gitignorierter lokaler Ordner und ein
      `npm`-Befehl, der alle dort liegenden Stapel importiert und je Notiztyp
      berichtet: Übersetzer, Anzahl Inhalte und Karten, voll übersetzt,
      generisch übersetzt, nicht darstellbar, fehlende Medien, Laufzeit und
      Heap. Ohne Dateien endet der Befehl mit einer eindeutigen Meldung statt
      mit „bestanden“.
- [ ] **K1.9 Visuelle Referenzfälle.** Für Lückentext, Image Occlusion,
      Hinweis, Eintippen, Multiple Choice, Formel, Tabelle und farbigen Text
      in Light und Dark Mode werden Screenshot-Fälle für die
      [visuelle Pflichtmatrix](operations.md#visuelle-pflichtmatrix) definiert.

**Abnahme:** Matrix läuft im Contract-Gate; jede in der Ist-Analyse genannte
Lücke ist als offene Erwartung sichtbar; Korpus-Befehl ist ohne und mit
Beispieldatei lauffähig; `test-portfolio.md` beschreibt beide.

## Phase 2 — Kanonisches Modell in TypeScript

- [ ] **K2.1 Typen.** `Note` (Inhalt ohne Stapel) und `Card` (Inhalt-ID,
      Stapel, Abfrageschlüssel, Anki-Kartenidentität, Status, typisierter
      Lernstand) in `coreTypes.ts`. `LearningItem` als inhaltstragende Karte,
      `CardType`, `EditableCardType`, typspezifische Editorwerte und alle
      Compatibility-Projektionen entfallen.
- [ ] **K2.2 Abfrageableitung.** Eine reine Funktion leitet aus einem Inhalt die
      Menge der Abfrageschlüssel ab: Lückennummern einschließlich
      Mehrfachnummern und Verschachtelung, Bildverdeckungsgruppen, Richtungen
      samt optionaler Rückrichtung, Auswahl und Eintippen. Ergebnis ist
      deterministisch und stabil bei Feldreihenfolge oder Formatierung.
- [ ] **K2.3 Abgleich bei Änderung.** Eine reine Funktion vergleicht alte und
      neue Abfragemenge und liefert neue Karten, unveränderte Karten mit
      Lernstand und entfallende Karten. Entfallende Karten werden nie still
      gelöscht, sondern erst nach Bestätigung (ADR-032).
- [ ] **K2.4 Seam und Validierung.** `coreModel.ts` bleibt die einzige
      öffentliche Seam für Erzeugen, Normalisieren und Ändern von Inhalten und
      Karten. Cloud-Zeilenvalidierung bleibt in `cloudRepositoryValidation.ts`.
- [ ] **K2.5 Scheduler und Queue umstellen.** `reviewService`, FSRS, Easy Days,
      Tageslimits und Statistik lesen den typisierten Kartenlernstand; das
      Verhalten bleibt unverändert und durch die bestehenden Tests belegt.
- [ ] **K2.6 Löschen nach Anki.** Löschen einer Karte löscht Inhalt und alle
      Geschwister; Undo stellt beide wieder her; der Auswirkungsdialog nennt die
      Kartenzahl.

**Abnahme:** Unit-Tests für Ableitung und Abgleich decken jede Lückensyntax und
jeden Baustein ab; bestehende Scheduler-, Review- und Statistiktests sind
unverändert grün; im Code existiert kein Kartentyp-Begriff mehr.

## Phase 3 — Renderer und Bausteine

- [ ] **K3.1 Ein Renderer.** `renderCard(note, card, side, theme)` erzeugt
      scriptfreies HTML mit CoRe-Styles für Vorschau, Kartenverwaltung und
      Review. Nichts davon wird persistiert. Der Anki-Template-Renderpfad und
      der Feldlisten-Fallback entfallen.
- [ ] **K3.2 Feldrollen.** Frage und Antwort; Hinweise vor dem Aufdecken
      einzeln aufklappbar (ohne Script, z. B. über `details`); Zusatz erst nach
      dem Aufdecken; Quellen als Link-Chips.
- [ ] **K3.3 Lückentext.** Volle Anki-Syntax einschließlich Hinweis,
      Verschachtelung, Mehrfachnummern und Lücken in Formeln; aktive Lücke
      hervorgehoben, andere Lücken ausgeschrieben.
- [ ] **K3.4 Bildverdeckung.** Masken als SVG über dem Bild, relative
      Koordinaten, Modi „eine verdecken“ und „alle verdecken, eine erraten“,
      Aufdecken der Zielmaske auf der Rückseite, responsive Skalierung.
- [ ] **K3.5 Eintippen.** Eingabe im Review-Host außerhalb des Kartenrahmens,
      zeichengenauer Vergleich beim Aufdecken, Tastaturbedienung.
- [ ] **K3.6 Auswahl.** Single Choice, Multiple Choice und Kprim im
      Review-Host mit Auswertung und Erklärung; ersetzt die heutige
      Choice-Darstellung.
- [ ] **K3.7 Formeln.** MathJax-Notation (`\(…\)`, `\[…\]`) wird mit KaTeX
      vorgerendert; KaTeX lädt nur bei erkannten Formeln nach und hält die
      Bundlebudgets ein.
- [ ] **K3.8 Rich Text.** Sanitizer nach K0.3; Feldfarben werden für Light und
      Dark Mode automatisch auf ausreichenden Kontrast angepasst.
- [ ] **K3.9 Medien und Vorlesen.** Bilder, Audio, Video wie heute über
      aufgelöste Medien-URLs; `{{tts}}` als Vorlese-Schaltfläche im Host über
      die Sprachausgabe des Systems.
- [ ] **K3.10 Links und AMBOSS.** Links öffnen extern in neuem Kontext ohne
      Zugriff auf CoRe; Review-Aktion „In AMBOSS nachschlagen“ öffnet die
      AMBOSS-Suche mit dem markierten Begriff. Das Suchlinkformat wird vor der
      Umsetzung verifiziert.

**Abnahme:** Textfassungen aller Matrixfälle stimmen; Screenshot-Fälle aus K1.9
sind in beiden Themes visuell geprüft; der Kartenrahmen enthält nachweislich
kein Script und lädt keine externen Ressourcen; Bundlebudgets sind grün.

## Phase 4 — Datenbank-Baseline, Replica und Sync

- [ ] **K4.1 Neue Baseline.** Eine einzige frische Migration ersetzt die
      heutige: `decks`, `notes`, `cards` mit typisierten Lernstandsspalten,
      `note_type_sources` (unsichtbare Anki-Vorlage je Notiztyp),
      `media_files` je Account und SHA-1, `note_media`, `card_variants`,
      `review_events`, `review_statistics_daily`, `sync_devices`,
      `sync_conflicts`. `note_type_definitions` und gespeichertes Karten-HTML
      entfallen.
- [ ] **K4.2 Projektionen prüfen.** Für `card_catalog` und
      `deck_study_summaries` wird gemessen, ob direkte Indizes auf `cards` und
      `notes` die Grenzen der Ausgangsmessung halten. Nur gerechtfertigte Projektionen
      bleiben.
- [ ] **K4.3 RPCs.** Atomare Reviewaufzeichnung auf Kartenspalten, Bootstrap,
      Katalog-Delta, Hydrierung von Karten mit ihren Inhalten,
      Offline-Manifest, Stapelbaum-Löschung mit Anki-Regel für verwaiste
      Inhalte, Statistik.
- [ ] **K4.4 Sicherheit.** RLS für alle Tabellen, `verify_schema` neu,
      generierte `database.types.ts`, vollständige RLS-Suite einschließlich
      fremder Inhalte, Karten und Medien.
- [ ] **K4.5 Web-Replica.** Neue IndexedDB-Datenbank ohne Upgradepfad mit
      Stores für Stapel, Inhalte, Karten, Varianten, Reviewereignisse,
      Outbox und Konflikte. Inhalt nach ADR-034: Stapelbaum, Lernfenster mit
      Inhalten, zuletzt geöffnete Karten, Medien bei Bedarf und
      Offline-Downloads pro Stapel.
- [ ] **K4.6 Sync und Konflikte.** Mutationen für Inhalt und Karte getrennt;
      Inhaltsrevision und Lernstand bilden getrennte Konfliktgrenzen; ein
      Offline-Review und eine parallele Inhaltskorrektur werden ohne Konflikt
      zusammengeführt.
- [ ] **K4.7 Medien.** Upload, Cache, Queue und Offline-Download auf
      `media_files`/`note_media` umstellen; Speicherfreigabe erst, wenn kein
      Inhalt mehr referenziert.
- [ ] **K4.8 Remote-Reset.** Nach grünen lokalen Gates wird das
      Pre-Release-Projekt gemäß ADR-028 mit unmittelbar davor geprüfter
      Projekt-Ref zurückgesetzt.

**Abnahme:** `db:types:check`, `test:rls:local`, `test:e2e:local` und
`performance:measure:local` grün; Speicher je 1.000 Lückentext-Inhalte
nachweislich unter der Ausgangsmessung; p95-Werte mindestens auf deren Niveau; Zwei-Geräte-Test
für Review und Inhaltskorrektur grün.

## Phase 5 — APKG-Import und Übersetzer

- [ ] **K5.1 Importgraph.** Eine Anki-Notiz wird ein Inhalt, jede Anki-Karte
      eine Karte mit Abfrageschlüssel aus Template-Ordinal, Lückennummer oder
      Maskengruppe. Stapel je Karte über `did`, bei gefilterten Stapeln über
      `odid` und `odue`.
- [ ] **K5.2 Übersetzer-Registry.** Versionierte Übersetzer mit Erkennung über
      Notiztyp-Art, Stock-Kennung, Felder und Template-Signatur: Basic-Familie,
      Antwort eintippen, Lückentext, native Image Occlusion (Occlusion-Feld zu
      Masken), Image Occlusion Enhanced, AnKing-/Ankizin-Familie (Text, Extra,
      zusätzliche Felder als Hinweise, Links als Quellen), verbreitete
      Multiple-Choice-Add-ons.
- [ ] **K5.3 Generischer Übersetzer.** Für unbekannte Notiztypen leitet der
      sichere Template-Compiler aus der Struktur ab, welche Felder Frage,
      Antwort oder Zusatz sind, übernimmt statischen Template-Text als Teil der
      Frage und wertet Bedingungen aus. Nicht zuordenbare Felder bleiben als
      Notizfelder sichtbar und werden berichtet.
- [ ] **K5.4 Anki-Vorlage speichern und neu übersetzen.** Templates, CSS,
      Feld- und Konfigurationsdaten je Notiztyp landen unsichtbar in
      `note_type_sources`; ein Befehl übersetzt bestehende Importe nach einem
      Übersetzer-Update neu, ohne lokale Inhaltsänderungen oder Lernstand zu
      überschreiben.
- [ ] **K5.5 Lernstand.** Heutige Priorität (FSRS-Memory-State,
      Revlog-Replay, klassischer Status, neu) bleibt; ausgesetzt wird
      übernommen; begraben verfällt wie in Anki am nächsten Lerntag; Tag
      `marked` wird zur CoRe-Markierung; Flaggen bleiben als Metadaten.
- [ ] **K5.6 Medien.** Namen nach Unicode-NFC, URL- und HTML-Dekodierung
      normalisieren; eine Mediendatei pro SHA-1; Referenzen je Inhalt; über
      Template-CSS referenzierte Schriften werden nicht übernommen.
- [ ] **K5.7 Reimport.** Inhalte über Anki-GUID, Karten über Anki-Kartenidentität
      zuordnen; lokale Inhaltsänderungen, Lernstand, Aussetzung, Markierung und
      Stapelordnung bleiben; neue Lücken erzeugen neue Karten; in Anki
      entfallene Karten werden nur berichtet.
- [ ] **K5.8 Große Stapel am Computer.** ZIP und Medien werden streamend
      verarbeitet; APKG und COLPKG bis mindestens 2 GiB, Worker-Heap höchstens
      1 GiB, Main-Thread-Übergabe weiter unter 100 ms. Die Grenzen werden mit
      echten AnKing-/Ankizin-Dateien überprüft, sobald der Korpus bereitsteht.
- [ ] **K5.9 Importbericht.** Vorschau und Abschluss zeigen je Notiztyp den
      Übersetzer, die Anzahl Inhalte und Karten, generisch übersetzte und nicht
      zuordenbare Felder, fehlende Medien und übernommenen Lernstand.

**Abnahme:** Die gesamte Matrix aus Phase 1 ist grün; Golden-Flow APKG und
Medien-E2E grün; APKG-Benchmark hält die Grenzen aus K5.8; mit bereitgestelltem
Korpus sind mindestens 95 % der Ankizin- und AnKing-Inhalte voll übersetzt und
0 % nicht darstellbar.

## Phase 6 — Erstellen, Bearbeiten, Verwaltung und KI-Varianten

- [ ] **K6.1 Ein Editor.** Manuelle Erstellung und Bearbeitung arbeiten auf dem
      Inhalt: Felder mit Rollen, Bausteine zuschaltbar, Hinweis-, Zusatz- und
      Quellenfelder, Eintippen, Auswahl, Richtungen, Formeln. Der Editor zeigt,
      wie viele Karten eine Änderung betrifft.
- [ ] **K6.2 Abfrageänderungen.** Hinzugefügte Lücken oder Richtungen erzeugen
      Karten; für entfallende Abfragen nennt ein Bestätigungsdialog die Karten
      samt Lernstand und löscht sie erst nach Zustimmung.
- [ ] **K6.3 Kartenverwaltung.** Listet weiterhin Karten, zeigt Geschwister
      (z. B. „Lücke 2 von 3“), sucht im Inhaltstext und bearbeitet Tags am
      Inhalt; Kopieren erzeugt einen neuen Inhalt mit frischen Karten.
- [ ] **K6.4 KI-Umformulierungen.** Bleiben an ihrer Karte; eine
      Inhaltsänderung markiert die Umformulierungen aller betroffenen Karten
      als veraltet und erlaubt gezielte Neuerzeugung.
- [ ] **K6.5 Bildverdeckungs-Editor.** Als letzter Schritt dieser Phase:
      Masken (Rechteck, Ellipse, Polygon, Text) auf einem Bild zeichnen,
      gruppieren, Verdeckungsmodus wählen und als Inhalt speichern.
- [ ] **K6.6 Kartenkatalog in den Docs.** `card-types.html` und seine Demos
      zeigen Bausteine statt sechs Kartentypen.

**Abnahme:** Golden-Flows 1, 3, 5 und 6 sowie der Kartenlebenszyklus laufen auf
dem neuen Modell; visuelle Pflichtmatrix für Erstellen, Kartenverwaltung und
Review geprüft.

## Phase 7 — Begraben von Geschwistern

- [ ] **K7.1 Drei Lernoptionen** wie in Anki: neue Geschwister, Review-
      Geschwister und tagesübergreifende Lerngeschwister begraben; Standard für
      alle drei aus; in Lerneinstellungen, Stapeleinstellungen und Lernprofilen.
- [ ] **K7.2 Queue-Regel.** Nach einer Antwort werden Geschwister in der
      gewählten Phase bis zum nächsten Lerntag zurückgestellt, ohne Lernstand
      oder Fälligkeit zu verändern; Reihenfolge der Bevorzugung wie in Anki.
- [ ] **K7.3 Tests** für Tagesgrenze, Zeitsimulator, Unterstapel und
      Limits.

**Abnahme:** Scheduler-Tests grün; ausgeschaltete Optionen ändern das bisherige
Verhalten nachweislich nicht.

## Phase 8 — Gesamtabnahme

- [ ] **K8.1** `npm test`, `gate:push`, `gate:nightly` und
      `performance:measure:local` grün.
- [ ] **K8.2** Vergleich mit der Ausgangsmessung in `history.md`: Speicher, Ladevolumen,
      p95-Werte und Importzeiten.
- [ ] **K8.3** Visuelle Pflichtmatrix für alle Screens, die Karten anzeigen
      oder bearbeiten, mit Screenshots.
- [ ] **K8.4** `specs.md`, `architecture.md`, `status.md`,
      `anki-format-analysis.md`, `test-portfolio.md` und `AGENTS.md`
      beschreiben ausschließlich das neue Modell.

## Planungsstand

Alle Grundsatzfragen dieser Roadmap sind entschieden. Begriffe und das
Entfernen einzelner Abfragen regelt ADR-032; Großstapel-Grenzen,
Korpus-Zielquote und der Bildverdeckungs-Editor sind als Abnahmekriterien in
K5.8, Phase 5 und K6.5 festgelegt. Offen ist nur die Bereitstellung des
Realwelt-Korpus; bis dahin gelten die synthetischen Nachbauten aus K1.4.

## Spätere Roadmaps

Diese Themen sind entschieden oder angedacht, gehören aber nicht zu dieser
Roadmap:

- Native App nach ADR-036: Capacitor, SQLite-Vollreplik, alle Medien auf dem
  Gerät, Store-Veröffentlichung, Push, Login- und Kontolöschungspflichten,
  KI-Route für App-Origins.
- AMBOSS-Tooltips ausschließlich über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
