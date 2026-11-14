<!-- Visitenkarte des Repositorys: Zweck, Wegweiser und Startbefehle. Kein Ist-Stand, keine Funktionslisten, keine Anleitungen; die stehen in ihren Quellen unter docs/ oder in den Werkzeugen selbst. -->
<p align="center">
  <img src=".github/assets/core-readme-hero.svg" alt="CoRe — Content Repetition: Lerne Inhalte, nicht Karten." width="100%">
</p>

<p align="center">
  <a href="https://core-hosted.vercel.app"><img alt="CoRe öffnen" src="https://img.shields.io/badge/CoRe-öffnen-61b6ad?style=for-the-badge&labelColor=17214f"></a>
</p>

<p align="center">
  <strong>CoRe erweitert Spaced Repetition um Content Repetition.</strong><br>
  Derselbe Lerninhalt. Neue Formulierungen, stabilerer Abruf.
</p>

---

## Worum es geht

Klassische Karteikarten werden irgendwann zu vertraut: Man erkennt Layout, Wortlaut oder die Position einer Lücke und verwechselt Wiedererkennen mit Verstehen. CoRe wiederholt deshalb nicht nur zum richtigen Zeitpunkt, sondern wechselt bei gefestigten Karten auch die Formulierung. Die Originalkarte bleibt der Anker; ihre Umformulierungen teilen ihren Lernstand.

CoRe ist eine Web-App für Studierende und Auszubildende mit großen Kartenbeständen. Anki-Stapel lassen sich übernehmen.

## Dokumentation

| Frage | Quelle |
| --- | --- |
| Was soll CoRe tun und warum? | [`docs/specs.md`](docs/specs.md), lesbar unter [`docs/index.html`](docs/index.html) |
| Was ist gebaut, was fehlt? | [`docs/status.md`](docs/status.md) |
| Was kommt als Nächstes? | [`docs/todo.md`](docs/todo.md) |
| Wie ist es gebaut? | [`docs/architecture.md`](docs/architecture.md) |
| Alle Quellen und ihre Pflege | [`docs/README.md`](docs/README.md) |
| Regeln für Coding-Agenten | [`AGENTS.md`](AGENTS.md) |

## Lokal starten

```sh
npm ci
npm run dev        # http://127.0.0.1:5190/
npm run gate:push  # Prüflauf vor dem Push
```

Umgebungsvariablen und Betrieb: [`docs/operations.md`](docs/operations.md).

Gebaut mit React, Vite, Tailwind CSS, Supabase und Vercel.
