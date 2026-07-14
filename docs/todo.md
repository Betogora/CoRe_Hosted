# CoRe TODO — Produktstabilisierung vor weiterem Ausbau

**Stand:** 2026-07-14
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

Die nächsten drei Arbeitspakete werden in dieser Reihenfolge umgesetzt:

1. **P0.1 Produktoberfläche und Feature-Reife wahrheitsgemäß machen.**
2. **P0.2 Review-/Variantenvertrag korrigieren.**
3. **P0.3 Account- und Einstellungsoberfläche wahrheitsgemäß machen.**

Erst danach folgen Onboarding, Erstellen/Import und Informationsarchitektur.

---

# P0 — Produktwahrheit und Kern-UX

## P0.1 Produktoberfläche und Feature-Reife

### Aufgabe

- [ ] Eine kleine typisierte Produktflächen-Registry einführen, die jede sichtbare Fläche als `core`, `labs` oder `disabled` klassifiziert.
- [ ] Hauptnavigation auf den freigegebenen Kern reduzieren: `Heute`, `Lernen`, `Erstellen`, `Statistik`.
- [ ] `Graph` und `Community` aus der normalen Hauptnavigation entfernen und unter einen expliziten Labs-Einstieg legen oder standardmäßig verbergen.
- [ ] `Assistent`, Lernplan, AI-Job-Historie und externe Varianten-JSON-Funktion ausschließlich als Labs behandeln.
- [ ] Serverseitigen APKG-Import über 250 MiB nur anzeigen, wenn seine freigegebene Runtime-Konfiguration explizit aktiv ist.
- [ ] Google und Magic Link nur anzeigen, wenn die jeweilige Funktion für die aktuelle Umgebung freigegeben ist.
- [ ] Für Labs eine kurze, sachliche Kennzeichnung anzeigen: experimentell, möglicher Funktionsumfang, bekannte Grenze.
- [ ] Es darf keinen sichtbaren Button geben, dessen Wirkung nur lokal simuliert wird, während die Oberfläche eine echte Mehrnutzer- oder KI-Funktion verspricht.

### Akzeptanz

- Ein normaler neuer Nutzer sieht keine Community-, Graph-, Großdatei- oder Providerfunktion als fertiges Kernprodukt.
- Die Kernnavigation enthält höchstens vier primäre Produktbereiche plus Einstellungen.
- Entwicklungs- und E2E-Zugriffe auf Labs bleiben möglich, ohne die normale Nutzeroberfläche zu überladen.
- Die Registry ist die einzige Quelle für Sichtbarkeit und Reifestatus; Screens implementieren keine eigenen verstreuten Umgebungsentscheidungen.
- Keine Domänen- oder Datenmigration ist für dieses Paket erforderlich.

### Evidenz

- Fokussierte Tests der Registry und Navigation.
- Ein Browser-Smoke für Core-Modus.
- Ein Browser-Smoke für bewusst aktivierten Labs-Modus.
- Screenshots bei 1440 × 900 und 1280 × 720.

---

## P0.2 Review- und Variantenvertrag korrigieren

### Aufgabe

- [ ] Vor dem Aufdecken sämtliche Hinweise entfernen, ob die aktuelle Abfrage Original oder Variante ist.
- [ ] Vor dem Aufdecken weder Variantenlevel, Reifegrad, Schedulername noch interne Zustandsdaten anzeigen.
- [ ] Nach dem Aufdecken genau einen verständlichen Ursprungseinstieg anbieten.
- [ ] Doppelte Original-/Ankerdarstellungen zusammenführen.
- [ ] Technische Begriffe wie `fsrs_v1`, `variantLevel`, `generationSource`, `Stability` und `Difficulty` aus dem normalen Lernmodus entfernen.
- [ ] Variantenfeedback nach der Antwort auf klare Nutzeraktionen begrenzen:
  - `Nicht mehr zeigen`
  - `Inhaltlich falsch`
  - `Unklar formuliert`
  - `Original anzeigen`
- [ ] Das Ende einer Lernsitzung als Abschlusszustand mit Anzahl bearbeiteter Karten und Rückkehraktion anzeigen; nicht kommentarlos aus dem Lernmodus springen.
- [ ] Fokusführung und Tastaturablauf prüfen: Frage → Antwort anzeigen → Bewertungsbuttons → nächste Karte.
- [ ] Bestehende Tests ändern, die eine sichtbare Variantenkennzeichnung vor der Antwort erwarten.

### Akzeptanz

