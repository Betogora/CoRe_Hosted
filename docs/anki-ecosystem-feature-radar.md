# Anki-Ökosystem- und Feature-Radar für CoRe

**Status:** Recherche-Snapshot und Produkt-Radar\
**Recherche:** 2026-07-10\
**AnkiWeb-Datensatz:** 2026-07-01\
**GitHub-Metadaten:** 2026-07-10\
**Ergänzt:** [`anki-format-analysis.md`](./anki-format-analysis.md) für Dateiformat, APKG, Note/Card, Templates und Medien

## Kurzentscheidung

Anki ist für CoRe die wichtigste Kompatibilitäts- und Reifegradreferenz, aber keine vollständige Produktvorlage. Die offizielle Anwendung zeigt, welche Grundlagen ein belastbares Lernsystem benötigt. Das Add-on-Ökosystem zeigt dagegen, wo Nutzer trotz eines starken Kerns wiederholt zusätzliche Hilfe suchen.

Die wichtigsten Ergebnisse:

1. **Relevante Innovation findet überwiegend außerhalb echter Desktop-Forks statt.** Die meistbeachteten Forks von `ankitects/anki` sind kommentierte Entwicklungszweige, Tracking-Forks oder kleine Experimente. Für die CoRe-Roadmap sind Add-ons, AnkiDroid, AnkiHub, FSRS-Projekte, Import-/Exportbibliotheken und Automatisierungsschnittstellen wesentlich aussagekräftiger.
2. **Die stärksten wiederkehrenden Bedarfssignale sind Motivation und Fortschritt, Medien/TTS/Image Occlusion, FSRS-Workload-Steuerung, Import und externe Integration, Power-User-Suche/Bulk-Editing, Zusammenarbeit/Deck-Versionierung, KI-Unterstützung sowie UI-/Eingabeanpassung.**
3. **Popularität ist kein Implementierungsauftrag.** Image Occlusion ist das beste Gegenbeispiel: Das frühere Add-on ist extrem beliebt, die Funktion ist inzwischen aber nativ in Anki. CoRe soll daher das zugrunde liegende Nutzerproblem übernehmen, nicht zwangsläufig das Add-on oder dessen Bedienmodell.
4. **P0 für CoRe bleiben Datenvertrauen, sicherer Import, belastbarer Sync/Restore, Scheduler- und Workload-Korrektheit, Suche/Bulk-Verwaltung, mobile/offline Nutzbarkeit und Performance mit großen Bibliotheken.**
5. **P1 sind Image Occlusion mit sauberem Medienmodell, Audio/TTS, kollaborative Deck-Versionierung, quellengebundene KI-Hilfen, Migrationspfade aus weiteren Systemen und eine sichere Automatisierungsschnittstelle.**
6. **Nicht übernehmen:** beliebige Anki-Add-on-Ausführung, öffentliche Leistungsrankings als Standard, ungeprüfte KI-Autoänderungen, unsichere Template-Ausführung und ein historischer Zoo aus Scheduler- oder Deck-Optionen.

## Methodik und Grenzen

Es gibt keine einzelne verlässliche Rangliste der „beliebtesten Anki-Plugins“. Die öffentliche AnkiWeb-Ansicht liefert keine transparenten aktiven Installationszahlen. Deshalb kombiniert dieser Radar mehrere Signale.

