# CoRe-Entscheidungen

**Rolle:** einzige kanonische Quelle für dauerhafte Produkt- und Architekturentscheidungen.
**Stand:** 2026-10-07

## ADR-Format

Jede Entscheidung verwendet genau diese Felder:

```text
## ADR-NNN — Titel
Status: vorgeschlagen | angenommen | abgelöst
Kontext: Warum ist eine Entscheidung nötig?
Entscheidung: Was gilt verbindlich?
Konsequenzen: Welche Folgen und Grenzen entstehen?
Datum: YYYY-MM-DD
```

Offene Umsetzungsschritte stehen in [`todo.md`](todo.md), nicht in ADRs.

## ADR-001 — Core, Labs und Disabled

**Status:** angenommen
**Kontext:** Der breite lokale MVP enthält klickbare Flächen mit sehr unterschiedlicher Produkt-, Betriebs- und Rechtsreife. Sichtbarkeit allein darf nicht als Freigabe gelten.
**Entscheidung:** `Core` ist für normale Nutzer freigegeben und Teil des Kernversprechens. Ausgemusterte oder nicht beauftragte Flächen werden vollständig entfernt; eine allgemeine Produktoberflächen-Registry wird nicht vorgehalten.
**Konsequenzen:** Neue Flächen brauchen einen expliziten Core-Auftrag und eigene Abnahme. Eine frühere Route oder persistierte Legacy-Struktur begründet keinen Produktanspruch.
**Datum:** 2026-07-15

## ADR-002 — Lernen und Stapelverwaltung trennen

**Status:** abgelöst
**Kontext:** Lernstart und Strukturverwaltung konkurrierten in derselben Oberfläche; unsichtbare Drag-Gesten machten das Ziel einer Zeile unklar.
**Entscheidung:** `Lernen` ist der schnelle Einstieg in eine Sitzung. `Kartenstapel` verwaltet Struktur, Karten, Versionen und erweiterte Optionen. Ein Klick auf eine Lernzeile startet Lernen. Strukturänderungen sind explizite, bestätigte Verwaltungsaktionen.
**Konsequenzen:** Die Stapelverwaltung bleibt erreichbar, dominiert aber nicht den Lernstart. Strukturänderungen dürfen nicht erneut als versteckte Primärgeste auf Lernzeilen eingeführt werden.
**Datum:** 2026-07-15

## ADR-003 — Demo-Seed ist opt-in

**Status:** angenommen
**Kontext:** Automatische Demo-Stapel und erfundene Profildaten lassen einen neuen Account wie einen fremden oder bereits benutzten Account wirken.
**Entscheidung:** Produktive und normale Repository-Zustände starten leer. Der Welt-Hauptstadt-Seed ist nur über eine ausdrückliche Demoaktion oder über klaren Entwicklungs-/E2E-Setup verfügbar und enthält keine fremde Lernhistorie.
**Konsequenzen:** Fixtures bleiben reproduzierbar, sind aber kein Produktzustand. Tests müssen Seeds explizit anfordern.
**Datum:** 2026-07-15

## ADR-004 — Lokale Auth ist kein paralleler Loginpfad

**Status:** teilweise abgelöst durch ADR-024
**Kontext:** CoRe nutzt Supabase Auth als realen Accountpfad. Ein zusätzlicher lokaler Passwort-Verifier würde zwei Identitäten und falsche Sicherheitsannahmen erzeugen.
**Entscheidung:** Supabase E-Mail/Passwort ist der freigegebene Loginpfad. Lokale Daten sind accountgebundener Cache, kein eigenständiger Auth-Provider. Lokale Testaccounts und Mailpit sind Testinfrastruktur, keine Produktanmeldung.
**Konsequenzen:** Es gibt keinen parallelen Offline-Login. Vollständiger Offline-Kaltstart bleibt ein eigener Produkt- und Sicherheitsentscheid. Alte lokale Verifier- oder Loginlogik darf zusammen mit ihren Tests entfernt werden, wenn keine persistierte externe Verpflichtung besteht.
**Datum:** 2026-07-15

## ADR-005 — Community und Graph bleiben Labs

**Status:** abgelöst durch ADR-007
**Kontext:** Lokale Community- und Graph-Demos zeigen technische Möglichkeiten, aber weder echte Mitgliedschaftsrechte noch nachgewiesenen Lernnutzen.
**Entscheidung:** Community und Deck-Graph waren Labs. Diese Zwischenentscheidung wird durch ADR-007 abgelöst.
**Konsequenzen:** Es besteht kein Kompatibilitätsanspruch für die früheren Oberflächen oder Daten.
**Datum:** 2026-07-15

## ADR-006 — Keine generische Anbieteradapter-Schicht

**Status:** angenommen
**Kontext:** Es gibt jeweils nur einen real betriebenen Pfad für Auth und Cloud-Persistenz.
**Entscheidung:** Konkrete tiefe Module kapseln Supabase. Eine generische Adapterebene entsteht erst, wenn mindestens zwei reale Implementierungen gleichzeitig unterstützt werden müssen.
**Konsequenzen:** React bleibt providerfrei, ohne hypothetische Interfaces und Konfigurationen einzuführen.
**Datum:** 2026-07-13

## ADR-007 — Labs und serverseitigen Groß-APKG-Pfad entfernen

**Status:** angenommen
**Kontext:** Labs-, KI-, Community- und Großdatei-Vorleistungen durchzogen UI, Domainmodell, APIs, Datenbank und Betrieb, ohne Teil des freigegebenen Kernprodukts zu sein.
**Entscheidung:** Diese Funktionen sind vollständig entfernt. APKG bleibt bis einschließlich 250 MB lokal. Stapel sind implizit privat. App-State v3 und Export v2 enthalten ausschließlich Core-Daten; V1-Exporte bleiben lesbar, wobei Labs-Inhalte verworfen werden. Eine produktive Datenlöschung ist irreversibel und darf nur nach App-Deployment und verifizierter CoRe-Projekt-Ref erfolgen.
**Konsequenzen:** Es gibt keinen Labs-Kompatibilitätspfad, keinen Server-APKG-Fallback und keine allgemeine Feature-Registry. `VariantGenerationSource: "ai_generated"` bleibt ausschließlich als Herkunftswert der Core-Variantenlogik bestehen. Google und Magic Link bleiben über getrennte Flags schaltbar.
**Datum:** 2026-08-01

## ADR-008 — Eine gemeinsame Stapelkarte mit kontextabhängiger Hauptaktion

**Status:** teilweise abgelöst durch ADR-012, ADR-016, ADR-023 und ADR-030
**Kontext:** Dashboard, Lernen und Kartenverwaltung zeigten denselben Stapelbaum mit abweichenden Kennzahlen, Aktivierungsflächen und wiederholten Werkzeugen. Die frühere Trennung aus ADR-002 beseitigte zwar unklare Gesten, verhinderte aber auch die bereits bewährte direkte Strukturierung im sichtbaren Baum.
**Entscheidung:** Alle drei Bereiche verwenden eine gemeinsame einklappbare Stapelkarte mit identischer Zeilenfolge: Icon, Name und Pfad, Teilbaum-Kennzahlen, Fortschrittsdonut und ganz rechts Stapeloptionen. Die neutrale Fläche startet in Dashboard und Lernen die Sitzung und öffnet in der Kartenverwaltung die Karten; dieselbe tatsächlich getroffene Fläche verarbeitet den Desktop-Drag über Pointer-Ereignisse, ohne dabei Zeilentext zu selektieren. Dashboard, Lernen und Kartenverwaltung erlauben sichtbares direktes Drag-and-drop auf einen Stapel oder die Hauptebenen-Zone; ungültige und unveränderte Ziele sind No-ops und ein Drag löst keine Flächenaktion aus. Interaktive Strukturänderungen sind auf vier sichtbare Ebenen begrenzt. Tiefere APKG-Hierarchien bleiben beim Import erhalten und dürfen anschließend nur regelkonform oder flacher verschoben werden. Die Kartenverwaltung bündelt erweiterte Werkzeuge einmal beim ausgewählten Stapel und behält das bestätigte Verschieben als Tastatur-, Touch- und Accessibility-Fallback. Stapeloptionen tragen ihren Rückkehrkontext in der URL.
**Konsequenzen:** Darstellung, Reihenfolge, Keyboard-Aktivierung, Collapse, Drag-Quelle und -Zustände, Tiefenfarben und Kennzahlsemantik besitzen eine kanonische UI-Implementierung. Die fachliche Workspace-Mutation prüft dieselbe Platzierungsregel wie die UI; das persistierte Deck-Schema bleibt unverändert. ADR-002 ist hinsichtlich des Verbots direkter Strukturierung abgelöst; die dort festgelegte Trennung von Lern- und Verwaltungsaufgabe bleibt erhalten.
**Datum:** 2026-08-03

