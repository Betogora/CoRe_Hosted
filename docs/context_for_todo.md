Strategische Synthese — Phase 3

Repository-Stand: main auf Commit e6fa1497d05e2e5f26b593e71332692c72e9b914 vom 15. Juli 2026. Dieser Stand entspricht dem in Phase 2 untersuchten Commit. Der letzte Commit isoliert einen Beta-Core-Auth-Test; für diesen SHA ist über GitHub derzeit kein abgeschlossener Workflow-Lauf abrufbar.

Evidenzgrenze: Der angekündigte vollständige Phase-1-Bericht war in den übergebenen Dateien nicht separat enthalten. Die Synthese stützt sich deshalb auf den vollständigen Phase-2-Bericht, das Übergabepaket, die aktuelle Repository-Dokumentation und den aktuellen Code.

Änderungsstatus: In dieser Phase wurde kein Code verändert.

1. Executive Summary
Gesamturteil

CoRe ist derzeit:

technisch ein fortgeschrittener Web-MVP,
in einzelnen Infrastruktur- und Importbereichen bereits ungewöhnlich robust,
als klassisches Karteikartenprodukt aber noch nicht geschlossen genug für eine unbegleitete Beta.

Die Aussagen „produktionsreif“, „vollständig getestet“ oder „nur noch Hosted-Abnahme offen“ sind für das Gesamtprodukt nicht haltbar. Hosted-Betrieb, RLS, Sync, APKG-Verarbeitung und Build-Gates können weit fortgeschritten sein, während Kernreisen wie Karte bearbeiten, fünf Karten nacheinander erstellen, eine Karte wiederfinden oder nach Reload in denselben Kontext zurückkehren weiterhin fehlerhaft sind. Auch docs/status.md unterscheidet zwischen breitem MVP und weiterhin offener manueller Produkt-, Accessibility- und Hosted-Abnahme.

Die größte technische Produktgefahr ist die semantisch unsichere Kartenbearbeitung. Die derzeitige generische Aktualisierung schreibt Vorderseite, Rückseite, Tags und Typ, regeneriert jedoch weder Reverse- und Cloze-Ableitungen noch hält sie die strukturierten Multiple-Choice-Felder konsistent. Dadurch kann eine erfolgreich gespeicherte Karte später etwas anderes prüfen als im Editor sichtbar war.

Die größte UX-Gefahr ist die Kombination aus:

parallelem lokalem und URL-basiertem Navigationszustand,
zwei unterschiedlich interpretierten Deckoberflächen,
einem unterbrochenen Batch-Erstellungsfluss,
nicht übereinstimmenden Bibliotheks- und Queue-Zahlen,
einer unsichtbaren 80-Karten-Grenze.

Das sind keine kosmetischen Probleme. Sie verhindern ein verlässliches mentales Modell des Produkts.

Was bereits besser als Anki wirkt

Nicht in jeder Funktion, aber in klar umrissenen Bereichen besitzt CoRe ein überzeugenderes Produktfundament:

Ruhigere Weboberfläche und moderne visuelle Grundstruktur.
Der Review-Modus, die klaren Hauptflächen, die responsive Breite und die reduzierten Oberflächen sind zugänglicher als ein klassisches Power-User-Werkzeug.
APKG-Vorschau und Importtransparenz.
Erkannte Decks, Notetypes, Templates, Medien, Warnungen und Reimport-Ergebnisse werden vor dem Commit sichtbar. Problematische Daten werden eher erhalten als still verworfen. Die APKG-Grenzen, Identitäten, Medienpfade und Reimportregeln sind fachlich wertvoll und dürfen nicht im Zuge einer „Vereinfachung“ abgeflacht werden.
Vertrauens- und Datenintegritätsfundament.
Originalvarianten, Quellenanker, Versionierung, Soft Deletes, revisionsgeprüfte Cloud-Mutationen und explizite Konflikte sind eine stärkere Grundlage als ein rein lokales Kartenmodell.
Deckhierarchie als sichtbare Nutzerstruktur.
Unterstapel werden als echte Hierarchie behandelt, nicht als bloßes Namenspräfix.
Technische Fehlertoleranz unterhalb der UI.
Import-, Medien-, Sync- und RLS-Grenzen sind deutlich tiefer abgesichert als der sichtbare Produktstand vermuten lässt.
Was noch komplizierter oder schwächer als Anki ist
Karten finden und verwalten.
Der Kartenbrowser zeigt standardmäßig höchstens 80 Karten. Die Suche sucht Decknamen und Deckmetadaten, nicht deckübergreifend in Karteninhalten.
Typgerechtes Bearbeiten.
Basic, Reverse, Cloze und Multiple Choice werden im Verwaltungsfluss auf generische Front-/Back-Felder reduziert.
Navigation und Arbeitskontext.
Nach Reload kann sich der Rückweg einer Review ändern; fokussiertes Deck und ausgewählte Karte sind nicht vollständig reproduzierbar.
Erstellung mehrerer Karten.
Die Oberfläche bietet Pins und Resetlogik, verlässt den Editor aber nach jeder gespeicherten Karte.
Semantik von „Heute“, „Neu“ und „Fällig“.
Bibliothek und tatsächliche Tagesqueue projizieren unterschiedliche Mengen unter ähnlich klingenden Bezeichnungen.
Einstellungen.
Ein globales Speichern überschreibt alle bestehenden Decks. Das wird zwar textlich angekündigt, ist aber nicht das erwartbare Modell globaler Defaults.
Review von Again.
Die Karte erhält einen neuen kurzen Fälligkeitstermin, wird aber aus derselben Session ausgeschlossen. Die Sitzung kann dadurch trotz „Nochmal“ sofort als abgeschlossen erscheinen.
Was eine unbegleitete Beta verhindert
Karten können beim Bearbeiten semantisch beschädigt werden.
Karten oberhalb der ersten 80 Einträge sind nicht verlässlich erreichbar.
Karteninhalte sind nicht deckübergreifend durchsuchbar.
Reload, Direktlink und Browser-History rekonstruieren den Arbeitskontext nicht vollständig.
Again- und Sessionsemantik widersprechen der üblichen Erwartung eines Wiederlernens.
globale Einstellungen haben eine riskante Bulk-Semantik,
Löschungen besitzen keine ausreichende sichtbare Rückgewinnung,
Import-, Abbruch- und Teilabschlusszustände sind nicht durchgehend kohärent,
zentrale Accessibility-Journeys sind noch nicht abgeschlossen.
War der bisherige Entwicklungsfokus ausgewogen?

Nein.

Der Fokus war technisch ambitioniert, aber produktseitig unausgewogen. APKG-Interna, Cloud-Sync, RLS, Medien, KI-Infrastruktur und Hosted-Betrieb erhielten erheblich mehr Tiefe als:

typgerechtes Card CRUD,
Kartenbrowser-Skalierung,
Browser-History,
Batch-Erstellung,
Löschsicherheit,
begrifflich konsistente Queue-Zahlen.

Die technische Arbeit ist nicht wertlos; ein großer Teil davon ist zu schützen. Die Reihenfolge war jedoch für eine klassische Karteikarten-Beta falsch. Der Kartenlebenszyklus hätte vor zusätzlicher KI-, Graph-, Community- und Betriebsbreite geschlossen werden müssen.

Drei Dinge, die jetzt keinesfalls weiter ausgebaut werden
Neue KI-Capabilities oder neue Modellprovider.
Community- und Graph-Funktionen.
Neue Infrastruktur- oder Adapterebenen ohne direkten Abschluss eines Beta-Kernpfads.

Die vorhandene Surface-Konfiguration behandelt Graph, Community, Assistant und KI-Jobs bereits als Labs- oder Nicht-Core-Flächen. Diese Trennung bleibt verbindlich.

