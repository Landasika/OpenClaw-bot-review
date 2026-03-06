# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains Next.js App Router pages and API endpoints (`app/api/*/route.ts`).
- `lib/` holds shared logic, schedulers, and the Pixel Office engine (`lib/pixel-office/*`).
- `data/` stores local JSON state such as `data/system-config.json` and `data/tasks/tasks.json`.
- `scripts/` contains shell-based integration checks (mostly `curl` + `jq` workflows).
- `public/` serves static assets; `docs/` contains feature documentation and screenshots.

## Build, Test, and Development Commands
- `npm install`: install project dependencies.
- `npm run dev`: start local development server at `http://localhost:3000`.
- `npm run build`: produce production build and validate routes/types.
- `npm start`: run the production server from the built output.
- `bash scripts/test-task-management.sh`: smoke-test task management APIs.
- `bash scripts/test-full-automation.sh`: run end-to-end scheduler/reviewer flow (requires local server and `jq`).

## Coding Style & Naming Conventions
- Use TypeScript-first development; `tsconfig.json` has `strict: true`.
- Follow existing formatting: 2-space indentation, semicolons, and double quotes.
- Naming: `PascalCase` for React components/types, `camelCase` for functions/variables.
- Keep API handlers at `app/api/<feature>/route.ts`.
- Organize feature logic by domain folders (for example `lib/pixel-office/engine` and `lib/pixel-office/layout`).

## Testing Guidelines
- Current testing is integration-oriented via scripts in `scripts/`; run them against a running local app.
- Name new scripts with `test-<feature>.sh` for consistency.
- If adding framework-based tests later, place them in `tests/` and align names with target modules/routes.

## Commit & Pull Request Guidelines
- Recent history includes generic messages (`update`, `Restore ...`); prefer specific imperative commits (example: `Add idle-rank API fallback for empty logs`).
- Keep each commit scoped to one feature/fix.
- PRs should include purpose, impacted pages/routes, manual test commands run, linked issue/task, and UI screenshots when relevant.
- Document configuration impacts (for example `OPENCLAW_HOME`) and avoid committing secrets or machine-local runtime data.