## ADR-009 — FSRS-6 mit stabiler Tageslernphase

**Status:** angenommen
**Kontext:** Der bisherige Scheduler führte FSRS-Begriffe, verwendete aber eigene Formeln. Neue Karten konnten außerdem trotz gespeicherter Lernschritte am Ende einer Sitzung verschwinden.
**Entscheidung:** `src/scheduler.ts` verwendet `ts-fsrs@5.4.1` mit FSRS-6, offiziellen 21 Standardparametern, deaktiviertem Fuzzing und stapelspezifischer Zielerinnerung sowie Lernschritten. Neue Karten benötigen einen zweiten Kontakt am selben Tag; auch `Leicht` darf ihn beim Erstkontakt nicht überspringen. Sitzungen zeigen zunächst eindeutige Karten und danach ihre Wiederholungen, nötigenfalls vor dem gespeicherten Termin. Persönliche Parameteroptimierung bleibt außerhalb dieses Pakets.
**Konsequenzen:** Vorschau und Commit bleiben deterministisch. `fsrs_v1`-Zustände werden ohne Mass Rescheduling beim nächsten Review nach `fsrs_6_v1` überführt. Feste Start- und Leichtintervalle bleiben nur datenkompatibel erhalten und steuern die Oberfläche oder Langzeitplanung nicht mehr.
**Datum:** 2026-08-03

## ADR-010 — Scheduler-Testmodus bleibt transient und verwendet den Produktpfad

**Status:** abgelöst durch ADR-013
**Kontext:** Lernende sollen FSRS-Termine über simulierte Tage nachvollziehen können, ohne die Accountzeit zu verändern oder Testbewertungen mit echten Lern- und Syncdaten zu vermischen.
**Entscheidung:** `/testmodus` besitzt einen eigenen transienten Teststapel und eine simulierte Uhr. Er verwendet für Queue, Bewertungen, Lernschritte und Langzeitintervalle unverändert `reviewService.ts` und `scheduler.ts`, erhält aber keine Workspace-, Repository- oder Sync-Callbacks.
**Konsequenzen:** Diese Trennung wurde durch ADR-013 abgelöst. Der eigene Teststapel und `/testmodus` besitzen keinen Kompatibilitätsanspruch.
**Datum:** 2026-08-03

## ADR-011 — Schmale OpenRouter-Route für Basic-Kartenvarianten

**Status:** angenommen
**Kontext:** Basic-Karten sollen auf ausdrückliche Aktion als nahe Kartenvariante umformuliert werden, ohne die entfernte breite KI-, Labs- oder Job-Infrastruktur zurückzubringen und ohne Provider-Schlüssel im Browser zu exponieren.
**Entscheidung:** Genau `POST /api/ai/card-variant` ist als authentifizierte Vercel Function freigegeben. Sie überträgt ausschließlich begrenzte, bereinigte Vorder-/Rückseitentexte an OpenRouter, erzwingt einen einzelnen strukturierten Tool Call und wählt nur kostenlose textfähige Tool-Modelle. ZDR wird bevorzugt; ein sichtbarer kostenloser Non-ZDR-Fallback bleibt zulässig. Das Ergebnis wird nach Änderungs- und Duplikatprüfung als bestehende `ai_generated`-Variante am Original gespeichert.
**Konsequenzen:** Es entstehen keine Datenbankmigration, Jobhistorie, Vorschau, Chatfläche, Anbieteradapter, Bildübertragung oder bezahlter Fallback. ADR-007 bleibt für die entfernten breiten KI-/Labs-Pfade bestehen; seine Aussage, `ai_generated` sei nur ein ungenutzter Herkunftswert, ist durch diese eng begrenzte Route abgelöst. Ergänzung 2026-10-08: Seit ADR-032 ist die Quelle der bereinigte Klartext von Frage und Antwort jeder Karte mit Frage-/Antwort-Abfrage; der Routenvertrag `{ front, back }` bleibt unverändert.
**Datum:** 2026-08-04

## ADR-012 — Kompakte Stapelzeile mit kontextgebundenem Drag-and-drop

**Status:** teilweise abgelöst durch ADR-014, ADR-016, ADR-017, ADR-023 und ADR-030
**Kontext:** Die verschachtelten Stapelkarten in Dashboard und Lernen beanspruchten deutlich mehr Raum als die kompakten Stapelköpfe der Kartenverwaltung. Zugleich ist direktes Drag-and-drop in der inhaltsorientierten Kartentabelle leichter mit Aufklappen, Auswahl und Bearbeitung zu verwechseln.
**Entscheidung:** Dashboard, Lernen und Kartenverwaltung verwenden denselben kompakten Zeileninhalt aus Chevron, Icon, Name und Pfad, Kennzahlen, Donut und Drei-Punkte-Aktion. Dashboard und Lernen projizieren die Hierarchie flach, behalten Teilbaum-Kennzahlen und erlauben direkten Desktop-Drag; ihre Drei-Punkte-Aktion öffnet direkt die Stapel-Einstellungen. Die Kartenverwaltung behält direkte Kennzahlen, ihr vollständiges Optionsmenü und ausschließlich den bestätigten Verschiebeablauf. Alle Drei-Punkte-Aktionen besitzen einen pfadspezifischen Tooltip.
**Konsequenzen:** Darstellung und Reihenfolge besitzen eine kanonische UI-Implementierung, während Aktivierung, Kennzahlquelle und Aktionen vom jeweiligen Aufgabenbereich geliefert werden. ADR-008 ist hinsichtlich der verschachtelten Kartenform und des direkten Drag-and-drops in der Kartenverwaltung abgelöst. Workspace-Mutation, Vier-Ebenen-Regel und persistiertes Deck-Schema bleiben unverändert.
**Datum:** 2026-08-06

## ADR-013 — Transiente Lernuhr für echte Accountkarten

**Status:** angenommen
**Kontext:** Schedulerintervalle sollen an den vorhandenen Karten über frei gewählte Zukunftstage nachvollziehbar sein. Ein isolierter Teststapel bildet weder den tatsächlichen Kartenfortschritt noch die Fälligkeitsprojektionen der normalen Produktoberflächen ab.
**Entscheidung:** `/simulator` steuert einen ausschließlich im App-Prozess gehaltenen Tagesoffset von 0 bis 3.650 Tagen. Alle lernbezogenen Projektionen verwenden diesen Zeitpunkt; operative Systemzeiten bleiben real. Das Umstellen ist mutationsfrei. Eine im Zukunftsmodus ausgeführte Bewertung ist bewusst ein echtes, synchronisiertes Review mit simuliertem Bewertungszeitpunkt und normalem Scheduler-Commit.
**Konsequenzen:** Die App kennzeichnet einen aktiven Zukunftstag in Shell und Vollbildreview. Reload, Logout oder „Heute“ setzen nur den Offset zurück und machen gespeicherte Reviews nicht rückgängig. Eine rücksetzbare Sandbox, Simulationskennzeichnung in Review-Events sowie Rollen- oder Premium-Gating bleiben eigenständige spätere Entscheidungen.
**Datum:** 2026-08-06

## ADR-014 — Einheitliches Stapelmenü und stabiler Panel-Drag

