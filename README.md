# glassspider

Laightworks ecosystem product — [glassspider](https://github.com/alaight/glassspider) on GitHub.

## Application

Glassspider is a Next.js App Router product for bid intelligence:

- Admin users configure procurement sources, URL rules, manual runs, and URL-map review.
- Viewer users search normalised bid records, inspect renewal windows, and export CSV data.
- The first source investigation targets BidStats with cautious, low-rate, query-free crawling based on its public robots rules.

## Database

This app uses the **same Supabase/Postgres project** as the Laightworks site. **All tables created for glassspider-specific data must be prefixed with `glassspider_`** (for example `glassspider_events`). Shared hub tables stay as defined by the ecosystem.

See **`AGENTS.md`** and **`docs/CURRENT_STATE.md`** for agent/human runbooks.

## Getting started

Clone the repository and open this folder in your editor. Cursor rules live in `.cursor/rules/`.

```bash
npm install
npm run dev
```

## Environment

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_LAIGHTWORKS_LOGIN_URL=https://laightworks.com/login
GLASSSPIDER_PROJECT_SLUG=glassspider
GLASSSPIDER_ADMIN_ROLES=owner,admin
GLASSSPIDER_CRON_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` is only for server-side pipeline routes and scheduled jobs. Never expose it in browser code or a `NEXT_PUBLIC_*` variable.

## Scripts

- `npm run dev`: start the local Next.js server.
- `npm run build`: build the app.
- `npm run lint`: run ESLint.
- `npm run typecheck`: run TypeScript checks.
