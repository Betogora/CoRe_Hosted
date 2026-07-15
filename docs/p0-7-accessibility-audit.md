# P0.7 Accessibility- und Fehlerzustands-Audit

Stand vor Änderungen: 15. Juli 2026. Geprüft werden ausschließlich die acht P0-Kernflächen. „Nicht eigenständig“ bedeutet, dass der Zustand im Screen nicht entsteht und durch App-Shell oder aufrufenden Flow behandelt wird.

## Ist-Matrix vor Änderungen

| Screen | Primärer Fokus | Tastaturfolge | Status-/Fehlerregion | Leer | Lädt | Offline | Teilweise erfolgreich | Fehlgeschlagen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AuthGateScreen | Erstes Feld des gewählten Auth-Modus | Felder → Primäraktion → Google → Moduswechsel | Meldung als `status` oder `alert`; Alert unnötig assertiv | Nicht eigenständig | Button nur mit Text „Bitte warten“ | Netzwerkfehler als Alert aus App-Shell | Nicht eigenständig | Sprachlicher Auth-Fehler vorhanden |
| DashboardScreen | Erste Hauptnavigation, danach erster Inhaltslink | Navigation → optionale Schnellaktion → Heatmap → Stapelaktionen | Keine eigene dynamische Region | Explizite Erstaktionen vorhanden | Nicht eigenständig | Nicht eigenständig | Nicht eigenständig | Nicht eigenständig |
| LearnScreen | Oberflächenaktionen, danach Stapelanlage oder erster Stapel | Kartenstapel → Neue Karten → Stapel anlegen → Deckzeilen | Anlageergebnis als polite Live-Region | „Keine Karten“ mit Erstellen-Aktion | Nicht eigenständig | Nicht eigenständig | Nicht eigenständig | Leerer Name nur als Status, nicht als Fehler |
| DecksScreen | Suche, Modusfilter, Neue Karten | Filter → Deckauswahl/-aktionen → Kartenliste → Editor | Gemeinsamer Deckstatus immer polite; Medienhinweis als Status | Expliziter leerer/gefilterter Zustand | Nicht eigenständig | Medien können lokal fehlen | Reimport-/Medienhinweis sprachlich | Umbenennen/Verschieben sprachlich, aber nicht als Alert |
| CreationScreen | Methodenwahl oder erstes Feld des gewählten Flows | Methode → Dateiauswahl/Formular → Vorschau → Übernehmen → Folgeaktion | Mehrere polite Regionen; Serverfortschritt meldet jede Änderung | Methodenwahl/noch keine Vorschau | Spinner und Fortschritt vorhanden | Medienstatus kann lokal ausstehend sein | Importstatus „Teilweise fertig“ vorhanden | Importfehler als Alert mit genau einer Primäraktion |
| StudyMode | Verlassen, Einstellungen, danach Frage/Antwort | Kopfaktionen → Antwortoptionen/Reveal → Anker/Feedback → Ratings | Medienhinweis/Feedback/Abschluss; Abschluss unnötig als Live-Region | „Keine fälligen Karten“ | Nicht eigenständig | Fehlende Medien sprachlich | Nicht eigenständig | Unvollständige Multiple Choice als Alert |
| SettingsScreen | Erstes Profilfeld | Profil → Lernen → Sync/Konflikte → Export/Import → Erweitert | Konto, Sync und Portabilität; Sync dauerhaft als Live-Region | Konfliktpanel meldet „keine Konflikte“ | Konflikte/Sync sprachlich | Synctext und Warnfarbe | Portabilitätsimport meldet Erfolg, aber keine Anzahl | Import-/Syncfehler sprachlich |
| SyncConflictPanel | Neu laden, danach erste Konfliktentscheidung | Neu laden → Konflikte → Direktentscheidung oder Feldquellen → Speichern | Laden, Fehler und Ergebnis; leerer Initialzustand als Status | „Keine offenen Konflikte“ | Sprachlicher Ladestatus | Wird vom Settings-Syncstatus erklärt | Zurückstellen erklärt pausierten Snapshot und fortgesetzte Reviews | Sprachlicher Fehler, Entscheidung bleibt erhalten |

## Prüfpunkte nach Umsetzung

- Tastaturpfade und Fokuswiederherstellung: mit fokussierten Playwright-Flows für Auth und angemeldete Kernflows bestanden.
- 200 % Browserzoom bei 1280 × 720: automatisiert mit 1280 × 720 sowie dem effektiven 640 × 360 Viewport geprüft; der Kernflow bleibt ohne horizontales Überlaufen nutzbar.
- `prefers-reduced-motion`: zentrale CSS-Regel und gerenderter Zustand automatisiert geprüft.
- Screenreader-Smoke (Windows Narrator): offen. Der lokale Edge-Tab konnte in der manuellen Windows-Automation nicht zuverlässig als Ziel bestätigt werden; der Accessibility-Tree wurde nicht als Ersatz für einen echten Screenreader-Smoke gewertet.
- Automatisierte Rollen-/Label-Smokes: fokussierte Komponenten- und Playwright-Tests bestanden, einschließlich Reviewratings, Import, Export und Konfliktentscheidung.
