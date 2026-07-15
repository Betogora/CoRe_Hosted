# CoRe TODO — Produktstabilisierung vor weiterem Ausbau

**Stand:** 2026-07-15
**Zweck:** Offene, priorisierte Arbeit für einen glaubwürdigen und nutzbaren Beta-Kern.
**Ersetzt:** die bisherige Mischung aus Changelog, Testnachweis, Betriebsprotokoll und Roadmap in `docs/todo.md`.

---

## 1. Zielbild

CoRe soll zuerst in fünf Kernabläufen verlässlich, verständlich und konsistent funktionieren:

1. Account öffnen und den Produktzustand verstehen.
2. Einen Stapel importieren oder manuell anlegen.
3. Karten bearbeiten und eine Lernsitzung starten.
4. Karten bewerten, neu laden und ohne Datenverlust fortfahren.
5. Eine CoRe-Variante lernen, ohne sie vorab zu erkennen, und den Ursprung nach der Antwort prüfen.

Neue Plattform-, Community-, KI-, Admin- oder Großdatei-Funktionen werden erst weitergebaut, wenn diese fünf Abläufe das P0-Abnahmegate erfüllen.

---

## 2. Arbeitsregeln

- Diese Datei enthält **nur offene Arbeit**. Abgeschlossene Arbeit und Release-Nachweise gehören in einen Changelog- oder Statusbereich.
- Ein grüner Testlauf ist Evidenz für einen definierten Vertrag, aber kein Ersatz für eine UX-Abnahme.
- Neue Tests müssen einen konkreten Produkt-, Sicherheits- oder Regressionsvertrag schützen. Die Anzahl der Tests ist keine Zielmetrik.
- Keine neue Datenbankmigration, Queue, Providerintegration, Admin-API oder allgemeine Adapterebene ohne expliziten Eintrag in dieser Roadmap.
- Sichtbare Funktionen dürfen nur eines dieser Reifestadien haben:
  - **Core:** für normale Nutzer freigegeben und vollständig erklärt.
  - **Labs:** bewusst experimentell, klar gekennzeichnet und nicht Teil des Kernversprechens.
  - **Disabled:** technisch vorhanden, aber wegen fehlender Betriebs-, Rechts- oder Produktabnahme nicht erreichbar.
- Nicht produktionsreife Funktionen werden zunächst verborgen oder als Labs eingeordnet. Sie werden nicht automatisch produktionsreif gebaut.
- Produktverträge werden vor Architekturumbauten korrigiert.
- Pro Pull Request gilt ein enger fachlicher Scope mit nachvollziehbaren Akzeptanzkriterien.

---

## 3. Empfohlener Produktscope

### Core

- E-Mail-/Passwort-Anmeldung.
- Heute-Dashboard mit verständlichem Leerzustand und klarem Lernstart.
- Stapel importieren: APKG im freigegebenen Größenbereich, Text und CSV/Tabelle.
- Stapel und Karten manuell anlegen, bearbeiten und löschen.
- Lernen mit vier Bewertungen und sichtbaren Intervallvorschauen.
- CoRe-Rephrase-Varianten mit unsichtbarer Herkunft vor der Antwort.
- Original-/Quellenanker nach der Antwort.
- Accountgebundene Speicherung, Autosave, Reload und Konfliktstatus.
- Grundlegende Statistik.
- Einstellungen für Profil, Lernen, Sync und Datenexport.

### Labs

- Chat-your-Deck.
- Lernplan.
- Lokale/deterministische KI-Kartenentwürfe.
- Deck-Graph.
- Lokale Community-Demo.
- Externer Prompt-/JSON-Flow für Varianten.
- AI-Job-Historie.
- Erweiterte APKG-Diagnoseansicht.

### Disabled bis zu einem eigenen Freigabegate

