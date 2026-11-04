---
name: close-thread
description: Prüft vor dem Archivieren eines Threads kurz, ob Arbeit, Fragen oder Wissen offen sind, räumt sicher Erledigtes auf und archiviert den Thread, wenn nichts offen ist. Verwenden, wenn der Nutzer einen Thread abschließen, aufräumen oder archivieren will.
---

# Close Thread

Ziel: Nichts geht verloren, und der Thread verschwindet danach aus dem Blickfeld.

## 1. Kurz prüfen

- **Thread:** Sind Fragen des Nutzers unbeantwortet? Sind Vorschläge oder Rückfragen von dir offen geblieben?
- **Wissen:** Stehen Entscheidungen, Erkenntnisse oder Vorlieben nur in diesem Thread und weder in Memory, `docs/` noch in einem Commit?
- **Git:** `git status --short`, `git log @{u}..HEAD --oneline`, `git worktree list`, `gh pr list --author @me --state open`
- **Laufendes:** Laufen noch verknüpfte Threads oder Sessions, Hintergrundprozesse oder Dev-Server?

## 2. Sicher aufräumen

Entferne nur, was dieser Thread selbst angelegt hat und was nachweislich erledigt ist:
- **Temporäre Dateien:** den Scratch-Ordner dieses Threads und ungetrackte Probe-Dateien, die dieser Thread im Repo angelegt hat. Nenne jede Datei vorher mit Namen.
- **Worktrees:** nur, wenn sie sauber sind, keine ungepushten Commits haben und ihr Branch gemergt oder gepusht ist. In Codex archivierst du Worktrees, die die App angelegt hat, mit `archive_worktree` (wiederherstellbar mit `restore_worktree`). Andere entfernst du mit `git worktree remove <pfad>` ohne `--force`. Branches löschst du nur mit `git branch -d`, nie mit `-D`.
- **Im Zweifel nichts anfassen:** Hast du die Datei nicht selbst angelegt, gehört sie zur Arbeit anderer oder ist ihr Zustand unklar, dann melde sie nur.

## 3. Dich selbst fragen

> Ist noch Arbeit zu erledigen? Sind Fragen offen? Gibt es Inhalte, die beim Archivieren verloren gingen?

## 4. Entscheiden

- **Nein:** Antworte mit einer Zeile wie „Nichts offen, aufgeräumt: …“. Archiviere dann diesen Thread: in Claude Code mit `mcp__ccd_session_mgmt__archive_session`, in Codex mit `set_thread_archived`.
- **Ja:** Liste die offenen Punkte knapp auf, höchstens eine Zeile pro Punkt, und frage den Nutzer, ob du sie erledigen, sichern oder verwerfen sollst. Nicht archivieren.

Committe und pushe nichts ungefragt. Uncommittete oder ungepushte Arbeit löschst du nie.
