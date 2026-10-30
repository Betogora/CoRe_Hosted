# CoRe TODO

Stand: 2026-10-30

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## Offene Abnahmen der Kartenmodell-Roadmap

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones; dazu die
      Mindmap-Gesten aus W4c (Doppeltippen, Langdrücken, Zwei-Finger-Zoom,
      Vollbild) auf iOS und Android.
- [ ] **Korpus (Phase 5):** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel: mindestens
      95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## KI-Varianten (Proof of Concept)

Bewusst einfacher Probelauf (ADR-011); Auswahl und Oberfläche werden danach
geglättet.

- [ ] **Einstiege:** Zähler der Karten ohne Variante in den Stapeleinstellungen
      (danach eine einzige Aktion, deren Beschriftung zwischen „generieren“ und
      „neu generieren“ wechselt); nach Fehlschlägen führt `Anzeigen` in der Leiste
      zum Filter „Ohne Variante“; Stoppgründe in der Leiste kurz halten (z. B.
      „Keine Verbindung“).
- [ ] **Visuelle Pflichtmatrix:** Fortschrittsleiste, Einschalt-Dialog,
      Variantenbereich der Stapeleinstellungen und Filter `Ohne Variante`; dazu
      ein E2E-Test der Stapelgenerierung (Route je Aufruf mit anderer Variante
      gemockt).

## Später

- Neue Schemabaseline kurz vor dem ersten externen Release: Die Migrationen ab
  `20261008101057_kartenmodell_baseline.sql` (Stand 2026-10-30: 12 Dateien,
  3.224 Zeilen, davon rund 550 überschriebene Fassungen von
  `get_account_bootstrap`, `get_account_statistics` und
  `list_account_card_study_states`) zu einer Baseline zusammenfassen, damit
  jede Funktion an genau einer Stelle steht. Kein Laufzeitgewinn, nur
  Übersicht; Aufwand etwa 1–2 h. Hosted per `supabase migration repair`
  umstellen, Daten bleiben unberührt. Nachweis: `supabase db diff --linked`
  leer, `verify_schema_v1.sql` lokal und remote grün. Verweise in
  `README.md`, `operations.md` und `status.md` anpassen, offene Branches mit
  Migrationen nachziehen.
- Native App nach ADR-036.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- KI-Kontingent pro Nutzer: Alle Nutzer teilen das Ausgabenlimit des
  OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in Supabase)
  verhindert, dass ein Nutzer es allein aufbraucht. Braucht eine Ergänzung zu
  ADR-011.
- KI-Varianten vorausschauend erzeugen: Heute erzeugt die Stapelaktion des
  Proof of Concept beim Einschalten Varianten für bis zu 50 Karten auf einmal,
  auch für Karten, die noch lange keine Variante zeigen. Künftig erzeugt CoRe
  bei eingeschaltetem CoRe-Modus Varianten gesammelt nur für Karten, die in den
  nächsten Tagen die Haltbarkeitsschwelle des Stapels (7/21/60 Tage) erreichen.
  Auswahl: Karten in der Wiederholung ohne aktive Variante, deren Haltbarkeit
  nach einem `Gut` am Fälligkeitstermin die Schwelle erreicht und die in den
  nächsten N Tagen fällig sind; `createReviewChain` aus `scheduler.ts` rechnet
  das ohne Buchführung je Karte. Erzeugt wird nur im geöffneten Tab, in kleinen
  Portionen, mit der bestehenden Fortschrittsleiste und denselben Fehler- und
  Abbruchregeln; eine Serverqueue entsteht nicht. Voraussetzungen: die offenen
  Punkte des Proof of Concept oben, das KI-Kontingent pro Nutzer und eine
  Ergänzung zu ADR-011 (automatische Erzeugung, Auswahlregel, Tageslimit).
  Verteilt die Kosten über die Tage und verbraucht nichts für ungelernte
  Karten. Nachweis: Test der Auswahl über die Beispielketten, E2E mit
  gemockter Route.
- Persönliche FSRS-Parameteroptimierung: Heute gelten für alle die
  21 FSRS-7-Standardparameter; Abstände passen dadurch nur zum
  Durchschnittsgedächtnis. Der Optimierer `@open-spaced-repetition/binding`
  (WebAssembly, passend zu `ts-fsrs` 6) berechnet in einem Worker aus den
  eigenen Bewertungen, einschließlich importierter Anki-Historie, eigene
  Parameter je Stapelprofil. Übernommen werden sie nur, wenn sie den Verlauf
  messbar besser vorhersagen als die Standardwerte (Log-Loss oder RMSE auf
  zurückgehaltenen Bewertungen) und genug Bewertungen vorliegen (Mindestzahl
  bei der Umsetzung festlegen, Größenordnung einige hundert). Die Parameter
  liegen im Stapelprofil und synchronisieren mit. Weil Haltbarkeit von den
  Parametern abhängt, verschieben sich Reife, Variantenfreigabe,
  Prüfungsprognose und Statistik mit; beim Übernehmen muss deshalb
  `study.extra.maturityBand` aller betroffenen Karten neu berechnet und
  `study_revision` erhöht werden, damit Katalog und andere Geräte
  nachziehen. Fälligkeiten bestehender Karten bleiben bis zur nächsten
  Bewertung unverändert. Oberfläche: Aktion in den Stapeleinstellungen mit
  Vergleich alt/neu und Zurück zu den Standardwerten. Rahmen in ADR-044;
  Ablauf und Mindestzahl dort bei der Umsetzung ergänzen. Nachweis:
  Golden-Test bleibt auf Standardparametern, Tests für Übernahme, Ablehnung
  und Neuberechnung.
- KI-Routen in `npm run dev`: Ein Vite-Plugin bedient `/api/ai/*` lokal statt
  `vercel dev`. Vor dem ersten Release oder wenn weitere Entwickler lokal mit KI
  arbeiten, entscheiden und dann `operations.md` anpassen.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
- Flaggen als Feature: je Karte eine von sieben Farben wie in Anki (importiert
  und synchronisiert bereits als `anki_flag`, bisher unsichtbar). Umfang:
  Flaggenwahl in Lernen und Editor (Strg+1–7), Farbpunkt in der Kartentabelle,
  Filter in der Suche, optional eigene Namen je Farbe; der Konfliktvergleich
  zeigt die Flagge dann zu Recht.
- Login-Wege: Magic Link und Google sind gebaut, aber per Flag aus. Für Magic
  Link braucht es einen eigenen SMTP-Server in Supabase, freigegebene
  Redirect-Adressen (Produktion, Preview), eine deutsche Mailvorlage und
  zusätzlich einen 6-stelligen Code zum Eintippen, weil der Link auf Mobilgeräten
  oft im falschen Browser landet. Google erst nach Entscheidung über den
  OAuth-Prüfprozess und den Datenschutztext; sonst Code und Flag entfernen.
- Prüfungsplanung: semantische Themenzuordnung innerhalb ungegliederter Stapel.
  Heute bilden Unterstapel die Themen; eine spätere Zuordnung braucht
  explizite, prüfbare Themengrenzen und darf Lernstände nicht ändern.
