# Evaluationsfragen für diskutierbare Features

**Rolle:** Arbeitsmaterial für spätere Produktentscheidungen. Dieses Dokument ist weder Roadmap noch ADR und erteilt keine Löschfreigabe.

Verbindliche Entscheidungen stehen ausschließlich in [`decisions.md`](decisions.md), offene Evaluationen in [`todo.md`](todo.md).

## Lokale Community

- Welches konkrete Problem löst die lokale Demo vor echten Mitgliedschaften und Rechten?
- Verstehen Testpersonen die Fläche als Experiment oder erwarten sie eine fertige Online-Community?
- Welche Membership-, RLS-, Datenschutz- und Moderationsverträge wären für eine Graduierung nötig?
- Wird die Fläche genutzt, ohne fremde Lernstände oder soziale Leistungsmetriken einzuführen?

Aktuelle Entscheidung: [ADR-005](decisions.md#adr-005--community-und-graph-bleiben-labs).

## Deck-Graph

- Finden Lernende damit tatsächlich schwache Themen oder starten Lernaktionen?
- Liefert der Graph mehr Orientierung als Statistik, Suche und Stapelhierarchie?
- Welche messbare Nutzung rechtfertigt Layout-, Graph- und UI-Pflege?
- Was wäre das Kill-Kriterium?

Aktuelle Entscheidung: [ADR-005](decisions.md#adr-005--community-und-graph-bleiben-labs).

## AI-Job-Historie

- Brauchen Nutzer eine eigene Historie oder genügt ein verständlicher Status im auslösenden Flow?
- Welche Informationen helfen beim Retry, ohne technische Ledgerdetails offenzulegen?
- Ist ein versteckter Screen wartungswürdig, wenn kein Nutzerziel belegt ist?

## Externer Varianten-JSON-Flow

- Bleibt der Flow ein nützliches Expertenwerkzeug, wenn direkte Generierung denselben Zweck erfüllt?
- Welche Nutzergruppe versteht und benötigt rohe Prompt-/JSON-Interaktion?
- Kann der Flow entfernt werden, ohne eine persistierte oder externe Schnittstelle zu brechen?

## Lokale Auth und Offline-Kaltstart

- Gibt es ein echtes Produktziel für Offline-Login oder nur für Offline-Nutzung nach bestehender Session?
- Wie werden Identität, Cache und Cloud-Sync ohne parallelen Passwort-Verifier sicher getrennt?
- Welche Session-, Ablauf- und Wiederverbindungsgrenzen müssen vor einer neuen Entscheidung geklärt sein?

Aktuelle Entscheidung: [ADR-004](decisions.md#adr-004--lokale-auth-ist-kein-paralleler-loginpfad).

## Demo-Seed

- Hilft die ausdrückliche Demo beim Erstkontakt, ohne einen fremden Accountzustand zu simulieren?
- Wird klar, dass Demo-Reviews keine persönlichen Lernstände sind?
- Braucht die Demo außerhalb Entwicklung, E2E und bewusster Nutzeraktion einen weiteren Einstieg?

Aktuelle Entscheidung: [ADR-003](decisions.md#adr-003--demo-seed-ist-opt-in).

## Datenschutzdarstellung

- Zeigt die UI nur technisch durchgesetzte Freigaben und Grenzen?
- Werden Community- und Serverrechte von lokalen Einstellungen klar getrennt?
- Entsteht an irgendeiner Stelle ein falsches Sicherheitsgefühl durch wirkungslose Schalter?

## Entscheidungsgate

Vor `graduieren`, `weiter als Labs` oder `entfernen` werden Nutzerproblem, Zielgruppe, qualitative Evidenz, Erfolgskriterium, Kill-Kriterium, Daten-/Rechtevertrag, Betrieb und Supportaufwand dokumentiert. Danach wird ein ADR in `decisions.md` ergänzt und die offene Aufgabe aus `todo.md` entfernt beziehungsweise angepasst.
