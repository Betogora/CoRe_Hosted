# Mini-Feature-Roadmap für Lern- und Stapeleinstellungen

**Rolle:** nicht autorisierende Recherche- und Priorisierungshilfe. Dieses Dokument ist weder kanonische Roadmap noch Implementierungsauftrag und erweitert den freigegebenen Umfang nicht.

Offene Arbeit, Prioritäten, Abnahmegates und erforderliche Nachweise stehen ausschließlich in [`todo.md`](todo.md). Ein Punkt aus dieser Übersicht darf erst umgesetzt werden, wenn er dort oder durch einen ausdrücklichen Auftrag autorisiert wurde.

**Recherchebasis:** aktuelles offizielles Anki-Handbuch und relevante Anki-Schedulerquellen, geprüft am 11. August 2026. Die Planung berücksichtigt außerdem den aktuellen CoRe-Daten- und UI-Pfad in `coreTypes.ts`, `learningProfiles.ts`, `reviewService.ts`, `scheduler.ts`, `LearningSettingsPanel.tsx` und `SettingsScreen.tsx`.

## Umsetzungsstand für #1, #2 und #4

Die drei ausdrücklich freigegebenen Punkte wurden am 11. August 2026 umgesetzt:

1. Das Queue-Paket besitzt hierarchische Tageslimits, ein gemeinsames Reviewbudget und die getrennte Sortierung neuer und fälliger Karten.
2. Das Scheduler-Paket besitzt globale Easy Days mit accountweiter 90-Tage-Last, FSRS-Fuzz-Grenzen und DST-sicherer Kalenderaddition.
3. Die Settings-UI, Profil-/Cloud-/Portabilitätsnormalisierung, fokussierten Tests und kanonischen Verträge wurden entsprechend aktualisiert.

Es wird weder eine neue Produktionsabhängigkeit noch eine Supabase-Schemamigration benötigt. Stapelwerte liegen weiterhin im revisionierten `deckSettings`-JSONB, globale Easy-Days-Werte in den bestehenden Profilpräferenzen.

| Punkt | Fachlicher Besitzer | Persistenz | UI-Ort |
| --- | --- | --- | --- |
| #1 Tageslimits | Lernprofil und materialisierte Stapeleinstellungen | `DeckSettings` | Stapeleinstellungen → Tagesrunde & Lernprofile |
| #2 Sortierung | Lernprofil und materialisierte Stapeleinstellungen | `DeckSettings` | Stapeleinstellungen → Tagesrunde & Lernprofile |
| #4 Easy Days | globaler Wochenrhythmus | `Profile.schedulerPreferences` | Globale Einstellungen → Lerntag & Fokus |

## Gemeinsame Leitplanken

- Lernprofile bleiben Copy-on-apply-Vorlagen. Neue Profilfelder werden beim Anwenden in genau einen Stapel kopiert; es entsteht keine Live-Vererbung.
- Änderungen an einem profilbezogenen Feld setzen den Stapel wie bisher auf `Eigene Einstellungen`.
- Die unveränderlichen Vorlagen `Standard`, `Intensiv` und `Entspannt` erhalten explizite Standardwerte für neue Felder. Legacy-Daten werden beim Lesen ergänzt und beim nächsten regulären Speichern kanonisch geschrieben.
- Einstellungen des zum Lernen ausgewählten Stapels bestimmen die Sortierung für dessen gesamte Unterstapelrunde. Tageslimits jedes enthaltenen Unterstapels bleiben dagegen zusätzlich wirksam.
- Farbe ist in keiner UI der einzige Bedeutungsträger. Alle Zustände erhalten sichtbare deutsche Bezeichnungen und zugängliche Form-Controls.

## 1. Tageslimits über Stapelbäume korrekt anwenden — umgesetzt

### Recherche und heutige Lücke

Anki unterscheidet zwischen dem Gesamtlimit des ausgewählten Stapels und den eigenen Limits jedes enthaltenen Unterstapels. Standardmäßig teilen sich neue Karten und Wiederholungen das Wiederholungsbudget; tagesübergreifende Lernkarten zählen ebenfalls als Wiederholungen. Elternlimits gelten nicht, wenn ein Unterstapel direkt gestartet wird.