- Vor der Antwort ist im DOM und sichtbaren Text nicht erkennbar, ob eine Variante gezeigt wird.
- Nach der Antwort sind Frage und Antwort gleichzeitig sichtbar.
- Der Originalanker ist erst nach der Antwort erreichbar und erscheint nicht doppelt.
- Alle vier Ratings funktionieren per Maus und Tastatur.
- Eine gemeldete oder deaktivierte Variante wird nachvollziehbar gespeichert.
- Der Browserflow schützt ausdrücklich die Abwesenheit von Variantenhinweisen vor dem Reveal.

### Evidenz

- Fokussierte Tests für `StudyMode`, Review-Service und Variantenfeedback.
- Ein Golden-E2E für Originalkarte.
- Ein Golden-E2E für Variante einschließlich Anker und Feedback.
- Manuelle Abnahme bei langen Texten, Medienkarte, Cloze und Multiple Choice.

---

## P0.3 Account und Einstellungen wahrheitsgemäß machen

### Aufgabe

- [ ] Die Login-E-Mail in den Einstellungen als nicht editierbaren Accountwert darstellen, solange keine echte Auth-E-Mail-Änderung implementiert ist.
- [ ] No-op-Datenschutzschalter für Lernstand, Online-Status und fremde Streaks ausblenden.
- [ ] Stattdessen den realen Zustand erklären: persönliche Lernstände werden derzeit nicht geteilt.
- [ ] Google und Magic Link an den Reifestatus aus P0.1 binden.
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

### Aufgabe

- [ ] Den produktiven Account ohne automatisch eingefügten Welt-Hauptstadt-Stapel starten.
- [ ] Die Hauptstadt-Fixture ausschließlich für Entwicklung, Demo auf ausdrückliche Auswahl und E2E verwenden.
- [ ] Zeitunabhängige, neutrale Begrüßung verwenden; keine hart codierte Person als Fallback.
- [ ] Für einen leeren Account drei klare Wege anbieten:
  - `Anki-Stapel importieren`
  - `Erste Karte erstellen`
  - `Demo ausprobieren`
- [ ] Das Kernversprechen in höchstens drei kurzen Aussagen erklären:
  - lernen mit Spaced Repetition,
  - später anders formuliert abgefragt werden,
  - Original und Quelle bleiben prüfbar.
- [ ] Nach dem ersten Import oder der ersten Karte direkt einen sinnvollen nächsten Schritt anbieten.
- [ ] Onboarding-Felder auf tatsächlich verwendete Daten begrenzen. Hochschule und Fachgebiet bleiben optional und dürfen den Lernstart nicht blockieren.

### Akzeptanz

- Ein neuer Account kann ohne Vorwissen innerhalb weniger klarer Aktionen eine erste Karte lernen.
- Demo-Daten verfälschen keine Statistiken eines echten Accounts.
- Leere Zustände enthalten genau eine primäre und höchstens eine sekundäre Aktion.
- Browser-Zurück und Reload funktionieren während des ersten Ablaufs.
- Kein Labs-Feature ist für den ersten Lernerfolg erforderlich.

### Evidenz

- E2E `neuer Account → manuelle Karte → Review`.
- E2E `neuer Account → kleiner APKG-Import → Review`.
- Kurzer moderierter Test mit mindestens drei Personen vor Abschluss des P0-Gates.

---

## P0.5 Erstellen und Import vereinfachen

### Aufgabe

- [ ] Die drei Einstiegskarten im Erstellen-Bereich kompakter gestalten; sie dürfen nicht den Großteil eines Desktop-Viewports beanspruchen.
- [ ] `Manuell` und `Import` als Core darstellen.
- [ ] Die lokale deterministische Entwurfserzeugung entweder:
  - als `Lokaler Entwurfsassistent` korrekt benennen, oder
  - vollständig unter Labs verschieben.
- [ ] Für lokale Entwürfe kein Kostenprofil anzeigen.
- [ ] Nur tatsächlich unterstützte Quellformate als auswählbar darstellen.
- [ ] DOCX nicht als akzeptiertes Format ausgeben, solange keine Extraktion existiert.
- [ ] APKG-Import als progressive Offenlegung gestalten:
  - zuerst Datei, Status, erkannte Stapel/Karten, Warnungen und Übernehmen,
  - technische Notetypes, Hashes, Template-IDs und Medienidentitäten nur in `Details`.
- [ ] Fehler, Abbruch, Retry und Wiederaufnahme mit jeweils genau einer klaren nächsten Aktion darstellen.
- [ ] Nach erfolgreichem Import Auswahl anbieten: `Jetzt lernen`, `Karten prüfen`, `Zur Bibliothek`.
- [ ] Manuelles Speichern eindeutig bestätigen und Fokus für die nächste Karte sinnvoll setzen.
- [ ] Unsaved-Changes-Verhalten beim Wechsel der Erstellungsart festlegen.

### Akzeptanz

