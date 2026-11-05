# CoRe-Entscheidungen

Stand: 2026-11-04

Geltende, dauerhafte Produkt- und Architekturentscheidungen und vor allem ihr
**Warum**. Das genaue Verhalten steht in [`specs.md`](specs.md), die technische
Umsetzung in [`architecture.md`](architecture.md); ein ADR wiederholt beides nicht.
Wann eine Entscheidung ein ADR braucht, regelt
[`README.md`](README.md#wann-ein-adr-entsteht).

## ADR-Format

```text
## ADR-NNN — Titel
Status: vorgeschlagen | angenommen
Kontext: Warum war eine Entscheidung nötig, was wurde verworfen?
Entscheidung: Was gilt verbindlich?
Konsequenzen: Welche Folgen und Grenzen entstehen?
Datum: YYYY-MM-DD
```

Eine geänderte Entscheidung wird im Text aktualisiert, eine aufgehobene gelöscht;
Git ist das Archiv. Nummern werden nicht neu vergeben. Offene Umsetzungsschritte
stehen in [`todo.md`](todo.md).

## ADR-001 — Produktumfang nur mit Auftrag

**Status:** angenommen
**Kontext:** Der frühe MVP enthielt Labs-, Community-, Graph-, breite KI- und serverseitige Groß-APKG-Pfade unterschiedlicher Reife, die UI, Modell, APIs und Betrieb durchzogen, ohne zum freigegebenen Kern zu gehören. Sichtbarkeit allein darf nicht als Freigabe gelten.
**Entscheidung:** CoRe enthält nur Funktionen mit ausdrücklichem Auftrag und eigener Abnahme. Ausgemusterte Flächen werden samt Routen, Zustand, Daten und Tests vollständig entfernt; es gibt weder Labs noch eine Produktoberflächen-Registry. APKG wird bis 2 GiB lokal im Browser importiert, ohne Serverpfad. Stapel sind privat.
**Konsequenzen:** Eine frühere Route oder Altstruktur begründet keinen Produktanspruch. Schalter für gebaute, noch nicht freigegebene Loginwege (Google, Magic Link) sind zulässig. Produktive Datenlöschung erfolgt nur nach App-Deployment und verifizierter Projekt-Ref.
**Datum:** 2026-07-15

## ADR-006 — Keine generische Anbieteradapter-Schicht

**Status:** angenommen
**Kontext:** Für Auth und Cloud-Persistenz gibt es jeweils genau einen real betriebenen Pfad; hypothetische Interfaces kosten Komplexität ohne Nutzen.
**Entscheidung:** Konkrete tiefe Module kapseln Supabase. Eine generische Adapterebene entsteht erst, wenn mindestens zwei reale Implementierungen gleichzeitig unterstützt werden müssen.
**Konsequenzen:** React bleibt providerfrei, ohne Adapter-Konfiguration.
**Datum:** 2026-07-13

## ADR-011 — Schmale KI-Routen über OpenRouter

**Status:** angenommen
**Kontext:** Karten sollen auf ausdrückliche Aktion umformuliert und Stapel zusammengefasst werden, ohne die entfernte breite KI-, Labs- und Job-Infrastruktur zurückzubringen und ohne Anbieterschlüssel im Browser. Verworfen wurden freie Modellwahl, Non-ZDR-Fallbacks und eine Serverqueue.
**Entscheidung:** Genau `POST /api/ai/card-variant` und `POST /api/ai/summary` sind als authentifizierte Vercel Functions freigegeben. Beide nutzen fest ein bezahltes Modell über OpenRouter mit Zero-Data-Retention und Trainingsverbot; das Key-Limit begrenzt die Kosten. An den Anbieter geht nur der bereinigte Text, den die jeweilige Funktion braucht. Stapelgenerierung läuft nacheinander im geöffneten Tab.
**Konsequenzen:** Keine Jobtabelle, Chatfläche, Anbieteradapter oder Bildübertragung; jede Route schreibt ein Kostenlog. Automatische Erzeugung bei Reife oder ein Kontingent je Nutzer brauchen eine Ergänzung dieser Entscheidung.
**Datum:** 2026-08-04

## ADR-013 — Transiente Lernuhr für echte Accountkarten

**Status:** angenommen
**Kontext:** Schedulerintervalle sollen an den eigenen Karten über Zukunftstage nachvollziehbar sein. Ein isolierter Teststapel bildet weder echten Fortschritt noch die normalen Projektionen ab.
**Entscheidung:** Der Simulator hält einen Zeitversatz nur im App-Prozess; alle lernbezogenen Projektionen nutzen ihn, operative Systemzeiten bleiben real. Umstellen ist mutationsfrei; eine Bewertung im Zukunftsmodus ist bewusst ein echtes, synchronisiertes Review.
**Konsequenzen:** Ein aktiver Zukunftstag ist sichtbar gekennzeichnet; Reload und Logout setzen nur den Versatz zurück. Eine rücksetzbare Sandbox, Simulationskennzeichnung in Review-Events oder Rollen-Gating wären eigene Entscheidungen.
**Datum:** 2026-08-06

## ADR-015 — Globale FSRS-Statistik und Anki-Historie

**Status:** angenommen
**Kontext:** Die frühere Statistik zeigte unverbundene Kennzahlen ohne gemeinsamen Zeitraum; APKG enthält zugleich oft wertvolle Reviewhistorie.
**Entscheidung:** Es gibt genau eine Statistik mit globaler Zeitraum- und Stapelauswahl, projiziert aus append-only Review Events. Gedächtnisverteilungen nutzen FSRS-Werte statt klassischer Ease. APKG-`revlog` wird dedupliziert als Analysehistorie übernommen und bestimmt, wo vollständig, den anfänglichen Lernstand.
**Konsequenzen:** Keine parallele Statistikprojektion. Reimport ergänzt historische Ereignisse, überschreibt aber keine und markiert keine Karte als gelernt.
**Datum:** 2026-08-06

## ADR-018 — Lernprofile als Copy-on-apply-Vorlagen

**Status:** angenommen
**Kontext:** Globale Lernvorgaben überschrieben früher beim Speichern alle Stapel, obwohl Scheduler und Queue nur materialisierte Stapelwerte lesen. Eine live aufgelöste Profil-ID neben kopierten Werten hätte eine zweite, konfliktanfällige Wahrheit geschaffen.
**Entscheidung:** Lernprofile sind kontoweite Vorlagen; Anwenden kopiert die Werte samt Herkunftsversion in genau einen Stapel oder in den globalen Standard für neue Stapel. Es gibt keine Live-Auflösung: Bestehende Stapel ändern sich nur durch eine ausdrückliche Aktion. CoRe-Modus, Variantenwerte und Darstellung gehören nicht zur Vorlage.
**Konsequenzen:** Umbenennen, Aktualisieren und Löschen einer Vorlage verändert keine kopierten Werte; ältere Kopien lassen sich bewusst erneut anwenden. Es gibt weder Resolver- noch Override-Graph. Verhalten: [Tagesrunde und Lernprofile](specs.md#tagesrunde-und-lernprofile).
**Datum:** 2026-08-11

## ADR-019 — Easy Days als globaler Wochenrhythmus

**Status:** angenommen
**Kontext:** Ruhigere Wochentage beschreiben die persönliche Verfügbarkeit, nicht die Lernlogik eines Stapels; je Stapel ließe sich dieselbe Woche widersprüchlich abbilden. Eine zweite Intervallformel würde FSRS verfälschen.
**Entscheidung:** Der Wochenrhythmus ist eine kontoweite Einstellung. Er verschiebt nur neu berechnete Review-Termine innerhalb der offiziellen FSRS-Fuzz-Spanne auf den nach Last besten Tag; Stabilität, Schwierigkeit und Zielerinnerung bleiben das rohe FSRS-Ergebnis.
**Konsequenzen:** Änderungen wirken nicht rückwirkend. Geschwisterverteilung, Kalenderausnahmen und Urlaubsmodus bleiben außerhalb.
**Datum:** 2026-08-11

## ADR-032 — Inhaltsmodell: Note und Card

**Status:** angenommen
**Kontext:** Wiederherstellbare Versionen, persistierte Quellen, als Varianten modellierte Anki-Karten und eine Inhaltskopie je Karte machten CoRe komplexer als Anki: Ein Lückentext mit vier Lücken lag mehrfach vor, eine Korrektur wirkte nur auf eine Karte, Geschwisterregeln waren nicht abbildbar. Verbreitete Anki-Formate hängen zudem von Template-Scripts ab, die CoRe nicht ausführt; Nutzer sollen keine Kartentypen wählen müssen.
**Entscheidung:** Wie Anki trennt CoRe Inhalt (`Note`, Felder mit Rollen und Bausteinen, genau einmal gespeichert) und planbare Abfrage (`Card`, mit Stapel, eigenem Lernstand und KI-Varianten). Welche Karten existieren, folgt aus den Bausteinen; eine Inhaltsänderung wirkt auf alle Geschwister, Löschen betrifft wie in Anki den Inhalt samt Geschwistern. Das Inhaltsformat ist universell; versionierte Übersetzer überführen APKG-Notiztypen hinein. Dargestellt wird im CoRe-Design, ausgenommen das Originallayout nach ADR-047; Template-JavaScript läuft nie. Anki-Vorlage und rohe Feldwerte bleiben unsichtbar gespeichert, damit Übersetzer-Updates unbearbeitete Inhalte neu übersetzen. Versionslogs, Restore, Quellsnapshots und CoRe-JSON-Portabilität gibt es nicht.
**Konsequenzen:** Ein Review auf einem Gerät und eine Inhaltskorrektur auf einem anderen sind kein Konflikt. Reimport identifiziert über Anki-GUID und Kartenidentität; Neuübersetzung verliert nie eine Karte mit Lernstand. Anki- und Add-on-Code wird nur gelesen, nie kopiert (AGPL). Die Oberfläche benennt den Inhalt nicht eigens, weil `Notizen` für eine künftige Funktion reserviert ist.
**Datum:** 2026-10-06

## ADR-034 — Persistenz, Web-Replica und Sync

**Status:** angenommen
**Kontext:** Kartenbestände und Historien wachsen; Start, Lernen und Sync dürfen nicht mit der Accountgröße wachsen. Browserspeicher kann verschwinden und ist nie die einzige Wahrheit. Vor dem ersten Release muss kein externer Datenbestand erhalten werden. Verworfen wurden Realtime-Sync und vollständige Tabellen-Downloads.
**Entscheidung:** Supabase ist kanonische Account-, Daten-, Storage- und Backup-Plattform; gerenderte Darstellungen werden nie gespeichert. Die Web-Replica in IndexedDB bleibt begrenzt (Stapelbaum mit Zählern, Katalog, Lernfenster, zuletzt geöffnete Karten, ausdrückliche Offline-Downloads); ein bekanntes Gerät startet sofort aus ihr, auch offline. Synchronisiert wird inkrementell in einem Zyklus aus Outbox-Push und Delta-Pull. Inhalt und Lernstand haben getrennte Revisionen. Vor dem ersten extern genutzten Release ersetzen Schemawechsel den alten Stand ohne Kompatibilitäts- oder Backfillpfade; Konten und Daten dürfen ersatzlos gelöscht werden.
**Konsequenzen:** Konflikte sind je Entität eindeutig; konfliktfreie Daten bleiben benutzbar. Die Domänenlogik bleibt browserunabhängig; eine Speicherabstraktion entsteht erst mit der zweiten Implementierung (ADR-036). Nach dem ersten externen Release ist ein ersatzloser Reset unzulässig. Supabase bleibt Plattform, solange Replica-RPCs p95 ≤ 1 s, Fehlerrate ≤ 0,1 %, Cursor-Lag < 5 s und der 100k-/1m-Zieltest bei doppelter Last ≤ 70 % DB-CPU und Pool halten und Kosten sowie Regionsanforderungen passen; bei wiederholtem Bruch zuerst Indizes, Query-Plan, RPC und Compute, danach ein eigener Sync-Dienst vor demselben Postgres, kein sofortiger Datenbankwechsel.
**Datum:** 2026-10-06

## ADR-035 — APKG-Kompatibilitätsmatrix als Abnahmevertrag

**Status:** angenommen
**Kontext:** Wenige synthetische Fixtures deckten Paketversionen, Stapelzuordnung, Medien, Lernstand und Sonderformate nicht ab; Fehler fielen erst beim manuellen Import echter Stapel auf.
**Entscheidung:** APKG-Unterstützung wird über eine erzeugte Fixture-Matrix mit maschinenlesbaren Erwartungen abgenommen, ergänzt um einen lokalen, nicht versionierten Realwelt-Korpus mit Übersetzungsbericht. Anki-Bibliotheken dienen nur der Fixture-Erzeugung.
**Konsequenzen:** Bekannte Lücken stehen als ausdrücklich offene Erwartungen in der Matrix; ein Übersetzer ist erst mit grüner Matrixzeile fertig. Realwelt-Stapel verlassen den Rechner nicht.
**Datum:** 2026-10-06

## ADR-036 — Native App als lokale Vollreplik mit Capacitor

**Status:** angenommen
**Kontext:** CoRe soll als iOS- und Android-App wie die Anki-App ohne Netz vollständig nutzbar sein, statt eine Website anzuzeigen.
**Entscheidung:** Die App entsteht mit Capacitor; der TypeScript-Code läuft lokal und hält eine vollständige SQLite-Replik samt aller Medien. Supabase bleibt kanonisch; Großstapel werden am Computer importiert. Die Web-App bleibt eine schlanke Replica.
**Konsequenzen:** Kartenmodell relational spiegelbar, Renderer scriptfrei und WebView-tauglich, Domänenlogik browserunabhängig. Store, Push, Plattform-Login und Medienverwaltung gehören zu einer eigenen späteren Roadmap.
**Datum:** 2026-10-06

## ADR-038 — Anmeldung und Sitzungsstart

**Status:** angenommen
**Kontext:** Ein zusätzlicher lokaler Passwort-Verifier würde zwei Identitäten und falsche Sicherheitsannahmen erzeugen. Zugleich verfehlte „Neues Gerät bis Dashboard“ das Budget, weil der Start auf die Serverbestätigung der Sitzung wartete.
**Entscheidung:** Supabase E-Mail/Passwort ist der einzige freigegebene Loginpfad; lokale Daten sind accountgebundener Cache. Online startet die gespeicherte Sitzung die Shell sofort und wird parallel bestätigt; scheitert die Bestätigung, verwirft CoRe den Start und zeigt die Anmeldung. Offline, ohne gespeicherte Sitzung und beim Passwort-Recovery bleibt die sequenzielle Prüfung.
**Konsequenzen:** Kein paralleler lokaler Login. Bis zur Bestätigung laufen nur Abrufe, die der Server ohnehin autorisiert; Daten anderer Accounts werden nie sichtbar.
**Datum:** 2026-10-10

## ADR-039 — CoRe-Modus An/Aus und wirksame Variantenregeln

**Status:** angenommen
**Kontext:** Der Modus bot `Aus`, `Auto` und `Manuell`, die sich kaum unterschieden; Variantenwerte wurden gespeichert, aber nie ausgewertet, und nach einem Fehler gab es keinen Rückfall auf das Original.
**Entscheidung:** Der CoRe-Modus ist je Stapel `An` oder `Aus`. Varianten entstehen nur auf ausdrückliche Aktion. Im Review wechselt eine Karte nur bei `An`, in der Wiederholungsphase, ohne aktuelles `Nochmal` und ab der Haltbarkeitsschwelle des Stapels reihum mit ihren ältesten aktiven Varianten; die Originalkarte bleibt Teil des Wechsels.
**Konsequenzen:** Die Variantenwahl ist eine reine Funktion von Stapeleinstellungen und Lernstand. Automatische Erzeugung bei Reife bleibt eine spätere Entscheidung mit eigener Kosten- und Datenschutzbewertung.
**Datum:** 2026-10-10

## ADR-041 — Stapelhierarchie und Stapelsammlung

**Status:** angenommen
**Kontext:** Ein Ebenenlimit und die APKG-Abflachung verloren echte Elternbeziehungen. Der Arbeitsstand `fitzbert` brachte eine neue Stapeldarstellung, die mit dem Kartenmodell und der Designsprache von main zusammenzuführen war.
**Entscheidung:** Stapel haben kein fachliches Ebenenlimit; Anlegen, Import und Verschieben erhalten die echte Elternbeziehung samt Pfad, ein Drop bedeutet immer „als direkter Unterstapel“. Ab Ebene 6 bleibt nur die Einrückung konstant. Aus `fitzbert` gelten Gruppen je Hauptstapel, die Wahl zwischen Liste und Kacheln und die Stapelinhalte mit Reitern; Explorer-Spalte, Anzahl-Badges, Fortschrittsringe und fremde Bedienhöhen nicht.
**Konsequenzen:** Verschieben prüft nur fehlende Ziele, Selbstbezug und Zyklen und aktualisiert den ganzen Unterbaum. Die Darstellungsregeln stehen unter [Stapelbäume](specs.md#stapelbäume).
**Datum:** 2026-10-12

## ADR-042 — Globaler Prüfungsplaner mit gemeinsamer Kontaktplanung

**Status:** angenommen
**Kontext:** `fitzbert` plante Prüfungen je Stapel in einem Dialog und lud dafür alle Kartenkörper. Prüfungen gehören aber zum Nutzer: Mehrere Prüfungen teilen Lernzeit und Karten, und main hält nur ein Lernfenster lokal. Verworfen wurden Priorität, Machbarkeitssperre, Zeitbedarf je Karte und Quizplanung.
**Entscheidung:** `Prüfungen` ist ein eigener Hauptbereich; Pläne liegen versioniert im Profil. Eine begrenzte deterministische Kontaktplanung verteilt alle ungesehenen Karten mit dem echten Scheduler bis zum Einführungsstichtag und gleicht die erwartete Last aus; teilen sich Prüfungen Stapel, wird jede Karte genau einmal eingeführt. Lernaufgaben laufen als normale Lernsitzung mit der Zielerinnerung der Prüfung. Speichern ist mit gültigen Angaben immer möglich; Unrealistisches erzeugt nur einen Hinweis.
**Konsequenzen:** Neu geplant wird nur online; offline bleiben die letzten Tagesziele nutzbar. Stapeleinstellungen bleiben unverändert, nach der Prüfung plant der normale Scheduler weiter. Quiz kehrt nur als eigenes Feature zurück. Die Detailregeln stehen unter [Prüfung](specs.md#10-prüfung).
**Datum:** 2026-10-12

## ADR-043 — Zusammenfassungen und Mindmaps als versionierte Online-Dokumente

**Status:** angenommen
**Kontext:** Zusammenfassungen und Mindmaps lagen nur im Browser; ein anderes Gerät oder gelöschte Browserdaten zeigten leere Tabs, während Stapel und Karten revisionsgeprüft online liegen. Echte Nutzerdaten gab es praktisch nicht.
**Entscheidung:** Beide liegen je Konto als versioniertes, von der App validiertes JSONB in eigenen Tabellen; die Datenbank vergibt die Revision. Umgestellt wurde ohne Schalter und ohne Upload lokaler Altstände. Bei Konflikten bleibt bei Zusammenfassungen der Cloudstand und die eigene Fassung wird zur Konfliktfassung; bei Mindmaps gewinnt der zuletzt gespeicherte Stand mit Hinweis. Mindmap-Bilder liegen in einem eigenen privaten Bucket.
**Konsequenzen:** Formatänderungen brauchen keine Datenbankmigration. IndexedDB bleibt Zwischenspeicher und Offline-Warteschlange.
**Datum:** 2026-10-17

## ADR-044 — FSRS-7-Scheduler und Reife aus der Haltbarkeit

**Status:** angenommen
**Kontext:** Die frühere Lernstufe (XP) zählte nur Bewertungsklicks, kannte weder Zeit noch Gedächtnis und machte eine stets mit `Gut` bewertete Karte erst nach Jahren reif; „Reif“ hatte zudem zwei Bedeutungen. Die rohe Stabilität taugt nicht als Reife, weil sie nach einem Fehler hoch bleibt, während die Erinnerung einbricht.
**Entscheidung:** Ein einziger Scheduler nutzt FSRS-7 mit stapelspezifischer Zielerinnerung und den Standardparametern. Reife folgt der Haltbarkeit (Tage bis 90 % Erinnerung): `Neu`, `Lernen`, `Jung`, `Reif` ab 21 Tagen. Katalog, Stapelzahlen, Statistik, Prüfungsfortschritt und Variantenfreigabe nutzen dieselbe Funktion. Persönlich optimierte Parameter sind zulässig, wenn sie aus dem eigenen Verlauf stammen und ihn messbar besser vorhersagen.
**Konsequenzen:** Vorschau und Commit bleiben deterministisch; die Reife wird als Band im Lernstand mitgeschrieben, damit Listen sie ohne Kartenkörper lesen. Die Beispielketten in `src/schedulerExampleChains.ts` erzeugen den Spec-Abschnitt zum Lernverlauf.
**Datum:** 2026-10-29

## ADR-045 — Tags, Flaggen und Lernbremse ankitreu speichern

**Status:** angenommen
**Kontext:** Tags wurden an `#`, `,` und `;` zerlegt, zählten als Inhaltsänderung und blockierten Import-Updates; ein Reimport ersetzte sie. Anki-Flaggen wurden nicht angeboten, `leech` blieb ein gewöhnliches Tag. Ein späterer Stapel-Export soll verlustfrei möglich bleiben.
**Entscheidung:** Tags und Flaggen werden genau wie in Anki gespeichert und erst in der Oberfläche vereinfacht. Eine Tag-Änderung ist keine Inhaltsänderung; ein Reimport führt eigene und importierte Tags dreiseitig zusammen. `marked` wird zur Markierung, `leech` zur Lernbremse, einem Lernstandsfeld getrennt von der Aussetzung, erkannt nach Ankis Schwellenregel. Manuelle Lernstandsänderungen sind manuelle Review-Ereignisse. Suche und Filter verstehen Ankis Begriffe online wie offline gleich. Der Karteneditor ist ein Dialog mit Reitern und Rückgängig für Sofortaktionen.
**Konsequenzen:** Tags, Flaggen, Markierung und Lernbremse überstehen Reimport und Sync; ein künftiger `.apkg`-Export kann sie zurückschreiben. Flaggennamen sind aus `.apkg` nicht übernehmbar. Oberfläche: [Kartendetail und Editor](specs.md#kartendetail-und-editor).
**Datum:** 2026-10-30

## ADR-046 — Vollständige ToolBox-Designsprache

**Status:** angenommen
**Kontext:** Der Vorgängerstil „Soft Minimal“ (2026-10-09) übernahm nur den Aufbau der BengtsToolBox und behielt eigene Palette, Höhen und Typostufen; die Übereinstimmung blieb sichtbar unvollständig.
**Entscheidung:** CoRe übernimmt die BengtsToolBox optisch vollständig, ohne ihr inhaltlich zu folgen: Neutral- und Markenpalette in Light und Dark, Bedienhöhen, Typostufen, Flächen, Radien und die lokal eingebettete Schrift Manrope, ohne externe Schriften. Funktion, Inhalte und Reihenfolge bleiben erhalten. Lernstatus und Bewertungen teilen vier gekoppelte Farbrollen.
**Konsequenzen:** `src/styles.css` trägt ausschließlich ToolBox-Werte; die konkreten Werte zeigt der UI-Katalog.
**Datum:** 2026-10-30

## ADR-047 — Originallayout importierter Karten

**Status:** angenommen
**Kontext:** Im reinen CoRe-Design verlieren eigene Notiztypen von Stapelautoren nicht nur Optik, sondern auch Struktur: Zeilen aus mehreren Feldern mit festem Text lassen sich mit Feldrollen nicht ausdrücken, und jeder solche Fall würde eine Sonderregel im Übersetzer.
**Entscheidung:** Generisch übersetzte Inhalte, deren Vorlage eigenes CSS ohne Script, Event-Handler oder Button mitbringt, erscheinen im Layout ihrer Herkunftsvorlage, gerendert aus den CoRe-Feldern im bestehenden Sandbox-Rahmen. Das ist eine Darstellungseigenschaft ohne Schalter; alles andere bleibt im CoRe-Design, ebenso die Oberfläche um die Karte.
**Konsequenzen:** Vorlagen werden mit den Inhalten auf alle Geräte synchronisiert. Karten eines Stapels können unterschiedlich aussehen, weil ihre Autoren es so gestaltet haben. Die Einzelregeln stehen unter [Kartenflächen](specs.md#kartenflächen) und in [`architecture.md`](architecture.md#kartendarstellung).
**Datum:** 2026-11-02
