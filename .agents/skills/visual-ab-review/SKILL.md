---
name: visual-ab-review
description: Legt sichtbare Alternativen (UI, Layout, Farben, Texte, Diagramme, Bilder) oder ganze Abläufe als eigenständige HTML-Vergleichsseite vor – Bilder je Variante, Auswahl und Notiz je Entscheidung, kopierbarer Ergebnis-Prompt. Nutzen, wenn der Nutzer Varianten, Vorher/Nachher oder Journeys visuell vergleichen und entscheiden oder Vorschläge bekommen will oder mehrere sichtbare Entscheidungen anstehen.
---

# Visual A/B Review

Sichtbare Alternativen als eigenständige HTML-Seite vorlegen; der Nutzer wählt je Entscheidung, ergänzt Notizen und gibt einen Ergebnis-Prompt zurück. Erst danach umsetzen.

Werkzeuge in diesem Ordner, Aufruf und Format im Dateikopf:
- `scenes.mjs`: nimmt Zustände einer Web-Oberfläche mit Playwright auf, gesteuert über eine Projektkonfiguration (Vorlage `visual-review.config.example.mjs`).
- `build.py`: baut aus einer Spec die Vergleichsseite (Beispiel `review.example.json`), sortiert Aufnahmen nach Pixeländerung.

## Vorgehen

1. **Klären.** Gegenstand, Varianten und ihre Bedeutung, Umfang, Einzelvergleich oder Journey, Bildquelle und Ansichten bestimmt der Auftrag; fehlt Wesentliches, gezielt nachfragen und warten. Nichts erfinden, außer der Nutzer will Vorschläge (dann „Varianten entwerfen“). A ist nur Ausgangsstand, wenn der Auftrag das sagt.
2. **Fälle schneiden.** Ein Fall pro unabhängiger Entscheidung. Eine Journey ist ein Fall: alle Schritte, eine Wahl.
3. **Varianten herstellen.** Benutzeränderungen erhalten, tatsächlichen Ausgangsstand wählen. So einfach wie möglich; getrennte Stände oder Server nur, wenn nötig.
4. **Bilder beschaffen.** Vorhandene Bilder direkt verwenden, sonst aufnehmen; vorhandene Projektkonfiguration wiederverwenden und erhalten. Fehlende Werkzeuge nicht ungefragt installieren, keine Zugangsdaten in Konfigurationen.
5. **Selbst ansehen.** Alle entscheidungsrelevanten Bilder, bei Journeys jeden Schritt, tatsächlich prüfen, bei Farbänderung zusätzlich dunkel. Kriterien: Telefonbreite, nichts abgeschnitten oder überlappend, Wiederholtes mit gleichen Kanten und Abständen. Fehler beheben, bevor der Nutzer sie sieht; Pixelranking ist nur Orientierung.
6. **Vorlegen.** Seite temporär außerhalb des Repos bauen, öffnen oder Pfad nennen, Unterschiede und Grenzen knapp benennen, auf die Auswahl warten.
7. **Umsetzen.** Gewähltes umsetzen, Abgelehntes zurücknehmen, offene Fälle nachfragen, Projektprüfungen ausführen. Vor der Auswahl nichts committen. Danach nur selbst erzeugte Ressourcen aufräumen (Prozesse, Worktrees, Bilder).

## Varianten entwerfen (nur wenn der Nutzer Vorschläge will)

- Vorrang: Nutzerwort > Designsystem und Regeln des Projekts > eigener Geschmack. Keine neue Optik, nur vorhandene Tokens und Komponenten.
- Varianten unterscheiden sich entlang einer benannten Achse (Dichte, Gewichtung, Reihenfolge); kurzer `label`, Haltung in einem Satz als erster Eintrag in `points`.
- Höchstens eine Variante mutiger als der Bestand, als solche benannt.
- Ohne Auftrag nicht: Emoji als Marker, alles zentriert, Karte oder Schatten auf jedem Block, Nummerierung ohne echte Reihenfolge, Erklär-Untertitel.
- Zustand in Form zeigen (Chip, Markierung), nicht nur als Text.
- UI-Texte aktiv, konkret, aus Nutzersicht, ohne Floskeln.
