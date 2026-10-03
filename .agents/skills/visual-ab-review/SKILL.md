---
name: visual-ab-review
description: Legt sichtbare Änderungen (UI, Layout, Farben, Komponenten, Texte, Diagramme) oder Varianten dem Nutzer als klickbare Vergleichsseite zur Entscheidung vor - eine temporäre HTML mit eingebetteten Vorher/Nachher- oder A/B/C-Bildern je Entscheidung und einem Ergebnis-Prompt am Ende. Nutzen, wenn mehrere sichtbare Entscheidungen anstehen oder der Nutzer Varianten vergleichen will.
---

# Visual A/B Review

Sichtbare Änderungen gemeinsam umsetzen, als Bildvergleich vorlegen, den Nutzer je Entscheidung wählen lassen. Werkzeuge liegen neben dieser Datei: `scenes.mjs` (Aufnahmen) und `build.py` (Rangliste und Seite). Die Formate stehen im Kopf beider Dateien; nur diese Formate verwenden.

## Ablauf

Im CoRe-Repository aus dessen Wurzel arbeiten. Einrichtung und direkt ausführbare Befehle stehen im Abschnitt „Visueller Variantenvergleich“ der Root-README. `visual-review.config.mjs` enthält zunächst öffentlich erreichbare Katalogdemos; `review.example.json` neben dieser Datei zeigt das Seitenformat. Für Produktänderungen die tatsächlich betroffenen App-Zustände in der Konfiguration ergänzen. Katalogdemos ersetzen keine Produktabnahme; die Pflichtmatrix in `docs/operations.md` gilt weiterhin.

1. **Entscheidungen schneiden.** So viele wie nötig, je eine pro unabhängig umkehrbarer Änderung. Standard: zwei Varianten, A = vorher, B = nachher.
2. **Alles zusammen umsetzen.** Das Nachher-Bild zeigt das komplette Zielbild mit allen Entscheidungen, nie einen Teilstand.
3. **Stände parallel starten.** Vorher-Stand per `git worktree add --detach <scratch>/before HEAD` mit eigenem Dev-Server auf zweitem freien Port; Abhängigkeiten per Junction/Symlink teilen. Nur selbst erzeugte Prozesse und Worktrees bereinigen. Fremde Prozesse und Ports nicht anfassen. Katalogseiten in beiden Ständen jeweils mit `npm run docs:build` aus deren Quellen erzeugen. Liegen bereits relevante Änderungen im Arbeitsverzeichnis, ist HEAD nicht automatisch das richtige Vorher-Bild; einen passenden Ausgangsstand wählen und Benutzeränderungen erhalten.
4. **Aufnehmen** mit der Projektkonfiguration `visual-review.config.mjs` (Szenen, Demo-Zustand, Ansichten). Fehlt sie, einmalig anlegen und ins Repo nehmen.
   `node <skill>/scenes.mjs --config <cfg> --base <url> --out <scratch>/shots --variant A`, dasselbe für B. Aufnehmen kostet keine Tokens.
5. **Szenen wählen.** `python <skill>/build.py rank <scratch>/shots` listet die Szenen nach Änderungsanteil. Pro Entscheidung standardmäßig **eine** Szene in der Standardansicht: die, in der diese Änderung am deutlichsten zu sehen ist.
6. **Selbst prüfen.** Nur die gewählten Paare ansehen, nicht alle Aufnahmen. Fehler im Umbau erst beheben und neu aufnehmen. Tests oder Smoke vor dem Vorlegen, damit nicht über Kaputtes entschieden wird.
7. **Bauen.** `spec.json` nach dem Format in `build.py` schreiben, dann `python <skill>/build.py page spec.json <ordner>/review.html`. Eine Datei, Bilder eingebettet, kein Server nötig; temporär und unversioniert ablegen und im Browser öffnen.
8. **Texte kurz und lenkend.** `lead` ein bis drei Sätze (was und warum), `points` zwei bis drei Stichpunkte je Variante mit Zahlen, `note` ein Satz, worauf das Auge achten soll.
9. **Ergebnis übernehmen.** Der Nutzer wählt pro Fall (die Seite springt weiter) und kopiert den Ergebnis-Prompt in den Chat. Abgelehntes zurücknehmen, Checks laufen lassen, dann Seite, Aufnahmen, Worktree und Zusatzserver löschen.

## Optional, nur auf Wunsch

- **Mehr Varianten (A/B/C…):** `variants` global oder im Fall erweitern, je Variante einen Stand aufnehmen (`--variant C`).
- **Volle Szenenmatrix:** alle Ansichten aufnehmen (`--views mobile,desktop,…`) und `"matrix": true` setzen. Die Seite bekommt einen Reiter mit allen Szenen x Ansichten zum Durchsehen. Selbst nur die Paare ansehen, die `rank` als auffällig meldet.

## Regeln

- Nichts committen, bevor die Entscheidungen da sind.
- Ist ein Fall im Demo-Zustand nicht erreichbar, das in der `note` sagen statt ein falsches Bild zu zeigen.
