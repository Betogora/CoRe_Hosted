# CoRe-Entscheidungen

**Rolle:** einzige kanonische Quelle für dauerhafte Produkt- und Architekturentscheidungen.
**Stand:** 2026-07-15

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
**Entscheidung:** Jede Produktoberfläche hat genau einen Reifestatus. `Core` ist für normale Nutzer freigegeben und Teil des Kernversprechens. `Labs` ist sichtbar experimentell und nennt seine Grenze. `Disabled` ist technisch vorhanden, aber nicht erreichbar. Die Registry in `src/productSurfaces.ts` projiziert diese Entscheidung in die UI.
**Konsequenzen:** Labs graduieren nur über ein eigenes Gate. Nicht reife Flächen dürfen verborgen oder zurückgebaut werden. Eine technisch vorhandene Route begründet keinen Produktanspruch.
**Datum:** 2026-07-15

## ADR-002 — Lernen und Stapelverwaltung trennen

**Status:** angenommen
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
**Entscheidung:** Community und Deck-Graph bleiben Labs. Community teilt keine privaten Review Events, Lernstände, Streaks oder Online-Status. Der Graph ist kein Kernnavigationsziel und darf Lernen nicht ersetzen.
**Konsequenzen:** Echte Community-Rechte brauchen Membership-, RLS-, Datenschutz- und Hosted-Gates. Der Graph braucht einen belegten Nutzerzweck und Erfolgskriterium. Ohne diese Evidenz werden die Flächen nicht zu Core; ein späterer Rückbau ist zulässig.
**Datum:** 2026-07-15

## ADR-006 — Keine generische Anbieteradapter-Schicht

**Status:** angenommen
**Kontext:** Es gibt jeweils nur einen real betriebenen Pfad für Auth, Cloud-Persistenz und den ersten externen KI-Chat.
**Entscheidung:** Konkrete tiefe Module kapseln Supabase und den Serverprovider. Eine generische Adapterebene entsteht erst, wenn mindestens zwei reale Implementierungen gleichzeitig unterstützt werden müssen.
**Konsequenzen:** React bleibt providerfrei, ohne hypothetische Interfaces und Konfigurationen einzuführen.
**Datum:** 2026-07-13
