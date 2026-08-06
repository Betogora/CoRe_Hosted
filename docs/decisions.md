# CoRe-Entscheidungen

**Rolle:** einzige kanonische Quelle für dauerhafte Produkt- und Architekturentscheidungen.
**Stand:** 2026-08-04

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

**Status:** angenommen
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
**Entscheidung:** Diese Funktionen sind vollständig entfernt. APKG bleibt bis einschließlich 250 MiB lokal. Stapel sind implizit privat. App-State v3 und Export v2 enthalten ausschließlich Core-Daten; V1-Exporte bleiben lesbar, wobei Labs-Inhalte verworfen werden. Eine produktive Datenlöschung ist irreversibel und darf nur nach App-Deployment und verifizierter CoRe-Projekt-Ref erfolgen.
**Konsequenzen:** Es gibt keinen Labs-Kompatibilitätspfad, keinen Server-APKG-Fallback und keine allgemeine Feature-Registry. `VariantGenerationSource: "ai_generated"` bleibt ausschließlich als Herkunftswert der Core-Variantenlogik bestehen. Google und Magic Link bleiben über getrennte Flags schaltbar.
**Datum:** 2026-08-01

## ADR-008 — Eine gemeinsame Stapelkarte mit kontextabhängiger Hauptaktion

**Status:** teilweise abgelöst durch ADR-012
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

**Status:** angenommen
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
