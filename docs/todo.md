# CoRe TODO — offene Roadmap

**Rolle:** einzige kanonische Quelle für offene Aufgaben, Abnahmegates und geparkte Themen.
**Stand:** 2026-07-15

Abgeschlossene Arbeit und zeitgebundene Nachweise stehen in [`history.md`](history.md). Produktvertrag, Ist-Stand und Entscheidungen stehen in [`specs.md`](specs.md), [`status.md`](status.md) und [`decisions.md`](decisions.md).

## Arbeitsregeln

- Ein grüner Testlauf ist Evidenz für einen definierten Vertrag, aber kein Ersatz für eine UX-Abnahme.
- Neue Tests schützen einen konkreten Produkt-, Sicherheits- oder Regressionsvertrag; Testanzahl ist keine Zielmetrik.
- Keine neue Datenbankmigration, Queue, Providerintegration, Admin-API oder allgemeine Adapterebene ohne expliziten Auftrag.
- Produktverträge werden vor Architekturumbauten korrigiert.
- Pro Pull Request gilt ein enger fachlicher Scope.

# P0 — Produktwahrheit und Kern-UX

P0 hat Vorrang vor neuen Plattform-, Community-, KI-, Admin- oder Großdatei-Funktionen.

## P0.5 Erstellen und Import abschließen

- [ ] Nach erfolgreichem Import zusätzlich `Zur Bibliothek` anbieten.
- [ ] Manuelles Speichern eindeutig bestätigen und Fokus für die nächste Karte sinnvoll setzen.
- [ ] Unsaved-Changes-Verhalten beim Wechsel der Erstellungsart festlegen.
- [ ] Fehlerflows für Netzwerkfehler und nicht lesbare PDF ergänzen.

Akzeptanzgate:

- [ ] Der Standardimport ist ohne Kenntnis von Anki-Interna verständlich.
- [ ] Lokale Simulation wird nicht als kostenabhängige externe KI ausgegeben.
- [ ] Nicht unterstützte Dateitypen können nicht ausgewählt werden.
- [ ] Ein erfolgreicher Import endet in einem konkreten Nutzerziel.
- [ ] Die technische Diagnose bleibt erreichbar, dominiert aber nicht den Hauptflow.

## P0.7 Konsistenz, Accessibility und Fehlerzustände

- [ ] Zentrale Layout-, Typografie-, Farb-, Radius-, Spacing- und Surface-Tokens vollständig definieren.
- [ ] Harte Farbwerte und freie Tailwind-Werte in den P0-Screens auf Tokens umstellen.
- [ ] Primär-, Sekundär-, Destruktiv- und Linkaktionen konsistent definieren.
- [ ] Fokuszustände, Fokusreihenfolge und Fokuswiederherstellung für Dialoge, Overlays und Lazy-Screens prüfen.
- [ ] Screenreader-Status auf relevante Änderungen begrenzen.
- [ ] Kontraste und Zustände nicht ausschließlich über Farbe vermitteln.
- [ ] Leere, ladende, offline, fehlerhafte und teilweise erfolgreiche Zustände pro Kernscreen abnehmen.
- [ ] Lange Inhalte, große Schrift, Browserzoom und 1280 × 720 prüfen.
- [ ] Bewegungen auf `prefers-reduced-motion` abstimmen.
- [ ] Deutsche UI-Texte vereinheitlichen.

Akzeptanzgate:

- [ ] Kernflows sind vollständig per Tastatur nutzbar.
- [ ] Kein wichtiger Status ist nur farblich erkennbar.
- [ ] Bei 200 % Zoom bleibt der Kernflow ohne horizontales Hauptscrolling bedienbar.
- [ ] Jeder asynchrone Kernflow hat Lade-, Fehler-, Retry- und Erfolgszustand.
- [ ] Dieselbe Aktion hat in verschiedenen Screens dieselbe visuelle und sprachliche Bedeutung.
- [ ] Manuelle Tastatur- und Screenreader-Prüfung sowie Screenshots der Zielviewports liegen vor.

## P0.8 Produktabnahme

