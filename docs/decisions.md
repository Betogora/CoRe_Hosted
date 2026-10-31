# CoRe-Entscheidungen

**Rolle:** einzige kanonische Quelle für geltende, dauerhafte Produkt- und Architekturentscheidungen.
**Stand:** 2026-10-30

## ADR-Format

Jede Entscheidung verwendet genau diese Felder:

```text
## ADR-NNN — Titel
Status: vorgeschlagen | angenommen
Kontext: Warum ist eine Entscheidung nötig?
Entscheidung: Was gilt verbindlich?
Konsequenzen: Welche Folgen und Grenzen entstehen?
Datum: YYYY-MM-DD
```

Die Datei enthält nur geltende Entscheidungen. Eine geänderte Entscheidung wird im Text aktualisiert, eine aufgehobene gelöscht; Git und [`history.md`](history.md) sind das Archiv. Nummern werden nicht neu vergeben. Wann eine Entscheidung ein ADR braucht, regelt [`README.md`](README.md#entscheidungen). Offene Umsetzungsschritte stehen in [`todo.md`](todo.md), nicht in ADRs.

## ADR-001 — Produktumfang nur mit Auftrag

**Status:** angenommen
**Kontext:** Der frühe MVP enthielt Labs-, Community-, Graph-, breite KI- und serverseitige Groß-APKG-Pfade mit sehr unterschiedlicher Produkt-, Betriebs- und Rechtsreife. Sie durchzogen UI, Domänenmodell, APIs, Datenbank und Betrieb, ohne Teil des freigegebenen Kernprodukts zu sein. Sichtbarkeit allein darf nicht als Freigabe gelten.
**Entscheidung:** CoRe enthält nur Funktionen mit ausdrücklichem Auftrag und eigener Abnahme. Ausgemusterte oder nicht beauftragte Flächen werden samt Routen, Zustand, Daten und Tests vollständig entfernt; es gibt weder Labs noch eine Produktoberflächen-Registry. APKG wird bis einschließlich 250 MB lokal im Browser importiert; einen serverseitigen APKG-Pfad gibt es nicht. Stapel sind privat.
**Konsequenzen:** Eine frühere Route oder persistierte Altstruktur begründet keinen Produktanspruch. Einzelne Schalter für gebaute, aber noch nicht freigegebene Loginwege (Google, Magic Link) sind zulässig. Eine produktive Datenlöschung ist irreversibel und erfolgt nur nach App-Deployment und verifizierter Projekt-Ref.
**Datum:** 2026-07-15 (mit ADR-005 und ADR-007 zusammengeführt am 2026-10-29)

## ADR-003 — Demo-Seed ist opt-in

**Status:** angenommen
**Kontext:** Automatische Demo-Stapel und erfundene Profildaten lassen einen neuen Account wie einen fremden oder bereits benutzten Account wirken.
**Entscheidung:** Produktive und normale Repository-Zustände starten leer. Der Welt-Hauptstadt-Seed ist nur über eine ausdrückliche Demoaktion oder über klaren Entwicklungs-/E2E-Setup verfügbar und enthält keine fremde Lernhistorie.
**Konsequenzen:** Fixtures bleiben reproduzierbar, sind aber kein Produktzustand. Tests müssen Seeds explizit anfordern.
**Datum:** 2026-07-15

## ADR-006 — Keine generische Anbieteradapter-Schicht

**Status:** angenommen
**Kontext:** Es gibt jeweils nur einen real betriebenen Pfad für Auth und Cloud-Persistenz.
**Entscheidung:** Konkrete tiefe Module kapseln Supabase. Eine generische Adapterebene entsteht erst, wenn mindestens zwei reale Implementierungen gleichzeitig unterstützt werden müssen.
**Konsequenzen:** React bleibt providerfrei, ohne hypothetische Interfaces und Konfigurationen einzuführen.
**Datum:** 2026-07-13

## ADR-011 — Schmale KI-Routen über OpenRouter

**Status:** angenommen
**Kontext:** Karten sollen auf ausdrückliche Aktion als nahe Variante umformuliert und Stapel zusammengefasst werden können, ohne die entfernte breite KI-, Labs- oder Job-Infrastruktur zurückzubringen und ohne Anbieterschlüssel im Browser zu exponieren.
**Entscheidung:** Genau `POST /api/ai/card-variant` und `POST /api/ai/summary` sind als authentifizierte Vercel Functions freigegeben (`getClaims`, gemeinsame Serverhelfer in `server/aiRoute.ts`). Beide nutzen fest das bezahlte Modell `openai/gpt-6-luna` mit Reasoning `low`, ZDR und `data_collection: "deny"`; freie Modellwahl und ein Non-ZDR-Fallback gibt es nicht, das OpenRouter-Key-Limit begrenzt die Kosten. Die Variantenroute erhält nur den bereinigten Klartext von Frage und Antwort einer Karte mit Frage-/Antwort-Abfrage (`{ front, back }`) und optional die Fragen bis zu fünf vorhandener oder gelöschter Varianten (`avoid`), erzwingt einen einzelnen strukturierten Tool Call und speichert das Ergebnis nach Änderungs- und Duplikatprüfung als `ai_generated`-Variante der Karte. `Varianten neu generieren` ersetzt Varianten älterer Prompt-Versionen. Eine Stapelgenerierung ruft die Route nacheinander für höchstens 50 Karten ohne aktive Variante auf, ausschließlich im geöffneten Tab; Abbruch und Neustart setzen bei den verbleibenden Karten fort.
**Konsequenzen:** Es gibt keine Jobtabelle, Serverqueue, Chatfläche, Anbieteradapter oder Bildübertragung. Jede Route schreibt ein Kostenlog. Eine automatische Erzeugung bei Reife und ein Kontingent je Nutzer brauchen eine Ergänzung dieser Entscheidung.
**Datum:** 2026-08-04 (Ergänzungen bis 2026-10-14 eingearbeitet am 2026-10-29)

## ADR-013 — Transiente Lernuhr für echte Accountkarten

**Status:** angenommen
**Kontext:** Schedulerintervalle sollen an den vorhandenen Karten über frei gewählte Zukunftstage nachvollziehbar sein. Ein isolierter Teststapel bildet weder den tatsächlichen Kartenfortschritt noch die Fälligkeitsprojektionen der normalen Produktoberflächen ab.
**Entscheidung:** `/simulator` steuert einen ausschließlich im App-Prozess gehaltenen Tagesoffset von 0 bis 3.650 Tagen. Alle lernbezogenen Projektionen verwenden diesen Zeitpunkt; operative Systemzeiten bleiben real. Das Umstellen ist mutationsfrei. Eine im Zukunftsmodus ausgeführte Bewertung ist bewusst ein echtes, synchronisiertes Review mit simuliertem Bewertungszeitpunkt und normalem Scheduler-Commit.
**Konsequenzen:** Die App kennzeichnet einen aktiven Zukunftstag in Shell und Vollbildreview. Reload, Logout oder „Heute“ setzen nur den Offset zurück und machen gespeicherte Reviews nicht rückgängig. Einen separaten Testmodus mit eigenem Teststapel gibt es nicht. Eine rücksetzbare Sandbox, Simulationskennzeichnung in Review-Events sowie Rollen- oder Premium-Gating bleiben eigenständige spätere Entscheidungen.
**Datum:** 2026-08-06

## ADR-015 — Globale FSRS-Statistik und Anki-Historie

**Status:** angenommen
**Kontext:** Die frühere Statistik projizierte wenige unverbundene Kennzahlen ohne gemeinsamen Zeitraum oder Mehrfach-Stapelauswahl. Zugleich enthält APKG häufig wertvolle Reviewhistorie.
**Entscheidung:** Statistik besitzt genau eine globale Zeitraum- und Stapelauswahl und wird aus append-only Review Events sowie aktuellen Varianten-Snapshots durch `statisticsModel.ts` projiziert. Aktuelle Gedächtnisverteilungen verwenden FSRS-Schwierigkeit, Stabilität und Abrufwahrscheinlichkeit statt klassischer Ease. APKG-`revlog` wird deterministisch dedupliziert als Analysehistorie importiert. Den anfänglichen Lernstand einer Anki-Karte leitet der Import ab: durch chronologisches Replay einer vollständigen Historie ab neuer Karte mit dem CoRe-Scheduler, sonst aus einem gültigen FSRS-Gedächtniszustand von Anki, sonst aus dem klassischen Kartenstatus. Historische Kategorien bleiben Anki-kompatibel nach Intervall (`Intervall unter 21 Tagen` / `ab 21 Tagen`); der Kartenstatus folgt der Reife aus ADR-044. Neue CoRe-Reviews messen reale Antwortzeit bis maximal 60 Sekunden.
**Konsequenzen:** Es gibt keine parallele Statistikprojektion. Historische Antwortzeiten bleiben optional. Reimport kann neue historische Ereignisse ergänzen, aber weder vorhandene Ereignisse überschreiben noch Karten als gelernt markieren.
**Datum:** 2026-08-06

## ADR-018 — Lernprofile als Copy-on-apply-Vorlagen

**Status:** angenommen
**Kontext:** Globale Lernvorgaben überschrieben bisher beim Autosave alle Stapel, obwohl Scheduler und Queue ausschließlich materialisierte Stapelwerte lesen. Eine Profil-ID mit gleichzeitig duplizierten Stapelwerten hätte eine zweite, konfliktanfällige Wahrheitsquelle geschaffen.
**Entscheidung:** Globale Scheduler-Präferenzen enthalten nur Tagesbeginn, Vorziehfenster und eine konto-weite Bibliothek eigener Lernprofil-Vorlagen. Vorlagen werden ausschließlich in den Stapeleinstellungen verwaltet. Anwenden kopiert die normalisierten Lernwerte und eine Herkunftsversion in genau einen Stapel; es gibt keine Live-Auflösung und keine globalen Stapel-Defaults. CoRe-Modus, Variantenparameter, Darstellung, technische Ausschlüsse und Tagesoverride bleiben außerhalb der Vorlage. Cloud-Sync nutzt das vorhandene Profil-JSONB mit Last-write-wins; Stapelwerte bleiben revisioniert.
**Konsequenzen:** Globale Änderungen können keinen Stapel mehr mutieren. Umbenennen, Aktualisieren und Löschen einer Vorlage verändert bereits kopierte Werte nicht; ältere Kopien können bewusst erneut angewandt werden. Es entstehen weder Resolver- noch Override-Graph.
**Datum:** 2026-08-11

## ADR-019 — Easy Days als globaler Wochenrhythmus

**Status:** angenommen
**Kontext:** Ruhigere Wochentage beschreiben die persönliche Verfügbarkeit und nicht die Lernlogik eines einzelnen Stapels. Eine stapelbezogene Copy-on-apply-Vorlage könnte dieselbe Woche widersprüchlich mehrfach abbilden. Zugleich darf eine Lastverteilung die FSRS-Gedächtnisparameter nicht durch eine zweite Intervallformel ersetzen.
**Entscheidung:** Globale Scheduler-Präferenzen führen für Montag bis Sonntag jeweils `Normal`, `Weniger` oder `Minimal`. Sieben gleiche Werte sind neutral. Ausschließlich neu berechnete Review-Tagesintervalle von 3 bis 90 Tagen dürfen innerhalb der offiziellen `ts-fsrs`-Fuzz-Spanne auf den nach accountweiter Fälligkeitslast und Tagesgewicht besten Lerntag gelegt werden. Vorschau und Commit verwenden dieselbe Lastmomentaufnahme, Profilzeitzone, Tagesgrenze und DST-sichere Kalenderaddition. Nur `dueAt` und das tatsächliche Intervall ändern sich; Stabilität, Schwierigkeit und Zielerinnerung bleiben das rohe FSRS-Ergebnis.
**Konsequenzen:** Änderungen wirken nicht rückwirkend. Das Profil-JSONB transportiert sieben additive Werte. Geschwisterverteilung, freie Gewichte, Kalenderausnahmen, Urlaubsmodus und persönliche FSRS-Optimierung bleiben außerhalb.
**Datum:** 2026-08-11

## ADR-032 — Inhaltsmodell: Note und Card, universeller CoRe-Inhalt

**Status:** angenommen
**Kontext:** Wiederherstellbare Inhaltsversionen, persistierte Quellen, als Varianten modellierte Anki-Karten und eine vollständige Inhaltskopie je Karte machten CoRe komplexer als Anki: Ein Lückentext mit vier Lücken lag mehrfach in Cloud, Sync und Replica, eine Korrektur wirkte nur auf eine Karte, Geschwisterregeln waren nicht abbildbar. Verbreitete Anki-Formate wie Image Occlusion, AnKing- und Ankizin-Notiztypen oder Multiple-Choice-Add-ons hängen zudem von Template-Scripts ab, die CoRe nicht ausführt. CoRe soll einheitlich aussehen, mit einem Editor bearbeitbar sein und später in einer App-WebView ohne Anki-Laufzeit laufen; Nutzer sollen keine Kartentypen wählen müssen.
**Entscheidung:** CoRe trennt wie Anki zwischen Inhalt (`Note`) und planbarer Abfrage (`Card`). Ein Inhalt besitzt Felder, Bausteine, Tags, Quelle, Markierung und Inhaltsrevision genau einmal und gehört keinem Stapel; eine Karte verweist auf genau einen Inhalt und besitzt Stapel, deterministischen Abfrageschlüssel, Status, Anki-Flagge, eigenen Lernstand, eigene Reviewereignisse und ihre KI-Umformulierungen. Welche Karten existieren, folgt aus den aktiven Bausteinen; eine Inhaltsänderung wirkt auf alle Geschwister. Löschen folgt Anki: Eine Karte löschen löscht nach Bestätigung mit Kartenzahl ihren Inhalt samt Geschwistern; entfällt beim Speichern eine Abfrage, nennt ein Dialog die betroffenen Karten samt Lernstand. Begraben von neuen, Review- und tagesübergreifenden Lerngeschwistern gibt es als drei standardmäßig ausgeschaltete Lernoptionen. Das Inhaltsformat ist universell: Felder mit fachlicher Rolle (Frage, Antwort, Hinweis, Zusatz, Quelle, Notiz) und optionale Bausteine (Lücken in voller Anki-Syntax, Bildverdeckung, Auswahl, Eintippen, Richtungen, Medien, Formeln, bereinigtes Rich-Text-HTML). Die Darstellung ist immer das CoRe-Design. Versionierte Übersetzer überführen APKG-Notiztypen (Standardtypen, Image Occlusion, Image Occlusion Enhanced als echte Masken, AnKing-/Ankizin-Familie, verbreitete Multiple-Choice-Add-ons, generischer Übersetzer); Template-CSS und -JavaScript werden weder angezeigt noch ausgeführt. Anki-Vorlage je Notiztyp und rohe Anki-Feldwerte je Inhalt werden unsichtbar gespeichert, damit nach einem Übersetzer-Update unbearbeitete Inhalte automatisch neu übersetzt werden. Versionslogs, Restore, Quellsnapshots, Quelldokumente und CoRe-JSON-Portabilität gibt es nicht. Manuelle Neuplanung ändert nur `dueAt` und wird als idempotentes Ereignis `rating: "manual"` synchronisiert; weitere manuelle Lernstandsänderungen sowie Tags, Flaggen und Lernbremse regelt ADR-045. KI-Umformulierungen bleiben Varianten ihrer Karte ohne eigenen Lernstand.
**Konsequenzen:** Ein Review auf einem Gerät und eine Inhaltskorrektur auf einem anderen sind kein Konflikt. Reimport identifiziert Inhalte über die Anki-GUID und Karten über die Anki-Kartenidentität; Neuübersetzung lässt Lernstand unangetastet und ändert keinen Inhalt, wenn dabei eine Karte mit Lernstand entfiele. Manuelle Ereignisse beeinflussen weder Statistik noch FSRS. Exotische Anki-Designs verlieren ihre Optik, nicht ihren Inhalt; jeder Import berichtet je Notiztyp den verwendeten Übersetzer. Links in Feldern, auch AMBOSS, öffnen extern; AMBOSS-Tooltips nur über eine offizielle Kooperation oder API. Anki- und Add-on-Code wird nur gelesen, nie kopiert (AGPL). Die Oberfläche benennt den Inhalt nicht eigens, weil `Notizen` für eine künftige Lernnotiz-Funktion reserviert ist.
**Datum:** 2026-10-06 (mit ADR-021, ADR-029 und ADR-033 zusammengeführt am 2026-10-29)

## ADR-034 — Persistenz, Web-Replica und Sync

**Status:** angenommen
**Kontext:** Kartenbestände und Reviewhistorien wachsen; Start, Lernen und Sync dürfen nicht linear mit Code- oder Accountgröße wachsen. Browserspeicher kann gelöscht werden und ist nie die einzige Accountwahrheit. Vor dem ersten Release muss kein externer Datenbestand erhalten werden.
**Entscheidung:** Supabase ist kanonische Account-, Postgres-, Storage- und Backup-Plattform mit getrennten Tabellen für Stapel, Inhalte, Karten, unsichtbare Anki-Vorlagen, Mediendateien je Account und SHA-1 samt Verknüpfung, KI-Umformulierungen, append-only Reviewereignisse und Statistikrollups. Lernstand, Fälligkeit und Status sind typisierte Kartenspalten; gerenderte Darstellungen werden nie persistiert. `card_catalog` und `deck_study_summaries` sind trigger-gepflegte, wiederaufbaubare Projektionen für Delta-Cursor, Keyset-Seiten und Stapelzähler. Die Web-Replica in IndexedDB bleibt begrenzt: Stapelbaum mit Zählern, Katalog, rollendes Lernfenster mit zugehörigen Inhalten, zuletzt geöffnete Karten, Medien bei Bedarf und ausdrückliche Offline-Downloads. Ein bekanntes Gerät öffnet seine lokale Shell sofort und darf bei reinem Netzwerkfehler aus der gespeicherten Sitzung offline kalt starten. `syncNow()` führt genau einen Zyklus aus lokalem Flush, isoliertem Outbox-Push, `sync_change_id`-Delta-Pull und Konfliktaktualisierung aus; Realtime gibt es nicht. `revision` zählt nur fachlichen Inhalt, der Lernstand hat eine eigene `studyRevision`, Reviews laufen atomar über `record_review_atomic`. Planungen über ganze Stapel lesen Lernstände über `list_account_card_study_states` ohne Kartenkörper. Vor dem ersten extern genutzten Release gilt Pre-Release-Cutover: Schemawechsel ersetzen den alten Stand ohne Kompatibilitäts-, Altlese- oder Backfillpfade in der App; Bestände stellt höchstens eine einmalige Datenbank-Migration um, und Konten, Daten und Storage dürfen ersatzlos gelöscht werden.
**Konsequenzen:** Aktive Konflikte sind je Entität eindeutig und betreffen nur die aktuelle Konfliktmenge; konfliktfreie Karten, Reviews und Medien bleiben benutzbar. Die Domänenlogik bleibt reines TypeScript ohne Browser-APIs; eine Speicherabstraktion zwischen IndexedDB und SQLite entsteht erst mit der zweiten realen Implementierung. Vor einem destruktiven Remote-Reset müssen Baseline und Migrationen, Verify-SQL, generierte Typen, RLS und Performance-Nachweise grün sein, und die genaue Projekt-Ref wird unmittelbar davor angezeigt und geprüft. Nach dem ersten extern genutzten Release ist ein ersatzloser Reset nicht mehr zulässig.
**Datum:** 2026-10-06 (mit ADR-020, ADR-022, ADR-024, ADR-025, ADR-027 und ADR-028 zusammengeführt am 2026-10-29)

## ADR-035 — APKG-Kompatibilitätsmatrix als Abnahmevertrag

**Status:** angenommen
**Kontext:** Die vorhandenen APKG-Fixtures decken nur wenige synthetische Notiztypen ab. Fehler bei Paketversionen, Stapelzuordnung, Medien, Lernstand und Sonderformaten fallen dadurch erst beim manuellen Import echter Stapel auf.
**Entscheidung:** APKG-Unterstützung wird durch eine automatisch erzeugte Fixture-Matrix aus Paketversion, Inhaltsformat, Stapelorganisation und Lernstand abgenommen. Jede Fixture besitzt eine maschinenlesbare Erwartung für Stapelpfade, Inhalte, Karten, Abfrageschlüssel, Feldrollen, Medien, Lernstand und eine Textfassung beider Kartenseiten; ausgewählte Fälle erhalten zusätzlich visuelle Nachweise. Ergänzend importiert ein lokaler, nicht versionierter Realwelt-Korpus echte Stapel wie Ankizin und AnKing und berichtet je Notiztyp die Quote voll übersetzter, generisch übersetzter und nicht darstellbarer Inhalte. Anki-Bibliotheken werden nur zur Fixture-Erzeugung verwendet.
**Konsequenzen:** Bekannte Lücken stehen bis zu ihrer Umsetzung als ausdrücklich offene Erwartungen in der Matrix. Neue Übersetzer oder Bausteine sind erst mit grüner Matrixzeile fertig. Realwelt-Stapel verlassen den Rechner nicht und werden wegen ihrer Lizenzen nicht ins Repository aufgenommen; ohne bereitgestellten Korpus meldet der Befehl dies ausdrücklich, statt als bestanden zu gelten.
**Datum:** 2026-10-06

## ADR-036 — Native App als lokale Vollreplik mit Capacitor

**Status:** angenommen
**Kontext:** CoRe soll später als iOS- und Android-App erscheinen und wie die Anki-App ohne Netz vollständig nutzbar sein, statt eine Website anzuzeigen.
**Entscheidung:** Die App wird mit Capacitor gebaut; der gebündelte TypeScript-Code läuft lokal auf dem Gerät. Sie hält eine vollständige lokale Replik in SQLite mit allen Stapeln, Inhalten, Karten, Lernständen und Reviewereignissen des Accounts und lädt alle Medien ohne Auswahl auf das Gerät. Supabase bleibt kanonische Quelle; synchronisiert wird inkrementell. Großstapel werden am Computer importiert und anschließend synchronisiert. Die Web-App bleibt eine schlanke Replica nach ADR-034.
**Konsequenzen:** Das Kartenmodell muss relational spiegelbar, der Renderer scriptfrei und WebView-tauglich und die Domänenlogik browserunabhängig sein. Store-Veröffentlichung, Push, plattformspezifische Login- und Kontolöschungspflichten, die Same-Origin-Anpassung der KI-Routen und die Medienspeicherverwaltung gehören zu einer späteren eigenen Roadmap.
**Datum:** 2026-10-06

## ADR-037 — Gestaltungsstil „Soft Minimal“ mit CoRe-Farben

**Status:** abgelöst durch ADR-046
**Kontext:** Eine Designstudie (2026-10-09) verglich den bisherigen CoRe-Stil (weiße Fläche ohne Ebenen, Amulya und Synonym, runde Icon-Kreise, 44-px-Bedienelemente) mit einem ruhigeren Stil nach dem Vorbild der BengtsToolBox (shadcn/ui-artig). Der Nutzer entschied sich für den neuen Stil und dafür, ihn auf die gesamte App und die Doku auszuweiten.
**Entscheidung:** CoRe verwendet den Stil „Soft Minimal“ mit unveränderter CoRe-Palette: hellgraue Arbeitsfläche, weiße Karten mit 1-px-Rahmen und leichtem Schatten, weiche Radien, Icon-Flächen als weiche Quadrate, Auswahl-Schienen mit weißem Indikator, Labels in normaler Schreibung und die lokal eingebettete variable Schrift Manrope in App, Kartenfläche und Doku. Externe Schriften entfallen. Die Bedienhöhe beträgt 40 px bei feinem Zeiger ab 768 px und bleibt auf Touchgeräten sowie unter 768 px bei 44 × 44 px. Auf Desktop navigiert eine schwebende Top-Bar: Marke links, die fünf Hauptziele mit Icon und Wort mittig, Pomodoro-Fortschritt und Utility-Aktionen rechts; der Inhalt erhält die volle Breite. Unter 1280 px gilt der kompakte Modus. Der UI-Katalog übernimmt den Aufbau des ToolBox-Katalogs.
**Konsequenzen:** Tokens in `src/styles.css` und die gemeinsamen Klassen tragen den Stil; Screens verwenden die gemeinsamen Button-Klassen statt eigener Klassenketten. Die visuellen Verträge in `specs.md`, `src/ui/README.md` und die Theme-Tests beschreiben den Stil.
**Datum:** 2026-10-09 (Top-Bar vom 2026-10-21 eingearbeitet am 2026-10-29)

## ADR-038 — Anmeldung und Sitzungsstart

**Status:** angenommen
**Kontext:** CoRe nutzt Supabase Auth als realen Accountpfad. Ein zusätzlicher lokaler Passwort-Verifier würde zwei Identitäten und falsche Sicherheitsannahmen erzeugen. Zugleich lag „Neues Gerät bis Dashboard“ knapp am 3.000-ms-Budget, weil der Bootstrap auf den Netzwerk-Roundtrip von `getUser()` wartete.
**Entscheidung:** Supabase E-Mail/Passwort ist der freigegebene Loginpfad. Lokale Daten sind accountgebundener Cache, kein eigenständiger Auth-Provider; lokale Testaccounts und Mailpit sind Testinfrastruktur. Online startet die im Browser gespeicherte Sitzung (`getSession()`) die accountgebundene Shell und den Bootstrap sofort; `getUser()` bestätigt sie parallel. Lehnt der Server sie ab, meldet er einen anderen Nutzer oder scheitert die Bestätigung mit einem Nicht-Netzwerkfehler, verwirft CoRe den laufenden Start, meldet die Sitzung lokal ab und zeigt die Anmeldung. Offline, ohne gespeicherte Sitzung und beim Passwort-Recovery bleibt die sequenzielle Prüfung.
**Konsequenzen:** Es gibt keinen parallelen lokalen Login; der Offline-Kaltstart eines bekannten Geräts (ADR-034) nutzt nur die gespeicherte Supabase-Sitzung. Bis zur Bestätigung laufen nur Abrufe, die der Server ohnehin mit dem gespeicherten Token autorisiert; es werden keine Daten eines anderen Accounts sichtbar. Ein verworfener Start beendet seine Bootstrap-Wiederholungen.
**Datum:** 2026-10-10 (mit ADR-004 zusammengeführt am 2026-10-29)

## ADR-039 — CoRe-Modus An/Aus und wirksame Variantenregeln

**Status:** angenommen
**Kontext:** Der CoRe-Modus bot `Aus`, `Auto` und `Manuell`; `Auto` und `Manuell` verhielten sich gleich, eine automatische Variantenerzeugung gab es nicht, und `Aus` wirkte nur auf den Erzeugen-Button. Die Stapelwerte `Varianten einsetzen ab Lernstufe` und `Aktive Varianten pro Karte` wurden gespeichert, aber nie ausgewertet. Im Review kam die Originalkarte nach der ersten Variante nicht wieder, und nach einem Fehler gab es keinen Rückfall auf das Original.
**Entscheidung:** Der CoRe-Modus ist je Stapel `An` oder `Aus`. Varianten werden ausschließlich manuell erzeugt; Erzeugen ist bei `Aus` und bei erreichter Höchstzahl aktiver Varianten gesperrt. Im Review wechselt eine Karte nur bei `An`, in der Reviewphase, ohne aktuelle `Nochmal`-Bewertung und ab der Haltbarkeitsschwelle des Stapels (ADR-044) reihum zwischen sich selbst und ihren ältesten aktiven Varianten bis zur Höchstzahl. Rückfall-, Bevorzugungs- und Ausschlussfelder ohne Wirkung entfallen.
**Konsequenzen:** Unbekannte gespeicherte Moduswerte normalisieren auf `An`, ohne eigenen Umwandlungspfad. Eine automatische Erzeugung bei Reife bleibt eine spätere Produktentscheidung mit eigener Kosten- und Datenschutzbewertung. Die Variantenwahl ist eine reine Funktion von Stapeleinstellungen und Lernstand und braucht keine Reviewhistorie.
**Datum:** 2026-10-10

## ADR-041 — Stapelhierarchie und Stapelsammlung

**Status:** angenommen
**Kontext:** Eine fachliche Begrenzung der Ebenen und die APKG-Abflachung verloren echte Elternbeziehungen. Der Arbeitsstand `fitzbert` entwarf zudem eine neue Stapeldarstellung und eine gegliederte Inhaltsansicht, während main das Note/Card-Modell, Soft Minimal und das Backend trug.
**Entscheidung:** Stapel besitzen kein fachliches Ebenenlimit. Anlegen, APKG-Import und Verschieben erhalten die unmittelbare Elternbeziehung und den vollständigen `hierarchyPath`; ein Drop auf einen Stapel bedeutet immer „als direkter Unterstapel“. Einrückung und Tiefenfarbe werden ab Ebene 6 auf dem Wert der sechsten Ebene gehalten; Chevron, Reihenfolge, zugängliche Pfade und Auf-/Zuklappen folgen der echten Hierarchie. Reimporte bewahren lokalen Namen, Elternbeziehung, Pfad und Einstellungen. Aus `fitzbert` gelten die Gruppen je Hauptstapel mit leicht getöntem Hauptstapelkopf, die browserlokale Wahl zwischen Liste und Kacheln mit Unterstapel-Panel in der Kachelansicht, `Alle aufklappen`/`Alle einklappen`, die Schnellanlage unter der Liste, der Kopf der Inhaltsansicht mit klickbarem Pfad sowie die sechs Tabs mit Start auf `Unterstapel` und Tab in der URL. Stapeldarstellungen zeigen keinen Fortschrittsring. Nicht übernommen werden die Explorer-Seitenspalte, Badges und Untertitel mit Anzahlen, die Tönung von Unterstapelzeilen sowie fitzberts Bedienhöhen und Formen; Soft Minimal (ADR-037) bleibt maßgeblich.
**Konsequenzen:** Die Workspace-Seam prüft beim Verschieben nur fehlende Ziele, Selbstbezug und Nachfahrenzyklen und aktualisiert den ganzen Unterbaum. `DeckTree` besitzt die Projektionen `list` und `tiles`; `DeckSummaryRow` projiziert Zeile und Kachel ohne Ring. Die Detailregeln der Darstellung stehen in `specs.md`.
**Datum:** 2026-10-12 (mit ADR-031 zusammengeführt am 2026-10-29)

## ADR-042 — Globaler Prüfungsplaner mit gemeinsamer Kontaktplanung

**Status:** angenommen
**Kontext:** `fitzbert` plante Prüfungen in einem Dialog und lud dafür alle Kartenkörper der gewählten Stapel in den Browser. Main hält nur ein Lernfenster lokal (ADR-034). Prüfungen gehören zum Nutzer, nicht zu einem Stapel: Mehrere Prüfungen teilen sich Lernzeit und Karten.
**Entscheidung:** `Prüfungen` ist ein eigener Hauptbereich unter `/pruefungen`. Pläne liegen versioniert in `schedulerPreferences.examPlanning` des Profils; Profilformat 3 ist das einzige Format, Bestände stellen Datenbank-Migrationen einmalig um, die App enthält keinen Umrechnungscode. Eine geführte Einrichtung erfasst Prüfung, Lernstoff (ein gewählter Oberstapel umfasst auch künftige Unterstapel, abgewählte bleiben Ausnahmen), Einführungsstichtag, Themenreihenfolge und eine relative Lernzeit je Klausur; die erste Seite fragt zusätzlich Lernstart (Vorgabe heute) und Prüfungsziel, das nur das Abrufziel benennt. Unterstapel sind die Themen; ein Themenstart bedeutet „frühestens ab“. Eine begrenzte deterministische Kontaktplanung verteilt alle ungesehenen Karten mit dem echten Scheduler bis zum Einführungsstichtag und gleicht die erwartete Kontaktlast aus; teilen sich Prüfungen Stapel, wird jede Karte genau einmal eingeführt, spätestens zum frühesten Stichtag. Zeitblöcke mit Fach steuern dessen Lernzeit, Blöcke ohne Fach sind Kalendernotizen. Speichern ist mit gültigen Angaben immer möglich; nicht mehr einplanbarer Stoff bleibt sichtbar offen, unrealistische Tagesmengen erzeugen nur einen Hinweis. Lernaufgaben laufen als normale Lernsitzung über genau die geplanten Karten mit der Zielerinnerung der Prüfung und ohne normale Tageslimits. Lernstände kommen über `list_account_card_study_states`. Priorität, Lernziel-Frage, Machbarkeitsprüfung, Zeitbedarf je Karte und Quizplanung gibt es nicht; Quiz kehrt nur als eigenes Feature zurück.
**Konsequenzen:** Neu geplant wird nur online; offline bleiben die zuletzt geplanten Tagesziele und der Kalender sichtbar, und die heutige Einheit startet aus lokal vorhandenen Zielkarten. Auf `Heute` stehen Prüfungsaufgaben nach der Tageslernfläche. Gespeicherte Stapeleinstellungen bleiben unverändert; nach einer Prüfung plant der normale Scheduler mit der Stapelretention weiter, und Prüfungen gelten ab dem Folgetag ihres Termins als abgeschlossen. Interne Zukunftsszenarien sind kein Beherrschungsnachweis; sichtbar bleiben reale Fälligkeiten und neue Karten. Zusammenfassungen können als nicht blockierende Leseaufgaben vor neuen Themen ergänzt werden. Die Detailregeln stehen in `specs.md` §6.9.
**Datum:** 2026-10-12 (Ergänzungen vom 2026-10-17 bis 2026-10-25 einschließlich E1–E16 eingearbeitet am 2026-10-29; Lernstart und Prüfungsziel aus `codex/klausurplaner-design` am 2026-10-31)

## ADR-043 — Zusammenfassungen und Mindmaps als versionierte Online-Dokumente

**Status:** angenommen
**Kontext:** Zusammenfassungen und Mindmaps lagen nur im Browser; ein anderes Gerät, ein Inkognito-Fenster oder gelöschte Browserdaten zeigten leere Tabs. Stapel und Karten liegen dagegen online mit revisionsgeprüftem Sync. Echte Nutzerdaten der beiden Dokumentarten gibt es praktisch nicht.
**Entscheidung:** Beide Dokumentarten liegen je Konto in eigenen Tabellen als versioniertes JSONB, das die App validiert; die Datenbank vergibt die Revision. Die Umstellung erfolgt ohne Schalter mit dem Deployment (I1), bisher nur lokal gespeicherte Dokumente werden weder hochgeladen noch weiter gelesen (I2). Bei einem Revisionskonflikt bleibt bei Zusammenfassungen der Cloudstand und die eigenen Änderungen werden zur `Konfliktfassung von …`; bei Mindmaps gewinnt der zuletzt gespeicherte Stand mit sichtbarem Hinweis (I3). Mindmap-Bilder liegen in einem eigenen privaten Bucket (I4). Zusammenfassungen gehen zuerst online (W8a), Mindmaps folgen (W8b) (I5). Löschen gilt geräteübergreifend vor gleichzeitigen Änderungen.
**Konsequenzen:** Spätere Formatänderungen brauchen keine Datenbankmigration. Die lokale IndexedDB bleibt Zwischenspeicher und Offline-Warteschlange; ausstehende Änderungen werden beim nächsten Öffnen hochgeladen und bis dahin sichtbar markiert. Die Migration muss vor dem App-Deployment auf dem gehosteten Supabase angewendet sein.
**Datum:** 2026-10-17

## ADR-044 — FSRS-7-Scheduler und Reife aus der Haltbarkeit

**Status:** angenommen
**Kontext:** Die frühere Lernstufe (XP) zählte nur Bewertungsklicks, kannte weder Zeit noch Gedächtniszustand und machte eine stets mit `Gut` bewertete Karte erst nach Jahren reif; „Reif“ hatte zudem zwei Bedeutungen (XP in Katalog und Prüfungen, 21 Tage Intervall in der Statistik). `ts-fsrs` 6 macht FSRS-7 zum Standardmodell.
**Entscheidung:** `src/scheduler.ts` ist der einzige Scheduler und nutzt FSRS-7 aus der neuesten stabilen `ts-fsrs`-Hauptversion mit stapelspezifischer Zielerinnerung (Standard 0,92) und ohne Fuzz außer für Easy Days (ADR-019). Lernschritte sind 1 und 10 Minuten, Wiederlernen 10 Minuten; konfigurierte Lernschritte haben wie in Anki Vorrang vor dem Modellintervall. `Gut` führt durch alle Lernschritte, `Leicht` beendet die Lernphase sofort. Sitzungen zeigen zuerst eindeutige Karten, danach ihre Wiederholungen, nötigenfalls vor dem gespeicherten Termin. Reife folgt der Haltbarkeit, den Tagen, bis die Erinnerung auf 90 % fällt: `Neu`, `Lernen` (Lern- und Wiederlernphase), `Jung` und `Reif` ab 21 Tagen. Die rohe Stabilität eignet sich nicht, weil sie nach einem Fehler hoch bleibt, während die Haltbarkeit einbricht. Katalog, Stapelzahlen, Statistik, Prüfungsfortschritt („gefestigt“) und Variantenfreigabe nutzen dieselbe Funktion. Varianten erscheinen in der Reviewphase ohne aktuelle `Nochmal`-Bewertung, sobald die Haltbarkeit die Stapelschwelle erreicht (7, Standard 21 oder 60 Tage); die Rotation aus ADR-039 bleibt. Es gelten die FSRS-7-Standardparameter, solange keine persönlichen vorliegen. Persönlich optimierte Parameter sind zulässig, wenn sie aus dem eigenen Bewertungsverlauf berechnet sind, ihn messbar besser vorhersagen als die Standardwerte und Haltbarkeit, Reife und Fälligkeiten danach mit ihnen übereinstimmen.
**Konsequenzen:** Vorschau und Commit bleiben deterministisch. Reife wird nicht gezählt, sondern als Band im Lernstand mitgeschrieben, damit Katalog und Stapelzahlen sie ohne Kartenkörper lesen; ändern sich die Parameter, wird das Band neu berechnet. Die Beispielketten in `src/schedulerExampleChains.ts` halten Abstände, Haltbarkeit, Reife und Variantenzeitpunkt je Zielerinnerung mit Standardparametern fest und erzeugen den Spec-Abschnitt „Lernverlauf einer Karte“. Bestehende Lernstände wurden beim Cutover ohne Migrationscode in der App einmalig aus ihren Reviewereignissen neu berechnet; Karten ohne vollständige Ereignisfolge behielten Stabilität und Schwierigkeit.
**Datum:** 2026-10-29 (persönliche Parameter zugelassen am 2026-10-30)

## ADR-045 — Karteneditor V2: Tags, Flaggen und Lernbremse ankitreu speichern

**Status:** angenommen
**Kontext:** Tags wurden beim Speichern an `#`, `,` und `;` zerlegt, zählten als Inhaltsänderung und blockierten damit spätere Import-Updates der Felder; ein Reimport ersetzte sie. Anki-Flaggen wurden gespeichert, aber nirgends angeboten, das Anki-Tag `leech` blieb ein gewöhnliches Tag. Der Editor war eine Seitenleiste ohne Reiter, Live-Vorschau, Rückgängig oder Lernaktionen. Ein späterer Stapel-Export soll ohne Verlust möglich bleiben.
**Entscheidung:** Tags und Flaggen werden genau wie in Anki gespeichert, auf CoRe-Begriffe abgebildet und in der Oberfläche vereinfacht. `Note.content.tags` hält die Anki-Rohtexte (NFC, ohne Leerraum und Steuerzeichen, leere `::`-Teile als `blank`, Duplikate ohne Rücksicht auf Groß-/Kleinschreibung entfernt, nie an `#`, `,` oder `;` getrennt); die zuerst gespeicherte Schreibweise gewinnt, `::` bildet die Hierarchie. `Note.importedTags` hält den Tag-Stand des letzten Imports und trennt eigene von importierten Tags; ein Reimport führt Tags dreiseitig zusammen (`lokal ∪ (neu − Basis) − (Basis − neu)`). Eine Tag-Änderung ist wie die Markierung keine Inhaltsänderung und erhöht `contentRevision` nicht. `Card.ankiFlag` (0–7) wird angeboten; eigene Flaggennamen liegen kontoweit in `uiPreferences.flagNames`. `marked` wird zur Markierung, `leech` zur Lernbremse `CardStudyState.leechedAt`, einem Lernstandsfeld getrennt von `status`. Erkannt wird sie beim Bewerten nach Ankis Regel (Schwelle je Stapel, Standard 8, danach jede halbe Schwelle), die Stapelaktion `Nur kennzeichnen` oder `Aussetzen` ist Teil der Stapeleinstellungen. Manuelle Lernstandsänderungen (Neu planen, Als neu lernen, Lernbremse, Zurückstellen, Rückgängig) sind manuelle Review-Ereignisse über `record_review_atomic`; `Zurückstellen` folgt wie das Begraben von Geschwistern aus den Ereignissen des Lerntags. Suche und Filter verstehen `flag:n`, `tag:x` (mit Kindern), `tag:none`, `tag:leech`, `tag:marked`, `is:suspended` und Verneinung; der Client zerlegt die Anfrage (`cardSearchQuery.ts`), Server und Offline-Katalog werten dieselbe Begriffsliste aus. Der Editor ist ein Dialog über die ganze Fläche mit den Reitern `Allgemein` (Sofortaktionen), `Inhalt` (Entwurf mit Live-Vorschau), `Varianten` und `Lernen`; Rückgängig gibt es für Sofortaktionen, deren Ergebnis aus dem Blick verschwindet oder etwas überschreibt. Die Einzelheiten der Oberfläche regelt [`specs.md`](specs.md#kartendetail-und-editor); die Einzelentscheidungen V1–V12 und W1–W23 stehen bis zum Abschluss in [`todo.md`](todo.md).
**Konsequenzen:** Tags, Flaggen, Markierung und Lernbremse überstehen Reimport und Synchronisierung; ein künftiger `.apkg`-Export kann `marked`, `leech` und Flaggen zurückschreiben. Flaggennamen sind aus `.apkg` nicht übernehmbar, weil Anki sie nur in `.colpkg` mitgibt. Der Katalog führt Flagge, Lernbremse und Tag-Schlüssel (`tag_keys`, alle `::`-Elternpfade in Kleinschreibung), damit Suche und Filter ohne Kartenkörper arbeiten. Der Bestand wurde beim Cutover einmalig per Migration umgerechnet; die App kennt keine Altformen, die lokale Replik wechselte auf einen neuen Namensraum.

## ADR-046 — Vollständige ToolBox-Designsprache

**Status:** angenommen
**Kontext:** ADR-037 übernahm nur den Aufbau der BengtsToolBox und behielt die CoRe-Palette, eigene Höhen und eine eigene Typostufung; die optische Übereinstimmung blieb sichtbar unvollständig.
**Entscheidung:** CoRe übernimmt die BengtsToolBox optisch vollständig, ohne ihr inhaltlich zu folgen: ToolBox-Neutralpalette und -Markenfarben (Primär `#236492`, Akzent `#b55b43`) in Light und Dark, Buttons 36 px, Felder 40 px, Auswahl-Schienen 38 px bei feinem Zeiger (Touch und unter 768 px weiterhin 44 px), Seitentitel 30 px, Abschnitts- und Dialogtitel 18 px, Kartentitel 16 px, Labels 13 px, Kennzahlen 22 px, Inhaltsbreite höchstens 1280 px unter der schwebenden Top-Bar. Funktion, Inhalte, Reihenfolge und relative Positionen bleiben erhalten. Die vier gekoppelten Lernstatus- und Bewertungsrollen lauten `Neu`/`Nochmal` Terrakotta, `Offen`/`Schwer` Amber, `Fällig`/`Gut` Grün, `Gelernt`/`Leicht` Blau.
**Konsequenzen:** `src/styles.css` trägt ausschließlich ToolBox-Werte; die frühere CoRe-Palette entfällt. Theme-Tests, UI-Modulindex, Specs und UI-Katalog beschreiben die neuen Werte.
**Datum:** 2026-10-30
