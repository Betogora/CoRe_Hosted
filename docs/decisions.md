# CoRe-Entscheidungen

**Rolle:** einzige kanonische Quelle für dauerhafte Produkt- und Architekturentscheidungen.
**Stand:** 2026-08-11

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

**Status:** angenommen
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

**Status:** teilweise abgelöst durch ADR-012, ADR-016 und ADR-023
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
**Konsequenzen:** Es entstehen keine Datenbankmigration, Jobhistorie, Vorschau, Chatfläche, Anbieteradapter, Bildübertragung oder bezahlter Fallback. ADR-007 bleibt für die entfernten breiten KI-/Labs-Pfade bestehen; seine Aussage, `ai_generated` sei nur ein ungenutzter Herkunftswert, ist durch diese eng begrenzte Route abgelöst.
**Datum:** 2026-08-04

## ADR-012 — Kompakte Stapelzeile mit kontextgebundenem Drag-and-drop

**Status:** teilweise abgelöst durch ADR-014, ADR-016, ADR-017 und ADR-023
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

**Status:** teilweise abgelöst durch ADR-017 und ADR-023
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

**Status:** teilweise abgelöst durch ADR-017
**Kontext:** Der sichtbare Hierarchiepfad wiederholte in Desktop-Zeilen die bereits durch Einrückung und Auf-/Zuklappen eindeutige Baumstruktur. Zugleich übernahmen Stapelbäume teilweise die Import- oder Speicherreihenfolge und wichen damit von Ankis alphabetischer Stapelliste ab.
**Entscheidung:** Dashboard, Lernen und Kartenverwaltung zeigen bei jeder Breite ausschließlich den lokalen Stapelnamen ohne sichtbaren Hierarchiepfad. Stapelbäume und Stapelauswahlen sortieren Hauptstapel sowie jede Unterebene separat alphabetisch nach dem lokalen Namen und ohne numerische Sonderbehandlung. Vollständige Pfade bleiben für zugängliche Namen, Tooltips, Menüs, Suche und geschlossene Auswahlfelder erhalten.
**Konsequenzen:** Stapelnamen stehen vertikal mittig in einer einzeiligen Zeile. Persistierte Deckreihenfolge und Hierarchie bleiben unverändert; nur ihre Projektion wird sortiert. ADR-008 und ADR-012 sind hinsichtlich des sichtbaren Pfads in der gemeinsamen Stapelzeile abgelöst.
**Datum:** 2026-08-09

## ADR-017 — Lokale Namen und Stapel-Icons in Stapeloptionen

**Status:** angenommen
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
**Konsequenzen:** Änderungen wirken nicht rückwirkend und erzeugen keine Datenbankmigration. Profil-JSONB und Portabilität transportieren sieben additive Werte; ein Import ohne ausdrückliches `easyDays`-Feld lässt die lokale Einstellung unverändert. Geschwisterverteilung, freie Gewichte, Kalenderausnahmen, Urlaubsmodus und persönliche FSRS-Optimierung bleiben außerhalb.
**Datum:** 2026-08-11

## ADR-020 — Accountgebundene IndexedDB-Entities und Delta-Sync