Bewertung 1–10
Bereich	Wert	Begründung
Einstieg	6	Hauptflächen sind visuell zugänglich, aber der erste sinnvolle Weg zwischen Import, Erstellen, Lernen und Kartenverwaltung ist noch nicht eindeutig genug.
Informationsarchitektur	4	Die Intent-Trennung von Lernen und Verwaltung ist sinnvoll, der gemeinsame Deckkontext und die Zuständigkeiten sind jedoch nicht geschlossen.
Stapelverwaltung	6	Hierarchie, Unterstapel, Verschieben, Umbenennen und Einstellungen sind vorhanden; Navigation, gleichnamige Ziele und Löschrückweg bleiben schwach.
Kartenbrowser	3	80-Karten-Grenze, keine globale Inhaltssuche, keine Pagination und lokaler Kartenfokus.
Kartenerstellung	5	Gute Typauswahl, Rich Text, Quellenanker und Dokumentintegration; Standardfluss unterbricht Batch-Erstellung.
Kartenbearbeitung	2	Basic funktioniert weitgehend; Reverse, Cloze und Multiple Choice können semantisch beschädigt werden.
APKG-Import	8	Starke Format-, Medien-, Reimport- und Fehlergrundlage; sichtbare Status- und Abschlusssemantik braucht Korrekturen.
Review	6	Ruhige Oberfläche, vier Ratings, Shortcuts und konsistente Intervallvorschau; Queue-Wahrheit, Again und Abschlusszustände sind nicht ausreichend.
Statistik	4	Grundmetriken vorhanden; Zeiträume sind vermischt, Antwortzeit bleibt leer, direkte Aktionen fehlen.
Einstellungen	5	Tiefe Scheduleroptionen und Deckkontext vorhanden; globales Modell und progressive Offenlegung sind nicht nutzerfreundlich.
Fehlertoleranz	5	Tiefe technische Recovery ist stark, aber Lösch-, Import-, Draft- und Empty-State-Kommunikation ist unvollständig.
Accessibility-Grundlage	6	Tastatur- und Label-Grundlagen existieren; Fokusführung, Dialoge, Live-Status und vollständige Kernjourneys sind noch nicht abgenommen.
Technische Wartbarkeit	6	Gute tiefe Modulgrenzen und TypeScript-Basis; App.tsx, Screen-Props, Kompatibilitätsprojektionen und historische Exporte verbreitern die Änderungsfläche.
Testqualität	7	Hohe Breite und starke Daten-/Import-/Sync-Tests; kritische typgerechte Bearbeitungs- und History-Verträge fehlten trotzdem.
Begleitete Beta	5	Nach Schließen der P0-Daten- und Sicherheitsprobleme realistisch; heute noch zu riskant.
Self-Service-Beta	3	Browser, URL-Kontext, Queue-Semantik, Settings und Fehlerführung führen ohne Support zu Abbruch oder Fehlbedienung.
2. Verbindliche Produktentscheidungen
Entscheidung	Beschluss	Begründung	Konfidenz	Wichtigste Konsequenz
Lernen versus Kartenstapel	LearnScreen und DecksScreen bleiben getrennte Aufgabenoberflächen, teilen aber einen kanonischen Deckkontext. Lernen ist primär; Kartenverwaltung ist sekundär.	ADR-002 trennt Lernstart und Bibliothek bewusst. Das Problem ist nicht die Trennung, sondern der Kontextverlust.	95 %	Kein Big-Bang-Merge. Deck-ID und Rückweg werden gemeinsam modelliert.
Rollen der Screens	LearnScreen beantwortet ausschließlich „Was lerne ich jetzt?“. DecksScreen beantwortet „Was besitze und verwalte ich?“.	Die heutige Doppelprojektion erzeugt konkurrierende Zahlen und Aktionen.	98 %	Tagesqueue-Zahlen erscheinen nicht mehr als Bibliotheksinventar.
URL- und History-Modell	Navigationsidentität gehört in die URL: View, Deck, Karte, Erstellmodus, Reviewdeck, optionale Variante und ein allowlist-basierter Rückkontext.	History-State allein überlebt Reload nicht. Der aktuelle Parser fällt beim Review-Rückweg auf Lernen zurück.	99 %	Reload, Direktlink, Zurück und Vorwärts rekonstruieren denselben Kontext.
Transienter Zustand	Aufklappzustände, Fokus, temporäre Filter und ungespeicherte Inhalte bleiben lokal.	Diese Zustände müssen nicht linkfähig sein und würden URLs unnötig instabil machen.	95 %	Für ungespeicherte Inhalte gilt stattdessen ein Leave-Guard.
Creation und Editing	Beide verwenden denselben diskriminierten, typabhängigen Editorvertrag; die visuelle Einbettung darf unterschiedlich sein.	Das Domainproblem liegt in divergierender Semantik, nicht in fehlender visueller Wiederverwendung.	100 %	Eine typgerechte Save-Naht ersetzt generisches front/back/kind-Speichern.
Basic	Front, Back, Tags, Quellenanker und Medien werden über Rich Text bearbeitet.	Entspricht dem kanonischen Kernmodell.	100 %	Kein Roh-HTML-Textarea im normalen Fluss.
Reverse	Der Nutzer bearbeitet die fachlichen Front-/Back-Felder. Die Reverse-Variante wird atomar neu erzeugt oder aktualisiert.	Veraltete abgeleitete Varianten dürfen nicht weiter reviewbar bleiben.	100 %	Speichern ist erst erfolgreich, wenn beide Richtungen konsistent sind.
Cloze	Bearbeitet wird ein kanonischer Cloze-Text mit sichtbarer Syntaxhilfe und validierten Lücken. Varianten werden atomar aus den aktuellen Lücken regeneriert.	Generisches Front-/Back-Editing zerstört die Kartenfamilie.	100 %	Ungültige Cloze-Syntax blockiert das Speichern mit Feldfehler.
Multiple Choice	Frage, Optionen, korrekte Option und optionale Erklärung werden gemeinsam bearbeitet und gespeichert.	Die sichtbare Rückseite darf nicht von der hinterlegten richtigen Option abweichen.	100 %	Keine unabhängige generische Back-Textarea.
Fortgeschrittene Kartendaten	Importierte Rohfelder, Templates, technische IDs, Varianten, Versionen und Quellenanker liegen unter „Details“ beziehungsweise „Erweitert“. Rohdaten sind standardmäßig read-only.	Normale Nutzer brauchen semantische Felder; Power-User brauchen Nachvollziehbarkeit.	95 %	Progressives Disclosure statt zweitem Experteneditor.
Batch-Erstellung	Nach „Speichern“ bleibt der Nutzer im Editor. Nicht angeheftete Felder werden geleert, das Zieldeck bleibt, und der Fokus springt ins erste erforderliche Feld.	Nur so haben Pinning, Reset und Fokus einen nachvollziehbaren Zweck.	98 %	Die Abschlussseite erscheint erst nach „Fertig“.
Ungespeicherte Erstellung	Bei Navigation mit nicht leerem Draft erscheint ein eigener Bestätigungsdialog. Browser-Reload erhält einen beforeunload-Schutz.	Stilles Verwerfen ist für einen Erstellungskern nicht akzeptabel.	98 %	Kein Draft-Autosave als Beta-Voraussetzung.
Kartenlöschung	Kartenlöschung verlangt Bestätigung und bietet danach eine unmittelbare Undo-Aktion.	Soft Delete ohne sichtbaren Rückweg wirkt endgültig.	98 %	Vollständiger Papierkorb ist für die Beta nicht erforderlich.
Stapellöschung	Stapellöschung verlangt einen produktspezifischen Dialog mit Deckname, Unterstapel- und Kartenanzahl.	Der aktuelle Browserdialog erklärt die Auswirkung nicht ausreichend.	98 %	Keine generische window.confirm-Lösung.
Review Again	Eine mit Again bewertete Karte bleibt Teil derselben Session und erscheint nach ihrem Wiederlernintervall oder nach den übrigen Karten erneut.	„Nochmal“ muss in einer Anki-kompatiblen Kernreise tatsächlich „nochmals in dieser Lernsitzung“ bedeuten.	88 %	Queue und Sessionmodell müssen pending repeats getrennt führen.
Sessionziel	Das Ziel zählt eindeutige initiale Karten. Wiederholungen durch Again werden separat gezählt und verändern das initiale Ziel nicht.	Sonst schwankt das Ziel unverständlich.	95 %	Summary zeigt „eindeutige Karten“ und „Wiederholungen“.
Neu, Fällig, Heute	Neu und Fällig sind disjunkte, nach Limits ausgewählte Queuemengen. Heute ist ihre Summe. Inventarzahlen heißen ausdrücklich „im Stapel“.	Der heutige Lernaufwand muss auf allen Startflächen dieselbe Wahrheit haben.	100 %	Learn, Dashboard und Session verwenden dieselbe Queue-Projektion.
Globale Einstellungen	Globale Werte sind Defaults für neue und künftig importierte Decks. Bestehende Decks werden nicht automatisch geändert.	Ein globales Profil darf individuelle Deckwerte nicht beiläufig überschreiben.	92 %	Separate, bestätigte Aktion „Auf alle Stapel anwenden“.
Deck-Einstellungen	Jedes Deck speichert weiterhin vollständige explizite Werte; es gibt in der Beta keine Live-Vererbung.	Vererbung würde Persistenz, Herkunft, Sync und Konflikte deutlich erweitern.	95 %	Kein Datenbankschema und kein Override-Graph erforderlich.
Settings-Offenlegung	Standard: Preset, neue Karten, Reviews, Reihenfolge. Erweitert: Lern-/Wiederlernschritte, Intervalle, Retention, Variantenparameter.	Der aktuelle gemeinsame Panelumfang ist für normale Nutzer zu breit.	95 %	LearningSettingsPanel wird in Standard und Erweitert gegliedert.
Sprache	Die Beta-UI ist Deutsch. Die Spracheinstellung wird read-only als „Deutsch (Beta)“ angezeigt oder aus dem normalen UI entfernt; das gespeicherte Feld bleibt kompatibel.	Eine wirkungslose Auswahl Deutsch/Englisch ist irreführend.	98 %	Keine I18n-Arbeit in der Beta-Roadmap.
Statistik	Statistik bleibt primär retrospektiv, erhält aber direkte Aktionen zu schwachen Decks und Karten.	Es wird kein neues Coaching-System benötigt; reine Rückschau ohne Aktion ist aber zu passiv.	92 %	Einheitliche Zeitfilter und CTAs „Lernen“ beziehungsweise „Karten prüfen“.
Statistikmetriken	Beta: Reviews, aktive Tage, Bewertungsverteilung, Erfolgsquote, Tagestrend, Again-Rate und schwache Decks/Karten. Antwortzeit und Variantenmetriken werden entfernt, bis sie korrekt befüllt beziehungsweise Core-relevant sind.	Eine dauerhaft leere Kennzahl schwächt Vertrauen.	98 %	Keine Anzeige einer nicht erhobenen Antwortzeit.
Kartenbrowser	Deckübergreifende Inhaltssuche ist für Self-Service-Beta verpflichtend. Das 80-Limit entfällt zugunsten deterministischer Pagination beziehungsweise „Weitere laden“.	Vorhandene Karten müssen auffindbar und bearbeitbar sein.	99 %	Zunächst clientseitig; keine Suchinfrastruktur oder DB-Migration.
Pagination	Standardmäßig 100 Treffer pro Seite beziehungsweise Batch. Virtualisierung wird erst nach Messung ergänzt.	Pagination löst die Erreichbarkeit mit geringerer Komplexität.	95 %	Keine neue Tabellen-/Indexarchitektur vor gemessenem Bedarf.
Importzustände	Abgebrochen, Fehlgeschlagen, Teilweise abgeschlossen und Erfolgreich sind getrennte Terminalzustände. Beim Wechsel des Importtyps wird die alte Vorschau vollständig verworfen.	Der alte Bericht darf keine Commit-Aktion für einen neuen Modus offenhalten.	98 %	Eine gemeinsame diskriminierte Import-UI-State-Maschine.
Öffentliche Kern-APIs	coreModel, Scheduler-Simulation und -Anwendung, aktive Reviewqueue, APKG-Seams, Cloudvalidierung, Sync, Medien und RLS bleiben geschützt.	Sie tragen echte Daten-, Format- und Sicherheitsverträge.	100 %	Keine LOC-getriebene Entfernung.
Compatibility-Verträge	deck.cards, Learning-Item/Card-Aliase, Review-State-Aliase, Anki-Identitäten, JSONB-Mapping und Portabilitätsfelder bleiben dokumentierte Migrationsverträge.	Persistierte Daten und externe Exporte dürfen nicht implizit brechen.	98 %	Entfernung erst nach Migration, Fixture-Roundtrip und Readback.
Historische APIs	Test-only Review-, Import- und Auth-Fassaden werden nach Consumerprüfung internalisiert oder entfernt. Tests werden auf aktive Produktseams migriert.	Das Paket ist privat und mehrere Exporte besitzen keine Produktionskonsumenten.	90 %	Tests dürfen historische APIs nicht allein künstlich erhalten.
Beta-Gate	npm run test:beta ist das verbindliche Beta-Go/No-Go-Gate. Der vollständige Release-/Extended-Lauf bleibt ein zusätzliches Betriebssignal.	Das Repository trennt diese Kontexte inzwischen ausdrücklich.	98 %	Vor jedem Umsetzungspaket und vor Beta muss das Beta-Gate frisch grün sein.
3. Zielbild „Anki in besser“
Primäre Navigation
Heute
Lernen
Erstellen
Statistik
────────────────
Konto / Einstellungen

