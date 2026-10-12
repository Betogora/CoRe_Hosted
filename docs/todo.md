# CoRe TODO

Stand: 2026-10-10

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## Offene Abnahmen der Kartenmodell-Roadmap

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones.
- [ ] **Korpus (Phase 5):** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel: mindestens
      95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## KI-Varianten (Proof of Concept)

Bewusst einfacher Probelauf; Auswahl und Oberfläche werden danach
geglättet. Braucht eine Ergänzung zu ADR-011.

- [ ] **Stapelaktion (Logik):** Eine Aktion erzeugt Varianten für die ersten 50
      Karten eines Stapels ohne aktive Variante, in Stapelreihenfolge; die Grenze
      zählt Anfragen, nicht Karten. Die App arbeitet im offenen Tab nacheinander,
      mit Abbruch; jede Variante wird sofort gespeichert. Eine weitere Aktion
      bearbeitet die nächsten 50.
- [ ] **Fortschritt:** Eine app-weite Aufgabenleiste zeigt Stapel, Stand und
      Abbrechen, auch beim Seitenwechsel; am Ende Toast bei vollem Erfolg, sonst
      eine stehende Meldung mit übersprungenen Karten und Gründen.
- [ ] **Einstiege:** Dialog beim Einschalten des CoRe-Modus mit Option zum
      Erzeugen; Knopf mit Zähler in den Stapeleinstellungen und in der
      Kartenverwaltung; der Einzelknopf im Editor bleibt.
- [ ] **Kennzeichnung:** Variantenzahl und Filter „ohne Variante“ in der
      Kartentabelle, Ausschalten und Löschen im Editor, Abzeichen „KI-Variante“
      im Lernen erst nach dem Aufdecken.

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
