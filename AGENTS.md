# AGENTS.md

## Local Development

- Use `npm run dev` for local hosting.
- The local default URL is `http://127.0.0.1:5190/`.
- Use port `5190` unless the user explicitly requests a different port.

## Architecture

- Keep app logic behind small, testable module interfaces.
- Prefer deep modules: hide data shaping and fallback behavior inside the module instead of spreading it through React callers.
- Do not introduce a seam or adapter unless there are at least two real adapters.

## Verification

- Run `npm test` and `npm run build` before handing off changes.