Graph, Community, Assistant, KI-Jobs und weitere Labs erscheinen nicht in der Beta-Hauptnavigation.

Sekundäre Navigation
Lernen
├── Deck auswählen
├── Heutige Queue starten
├── Deck anlegen
├── Lernoptionen des Decks
└── Karten verwalten
    └── Bibliothek / Kartenstapel

Erstellen
├── Manuell
├── Import
└── PDF/Text als Quelle

Bibliothek / Kartenstapel
├── Struktur
├── Karten
├── Suchen und Filtern
├── Umbenennen / Verschieben
├── Unterstapel
├── Löschen
└── Deck-Einstellungen
Screenrollen
Heute
zeigt die tatsächliche heutige Queue,
zeigt aktive Decks,
startet Review,
enthält höchstens sekundäre Verweise auf Erstellen und Importieren,
zeigt keine konkurrierende vollständige Deckverwaltung.
Lernen
ist der primäre Deck- und Review-Start,
zeigt Heute = Neu + Fällig nach Limits,
startet Root- oder Unterdeck-Sessions,
verlinkt auf Deck-Einstellungen und Kartenverwaltung.
Bibliothek / Kartenstapel
verwaltet Struktur und Inhalte,
zeigt Inventar statt heutiger Queue,
sucht deckübergreifend in Karteninhalten,
öffnet eine typgerechte Karte direkt über URL,
ist direktlinkfähig, aber kein eigener primärer Sidebarpunkt.
Erstellen
startet standardmäßig manuell,
bleibt nach dem Speichern für Batch-Erstellung offen,
bietet Import als gleichwertigen Unterpfad,
enthält keine aktive KI-Erstellung in der Beta-Basis.
Statistik
verwendet standardmäßig 30 Tage,
bietet 7, 30, 90 Tage und Gesamt,
verlinkt schwache Decks direkt zu Lernen oder Kartenverwaltung,
trennt aktuelle Queue von retrospektiven Kennzahlen.
Einstellungen
zeigt globale Defaults,
besitzt eine separate Bulk-Aktion,
gruppiert Expertenparameter unter „Erweitert“,
zeigt Deutsch als Beta-Sprache,
lässt Infrastruktur-, Sync- und Konfliktbereiche bestehen, ohne sie mit Lernoptionen zu vermischen.
Ziel-URLs

Die konkreten Pfadnamen dürfen die bestehenden deutschen Routen beibehalten. Fachlich gilt:

/heute

/lernen
/lernen?deck=<deckId>

/kartenstapel
/kartenstapel?deck=<deckId>
/kartenstapel?deck=<deckId>&card=<cardId>

/erstellen/manuell
/erstellen/manuell?deck=<deckId>
/erstellen/import

/review/<deckId>
  ?variant=<variantId>
  &returnView=<learn|decks|today>
  &returnDeck=<deckId>
  &returnCard=<cardId>

/statistik?range=<7d|30d|90d|all>