**Status:** teilweise abgelöst durch ADR-017, ADR-023 und ADR-030
**Kontext:** Dashboard und Lernen verwendeten unterschiedliche Panelrahmen; die außerhalb der Liste liegende Hauptebenen-Zone verlor beim Verlassen der Zeilenfläche den Pointer-Griff. Zugleich führten identische Drei-Punkte-Trigger je nach Ansicht entweder direkt in die Einstellungen oder in ein umfangreiches Zwischenmenü.
**Entscheidung:** Dashboard und Lernen teilen das vollständige Panel `Aktive Stapel`; dessen Kopf besitzt ausschließlich Titel und optionale Aktion. Desktop-Drag hält den Pointer per Capture bis Drop oder Abbruch und aktiviert ein globales Fokus-Overlay. Quelle und aktuelles Ziel bleiben mit eckiger Zeilenform ausgespart; die Hauptebenen-Zone wird lokal vom `DeckTree` ausschließlich über die vorhandene Sidebar beziehungsweise Bottom-Bar projiziert. Dashboard, Lernen und Kartenverwaltung verwenden dasselbe reduzierte Menü aus Deckdarstellung, Pfad, CoRe-Modus, Einstellungen und bestätigtem Verschieben. Umbenennen, Unterstapel, Lernen, Variantenlernen und Löschen liegen ausschließlich in den Stapel-Einstellungen.
**Konsequenzen:** Es gibt nur einen Menü- und Verschiebedialogpfad. Reviewstart aus den Einstellungen kehrt zum reproduzierbaren Ursprung zurück. ADR-012 ist hinsichtlich direktem Einstellungsaufruf und des vollständigen Kartenverwaltungsmenüs abgelöst; Zeilenform, Kennzahlsemantik, Vier-Ebenen-Regel und persistiertes Schema bleiben unverändert.
**Datum:** 2026-08-06

## ADR-015 — Globale FSRS-Statistik und analytische Anki-Historie

**Status:** angenommen
**Kontext:** Die bisherige Statistik projizierte wenige unverbundene Kennzahlen ohne gemeinsamen Zeitraum oder Mehrfach-Stapelauswahl. Zugleich enthält APKG häufig wertvolle Reviewhistorie, deren Übernahme den aktuellen CoRe-Schedulerzustand aber nicht verfälschen darf.
**Entscheidung:** Statistik besitzt genau eine globale Zeitraum- und Stapelauswahl und wird aus append-only Review Events sowie aktuellen Varianten-Snapshots durch `statisticsModel.ts` projiziert. Aktuelle Gedächtnisverteilungen verwenden FSRS-Schwierigkeit, Stabilität und Abrufwahrscheinlichkeit statt klassischer Ease. APKG-`revlog` wird ausschließlich als deterministisch deduplizierte Analysehistorie importiert; aktueller Review State und Fälligkeit bleiben neutral. Neue CoRe-Reviews messen reale Antwortzeit bis maximal 60 Sekunden im bestehenden Ereignisfeld.
**Konsequenzen:** Es gibt keine parallele Statistikprojektion, keine serverseitige Aggregationstabelle und keine Schedulermigration. Historische Antwortzeiten bleiben optional. Diagramme arbeiten mit begrenzten Aggregaten; Rohereignisse verbleiben hinter dem Statistikmodell. Reimport kann neue historische Ereignisse ergänzen, aber weder vorhandene Ereignisse überschreiben noch Karten als gelernt markieren.
**Datum:** 2026-08-06

## ADR-016 — Einzeilige, alphabetisch sortierte Stapelbäume

**Status:** teilweise abgelöst durch ADR-017 und ADR-030
**Kontext:** Der sichtbare Hierarchiepfad wiederholte in Desktop-Zeilen die bereits durch Einrückung und Auf-/Zuklappen eindeutige Baumstruktur. Zugleich übernahmen Stapelbäume teilweise die Import- oder Speicherreihenfolge und wichen damit von Ankis alphabetischer Stapelliste ab.
**Entscheidung:** Dashboard, Lernen und Kartenverwaltung zeigen bei jeder Breite ausschließlich den lokalen Stapelnamen ohne sichtbaren Hierarchiepfad. Stapelbäume und Stapelauswahlen sortieren Hauptstapel sowie jede Unterebene separat alphabetisch nach dem lokalen Namen und ohne numerische Sonderbehandlung. Vollständige Pfade bleiben für zugängliche Namen, Tooltips, Menüs, Suche und geschlossene Auswahlfelder erhalten.
**Konsequenzen:** Stapelnamen stehen vertikal mittig in einer einzeiligen Zeile. Persistierte Deckreihenfolge und Hierarchie bleiben unverändert; nur ihre Projektion wird sortiert. ADR-008 und ADR-012 sind hinsichtlich des sichtbaren Pfads in der gemeinsamen Stapelzeile abgelöst.
**Datum:** 2026-08-09

## ADR-017 — Lokale Namen und Stapel-Icons in Stapeloptionen

**Status:** teilweise abgelöst durch ADR-030
**Kontext:** Nach wiederholtem Verschachteln oder Verschieben wiederholt ein vollständiger Hierarchiepfad im Tooltip und im geöffneten Stapelmenü bereits sichtbare Baumstruktur und kann dadurch unnötig lang werden. Gleichnamige Unterstapel müssen für assistive Technik dennoch unterscheidbar bleiben.
**Entscheidung:** Dashboard, Lernen und Kartenverwaltung zeigen im Drei-Punkte-Tooltip und im Kopf des gemeinsamen Stapelmenüs ausschließlich den lokalen Stapelnamen. Der Tooltip ergänzt das aktuelle farbige Stapel-Icon mit 16 × 16 px innerhalb der bestehenden Einzeilerhöhe; auch `Stapel umbenennen` verwendet dieses Icon. Der zugängliche Name des Drei-Punkte-Triggers behält den vollständigen Hierarchiepfad.
**Konsequenzen:** Auswahlfelder, Suche, Hierarchie, Persistenz und andere Pfadverwendungen bleiben unverändert. ADR-012, ADR-014 und ADR-016 sind hinsichtlich sichtbarer vollständiger Pfade in Stapeloptionen abgelöst.
**Datum:** 2026-08-10

## ADR-018 — Lernprofile als Copy-on-apply-Vorlagen

**Status:** angenommen
**Kontext:** Globale Lernvorgaben überschrieben bisher beim Autosave alle Stapel, obwohl Scheduler und Queue ausschließlich materialisierte Stapelwerte lesen. Eine Profil-ID mit gleichzeitig duplizierten Stapelwerten hätte eine zweite, konfliktanfällige Wahrheitsquelle geschaffen.
**Entscheidung:** Globale Scheduler-Präferenzen enthalten nur Tagesbeginn, Vorziehfenster und eine konto-weite Bibliothek eigener Lernprofil-Vorlagen. Vorlagen werden ausschließlich in den Stapeleinstellungen verwaltet. Anwenden kopiert die normalisierten Lernwerte und eine Herkunftsversion in genau einen Stapel; es gibt keine Live-Auflösung und keine globalen Stapel-Defaults. CoRe-Modus, Variantenparameter, Darstellung, technische Ausschlüsse und Tagesoverride bleiben außerhalb der Vorlage. Cloud-Sync nutzt das vorhandene Profil-JSONB mit Last-write-wins; Stapelwerte bleiben revisioniert.
**Konsequenzen:** Globale Änderungen können keinen Stapel mehr mutieren. Umbenennen, Aktualisieren und Löschen einer Vorlage verändert bereits kopierte Werte nicht; ältere Kopien können bewusst erneut angewandt werden. Alte globale Felder werden beim Normalisieren zurückgewonnen und danach nicht mehr geschrieben. Es entstehen weder Supabase-Schemamigration noch Resolver- oder Override-Graph.
**Datum:** 2026-08-11

## ADR-019 — Easy Days als globaler Wochenrhythmus

**Status:** angenommen
**Kontext:** Ruhigere Wochentage beschreiben die persönliche Verfügbarkeit und nicht die Lernlogik eines einzelnen Stapels. Eine stapelbezogene Copy-on-apply-Vorlage könnte dieselbe Woche widersprüchlich mehrfach abbilden. Zugleich darf eine Lastverteilung die FSRS-Gedächtnisparameter nicht durch eine zweite Intervallformel ersetzen.
**Entscheidung:** Globale Scheduler-Präferenzen der Version 2 führen für Montag bis Sonntag jeweils `Normal`, `Weniger` oder `Minimal`. Sieben gleiche Werte sind neutral. Ausschließlich neu berechnete Review-Tagesintervalle von 3 bis 90 Tagen dürfen innerhalb des offiziellen `ts-fsrs.get_fuzz_range()` auf den nach accountweiter Fälligkeitslast und Tagesgewicht besten Lerntag gelegt werden. Vorschau und Commit verwenden dieselbe Lastmomentaufnahme, Profilzeitzone, Tagesgrenze und DST-sichere Kalenderaddition. Nur `dueAt` und das tatsächliche Intervall ändern sich; Stabilität, Schwierigkeit und Zielerinnerung bleiben das rohe FSRS-Ergebnis.
**Konsequenzen:** Änderungen wirken nicht rückwirkend und erzeugen keine Datenbankmigration. Das Profil-JSONB transportiert sieben additive Werte. Geschwisterverteilung, freie Gewichte, Kalenderausnahmen, Urlaubsmodus und persönliche FSRS-Optimierung bleiben außerhalb.
**Datum:** 2026-08-11

