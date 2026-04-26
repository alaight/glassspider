# glassspider

Laightworks ecosystem product — [glassspider](https://github.com/alaight/glassspider) on GitHub.

## Database

This app uses the **same Supabase/Postgres project** as the Laightworks site. **All tables created for glassspider-specific data must be prefixed with `glassspider_`** (for example `glassspider_events`). Shared hub tables stay as defined by the ecosystem.

See **`AGENTS.md`** and **`docs/CURRENT_STATE.md`** for agent/human runbooks.

## Getting started

Clone the repository and open this folder in your editor. Cursor rules live in `.cursor/rules/`.