/einstellungen
/einstellungen/deck/<deckId>

returnView ist keine freie URL, sondern eine diskriminierte Allowlist. Unbekannte oder gelöschte IDs führen zu einem verständlichen Fallback, nicht zu einer leeren oder falschen Ansicht.

Progressive Offenlegung
Im Karteneditor

Standardmäßig sichtbar:

Typ,
Zieldeck,
fachliche Eingabefelder,
Tags,
Speichern.

Unter „Quelle und Details“:

Quellenanker,
Medien,
Versionshistorie,
Originaldaten.

Unter „Erweitert“:

importierte Rohfelder,
Templateinformationen,
Varianten,
technische Identitäten,
read-only Raw HTML.
In Einstellungen

Standardmäßig sichtbar:

Preset,
neue Karten pro Tag,
maximale Reviews,
Reihenfolge,
Zielerinnerung.

Unter „Erweitert“:

Lernschritte,
Wiederlernschritte,
Anfangsintervalle,
Maximalintervall,
Desired Retention,
CoRe-spezifische Parameter.
Im Import

Standardmäßig sichtbar:

Deckstruktur,
Anzahl Karten,
erkannte Kartentypen,
Medienstatus,
verständliche Warnungszusammenfassung.

Unter „Technische Details“:

IDs,
Hashes,
Templateordinals,
Parserinformationen,
vollständige Warnungsliste.
Reload und Browser-History
Reload behält View, Deck, ausgewählte Karte und Review-Rückweg.
Browser-Zurück kehrt zum letzten semantischen Kontext zurück.
Browser-Vorwärts stellt denselben Kontext wieder her.
Lokale Aufklappzustände müssen nicht zurückkehren.
Ein ungespeicherter Draft blockiert interne Navigation mit einem eigenen Dialog.
Eine laufende Review darf nach Reload aus dem gespeicherten Schedulerzustand neu aufgebaut werden; bereits bestätigte Reviews dürfen nicht erneut erscheinen.
Ein ungültiger Direktlink zeigt „Karte nicht gefunden“ oder „Stapel nicht verfügbar“ mit sicheren Folgeaktionen.
Einstieg neuer Nutzer
Leerer Zustand
├── Anki-Stapel importieren
└── Erste Karte erstellen

Keine KI-Erklärung, kein Graph, keine Community und keine Scheduler-Feinparameter im ersten Einstieg.

Nach der ersten gespeicherten Karte:

Karte gespeichert
├── Weitere Karte erstellen
├── Fertig
└── Jetzt lernen
Einstieg erfahrener Anki-Nutzer
APKG auswählen
→ Importvorschau prüfen
→ Hierarchie, Kartentypen und Medien bestätigen
→ Import übernehmen
→ Karten prüfen oder heute lernen

Der Importbericht erklärt ausdrücklich:

was vollständig übernommen wurde,
was als Fallback erhalten blieb,
ob Lernfortschritt neutral startet,
welche Medien fehlen,
dass lokale spätere Änderungen bei Reimport geschützt werden.
4. Kernjourneys der Beta
4.1 Erste Karte erstellen

Startpunkt: Erstellen → Manuell.

Minimale Schritte:

Zieldeck auswählen oder neu anlegen.
Kartentyp bestätigen.
Pflichtfelder ausfüllen.
Speichern.

Sichtbare Entscheidungen: Deck, Typ, fachliche Felder; Tags und Quelle bleiben optional.

Endzustand: Karte ist gespeichert und synchronisierbar. Der Editor zeigt eine kompakte Erfolgsbestätigung und ist für die nächste Karte vorbereitet.

Fehler und Abbruch: Feldfehler bleiben am Feld. Netzwerkprobleme lassen die lokal gespeicherte Karte als pending sichtbar. Navigation mit Draft verlangt Bestätigung.

4.2 Fünf Karten nacheinander erstellen

Startpunkt: derselbe manuelle Editor.

Minimale Schritte:

Zieldeck einmal wählen.
Optional Front, Back oder Tags anheften.
Karte ausfüllen und speichern.
Viermal wiederholen.
Fertig.

Sichtbare Entscheidungen: Pins zeigen eindeutig „Nach Speichern behalten“ oder „Nach Speichern leeren“.

Endzustand: Fünf Karten liegen im Zieldeck. Der Abschluss zeigt 5 Karten erstellt, Jetzt lernen und Karten prüfen.

Fehler und Abbruch: Eine fehlerhafte Karte blockiert nur ihren Save. Bereits gespeicherte Karten bleiben erhalten. Ein Draft vor Fertig wird nicht still verworfen.

4.3 APKG importieren

Startpunkt: Erstellen → Import → Anki/APKG.

Minimale Schritte:

Datei auswählen.
Analyse abwarten.
Vorschau prüfen.
Ziel bestätigen.
Import übernehmen.
Abschlussaktion wählen.

Sichtbare Entscheidungen: Hierarchie erhalten, Zieldeck beziehungsweise neue Struktur, bekannte Warnungen, fehlende Medien.

Endzustand: Decks und Karten sind nutzbar; Medien können klar als vollständig, teilweise oder ausstehend markiert sein.

Fehler und Abbruch: Abbruch ist kein Fehlerzustand. Wiederholbare Fehler bieten Retry. Terminale Parserfehler bieten neue Datei. Alte Vorschauen werden beim Formatwechsel verworfen.

4.4 Stapel und Unterstapel verwalten

Startpunkt: Lernen → Karten verwalten.

Minimale Schritte:

Deck im Baum wählen.
Umbenennen, verschieben, Unterstapel anlegen oder Einstellungen öffnen.
Änderung speichern.

Sichtbare Entscheidungen: vollständiger Deckpfad, Zielparent, Anzahl betroffener Unterstapel und Karten.

Endzustand: Struktur und URL zeigen denselben Deckkontext.

Fehler und Abbruch: Zyklische Verschiebung wird blockiert. Gleichnamige Ziele werden über vollständigen Pfad unterschieden. Konflikte erscheinen als fachliche Syncmeldung.

4.5 Karte finden und typgerecht bearbeiten

Startpunkt: Bibliothek oder Direktlink.

Minimale Schritte:

Inhalt, Tag oder Deckpfad suchen.
Karte auswählen.
Typgerechte Felder bearbeiten.
Speichern.

Sichtbare Entscheidungen: Kartenart, Deck, aktuelle Variante beziehungsweise Cloze-Lücken oder MC-Optionen.

Endzustand: Original, abgeleitete Varianten, strukturierte Felder, Versionseintrag und Reviewdarstellung sind konsistent.

Fehler und Abbruch: Ungültige Cloze-Lücken oder MC ohne korrekte Option blockieren Save. Navigation mit Änderungen verlangt Bestätigung.

4.6 Review starten und abschließen

Startpunkt: Heute oder Lernen.

Minimale Schritte:

Deck beziehungsweise Tagesqueue starten.
Antwort zeigen.
Nochmal, Schwer, Gut oder Leicht.
Wiederholungen abarbeiten.
Summary schließen.

Sichtbare Entscheidungen: Deck, optionale zusätzliche neue Karten, aktives Rating.

Endzustand: Summary trennt eindeutige Karten, Wiederholungen, Ratings und verbleibende heute fällige Karten.

Fehler und Abbruch: Again bleibt pending. Eine Wartezeit zeigt In 5 Minuten erneut und erlaubt bewusstes Sessionende. Speicherausfall lässt das Rating pending statt es still zu verlieren.

4.7 Karte oder Stapel sicher löschen

Startpunkt: Kartenbrowser beziehungsweise Deckaktionen.

Minimale Schritte Karte:

Löschen.
Bestätigen.
Optional Rückgängig.

Minimale Schritte Deck:

Stapel löschen.
Auswirkungen im Dialog prüfen.
Namen oder eindeutige Bestätigung bestätigen.

Sichtbare Entscheidungen: Objektname, Unterstapelzahl, aktive Kartenanzahl.

Endzustand: Objekt ist soft-deleted und synchronisierbar.

Fehler und Abbruch: Abbruch verändert nichts. Fehlgeschlagene Cloudbestätigung lässt Tombstone und pending Status bestehen. Kein stilles Hard Delete.