## ADR-020 — Accountgebundene IndexedDB-Entities und Delta-Sync

**Status:** abgelöst durch ADR-028
**Kontext:** Ein synchron serialisierter Root-State und normale Vollsnapshot-Synchronisierung skalieren weder für große Kartenbestände noch für lange Reviewhistorien. Gleichzeitig existiert nur ein realer lokaler und ein realer Cloud-Persistenzpfad; eine generische Provider-Abstraktion wäre nicht gerechtfertigt.
**Entscheidung:** Angemeldete Accounts verwenden eine konkrete IndexedDB-Datenbank mit getrennten Stores für Decks, Karten, Varianten, Reviewereignisse, Dokumente, Notiztypen, Quellsnapshots, Outbox und Sync-Metadaten. Der frühere App-State wird einmal transaktional übernommen und danach nicht parallel weitergeschrieben. Normale Cloudänderungen sind typisierte Entity-Mutationen mit Basisrevision; vollständige Zustände werden ausschließlich für expliziten Export, Restore und die einmalige Legacy-Migration materialisiert. Ein Import schreibt seinen normalisierten Graphen direkt in Entity-Stores. Eine Reviewantwort schreibt Karte, Variante, Deckrevision und genau ein idempotentes Ereignis in einer atomaren Postgres-Funktion. Fehlt diese Funktion, bleibt die Outbox erhalten und die Oberfläche zeigt einen deutschen Fehler. Die Review-/Revisionssemantik und der vollständige Zyklus sind durch ADR-022 abgelöst.
**Konsequenzen:** `localStorage` bleibt auf kleine Präferenzen, Geräte- und Migrationsmarker begrenzt. Boot, Kartenbrowser, Review und Statistik konsumieren die paginierten beziehungsweise scopegebundenen Repositoryabfragen; Folgesyncs verwenden persistierte, servergestempelte `sync_change_id`-/ID-Keyset-Cursor statt veränderlicher Fachzeitstempel. Rust/WASM oder Elixir sind kein Ersatz für Materialisierungs-, Algorithmus- oder Datenzugriffsgrenzen.
**Datum:** 2026-08-11

## ADR-021 — Dynamische Lerninhalte und sichere Anki-Projektion

**Status:** abgelöst durch ADR-029
**Kontext:** Anki-Felder sind frei benennbar, Notetypes können mehrere Felder und Templates besitzen und CSS sowie Kartengenerierungsregeln bestimmen die Darstellung. Eine Zuordnung über die ersten zwei Felder, Feldnamenregexe oder feste CoRe-Kartentypen verliert Information und kann beim Reimport lokale Änderungen oder getrennte Anki-Card-Zustände beschädigen.
**Entscheidung:** CoRe verwendet `LearningItemDocumentV1` als feldzentrierte Inhaltswahrheit und unveränderliche, über einen semantischen Hash deduplizierbare `NoteTypeDefinitionV1`-Revisionen. Jede APKG-Quelle erhält zusätzlich einen unveränderlichen Snapshot einschließlich bekannter Konfiguration und unbekannter Rohbytes. `applyLearningItemContent()` besitzt Validierung, Projektion und Variantenidentität; `renderLearningItemPresentation()` ist der gemeinsame sichere Renderer für Vorschau, Kartenverwaltung und Review. Dokumentierte statische Anki-Semantik wird in einem opaken Sandbox-Frame ohne Scripts und Netzwerkzugriff ausgeführt; unsichere Funktionen werden erhalten, nicht ausgeführt und führen transparent in eine Feldansicht. CSV- und Tabellenfelder werden ausschließlich deterministisch und nutzerbestätigt zugeordnet. Der initiale Anki-Lernstand wird pro Card mit der Priorität FSRS-Memory-State, Revlog-Replay, klassischer Kartenstatus, neue Karte angenähert; die importierten Revlog-Ereignisse bleiben unabhängig davon append-only Analytics.
**Konsequenzen:** Bilder und Cloze sind Inhalt beziehungsweise Editoraktion statt eigener primärer Kartentypen; Reverse und Multiple Choice sind Review-Rezepte. Importierte Feldwerte sind editierbar, ihr Schema und ihre Templates bleiben zunächst strukturell schreibgeschützt. Template-JavaScript, Add-on-/Custom-Filter, externe Ressourcen und native LaTeX werden nicht ausgeführt. Anki-Code oder `rslib` wird nicht in das Produktionsbundle übernommen. ADR-015 bleibt für Statistik und append-only Ereignisse gültig, ist aber hinsichtlich des Verbots einer initialen, diagnostizierten Schedulermigration abgelöst.
**Datum:** 2026-08-11

## ADR-022 — Fachliche Revisionen und vollständiger inkrementeller Sync

**Status:** teilweise abgelöst durch ADR-029
**Kontext:** Der bisherige Push-Pfad lud Cloud-Deltas nur beim Login, behandelte einen Batchkonflikt als Fehler des ganzen Blocks und ließ die konfliktverursachende Mutation nach Cloud-Wins bestehen. Technische Felder und Reviewprojektionen erhöhten Inhaltsrevisionen; die Einführung der verpflichtenden Originalvariante machte dadurch abgeleitete Lücken zu Benutzerkonflikten.
**Entscheidung:** `syncNow()` führt accountgebunden genau einen zusammengefassten Zyklus aus lokalem Flush, isoliertem Outbox-Push, `sync_change_id`-Delta-Pull und Konfliktaktualisierung aus. Realtime wird nicht eingeführt. `revision` zählt nur fachlichen Inhalt; technische Projektionen sind weder Konfliktfelder noch alleinige Konfliktursache. Reviewereignisse bleiben append-only, erhöhen keine Inhaltsrevision und projizieren nur in zeitlicher Reihenfolge. Fehlende Originalvarianten sowie technische Alt-Abweichungen werden idempotent repariert. Aktive Konflikte sind je Entität eindeutig; Richtungsentscheidungen entfernen die Zielmutation und betreffen ausschließlich die aktuelle Konfliktmenge.
**Konsequenzen:** Autosync nutzt Debounce, Online, Fokus und ein sichtbares 0/1/5/15/30-Minuten-Intervall mit Standard 5. Der Browser kann einen Netzwerkabschluss beim Schließen nicht garantieren; IndexedDB bleibt die Wiederanlaufwahrheit. Konfliktkarten werden quarantänisiert, konfliktfreie Karten, Reviews und Medien bleiben benutzbar. Ein kompletter Account-Override, Supabase Realtime, ein Desktop-Wrapper und ein gemeinsamer Mediensync gehören nicht zu dieser Entscheidung.
**Datum:** 2026-08-14

## ADR-023 — Kontextgebundener Lernstatus und Hauptbaumgrenzen

**Status:** teilweise abgelöst durch ADR-026
**Kontext:** Der gemeinsame Stapelinhalt führte Lernkennzahlen und Donut auch in der inhaltsorientierten Kartenverwaltung, obwohl dort Stapelidentität und Kartenbearbeitung im Vordergrund stehen. Dünne Grenzen zwischen allen Hierarchiezeilen zerschnitten zusammengehörige Bäume; der Hover von Dashboard und Lernen färbte dagegen nur eine Rahmenkante ein.
**Entscheidung:** `DeckSummaryRow` bleibt der einzige Zeilenrenderer und erhält einen optionalen, unteilbaren Lernstatusblock. Nur Dashboard und Lernen liefern Tageskennzahlen und Gesamtbestandsdonut; die Kartenverwaltung rendert in Stapelköpfen ausschließlich Identität und Aktion. Alle drei Ansichten verwenden dieselbe neutrale vollflächige Hover-Füllung. Eine 2-px-Linie trennt ausschließlich aufeinanderfolgende Hauptstapel-Bäume, innerhalb eines Baums existiert keine Stapel-Trennlinie. Kartenzeilen behalten ihre dünnen Grenzen. Feste und responsive Dichten sind direkte Varianten von `DeckSummaryRow`; der funktionslose Kompakt-Wrapper entfällt.
**Konsequenzen:** Kennzahl- und Bestandsmodelle bleiben unverändert und werden in der Kartenverwaltung lediglich nicht projiziert. Individuelle Kartenwerte wie `Neu` im Datumsfeld bleiben sichtbar. Tabellen- und Baumsemantik, Auf-/Zuklappen, Drag-and-drop, Auswahl, Stapeloptionen und Persistenz ändern sich nicht. ADR-008, ADR-012 und ADR-014 sind hinsichtlich sichtbarer Kartenverwaltungs-Kennzahlen sowie der Zeilen- und Hoverform abgelöst.
**Datum:** 2026-08-15