CoRe sammelt bereits den ausgewählten Stapel einschließlich seiner Nachfahren, wendet heute aber nur die beiden Limits des ausgewählten Stapels an. Unterstapellimits werden ignoriert und neue Karten können zusätzlich zum vollständig ausgeschöpften Wiederholungslimit erscheinen.

Referenzen:

- [Anki-Handbuch – Daily Limits](https://docs.ankiweb.net/deck-options.html#daily-limits)
- [Anki-Quellcode – Remaining Limits](https://github.com/ankitects/anki/blob/main/rslib/src/decks/limits.rs)

### Empfohlener Produktvertrag

- Wird ein Elternstapel gestartet, begrenzt sein Tageslimit die gesamte Runde. Für jede Karte müssen zusätzlich alle Limits vom Kartenstapel bis zum ausgewählten Stapel noch Budget besitzen.
- Wird ein Unterstapel direkt gestartet, werden seine Vorfahren nicht betrachtet. Eine zusätzliche Option wie Ankis `Limits Start From Top` bleibt bewusst außerhalb dieses Pakets.
- Das verbleibende Standardbudget für neue Karten ist das Minimum aus verbleibendem Neulimit und verbleibendem Wiederholungslimit. Bereits heute eingeführte neue Karten verbrauchen beide Budgets.
- Im ersten Paket gibt es keine Ausnahme: neue Karten teilen das Wiederholungsbudget immer. Ein späterer Schalter `Neue Karten trotz erreichtem Wiederholungslimit` kann nur diese Kopplung aufheben; das Neulimit bliebe trotzdem wirksam.
- Lern- und Wiederlernschritte innerhalb desselben Lerntags bleiben unabhängig von Tageslimits vorrangig verfügbar. Ein Schritt, der eine Tagesgrenze überschritten hat, verbraucht dagegen Wiederholungsbudget.
- Der vorhandene `newCardsTodayOverride` bleibt unverändert. Ein neues Review-Override und eine Baum-Bulkaktion sind nicht Teil dieses Pakets.

### Datenmodell

- Für den ersten Schnitt ist kein neues Persistenzfeld nötig. Die bestehenden Zahlenfelder `newCardsPerDay` und `maximumReviewsPerDay` bleiben die einzigen Quellen für Limits.
- Falls der Ausnahme-Schalter später autorisiert wird, wäre `newCardsIgnoreReviewLimit: boolean` ein Feld von `LearningSettings` und `DeckSettings`, standardmäßig `false`. Es würde wie die anderen Lernprofilwerte per Copy-on-apply materialisiert.

### Queue-Implementierung

1. `createDailyReviewQueue()` baut für den gewählten Stapel einen kleinen internen Limitbaum auf.
2. Für jeden Knoten werden heutige Einführungen und Wiederholungen seines gesamten eingeschlossenen Teilbaums ermittelt. So berücksichtigt nicht nur die ausgewählte Wurzel, sondern auch ein Unterstapel mit eigenen Nachfahren deren Verbrauch.
3. Intraday-Lernkarten werden zuerst gesammelt und nicht gegen das Tagesbudget gerechnet. Interday-Lernkarten gehen in denselben Budgetpfad wie normale Wiederholungen.
4. Wiederholungskandidaten werden in der durch #2 festgelegten Reihenfolge aufgenommen. Eine Karte wird nur aufgenommen, wenn jeder Knoten ihres Pfads noch Wiederholungsbudget hat; anschließend werden diese Budgets gemeinsam reduziert.
5. Neue Karten werden danach gesammelt. Auf dem vollständigen Pfad müssen sowohl neues als auch verbleibendes Wiederholungsbudget vorhanden sein. Die spätere Anzeige kann sie über `newReviewOrder` trotzdem vor oder zwischen Wiederholungen platzieren.
6. Das Queue-Ergebnis meldet neben sichtbaren Karten auch, wie viele Karten durch Limits verborgen wurden. Der bestehende Abschlusszustand kann damit verständlich erklären: `Heute sind noch Karten fällig, aber dein Tageslimit ist erreicht.`

Die Limitlogik bleibt als interne, reine Hilfslogik im Queue-Modul. Eine öffentliche generische Baum-API ist dafür nicht erforderlich.

### UI-Wege

**Weg A – erklärender Bestand und empfohlen:** Die beiden Zahlenfelder bleiben unverändert. Unter dem Wiederholungslimit erklärt ein kurzer Hilfetext: `Umfasst fällige, tagesübergreifende Lern- und neue Karten. Wiederholungen haben Vorrang.` Bei einem Elternstapel ergänzt ein ruhiger Hinweis, dass Unterstapellimits zusätzlich gelten.

**Weg B – späterer Ausnahmeschalter:** Ein `CoreSwitch` mit der Bezeichnung `Neue Karten trotz erreichtem Wiederholungslimit` macht das Anki-Verhalten vollständig konfigurierbar. Das erweitert aber Profilvertrag, Persistenz und Queue-Verzweigungen und sollte erst bei nachgewiesenem Bedarf folgen.

**Weg C – Tagesbudget-Vorschau:** Zusätzlich zu Weg A zeigt der Lernstart eine kompakte Zusammenfassung wie `12 Wiederholungen + bis zu 8 neue Karten`. Das erklärt die Wirkung am besten, erweitert den Umfang aber über die Einstellungsseite hinaus und sollte erst nach dem Kernverhalten kommen.

### Offene Fragen mit Empfehlung

1. **Soll der Ausnahme-Schalter schon im ersten Paket erscheinen?** Empfehlung: nein. Der sichere Standard löst den konkreten Fehler ohne neues Datenfeld und verhindert, dass ein Rückstand durch weitere neue Karten wächst.
2. **Sollen tagesübergreifende Lernkarten zum Reviewlimit zählen?** Empfehlung: ja, wie Anki. Intraday-Schritte bleiben davon ausgenommen.
3. **Sollen Elternlimits auch beim direkten Start eines Unterstapels gelten?** Empfehlung: nein. Das entspricht dem Anki-Standard und vermeidet eine weitere globale Sonderoption.

### Fokussierte Abnahme

- Elternlimit begrenzt die Summe mehrerer Unterstapel; jedes Unterstapellimit begrenzt zugleich seinen eigenen Anteil.
- Direkt gestarteter Unterstapel ignoriert Vorfahren, aber nicht seine eigenen Nachfahren.
- Bei einem Reviewlimit von 20 und 15 eingeplanten Wiederholungen erscheinen standardmäßig höchstens 5 neue Karten, auch wenn das Neulimit höher ist.
- Bereits heute verbrauchte Budgets werden pro Stapel und Teilbaum korrekt abgezogen.
- Intraday-Lernen bleibt erreichbar; Interday-Lernen verbraucht Wiederholungsbudget.

## 2. Kompakte Sortierung anbieten — umgesetzt

### Recherche und heutige Lücke

Anki trennt die Sortierung neuer Karten, die Sortierung fälliger Karten und die Position neuer Karten relativ zu Wiederholungen. Bei FSRS entspricht `geringste Abrufwahrscheinlichkeit zuerst` der sinnvollen Rückstandsoption. Die Sortierreihenfolge des ausgewählten Stapels gilt für die gesamte gestartete Unterstapelrunde.

CoRe hat aktuell nur `Wiederholungen zuerst`, `Gemischt` und `Neue zuerst`. Alle fälligen und neuen Karten werden ansonsten über denselben Vergleich aus Fälligkeit und Erstellungsdatum sortiert.

Referenz: [Anki-Handbuch – Display Order](https://docs.ankiweb.net/deck-options.html#display-order).

### Empfohlener Produktvertrag

- `newReviewOrder` bleibt unverändert und beantwortet nur: Wo stehen neue Karten relativ zu fälligen Karten?
- Neue Karten erhalten `Älteste zuerst` und `Zufällig`.
- Normale Wiederholungen erhalten `Längst fällig zuerst` und `Geringste Erinnerungswahrscheinlichkeit zuerst`.
- Fällige Intraday-Lernkarten behalten ihre zeitliche Priorität. Ihre kurzen Lernschritte werden nicht durch eine Review-Sortieroption umgeordnet.
- Die Sortierfelder des ausgewählten Stapels gelten für die ganze Runde. Ein Unterstapel steuert seine Lernschritte und Limits weiterhin selbst, aber nicht die gemeinsame Anzeigeordnung.
- Die vollständige Anki-Kombinatorik aus Sammel-, Kartenart-, Unterstapel- und Interday-Reihenfolgen wird bewusst nicht nachgebaut.

### Datenmodell und Defaults

- `LearningSettings` und `DeckSettings` erhalten:
  - `newCardSortOrder: "oldest-first" | "random"`
  - `reviewCardSortOrder: "most-overdue" | "lowest-retrievability"`
- Default und Legacy-Backfill sind `oldest-first` und `most-overdue`. Damit bleibt die heutige sichtbare Reihenfolge für Bestandsstapel möglichst nah am bisherigen Verhalten.
- Beide Felder sind Bestandteil eigener Lernprofile und der drei Code-Vorlagen.

### Queue-Implementierung

- `Älteste zuerst` sortiert neue Karten nach `createdAt`, danach stabil nach Karten-ID.
- `Zufällig` verwendet keinen flüchtigen `Math.random()`-Shuffle. Der Sortierschlüssel wird deterministisch aus Lerntag, ausgewähltem Stapel und Karten-ID gebildet. Damit bleibt die Reihenfolge nach Reload und während einer laufenden Runde gleich, ändert sich aber am nächsten Lerntag.
- `Längst fällig zuerst` sortiert Reviewkarten nach `dueAt`, danach stabil nach Karten-ID.
- `Geringste Erinnerungswahrscheinlichkeit zuerst` verwendet die vorhandene FSRS-Berechnung `calculateRetrievability()`, aufsteigend sortiert. `dueAt` und Karten-ID dienen als stabile Tie-Breaker.
- Sortierung erfolgt vor der Auswahl durch den Limitbaum. So bestimmen die gewählten Prioritäten nachvollziehbar, welche Karten ein knappes Tagesbudget erhalten.
- Erst nach Limitierung verbindet `newReviewOrder` die bereits sortierten Ströme aus Lernkarten, Wiederholungen und neuen Karten.

### UI-Wege

**Weg A – drei klare Selects und empfohlen:** Der bisherige Select `Reihenfolge` wird in `Neue und fällige Karten`, `Neue Karten sortieren` und `Fällige Karten sortieren` aufgeteilt. Desktop zeigt drei Spalten, mobil stehen sie untereinander. Eine Erklärung unter der Abrufwahrscheinlichkeit übersetzt den Fachbegriff: `Zeigt zuerst Karten, die du wahrscheinlich eher vergessen hast.`

**Weg B – progressive Offenlegung:** Nur `Neue und fällige Karten` bleibt direkt sichtbar; die beiden Sortierungen stehen unter `Weitere Sortierung`. Das ist kompakter, erschwert aber das Entdecken der neuen Funktion.

**Weg C – beschreibende Auswahlkarten:** Zwei bis drei Kombinationskarten wie `Gewohnt`, `Abwechslungsreich` oder `Rückstand abbauen` setzen mehrere Werte zugleich. Das wirkt zugänglich, verschleiert aber die drei unabhängigen Entscheidungen und passt schlecht zu eigenen Lernprofilen.

### Offene Fragen mit Empfehlung

1. **Wie technisch darf die FSRS-Option heißen?** Empfehlung: sichtbarer Titel `Wahrscheinlich vergessen zuerst`, ergänzend `geringste Erinnerungswahrscheinlichkeit` in der Hilfe. Das ist ELI15-tauglicher als `Retrievability`.
2. **Soll Zufall pro Sitzung oder pro Lerntag neu sein?** Empfehlung: pro Lerntag und ausgewähltem Stapel stabil. Dadurch ändert ein Reload keine laufende Reihenfolge.
3. **Soll ein Unterstapel seine eigene Sortierung behalten, wenn der Elternstapel gestartet wurde?** Empfehlung: nein. Eine gemeinsame Runde braucht genau eine verständliche Reihenfolge; Anki verwendet ebenfalls die Auswahl des gestarteten Stapels.

### Fokussierte Abnahme

- Alle sechs Kombinationen aus den zwei neuen Sortierfeldern und den drei bestehenden New/Review-Positionen bleiben deterministisch.
- Zufall ist am selben Lerntag reload-stabil und kann sich am nächsten Lerntag ändern.
- Die Abrufwahrscheinlichkeit wird mit dem tatsächlichen Kartenlernzustand berechnet, nicht aus bloßer Überfälligkeit angenähert.
- Ein Elternstapel verwendet seine Sortierung für die gesamte Runde; Limits der Unterstapel bleiben trotzdem wirksam.
- Intraday-Lernkarten werden nicht von der Reviewsortierung verdrängt.
- Profil anwenden, eigener Edit, Reload, Cloud-Roundtrip und Portabilität erhalten beide Werte.

## 3. Leech-Schwelle ergänzen

- Ein Lernprofil kann festlegen, nach wie vielen Fehlversuchen eine Karte als besonders problematisch gilt; Ausgangswert ist 8.
- Als kompakte Aktionen genügen `Hinweisen` und `Automatisch aussetzen`.
- Die Erkennung verwendet die vorhandene Fehlversuchszahl. Automatisches Aussetzen darf Lernzustand, Fälligkeit und Reviewhistorie nicht zurücksetzen.

Referenz: [Anki-Handbuch – Leeches](https://docs.ankiweb.net/leeches.html).

Dieser Punkt ist weiterhin nur recherchiert und wurde in diesem Plan nicht vertieft.

## 4. Easy Days global abbilden — umgesetzt

### Recherche und bewusste CoRe-Abweichung

Anki passt ein bereits berechnetes Intervall innerhalb eines kleinen zulässigen Fensters an. Dabei berücksichtigt der Scheduler sowohl die erwartete Last an den Kandidatentagen als auch die Wochenpräferenz. `Weniger` entspricht im aktuellen Anki-Scheduler ungefähr halber Gewichtung, `Minimal` wird fast vollständig vermieden. Sind alle sieben Tage gleich markiert, bleibt die relative Arbeitsverteilung gleich. Änderungen wirken nur auf künftig berechnete Intervalle.

Anki speichert Easy Days technisch je Deck-Preset. CoRe plant sie bewusst global: Die Einstellung beschreibt die persönliche Wochenverfügbarkeit und soll nicht beim Wechsel eines Lernprofils überraschend mitwechseln. Diese Abweichung muss als Produktentscheidung bestätigt werden.

Referenzen:

- [Anki-Handbuch – Easy Days](https://docs.ankiweb.net/deck-options.html#easy-days)
- [Anki-Quellcode – Load Balancer und Easy-Day-Gewichte](https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/load_balancer.rs)

### Empfohlener Produktvertrag

- Jeder Wochentag hat genau einen Zustand: `Normal`, `Weniger` oder `Minimal`.
- Default ist siebenmal `Normal` und verhält sich exakt wie der heutige CoRe-Scheduler.
- Sind alle sieben Tage identisch eingestellt, wird die Einstellung als neutral behandelt. Ein sichtbarer Hinweis erklärt, dass mindestens ein relativer Unterschied nötig ist.
- Easy Days wirken nur auf Tagesintervalle von Reviewkarten. Minutenbasierte Lern- und Wiederlernschritte bleiben unverändert.
- Der erste Schnitt passt – wie Ankis aktueller Load-Balancer – nur Zielintervalle bis 90 Tage an. Längere Intervalle bleiben unverändert; damit bleibt auch die benötigte Lastvorschau begrenzt.
- Bestehende `dueAt`-Werte werden nicht rückwirkend neu berechnet. Erst eine spätere Bewertung kann die nächste Fälligkeit leicht verschieben.
- Die gewünschte Erinnerungsrate, Stabilität und Schwierigkeit bleiben FSRS-Werte. Nur das tatsächlich gespeicherte nächste Intervall und `dueAt` werden innerhalb des sicheren Fensters angepasst.
- Die Verteilung betrachtet die künftige Gesamtlast aller aktiven Stapel des Kontos, weil die Präferenz global ist.

### Datenmodell und Persistenz

- Neuer Typ `EasyDayLevel = "normal" | "reduced" | "minimum"`.
- `GlobalSchedulerPreferences` erhält `easyDays` mit sieben benannten Wochentagen von Montag bis Sonntag; fehlende oder ungültige Werte normalisieren auf `normal`.
- Die globale `settingsVersion` wird erhöht. Alte Profile benötigen keine Migration außerhalb des vorhandenen Read-Normalize-Write-Pfads.
- Das Profil-JSONB synchronisiert die Werte wie bisher per Last-write-wins. Portable Exporte führen das Feld automatisch mit; der Import-Merge muss es nur übernehmen, wenn der Export es ausdrücklich enthält.
- Es gibt keine stapelbezogene Kopie und keine Lernprofil-Provenienz für Easy Days.

### Scheduler-Implementierung

1. `ts-fsrs` berechnet weiterhin das rohe Zielintervall mit deaktiviertem Zufalls-Fuzzing.
2. Für ein Review-Tagesintervall liefert das bereits installierte `ts-fsrs` über `get_fuzz_range()` das zulässige kleine Kandidatenfenster. Es wird keine zweite Intervallformel und keine neue Bibliothek eingeführt.
3. Ein reiner Easy-Days-Selektor ordnet Kandidaten dem korrekten Lerntag in Profilzeitzone und relativ zum globalen Tagesbeginn zu.
4. Für jeden Kandidaten werden die bereits geplanten aktiven Reviews des Kontos gezählt. Die Auswahl minimiert die gewichtete erwartete Last; bei Gleichstand gewinnt der Kandidat näher am ursprünglichen FSRS-Intervall, danach der frühere Tag.
5. Empfohlene feste Gewichte sind `Normal = 1`, `Weniger = 0,5` und `Minimal = nahezu 0`. Freie Prozentregler sind nicht vorgesehen.
6. Derselbe Scheduling-Kontext wird an Buttonvorschau und tatsächliches Speichern übergeben. Angezeigtes Intervall, `dueAt` und gespeicherter Zustand müssen deshalb identisch sein.
7. Die Lerntag-Helfer werden um eine zeitzonen- und DST-sichere Umrechnung von Ziel-Lerntag zu Fälligkeitszeit ergänzt; bloßes Addieren von 24 Stunden ist nicht ausreichend.

Die Auswahlformel wird als kleine reine Domänenfunktion mit Beispielen getestet. Sie soll Ankis Prinzipien übernehmen, aber keinen zweiten allgemeinen Load-Balancer, keine Geschwisterverteilung und keine hypothetische Erweiterungs-API einführen.

### UI-Wege

**Weg A – Wochentagskacheln und empfohlen:** Im globalen Bereich `Lerntag & Fokus` erscheint ein Abschnitt `Wochenrhythmus`. Sieben responsive Kacheln zeigen Wochentag und einen expliziten Drei-Zustands-Select. Desktop kann vier plus drei Kacheln zeigen, mobil zwei beziehungsweise eine pro Zeile. Soft-Farben unterstützen die Orientierung, der Text bleibt maßgeblich.

**Weg B – zwei Tag-Chip-Gruppen:** `An diesen Tagen weniger` und `An diesen Tagen minimal` verwenden je sieben auswählbare Wochentags-Chips; alle übrigen Tage sind normal. Das ist kompakter, benötigt aber Konfliktlogik, wenn ein Tag in beiden Gruppen gewählt wird.

**Weg C – Wochenvorlagen mit Anpassung:** Auswahlkarten wie `Gleichmäßig`, `Wochenende ruhiger` und `Sonntag minimal` setzen sinnvolle Muster; `Eigener Rhythmus` öffnet die sieben Tage. Das ist schnell, fügt aber eine zusätzliche Vorlagenebene für nur sieben Werte hinzu und ist daher zunächst YAGNI.

### Offene Fragen mit Empfehlung

1. **Global oder je Lernprofil?** Empfehlung: global. Verfügbarkeit gehört zur Person; Ankis presetbezogene Speicherung wird bewusst nicht kopiert.
2. **Alle aktiven Stapel oder nur der gerade gelernte Stapel in die Last einrechnen?** Empfehlung: alle aktiven Stapel des Kontos, passend zur globalen Bedeutung.
3. **Feste Stufen oder freie Prozentwerte?** Empfehlung: drei feste Stufen mit den erprobten Anki-Gewichten. Prozentwerte wären schwer verständlich und erzeugen Scheingenauigkeit.
4. **Was passiert bei siebenmal `Weniger` oder siebenmal `Minimal`?** Empfehlung: neutral behandeln, zulassen und direkt in der UI erklären; nicht stillschweigend einzelne Tage umschreiben.
5. **Soll Ankis interne 90-Tage-Grenze übernommen werden?** Empfehlung: ja für den ersten Schnitt. Sie begrenzt Aufwand und Lastvorschau, ohne ein im Handbuch versprochenes Verhalten zu unterschreiten; eine spätere Erweiterung braucht echte Nutzungsdaten.

### Fokussierte Abnahme

- Siebenmal `Normal`, `Weniger` oder `Minimal` erzeugt gegenüber dem rohen CoRe-Intervall keine relative Sonderbehandlung.
- Ein reduzierter oder minimaler Tag wird innerhalb des zulässigen Fensters seltener gewählt, ohne die FSRS-Grenzen zu verlassen.
- Zielintervalle über 90 Tage bleiben im ersten Schnitt unverändert.
- Eine Lastspitze kann auf einen nahen normal gewichteten Tag verteilt werden; Tie-Breaker sind deterministisch.
- Minutenintervalle und bereits gespeicherte Fälligkeiten bleiben unverändert.
- Vorschau und Commit liefern für jede Bewertungsoption dasselbe Intervall.
- Zeitzone, eigener Tagesbeginn sowie Sommer- und Winterzeit ordnen den Zieltag korrekt zu.
- Cloud- und Portabilitäts-Roundtrip erhalten alle sieben Werte; ein Legacy-Profil normalisiert auf siebenmal `Normal`.
- Die responsive Wochen-UI bleibt bei 390 px ohne horizontalen Überlauf und ist vollständig per Tastatur bedienbar.

## 5. Persönliche FSRS-Optimierung später prüfen

- Persönliche Parameteroptimierung bleibt ein späteres Vorhaben und gehört nicht in den aktuellen Settings-Umbau.
- Eine spätere Freigabe benötigt ausreichend persönliche Reviewhistorie, nachvollziehbare Mindestdaten und eine Auswertung der Modellgüte.
- Optimierte Parameter werden je Lernprofil verwaltet; manuelle Parameterbearbeitung oder das Kopieren fremder Werte wird nicht angeboten.

Referenz: [Anki-Handbuch – FSRS Parameters](https://docs.ankiweb.net/deck-options.html#fsrs-parameters).

## Vorgeschlagene Umsetzungspakete

### Paket A – Queue-Vertrag für #1 und #2

- Typen, Normalisierung, Code-Vorlagen und Copy-on-apply um die zwei Sortierfelder erweitern; #1 benötigt zunächst kein neues Persistenzfeld.
- Lernprofil-UI um den Hilfetext zur Limitkopplung und zwei Sortierselects ergänzen.
- Tagesverbrauch je Stapel erfassen, Limitbaum anwenden und Queue-Ströme getrennt sortieren.
- Queue- und Profiltests aktualisieren; widersprechende Alt-Tests nicht löschen, sondern auf den neuen Produktvertrag umstellen.
- Typecheck und Build ausführen.

### Paket B – Globaler Wochenrhythmus für #4

- Globale Präferenzen versionieren und Easy Days normalisieren, speichern, synchronisieren und portabel machen.
- Responsive Wochen-UI im Bereich `Lerntag & Fokus` ergänzen.
- Accountweite Fälligkeitslast bereitstellen und den reinen Easy-Days-Selektor in Vorschau und Commit verdrahten.
- Scheduler-, Lerntag-, Persistenz- und Screen-Tests ergänzen.
- Typecheck, Build und eine fokussierte Browserabnahme in Light und Dark Mode durchführen.

### Betroffene Bereiche, keine verbindliche Dateiliste

- Domäne: `coreTypes.ts`, `learningProfiles.ts`, `deckSettings.ts`
- Queue: `reviewService.ts` und fokussierte Tests
- Scheduler/Lerntag: `scheduler.ts`, `learningDay.ts` und fokussierte Tests
- UI/Verdrahtung: `LearningSettingsPanel.tsx`, `SettingsScreen.tsx`, `appScreenProps.ts`, `App.tsx`
- Persistenz: vorhandene Cloud-Profilnormalisierung und `dataPortability.ts`; keine Datenbankmigration

## Bewusst außerhalb

- `Limits Start From Top`, Review-Tagesoverride und Bulk-Zuweisung an Unterstapel.
- Vollständige Anki-Sammel- und Sortierkombinatorik, zufällige Neuordnung bei jedem Öffnen sowie eigene Interday-Reihenfolge.
- Rückwirkendes Easy-Days-Rescheduling, freie Prozentregler, Kalenderausnahmen und Urlaubsmodus.
- SM-2-spezifische Regler wie Starting Ease, Easy Bonus, Interval Modifier, Hard Interval und New Interval.
- Ein FSRS-An/Aus-Schalter; CoRe behält einen kanonischen Schedulerpfad.
- Audioeinstellungen und Auto-Advance.

Diese Auslassungen sind keine Aussage über mögliche spätere Produktentscheidungen. Sie verhindern lediglich, dass diese Rechercheübersicht angrenzenden Umfang autorisiert.
