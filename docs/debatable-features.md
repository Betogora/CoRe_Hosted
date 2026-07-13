# Diskutierbare Features

Stand: 13. Juli 2026

Diese Liste ist eine Entscheidungshilfe, keine Löschliste. Im Audit wurde keines der genannten Features entfernt, versteckt oder visuell verändert. Eine Entfernung braucht eine ausdrückliche Produktentscheidung.

## Wie die Liste zu lesen ist

Ein Feature ist hier nicht automatisch schlecht. Es steht hier, wenn mindestens eine dieser Fragen noch offen ist:

- Benutzen echte Lernende es regelmäßig?
- Löst es ein wichtiges Problem oder sieht es hauptsächlich interessant aus?
- Ist der Nutzen groß genug für Tests, Fehlerbehebung und Weiterentwicklung?
- Verspricht die Oberfläche bereits mehr, als die Technik heute wirklich leistet?

## 1. Lokale Community

**Was ist das?** Decks können in einer lokalen Community geteilt und kopiert werden.

**Warum diskutierbar?** Es sieht ein wenig wie gemeinsames Arbeiten aus, funktioniert heute aber eher wie ein Kopierer auf demselben Gerät. Es gibt noch keine echten Mitglieder, Einladungen oder serverseitigen Rechte.

**Was ginge bei einer Entfernung verloren?** Die vorbereitete Oberfläche und der lokale Teilen-/Kopieren-Flow. Eine spätere echte Community müsste wieder sichtbar aufgebaut werden.

**Welche Information fehlt für eine Entscheidung?** Beobachten, ob Testpersonen diesen lokalen Zwischenstand verstehen und benutzen oder dadurch eine bereits fertige Online-Community erwarten.

**Status:** Beibehalten, bis der geplante Community-Ausbau oder echte Nutzungsdaten Klarheit schaffen.

## 2. Deck-Graph

**Was ist das?** Der Graph zeigt Karten und Schlagwörter als visuelle Landkarte und kann neu berechnet werden.

**Warum diskutierbar?** Eine Landkarte ist nur hilfreich, wenn sie beim Lernen wirklich Orientierung gibt. Wenn sie hauptsächlich hübsch aussieht, kostet sie dauerhaft Layout-, Graph- und UI-Pflege, ohne den Lernerfolg stark zu verbessern.

**Was ginge bei einer Entfernung verloren?** Die visuelle Themenübersicht und der eigene Hauptbereich „Graph“.

**Welche Information fehlt für eine Entscheidung?** Messen oder testen, ob Lernende über den Graphen tatsächlich schwache Themen finden oder Lernaktionen starten.

**Status:** Beibehalten; später anhand echter Nutzung entscheiden.

## 3. Versteckte KI-Job-Historie

**Was ist das?** `AiJobsScreen` kann ausgeführte KI-Aufgaben wie in einem Quittungsordner anzeigen.

**Warum diskutierbar?** Der Screen ist gebaut, besitzt aber derzeit keine Tür in Navigation oder Routing. Versteckter Produktcode muss trotzdem getestet und bei Modelländerungen gepflegt werden.

**Was ginge bei einer Entfernung verloren?** Ein möglicher zentraler Ort für Transparenz, Fehlerdiagnose und Kosteninformationen zu KI-Aktionen.

**Welche Information fehlt für eine Entscheidung?** Entweder einen echten Einstieg und einen klaren Nutzerzweck festlegen oder bestätigen, dass Status direkt bei der jeweiligen KI-Aktion genügt.

**Status:** Nicht löschen; Produktentscheidung „sichtbar machen oder entfernen“ ausstehend.

## 4. Privatsphäre-Schalter ohne angeschlossene Wirkung

**Was ist das?** Einstellungen wie `shareLearningProgress`, `showOnlineStatus` und `showStreaksToOthers` werden gespeichert.

**Warum diskutierbar?** Aktuell sind sie wie Lichtschalter ohne Lampe: Die Werte existieren, aber Community und Server setzen sie noch nicht sichtbar durch. Das kann ein falsches Sicherheitsgefühl erzeugen.