## ADR-024 — Local-first Start, begrenzte Datenfenster und vertrauenswürdiges Gerät

**Status:** abgelöst durch ADR-028
**Kontext:** Ein Account-Boot mit Reparaturmanifest, sieben tabellenweisen Pulls und Konflikt-Doppelabfrage blockierte die nutzbare Oberfläche. Große Stapel wurden beim Lernstart vollständig hydriert. Mit wachsendem Featureumfang dürfen weder Code- noch Accountgröße den Startpfad linear vergrößern.
**Entscheidung:** Nach genau einer Supabase-Sitzungsprüfung öffnet CoRe zuerst die accountgebundene IndexedDB-Shell. Kleine, bytebegrenzte Bootstrap- und Delta-Abrufe laufen danach im Hintergrund; Realtime ist höchstens ein späterer Änderungshinweis, nie die Sync-Wahrheit. Kartenverwaltung und Lernqueue lesen cursorbasiert höchstens 50 Karten und hydrieren nur deren Varianten. Produktscreens bleiben dynamische Chunks. Nach einer ruhigen Sekunde dürfen `Lernen` und `Karten` seriell automatisch nur bei gemeldetem 4G oder fehlender Network-Information vorgeladen werden; 3G erlaubt ausschließlich Hover, Fokus oder Touchstart. Datensparmodus, 2G, unsichtbarer Tab und Nutzerinteraktion stoppen die Spekulation. Die PWA cached ausschließlich App-Shell und bereits abgerufene statische Ressourcen. Strukturierte Accountdaten bleiben in IndexedDB, Medien im Browser selektiv. Ein bereits eingerichtetes Gerät darf bei einem reinen Netzwerkfehler aus der persistierten Supabase-Sitzung und seiner lokalen Replica offline kalt starten. Das ist kein lokaler Passwort- oder Auth-Provider.
**Konsequenzen:** Der Cloud-Abgleich kann fehlschlagen, ohne den lokalen Start zu verlieren; lokale Mutationen bleiben in der Outbox. Logout entfernt die Supabase-Accountfreigabe, ohne einen zweiten Loginpfad einzuführen. Browser-Speicher wird nach Möglichkeit persistent angefordert und Quote sowie Nutzung werden sichtbar; 10 GB Medien sind im Web trotzdem nicht als vollständig lokaler Bestand garantiert. Supabase bleibt Auth-, Postgres-, Storage- und Backup-Plattform. Ein eigener Sync-Dienst vor demselben Postgres wird erst geprüft, wenn die dokumentierten Latenz-, Last-, Fehler- oder Kostengates nach Index-, RPC- und Compute-Optimierung wiederholt scheitern. ADR-004 ist nur hinsichtlich des ausdrücklich ausgeschlossenen Offline-Kaltstarts abgelöst.
**Datum:** 2026-08-15

## ADR-025 — Lokale Stapelprojektionen

**Status:** abgelöst durch ADR-028
**Kontext:** Die bisherige Stapelzusammenfassung zählte bei jedem Aufruf Karten- und Variantenindizes und lief für die Heatmap durch alle zukünftigen Kartentermine. Der reproduzierbare gedrosselte Start belegte dadurch einen 231-ms-Main-Thread-Task. Mit großen Stapeln darf der häufige Dashboardpfad nicht proportional zur Kartenzahl wachsen.
**Entscheidung:** `listDeckSummaries()` bleibt die einzige React-seitige Schnittstelle, liest intern aber löschbare lokale `DeckStudySummary`-Projektionen und kompakte Fälligkeits-Buckets aus IndexedDB v5. Einzelne Kartenwrites und Reviews pflegen diese Ableitungen in derselben lokalen Transaktion. Import-, Restore-, Cloud- und Konfliktpfade markieren ausschließlich betroffene Stapel dirty. Der Neuaufbau scannt Karten über einen zusammengesetzten Stapel-/ID-Index in höchstens 250er-Chunks, gibt spätestens nach 25 ms freiwillig ab und speichert Stapel-, Phasen- und Entitätscursor als fortsetzbaren Checkpoint. Ein Dirty-Token verhindert den Abschluss einer durch parallele Writes veralteten Berechnung. Zeitzone und Tagesbeginn gehören zum Projektionskontext; Konfliktkarten fehlen in lernbaren Zählern.
**Konsequenzen:** Normale Starts lesen Stapelzähler ohne Karten- oder Variantenscan. Das Schema-Upgrade legt nur Stores und Indizes an; die Erstbefüllung beginnt nach dem nutzbaren Workspace und darf unterbrochen werden. Projektionen, Buckets und Checkpoint sind keine Cloud-, Outbox-, Export- oder Konfliktwahrheit und können vollständig neu berechnet werden. Das Supabase-Schema und `listDeckSummaries()` ändern sich nicht.
**Datum:** 2026-08-16

## ADR-026 — Trennlinienlose Stapelprojektionen

**Status:** angenommen
**Kontext:** Die 2-px-Grenze zwischen aufeinanderfolgenden Hauptstapel-Bäumen blieb gegenüber den bewusst trennlinienlosen Unterstapeln visuell zu dominant und trennte gleichartige Stapelköpfe ohne zusätzliche fachliche Information.
**Entscheidung:** Dashboard, Lernen und Kartenverwaltung rendern alle Stapelköpfe unabhängig von Wurzel und Hierarchieebene ohne horizontale Trennlinie. Hierarchien bleiben durch Tiefenfläche, Einrückung und Chevron erkennbar. Die dünnen Grenzen zwischen tatsächlichen Kartenzeilen der Kartenverwaltung bleiben bestehen.
**Konsequenzen:** `DeckTree` und Kartenverwaltung benötigen keine separate Hauptbaum-Grenzermittlung mehr. Auf-/Zuklappen, Drag-and-drop, Auswahl, Stapeloptionen sowie äußere Panel- und Tabellenrahmen ändern sich nicht. ADR-023 ist ausschließlich hinsichtlich der 2-px-Hauptbaumgrenze abgelöst.
**Datum:** 2026-08-16

## ADR-027 — Hybride Web-Replica und bedarfsbasierte Kartenkörper

**Status:** abgelöst durch ADR-028
**Kontext:** Der bisherige Erstabgleich lud nach einem kleinen Bootstrap vollständige Zeilen aus sieben Tabellen. Damit wuchsen neuer Browserstart, Kartenbestand und die Zahl der Requests mit der gesamten Reviewhistorie. Zugleich kann Browserspeicher trotz persistenter IndexedDB gelöscht werden und darf nicht als einzige Accountwahrheit gelten.
**Entscheidung:** CoRe verwendet im Web eine hybride Offline-Replica. Deck-Hüllen, serverseitige Summaries und ein kompakter Kartenkatalog liegen lokal; vollständige Kartenkörper, Varianten und Abhängigkeiten werden für Öffnen, Direktlink, das rollende Lernfenster oder einen ausdrücklich angehefteten Deck-Download hydriert. `card_catalog` und `deck_study_summaries` sind transaktional gepflegte, wiederaufbaubare Cloud-Projektionen mit Account-RLS und eigenen Wasserzeichen. Bootstrap-v2 bestätigt ausdrücklich leer oder nichtleer und bleibt unter 200 KiB. Statistik wird serverseitig aggregiert. Export streamt vor dem Materialisieren vollständige kanonische Struktur- und Reviewdaten; APKG-Reimport verlangt die vollständigen betroffenen Strukturdaten. Eine Deckbaum-Löschung ist ein accountgebundenes, offline vormerkbares Serverkommando. Öffnen erzeugt Cache, Offline-Download erzeugt eine manifest- und hashgeprüfte Anheftung; Quota-LRU schützt Outbox, Konflikte, Downloads, aktive Lernkarten, Katalog und Hüllen.
**Konsequenzen:** Ein bekannter Browser startet aus der lokalen Shell, ein neuer nur aus der ersten gültigen Hüllenseite; vollständige Reconciliation blockiert nie. Supabase bleibt kanonische Account-, Postgres- und Storage-Plattform, während IndexedDB eine löschbare lokale Web-Replica ist. Realtime, Anbieterwechsel, automatische Recovery-Snapshots und native Paketierung sind nicht Teil dieser Entscheidung. Tauri 2, SQLite und Dateisystem-Medien folgen erst nach gemessener Stabilisierung der Syncverträge; bis dahin entsteht keine hypothetische Adapterhierarchie.
**Datum:** 2026-08-17