- Serverseitiger APKG-Pfad über 250 MiB.
- Google-Anmeldung, solange Hosted-Konfiguration und manueller Roundtrip nicht abgenommen sind.
- Magic Link, solange Zustellung und Link-Lifecycle nicht hosted abgenommen sind.
- Echte Community-Mitgliedschaften und Freigaberechte.
- Produktive externe Karten-, Varianten- und Graph-Generierung.
- DOCX, OCR und Bildregionen.
- Account-Löschung und Art.-15-Auskunft, solange der serverseitige Workflow fehlt.

---

## 4. Unmittelbar nächste Arbeit

Die nächsten zwei Arbeitspakete werden in dieser Reihenfolge umgesetzt:

1. **P0.3 Account- und Einstellungsoberfläche wahrheitsgemäß machen.**
2. **P0.4 Ersten Produktkontakt und leeren Account korrigieren.**

Erst danach folgen Onboarding, Erstellen/Import und Informationsarchitektur.

---

# P0 — Produktwahrheit und Kern-UX

## P0.3 Account und Einstellungen wahrheitsgemäß machen

### Aufgabe

- [ ] Die Login-E-Mail in den Einstellungen als nicht editierbaren Accountwert darstellen, solange keine echte Auth-E-Mail-Änderung implementiert ist.
- [ ] No-op-Datenschutzschalter für Lernstand, Online-Status und fremde Streaks ausblenden.
- [ ] Stattdessen den realen Zustand erklären: persönliche Lernstände werden derzeit nicht geteilt.
- [ ] Syncstatus, Offlinezustand und Konflikte in verständlicher Sprache anzeigen; interne Revisionen und Tabellenbegriffe nicht zeigen.
- [ ] JSON-Portabilität in einen Bereich `Erweitert` verschieben und Grenzen deutlich nennen:
  - keine Medienbytes,
  - keine Authdaten,
  - keine serverseitigen Rechte,
  - kein vollständiges Art.-15-Auskunftspaket.
- [ ] Export als Datei-Download anbieten; das rohe JSON-Textfeld nur als optionale Diagnoseansicht behalten.
- [ ] Destruktive oder sicherheitskritische Aktionen klar von Profil- und Lernoptionen trennen.

### Akzeptanz

- Kein editierbares Feld suggeriert eine Accountänderung, die nicht durchgeführt wird.
- Kein Datenschutzschalter suggeriert eine Wirkung, die nicht technisch durchgesetzt wird.
- Nutzer können den aktuellen Synczustand ohne technische Vorkenntnisse verstehen.
- Exportgrenzen stehen vor dem Download sichtbar fest.
- Einstellungen sind in die Bereiche `Account`, `Lernen`, `Daten und Sync` sowie `Erweitert` gegliedert.

### Evidenz

- Komponententests für sichtbare/verborgene Authmethoden.
- E2E für Profiländerung, Offline-Pending, Reconnect und Exportdownload.
- Manuelle Tastatur- und Screenreader-Prüfung.

---

## P0.4 Erster Produktkontakt und leerer Account

Implementierung und automatisierte Golden-Evidenz sind in `docs/specs.md` dokumentiert.

### Verbleibende Evidenz

- [ ] Kurzer moderierter Test mit mindestens drei Personen vor Abschluss des P0-Gates.

---

## P0.5 Erstellen und Import vereinfachen

### Aufgabe

Implementierung und automatisierte Evidenz für kompakte Core-/Labs-Einstiege, lesbare Quellformate, den lokalen Entwurfsassistenten, progressive APKG-Offenlegung, eindeutige Status- und Fehleraktionen sowie `Jetzt lernen`/`Karten prüfen` sind in `docs/specs.md` dokumentiert.

### Verbleibende Aufgabe

- [ ] Nach erfolgreichem Import zusätzlich `Zur Bibliothek` anbieten.
- [ ] Manuelles Speichern eindeutig bestätigen und Fokus für die nächste Karte sinnvoll setzen.
- [ ] Unsaved-Changes-Verhalten beim Wechsel der Erstellungsart festlegen.