**Was ginge bei einer Entfernung verloren?** Vorbereitete Präferenzen für eine spätere soziale Plattform.

**Welche Information fehlt für eine Entscheidung?** Klären, welche sozialen Daten künftig überhaupt geteilt werden. Danach die Schalter entweder technisch durchsetzen oder bewusst entfernen.

**Status:** Nicht still ändern; vor echtem Community-Release verbindlich entscheiden.

## 5. Externer Prompt-/JSON-Flow für Varianten

**Was ist das?** Fortgeschrittene Nutzer können einen Prompt kopieren, in einem externen KI-Tool ausführen und die JSON-Antwort wieder in CoRe einfügen.

**Warum diskutierbar?** Der Ablauf ist mächtig, aber umständlich. Sobald die serverseitige Variantenerstellung zuverlässig funktioniert, gibt es möglicherweise zwei Wege für dasselbe Ziel. Zwei Wege bedeuten auch zwei Erklärungen, zwei Fehlerbilder und mehr Testaufwand.

**Was ginge bei einer Entfernung verloren?** Ein providerunabhängiger Power-User- und Fallback-Weg, der ohne in CoRe gespeicherten API-Schlüssel funktioniert.

**Welche Information fehlt für eine Entscheidung?** Prüfen, ob Nutzer den manuellen Weg nach Einführung der direkten KI-Erstellung noch verwenden und ob er als Notfallweg wichtig bleibt.

**Status:** Beibehalten, bis der direkte KI-Weg produktiv und vergleichbar ist.

## 6. Automatischer Welt-Hauptstadt-Demostapel mit Lernhistorie

**Was ist das?** Ein großer Beispieldatensatz erzeugt Deckhierarchie, 245 Karten und eine realistisch simulierte dreimonatige Lernhistorie.

**Warum diskutierbar?** Er ist ein sehr gutes Musterheft für Tests und Demonstrationen. In einem echten Nutzerkonto kann ein automatisch vorhandenes Musterheft aber Statistiken, Speicher und den ersten Eindruck mit fremden Daten füllen.

**Was ginge bei einer Entfernung verloren?** Eine reproduzierbare Demo, starke visuelle Testdaten und ein sofort gefülltes Produkt für lokale Entwicklung.

**Welche Information fehlt für eine Entscheidung?** Festlegen, ob der Datensatz nur Entwicklung/E2E dient, optional als Demo importiert wird oder bewusst Teil des Onboardings bleibt.

**Status:** Datenquelle wurde im Audit nur dedupliziert; Seed und Historie bleiben vollständig erhalten.

## 7. Alte lokale Anmeldung

**Was ist das?** `authModel.js` enthält eine lokale Account- und Passwortlogik, während die produktive App bereits Supabase-Anmeldung verlangt.

**Warum diskutierbar?** Das ist wie ein zweites Türschloss, das nicht an der benutzten Haustür sitzt. Es kann sinnvoll sein, falls ein echter Offline-Login geplant ist; sonst ist es vor allem test-only Altcode.

**Was ginge bei einer Entfernung verloren?** Eine vorbereitete lokale Login-Variante und die dazugehörigen Tests.

**Welche Information fehlt für eine Entscheidung?** Eine klare Aussage, ob CoRe künftig ohne Cloud-Konto vollständig nutzbar sein soll.

**Status:** Nicht entfernen, bevor die Offline-Produktentscheidung gefallen ist.

## Empfohlene Entscheidungsreihenfolge

1. Privatsphäre-Schalter vor einem echten Community-Release klären.
2. KI-Job-Historie sichtbar machen oder bewusst stilllegen.
3. Community und Graph mit kurzen Nutzertests bewerten.
4. Nach produktiver KI-Erstellung den externen Variantenflow vergleichen.
5. Demo-Seed und lokale Anmeldung anhand der gewünschten Onboarding-/Offline-Strategie entscheiden.
