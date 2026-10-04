---
name: visual-ab-review
description: Legt sichtbare Alternativen (UI, Layout, Farben, Texte, Diagramme, Bilder) oder ganze Abläufe als eigenständige HTML-Vergleichsseite vor – Bilder je Variante, Auswahl und Notiz je Entscheidung, kopierbarer Ergebnis-Prompt. Nutzen, wenn der Nutzer Varianten, Vorher/Nachher oder Journeys visuell vergleichen und entscheiden will oder mehrere sichtbare Entscheidungen anstehen.
---

# Visual A/B Review

Sichtbare Alternativen werden dem Nutzer als eigenständige HTML-Seite vorgelegt. Er wählt je Entscheidung, ergänzt Notizen und gibt einen Ergebnis-Prompt zurück. Erst danach wird umgesetzt.

Werkzeuge in diesem Ordner; ihr Dateikopf beschreibt Aufruf und Format:
- `scenes.mjs` nimmt Zustände einer Web-Oberfläche mit Playwright auf, gesteuert über eine Projektkonfiguration (Vorlage: `visual-review.config.example.mjs`).
- `build.py` baut aus einer Spec die Vergleichsseite (Beispiel: `review.example.json`) und kann Aufnahmen nach Pixeländerung sortieren.

## Vorgehen

1. **Klären.** Gegenstand, Varianten und ihre Bedeutung, Änderungsumfang, Einzelvergleich oder Journey, Bildquelle und Ansichten bestimmt der Auftrag. Fehlt Wesentliches, gezielt nachfragen und warten. Keine Designvorgaben, Ansichten oder Varianten erfinden; A ist nur dann Ausgangsstand, wenn der Auftrag das sagt.
2. **Fälle schneiden.** Ein Fall pro unabhängiger Entscheidung. Eine Journey ist ein Fall: alle Schritte, eine Wahl.
3. **Varianten herstellen.** Benutzeränderungen erhalten und den tatsächlichen Ausgangsstand wählen. So einfach wie möglich; getrennte Stände oder Server nur, wenn nötig.
4. **Bilder beschaffen.** Vorhandene Bilder direkt verwenden, sonst aufnehmen. Eine vorhandene Projektkonfiguration wiederverwenden und erhalten. Fehlende Werkzeuge nicht ungefragt installieren; keine Zugangsdaten in Konfigurationen.
5. **Selbst ansehen.** Alle entscheidungsrelevanten Bilder, bei Journeys jeden Schritt, tatsächlich prüfen und Fehler beheben, bevor der Nutzer sie sieht. Pixelranking ist nur Orientierung.
6. **Vorlegen.** Seite temporär außerhalb des Repos bauen, öffnen oder den Pfad nennen, Unterschiede und Grenzen knapp benennen, auf die Auswahl warten.
7. **Umsetzen.** Gewähltes umsetzen, Abgelehntes zurücknehmen, offene Fälle nachfragen, Projektprüfungen ausführen. Vor der Auswahl nichts committen. Danach nur selbst erzeugte Ressourcen aufräumen (Prozesse, Worktrees, Bilder).