### Akzeptanz

- Der Standardimport ist ohne Kenntnis von Anki-Interna verständlich.
- Lokale Simulation wird nicht als kostenabhängige externe KI ausgegeben.
- Nicht unterstützte Dateitypen können nicht versehentlich ausgewählt werden.
- Ein erfolgreicher Import endet in einem konkreten Nutzerziel.
- Die technische Diagnose bleibt erreichbar, dominiert aber nicht den Hauptflow.

### Evidenz

- [ ] Fehlerflows für Netzwerkfehler und nicht lesbare PDF ergänzen.

---

## P0.6 Lernen, Bibliothek und Stapelverwaltung entflechten

### Produktentscheidung

Empfohlener Vertrag:

- `Lernen` ist der schnelle Einstieg in eine Sitzung.
- `Kartenstapel` ist die Verwaltung für Struktur, Karten und erweiterte Optionen.
- Ein Klick auf eine Lernzeile startet immer Lernen.
- Strukturänderungen erfolgen nicht über eine unsichtbare Drag-Geste auf derselben Zeile.

Implementierung und automatisierte Evidenz für den dragfreien Lernstart, explizites und bestaetigtes Verschieben, die reduzierte Stapelanlage, nachgelagerte Darstellungseinstellungen, Labs-Werkzeuge und den auditierbaren Version-Restore sind in `docs/specs.md` dokumentiert.

### Verbleibende Evidenz

- [ ] Moderierter Test mit mindestens drei Personen.

---

## P0.7 Konsistenz, Accessibility und Fehlerzustände

### Aufgabe

- [ ] Zentrale Layout-, Typografie-, Farb-, Radius-, Spacing- und Surface-Tokens definieren.
- [ ] Harte Farbwerte und freie Tailwind-Werte in den P0-Screens schrittweise auf Tokens umstellen.
- [ ] Primär-, Sekundär-, Destruktiv- und Linkaktionen konsistent definieren.
- [ ] Fokuszustände, Fokusreihenfolge und Fokuswiederherstellung für Dialoge, Overlays und Lazy-Screens prüfen.
- [ ] Screenreader-Status nur für relevante Änderungen verwenden; wiederholte Statusmeldungen vermeiden.
- [ ] Kontraste und Zustände nicht ausschließlich über Farbe vermitteln.
- [ ] Leere, ladende, offline, fehlerhafte und teilweise erfolgreiche Zustände pro Kernscreen definieren.
- [ ] Lange Inhalte, große Schrift, Browserzoom und 1280 × 720 prüfen.
- [ ] Bewegungen auf `prefers-reduced-motion` abstimmen.
- [ ] Deutsche UI-Texte vereinheitlichen; technische Anglizismen nur verwenden, wenn fachlich notwendig.

### Akzeptanz

- Kernflows sind vollständig per Tastatur nutzbar.
- Kein wichtiger Status ist nur farblich erkennbar.
- Bei 200 % Zoom bleibt der Kernflow ohne horizontales Hauptscrolling bedienbar.
- Jeder asynchrone Kernflow hat Lade-, Fehler-, Retry- und Erfolgszustand.
- Dieselbe Aktion hat in verschiedenen Screens dieselbe visuelle und sprachliche Bedeutung.

### Evidenz

- Accessibility-Checkliste pro Kernscreen.
- Automatisierte Rollen-/Label-Smokes.
- Manuelle Prüfung mit Tastatur und Screenreader.
- Screenshots der Zielviewports.

---

## P0.8 Produktabnahme statt reiner Testabnahme

### Aufgabe

- [ ] Eine `Core Journey Matrix` anlegen, die pro Kernablauf festhält:
  - Nutzerziel,
  - Startzustand,
  - erwartete Schritte,
  - Fehlerpfade,
  - Datenwirkung,
  - UX-Abnahme,
  - automatisierte Evidenz.