## ADR-028 — Frische Pre-Release-Baseline ohne Kompatibilitätspfade

**Status:** angenommen
**Kontext:** Die noch unveröffentlichte hybride Replica enthielt zugleich alte Voll-Delta-RPCs, eine mehrstufige SQL-Migrationskette, IndexedDB-Upgrades, lokale Stapelprojektionen und Backfillzustände. Da noch kein externer Datenbestand erhalten werden muss, würden diese Pfade dauerhaft Kosten und Fehlermöglichkeiten für einen nie benötigten Übergang erzeugen.
**Entscheidung:** Supabase wird aus genau einer frischen Baseline aufgebaut; Auth-Konten, App-Daten und Storage dürfen vor dem ersten Release nach bestätigter Projekt-Ref ersatzlos gelöscht werden. Lokal existiert nur `core.workspace.entities.v3.<userId>` mit Schema-Version 1. `card_catalog`, zeitstabile `deck_study_summaries` und bedarfsweise hydrierte Kartenkörper sind der einzige Replica-Pfad. Statistik ist online server-first und offline ausschließlich ein passender Snapshot plus ungesendete Bewertungen.
**Konsequenzen:** Es gibt keine v1-/v5-/v6-Kompatibilität, Voll-Delta-RPCs, `due_count`, Katalog-Backfills, Migrationsmarker, Legacy-localStorage-Übernahme oder parallele Projektion. Bootstrap-Hörer enden nach der ersten bestätigten Baseline. Baseline und additive Produktmigrationen, Verify-SQL, generierte Typen, RLS und Performance-Nachweise müssen vor einem destruktiven Remote-Reset grün sein; die genaue Projekt-Ref wird unmittelbar davor angezeigt und geprüft. Nach dem ersten extern genutzten Release ist ein ersatzloser Reset nicht mehr zulässig.
**Datum:** 2026-08-17

## ADR-029 — Anki-nahes Kartenmodell ohne Versionsverlauf

**Status:** teilweise abgelöst durch ADR-032
**Kontext:** Wiederherstellbare Inhaltsversionen, persistierte Quellen und als Varianten modellierte Anki-Karten machten CoRe komplexer als Anki. Vor dem ersten Release muss kein bestehender Datenbestand erhalten werden.
**Entscheidung:** Ein `LearningItem` ist genau eine planbare Karte. Reverse erzeugt zwei Karten, jede Cloze-Gruppe und jeder Anki-Card-Datensatz eine Karte. Nur KI-Umformulierungen bleiben untergeordnete Varianten ohne eigenen Lernstatus. Versionslogs, Restore, Notizinstanz-IDs, Quellsnapshots, Quelldokumente und CoRe-JSON-Portabilität entfallen vollständig. Manuelle Neuplanung ändert ausschließlich `dueAt` und technischen Zeitstempel und wird über den bestehenden atomaren Reviewpfad als idempotentes Ereignis mit `rating: "manual"` synchronisiert.
**Konsequenzen:** Supabase und IndexedDB starten direkt mit einer neuen Baseline ohne Migration oder Altlesepfad. Manuelle Ereignisse beeinflussen weder Statistik noch FSRS. Bei konkurrierenden Offline-Ereignissen gewinnt `(answeredAt, id)`. CoRe erhält beim Neuplanen neuer Karten bewusst deren Status und weicht darin von Anki ab.
**Datum:** 2026-08-20

## ADR-030 — Acht sichtbare Stapel-Ebenen mit erhaltener Importherkunft

**Status:** abgelöst durch ADR-031
**Kontext:** Vier interaktive Ebenen reichen für tief gegliederte Anki-Bestände nicht aus. Eine unbegrenzte Baumdarstellung würde zugleich Farben, Einrückung und mobile Namen unbrauchbar machen. Die tieferen Quellbeziehungen dürfen weder verloren gehen noch vorzeitig in das noch unvollständige Tag-System geschrieben werden.
**Entscheidung:** CoRe unterstützt Hauptstapel plus sieben Unterebenen. APKG-Quellknoten bis Ebene 8 bleiben hierarchisch unverändert; jeder Knoten ab Ebene 9 bleibt als eigener stabil identifizierter Stapel erhalten und wird als Geschwister auf Ebene 8 unter dem Quellvorfahren der Ebene 7 verankert. Aktueller CoRe-Pfad und unveränderte Anki-Importherkunft bleiben getrennt. Die gemeinsame Leseschnittstelle liefert Original- und Überlaufpfad für Warnung, Suche, Auswahl und Herkunftsfeedback, erzeugt aber keine Tags. Eine spätere Tagdarstellung leitet schreibgeschützte System-Tags zur Laufzeit aus dieser Herkunft ab.
**Konsequenzen:** Interaktive Platzierungen oberhalb Ebene 8 werden ohne Mutation abgelehnt. Die acht Gruppentöne interpolieren zwischen den bisherigen Endpunkten und werden bei Tiefe 7 begrenzt. Schmale Stapelzeilen dürfen Namen auf zwei Zeilen begrenzen. Persistenzschema, Karten-Tags und Reimportidentitäten bleiben unverändert; es entstehen keine Migration, Altlesepfade oder automatische Tag-Zuweisung. ADR-008, ADR-012 und ADR-014 sind hinsichtlich der Vier-Ebenen-Regel, ADR-016 hinsichtlich der zwingend einzeiligen schmalen Stapelzeile und ADR-017 hinsichtlich des ausschließlich lokalen Menükopfs für abgeflachte Importstapel abgelöst.
**Datum:** 2026-08-28

## ADR-031 — Unbegrenzte logische Stapelhierarchie mit sechs sichtbaren Tiefen

**Status:** angenommen
**Kontext:** Die fachliche Begrenzung auf acht Ebenen und die APKG-Abflachung verlieren echte Elternbeziehungen und verhindern das konsistente Verschieben vollständiger tiefer Unterbäume. Die mobile und schmale Darstellung benötigt weiterhin eine feste visuelle Grenze für Einrückung und Tiefenfarbe.
**Entscheidung:** Stapel besitzen kein fachliches Zahlenlimit. Anlegen, APKG-Import und Verschieben erhalten die unmittelbare Elternbeziehung und den vollständigen `hierarchyPath`; ein Drop auf einen Stapel bedeutet unabhängig von dessen Tiefe immer „als direkter Unterstapel“. Einrückung, Tiefenfarbe und sichtbares Tiefenattribut werden ab Ebene 6 auf dem Wert der sechsten Ebene gehalten. Die sechs Tiefenfarben verteilen das bisherige Spektrum linear in sRGB zwischen den unveränderten Light-/Dark-Endfarben, während Chevron, Baumreihenfolge, vollständige zugängliche Pfade und Auf-/Zuklappen der echten Hierarchie folgen. Reimporte bewahren lokalen Namen, Elternbeziehung, Pfad und Einstellungen gemeinsam. Es entstehen weder System-Tags noch neue Tag-Felder oder Schemaänderungen.
**Konsequenzen:** Die Workspace-Seam prüft ausschließlich fehlende Ziele, Selbstbezug und Nachfahrenzyklen und aktualisiert bei einer Verschiebung den gesamten Unterbaum. Bibliotheks- und Auswahlprojektionen arbeiten iterativ; Teilbaumaggregate benötigen nur direkte Kinder und `descendantCount`. APKG importiert den vollständigen Quellbaum ohne Abflachungswarnung oder Überlaufmetadaten. Bereits abgeflachte Entwicklungsdaten werden nicht repariert und benötigen für die vollständige Hierarchie einen frischen Import beziehungsweise Entwicklungsreset. Praktische Tiefe wird nur durch Browser-, Speicher- und Datenvolumenressourcen begrenzt. ADR-030 ist vollständig abgelöst; die rein visuelle Kappung gilt jetzt ab Ebene 6.
**Datum:** 2026-08-29

## ADR-032 — Inhalt und Abfrage getrennt