4.8 Lernoptionen global und je Stapel ändern

Startpunkt: Konto-Einstellungen oder Deckzahnrad.

Global:

Defaultwerte ändern.
Speichern.
Optional separate Bulk-Aktion wählen.

Deck:

Deck öffnen.
Werte ändern.
Speichern.

Sichtbare Entscheidungen: Gilt für neue Stapel versus Jetzt auf alle bestehenden Stapel anwenden.

Endzustand: Globale Defaults verändern keine bestehenden Decks ohne Bulk-Bestätigung.

Fehler und Abbruch: Konflikte zeigen lokale und Remote-Version. Ein abgebrochener Bulk-Dialog verändert nichts.

4.9 Statistik nutzen

Startpunkt: Statistik.

Minimale Schritte:

Zeitraum wählen.
Trend und Bewertungsverteilung ansehen.
Schwaches Deck oder Karte öffnen.
Lernen oder prüfen.

Sichtbare Entscheidungen: 7, 30, 90 Tage oder Gesamt; Deckfilter.

Endzustand: Nutzer landet im gewählten Deckkontext oder bei der konkreten Karte.

Fehler und Abbruch: Bei zu wenig Daten erscheint ein erklärender Empty State statt –-Metriken.

4.10 Reload, Direktlink und Browser-Zurück

Startpunkt: Kartenbrowser, Review oder Deckdetail.

Ablauf:

Deck und Karte öffnen.
Reload.
Review starten.
Reload.
Review beenden.
Browser-Zurück und -Vorwärts verwenden.

Erwarteter Endzustand: Deck, Karte und Rückweg bleiben erhalten. Zurück und Vorwärts verändern nicht zufällig lokalen Screenstate.

Fehler und Abbruch: Gelöschte oder nicht berechtigte IDs führen zu einem verständlichen Fallback mit Zur Bibliothek oder Zu Lernen.

5. Beta-Blocker
5.1 Blocker vor begleiteter Beta
Nutzerproblem	Technische Ursache	Betroffene Dateien	Notwendiger Zielzustand	Messbares Abschlusskriterium
Bearbeitete Reverse-, Cloze- oder MC-Karten können falsch geprüft werden.	Generisches updateCardContent aktualisiert den fachlichen Originalinhalt, aber nicht alle typabhängigen Ableitungen und strukturierten Felder.	src/coreModel/creation.ts, src/screens/DecksScreen.tsx, src/coreTypes.ts, Editor-/Creation-Tests	Eine einzige typabhängige Save-Naht hält alle Projektionen atomar konsistent.	Browser- und Modultests bearbeiten jeden der vier Typen, reloaden und prüfen Reviewfrage, Antwort und Varianten.
Mehrere Karten nacheinander zu erstellen funktioniert nicht wie angeboten.	App.tsx setzt nach jedem Save den Completion-State; Pins bleiben nur intern im Panel sinnvoll.	src/App.tsx, src/screens/CreationScreen.tsx, src/screens/ManualCreationPanel.tsx	Save bleibt im Editor; Fertig beendet den Batch.	E2E erstellt fünf Karten mit Pins, korrektem Reset und Fokus ohne erneute Moduswahl.
Karten können ohne ausreichenden Schutz verschwinden.	Einzelkartenlöschung besitzt keinen produktspezifischen Dialog oder sichtbares Undo.	src/screens/DecksScreen.tsx, src/coreWorkspace.ts, App-State-/Sync-Wiring	Bestätigungsdialog plus unmittelbares Undo für Karten; detaillierter Dialog für Decks.	Löschen, Abbrechen, Undo und Reload sind im Browsertest abgedeckt.
Ein alter Importbericht kann nach dem Wechsel des Importtyps weiter aktiv bleiben.	Import-Panels teilen beziehungsweise behalten Vorschau- und Commit-State zu lange.	src/screens/CreationScreen.tsx, Importpanels, src/creationWorkflow.ts	Jeder Importmodus besitzt einen diskriminierten, beim Wechsel zurückgesetzten State.	Wechsel Text → CSV beziehungsweise APKG lässt keinen alten Commit-Button oder Bericht zurück.
Es gibt kein aktuelles reproduzierbares Beta-Go/No-Go-Signal für den neuesten SHA.	Der Gate-Fix ist statisch vorhanden, aber für den aktuellen Commit liegt kein abrufbarer vollständiger Lauf vor.	package.json, scripts/runLocalE2E.ts, .github/workflows/ci.yml, tests/e2e/	npm run test:beta läuft auf sauberem Checkout grün.	Frischer Lauf ohne Retry oder Testausschluss; Ergebnis gehört zum freizugebenden SHA.
5.2 Blocker vor unbegleiteter Self-Service-Beta
Nutzerproblem	Technische Ursache	Betroffene Dateien	Notwendiger Zielzustand	Messbares Abschlusskriterium
Reload oder Direktlink verliert Deck, Karte oder Review-Rückweg.	Relevanter Zustand liegt in React-State oder History-State, nicht vollständig in der URL.	src/appNavigation.ts, src/useAppNavigation.ts, src/App.tsx, LearnScreen, DecksScreen	Kanonischer URL-Vertrag für Deck, Karte und Review-Rückweg.	E2E für Reload, Back und Forward aus Lernen, Bibliothek und Review.
Karten oberhalb der ersten 80 sind faktisch nicht verwaltbar.	Defaultlimit ohne Pagination.	src/libraryModel.ts, src/screens/DecksScreen.tsx	Pagination beziehungsweise „Weitere laden“ ohne stilles Abschneiden.	Fixture mit 1.000 Karten erreicht und editiert Karte 999.
Nutzer findet eine bekannte Karte nicht.	Suche berücksichtigt hauptsächlich Deckmetadaten.	src/libraryModel.ts, Kartenbrowser	Suche in Front, Back, Tags und Deckpfad über alle Decks.	E2E findet eindeutigen Text in einem geschlossenen Unterdeck und öffnet die Karte.
Again kann eine Session sofort beenden.	Bewertete Schlüssel werden unabhängig vom Rating ausgeschlossen.	src/screens/StudyMode.tsx, src/reviewService.ts	Pending Wiederlernqueue innerhalb derselben Session.	Letzte Karte mit Again erzeugt keinen endgültigen Abschluss, bevor Wiederholung erledigt oder bewusst beendet wurde.
Dashboard, Lernen und Summary zeigen unterschiedliche Antworten auf „heute“.	Inventaraggregation und limitierte Queue werden ähnlich bezeichnet.	src/libraryModel.ts, src/reviewService.ts, DashboardScreen, LearnScreen, StudyMode	Eine gemeinsame limitierte Queue-Projektion und getrennte Inventarbegriffe.	Dieselbe Fixture zeigt identische Neu-/Fällig-/Heute-Zahlen auf allen Startflächen.
Globale Änderung überschreibt individuelle Deckwerte.	Globales Speichern ruft Bulk-Anwendung implizit auf.	src/App.tsx, src/deckSettings.ts, SettingsScreen, LearningSettingsPanel	Defaults nur für neue Decks; Bulk als separate bestätigte Aktion.	Deckoverride bleibt nach globalem Save und Reload unverändert.
Eine sichtbare Spracheinstellung hat keine verlässliche Wirkung.	Profilfeld existiert, die UI ist nicht vollständig internationalisiert.	SettingsScreen, Profilemapping	Deutsch als feste Beta-Sprache; bestehendes Feld bleibt kompatibel.	Kein auswählbarer wirkungsloser Englischmodus.
Statistik zeigt leere oder nicht vergleichbare Werte.	Antwortzeit wird nicht erfasst; Kennzahlen verwenden verschiedene Zeiträume.	StatisticsScreen.tsx, libraryModel.ts, StudyMode.tsx	Einheitlicher Zeitraum und nur erhobene Kennzahlen.	Kein – für eine dauerhaft unerhobene Metrik; 7/30/90-Tage-Filter wirken auf alle Periodenmetriken.
Nutzer verliert Orientierung bei Import-Teilabschluss oder leerer Reviewqueue.	Terminal- und Empty States besitzen keine klaren Folgeaktionen.	Importpanels, StudyMode, CreationScreen	Jeder Zustand nennt Ergebnis, verbleibende Arbeit und nächste sichere Aktion.	Browsertests prüfen Success, Partial, Failed, Cancelled und Empty Queue.
Kernjourneys sind nicht vollständig tastatur- und screenreaderfähig.	Fokusführung, Dialoge und Live-Status sind nicht über alle Flows abgenommen.	ManualCreationPanel, DecksScreen, StudyMode, Importpanels, Dialogprimitives	Fokus, Labels, Statusansagen und Kontrast in allen P0-Journeys.	Automatisierte Axe-Prüfung plus manuelle Tastaturabnahme ohne Blocker.
6. Vereinfachungs- und Refactoring-Entscheidungen
Bereich	Entscheidung	Behalten	Vereinfachen	Zusammenführen	Später entfernen	Schützen
App.tsx	Auf Shell, Accountboot, Workspacezustand und Top-Level-Routing reduzieren.	Auth-/Sync-Orchestrierung, Lazy Boundaries	Featurehandler und parallele Selektionssetter	Navigation in useAppNavigation, Card-Kommandos in fachliche Seams	historische Pass-through-Callbacks	Boot-, Sync- und Error-Boundary-Verträge
LearnScreen	Primärer Lernstart.	Deckhierarchie, Queue-Start, Decksettings-Einstieg	Anlage- und Aktionsdichte	gemeinsamer Deckkontext mit Bibliothek	doppelte Verwaltungsaktionen	heutige Queue-Semantik
DecksScreen	Sekundäre Bibliothek/Kartenverwaltung.	Baum, CRUD, Kartenbrowser	lokale Parallelselektion, generischer Editor	typgerechter Editor, URL-Kontext	eigene Tagesqueueprojektion	Hierarchie- und Soft-Delete-Verträge
CreationScreen	Orchestriert Untermodi und Abschluss, nicht einzelne Formlogik.	manuell, Import, Quellenviewer	Completion-State und Importzustände	einheitliche Batch- und Import-State-Maschinen	aktive KI-Einstiegskachel aus Beta-Core	Import-/Quellenankergrenzen
ManualCreationPanel	Wiederverwendbare Batch-Editor-Shell.	Rich Text, Pins, Quellenübernahme	lokale Zustandsduplikate, Pintexte	gemeinsamer CardEditor-Vertrag	typfremde Speziallogik	Fokus- und Quellenanker-Verhalten
Karteneditor	Diskriminierte Typen statt generischem Front/Back.	RichTextEditor, Sanitization	Raw HTML als Standard	Creation und Editing auf gemeinsame Domainkommandos	generische kind/front/back-Save-API	kartentypspezifische Semantik
StudyMode	Präsentation und Sessioninteraktion.	ruhige Oberfläche, Shortcuts, Anchor UI	lokale Queue-Neuberechnungen	Sessionmodell im Review-Service	historische Sessionlogik im Screen	optimistische Event-/Sync-Semantik
reviewService	Kanonische Queue- und Session-Seam.	answerVariant, Tagesqueue, Feedback	öffentliche Helperfläche	initiale Queue und Repeat Queue	createReviewSession, recordReviewRating, getNextReviewItem, sofern weiter test-only	Scheduler-/Eventvertrag
scheduler	Mathematische Domain-Seam.	Simulation, Commit, Zustandsnormalisierung	nur öffentliche Exporte reduzieren	Vorschau und Anwendung weiterhin dieselbe Simulation	ungenutzte Format-/Kompatibilitätshelper nach Consumerprüfung	Terminierung, Intervalle, Retrievability
libraryModel	Reine Bibliotheks-, Such-, Statistik- und Baumprojektionen.	deterministische Projektionen	80-Limit, vermischte Suchsemantik	gemeinsame Deckpfade und paginierte Kartenprojektion	alte Umbrella-Modelle	keine Scheduler-Mutationen
Settings	Defaults und explizite Deckwerte klar trennen.	gemeinsames Normalisieren, Presets	implizite Bulk-Semantik	Standard-/Erweitert-UI	wirkungslose Sprachwahl	persistierte Profil-/Deckformen
Statistik	Kleine retrospektive Beta-Oberfläche.	Reviews, Ratings, Trends	Zeitraummix, tote Kennzahlen	direkte Deck-/Kartenaktionen	Antwortzeit und Variantenmetriken bis zur Erhebung	append-only Reviewevents
Importpanels	Gemeinsame Statussprache, getrennte Parserseams.	APKG, Text, CSV, Paste	parallele UI-State-Modelle	diskriminierte Prozessphasen	doppelte Importberichte	APKG-/Reimport-/Medienlogik
Root-State-Typen	WorkspaceState bleibt kanonisch.	aktive persistierte Form	alte Aliasflächen dokumentieren	keine parallele neue Rootform	ungenutztes AppState erst nach Persistenzscan	gespeicherte Cache-/Exportkompatibilität
Screen-Prop-Verträge	Als echte Lazy-Loading-Grenzen typisieren.	benannte Props je Screen	any und überbreite Callbackflächen	fachliche Command-Objekte statt Einzelsetter	Fassaden ohne echte Grenze	Lazy-Loading und Testability
Historische Review-APIs	Nach Testmigration internalisieren.	aktive Produktpfade	Exportfläche	Tests gegen aktive Seams	test-only Sessionfassaden	Event- und Schedulerverträge
Historische Import-/Auth-APIs	Consumerweise entfernen.	creationWorkflow, Cloud-Auth	Workspace-Umbrella-Imports	UI auf fokussierte Dienste	mapAnkiToCoreDeck, commitImport, lokale Authfassaden nach Nachweis	Portabilität und Legacy-Import
Tests	Risiko- und journeyorientiert statt API-erhaltend.	APKG, Scheduler, RLS, Sync, Invarianten	breite Umbrella-Suites	Tests nach Produktjourney	Tests, die ausschließlich tote Exporte prüfen	Golden Journeys und Datenroundtrips
UI-Primitives/Tailwind	Schrittweise Konsolidierung im Zuge der Pakete.	bestehende stabile Primitives	freie Tailwind-Fragmente in berührten Screens	Dialog, Toast, Empty State, Pagination, Field Error	lokale Duplikate nach Migration	deutsche UI und vorhandene visuelle Tokens

