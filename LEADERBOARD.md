# Leaderboard

An optional, seasonal leaderboard. Playing stays anonymous; players who sign in with GitHub get their throws ranked.

It runs on [Supabase](https://supabase.com) (free tier is enough). The game stays a static site on GitHub Pages and talks to Supabase from the browser.

## How it works

- **A throw** is one freed sphere, from the pull to the end of its flight.
- **A perfect throw** hits at least one Perfect corner. Frozen corners don't count (see Ice in the README).
- **Rating** is the share of perfect throws in the current season, adjusted for how many throws back it up (the Wilson lower bound at 90% confidence). One lucky throw rates about 27%; 10 perfect out of 20 about 33%; 100 out of 200 about 44%.
- **Seasons** end when all players together reach **5,000 counted throws**, or after **30 days**, whichever comes first. The next throw starts a new season. Each player counts toward the 5,000 for at most **500 throws** a season, so nobody can end a season early on their own; throws past that still count for their own rating.
- **Past seasons** keep their top three in the panel.

### What's protected

- The page only uses Supabase's public **anon key**. It's visible to anyone, by design. The database rules decide what it can do: read seasons, players and ratings. Raw throws can't be read at all.
- Nobody can write to the tables directly. Throws go through one database function, `submit_throw`, which:
  - only accepts signed-in GitHub users, and takes their name and avatar from the GitHub identity (not from anything the browser sends);
  - rejects implausible throws (pulled faster than the grip allows, impossible corner counts, a Perfect without a close enough corner);
  - allows at most one throw every 2.5 seconds per player (a real throw takes about 3);
  - applies the season target, the per-player cap and the 30-day limit.
- Scores are still calculated in the player's browser, so a determined player could send fake throws that pass these checks. That's the usual limit of a browser game without a game server.

Never put the **service_role / secret key** or the **GitHub OAuth client secret** in this repo or the page.

## Setup

### 1. Create the Supabase project

1. Sign up at https://supabase.com and create a new project (any name, e.g. `sphere`). Pick the region closest to your players and save the database password somewhere safe; you won't need it here.
2. When it's ready, open **Project Settings → API** (or **Connect**) and note:
   - the **Project URL**, like `https://abcdefghijklmnop.supabase.co`
   - the **anon / publishable key**

### 2. Create the GitHub OAuth App

1. Signed in to GitHub as **exenza**, open https://github.com/settings/developers → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** `Sphere`
   - **Homepage URL:** `https://exenza.github.io/sphere/`
   - **Authorization callback URL:** `https://<your-project-ref>.supabase.co/auth/v1/callback` (your Project URL followed by `/auth/v1/callback`)
3. Click **Register application**, then **Generate a new client secret**. Keep the page open for the next step.

### 3. Turn on GitHub sign-in in Supabase

1. In Supabase, open **Authentication → Sign In / Providers** (called **Providers** in some versions) → **GitHub**.
2. Switch it on, paste the **Client ID** and **Client Secret** from GitHub, and save.
3. Switch off the providers you don't use, especially **Email**, so GitHub is the only way to sign in.
4. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://exenza.github.io/sphere/`
   - **Redirect URLs:** add `https://exenza.github.io/sphere/` (and `http://localhost:8080/` if you want sign-in to work in the Docker version too).

### 4. Create the tables and rules

1. In Supabase, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should finish without errors. Running it again later is safe.

To change the season rules, edit the defaults in `supabase/schema.sql` (`throw_target`, `per_player_cap`, `ends_at`) before running it, or change the current season's row in **Table Editor → seasons**.

### 5. Switch it on

Send the **Project URL** and the **anon / publishable key** (both public) to whoever maintains the game, or put them in `html/config.js` yourself:

```js
window.SPHERE_CONFIG = {
  supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
  supabaseAnonKey: 'your-anon-key',
};
```

Push to `main`. The Pages workflow publishes it, and a **LEADERBOARD** button appears next to the sound and vibration toggles.