- [ ] Eine Core-Journey-Matrix mit Nutzerziel, Startzustand, Schritten, Fehlerpfaden, Datenwirkung, UX-Abnahme und automatisierter Evidenz anlegen.
- [ ] Für jede Journey den verantwortlichen Produktvertrag benennen.
- [ ] Mindestens drei moderierte Tests mit Personen aus den Zielgruppen durchführen.
- [ ] Befunde als Blocker, hoher Reibungsverlust, Verständnishürde oder kosmetisch klassifizieren.
- [ ] Offene P0-Befunde dokumentieren und priorisieren.

P0-Abnahmegate:

- [ ] Alle fünf Kernjourneys aus `docs/specs.md` bestehen automatisiert und manuell.
- [ ] Vor dem Reveal ist eine Variante nicht erkennbar.
- [ ] Keine normale Oberfläche verspricht lokale Demo-Logik als echte Community oder KI.
- [ ] Keine sichtbare Einstellung ist wirkungslos.
- [ ] Neuer Account, kleiner Import, manuelle Erstellung, Review und Reload sind ohne Entwicklerwissen bedienbar.
- [ ] Zielviewports, Tastatur, Screenreader und Zoom sind abgenommen.
- [ ] Es verbleiben keine Blocker und keine ungeklärten hohen Reibungsverluste.

# P1 — Architektur nach dem Produktvertrag vereinfachen

## P1.2 Große Screens weiter zerlegen

- [ ] `LearnScreen.tsx` in Lernliste, Stapelanlage und Zeile aufteilen.
- [ ] `DecksScreen.tsx` in Bibliotheksliste, Kartendetail, Versionen und Labs-Variantenwerkzeuge aufteilen.
- [ ] `StudyMode.tsx` in Sessionkopf, Karte, Antwortanker, Feedback und Ratingbar aufteilen.
- [ ] Geteilte Darstellung nach `src/ui/` verschieben, ohne Domänenverhalten in UI-Helfer zu verlagern.
- [ ] Pro Untermodul eine enge Props-Schnittstelle verwenden.

Akzeptanzgate:

- [ ] Kein Untermodul dupliziert Import-, Scheduler-, Medien- oder Persistenzlogik.
- [ ] Testselektoren und Nutzerverhalten bleiben stabil.
- [ ] Die Zerlegung reduziert sichtbare Komplexität ohne Wrapperketten.

## P1.5 Bewusster Rückbau

- [ ] Für jedes Labs-Feature entscheiden: `graduieren`, `weiter als Labs` oder `entfernen`.
- [ ] Versteckte AI-Job-Oberfläche sichtbar begründen oder entfernen.
- [ ] Verbliebene alte lokale Authlogik entfernen, sofern kein eigener Offline-Login beschlossen wird.
- [ ] Externen Prompt-/JSON-Variantenflow entfernen, falls direkte Generierung später denselben Zweck erfüllt.
- [ ] Toten Code, ungenutzte Zustände und zugehörige Tests gemeinsam entfernen.
- [ ] Rückbau nicht mit neuen Ersatzfeatures kombinieren.

Akzeptanzgate:

- [ ] Jedes sichtbare Feature hat Nutzerzweck, Reifestatus und Owner.
- [ ] Kein versteckter Screen bleibt ohne Produktzweck bestehen.
- [ ] Entfernte Features hinterlassen keine verwaisten Daten- oder Routingpfade.
- [ ] Rückbauentscheidungen stehen in `docs/decisions.md`.

# P2 — Minimaler Beta-Betrieb

P2 beginnt erst nach bestandenem P0-Gate.

## P2.1 Hosted Auth

- [ ] E-Mail-/Passwort-Registrierung, Bestätigung, Recovery und erneuten Login hosted abnehmen.
- [ ] SMTP-Zustellung und Templates secretsfrei prüfen.
- [ ] Leaked-Password-Protection nach verfügbarer Tarif-/Projektfreigabe aktivieren.
- [ ] Google und Magic Link separat abnehmen oder weiterhin deaktiviert lassen.

## P2.2 Account-Lifecycle