Leitlinie: Weder Dateigröße noch Exportanzahl allein begründen eine Entfernung. Entfernt wird nur, wenn ein aktiver Consumergraph, Persistenzvertrag und fokussierte Regressionstests die Änderung tragen.

7. Geschützte Invarianten
Invariante	Verbindlicher Schutz
Genau eine Originalvariante	Jedes Learning Item behält exakt eine isOriginal: true-Variante.
Unveränderlicher Originalanker	immutableOriginal, originale Importfelder und ursprüngliche Anker werden durch normale Edits nicht überschrieben.
Variantenverankerung	Jede abgeleitete Variante bleibt über learningItemId, anchorVariantId oder parentVariantId an den Ursprung gebunden.
Typsemantik	Reverse-Richtung, Cloze-Lücken, MC-Optionen und richtige Antwort bleiben fachlich konsistent.
Learning-Item-/Card-Kompatibilität	Lokale deck.cards-Collection und Card-/Learning-Item-Aliase bleiben lesbar und roundtripfähig.
Review-State-Kompatibilität	learningItemState, reviewState, coreState, reps und repetitions werden nicht ohne Migration entfernt.
Scheduler-Vorschau und Commit	Angezeigte Intervalle und tatsächlich angewandte Terminierung beruhen weiterhin auf derselben Simulation.
Queuevertrag	Limits, Reihenfolge, Root-/Unterdeckregeln und bereits eingeführte neue Karten bleiben deterministisch.
Append-only Reviews	Bestätigte Reviewevents werden nicht überschrieben oder doppelt angehängt.
APKG-Identität	GUID, Note-/Card-ID, Templateordinal, Deckpfad und Importgruppe bleiben stabil matchbar.
Reimport lokaler Änderungen	Lokale Front-/Back-/strukturierte Edits, Variantenstatus und Review-State werden bei Reimport geschützt.
Unsupported-Data Preservation	Nicht verstandene Anki-Felder, Rohdaten und Medienreferenzen werden nicht still verworfen.
Medien	SHA-/Pfadidentität, Referenzzählung, lokale Fallbacks und Signed-URL-Auflösung bleiben erhalten.
Cloudrevisionen	Updates und Tombstones bleiben revisions- und accountgebunden.
Sync	Outbox, getrennte Review-/Snapshot-Acknowledgements, Backoff und Konfliktpause bleiben erhalten.
Konflikte	Nutzerinhalte werden bei abweichender Basisrevision nicht automatisch vereinigt.
RLS und Ownership	Kein Refactoring darf accountgebundene Primärschlüssel, Grants, Policies oder Nutzer-A/B/Anon-Gates umgehen.
Quellenanker	Dokument, Seite, Quote, Zielkartenfeld und optionale Bounding Box bleiben roundtripfähig.
Versionierung	Ein Edit erzeugt weiterhin einen nachvollziehbaren Versionseintrag; Restorebasis bleibt erhalten.
HTML-Sicherheit	Rich Text, importiertes HTML und Medienauflösung durchlaufen weiterhin die zentralen Sanitization-Seams.
Portabilität	Bestehende JSON-Exporte und Legacy-Daten bleiben validierbar und importierbar.
Browser-History	Nach Einführung des neuen URL-Vertrags werden View, Deck, Karte und Review-Rückweg als Produktvertrag getestet.
Deutsche UI	Sämtliche sichtbaren Core-Texte, Fehler, Dialoge und Statusmeldungen bleiben deutsch.
Core/Labs-Trennung	KI, Graph und Community dürfen nicht beiläufig wieder in die Beta-Hauptnavigation gelangen.
Keine unnötige Migration	Die ersten drei Pakete benötigen keine Datenbankmigration. Persistierte Formen werden erweitert oder normalisiert, nicht parallel ersetzt.
8. Priorisierte Umsetzungsroadmap
Übersicht
Nr.	Arbeitspaket	Priorität	Abhängigkeit
1	Typgerechter Kartenlebenszyklus	P0	frisches grünes Beta-Gate
2	Batch-Erstellung und Fehlertoleranz	P0	Paket 1 für gemeinsamen Editorvertrag
3	Stapel-IA und URL-Kontext	P0	Paket 1–2 stabile Kernreisen
4	Reviewqueue, Zahlenwahrheit und Again	P0	Paket 3 URL-Rückweg
5	Globales und stapelspezifisches Settingsmodell	P1	Paket 4 festgelegte Queuebegriffe
6	Kartenbrowser-Skalierung und globale Suche	P1	Paket 3 URL, Paket 1 Editor
7	Statistik und handlungsorientierte Rückschau	P1	Paket 4 gemeinsame Queue-/Eventsemantik
8	Historische APIs, Testportfolio und UI-Konsolidierung	P2	Pakete 1–7
Paket 1 — Typgerechter Kartenlebenszyklus