- [ ] Für jede Journey einen verantwortlichen Produktvertrag definieren.
- [ ] Mindestens drei moderierte Tests mit Personen aus den Zielgruppen durchführen.
- [ ] Beobachtete Probleme nach Schwere klassifizieren:
  - Blocker,
  - hoher Reibungsverlust,
  - Verständnishürde,
  - kosmetisch.
- [ ] P0 nur schließen, wenn keine Blocker und keine ungeklärten hohen Reibungsverluste verbleiben.
- [ ] Testanzahl nicht als Abnahmekriterium verwenden.

### P0-Abnahmegate

P0 ist abgeschlossen, wenn:

- [ ] Alle fünf Kernabläufe bestehen automatisiert und manuell.
- [ ] Vor dem Reveal ist eine Variante nicht erkennbar.
- [ ] Keine normale Oberfläche verspricht lokale Demo-Logik als echte Community oder KI.
- [ ] Keine sichtbare Einstellung ist wirkungslos.
- [ ] Neuer Account, kleiner Import, manuelle Erstellung, Review und Reload sind ohne Entwicklerwissen bedienbar.
- [ ] Zielviewports und Tastaturnutzung sind abgenommen.
- [ ] Offene P0-Befunde sind dokumentiert und priorisiert.

---

# P1 — Architektur und Tests nach dem Produktvertrag vereinfachen

## P1.1 App-Shell verkleinern und typisieren

### Aufgabe

- [ ] `App.tsx` nach dem stabilen P0-Vertrag in fokussierte Verantwortungen aufteilen:
  - Auth-/Account-Boot,
  - Navigation,
  - Workspace-Kommandos,
  - Sync-Lifecycle,
  - Medien-Lifecycle,
  - Screen-Komposition.
- [ ] Keine neue generische Controller- oder Adapterhierarchie einführen.
- [ ] `React.ComponentType<any>` bei Lazy-Screens durch konkrete Props-Verträge ersetzen.
- [ ] Explizite `any`-Typen in `App.tsx` und den P0-Screens entfernen.
- [ ] Fehler- und Statusformen als Discriminated Unions modellieren.
- [ ] Seiteneffekte so kapseln, dass Accountwechsel und Cleanup nachvollziehbar bleiben.
- [ ] Verhalten nicht parallel refaktorieren und neu gestalten.

### Akzeptanz

- `App.tsx` enthält hauptsächlich Komposition und Route-Auswahl.
- Screen-Props sind typisiert.
- Keine neue öffentliche Daten- oder Providernaht entsteht.
- Auth, Sync, Media und Navigation behalten ihre vorhandenen fachlichen Modulgrenzen.
- Kern-E2E bleibt unverändert grün.

---

## P1.2 Große Screens zerlegen

### Aufgabe

- [ ] `CreationScreen.tsx` in klar benannte Screen-Unterbereiche zerlegen:
  - Auswahl,
  - manuelle Erstellung,
  - Import,
  - APKG-Vorschau,
  - Labs-Entwürfe.
- [ ] `LearnScreen.tsx` in Lernliste, Stapelanlage und Zeile aufteilen.
- [ ] `DecksScreen.tsx` in Bibliotheksliste, Kartendetail, Versionen und Labs-Variantenwerkzeuge aufteilen.
- [ ] `StudyMode.tsx` in Sessionkopf, Karte, Antwortanker, Feedback und Ratingbar aufteilen.
- [ ] Geteilte Darstellung nach `src/ui/`, Domänenverhalten nicht in UI-Helfer verschieben.
- [ ] Pro Untermodul eine enge Props-Schnittstelle verwenden.

### Akzeptanz

- Kein zerlegtes Modul dupliziert Import-, Scheduler-, Medien- oder Persistenzlogik.
- Änderungen an einem Unterflow erfordern nicht mehr das Lesen des gesamten Screens.
- Testselektoren und Nutzerverhalten bleiben stabil.
- Die Zerlegung reduziert sichtbare Komplexität, ohne Wrapperketten aufzubauen.