**Status:** teilweise abgelöst durch ADR-022
**Kontext:** Ein synchron serialisierter Root-State und normale Vollsnapshot-Synchronisierung skalieren weder für große Kartenbestände noch für lange Reviewhistorien. Gleichzeitig existiert nur ein realer lokaler und ein realer Cloud-Persistenzpfad; eine generische Provider-Abstraktion wäre nicht gerechtfertigt.
**Entscheidung:** Angemeldete Accounts verwenden eine konkrete IndexedDB-Datenbank mit getrennten Stores für Decks, Karten, Varianten, Reviewereignisse, Dokumente, Notiztypen, Quellsnapshots, Outbox und Sync-Metadaten. Der frühere App-State wird einmal transaktional übernommen und danach nicht parallel weitergeschrieben. Normale Cloudänderungen sind typisierte Entity-Mutationen mit Basisrevision; vollständige Zustände werden ausschließlich für expliziten Export, Restore und die einmalige Legacy-Migration materialisiert. Ein Import schreibt seinen normalisierten Graphen direkt in Entity-Stores. Eine Reviewantwort schreibt Karte, Variante, Deckrevision und genau ein idempotentes Ereignis in einer atomaren Postgres-Funktion. Fehlt diese Funktion, bleibt die Outbox erhalten und die Oberfläche zeigt einen deutschen Fehler. Die Review-/Revisionssemantik und der vollständige Zyklus sind durch ADR-022 abgelöst.
**Konsequenzen:** `localStorage` bleibt auf kleine Präferenzen, Geräte- und Migrationsmarker begrenzt. Boot, Kartenbrowser, Review und Statistik konsumieren die paginierten beziehungsweise scopegebundenen Repositoryabfragen; Folgesyncs verwenden persistierte, servergestempelte `sync_change_id`-/ID-Keyset-Cursor statt veränderlicher Fachzeitstempel. Rust/WASM oder Elixir sind kein Ersatz für Materialisierungs-, Algorithmus- oder Datenzugriffsgrenzen.
**Datum:** 2026-08-11

## ADR-021 — Dynamische Lerninhalte und sichere Anki-Projektion

**Status:** angenommen
**Kontext:** Anki-Felder sind frei benennbar, Notetypes können mehrere Felder und Templates besitzen und CSS sowie Kartengenerierungsregeln bestimmen die Darstellung. Eine Zuordnung über die ersten zwei Felder, Feldnamenregexe oder feste CoRe-Kartentypen verliert Information und kann beim Reimport lokale Änderungen oder getrennte Anki-Card-Zustände beschädigen.
**Entscheidung:** CoRe verwendet `LearningItemDocumentV1` als feldzentrierte Inhaltswahrheit und unveränderliche, über einen semantischen Hash deduplizierbare `NoteTypeDefinitionV1`-Revisionen. Jede APKG-Quelle erhält zusätzlich einen unveränderlichen Snapshot einschließlich bekannter Konfiguration und unbekannter Rohbytes. `applyLearningItemContent()` besitzt Validierung, Projektion und Variantenidentität; `renderLearningItemPresentation()` ist der gemeinsame sichere Renderer für Vorschau, Kartenverwaltung und Review. Dokumentierte statische Anki-Semantik wird in einem opaken Sandbox-Frame ohne Scripts und Netzwerkzugriff ausgeführt; unsichere Funktionen werden erhalten, nicht ausgeführt und führen transparent in eine Feldansicht. CSV- und Tabellenfelder werden ausschließlich deterministisch und nutzerbestätigt zugeordnet. Der initiale Anki-Lernstand wird pro Card mit der Priorität FSRS-Memory-State, Revlog-Replay, klassischer Kartenstatus, neue Karte angenähert; die importierten Revlog-Ereignisse bleiben unabhängig davon append-only Analytics.
**Konsequenzen:** Bilder und Cloze sind Inhalt beziehungsweise Editoraktion statt eigener primärer Kartentypen; Reverse und Multiple Choice sind Review-Rezepte. Importierte Feldwerte sind editierbar, ihr Schema und ihre Templates bleiben zunächst strukturell schreibgeschützt. Template-JavaScript, Add-on-/Custom-Filter, externe Ressourcen und native LaTeX werden nicht ausgeführt. Anki-Code oder `rslib` wird nicht in das Produktionsbundle übernommen. ADR-015 bleibt für Statistik und append-only Ereignisse gültig, ist aber hinsichtlich des Verbots einer initialen, diagnostizierten Schedulermigration abgelöst.
**Datum:** 2026-08-11

## ADR-022 — Fachliche Revisionen und vollständiger inkrementeller Sync