- Der Standardimport ist ohne Kenntnis von Anki-Interna verständlich.
- Lokale Simulation wird nicht als kostenabhängige externe KI ausgegeben.
- Nicht unterstützte Dateitypen können nicht versehentlich ausgewählt werden.
- Ein erfolgreicher Import endet in einem konkreten Nutzerziel.
- Die technische Diagnose bleibt erreichbar, dominiert aber nicht den Hauptflow.

### Evidenz

- Golden-E2E für kleinen APKG-Import.
- Golden-E2E für manuelle Karte mit PDF-Quellenanker.
- Fehlerflows für defekte APKG, Netzwerkfehler und nicht lesbare PDF.
- Desktop-Abnahme bei 1440 × 900 und 1280 × 720.

---

## P0.6 Lernen, Bibliothek und Stapelverwaltung entflechten

### Produktentscheidung

Empfohlener Vertrag:

- `Lernen` ist der schnelle Einstieg in eine Sitzung.
- `Kartenstapel` ist die Verwaltung für Struktur, Karten und erweiterte Optionen.
- Ein Klick auf eine Lernzeile startet immer Lernen.
- Strukturänderungen erfolgen nicht über eine unsichtbare Drag-Geste auf derselben Zeile.

### Aufgabe

- [ ] Drag-and-drop aus der normalen Lernliste entfernen.
- [ ] Reparenting ausschließlich in der Stapelverwaltung mit sichtbarem Griff oder explizitem `Verschieben` anbieten.
- [ ] Lernliste auf Name, Fälligkeit, neue Karten, Gesamtzahl und Startaktion reduzieren.
- [ ] Stapelanlage im Lernbereich auf Name und Ziel beschränken; Icon- und Farbwahl in die nachgelagerte Darstellungseinstellung verschieben.
- [ ] CoRe-Modus im Lernbereich verständlich erklären oder nur als Status anzeigen; Änderung in Stapeloptionen vornehmen.
- [ ] Kartenbearbeitung, Variantenwerkzeuge, technische Maturity-Werte und Prompt-/JSON-Werkzeuge aus der Standardbibliothek trennen.
- [ ] Externen Varianten-Prompt nur in Labs/Erweitert anbieten.
- [ ] Versionen nicht nur zählen: Restore/Undo als echten, bestätigten Nutzerflow umsetzen.
- [ ] Löschen mit klarer Angabe des betroffenen Stapelbaums und einer sicheren Bestätigung versehen.

### Akzeptanz

- Lernstart und Strukturänderung können nicht durch dieselbe versteckte Geste ausgelöst werden.
- Die Lernliste ist ohne Anleitung bedienbar.
- Technische Scheduler- und Variantenwerte dominieren nicht die Kartenverwaltung.
- Ein alter Kartenstand kann sichtbar geprüft und wiederhergestellt werden.
- Alle Stapelaktionen funktionieren per Tastatur.

### Evidenz

- E2E für Lernstart.
- E2E für explizites Verschieben und Outdent in der Verwaltung.
- E2E für Version-Restore.
- Moderierter Test mit mindestens drei Personen.

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

## P1.3 Testportfolio neu ordnen

### Aufgabe

- [ ] Tests den Kategorien `unit`, `contract`, `integration`, `golden-e2e`, `heavy-release` zuordnen.
- [ ] Fünf Golden-E2E-Szenarien als Produktgate definieren:
  1. Account → erste Karte → Review.
  2. APKG → Vorschau → Import → Review.
  3. Manuelle Karte mit Quelle → Bearbeiten → Review.
  4. Review → Reload/Offline/Reconnect → persistierter Zustand.
  5. Variante → Reveal → Anker → Feedback.
- [ ] Tests korrigieren, die unerwünschte UX schützen.
- [ ] Redundante Assertions und doppelte Fixture-Setups identifizieren.
- [ ] Schwere Medien-, TUS-, große APKG- und vollständige Restore-Smokes als separates Release-/Nightly-Gate ausführen.
- [ ] PR-Gate auf schnelle, belastbare Verträge begrenzen:
  - Typecheck,
  - fokussierte Unit-/Contract-Suite,
  - Build,
  - Kern-RLS-Smoke,
  - Golden-E2E.
- [ ] Vollständiges lokales Supabase-/Medien-/APKG-Gate für `main`, Release und manuellen Lauf behalten.
- [ ] Flakiness, Laufzeit und abgedeckten Produktvertrag pro Suite dokumentieren.

### Akzeptanz

- Jede verpflichtende Suite hat einen klaren Zweck.
- Kein Test bleibt nur erhalten, um eine hohe Testzahl zu bewahren.
- UX-Verträge sind direkt testbar.
- Schwere Infrastrukturtests blockieren nicht jede kleine UI-Iteration, bleiben aber Release-Gate.
- Fehlgeschlagene Tests zeigen den betroffenen Produktvertrag.

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