**Status:** angenommen
**Kontext:** Nach ADR-029 trägt jede planbare Karte eine vollständige eigene Kopie ihres Inhalts einschließlich Feldern und gerendertem HTML. Ein Lückentext mit vier Lücken liegt dadurch mehrfach redundant in Cloud, Sync und Web-Replica; eine Korrektur wirkt nur auf eine Karte, und Geschwisterregeln wie Ankis Begraben sind nicht abbildbar. Eine geplante vollständige Offline-Replik auf Mobilgeräten würde Datenmenge und Konfliktfläche zusätzlich vergrößern. Vor dem ersten Release muss kein Datenbestand erhalten werden.
**Entscheidung:** CoRe trennt wie Anki zwischen einem Inhalt (`Note`) und seinen planbaren Abfragen (`Card`). Ein Inhalt besitzt Felder, Bausteine, Tags, Quelle und Inhaltsrevision genau einmal und gehört keinem Stapel. Eine Karte verweist auf genau einen Inhalt und besitzt Stapel, deterministischen Abfrageschlüssel, Status, eigenen Lernstand, eigene Reviewereignisse und ihre KI-Umformulierungen. Welche Karten existieren, wird aus den aktiven Bausteinen des Inhalts abgeleitet. Eine Inhaltsänderung wirkt auf alle Geschwister. Löschen folgt Anki: Wer eine Karte löscht, löscht nach einer Bestätigung mit Kartenzahl ihren Inhalt mit allen Geschwistern; einzelne Abfragen werden ausgesetzt oder durch Entfernen ihres Bausteins beseitigt. Entfällt beim Speichern eine Abfrage, etwa eine gelöschte Lücke, nennt ein Bestätigungsdialog die betroffenen Karten samt Lernstand und löscht sie erst nach Zustimmung; leere Karten wie in Anki gibt es nicht. Technisch heißen die Begriffe `Note`/`notes` und `Card`/`cards`; die Oberfläche benennt den Inhalt nicht eigens, weil `Notizen` für eine künftige Lernnotiz-Funktion reserviert ist. Begraben von neuen, Review- und tagesübergreifenden Lerngeschwistern wird wie in Anki als drei standardmäßig ausgeschaltete Lernoptionen angeboten.
**Konsequenzen:** `LearningItem` als inhaltstragende Karte, die Kartentyp-Union und alle Compatibility-Projektionen (`originalFront`, `originalBack`, `originalFields`, `originalHtml`, `canonical*`) entfallen ohne Parallelpfad. Konfliktgrenzen trennen Inhalt und Lernstand: Ein Review auf einem Gerät und eine Inhaltskorrektur auf einem anderen sind kein Konflikt. Reimport identifiziert Inhalte über die Anki-GUID und Karten über die Anki-Kartenidentität. Die übrigen Festlegungen aus ADR-029 bleiben gültig: kein Versionsverlauf, keine Quellsnapshots oder Quelldokumente, manuelle Neuplanung als idempotentes Ereignis. Umgesetzt am 2026-10-08; den Ist-Stand beschreibt [`architecture.md`](architecture.md). Ergänzung 2026-10-07: Die Markierung gehört wie in Anki zum Inhalt und gilt damit für alle Geschwister; sie liegt außerhalb des Inhaltsformats und zählt nicht als Inhaltsänderung. Anki-Flaggen bleiben an der Karte.
**Datum:** 2026-10-06

## ADR-033 — Universeller CoRe-Inhalt statt Kartentypen und Anki-Layout

**Status:** angenommen
**Kontext:** Der heutige Renderer wertet Anki-Templates mit Anki-CSS sicher aus, führt aber kein JavaScript aus. Verbreitete Medizinformate wie Image Occlusion, AnKing- und Ankizin-artige Notiztypen oder Multiple-Choice-Add-ons hängen von Scripts ab, die teils nur in der Anki-App existieren, und fallen deshalb auf eine Feldliste zurück. CoRe soll einheitlich aussehen, sich mit einem Editor bearbeiten lassen und später auch in einer App-WebView ohne Anki-Laufzeit darstellbar sein. Nutzer sollen keine Kartentypen wählen müssen.
**Entscheidung:** CoRe kennt genau ein universelles Inhaltsformat aus Feldern mit fachlicher Rolle (Frage, Antwort, Hinweis, Zusatz, Quelle, Notiz) und optionalen Bausteinen: Lücken in voller Anki-Syntax, Bildverdeckung, Auswahl, Eintippen, Richtungen, Medien, Formeln und sicheres Rich-Text-HTML. Die Darstellung ist immer das CoRe-Design; ein umschaltbares Originallayout gibt es nicht. APKG-Notiztypen werden durch versionierte Übersetzer in dieses Format überführt: eigene Übersetzer für Ankis Standardtypen, native Image Occlusion, Image Occlusion Enhanced, die AnKing-/Ankizin-Familie und verbreitete Multiple-Choice-Add-ons sowie ein generischer Übersetzer, der Feldplatzierung, statischen Text und Bedingungen aus der Template-Struktur ableitet. HTML in Feldern bleibt bereinigt erhalten; Template-CSS und Template-JavaScript werden weder angezeigt noch ausgeführt, ihre Funktionen baut CoRe selbst. Die Anki-Vorlage wird je Notiztyp unsichtbar gespeichert, damit verbesserte Übersetzer bestehende Importe ohne Reimport neu übersetzen können. Links in Feldern, einschließlich AMBOSS, werden übernommen und extern geöffnet; das Nachschlagen in AMBOSS ist ein normaler Suchlink. AMBOSS-Tooltips entstehen ausschließlich über eine offizielle Kooperation oder API, nicht über inoffiziellen Zugriff.
**Konsequenzen:** Exotische Anki-Designs verlieren ihre Optik, nicht ihren Inhalt; jeder Import berichtet je Notiztyp den verwendeten Übersetzer und nicht zuordenbare Felder. Der sichere Template-Compiler bleibt ausschließlich Werkzeug des generischen Übersetzers. Der Renderer erzeugt scriptfreies HTML mit CoRe-Styles, rendert Formeln vorab und Bildverdeckung als SVG und passt Feldfarben an Light und Dark Mode an. Anki- und Add-on-Code wird nur gelesen, nie kopiert, da AGPL-Code CoRe insgesamt unter AGPL stellen würde. ADR-021 bleibt abgelöst; die dort beschriebene sichere Template-Projektion als Darstellungspfad entfällt. Ergänzung 2026-10-07: Neben der Vorlage je Notiztyp werden die rohen Anki-Feldwerte je importiertem Inhalt unsichtbar gespeichert, weil Übersetzer Felder verbrauchen. Nach einem Übersetzer-Update übersetzt CoRe automatisch neu, nur für Inhalte ohne lokale Bearbeitung, ordnet Karten über die Anki-Kartenidentität zu, lässt Lernstand unangetastet und ändert einen Inhalt nicht, wenn dabei eine Karte mit Lernstand entfiele; ein kurzer Hinweis nennt die Zahl aktualisierter Inhalte. Ergänzung 2026-10-08: Image Occlusion Enhanced wird in echte CoRe-Masken übersetzt statt als Maskenbild überlagert; Form, Lage und Modus kommen aus den SVG-Masken des Add-ons, die Add-on-Farben entfallen. Das Maskenbild bleibt nur Rückfall für Masken, die sich nicht verlustfrei abbilden lassen. Damit ersetzt die Neuübersetzung handgeschriebene Migrationen der Darstellung.
**Datum:** 2026-10-06

## ADR-034 — Relationale Kartenpersistenz und schlanke Web-Replica