| Signal | Aussagekraft | Grenze |
|---|---|---|
| [Offizielles Anki-Repository](https://github.com/ankitects/anki), [Handbuch](https://docs.ankiweb.net/) und [Releases](https://github.com/ankitects/anki/releases) | Höchste Autorität für den aktuellen Kern, Sicherheitsänderungen und native Funktionen | Zeigt nicht automatisch, welche Lücken Nutzer subjektiv am stärksten empfinden |
| [AnkiWeb Add-ons](https://ankiweb.net/shared/addons) | Primärer Katalog; Likes/Dislikes zeigen langjährige Nutzernachfrage | Keine verlässlichen Installationszahlen; alte Add-ons bleiben sichtbar, obwohl Funktionen inzwischen nativ oder technisch überholt sein können |
| [Monatlicher Anki-Add-ons-Datensatz](https://huggingface.co/datasets/Ya-Alex/anki-addons) und [Methodik](https://forums.ankiweb.net/t/anki-addons-dataset-a-detailed-list-of-addons/63090) | Verknüpft AnkiWeb-Bewertungen, Update-Daten, GitHub-Sterne, letzte Commits, Tests und Forum-Threads; Stand 2026-07-01: 3.071 Einträge | Community-Datensatz; Verknüpfungen zu GitHub können auf Abhängigkeiten statt auf den Add-on-Code zeigen und müssen manuell plausibilisiert werden |
| GitHub-Sterne, Forks und letzter Push | Entwicklerinteresse, Wiederverwendung und Wartungsaktivität | Sterne sind keine Nutzerzahl; kommerzielle oder nur auf AnkiWeb veröffentlichte Add-ons werden unterschätzt |
| [Awesome Add-ons im Anki-Forum](https://forums.ankiweb.net/t/awesome-add-ons/54116) und [awesome-anki](https://github.com/tianshanghong/awesome-anki) | Kategorisierte Entdeckung, wiederkehrende Community-Empfehlungen | Kuratiert und damit subjektiv; Kompatibilität kann trotz Pflegehinweis veralten |
| [AnKing Add-on-Liste](https://www.theanking.com/best-add-ons), Anki-Foren und aktuelle Community-Threads | Starkes Praxis- und Power-User-Signal, besonders für Medizin | Domänen- und Geschäftsmodellbias; Empfehlungen sind nicht automatisch allgemein gültig |

Die Popularitätstabelle unten ist deshalb **ein Bedarfssignal**, keine Bestenliste. Für CoRe zählt die Kombination aus wiederkehrendem Problem, Aktualität, fachlicher Passung, Sicherheit und vorhandener Produktarchitektur.

## Maßgebliche Ressourcen

### Offizieller Kern und Clients

| Ressource | Snapshot | Warum sie beobachtet werden muss |
|---|---:|---|
| [`ankitects/anki`](https://github.com/ankitects/anki) | 29.049 Sterne, 3.094 Forks; Push 2026-07-10 | Kanonischer Desktop-Kern, Scheduler, Sync-Protokoll, Import/Export, Rendering, Rust-/Python-/Svelte-/TypeScript-Architektur und Sicherheitsfixes |
| [`ankitects/anki-manual`](https://github.com/ankitects/anki-manual) / [Online-Handbuch](https://docs.ankiweb.net/) | 691 Sterne; Push 2026-07-07 | Aktuelle Produktsemantik für FSRS, Deck-Optionen, Suche, Statistiken, Sync, Backup, Import/Export, Add-ons und Self-Hosting |
| [`ankidroid/Anki-Android`](https://github.com/ankidroid/Anki-Android) | 11.363 Sterne; Push 2026-07-10 | Wichtigste offene Mobilreferenz; Offline-first, Synchronisation, mobile Review-Ergonomie, Barrierefreiheit und große lokale Collections |
| [AnkiMobile und AnkiWeb](https://apps.ankiweb.net/) | Offizielle iOS- und Webpfade | Referenz für Gerätewechsel, Online-Review, Medien-Sync und plattformübergreifende Erwartungskonsistenz |
| [Self-Hosted Sync Server](https://docs.ankiweb.net/sync-server.html) | Seit Anki 2.1.57+ im Desktop-Paket; Python- und Rust-Pfade dokumentiert | Zeigt den Wert eines klaren, versionierten Sync-Vertrags und die Risiken inkompatibler Drittserver |

### Scheduler, Add-ons und Integrationen

| Ressource | Snapshot | Feature-Signal für CoRe |
|---|---:|---|
| [`open-spaced-repetition/fsrs4anki`](https://github.com/open-spaced-repetition/fsrs4anki) | 4.009 Sterne; Push 2026-03-20 | Messbarer, datenbasierter Scheduler, Desired Retention, Parameteroptimierung und Evaluationskultur |
| [`open-spaced-repetition/fsrs4anki-helper`](https://github.com/open-spaced-repetition/fsrs4anki-helper) / [AnkiWeb](https://ankiweb.net/shared/info/759844606) | 316 Sterne; Push 2026-06-12 | Postpone, Advance, Urlaubsplanung, Load Balancing, Easy Days, Geschwisterverteilung und Backlog-Glättung |
| [`glutanimate/review-heatmap`](https://github.com/glutanimate/review-heatmap) / [AnkiWeb](https://ankiweb.net/shared/info/1771074083) | 1.307 Sterne; 2.194 Likes | Motivation durch langfristige Aktivität, Streaks, Fälligkeitsvorschau und Drill-down von Tagen in konkrete Karten |
| [`FooSoft/anki-connect`](https://github.com/FooSoft/anki-connect) / [AnkiWeb](https://ankiweb.net/shared/info/2055492159) | GitHub-Mirror archiviert; 2.073 Sterne; AnkiWeb-Update 2025-11-09 | Externe Abfrage, Suche und Kartenerstellung über eine einfache API; Beleg für starken Automatisierungsbedarf |
| [`kerrickstaley/genanki`](https://github.com/kerrickstaley/genanki) | 2.645 Sterne | Programmgesteuerte Deck-/APKG-Erstellung und ein stabiles externes Austauschmodell |
| [`ObsidianToAnki/Obsidian_to_Anki`](https://github.com/ObsidianToAnki/Obsidian_to_Anki) | 2.012 Sterne | Notizen-zu-Karten-Pipelines, Markdown, Quellennähe und inkrementelle Aktualisierung |
| [`Stvad/CrowdAnki`](https://github.com/Stvad/CrowdAnki) | 637 Sterne; Push 2026-06-23 | JSON-basierte Deck-Zusammenarbeit, Versionshistorie und Trennung von Inhalt und persönlichem Lernstand |
| [AnkiHub](https://www.ankihub.net/) / [`AnkiHubSoftware/ankihub_addon`](https://github.com/AnkiHubSoftware/ankihub_addon) | Push 2026-07-06 | Abonnements, Vorschläge, Freigaben, laufende Deck-Updates, private Decks, optionale Tags und KI-gestützte Suche/Fragen |
| [AnkiCollab](https://ankiweb.net/shared/info/1957538407) | 194 Likes; Update 2026-05-27 | Kostenloses Kollaborationssignal neben AnkiHub; zeigt, dass Zusammenarbeit kein rein medizinisches Premiumproblem ist |
| [`thiswillbeyourgithub/AnkiAIUtils`](https://github.com/thiswillbeyourgithub/AnkiAIUtils) | 868 Sterne; Push 2026-06-01 | KI-Erklärungen, Merkhilfen, Illustrationen und adaptive Verarbeitung vorhandener Karten |
| [`ankimcp/anki-mcp-server`](https://github.com/ankimcp/anki-mcp-server) | 370 Sterne; Push 2026-07-04 | Aktuelles Signal für sichere, werkzeugfähige KI-/MCP-Interaktion mit einer Lernbibliothek |
| [`Vocab-Apps/anki-hyper-tts`](https://github.com/Vocab-Apps/anki-hyper-tts) / [AnkiWeb](https://ankiweb.net/shared/info/111623432) | 272 Sterne; 610 Likes; Update 2026-06-29 | TTS-Anbieter, Batch-Audio, Aussprache, Caching, Kosten- und Providerverwaltung |
| [`Unlucky-Life/ankimon`](https://github.com/Unlucky-Life/ankimon) | 281 Sterne; 1.954 Likes | Sehr starkes Signal für optionale Motivation und sichtbare Progression; kein Argument für verpflichtende Gamification |
| [`roxgib/anki-contanki`](https://github.com/roxgib/anki-contanki) | 70 Sterne; 214 Likes | Controller, alternative Eingaben und ergonomisches Lernen ohne Maus |
| [`tianshanghong/awesome-anki`](https://github.com/tianshanghong/awesome-anki) | 2.054 Sterne; Push 2026-01-02 | Breite Entdeckungsliste für Add-ons, Decks, Tools und Lernressourcen; gut als Radar, nicht als Qualitätsgarantie |

GitHub-Zahlen sind Momentaufnahmen der REST-API vom 2026-07-10 und werden nicht als dauerhaft stabile Kennzahlen behandelt.

## Fork-Landschaft

Die GitHub-Forkliste von `ankitects/anki`, am 2026-07-10 nach Sternen sortiert, zeigt keinen großen, dauerhaft eigenständigen Produktfork:

| Fork | Sterne | Einordnung |
|---|---:|---|
| [`Arthur-Milchior/anki`](https://github.com/Arthur-Milchior/anki) | 81 | Kommentierter Entwicklungszweig; nützlich zum Verständnis des Codes, kein maßgebliches Konkurrenzprodukt |
| [`ankidroid/anki`](https://github.com/ankidroid/anki) | 12 | Archivierter Tracking-Fork für AnkiDroid-Bundling |
| [`ankicommunity/anki-desktop`](https://github.com/ankicommunity/anki-desktop) | 10 | Community-/Tracking-Fork ohne starkes eigenständiges Produktsignal |
| [`glutanimate/anki`](https://github.com/glutanimate/anki) | 7 | Entwicklerfork eines prominenten Add-on-Autors |

**Folgerung:** Forks bleiben für einzelne Patches, Kommentare und Upstream-Experimente interessant. Für Produktfeatures soll CoRe primär offizielle Releases, AnkiDroid, Add-ons, Integrationsbibliotheken und kollaborative Dienste beobachten.

## Popularitäts-Snapshot der Add-ons

Quelle ist der [Anki-Add-ons-Datensatz](https://huggingface.co/datasets/Ya-Alex/anki-addons), Snapshot 2026-07-01. Sortiert wurde nach **AnkiWeb-Likes**, nicht nach der im Datensatz als `rating` bezeichneten Gesamtzahl aus Likes und Dislikes. Die Aktualisierungsdaten stammen ebenfalls aus AnkiWeb.

| Rang | Add-on | Likes / Dislikes | Letztes AnkiWeb-Update | Bedarfssignal | CoRe-Entscheidung |
|---:|---|---:|---:|---|---|
| 1 | [Review Heatmap](https://ankiweb.net/shared/info/1771074083) | 2.194 / 39 | 2022-06-30 | Fortschritt, Streak, Fälligkeitsvorschau, Tages-Drill-down | Bestehende CoRe-Heatmap behalten; Drill-down und Workload-Vorschau ergänzen |
| 2 | [Ankimon](https://ankiweb.net/shared/info/1908235722) | 1.954 / 33 | 2024-05-16 | Gamification, Sammeln, sichtbare Langzeitprogression | Nur opt-in und persönlich; Kernreview nicht von Belohnungen abhängig machen |
| 3 | [Image Occlusion Enhanced](https://ankiweb.net/shared/info/1374772155) | 924 / 78 | 2022-04-09 | Visuelles Lernen, Anatomie, Diagramme | Als eigenes Medien-/Regionenmodell P1; nicht das alte Add-on nachbauen |
| 4 | [AwesomeTTS](https://ankiweb.net/shared/info/1436550454) | 855 / 70 | 2025-08-16 | Aussprache, Barrierefreiheit, Batch-Audio | Serverseitige oder lokale TTS-Pipeline mit gecachten Medien und klaren Kosten-/Lizenzregeln |
| 5 | [HyperTTS](https://ankiweb.net/shared/info/111623432) | 610 / 53 | 2026-06-29 | Mehrere TTS-Anbieter, Sprachprofile, Batch-Erzeugung | P1 nach produktivem Medienmodell; Provider-Secrets ausschließlich serverseitig |
| 6 | [AnkiBrain](https://ankiweb.net/shared/info/1915225457) | 532 / 32 | 2025-05-25 | Dokumentanalyse, automatische Karten, Erklärungen | Quellengebundene Drafts und Review-Gate stärken; keine ungeprüften Autoänderungen |
| 7 | [AnkiConnect](https://ankiweb.net/shared/info/2055492159) | 423 / 43 | 2025-11-09 | Automatisierung und externe Tools | Authentifizierte, versionierte CoRe-API/MCP später bereitstellen; keine offene lokale Universal-API kopieren |
| 8 | [Onigiri](https://ankiweb.net/shared/info/1011095603) | 383 / 11 | 2026-01-29 | Moderne Oberfläche, Dashboard-Widgets, visuelle Kontrolle | CoRe-UI weiter ruhig und modern halten; begrenzte Themes/Dichte statt beliebiger Skin-Engine |
| 9 | [Custom Background Image and Gear Icon](https://ankiweb.net/shared/info/1210908941) | 370 / 39 | 2025-12-17 | Personalisierung und emotionale Bindung | P2; zugängliche Themes und Stapelidentität vor freien Hintergründen |
| 10 | [Quizlet to Anki Importer](https://ankiweb.net/shared/info/1362209126) | 339 / 97 | 2026-06-08 | Wechselkosten, Audioübernahme, Migration | Nach APKG weitere Importquellen über dieselbe Creation Pipeline hinzufügen |
| 11 | [Anki Leaderboard](https://ankiweb.net/shared/info/175794613) | 323 / 15 | 2026-06-04 | Soziale Motivation und Wettbewerb | Kein öffentliches Leistungsranking im MVP; später höchstens freiwillige, klar begrenzte Gruppenmechanik |
| 12 | [FSRS Helper](https://ankiweb.net/shared/info/759844606) | 311 / 12 | 2026-05-14 | Urlaub, Rückstand, gleichmäßige Last, Geschwisterabstand | Höchste strategische Relevanz: CoRe-Lernplan um echte Workload-Operationen erweitern |
| 13 | [AnkiHub](https://ankiweb.net/shared/info/1322529746) | 311 / 81 | 2026-06-03 | Kollaboration, abonnierte Updates, Vorschläge, private Decks | P1 nach Membership-RLS, Moderation und strikter Trennung von Inhalt und privatem Lernstand |
| 14 | [Speed Focus Mode](https://ankiweb.net/shared/info/1046608507) | 292 / 17 | 2022-12-16 | Auto-Reveal, Auto-Answer, Zeitfokus | Optionaler Auto-Advance/Timer; Anki hat Auto Advance inzwischen nativ |
| 15 | [Advanced Browser](https://ankiweb.net/shared/info/874215009) | 278 / 21 | 2024-10-27 | Spalten, Sortierung, Suche, Bulk-Verwaltung | P0/P1: leistungsfähige Suche, gespeicherte Filter und Bulk-Aktionen ohne UI-Überladung |

Weitere wiederkehrende Signale knapp unterhalb dieser Liste sind [Batch Editing](https://ankiweb.net/shared/info/291119185), [Advanced Review Bottom Bar](https://ankiweb.net/shared/info/1136455830), [AnkiCollab](https://ankiweb.net/shared/info/1957538407), [More Overview Stats](https://ankiweb.net/shared/info/738807903), Editieren während des Reviews, Fortschrittsbalken, verbleibende Lernzeit, Wörterbuch-/Furigana-Hilfen und Medienerfassung aus Webseiten oder Videos.

## Feature-Radar für CoRe

### P0 — Produktvertrauen und täglicher Kern

| Feature-Cluster | Evidenz aus Anki/Ökosystem | CoRe-Stand | Entscheidung und Abnahmekriterium |
|---|---|---|---|
| Learning Item, Original und reviewbare Varianten | Ankis Note/Card-/Sibling-Trennung; Cloze und Reverse erzeugen mehrere Cards | Weitgehend vorhanden | Invariante beibehalten: genau ein Original, jede Variante mit eigenem State, Geschwister im Review nicht direkt hintereinander zeigen |
| Scheduler-Korrektheit und Desired Retention | [FSRS im Handbuch](https://docs.ankiweb.net/deck-options.html#fsrs), FSRS4Anki, per-Deck Desired Retention in Anki 25.09 | FSRS-like vorhanden | Mit echten Reviewhistorien kalibrieren; Desired Retention pro sinnvoller Ebene, nachvollziehbare Prognosen und keine stillen State-Sprünge |
| Workload, Rückstand und freie Tage | FSRS Helper; Anki Easy Days; Filtered Decks; Review-Sortierung nach relativer Überfälligkeit | Lernplan teilweise vorhanden | Planbare Pause, Advance/Postpone, Backlog-Abbau, Tageslastprognose und Geschwisterverteilung als tiefe Planungslogik, nicht als manuelles Fälligkeits-Chaos |
| Suche, Filter und Sammlungspflege | [Anki-Suchsprache](https://docs.ankiweb.net/searching.html), Filtered Decks, Advanced Browser, Batch Editing | Basissuche vorhanden | Suchbare Felder, Tags, Deckbaum, Status, Fälligkeit, Schwierigkeit, Quelle und Varianten; gespeicherte Filter und sichere Bulk-Aktionen |
| Sync, Offline, Konflikte und Restore | [Anki Sync](https://docs.ankiweb.net/syncing.html), [Backups](https://docs.ankiweb.net/backups.html), AnkiDroid | Cloud-first Autosave vorhanden; Offline-Konfliktlösung und Restore fehlen | Review-Events und Inhaltsänderungen deterministisch mergen, Konflikte sichtbar machen, Medien separat synchronisieren, Wiederherstellung testbar anbieten |
| Sicherer Import und Export | APKG/colpkg, Quizlet-Importer, genanki; Anki 25.09.4 schloss einen lokalen Dateizugriff durch untrusted APKG | APKG-Import stark; APKG-/colpkg-Export fehlt | Import als untrusted content behandeln: sichere Pfade, Größenlimits, Sanitization, kein Template-JS, keine lokalen Dateireferenzen; portabler Export mit Medien und Identitäten |
| Große Bibliotheken und responsive Review-Performance | Anki bewirbt Collections mit 100.000+ Karten; AnkiDroid arbeitet offline auf Mobilgeräten | Nicht systematisch benchmarkiert | Messbare Budgets für 10k/100k Learning Items, Queue-Aufbau, Suche, Dashboard, Medien und Sync; keine UI-Blockade bei Import oder Projektion |
| Sicherheits- und Datenschutzgrenzen | Add-ons dürfen laut [Anki-Handbuch](https://docs.ankiweb.net/addons.html) beliebige Teile verändern und können nach Updates brechen; aktuelle APKG-/Medien-Sicherheitsreleases | Gute HTML- und Secret-Grenzen vorhanden | Provider-Schlüssel serverseitig, untrusted Medien/Templates isolieren, keine beliebige Plugin-Ausführung, Sharing niemals mit fremden Reviewdaten koppeln |

### P1 — Strategische Differenzierung und starke Nachfrage

| Feature-Cluster | Evidenz | CoRe-Stand | Entscheidung und Abnahmekriterium |
|---|---|---|---|
| Aktivitäts- und Workload-Drill-down | Review Heatmap, Anki-Statistiken mit Stability/Difficulty/Retrievability | Heatmap und Statistik vorhanden | Klick auf Tag/Woche öffnet zugehörige Reviews/Fälligkeiten; Zukunftslast und Ursachen erklären; keine bloße Vanity-Metrik |
| Review-Ergonomie | Auto Advance, Timer, Advanced Review Bottom Bar, verbleibende Zeit, Keyboard-/Controller-Add-ons | Vier Ratings, Intervalle und Tastatur vorhanden | Optionaler Timer/Auto-Advance, Sitzungsfortschritt, belastbare Restzeit und vollständige Keyboard-Bedienung; Standardansicht ruhig halten |
| Image Occlusion | Früher starkes Add-on, seit Anki 23.10 nativ | Bewusst verschoben | Bildregionen als strukturierte Varianten, Editierbarkeit, Hide-all/Guess-one und Hide-one/Guess-one; erst nach produktivem Medienmodell |
| Audio, TTS und Aussprache | AwesomeTTS, HyperTTS, Japanese Support, Movies2Anki | Medienimport lokal; keine TTS-Pipeline | Audio als dedupliziertes Asset, Batch-Vorschau, Sprach-/Stimmenprofil, Kostenkontrolle, Rechtehinweis und barrierefreie Wiedergabe |
| Quellengebundene KI-Unterstützung | AnkiBrain, AnkiAIUtils, AnkiHub Smart Search/Chat, aktuelle MCP-Projekte | KI-Drafts und Chat-your-Deck teilweise vorhanden | Draft-Review, Quellenzitate, Versionslog, reproduzierbare Prompts/Modelldaten ohne Secrets, Erklärung und Merkhilfe als Varianten statt stiller Originalüberschreibung |
| Kollaborative Deck-Versionierung | AnkiHub, AnkiCollab, CrowdAnki, Ultimate Geography | Lokale Community-Basis vorhanden | Abonnieren, Vorschlagen, Prüfen, Freigeben, Versionen und selektive Updates; lokale Edits konfliktfest erhalten; private Lernstände strikt getrennt |
| Weitere Migrationspfade | Quizlet-Importer, Copycat Importer, CSV/Markdown/Obsidian, genanki | Text/CSV/JSON/Excel/APKG vorhanden | Quellenadapter erst bei realem zweiten Format; alle Pfade durch `coreModel`/Creation Pipeline, mit Importbericht, Identität und Dedupe |
| Externe Automatisierung | AnkiConnect, genanki, MCP-Server | Fehlt | Kleine authentifizierte, versionierte API für Suche, Draft-Erstellung, Importstatus und sichere Exporte; Scopes, Rate Limits und Audit-Events |
| Mobile/offline Bedienung und Barrierefreiheit | AnkiDroid, AnkiMobile, Contanki, Shortcut-Add-ons | Responsive Web-App teilweise vorhanden | Touch-Ziele, Screenreader, Kontrast, reduzierte Bewegung, reine Tastatur, installierbare/offlinefähige Review-Sitzung und konfliktfester späterer Sync |

### P2 — Beobachten oder optional anbieten

| Feature-Cluster | Bedarfssignal | Entscheidung |
|---|---|---|
| Persönliche Gamification | Ankimon, Killstreaks, Progress Bars, Life Drain | Nur opt-in, privat und abschaltbar; bevorzugt Mastery/Consistency statt künstlicher Verlustmechanik |
| Soziale Motivation | Leaderboard, Discord-Status, Gruppen | Keine öffentlichen Lernleistungsrankings im MVP; später freiwillige Gruppen-Challenges ohne Offenlegung privater Reviewdaten |
| Themes und Dashboard-Widgets | Onigiri, ReColor, Custom Background, Deck Icons | Begrenzte Design Tokens, Dichte, Dark Mode und Stapelidentität; keine beliebige CSS-/JS-Ausführung |
| Domänenspezifische Werkzeuge | Furigana, Kanji Grid, Wörterbücher, medizinische Tags, UWorld-Verknüpfungen | Als spätere Integrationen oder Content-Packs, nicht als Kern des Learning-Item-Modells |
| Allgemeines Plugin-SDK | Ankis sehr großes Add-on-Ökosystem | Noch nicht bauen. Erst stabile interne Modulgrenzen und mindestens zwei echte externe Integrationen; danach Capability-/Permission-Modell statt Vollzugriff |
| Vollständige Anki-Template-Kompatibilität | Viele Decks und Add-ons hängen an HTML/CSS/JS | Snapshots konservieren, sichere Teilmenge rendern, unsichere Logik nicht ausführen |

## Konkrete nächste Arbeitspakete aus dem Radar

Diese Reihenfolge ist eine Produktpriorisierung, noch keine zusätzliche TODO-Liste. Verbindliche offene Arbeit bleibt ausschließlich in [`todo.md`](./todo.md).

1. **Sync-/Restore-Vertrauenspaket:** Offline-Queue, Konfliktregeln, Medien-Sync, sichtbarer Sync-Status, automatische und manuelle Wiederherstellung, Disaster-Recovery-Test.
2. **Scheduler-/Workload-Paket:** FSRS-Validierung mit realen Historien, Tageslastprognose, Urlaub/Pause, Backlog-Abbau, Advance/Postpone, Easy Days und Geschwisterverteilung.
3. **Power-User-Verwaltung:** einheitliches Suchmodell, gespeicherte Filter, Bulk-Tags/Move/Suspend/Delete mit Vorschau und Undo sowie Tages-/Review-Drill-down aus Statistik und Heatmap.
4. **Import-/Export-Sicherheit:** APKG-Fuzzing und Größenlimits, untrusted Template-/Medienprüfung, weitere Fixtures, portabler Export und überprüfbare Reimport-/Restore-Roundtrips.
5. **Produktives Medienmodell:** Object Storage, Checksums, MIME-Typen, Rechte, Garbage Collection und stabile URLs als Voraussetzung für Image Occlusion und TTS.
6. **Kollaboration mit Trust:** Deck-Versionen, Vorschläge, Freigaben, Abonnements und Merge-Regeln, erst nachdem Membership-RLS und Moderation belastbar sind.
7. **Sichere Integrationsoberfläche:** schmale API/MCP-Funktionen für Suche, Drafts, Import und Export; OAuth/Scopes, Auditierbarkeit und Rate Limits vor einem Plugin-SDK.
8. **Performance- und Mobile-Gate:** Benchmarks für 10k/100k Items, mobile Review-Smokes, Offline-Sitzung, Accessibility-Checks und keine Main-Thread-Blockade bei großen Imports.

## Architekturleitplanken

- Ein Add-on ist zuerst **Beleg für ein Nutzerproblem**, nicht automatisch ein Modul, das kopiert werden soll.
- Native Anki-Funktionen haben Vorrang vor veralteten Add-on-Implementierungen als Referenz. Das gilt besonders für FSRS, Image Occlusion, Auto Advance, Easy Days und den Self-Hosted Sync Server.
- CoRe behält seine tieferen Domänenmodule: Scheduler, Import, Medien, Varianten, Community, KI-Jobs und Repository-Verhalten werden nicht in React-Caller verteilt.
- Ein allgemeiner Adapter oder ein Plugin-SDK entsteht erst, wenn mindestens zwei reale Integrationen denselben stabilen Vertrag benötigen.
- Review-Events, persönlicher Scheduler-State und Qualitätsurteile bleiben privat. Teilbare Deckinhalte und Varianten werden separat versioniert.
- KI darf Originale nicht still überschreiben. Erklärungen, Merkhilfen, Rephrases und generierte Medien durchlaufen Draft-/Review-/Versionierungsgrenzen.
- APKG, HTML, Medien und Drittanbieter-Decks sind untrusted input. Der Sicherheitsfix in Anki 25.09.4 zeigt, dass selbst etablierte Importpfade lokale Dateigrenzen verletzen können.
- Popularität rechtfertigt keine manipulative oder ablenkende Oberfläche. Der tägliche Review bleibt schnell, ruhig, tastaturfähig und nachvollziehbar.

## Quellenverzeichnis

### Primärquellen

- [Anki Desktop Repository](https://github.com/ankitects/anki)
- [Anki Releases](https://github.com/ankitects/anki/releases)
- [Anki Manual](https://docs.ankiweb.net/)
- [Deck Options und FSRS](https://docs.ankiweb.net/deck-options.html)
- [Studying, Siblings und Burying](https://docs.ankiweb.net/studying.html)
- [Searching](https://docs.ankiweb.net/searching.html)
- [Card Info, Graphs and Statistics](https://docs.ankiweb.net/stats.html)
- [Image Occlusion und Cloze](https://docs.ankiweb.net/editing.html#image-occlusion)
- [Syncing with AnkiWeb](https://docs.ankiweb.net/syncing.html)
- [Backups](https://docs.ankiweb.net/backups.html)
- [Self-Hosted Sync Server](https://docs.ankiweb.net/sync-server.html)
- [Add-ons und Kompatibilitätsrisiken](https://docs.ankiweb.net/addons.html)
- [Writing Anki Add-ons](https://addon-docs.ankiweb.net/)
- [AnkiDroid](https://github.com/ankidroid/Anki-Android)

### Entdeckungs- und Popularitätsquellen

- [AnkiWeb Shared Add-ons](https://ankiweb.net/shared/addons)
- [Anki-Add-ons-Datensatz auf Hugging Face](https://huggingface.co/datasets/Ya-Alex/anki-addons)
- [Datensatz-Methodik und monatliche Snapshots](https://forums.ankiweb.net/t/anki-addons-dataset-a-detailed-list-of-addons/63090)
- [Datensatz-Generator](https://github.com/Aleks-Ya/anki-addons-dataset)
- [Awesome Add-ons im Anki-Forum](https://forums.ankiweb.net/t/awesome-add-ons/54116)
- [awesome-anki auf GitHub](https://github.com/tianshanghong/awesome-anki)
- [AnKing Best Add-ons](https://www.theanking.com/best-add-ons)
- [Anki Add-on Forum](https://forums.ankiweb.net/c/anki/add-ons/11)
- [AnkiHub](https://www.ankihub.net/)

## Aktualisierungsroutine

Der Radar sollte quartalsweise und vor größeren Scheduler-, Import-, Medien-, Community- oder KI-Entscheidungen aktualisiert werden:

1. Neue stabile Anki-Releases und Sicherheitsmeldungen prüfen.
2. Änderungen in Handbuchkapiteln zu FSRS, Sync, Import/Export, Suche, Statistik, Image Occlusion und Add-ons prüfen.
3. Neuesten monatlichen Add-ons-Datensatz nach Likes, Aktualität, GitHub-Aktivität und Tests auswerten.
4. `awesome-anki`, den Awesome-Add-ons-Forumspost und aktive Support-Threads auf neue wiederkehrende Kategorien prüfen.
5. GitHub-Sterne nur als sekundäres Signal aktualisieren; archivierte Mirrors, Abhängigkeiten und echte Projektaktivität manuell unterscheiden.
6. Jede neue Feature-Idee gegen CoRes vorhandenes Modell, Datenschutzgrenzen, Sicherheitsrisiko und messbaren Lernnutzen bewerten.
