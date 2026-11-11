# Shared leaderboard setup

The game remains hosted on GitHub Pages. Supabase stores the public leaderboard; GitHub Pages itself does not run a writable database.

1. Create a project under **Supabase Free**, or choose an existing free project dedicated to this game. Do not upgrade or enable paid add-ons for this setup.
2. Run [`migrations/202611110001_leaderboard.sql`](./migrations/202611110001_leaderboard.sql) in the project's SQL editor, or apply it using the connected Supabase integration.
3. Find the project URL and **publishable** API key in the Supabase dashboard. A legacy `anon` key is also supported. Never use a secret key, database password, or `service_role` key in this website.
4. Fill only those public values in [`src/services/leaderboard-config.js`](../src/services/leaderboard-config.js):

   ```js
   export const LEADERBOARD_CONFIG = Object.freeze({
       url: 'https://YOUR_PROJECT.supabase.co',
       publishableKey: 'YOUR_PUBLIC_PUBLISHABLE_KEY'
   });
   ```

5. Run `npm test` and `npm run build`, then push to GitHub. Verify the live game can read the empty shared leaderboard and submit a completed game from two browsers.

Until the project is connected, the website explicitly says the shared leaderboard is not connected. It does not display device-local results as global rankings. Submitted results can wait in the device's outbox and upload after setup. Scores need an internet connection to become public.

## API and access

- `POST /rest/v1/rpc/get_leaderboard` accepts `{ "p_limit": 50 }` and returns `{ "entries": [...] }`.
- `POST /rest/v1/rpc/submit_score` accepts `p_id` (UUID), `p_name`, `p_comment`, `p_score`, `p_board_size`, and `p_batch_size`. It returns `{ "rank": 1 }` for the example first-place result.
- The table has RLS enabled and no direct grants for `anon` or `authenticated`. Only the two deliberately bounded RPCs are exposed. SQL uses a fixed empty search path and schema-qualified tables.
- The server validates names (1–24 characters), single-line comments (0–160), score bounds (0–10,000,000), and supported game settings. Text is rendered with `textContent` in the browser.
- A score UUID is generated for each completed game. Retrying the same UUID is idempotent; a different payload using the same UUID is rejected. Earlier scores win ordering ties; equal scores share a competition rank.
- This is a recreational, client-reported leaderboard. It does not authenticate players or replay games on the server to prove scores. A competitive leaderboard would require authoritative validation and additional abuse controls.

The Free plan currently includes a 500 MB database and can pause after a week of inactivity. Check [Supabase pricing](https://supabase.com/pricing) and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) before relying on it for continuous availability. A paused backend does not stop local play; scores remain queued when browser storage works.

Required Notice: Copyright (c) 2026 M80ta