**Status:** angenommen
**Kontext:** Kartenzeilen speichern Inhalt mehrfach, Lernstand als JSONB und vorgerendertes HTML. Fälligkeit und Suche brauchen deshalb transaktional gepflegte Hilfsprojektionen. Eine künftige SQLite-Replik auf Mobilgeräten soll die Cloudstruktur direkt spiegeln können, während der Browser möglichst wenig Daten halten soll.
**Entscheidung:** Die nächste frische Pre-Release-Baseline nach ADR-028 enthält getrennte Tabellen für Stapel, Inhalte, Karten, unsichtbare Anki-Vorlagen je Notiztyp, Mediendateien je Account und SHA-1 samt Inhalt-Medien-Verknüpfung, KI-Umformulierungen, append-only Reviewereignisse und Statistikrollups. Lernstand, Fälligkeit und Status sind echte typisierte Kartenspalten. Gerenderte Darstellungen werden nicht persistiert, sondern beim Anzeigen aus Inhalt und Abfrageschlüssel berechnet. Inhalte tragen einen abgeleiteten Such- und Sortiertext. Hilfsprojektionen bleiben nur, wenn Messungen sie gegenüber direkten Indizes rechtfertigen. Die Web-Replica bleibt begrenzt: Stapelbaum mit Zählern, rollendes Lernfenster mit den zugehörigen Inhalten, zuletzt geöffnete Karten, Medien bei Bedarf und ausdrückliche Offline-Downloads pro Stapel.
**Konsequenzen:** Baseline, Verify-SQL, RLS, generierte Typen, RPCs, IndexedDB und Sync werden ohne Migration oder Altlesepfad neu aufgebaut; vor einem destruktiven Remote-Reset gelten die Bedingungen aus ADR-028. Die neue Struktur muss die heutigen Start-, Lern-, Such- und Statistikgrenzen mindestens halten und den Speicherbedarf je Inhalt nachweislich senken. Die Domänenlogik bleibt reines TypeScript ohne Browser-APIs. Eine Speicherabstraktion zwischen IndexedDB und SQLite entsteht erst mit der zweiten realen Implementierung. Ergänzung 2026-10-08 (Umsetzung): Baseline `20261008101057_kartenmodell_baseline.sql` und IndexedDB `core.workspace.entities.v4` ersetzen die ADR-028-Stände ohne Altlesepfad. `card_catalog` und `deck_study_summaries` bleiben, weil die Web-Replica Delta-Cursor, Keyset-Seiten und Stapelzähler ohne Kartenkörper braucht; sie werden über anweisungsbezogene Trigger mengenbasiert gepflegt und übernehmen Vorschau, Sortiertext und Markierung aus dem Inhalt. Der Lernstand trägt eine eigene `studyRevision`; Reviews erhöhen nur sie, Inhalts- und Kartenänderungen die Entitätsrevision. Die automatische Neuübersetzung merkt sich den verarbeiteten Übersetzerstand je Gerät, weil unveränderte Inhalte nicht geschrieben werden.
**Datum:** 2026-10-06

## ADR-035 — APKG-Kompatibilitätsmatrix als Abnahmevertrag

**Status:** angenommen
**Kontext:** Die vorhandenen APKG-Fixtures decken nur wenige synthetische Notiztypen ab. Fehler bei Paketversionen, Stapelzuordnung, Medien, Lernstand und Sonderformaten fallen dadurch erst beim manuellen Import echter Stapel auf.
**Entscheidung:** APKG-Unterstützung wird durch eine automatisch erzeugte Fixture-Matrix aus Paketversion, Inhaltsformat, Stapelorganisation und Lernstand abgenommen. Jede Fixture besitzt eine maschinenlesbare Erwartung für Stapelpfade, Inhalte, Karten, Abfrageschlüssel, Feldrollen, Medien, Lernstand und eine Textfassung beider Kartenseiten; ausgewählte Fälle erhalten zusätzlich visuelle Nachweise. Ergänzend importiert ein lokaler, nicht versionierter Realwelt-Korpus echte Stapel wie Ankizin und AnKing und berichtet je Notiztyp die Quote voll übersetzter, generisch übersetzter und nicht darstellbarer Inhalte. Anki-Bibliotheken werden nur zur Fixture-Erzeugung verwendet.
**Konsequenzen:** Bekannte Lücken stehen bis zu ihrer Umsetzung als ausdrücklich offene Erwartungen in der Matrix. Neue Übersetzer oder Bausteine sind erst mit grüner Matrixzeile fertig. Realwelt-Stapel verlassen den Rechner nicht und werden wegen ihrer Lizenzen nicht ins Repository aufgenommen; ohne bereitgestellten Korpus meldet der Befehl dies ausdrücklich, statt als bestanden zu gelten.
**Datum:** 2026-10-06

## ADR-036 — Native App als lokale Vollreplik mit Capacitor

**Status:** angenommen
**Kontext:** CoRe soll später als iOS- und Android-App erscheinen und wie die Anki-App ohne Netz vollständig nutzbar sein, statt eine Website anzuzeigen. ADR-027 nannte Tauri 2, SQLite und Dateisystem-Medien nur als spätere Möglichkeit.
**Entscheidung:** Die App wird mit Capacitor gebaut; der gebündelte TypeScript-Code läuft lokal auf dem Gerät. Sie hält eine vollständige lokale Replik in SQLite mit allen Stapeln, Inhalten, Karten, Lernständen und Reviewereignissen des Accounts und lädt alle Medien ohne Auswahl auf das Gerät. Supabase bleibt kanonische Quelle; synchronisiert wird inkrementell. Großstapel werden am Computer importiert und anschließend synchronisiert. Die Web-App bleibt eine schlanke Replica nach ADR-034.
**Konsequenzen:** Das Kartenmodell muss relational spiegelbar, der Renderer scriptfrei und WebView-tauglich und die Domänenlogik browserunabhängig sein. Store-Veröffentlichung, Push, plattformspezifische Login- und Kontolöschungspflichten, die Same-Origin-Anpassung der KI-Route und die Medienspeicherverwaltung gehören zu einer späteren eigenen Roadmap. Die Tauri-Nennung in ADR-027 ist als Mobile-Richtung abgelöst.
**Datum:** 2026-10-06

## ADR-037 — Gestaltungsstil „Soft Minimal“ mit CoRe-Farben

**Status:** angenommen
**Kontext:** Eine Designstudie (2026-10-09) verglich den bisherigen CoRe-Stil (weiße Fläche ohne Ebenen, Amulya und Synonym, runde Icon-Kreise, 44-px-Bedienelemente) mit einem ruhigeren Stil nach dem Vorbild der BengtsToolBox (shadcn/ui-artig). Der Nutzer entschied sich für den neuen Stil und dafür, ihn auf die gesamte App und die Doku auszuweiten.
**Entscheidung:** CoRe verwendet den Stil „Soft Minimal“ mit unveränderter CoRe-Palette: hellgraue Arbeitsfläche, weiße Karten mit 1-px-Rahmen und leichtem Schatten, weiche Radien, Icon-Flächen als weiche Quadrate, Auswahl-Schienen mit weißem Indikator, Labels in normaler Schreibung und die lokal eingebettete variable Schrift Manrope in App, Kartenfläche und Doku. Externe Schriften entfallen. Die Bedienhöhe beträgt 40 px bei feinem Zeiger ab 768 px und bleibt auf Touchgeräten sowie unter 768 px bei 44 × 44 px. Auf Desktop navigiert eine schwebende Seitenleiste (keine Kopfleiste wie in der ToolBox); der UI-Katalog übernimmt den Aufbau des ToolBox-Katalogs.
**Konsequenzen:** Tokens in `src/styles.css` und die gemeinsamen Klassen tragen den Stil; Screens verwenden die gemeinsamen Button-Klassen statt eigener Klassenketten. Die Touchziel-Anforderung bleibt für Touchgeräte unverändert. Die visuellen Verträge in `specs.md`, `src/ui/README.md` und die Theme-Tests beschreiben den neuen Stil.
**Datum:** 2026-10-09

## ADR-038 — Serverbestätigung der Sitzung parallel zum Start

**Status:** angenommen
**Kontext:** ADR-024 öffnet die IndexedDB-Shell erst nach genau einer Supabase-Sitzungsprüfung. Online ist diese Prüfung `getUser()`, ein Netzwerk-Roundtrip, auf den der Bootstrap-RPC bisher wartete. „Neues Gerät bis Dashboard“ lag damit dauerhaft knapp am 3.000-ms-Budget.
**Entscheidung:** Online startet die im Browser gespeicherte Supabase-Sitzung (`getSession()`) die accountgebundene Shell und den Bootstrap sofort; `getUser()` bestätigt die Sitzung parallel. Lehnt der Server sie ab, meldet er einen anderen Nutzer oder scheitert die Bestätigung mit einem Nicht-Netzwerkfehler, verwirft CoRe den laufenden Start, meldet die Sitzung lokal ab und zeigt die Anmeldung. Offline, ohne gespeicherte Sitzung und beim Passwort-Recovery bleibt die sequenzielle Prüfung.
**Konsequenzen:** Bis zur Bestätigung laufen nur Abrufe, die der Server ohnehin mit dem gespeicherten Token autorisiert; es werden keine Daten eines anderen Accounts sichtbar. Ein verworfener Start beendet seine Bootstrap-Wiederholungen. ADR-024 bleibt ansonsten gültig.
**Datum:** 2026-10-10
