# CoRe TODO

Stand: 2026-10-15

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## P0: Zusammenfassungen und Mindmaps (W4–W8)

Reihenfolge = Priorität. W0–W4c sind erledigt (gemeinsame KI-Routen, Luna mit
ZDR, strukturierte Zusammenfassung, Mindmap daraus erzeugen, ersetzen und
sauber übersetzen).
Entscheidungen vom 2026-10-15: Zonen ohne Umwandlung entfernen (E1), Verknüpfen
per Enter/Leertaste (E2), Kopieren/Einfügen jetzt (E3), eigener Bildspeicher
(E4), `Neu erzeugen` ersetzt die Fassung (E5).

- [ ] **W5 Mindmap-Bilder auslagern**
      - Eigener Store `images` in der Mindmap-Datenbank (Version 2): Blob statt
        Base64, Schlüssel SHA-1, Karten speichern nur Bild-IDs, Anzeige über
        Objekt-URLs mit Freigabe.
      - Beim Einlesen auf höchstens 1600 px verkleinern (JPEG/WebP, Qualität
        0,85); höchstens 4 Bilder je Karte, etwa 100 Bilder beziehungsweise
        50 MB je Map mit klarer Meldung.
      - Vorhandene Data-URLs beim ersten Öffnen in einer Transaktion migrieren.
      - Nachweis: Unit-Tests für Store, Migration und Grenzen; Messung der
        Speicherdauer einer Map mit Bildern vorher/nachher.
- [ ] **W6 Zusammenfassungen und Map verwalten**
      - Zusammenfassung löschen (Bestätigung) und duplizieren (`Kopie von …`).
      - Mindmap: `Fläche leeren` mit Bestätigung, rückgängig machbar.
- [ ] **W7 Testsuite**
      - E2E gegen die echte App mit gemockter `/api/ai/summary`: Tabs per URL,
        Entwurfsschutz bei Tab-, Bereichswechsel und Reload, Kontobindung,
        Erzeugen → Bearbeiten → Dialog beim Neu-Erzeugen, Abbruch beim Laden.
      - Kaltstart: globales Warm-up der Katalogseite, 90-s-Timeout auch für
        `learning-summaries.spec.ts`.
      - Prüfungen auf fehlende Elemente mit der Spec-Kürzung bereinigen,
        Testnamen nach Verhalten statt Iterationsgeschichte.
      - Autospeichern der Mindmap als testbarer Helfer mit Unit-Test für
        „Änderung während laufender Speicherung“.
- [ ] **W8 Zusammenfassungen und Mindmaps online ablegen** (Entscheidung
      2026-10-12). Heute nur lokal je Browser: Inkognito, anderes Gerät oder
      gelöschte Browserdaten zeigen leere Tabs.
      - Tabellen `learning_summaries` und `learning_mind_maps` (eine Zeile je
        Stapel): `id`, `owner_id`, `deck_id`, `document jsonb`, `revision`,
        `updated_at`, `deleted_at`; RLS je Besitzer wie bei Stapeln; Migration
        und Verify-SQL.
      - Dokument als versioniertes JSONB, Validierung in der App; spätere
        Formatänderungen brauchen keine Datenbankmigration.
      - Sync je Dokument: IndexedDB bleibt Cache und Offline-Warteschlange;
        Speichern mit Revisionsprüfung, Öffnen holt den neuesten Stand; bei
        Konflikt gewinnt die zuletzt gespeicherte Fassung mit sichtbarem Hinweis.
      - Cutover je Dokumentart per eigenem Schalter, unabhängig vom
        Stapel-Cutover; beim ersten Online-Öffnen lokale Dokumente einmalig
        hochladen.
      - Reihenfolge: Zusammenfassungen können vorgezogen werden; Mindmaps erst
        nach W5 (Bilder später in Supabase Storage, nicht im JSONB).
      - Nachweis: `npm run test:rls:local`, `npm run db:types:check`,
        E2E mit zwei Browserkontexten desselben Kontos.

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
