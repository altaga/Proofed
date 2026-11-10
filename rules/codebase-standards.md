# Codebase Architecture & Engineering Standards

These standards govern code structure, dependencies, state management, and testing across the Proofed repository.

---

## 1. Directory Structure

The repository is organized into distinct, decoupled top-level directories:

- `app/`: Next.js 15+ full-stack web application (frontend components, App Router pages/endpoints, SQLite database, scripts, tests).
- `docs/`: Technical research, architecture documentation, presentation walkthroughs, and visual assets.
- `skills/`: Agent skills defining reusable operational playbooks and testing guides.
- `rules/`: Strict engineering, design, and fintech safety rules.
- `AGENTS.md`: Master reference manual for autonomous coding agents.
- `README.md`: Executive and technical project overview.

---

## 2. Technology Stack Invariants

- **Runtime**: Node.js 22+ (tested on Node 24).
- **Database**: Built-in `node:sqlite` (introduced in Node 22). No external binary SQLite drivers (`better-sqlite3` build steps are omitted).
- **Framework**: Next.js 15+ App Router (`app/` directory).
- **UI & Grid**: React 19, Lucide React icons, AG Grid Community for high-density enterprise tabular data.
- **Testing**:
  - Unit & Integration: Vitest (`app/tests/*.test.ts`).
  - End-to-End & A11y: Playwright + `@axe-core/playwright` (`app/tests/e2e/*.spec.ts`).

---

## 3. API & Data Validation Rules

- All incoming POST/PUT request bodies must be validated using Zod schemas.
- Endpoints return consistent JSON responses with appropriate HTTP status codes.
- Database access is centralized through `app/lib/db.ts` to ensure WAL mode (`journal_mode = WAL`) and foreign key enforcement (`foreign_keys = ON`).
- Never perform asynchronous side-effects (e.g., calling PayPal or modifying database) inside React render functions.
