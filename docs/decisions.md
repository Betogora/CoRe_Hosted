# CoRe-Entscheidungen

**Rolle:** einzige kanonische Quelle für dauerhafte Produkt- und Architekturentscheidungen.
**Stand:** 2026-08-03

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

**Status:** angenommen
**Kontext:** Dashboard, Lernen und Kartenverwaltung zeigten denselben Stapelbaum mit abweichenden Kennzahlen, Aktivierungsflächen und wiederholten Werkzeugen. Die frühere Trennung aus ADR-002 beseitigte zwar unklare Gesten, verhinderte aber auch die bereits bewährte direkte Strukturierung im sichtbaren Baum.
**Entscheidung:** Alle drei Bereiche verwenden eine gemeinsame einklappbare Stapelkarte mit identischer Zeilenfolge: Icon, Name und Pfad, Teilbaum-Kennzahlen, Fortschrittsdonut und ganz rechts Stapeloptionen. Die neutrale Fläche startet in Dashboard und Lernen die Sitzung und öffnet in der Kartenverwaltung die Karten; dieselbe tatsächlich getroffene Fläche ist die native Drag-Quelle. Dashboard, Lernen und Kartenverwaltung erlauben sichtbares direktes Drag-and-drop auf einen Stapel oder die Hauptebenen-Zone; ungültige und unveränderte Ziele sind No-ops und ein Drag löst keine Flächenaktion aus. Interaktive Strukturänderungen sind auf drei sichtbare Ebenen begrenzt. Tiefere APKG-Hierarchien bleiben beim Import erhalten und dürfen anschließend nur regelkonform oder flacher verschoben werden. Die Kartenverwaltung bündelt erweiterte Werkzeuge einmal beim ausgewählten Stapel und behält das bestätigte Verschieben als Tastatur-, Touch- und Accessibility-Fallback. Stapeloptionen tragen ihren Rückkehrkontext in der URL.
**Konsequenzen:** Darstellung, Reihenfolge, Keyboard-Aktivierung, Collapse, Drag-Quelle und -Zustände, Tiefenfarben und Kennzahlsemantik besitzen eine kanonische UI-Implementierung. Die fachliche Workspace-Mutation prüft dieselbe Platzierungsregel wie die UI; das persistierte Deck-Schema bleibt unverändert. ADR-002 ist hinsichtlich des Verbots direkter Strukturierung abgelöst; die dort festgelegte Trennung von Lern- und Verwaltungsaufgabe bleibt erhalten.
**Datum:** 2026-08-03
