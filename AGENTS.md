# AGENTS.md

## Local Development

- Use `npm run dev` for local hosting.
- The local default URL is `http://127.0.0.1:5190/`.
- Use port `5190` unless the user explicitly requests a different port.

## Architecture

- Keep app logic behind small, testable module interfaces.
- Prefer deep modules: hide data shaping and fallback behavior inside the module instead of spreading it through React callers.
- Do not introduce a seam or adapter unless there are at least two real adapters.

## Project Navigation

- Start with `specs.md` before changing features; it contains product scope, acceptance criteria, architecture notes, module map, import rules, assistant/planning context, and current implementation status.
- Use `todo.md` to understand the current gap between local MVP and production-ready product scope.
- `specs.html` is the human-readable visual version of `specs.md` and should carry the same content.
- Current UI screens are in `src/App.jsx`; domain behavior belongs in the smaller modules listed in `specs.md`.
- Add or update module tests in `src/*.test.js` when changing scheduler, variants, import, AI jobs, graph, community, or repository behavior.

## Verification

- Run `npm test` and `npm run build` before handing off changes.