- [ ] Portabilitätsexport serverseitig vom Art.-15-Auskunftspaket trennen.
- [ ] Reauth-Tickets für Export und Löschung implementieren.
- [ ] Account-Löschung idempotent über Storage, Exportpayloads, Produktdaten und Auth-Nutzer ausführen.
- [ ] Teilerfolg, Retry und Auditnachweis testen.
- [ ] UI mit klarer Warnung und Statusverfolgung ergänzen.

## P2.3 Monitoring und Wiederherstellung

- [ ] Minimalen Betriebsüberblick für Vercel, Supabase Auth/DB/Storage und KI-Route definieren.
- [ ] Fehlerbudgets und Alarmgrenzen nur für Kernflows festlegen.
- [ ] DB-Restore und Storage-Restore getrennt in einem Testprojekt prüfen.
- [ ] Einen Supportweg für Datenverlust-, Login- und Sync-Probleme schaffen.

## P2.4 Storage-Hygiene

- [ ] Read-only Orphan-Report für DB-Referenzen und Storage-Objekte bauen.
- [ ] Löschung erst nach Dry-Run, Aufbewahrungsfenster und expliziter Adminfreigabe erlauben.
- [ ] Fehlende und verwaiste Objekte getrennt behandeln.
- [ ] Kernimport nicht von einem umfassenden Admin-Dashboard abhängig machen.

## P2.5 Großdatei-Pfad

- [ ] Nutzungsbedarf für APKG-Dateien über 250 MiB erheben.
- [ ] Hosted-Ressourcen, Region, Verträge und reale Speicher-/Laufzeitmessung abnehmen.
- [ ] Den 1-GiB-Pfad nur bei vertretbarem Nutzen, Kosten- und Supportaufwand freigeben.
- [ ] Andernfalls den Pfad deaktiviert lassen und die Grenze verständlich anzeigen.

# P3 — Feature-Graduation

Graduationsgate für jedes Labs-Feature:

- [ ] Nutzerproblem und Zielgruppe dokumentiert.
- [ ] Mindestens drei qualitative Nutzertests durchgeführt.
- [ ] Erfolgskriterium und Kill-Kriterium definiert.
- [ ] Daten-, Rechte-, Datenschutz- und Fehlervertrag vollständig.
- [ ] Hosted-End-to-End-Pfad vorhanden.
- [ ] Kern- und Fehlerflows zugänglich.
- [ ] Betrieb, Kosten und Supportaufwand bekannt.
- [ ] Produkt-, Contract- und E2E-Tests vorhanden.
- [ ] Dokumentation, ADR und Reifestatus aktualisiert.

Kandidaten:

- [ ] Community.
- [ ] Deck-Graph.
- [ ] Externe KI-Kartenerstellung.
- [ ] Externe Variantengenerierung.
- [ ] Lernplan.
- [ ] AI-Job-Historie.
- [ ] DOCX/OCR/Bildregionen.
- [ ] PWA/Offline-Kaltstart.
- [ ] Push-Benachrichtigungen.
- [ ] Großdatei-APKG.

# Geparkt

Diese Themen werden nur durch ein ausdrücklich dokumentiertes Produktproblem aktiviert:

- Öffentliche Community und Rankings.
- Fremde Lernstände oder soziale Leistungsmetriken.
- Generische Backend-, Auth- oder LLM-Adapter.
- Mehrere KI-Provider.
- Vollständiges Admin-Portal.
- Zahlungen und Abonnements.
- Native Apps.
- Öffentliche Deck-Marktplätze.
- KI-Bildvariation.
- Breiter OCR-/Dokumenten-Worker.
- Rust/WASM ohne gemessenen Hotspot.

## Nachweisformat

Nach Abschluss wird das Paket aus dieser Datei entfernt und datiert nach [`history.md`](history.md) übertragen.

```text
Paket:
Produktvertrag:
Geänderte sichtbare Abläufe:
Bewusst nicht geändert:
Automatisierte Evidenz:
Manuelle UX-Abnahme:
Zielviewports:
Accessibility:
Offene Risiken:
Dokumentationsänderung:
Entscheidung/ADR:
```
