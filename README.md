# SPLIT

A co-op debugging game. One room, two players, one bug: the **logs** player sees only runtime output, the **source** player sees only code. Neither can solve it alone — they talk it out, then submit a fix.

This repo currently contains the server half (`apps/server`): in-memory rooms, role-filtered views, REST + SSE. The Next.js web app, agent endpoint, patch approval, and verdict flow are later phases.

## Run

```bash
npm install
npm run dev        # Express API on http://localhost:4001 (node --watch)
npm run dev:web    # Next.js web app on http://localhost:3000
npm test           # leak-guard tests (node:test)
```

The web app proxies `/api/*` to the Express server, so the browser only talks to port 3000. Open `http://localhost:3000/?code=ROOMCODE` for the source pane — it renders the `role=source` view verbatim, with no filtering in the browser.

Copy `.env.example` to `.env` and fill in `PORT` / `ANTHROPIC_API_KEY` (used in a later phase).

## Role isolation

Every response — REST and SSE — passes through `apps/server/src/roles.js`, the only module allowed to see a whole room. It emits whitelisted projections:

- **logs view** — runtime log entries (label + value), test names/statuses, agent turns, patch metadata. Never file paths, source content, patch diffs, or test output.
- **source view** — files (path + content), patch diffs, test names/statuses, agent turns. Never runtime log values or test output.

Neither view leaks join tokens. `apps/server/test/roles.test.js` enforces this by stringifying each view and asserting the forbidden material is absent.

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/rooms` | Create a room (`{"fixtureId": "cart-cent"}` or omit for a random bug). Returns the 6-char code and two join links. |
| POST | `/api/rooms/:code/join` | Claim a role. Body or query: `role` + `token` from a join link. Idempotent: the same token rejoining the same role succeeds. `409` if a *different* token hits a claimed role, `403` bad token. |
| GET | `/api/rooms/:code/view?role=logs\|source` | Current role-filtered view. |
| GET | `/api/rooms/:code/stream?role=logs\|source` | SSE. `event: state` with the full view on connect and after every room change; `:ping` heartbeat every 25s. |

## Fixtures

`apps/server/src/fixtures/bugs.js` seeds three bugs:

- **cart-cent** — line totals are rounded to whole cents *before* the 10% order discount (rounded lines $4.63 × 0.9 → 417 instead of 416); the fix applies the discount to the unrounded cents and rounds once at the end.
- **page-slice** — pagination slices `start + size - 1`, dropping the last item of every full page.
- **utc-day** — `new Date("2024-06-01").getDay()` parses as UTC midnight, so local time behind UTC reads Saturday as Friday.

Each fixture ships the buggy source, the runtime logs that expose it, and a failing test suite whose output only the logs player needs.
