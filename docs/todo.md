# CoRe TODO

Stand: 2026-10-12

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## Release-Gate (`npm run test:e2e:local`)

Lauf vom 2026-10-12 (6e47284): 107 bestanden, 3 fehlgeschlagen.

- [ ] **Cloze-Erstellung:** Nach `Originalkarte speichern` einer Lückentext-Karte
      fragt `Fertig` „Ungespeicherten Entwurf verwerfen?“, obwohl das Formular
      leer ist (`card-lifecycle.spec.ts`, Cloze-Lebenszyklus). Verdacht: 0bba802
      (Editorfokus in `RichTextEditor.tsx`). Ursache im Produktcode beheben.
- [ ] **Speicherfehler-Alert:** Seit f5c4e12 meldet `SettingsSaveBar` Fehler als
      `alert`; ein leerer Stapelname erzeugt dadurch zwei Alerts
      (`world-capitals-hierarchy.spec.ts`, Stapel-Darstellungsformular). Klären, ob
      eine Validierungsablehnung als „Speichern fehlgeschlagen“ gelten soll, dann
      Verhalten oder Test angleichen.
- [ ] **Boot-Fetch im Test:** Ein einmaliger Supabase-`Failed to fetch` beim Start
      ließ `core-stabilization.spec.ts` (Lerneinstellungen bei 768 px) scheitern;
      ein anderer Test filtert diesen Fehler bereits. Behandlung in der App prüfen,
      dann gemeinsam filtern. Der Kaltstart von Vite ließ einmalig `auth.setup.ts`
      scheitern (Lernen-Bereich nach 8 s noch nicht geladen).

## Offene Abnahmen der Kartenmodell-Roadmap

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones.
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
- KI-Wissenswerkzeug (Zusammenfassung, Mindmap): eigenes Werkzeug neben den
  Varianten, das viele Karten zu einem neuen Dokument verdichtet; teilt nur das
  Fundament (Klartextprojektion, Modellwahl, Limits, Logzeile). Ablageort des
  Dokuments ist offen.
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
