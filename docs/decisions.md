# CoRe-Entscheidungen

Stand: 2026-11-11

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
**Konsequenzen:** Eine frühere Route oder Altstruktur begründet keinen Produktanspruch. Schalter für gebaute, noch nicht freigegebene Loginwege (Magic Link) sind zulässig. Produktive Datenlöschung erfolgt nur nach App-Deployment und verifizierter Projekt-Ref.
**Datum:** 2026-07-15

## ADR-006 — Keine generische Anbieteradapter-Schicht

**Status:** angenommen
**Kontext:** Für Auth und Cloud-Persistenz gibt es jeweils genau einen real betriebenen Pfad; hypothetische Interfaces kosten Komplexität ohne Nutzen.
**Entscheidung:** Konkrete tiefe Module kapseln Supabase. Eine generische Adapterebene entsteht erst, wenn mindestens zwei reale Implementierungen gleichzeitig unterstützt werden müssen.
**Konsequenzen:** React bleibt providerfrei, ohne Adapter-Konfiguration.
**Datum:** 2026-07-13

## ADR-011 — Schmale KI-Routen über OpenRouter

**Status:** angenommen
**Kontext:** Karten sollen auf ausdrückliche Aktion umformuliert und Stapel zusammengefasst werden, ohne die entfernte breite KI-, Labs- und Job-Infrastruktur zurückzubringen und ohne Anbieterschlüssel im Browser. Beim Lernen sollen Lernende außerdem zu genau der aufgedeckten Karte eine Erklärung, ein Beispiel oder eine Antwort auf eine eigene Frage bekommen. Verworfen wurden eine Modellwahl durch Nutzer, Non-ZDR-Fallbacks, eine Serverqueue und ein freier Chat ohne Kartenbezug.
**Entscheidung:** Genau `POST /api/ai/card-variant`, `POST /api/ai/summary` und `POST /api/ai/card-help` sind als authentifizierte Vercel Functions freigegeben. Alle nutzen ein serverseitig festgelegtes, bezahltes Modell über OpenRouter mit Zero-Data-Retention und Trainingsverbot; das Key-Limit begrenzt die Kosten. Welches Modell mit welchem Reasoning gilt, ist keine Architekturentscheidung: Es steht im Code (`OPENROUTER_MODEL`); wie ein Wechsel belegt wird, schlägt [ADR-049](#adr-049--ki-änderungen-nur-mit-eval-nachweis) vor. An den Anbieter geht nur der bereinigte Text, den die jeweilige Funktion braucht. Stapelgenerierung läuft nacheinander im geöffneten Tab. `card-help` ist eine flüchtige Lernhilfe auf der Rückseite: Sie erhält nur den bereinigten Text der aktuellen Karte, den Modus (Erklären, Beispiel, eigene Frage) und höchstens sechs vorherige Wechsel; der Verlauf lebt nur im geöffneten Fenster und wird beim Kartenwechsel verworfen.
**Konsequenzen:** Keine Jobtabelle, gespeicherten oder synchronisierten Chatverläufe, Chatfläche ohne Kartenbezug, Anbieteradapter oder Bildübertragung; Bildverdeckungen und reine Bildkarten bekommen keine Lernhilfe. Jede Route schreibt ein Kostenlog. Weil die Lernhilfe deutlich mehr Aufrufe erzeugt, ist ein Kontingent je Nutzer Voraussetzung, bevor sie externen Nutzern offensteht. Automatische Erzeugung bei Reife oder das Kontingent selbst brauchen eine Ergänzung dieser Entscheidung.
**Datum:** 2026-11-11

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

## ADR-048 — Kartensuche lokal über den vollständigen Katalog

**Status:** angenommen
**Kontext:** Die Kartenverwaltung soll bei 50.000 Karten flüssig suchen (Eingabe bis Treffer höchstens 100 ms). Die Cloudsuche brauchte am 2026-11-04 für 60 Stapel 2,5 bis 3,6 s, und jede Anfrage trägt mindestens eine Netzwerk-Rundreise. Der lokale Katalog konnte nicht einspringen: Cloud-Katalogzeilen tragen nur die Vorschau, den Volltext hatten nur lokal angelegte oder geöffnete Inhalte (8 von 6.054 Zeilen im Testkonto).
**Entscheidung:** Ein vollständiger Katalog sucht lokal. Der Volltext jedes Inhalts läuft als eigene Tabelle `note_search` durch den Katalog-Delta-Sync, getrennt von `card_catalog`, damit nicht jede Bewertung den Text erneut überträgt. Gesucht wird in einem In-Memory-Index ohne Worker: Eine Messung im Browser ergab für 50.000 Karten mit je rund 400 Zeichen 10 bis 17 ms je Suche, wenn die Sortierung vorab einmal berechnet ist. Die Semantik bleibt `matchesCardSearch`, damit lokale und Cloudsuche dieselben Treffer liefern. Ein unvollständiger Katalog sucht weiter in der Cloud.
**Konsequenzen:** Die Erstsynchronisierung überträgt zusätzlich die Suchtexte (höchstens 4.000 Zeichen je Inhalt), der lokale Speicher wächst entsprechend. Die lokale Datenbank erhält Version 2; das Upgrade legt `noteSearch` an und stuft einen vollständigen Katalog auf `partial` zurück, bis der nächste Delta-Pull die Texte gebracht hat. Lokal sucht ein Katalog nur, wenn seine Abstimmung Suchtexte gebracht hat (`searchTextsReady`); gegen einen Server ohne `note_search` sucht auch ein neuer Client weiter in der Cloud. Ein älterer Client lehnt die neue Delta-Tabelle ab, Migration und Client gehören deshalb in denselben Release. Mit denselben Daten sucht `Feld:Text` in einem benannten Feld: Der Client schreibt die Feldtexte nach `notes.search_fields`, `note_search` repliziert sie, und beide Cloud-RPCs werten den Begriff gleich aus. `npm run benchmark:search` hält das Budget fest (p95 höchstens 100 ms, erste Suche höchstens 250 ms bei 50.000 Karten; gemessen 75 und 55 ms). Eine schnellere Cloudsuche für unvollständige Kataloge entfällt, weil sie nur die erste Synchronisierung eines Geräts betrifft. Jeder Suchbegriff braucht deshalb Daten, die lokal und in der Cloud gleich vorliegen: `prop:r` (Abrufwahrscheinlichkeit) entfällt, weil sie sich mit der Uhrzeit ändert und nur der Client sie aus dem FSRS-7-Zustand berechnen kann; `is:buried` umfasst nur manuell zurückgestellte Karten, weil zurückgestellte Geschwister erst beim Aufbau der Lernsitzung entstehen (2026-11-05).
**Cutover (2026-11-10):** Die zehn Schritt-Migrationen der Kartenverwaltung (`20261104220000` bis `20261110120000`) sind vor dem Release zu `20261110130000_kartenverwaltung` gefaltet. Keine von ihnen war remote angewandt (Production stand auf `20261102102620`), es braucht daher weder `migration repair` noch eine Datenumrechnung. Die gefaltete Migration ergibt Schema und Rechte von `public` und `private` zeilengleich zur Kette (Vergleich per `pg_dump` nach `db reset`); statt 3.594 Zeilen mit bis zu acht Neufassungen derselben Funktion trägt sie den Endstand in 915 Zeilen. Der lokale Datenbank-Upgrade im Client bleibt, weil installierte Clients noch Version 1 haben und ihre Outbox erhalten müssen.
**Befund der Kartenverwaltung vor 2.0 (2026-11-04):** Sichtprüfung und Messung mit 60 Stapeln, darunter `Muskeltrainer` mit 581 Karten. Die Cloudsuche nummerierte und zählte alle Treffer je Stapel vor der ersten Seite, wertete `flag:`/`tag:` je Zeile über `jsonb_array_elements` aus und lief auch bei vollständigem lokalem Katalog. Während der Suche zeigte jeder Stapel `Keine Karten`, danach online fälschlich den Offline-Hinweis. `is:due` und andere Anki-Begriffe liefen kommentarlos als Freitext. 581 Karten mit demselben Sortierfeld ließen sich erst im Editor unterscheiden. Es gab keinen Stapelfilter und keine Mehrfachauswahl, 50er-Seiten je Stapel zerlegten Treffer über viele Stapel, der Spaltenkopf scrollte weg, Kartenzeilen waren nicht unter ihren Stapelkopf eingerückt, das Panel hieß `Aktive Stapel`, Elternstapel zeigten `Keine Karten` trotz Karten in Unterstapeln, und mobil belegten Suche und Filter den ersten Bildschirm, Fragen wurden nach etwa 14 Zeichen gekürzt.
**Produktentscheidungen der Kartenverwaltung 2.0 (2026-11-04):**
- Zielgröße: 50.000 Karten flüssig, 100.000 bedienbar. „Flüssig“ heißt die gemessenen Budgets, etwa die der Suche oben (`npm run benchmark:search`), nicht geschätzte.
- Ohne Suche und Filter bleibt der Stapelbaum; mit Suchtext oder einem Filter außer dem Stapelfilter zeigt die Liste alle Treffer flach. Der Stapelfilter allein zeigt den gewählten Teilbaum. *Ersetzt am 2026-11-09 (KV3b): Die Kartenverwaltung zeigt immer eine flache Liste mit kompakten Zeilen, auch ohne Suche; Stapelzeilen und Stapelmenü gibt es dort nicht mehr.*
- Stapel wandern aus der Trefferliste in den Stapelfilter der Suchzeile.
- Massenaktionen bestätigen ab einer Karte mit Dialog (Wirkung und Anzahl); danach folgt in jedem Fall ein Toast mit `Rückgängig`, auch bei `Löschen`.
- Die Suche durchsucht wie zuvor alle Felder und kann zusätzlich in einem einzelnen Feld suchen.
- Das Menü erklärt Kombinationsregeln, Chips und Suchbegriffe selbst.
- Menüaufbau (A/B-Runden 1 und 2): Das Menü klappt unter der Suchzeile auf. Kategorien links, rechts die Einträge der gewählten Kategorie mit Suchbegriff und dem Schalter `Mit`/`Egal`/`Ohne` (Ausgangsstellung `Egal`, also nicht Teil der Suche). Darüber steht der erzeugte Suchausdruck mit Kopieren. `Speichern` legt ihn als benannte Suche ab, `Zurücksetzen` leert alle Filter. Gespeicherte Suchen und Suchsyntax bilden zusammen die letzte Kategorie `Gespeichert & Syntax`.
- Mobil: Suchfeld mit Stapel- und Filter-Icon samt Zähler; das Filter-Icon unterscheidet sich vom Icon des Knopfs `Lerneinstellungen`.
- Bausteine: vorhandene UI-Komponenten (`DeckSelect`, `ActionButton`, `IconButton`, `CoreSegmentedControl`, `FlagDot`, `core-field`, `SoftPanel`); neu sind nur Kategorienleiste (Muster der `InPageNavigation`-Leiste), Filter-Chip (Muster der `TagInput`-Chips) und `CoreTriStateControl` (A/B-Runde 3, Variante A): dieselbe Schiene wie `CoreSegmentedControl` (Rahmen, Radius, 3 px Innenabstand, 4 px Abstand), aber quadratische Symbolsegmente ✓ | – | ⊘ in Auswahlhöhe minus 8 px (30 px, bei Touch 36 px), Ausgangsstellung `Egal` in der Mitte. Der Indikator gleitet in 180 ms und blendet seine Farbe in 260 ms über (blau `Mit`, rot `Ohne`, neutral `Egal`); Reduced Motion schaltet beides ab. Rolle `radiogroup`, Tooltips nennen `Mit`, `Egal`, `Ohne`. Alle neuen Elemente folgen der Designsprache der BengtsToolBox (ADR-046) und kommen in den UI-Katalog.
- Persistenz: so einfach wie möglich. Suche, Filter und Sortierung leben nur im Bildschirmzustand; Reload oder Reiterwechsel beginnt leer. Dauerhaft sind nur gespeicherte Suchen. Nachsteuern erst bei Bedarf.
- `Suchen und Ersetzen` ersetzt wörtlichen Text; reguläre Ausdrücke gibt es weder dort noch in der Suche.
- Kein Ankis `Reposition` (Position neuer Karten): Welche Karten zuerst drankommen, steuern `Treffer lernen` und die Prüfungsplanung; Importe behalten ihre Reihenfolge über das Erstelldatum.
- `Treffer lernen` bietet wie Ankis gefilterte Stapel beide Wege (KV5): `Vorziehen` mit zählenden Bewertungen (Standard, wie Ankis voreingestellte Option „Reschedule cards based on my answers“) und `Nur üben` ohne Planänderung (Ankis Vorschaumodus).
**Datum:** 2026-11-04

## ADR-049 — KI-Änderungen nur mit Eval-Nachweis

**Status:** vorgeschlagen
**Kontext:** Der Variantenprompt wurde bis `card-variant-v4` in Chat-Playtests mit sechs Karten iteriert. Das war nicht reproduzierbar, trennte nicht zwischen gelesenen und gewerteten Fällen und hielt Kosten und Qualität nicht fest. Verworfen wurden weitere Chat-Playtests und ein Ersatzmodell als Generator (etwa Haiku über Claude Code), weil es ein anderes Modell in einem anderen Rahmen misst. Zurückgestellt am 2026-11-11, bis alle geplanten KI-Prompts stehen; bis dahin entstehen Prompts mit Vertrags- und Routentests und Stichproben.
**Entscheidung:** Prompt, Werkzeugschema, Reasoning, Ausgabegrenzen oder Modell einer KI-Route ändern sich nur mit Eval-Nachweis. Ein Eval hat einen festen Fallsatz mit zufälliger, nach Kategorie geschichteter Aufteilung in Training und Test; erzeugt wird ausschließlich über den Payload-Builder und die Antwortprüfung der Route bei OpenRouter, also mit Produktionsmodell und ZDR. Bewertet wird automatisch und durch ein stärkeres, vom getesteten unabhängiges Modell, das vor der ersten Runde gegen menschliche Urteile kalibriert ist. Übernommen wird eine Änderung nur, wenn der Testwert über das Rauschen steigt und kein kritisches Kriterium schlechter wird. Varianten haben je Kartenart einen eigenen Prompt und Vertrag.
**Konsequenzen:** Der Eval ist ein manueller, bezahlter Lauf außerhalb von `gate:push` mit eigenem OpenRouter-Schlüssel und eigenem Limit. Fälle aus echten Stapeln und Laufergebnisse bleiben lokal, nur von Hand geschriebene Prüfkarten werden versioniert. Jede übernommene Änderung erhöht die Promptversion. Bildverdeckungen bekommen keine Varianten, solange ADR-011 keine Bildübertragung erlaubt. Der Entwurf steht unter [P5 in `todo.md`](todo.md#p5-ki-eval-und-hillclimb-zurückgestellt).
**Datum:** 2026-11-11
