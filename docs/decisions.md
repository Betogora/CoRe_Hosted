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
**Kontext:** Karten sollen auf ausdrückliche Aktion umformuliert, aus einer eigenen Quelle erstellt und Stapel zusammengefasst werden, ohne die entfernte breite KI-, Labs- und Job-Infrastruktur zurückzubringen und ohne Anbieterschlüssel im Browser. Beim Lernen sollen Lernende außerdem zu genau der aufgedeckten Karte eine Erklärung, ein Beispiel oder eine Antwort auf eine eigene Frage bekommen. Verworfen wurden eine Modellwahl durch Nutzer, Non-ZDR-Fallbacks, eine Serverqueue und ein freier Chat ohne Kartenbezug.
**Entscheidung:** Genau `POST /api/ai/card-variant`, `POST /api/ai/summary`, `POST /api/ai/card-help` und `POST /api/ai/source-cards` sind als authentifizierte Vercel Functions freigegeben. KI läuft nur auf ausdrückliche Aktion, mit einer Ausnahme: Erreicht eine Karte im CoRe-Modus mit einer Antwort die Haltbarkeitsschwelle und fehlt ihrer Variantenkette die nächste Variante, fordert der geöffnete Tab sie im Hintergrund an, höchstens bis zur Zahl aktiver Varianten des Stapels. Alle nutzen ein serverseitig festgelegtes, bezahltes Modell über OpenRouter mit Zero-Data-Retention und Trainingsverbot; das Key-Limit begrenzt die Kosten. Welches Modell mit welchem Reasoning gilt, ist keine Architekturentscheidung: Es steht im Code (`OPENROUTER_MODEL`); wie ein Wechsel belegt wird, regelt [ADR-049](#adr-049--ki-änderungen-nur-mit-eval-nachweis). An den Anbieter geht nur der bereinigte Text, den die jeweilige Funktion braucht. Stapelgenerierung läuft nacheinander im geöffneten Tab. `card-help` ist eine flüchtige Lernhilfe auf der Rückseite: Sie erhält nur den bereinigten Text der aktuellen Karte, den Modus (Erklären, Beispiel, eigene Frage) und höchstens sechs vorherige Wechsel; der Verlauf lebt nur im geöffneten Fenster und wird beim Kartenwechsel verworfen. `source-cards` (ergänzt 2026-11-18) erhält je Anfrage einen Abschnitt des im Browser ausgelesenen Quelltexts als Einheiten mit ID, den Auftrag als getrennte Daten und die Fragen früherer Abschnitte; große Quellen laufen abschnittweise nacheinander im geöffneten Tab, ein Auftrag ergibt höchstens 100 Vorschläge, belegt nur über diese IDs. Quelle und Vorschläge werden nicht gespeichert.
**Konsequenzen:** Keine Jobtabelle, gespeicherten oder synchronisierten Chatverläufe, Chatfläche ohne Kartenbezug oder Anbieteradapter. Bilder gehen vorerst nicht an den Anbieter, deshalb bekommen Bildverdeckungen und reine Bildkarten keine Lernhilfe; Bilder als Quelle für neue Karten sind für später vorgesehen und brauchen eine Ergänzung dieser Entscheidung. Jede Route schreibt ein Kostenlog. Weil die Lernhilfe deutlich mehr Aufrufe erzeugt, ist ein Kontingent je Nutzer Voraussetzung, bevor sie externen Nutzern offensteht. Das Kontingent selbst braucht eine Ergänzung dieser Entscheidung.
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

## ADR-039 — CoRe-Modus An/Aus und Variantenkette

**Status:** angenommen
**Kontext:** Der Modus bot `Aus`, `Auto` und `Manuell`, die sich kaum unterschieden; Variantenwerte wurden gespeichert, aber nie ausgewertet, und nach einem Fehler gab es keinen Rückfall auf das Original.
**Entscheidung:** Der CoRe-Modus ist je Stapel `An` oder `Aus`. Eine Freigabe entscheidet, ob statt der Karte eine Variante kommt: bei `An`, in der Wiederholungsphase, ohne aktuelles `Nochmal`, ab der Haltbarkeitsschwelle des Stapels und frühestens drei Tage nach der letzten Antwort. Eine Kette entscheidet, welche: Der Lernstand merkt sich die erreichte Stufe (0 = Karte), und die nächste Variante kommt; `Gut` und `Leicht` rücken vor, `Schwer` bleibt, `Nochmal` geht eine Stufe zurück, nach der letzten kommt die am längsten nicht gesehene. Die nächste Variante entsteht vorausschauend ([ADR-011](#adr-011--schmale-ki-routen-über-openrouter)). Verworfen wurde der Wechsel reihum mit dem Original, weil er die vertraute Formulierung immer wieder zeigt.
**Konsequenzen:** Die Variantenwahl ist eine reine Funktion von Stapeleinstellungen, Lernstand und Uhrzeit. Die Stufe gehört zum Lernstand und wird mit jeder Antwort gespeichert, synchronisiert und zurückgenommen; Antworten bei geschlossener Freigabe lassen sie stehen.
**Datum:** 2026-11-19

## ADR-041 — Stapelhierarchie und Stapelsammlung

**Status:** angenommen
**Kontext:** Ein Ebenenlimit und die APKG-Abflachung verloren echte Elternbeziehungen. Der Arbeitsstand `fitzbert` brachte eine neue Stapeldarstellung, die mit dem Kartenmodell und der Designsprache von main zusammenzuführen war.
**Entscheidung:** Stapel haben kein fachliches Ebenenlimit; Anlegen, Import und Verschieben erhalten die echte Elternbeziehung samt Pfad, ein Drop bedeutet immer „als direkter Unterstapel“. Ab Ebene 6 bleibt nur die Einrückung konstant. Aus `fitzbert` gelten Gruppen je Hauptstapel, die Wahl zwischen Liste und Kacheln und die Stapelinhalte mit Reitern; Explorer-Spalte, Anzahl-Badges, Fortschrittsringe und fremde Bedienhöhen nicht.
**Konsequenzen:** Verschieben prüft nur fehlende Ziele, Selbstbezug und Zyklen und aktualisiert den ganzen Unterbaum. Die Regeln stehen unter [Stapel](specs.md#stapel).
**Datum:** 2026-10-12

## ADR-042 — Globaler Prüfungsplaner mit gemeinsamer Kontaktplanung

**Status:** angenommen
**Kontext:** `fitzbert` plante Prüfungen je Stapel in einem Dialog und lud dafür alle Kartenkörper. Prüfungen gehören aber zum Nutzer: Mehrere Prüfungen teilen Lernzeit und Karten, und main hält nur ein Lernfenster lokal. Verworfen wurden Priorität, Machbarkeitssperre, Zeitbedarf je Karte und Quizplanung.
**Entscheidung:** `Prüfungen` ist ein eigener Hauptbereich; Pläne liegen versioniert im Profil. Eine begrenzte deterministische Kontaktplanung verteilt alle ungesehenen Karten mit dem echten Scheduler bis zum Einführungsstichtag und gleicht die erwartete Last aus; teilen sich Prüfungen Stapel, wird jede Karte genau einmal eingeführt. Lernaufgaben laufen als normale Lernsitzung mit der Zielerinnerung der Prüfung. Speichern ist mit gültigen Angaben immer möglich; Unrealistisches erzeugt nur einen Hinweis.
**Konsequenzen:** Neu geplant wird nur online; offline bleiben die letzten Tagesziele nutzbar. Stapeleinstellungen bleiben unverändert, nach der Prüfung plant der normale Scheduler weiter. Quiz kehrt nur als eigenes Feature zurück. Die Detailregeln stehen unter [Prüfungsplanung](specs.md#7-prüfungsplanung).
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
**Konsequenzen:** Tags, Flaggen, Markierung und Lernbremse überstehen Reimport und Sync; ein künftiger `.apkg`-Export kann sie zurückschreiben. Flaggennamen sind aus `.apkg` nicht übernehmbar. Verhalten: [Karteneditor](specs.md#karteneditor).
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
**Konsequenzen:** Vorlagen werden mit den Inhalten auf alle Geräte synchronisiert. Karten eines Stapels können unterschiedlich aussehen, weil ihre Autoren es so gestaltet haben. Die Einzelregeln stehen unter [Kartendarstellung](specs.md#kartendarstellung) und in [`architecture.md`](architecture.md#kartendarstellung).
**Datum:** 2026-11-02

## ADR-048 — Kartensuche lokal über den vollständigen Katalog

**Status:** angenommen
**Kontext:** Die Kartenverwaltung soll bei 50.000 Karten flüssig suchen (Eingabe bis Treffer höchstens 100 ms). Die Cloudsuche brauchte am 2026-11-04 für 60 Stapel 2,5 bis 3,6 s, und jede Anfrage trägt mindestens eine Netzwerk-Rundreise. Der lokale Katalog konnte nicht einspringen, weil Cloud-Katalogzeilen nur die Vorschau trugen.
**Entscheidung:** Ein vollständiger Katalog sucht lokal. Der Volltext jedes Inhalts samt Feldtexten läuft als eigene Tabelle `note_search` durch den Katalog-Delta-Sync, getrennt von `card_catalog`, damit nicht jede Bewertung den Text erneut überträgt. Gesucht wird in einem In-Memory-Index ohne Worker (gemessen 10 bis 17 ms je Suche bei 50.000 Karten mit vorab berechneter Sortierung). Lokale und Cloudsuche teilen die Semantik `matchesCardSearch` und liefern dieselben Treffer; ein unvollständiger Katalog sucht weiter in der Cloud. Eine schnellere Cloudsuche entfällt, weil sie nur die erste Synchronisierung eines Geräts betrifft.
**Konsequenzen:** Die Erstsynchronisierung überträgt zusätzlich die Suchtexte (höchstens 4.000 Zeichen je Inhalt). Migration und Client gehören in denselben Release, weil ein älterer Client die neue Delta-Tabelle ablehnt. Jeder Suchbegriff braucht Daten, die lokal und in der Cloud gleich vorliegen: `prop:r` (Abrufwahrscheinlichkeit) entfällt, weil sie sich mit der Uhrzeit ändert; `is:buried` umfasst nur manuell zurückgestellte Karten, weil zurückgestellte Geschwister erst beim Aufbau der Sitzung entstehen. `npm run benchmark:search` hält das Budget fest (p95 höchstens 100 ms, erste Suche höchstens 250 ms bei 50.000 Karten).
**Produktentscheidungen der Kartenverwaltung 2.0 (2026-11-04, Stand 2026-11-09):**
- Zielgröße: 50.000 Karten flüssig, 100.000 bedienbar; „flüssig“ heißt gemessene Budgets, nicht geschätzte.
- Die Kartenverwaltung zeigt immer eine flache Liste, auch ohne Suche; Stapel wählt der Stapelfilter der Suchzeile.
- Massenaktionen bestätigen mit Wirkung und Anzahl; danach lässt sich jede zurücknehmen, auch `Löschen`.
- Die Suche durchsucht alle Felder und kann in einem einzelnen Feld suchen; das Suchmenü erklärt Begriffe und Kombinationsregeln selbst.
- Suche, Filter und Sortierung leben nur im Bildschirmzustand; dauerhaft sind nur gespeicherte Suchen.
- Keine regulären Ausdrücke, weder in der Suche noch in `Suchen und Ersetzen`.
- Kein Ankis `Reposition`: Welche Karten zuerst drankommen, steuern `Treffer lernen` und die Prüfungsplanung; Importe behalten ihre Reihenfolge über das Erstelldatum.
- `Treffer lernen` bietet wie Ankis gefilterte Stapel beide Wege: `Vorziehen` mit zählenden Bewertungen (Standard) und `Nur üben` ohne Planänderung.
**Datum:** 2026-11-04

## ADR-049 — KI-Änderungen nur mit Eval-Nachweis

**Status:** angenommen
**Kontext:** Der Variantenprompt wurde bis `card-variant-v4` in Chat-Playtests mit sechs Karten iteriert. Das war nicht reproduzierbar, trennte nicht zwischen gelesenen und gewerteten Fällen und hielt Kosten und Qualität nicht fest. Seit alle vier KI-Routen stehen, wird gemessen (P5). Verworfen wurden weitere Chat-Playtests, ein Ersatzmodell als Generator (etwa über eine Subscription), weil es ein anderes Modell in einem anderen Rahmen misst, und eine Handkalibrierung des Richters vor der ersten Messung, weil die Grenzfälle jedes Berichts schneller zeigen, ob er taugt.
**Entscheidung:** Prompt, Werkzeugschema, Reasoning, Ausgabegrenzen oder Modell einer KI-Route ändern sich nur mit Eval-Nachweis. Je Anfragetyp gibt es einen festen Fallsatz, je Kategorie und Fach zufällig in Training, Entscheidung und Rückhalt geteilt (35/40/25, geändert 2026-11-24); Fälle derselben Karte, Notiz oder Quelle liegen im selben Teil. Erzeugt wird ausschließlich über Payload-Builder und Antwortprüfung der Route bei OpenRouter mit ZDR; ein Kandidat darf den Payload ersetzen, und jeder Lauf trägt den Fingerabdruck seines Payloads ohne Nutzdaten. Bewertet wird automatisch, wo eine Regel prüfbar ist, sonst durch ein stärkeres Modell (derzeit Opus 5.5 als Subagent in Claude Code) in kleinen Blöcken mit je frischem Kontext; jeder Bericht zeigt die am wenigsten eindeutigen Urteile, doppelt bewertete Einträge messen das Richterrauschen. Kandidaten entstehen aus Fehlern des Trainingsteils und werden am Entscheidungsteil gemessen. Übernommen wird ein Kandidat, wenn der gepaarte Abstand zum Bestand im Bootstrap über Gruppen (Karte, Notiz, Quelle) in mindestens 90 % der Stichproben positiv ist und kein kritisches Kriterium in mindestens 90 % schlechter (geändert 2026-11-25, vorher „über dem Rauschen und kein kritisches Kriterium schlechter“, das einzelne Ausreißer nicht vom Zufall trennte); der Code baut danach denselben Fingerabdruck. Kosten und Latenz entscheiden nicht mit; für sie gelten unverbindliche Richtwerte je Anfragetyp (geändert 2026-11-25). Ein Kandidat, der ein benanntes Fehlerbild klar behebt und den Rest nicht messbar verschlechtert, gilt als vorläufig; höchstens drei vorläufige Schritte bestätigt eine gemeinsame Messung gegen den letzten bestätigten Stand, sonst gilt dieser wieder (ergänzt 2026-11-24). Der Rückhalt wird nur zur Baseline und am Ende einer Reihe gemessen. Varianten haben je Kartenart einen eigenen Prompt und Vertrag.
**Konsequenzen:** Der Eval ist ein manueller, bezahlter Lauf außerhalb von `gate:push`; er nutzt den lokalen OpenRouter-Schlüssel, dessen Limit die Kosten begrenzt, und jeder Lauf hat ein eigenes Budget. Fälle aus echten Stapeln und Rohdaten bleiben lokal; versioniert werden nur selbst geschriebene Prüfkarten und Kennzahlen. Jede übernommene Änderung erhöht die Promptversion; ein Modellwechsel braucht je Anfragetyp eine neue Baseline. Bildverdeckungen bekommen keine Varianten, solange ADR-011 keine Bildübertragung erlaubt. Die Kennzahlen jedes Laufs stehen im Ledger und auf der Seite [KI-Eval](ai-eval.md), offene Arbeit unter [Später › KI in `todo.md`](todo.md#ki).
**Datum:** 2026-11-11, neu gefasst 2026-11-23

## ADR-050 — Leistungsdaten nur lokal

**Status:** angenommen
**Kontext:** Alle Performance-Werte sind Laborwerte (gebremster Browser auf einem Entwicklungsrechner); Werte echter Geräte fehlen. Verworfen wurden eine Opt-in-Übertragung in eine eigene Supabase-Tabelle (braucht Einwilligung, Migration, RPC und Datenschutztext) und Vercel Speed Insights (zusätzlicher Anbieter und Kosten, misst die Lern- und Suchinteraktionen nicht).
**Entscheidung:** CoRe zeichnet Startphasen und die Dauer von `Antwort anzeigen`, Bewertung bis zur nächsten Karte und Kartensuche nur lokal je Account auf: Dauer in Millisekunden mit dem Tag, keine Inhalte, Suchtexte, IDs oder Uhrzeiten. Nichts wird übertragen; Lernende kopieren eine Zusammenfassung selbst und schicken sie, wenn sie wollen. Eine Übertragung braucht eine eigene Entscheidung mit Einwilligung.
**Konsequenzen:** Die Stichprobe ist klein und hängt von der Bereitschaft der Testenden ab. Es gibt keinen Telemetrieanbieter und keine Serverroute. Je Messgröße bleiben die letzten 200 Werte der laufenden App-Version; eine neue Version beginnt leer. Eine spätere Übertragung kann dieselbe Aufzeichnung weiterverwenden.
**Datum:** 2026-11-12

## ADR-051 — Acht Regeln der Designsprache und eine gemeinsame Mittelschicht

**Status:** angenommen
**Kontext:** Trotz einheitlicher ToolBox-Tokens (ADR-046) wirkten die Ansichten uneinheitlich: Abschnittsköpfe, Innenkästen, Kennzahlen, Schrittfolgen, Reiter und Dialograhmen entstanden je Ansicht neu, Schmuck (getönte Icon-Kacheln, Eyebrows, Erklär-Untertitel) verwischte die Hierarchie. Ein A/B/C-Vergleich über 20 Ansichten (2026-11-12) hat die Fassung festgelegt; eine randlose, rein tonale Flächenvariante wurde verworfen.
**Entscheidung:** Für jede Ansicht gelten acht Regeln: (1) eine Ebene: im Panel kein zweiter gerahmter Kasten, Gliederung über Abstand, Haarlinie oder eine flache getönte Innenfläche; Eingabefelder, Lese- und Zeichenflächen bleiben gerahmt; (2) Typografie trägt die Hierarchie: vier Gewichte für Text, Beschriftung, Aktion und Überschrift, kein Eyebrow, kein erklärender Untertitel; (3) Farbe bedeutet etwas: keine getönte Icon-Kachel als Schmuck, eine Kachel gibt es nur als Stapelidentität; (4) eine Auswahlsprache: weiße Pille in Schienen, blauer Rahmen mit heller Tönung bei Optionskarten; (5) zwei Zeilendichten und eine gemeinsame Menüzeile, nur die Kartentabelle ist bewusst enger; (6) ein Kopf je Fläche: Titel links, Aktionen rechts, ohne Icon; (7) Schritte sind eine Linie aus nummerierter Marke und Wort im gemeinsamen Baustein, Zustandsanzeigen wie das Reifeband bleiben Punkt und Wort; (8) Kennzahlen stehen frei als Zahl und Wort, ohne Kasten. Schatten tragen nur schwebende Ebenen (Navigation, Overlay, Popover, Toast). Wiederkehrende Strukturen sind gemeinsame Bausteine in `src/ui/`; Auswahlfelder und Datumsauswahl folgen Form und Verhalten von HeroUI v3 als eigene Bausteine ohne neue Abhängigkeit. Die Bewertungsbuttons der Lernsitzung behalten ihre vier Farbflächen.
**Konsequenzen:** Neue Ansichten bauen auf der Mittelschicht auf, der UI-Katalog zeigt jeden Baustein. Maße, Gewichte und Bausteinverträge stehen in `src/ui/README.md` und werden nur dort gepflegt.
**Datum:** 2026-11-12

## ADR-052 — Navigationskopf: Karte und Leiste, Menü, Ausblenden ohne Neulayout

**Status:** angenommen
**Kontext:** Unterseiten zeigten ihren Rückweg nur im Seitenkopf, die Navigation trug fünf Symbolbuttons, und der Kopf nahm beim Lesen langer Seiten dauerhaft Platz ein. Übernommen wurde das in BengtsToolBox gemessene Muster. Verworfen wurde, Höhe, Innenabstand oder Rahmen zu animieren: Gemessen bei vierfach gebremster CPU kostet das 12–18 Layout-Durchläufe je Übergang statt 1–3, weil die ganze Seite darunter in jedem Bild neu gelayoutet wird. Verworfen wurde auch ein eigener Theme-Button neben dem Menü, weil das Farbschema selten gewechselt wird.
**Entscheidung:** Hauptbereiche zeigen die schwebende Karte mit Marke, Unterseiten eine breite Leiste mit Rückweg und Titel. Beim Wechsel springt das Layout sofort auf die Zielhöhe; animiert werden nur `clip-path`, `translate` und `opacity`. Einstellungen, Statistik und Hilfe liegen in einem Menü, Hell und Dunkel ist eine Einstellung der Darstellung; Sync-Hinweis und Pomodoro bleiben sichtbar. Der Kopf weicht beim Herunterscrollen aus und kehrt beim Hochscrollen zurück, auf Smartphone und Desktop gleich.
**Konsequenzen:** Wer den Kopf ändert, hält die Messung aus dem PR bei: Layout-Durchläufe je Übergang wie ohne Animation. Angeheftete Elemente richten sich nach dem Versatz des Kopfes, auf dem Desktop liegt der Kopf über dem scrollenden Inhalt. Die Verträge stehen bei `AppNavigation` in `src/ui/README.md`.
**Datum:** 2026-11-22
