# Mini-Feature-Roadmap für Lern- und Stapeleinstellungen

**Rolle:** nicht autorisierende Recherche- und Priorisierungshilfe. Dieses Dokument ist weder kanonische Roadmap noch Implementierungsauftrag und erweitert den freigegebenen Umfang nicht.

Offene Arbeit, Prioritäten, Abnahmegates und erforderliche Nachweise stehen ausschließlich in [`todo.md`](todo.md). Ein Punkt aus dieser Übersicht darf erst umgesetzt werden, wenn er dort oder durch einen ausdrücklichen Auftrag autorisiert wurde.

**Recherchebasis:** aktuelles offizielles Anki-Handbuch, geprüft am 11. August 2026.

## Recherchierte Prioritäten

### 1. Tageslimits über Stapelbäume korrekt anwenden

- Das Wiederholungslimit soll neue Karten standardmäßig blockieren, sobald das verbleibende Reviewbudget ausgeschöpft ist. Eine spätere ausdrückliche Option „Neue Karten trotz erreichtem Wiederholungslimit“ kann dieses Verhalten je Lernprofil aufheben.
- Beim Lernen eines Elternstapels begrenzt dessen Tageslimit die gesamte Sitzung. Zusätzlich begrenzt jeder Unterstapel, wie viele seiner eigenen neuen und fälligen Karten in diese Sitzung einfließen.
- Ein gestarteter Unterstapel verwendet seine eigenen Limits; ein höherer Elternstapel begrenzt ihn nicht beiläufig.

Referenz: [Anki-Handbuch – Daily Limits](https://docs.ankiweb.net/deck-options.html#daily-limits).

### 2. Kompakte Sortierung anbieten

- Neue Karten erhalten nur die verständlichen Optionen `Älteste zuerst` und `Zufällig`.
- Fällige Karten erhalten nur die Optionen `Längst fällig zuerst` und `Geringste Abrufwahrscheinlichkeit zuerst`.
- Die bestehende Wahl zwischen neuen und fälligen Karten bleibt davon getrennt. Zufall bleibt innerhalb eines Lerntags und einer laufenden Sitzung stabil.
- Die vollständige Anki-Kombinatorik aus Sammel- und Sortierreihenfolgen wird bewusst nicht nachgebaut.

Referenz: [Anki-Handbuch – Display Order](https://docs.ankiweb.net/deck-options.html#display-order).

### 3. Leech-Schwelle ergänzen

- Ein Lernprofil kann festlegen, nach wie vielen Fehlversuchen eine Karte als besonders problematisch gilt; Ausgangswert ist 8.
- Als kompakte Aktionen genügen `Hinweisen` und `Automatisch aussetzen`.
- Die Erkennung verwendet die vorhandene Fehlversuchszahl. Automatisches Aussetzen darf Lernzustand, Fälligkeit und Reviewhistorie nicht zurücksetzen.

Referenz: [Anki-Handbuch – Leeches](https://docs.ankiweb.net/leeches.html).

### 4. Easy Days global abbilden

- Nutzer können Wochentage markieren, an denen künftig weniger Wiederholungen eingeplant werden sollen.
- In CoRe gehört diese Verfügbarkeitspräferenz in die globalen Einstellungen und nicht in ein einzelnes Stapelprofil.
- Änderungen wirken nur auf künftig berechnete Intervalle und verschieben bestehende Fälligkeiten nicht rückwirkend.

Referenz: [Anki-Handbuch – Easy Days](https://docs.ankiweb.net/deck-options.html#easy-days).

### 5. Persönliche FSRS-Optimierung später prüfen

- Persönliche Parameteroptimierung bleibt ein späteres Vorhaben und gehört nicht in den aktuellen Settings-Umbau.
- Eine spätere Freigabe benötigt ausreichend persönliche Reviewhistorie, nachvollziehbare Mindestdaten und eine Auswertung der Modellgüte.
- Optimierte Parameter werden je Lernprofil verwaltet; manuelle Parameterbearbeitung oder das Kopieren fremder Werte wird nicht angeboten.

Referenz: [Anki-Handbuch – FSRS Parameters](https://docs.ankiweb.net/deck-options.html#fsrs-parameters).

## Bewusst außerhalb

- SM-2-spezifische Regler wie Starting Ease, Easy Bonus, Interval Modifier, Hard Interval und New Interval.
- Ein FSRS-An/Aus-Schalter; CoRe behält einen kanonischen Schedulerpfad.
- Automatisches oder dauerhaft konfiguriertes rückwirkendes Neuplanen bestehender Karten.
- Audioeinstellungen.
- Auto-Advance.

Diese Auslassungen sind keine Aussage über mögliche spätere Produktentscheidungen. Sie verhindern lediglich, dass diese Rechercheübersicht angrenzenden Umfang autorisiert.