Ziel: Erstellung, Bearbeitung und Review verwenden für Basic, Reverse, Cloze und Multiple Choice denselben fachlichen Vertrag.

Nutzerwert: Eine gespeicherte Karte prüft exakt den Inhalt, den der Nutzer bearbeitet hat.

Scope:

diskriminierte Editorwerte,
typabhängige Validierung,
atomare Save-Kommandos,
Reverse-/Cloze-Regeneration,
MC-Optionen und richtige Antwort,
Rich Text im Verwaltungseditor,
Versionseinträge,
progressive Details.

Betroffene Dateien und Module:

src/coreTypes.ts,
src/coreModel.ts,
src/coreModel/creation.ts,
private Core-Model-Module,
src/coreWorkspace.ts,
src/screens/DecksScreen.tsx,
src/screens/ManualCreationPanel.tsx,
src/ui/RichTextEditor.tsx,
fokussierte Tests.

Nichtziele:

neue Kartentypen,
Image Occlusion,
KI-Varianten,
APKG-Parseränderungen,
Datenbankmigration,
neues Designsystem.

Geschützte Invarianten: Originalvariante, immutableOriginal, Anker, Reimportidentität, Reviewstates, HTML-Safety, Cloudmapping.

Akzeptanzkriterien:

Basic-Edit bleibt korrekt.
Reverse-Edit aktualisiert beide Richtungen.
Cloze-Edit regeneriert genau die aktuellen Lücken.
MC-Edit hält Option, richtige Antwort und Reviewdarstellung konsistent.
Ungültige Karten werden nicht gespeichert.
Reload erhält das Ergebnis.
Versionlog enthält einen verständlichen Edit-Eintrag.

Tests:

Unit-/Contracttests pro Typ,
Legacy-Normalisierung,
Reimport nach lokalem Edit,
Cloud-JSONB-Roundtrip,
Browserjourney pro Typ,
Regression der Originalvarianten-Invariante.

Abhängigkeiten: keine fachliche Vorarbeit; Eingangsgate muss grün sein.

Risiko: hoch, weil die Änderung zentrale persistierte Modelle berührt.

Erwartete Vereinfachung: ein Save-Vertrag statt Creation-spezifischer und generischer Editing-Pfade.

Paket 2 — Batch-Erstellung und Fehlertoleranz

Ziel: Erstellung mehrerer Karten, Navigation mit Draft, Löschen und Importterminalzustände werden vorhersehbar.

Nutzerwert: Nutzer können fünf Karten ohne Umwege erstellen und verlieren weder Drafts noch Karten versehentlich.

Scope:

im Editor bleiben nach Save,
Pin-/Reset-/Fokusvertrag,
vollständige Deckpfade,
Fertig-Abschluss,
Leave-Guard,
Kartenbestätigung plus Undo,
Decklöschdialog,
Import-State-Reset,
getrennte Abbruch-/Fehler-/Teilabschlusszustände,
klare Empty States.

Betroffene Dateien:

src/App.tsx,
src/screens/CreationScreen.tsx,
src/screens/ManualCreationPanel.tsx,
src/screens/DecksScreen.tsx,
Importpanels,
src/creationWorkflow.ts,
src/coreWorkspace.ts,
gemeinsame Dialog-/Toast-Primitives.

Nichtziele:

Draft-Cloudautosave,
globaler Papierkorb,
neue Importformate,
APKG-Parseränderung,
neue Medieninfrastruktur.

Geschützte Invarianten: Soft Deletes, Tombstones, Sync-Acknowledgements, Quellenanker, Importvorschau-vor-Commit.

Akzeptanzkriterien:

fünf Karten in einer Session,
Pins haben korrekte Labels und Wirkung,
Zieldeck bleibt,
Fokus springt korrekt,
Fertig zeigt Zusammenfassung,
Navigation warnt bei Draft,
Card Delete kann rückgängig gemacht werden,
Deck Delete erklärt Auswirkung,
Importmoduswechsel verwirft alte Vorschau.

Tests: Browserjourneys plus fokussierte State-/Commandtests.

Abhängigkeit: Paket 1.

Risiko: mittel; hauptsächlich UI-State und Orchestrierung.

Erwartete Vereinfachung: Completion-State und Import-State werden explizite Zustandsmaschinen statt verteilte Booleans.

Paket 3 — Stapel-IA und URL-Kontext

Ziel: Lernen und Bibliothek bleiben getrennt, funktionieren aber als ein zusammenhängendes Deckprodukt.

Nutzerwert: Reload, Deep Link und Browsernavigation führen nie zu einem unerwarteten Deck oder Screen.

Scope:

kanonische Deck-/Kartenparameter,
allowlist-basierter Review-Rückweg,
Learn- und Decks-Rollen schärfen,
Kartenverwaltung als sekundäre Learn-Aktion,
vollständige Pfade in Auswahlen,
URL-fokussierte Karte,
robuste Not-found-Fallbacks.

Betroffene Dateien:

src/appNavigation.ts,
src/useAppNavigation.ts,
src/App.tsx,
src/screens/LearnScreen.tsx,
src/screens/DecksScreen.tsx,
src/libraryModel.ts,
Navigationstests und E2E.

Nichtziele:

neuer Router,
Zusammenlegung der beiden Screens,
Änderung der Schedulerlogik,
globale Kartensuche — folgt in Paket 6,
neues Sidebar-Redesign.

Geschützte Invarianten: bestehende deutsche URLs soweit kompatibel, Browser-Back-Vertrag, Lazy Screens, Reviewroute, Authgate.

Akzeptanzkriterien:

Reload erhält Deck und Karte,
Review aus Bibliothek kehrt nach Reload dorthin zurück,
Back/Forward stellt Kontext wieder her,
ungültige IDs haben sicheren Fallback,
keine lokale zweite Wahrheit für fokussiertes Deck oder Karte.

Tests: Parse-/Serialize-Roundtrips, Historytests, Browserjourneys.

Abhängigkeiten: Pakete 1–2.

Risiko: mittel bis hoch wegen App-Shell-Wiring.

Erwartete Vereinfachung: weniger lokale Setter und weniger Screen-zu-Screen-Callbackverkettung.

Paket 4 — Reviewqueue, Zahlenwahrheit und Again

Ziel: Alle Lernflächen verwenden dieselbe heutige Queue und Again führt zu einer tatsächlichen Wiederholung.

Nutzerwert: Nutzer verstehen, wie viele Karten heute anstehen und wann eine Session beendet ist.

Scope:

disjunkte Neu-/Fällig-Mengen,
heutige Queuesummary als gemeinsame Projektion,
Repeat Queue,
initiales Sessionziel,
pending Wartezeiten,
Summary,
Empty-State-Aktionen,
Reaktionszeit nur dann erfassen, wenn später weiterhin benötigt.

Betroffene Dateien: reviewService.ts, StudyMode.tsx, scheduler.ts, libraryModel.ts, Dashboard, Learn, Tests.

Nichtziele: Schedulerparameter ändern, neuen Scheduler einführen, Variantenstrategie ausbauen.

Geschützte Invarianten: gleiche Simulation für Vorschau und Commit, Reviewevent-Idempotenz, Decklimits, Unterbaumlogik.

Akzeptanzkriterien:

identische Heute-Zahlen,
Again bleibt pending,
Sessionziel ist stabil,
Summary trennt Karten und Wiederholungen,
Limitänderungen wirken nur über explizite Nutzeraktion.

Risiko: hoch, da Queue- und Sessionsemantik betroffen sind.

Erwartete Vereinfachung: eine gemeinsame Queue-Projection statt Bibliotheks- und Reviewwahrheit.

Paket 5 — Settingsmodell

Ziel: Globale Defaults und Deckwerte sind verständlich und verlustfrei.

Nutzerwert: Nutzer überschreiben individuelle Deckwerte nicht versehentlich.

Scope:

globale Defaults nur für neue/importierte Decks,
explizite Bulk-Aktion,
Bestätigungsdialog mit Reichweite,
Standard-/Erweitert-Gruppierung,
Deutsch als Beta-Sprache,
Herkunftslabels.

Nichtziele: Live-Vererbung, Datenbankschema, vollständige I18n.

Akzeptanzkriterien: Deckoverride überlebt globalen Save und Reload; Bulk ändert nur nach Bestätigung alle Decks.

Risiko: mittel.

Erwartete Vereinfachung: klare Command-Semantik statt eines globalen Save mit Nebenwirkung.

Paket 6 — Kartenbrowser-Skalierung und globale Suche

Ziel: Jede Karte einer Beta-typischen Sammlung ist auffindbar und erreichbar.

Nutzerwert: Große und verschachtelte Decks sind tatsächlich verwaltbar.

Scope:

Front-/Back-/Tag-/Deckpfadsuche,
Deck- und Unterbaumfilter,
Typfilter,
Pagination oder „Weitere laden“,
Resultatanzahl,
URL-selektierte Karte,
1.000-Karten-Fixture.

Nichtziele: serverseitige Suchplattform, neue Indizes, Virtualisierung ohne Messung.

Akzeptanzkriterien: Karte 999 auffinden, öffnen, bearbeiten und nach Reload wieder öffnen.

Risiko: mittel.

Erwartete Vereinfachung: explizites Query-/Page-Modell statt implizitem Slice.

Paket 7 — Statistik und handlungsorientierte Rückschau

Ziel: Kleine, konsistente und nutzbare Leistungsstatistik.

Nutzerwert: Nutzer erkennen Trends und gelangen direkt zum relevanten Deck.

Scope: 7/30/90/All, Reviews, aktive Tage, Ratingverteilung, Again-Rate, Trends, schwache Decks/Karten, direkte Aktionen.

Nichtziele: Prognosen, KI-Coaching, neue Eventtelemetrie, Variantenanalytik.

Akzeptanzkriterien: Alle Zeitraumkennzahlen reagieren konsistent; keine tote Antwortzeit; direkte CTA öffnet richtigen Kontext.

Risiko: niedrig bis mittel.

Erwartete Vereinfachung: weniger Kennzahlen, weniger gemischte Zeiträume.

Paket 8 — Historische APIs, Testportfolio und UI-Konsolidierung

Ziel: Nach stabilen Hauptpfaden alte Oberfläche entfernen, Tests näher an reale Journeys bringen und berührte UI-Muster vereinheitlichen.

Nutzerwert: indirekt: weniger Regressionen und schnellere Änderungen.

Scope:

Consumergraph aktualisieren,
test-only APIs internalisieren,
historische Import-/Authfassaden prüfen,
Root-State-Aliase dokumentieren,
Umbrella-Tests aufteilen,
Dialog, Toast, Empty State, Pagination und Field Error konsolidieren,
freie Tailwind-Fragmente nur in berührten Screens bereinigen.

Nichtziele: neues Designsystemprojekt, pauschale Dateiaufteilung, Compatibility-Entfernung ohne Migration.

Akzeptanzkriterien: keine ungenutzten öffentlichen test-only Exporte; aktive APIs haben Produktions- oder dokumentierten Compatibility-Consumer; Beta-Gate bleibt grün.

Risiko: mittel, insbesondere bei Persistenz- und Testkompatibilität.

Erwartete Vereinfachung: kleinere öffentliche Oberfläche und risikoärmeres Testportfolio.

9. Stop-doing-Liste

Bis die Beta-Basis grün ist, gilt verbindlich:

Bereich	Beschluss
Neue KI-Capabilities	Gestoppt.
Neue LLM-Provider	Gestoppt.
KI-Kartenerstellung ausbauen	Gestoppt; bestehende Labs-Funktion nur funktionsfähig halten.
KI-Varianten erweitern	Gestoppt.
Graph-Ausbau	Gestoppt.
Community-Ausbau	Gestoppt.
Neue KI-Jobs oder Queue-Infrastruktur	Gestoppt.
Neue generische Adapter	Gestoppt, solange kein zweiter realer Adapter existiert.
Neue Plattform-/Infrafeatures	Nur zulässig, wenn ein konkreter Beta-Blocker sie zwingend benötigt.
Hosted-Politur	Keine Priorität vor Kernjourneys; bestehende Sicherheitsgates bleiben erhalten.
Neue Scheduleroptionen	Gestoppt; bestehende Optionen werden verständlicher gemacht.
Neue Kartentypen	Gestoppt. Basic, Reverse, Cloze und MC werden zuerst geschlossen.
Neues Designsystem als eigenes Projekt	Gestoppt. Nur lokale Konsolidierung in berührten Screens.
Weitere Dokumentationsbreite	Gestoppt. Bestehende kanonische Dateien aktualisieren.
Neue Roadmap-Dateien	Verboten. docs/todo.md bleibt einzige operative Roadmap.
Tests ohne konkretes Regressionsrisiko	Nicht aufnehmen. Jeder neue Test nennt den geschützten Vertrag.
Großflächige Dateiaufteilung	Nicht allein wegen LOC. Nur bei nachgewiesener Verantwortungsgrenze.
Datenbankmigrationen	Keine für die ersten drei Pakete.
Compatibility-Aliase entfernen	Erst nach Migration und Roundtripnachweis.
Mobile-/PWA-Ausbau	Zurückgestellt; responsive Nutzbarkeit bleibt Regressiongate.
OCR/DOCX/Image Occlusion	Zurückgestellt.
