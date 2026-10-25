# CoRe TODO

Stand: 2026-10-24

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## P0: Prüfungen (K0–K8)

Reihenfolge = Priorität. Vereint den Klausurplaner aus PR #42
(`codex/klausurplaner-fsrs-kontakte`, FSRS-Kontaktverteilung, Profilformat V2)
mit dem Prüfungen-Stand auf main; am Ende liegt alles auf main. Kein Scope
Creep: Neues nur, wenn es eine Entscheidung unten verlangt.
Entscheidungen vom 2026-10-24:

- E1 Unrealistische Tagesmengen bleiben speicherbar, ab einer klaren Schwelle
  erscheint ein Hinweis in Vorschau und Tag.
- E2 Priorität und Lernziel-Frage entfallen; Feld entfernen, ADR-042 ergänzen.
- E3 Gemeinsame Stapel mehrerer Klausuren werden gemeinsam geplant: jede Karte
  genau einmal eingeführt, spätestens zum frühesten Stichtag; die Tageslast
  aller Klausuren wird zusammen ausgeglichen.
- E4 Zeitblöcke ohne Fach sind reine Kalendernotizen ohne Einfluss auf die
  Kartenverteilung; Blöcke mit Fach steuern die Lernzeit ihres Fachs (in K2
  revidiert).
- E5 Speichern wird nie blockiert; nicht mehr einplanbarer Stoff erscheint als
  offen.
- E6 Cutover auf das neue Profilformat ohne Umrechnungscode in der App;
  vorhandene Pläne rechnet einmalig eine Datenbank-Migration um. Offene Tabs
  alter Versionen laden nach dem Deploy neu.
- E7 Eine verpasste Leseaufgabe bleibt sichtbar, bis sie abgehakt oder das
  Thema abgeschlossen ist.
- E8 Kein Migrationshinweis (entfällt mit E6).
- E9 Seite und Heute-Widget teilen eine Planung; keine Doppelberechnung.
- E10 Tagesaufgaben speichern Kartenverweise schlank und begrenzt im Profil.
- E11 Quiz-Planung (Blöcke, Empfehlungen, gesperrte Aktion) wird samt Code
  entfernt und kommt mit einem eigenen Quiz-Feature später zurück.
- E12 Offline zeigt die zuletzt geplanten Tagesziele und den Kalender und
  startet die heutige Einheit aus lokal vorhandenen Zielkarten; fehlende
  Karten erscheinen als „erst online verfügbar“. Ohne lokalen Stand gilt die
  allgemeine Offline-Meldung. Neu geplant wird nur online.
- E13 Ein gewählter Oberstapel bleibt als Ganzes ausgewählt; neue Unterstapel
  gehören automatisch dazu, nur ausdrücklich abgewählte bleiben draußen.
- E14 Die Themenreihenfolge bestimmt den Ablauf; „Ab Datum“ heißt „frühestens
  ab“ und schiebt spätere Themen mit. Der Kalender zeigt immer den
  tatsächlichen Start; der Datumswähler bietet keinen Tag vor dem Start des
  vorherigen Themas.
- E15 Abgehakte Lernaufgaben bleiben startbar; das Häkchen bleibt.
- E16 Prüfungen gelten ab dem Tag nach dem Termin automatisch als
  abgeschlossen und zeigen ihren letzten Lernstand; wieder öffnen über ein
  neues Datum.

K0–K6 sind erledigt, Details in [`history.md`](history.md). Aus K6 offen: `npm run performance:measure:local` mit Docker nachholen.

- [ ] **K7 UI/UX iterativ:** visuelle Pflichtmatrix aller Prüfungsansichten
      mit Top-Bar; Ziehen der Themenfolge scrollt ab 1280 px den
      Inhaltsbereich; Wochenkalender per Touch; Hinweis aus E1; schlanke
      Oberfläche ohne Erklärtexte; ganze Minuten statt Kommawerten,
      einheitliche Zeiteinheit in Editor und Kalender; Tagesausnahme nicht
      durch Blöcke anderer Fächer gesperrt; ein Bearbeitungshorizont für Tag
      und Woche; „In 1 Tagen“; ungespeicherte Bearbeitung auch beim Wechsel
      über die Hauptnavigation schützen; Iteration mit Screenshots.
- [ ] **K8 App-Anbindung und Abnahme:** E12; Prüfungssitzung in Hilfe
      erklären; E2E gegen die echte App statt Katalog-Demo, lokales Supabase
      mit zwei Browserkontexten desselben Kontos; Unit-Tests für
      `balanceExamContacts` (Mengenerhaltung, Zielreihenfolge, Abbruch),
      `ratingAt` mit Bewertungshistorie und gemeinsame Planung (E3);
      `history.md` und Abschluss dieses Blocks.

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

## Betrieb

- [ ] **Hosted-Smoke nach den Migrationen vom 2026-10-10:** `npm run test:beta:hosted`
      mit dem dedizierten Testaccount gegen `https://core-hosted.vercel.app`.

## Später

- Native App nach ADR-036.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- KI-Kontingent pro Nutzer: Alle Nutzer teilen das Ausgabenlimit des
  OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in Supabase)
  verhindert, dass ein Nutzer es allein aufbraucht. Braucht eine Ergänzung zu
  ADR-011.
- KI-Varianten vorausschauend erzeugen: Bei eingeschaltetem CoRe-Modus erzeugt
  CoRe Varianten im Hintergrund und gesammelt für die Karten, die in den nächsten
  Tagen die Lernstufe des Stapels erreichen, statt beim Einschalten den ganzen
  Stapel zu bearbeiten. Verteilt die Last über die Tage und
  verbraucht nichts für ungelernte Karten. Löst die Stapelaktion des
  Proof of Concept automatisch aus. Braucht eine Ergänzung zu ADR-011.
- KI-Routen in `npm run dev`: `fitzbert` bedient `/api/ai/*` lokal per
  Vite-Plugin statt über `vercel dev`. Vor dem ersten Release oder wenn weitere
  Entwickler lokal mit KI arbeiten, entscheiden und dann `operations.md`
  anpassen.
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

## Prüfungsplanung: verbleibende Themenanbindung

- [ ] Semantische Themenzuordnung innerhalb ungegliederter Stapel entwerfen. Aktuell bilden Unterstapel die Themen; eine spätere Zuordnung braucht explizite, prüfbare Themengrenzen und darf Lernstände nicht ändern.