---

## P1.4 Dokumentation nach Rollen trennen

### Aufgabe

- [ ] Abgeschlossene Einträge aus `docs/todo.md` in einen datierten Verlauf verschieben.
- [ ] Die kanonische Spezifikation nach Dokumentrollen neu ordnen:
  - Produkt und Kernjourneys,
  - aktuelle Architektur und Invarianten,
  - aktueller Implementierungsstatus,
  - Betriebsrunbooks,
  - Entscheidungen/ADRs,
  - Releaseverlauf.
- [ ] Datierten Implementierungsjournal-Text und einzelne Releaseprotokolle aus der Produktanforderung auslagern.
- [ ] Geplante API-Beispiele klar als `geplant` kennzeichnen; implementierte Endpunkte separat listen.
- [ ] Zielmodell und heutiges Compatibility-Modell deutlich trennen.
- [ ] Keine zweite konkurrierende Wahrheit erzeugen.

### Akzeptanz

- Ein neuer Entwickler findet Produktvertrag, Ist-Stand, Architektur und Betrieb ohne Volltextsuche durch ein mehrere tausend Zeilen langes Dokument.
- TODO enthält keine abgeschlossenen Testzählungen.
- Releasebelege stehen nicht im Kernproduktvertrag.
- Entscheidungen haben Datum, Status, Kontext und Konsequenz.
- Alle alten Links werden weitergeleitet oder aktualisiert.

---

## P1.5 Bewusster Rückbau nach Produktentscheidung

### Aufgabe

- [ ] Für jedes Labs-Feature eine Entscheidung treffen: `graduieren`, `weiter als Labs`, `entfernen`.
- [ ] Versteckte AI-Job-Oberfläche sichtbar begründen oder entfernen.
- [ ] Alte lokale Authlogik entfernen, falls kein echter Offline-Login geplant ist.
- [ ] Externen Prompt-/JSON-Variantenflow entfernen, falls direkte Generierung später denselben Zweck abdeckt.
- [ ] Demo-Seed nur noch über explizite Demoaktion oder Entwicklungsmodus bereitstellen.
- [ ] Toten Code, ungenutzte Zustände und Tests zusammen entfernen.
- [ ] Rückbau nicht mit neuen Ersatzfeatures kombinieren.

### Akzeptanz

- Jedes verbleibende sichtbare Feature hat Nutzerzweck, Reifestatus und Owner.
- Kein versteckter Screen muss ohne Produktzweck weiter gepflegt werden.
- Entfernte Features hinterlassen keine verwaisten Daten- oder Routingpfade.
- Rückbauentscheidungen sind als ADR dokumentiert.

---

# P2 — Minimaler Beta-Betrieb

P2 beginnt erst nach bestandenem P0-Gate.

## P2.1 Hosted Auth auf den freigegebenen Kern begrenzen

- [ ] E-Mail-/Passwort-Registrierung, Bestätigung, Recovery und erneuter Login hosted abnehmen.
- [ ] SMTP-Zustellung und Templates secretsfrei prüfen.
- [ ] Leaked-Password-Protection nach verfügbarer Tarif-/Projektfreigabe aktivieren.
- [ ] Google und Magic Link separat abnehmen oder weiterhin deaktiviert lassen.
- [ ] Kein Beta-Blocker aus nicht freigegebenen optionalen Authmethoden machen.

## P2.2 Account-Lifecycle

- [ ] Portabilitätsexport serverseitig und verständlich vom Art.-15-Auskunftspaket trennen.
- [ ] Reauth-Tickets für Export und Löschung implementieren.
- [ ] Account-Löschung idempotent über Storage, Exportpayloads, Produktdaten und Auth-Nutzer ausführen.
- [ ] Teilerfolge, Retry und Auditnachweis testen.
- [ ] UI mit klarer Warnung und Statusverfolgung ergänzen.