**Status:** angenommen
**Kontext:** Der bisherige Push-Pfad lud Cloud-Deltas nur beim Login, behandelte einen Batchkonflikt als Fehler des ganzen Blocks und ließ die konfliktverursachende Mutation nach Cloud-Wins bestehen. Technische Felder und Reviewprojektionen erhöhten Inhaltsrevisionen; die Einführung der verpflichtenden Originalvariante machte dadurch abgeleitete Lücken zu Benutzerkonflikten.
**Entscheidung:** `syncNow()` führt accountgebunden genau einen zusammengefassten Zyklus aus lokalem Flush, isoliertem Outbox-Push, `sync_change_id`-Delta-Pull und Konfliktaktualisierung aus. Realtime wird nicht eingeführt. `revision` zählt nur fachlichen Inhalt; technische Projektionen sind weder Konfliktfelder noch alleinige Konfliktursache. Reviewereignisse bleiben append-only, erhöhen keine Inhaltsrevision und projizieren nur in zeitlicher Reihenfolge. Fehlende Originalvarianten sowie technische Alt-Abweichungen werden idempotent repariert. Aktive Konflikte sind je Entität eindeutig; Richtungsentscheidungen entfernen die Zielmutation und betreffen ausschließlich die aktuelle Konfliktmenge.
**Konsequenzen:** Autosync nutzt Debounce, Online, Fokus und ein sichtbares 0/1/5/15/30-Minuten-Intervall mit Standard 5. Der Browser kann einen Netzwerkabschluss beim Schließen nicht garantieren; IndexedDB bleibt die Wiederanlaufwahrheit. Konfliktkarten werden quarantänisiert, konfliktfreie Karten, Reviews und Medien bleiben benutzbar. Ein kompletter Account-Override, Supabase Realtime, ein Desktop-Wrapper und ein gemeinsamer Mediensync gehören nicht zu dieser Entscheidung.
**Datum:** 2026-08-14

## ADR-023 — Kontextgebundener Lernstatus und Hauptbaumgrenzen

**Status:** angenommen
**Kontext:** Der gemeinsame Stapelinhalt führte Lernkennzahlen und Donut auch in der inhaltsorientierten Kartenverwaltung, obwohl dort Stapelidentität und Kartenbearbeitung im Vordergrund stehen. Dünne Grenzen zwischen allen Hierarchiezeilen zerschnitten zusammengehörige Bäume; der Hover von Dashboard und Lernen färbte dagegen nur eine Rahmenkante ein.
**Entscheidung:** `DeckSummaryRow` bleibt der einzige Zeilenrenderer und erhält einen optionalen, unteilbaren Lernstatusblock. Nur Dashboard und Lernen liefern Tageskennzahlen und Gesamtbestandsdonut; die Kartenverwaltung rendert in Stapelköpfen ausschließlich Identität und Aktion. Alle drei Ansichten verwenden dieselbe neutrale vollflächige Hover-Füllung. Eine 2-px-Linie trennt ausschließlich aufeinanderfolgende Hauptstapel-Bäume, innerhalb eines Baums existiert keine Stapel-Trennlinie. Kartenzeilen behalten ihre dünnen Grenzen. Feste und responsive Dichten sind direkte Varianten von `DeckSummaryRow`; der funktionslose Kompakt-Wrapper entfällt.
**Konsequenzen:** Kennzahl- und Bestandsmodelle bleiben unverändert und werden in der Kartenverwaltung lediglich nicht projiziert. Individuelle Kartenwerte wie `Neu` im Datumsfeld bleiben sichtbar. Tabellen- und Baumsemantik, Auf-/Zuklappen, Drag-and-drop, Auswahl, Stapeloptionen und Persistenz ändern sich nicht. ADR-008, ADR-012 und ADR-014 sind hinsichtlich sichtbarer Kartenverwaltungs-Kennzahlen sowie der Zeilen- und Hoverform abgelöst.
**Datum:** 2026-08-15

## ADR-024 — Local-first Start, begrenzte Datenfenster und vertrauenswürdiges Gerät

**Status:** angenommen
**Kontext:** Ein Account-Boot mit Reparaturmanifest, sieben tabellenweisen Pulls und Konflikt-Doppelabfrage blockierte die nutzbare Oberfläche. Große Stapel wurden beim Lernstart vollständig hydriert. Mit wachsendem Featureumfang dürfen weder Code- noch Accountgröße den Startpfad linear vergrößern.
**Entscheidung:** Nach genau einer Supabase-Sitzungsprüfung öffnet CoRe zuerst die accountgebundene IndexedDB-Shell. Ein kleiner `get_account_bootstrap` und der bytebegrenzte globale `pull_account_delta` laufen danach im Hintergrund; Realtime ist höchstens ein späterer Änderungshinweis, nie die Sync-Wahrheit. Kartenverwaltung und Lernqueue lesen cursorbasiert höchstens 50 Karten und hydrieren nur deren Varianten. Produktscreens bleiben dynamische Chunks. Nach einer ruhigen Sekunde dürfen `Lernen` und `Karten` seriell automatisch nur bei gemeldetem 4G oder fehlender Network-Information vorgeladen werden; 3G erlaubt ausschließlich Hover, Fokus oder Touchstart. Datensparmodus, 2G, unsichtbarer Tab und Nutzerinteraktion stoppen die Spekulation. Die PWA cached ausschließlich App-Shell und bereits abgerufene statische Ressourcen. Strukturierte Accountdaten bleiben in IndexedDB, Medien im Browser selektiv. Ein bereits eingerichtetes Gerät darf bei einem reinen Netzwerkfehler aus der persistierten Supabase-Sitzung und seiner lokalen Replica offline kalt starten. Das ist kein lokaler Passwort- oder Auth-Provider.
**Konsequenzen:** Der Cloud-Abgleich kann fehlschlagen, ohne den lokalen Start zu verlieren; lokale Mutationen bleiben in der Outbox. Logout entfernt die Supabase-Accountfreigabe, ohne einen zweiten Loginpfad einzuführen. Browser-Speicher wird nach Möglichkeit persistent angefordert und Quote sowie Nutzung werden sichtbar; 10 GB Medien sind im Web trotzdem nicht als vollständig lokaler Bestand garantiert. Supabase bleibt Auth-, Postgres-, Storage- und Backup-Plattform. Ein eigener Sync-Dienst vor demselben Postgres wird erst geprüft, wenn die dokumentierten Latenz-, Last-, Fehler- oder Kostengates nach Index-, RPC- und Compute-Optimierung wiederholt scheitern. ADR-004 ist nur hinsichtlich des ausdrücklich ausgeschlossenen Offline-Kaltstarts abgelöst.
**Datum:** 2026-08-15

## ADR-025 — Lokale Stapelprojektionen

**Status:** angenommen
**Kontext:** Die bisherige Stapelzusammenfassung zählte bei jedem Aufruf Karten- und Variantenindizes und lief für die Heatmap durch alle zukünftigen Kartentermine. Der reproduzierbare gedrosselte Start belegte dadurch einen 231-ms-Main-Thread-Task. Mit großen Stapeln darf der häufige Dashboardpfad nicht proportional zur Kartenzahl wachsen.
**Entscheidung:** `listDeckSummaries()` bleibt die einzige React-seitige Schnittstelle, liest intern aber löschbare lokale `DeckStudySummary`-Projektionen und kompakte Fälligkeits-Buckets aus IndexedDB v5. Einzelne Kartenwrites und Reviews pflegen diese Ableitungen in derselben lokalen Transaktion. Import-, Restore-, Cloud- und Konfliktpfade markieren ausschließlich betroffene Stapel dirty. Der Neuaufbau scannt Karten über einen zusammengesetzten Stapel-/ID-Index in höchstens 250er-Chunks, gibt spätestens nach 25 ms freiwillig ab und speichert Stapel-, Phasen- und Entitätscursor als fortsetzbaren Checkpoint. Ein Dirty-Token verhindert den Abschluss einer durch parallele Writes veralteten Berechnung. Zeitzone und Tagesbeginn gehören zum Projektionskontext; Konfliktkarten fehlen in lernbaren Zählern.
**Konsequenzen:** Normale Starts lesen Stapelzähler ohne Karten- oder Variantenscan. Das Schema-Upgrade legt nur Stores und Indizes an; die Erstbefüllung beginnt nach dem nutzbaren Workspace und darf unterbrochen werden. Projektionen, Buckets und Checkpoint sind keine Cloud-, Outbox-, Export- oder Konfliktwahrheit und können vollständig neu berechnet werden. Das Supabase-Schema und `listDeckSummaries()` ändern sich nicht.
**Datum:** 2026-08-16