## P2.3 Monitoring und Wiederherstellung

- [ ] Minimalen Betriebsüberblick für Vercel, Supabase Auth/DB/Storage und KI-Route definieren.
- [ ] Fehlerbudgets und Alarmgrenzen nur für Kernflows festlegen.
- [ ] DB-Restore und Storage-Restore getrennt in einem Testprojekt prüfen.
- [ ] Release- und Rollback-Runbook außerhalb der Produktspezifikation pflegen.
- [ ] Einen dokumentierten Supportweg für Datenverlust-, Login- und Sync-Probleme schaffen.

## P2.4 Storage-Hygiene

- [ ] Read-only Orphan-Report für DB-Referenzen und Storage-Objekte bauen.
- [ ] Löschung erst nach Dry-Run, Aufbewahrungsfenster und expliziter Adminfreigabe erlauben.
- [ ] Fehlende Objekte und verwaiste Objekte getrennt behandeln.
- [ ] Kernimport darf nicht von einem umfassenden Admin-Dashboard abhängen.

## P2.5 Großdatei-Pfad nur bei nachgewiesenem Bedarf

- [ ] Nutzungsbedarf für APKG-Dateien über 250 MiB erheben.
- [ ] Hosted-Ressourcen, Region, Verträge und reale Speicher-/Laufzeitmessung abnehmen.
- [ ] 1-GiB-Pfad nur freigeben, wenn Nutzen, Kosten und Supportaufwand vertretbar sind.
- [ ] Andernfalls den vorhandenen Pfad deaktiviert lassen und einen verständlichen Grenzhinweis anzeigen.

---

# P3 — Feature-Graduation

Ein Labs-Feature darf nur in Core wechseln, wenn alle Punkte erfüllt sind:

- [ ] Konkretes Nutzerproblem und Zielgruppe dokumentiert.
- [ ] Mindestens drei qualitative Nutzertests durchgeführt.
- [ ] Erfolgskriterium und Kill-Kriterium definiert.
- [ ] Daten-, Rechte-, Datenschutz- und Fehlervertrag vollständig.
- [ ] Hosted-End-to-End-Pfad vorhanden.
- [ ] Kern- und Fehlerflows zugänglich.
- [ ] Betrieb, Kosten und Supportaufwand bekannt.
- [ ] Produkt-, Contract- und E2E-Tests vorhanden.
- [ ] Dokumentation und Reifestatus aktualisiert.

### Kandidaten

- [ ] Community.
- [ ] Deck-Graph.
- [ ] Externe KI-Kartenerstellung.
- [ ] Externe Variantengenerierung.
- [ ] Lernplan.
- [ ] AI-Job-Historie.
- [ ] DOCX/OCR/Bildregionen.
- [ ] PWA/Offline-Kaltstart.
- [ ] Push-Benachrichtigungen.
- [ ] Großdatei-APKG.

---

# Geparkt

Diese Themen werden nicht bearbeitet, solange kein explizites Produktproblem sie aktiviert:

- Öffentliche Community und Rankings.
- Fremde Lernstände oder soziale Leistungsmetriken.
- Generische Backend-, Auth- oder LLM-Adapter.
- Mehrere KI-Provider.
- Vollständiges Admin-Portal.
- Zahlungen und Abonnements.
- Native Apps.
- Öffentliche Deck-Marktplätze.
- KI-Bildvariation.
- Breiter OCR-/Dokumenten-Worker.
- Rust/WASM ohne gemessenen Hotspot.

---

## Nachweisformat pro abgeschlossenem Arbeitspaket

```text
Paket:
Produktvertrag:
Geänderte sichtbare Abläufe:
Bewusst nicht geändert:
Automatisierte Evidenz:
Manuelle UX-Abnahme:
Zielviewports:
Accessibility:
Offene Risiken:
Dokumentationsänderung:
Entscheidung/ADR:
```
