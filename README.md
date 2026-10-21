# Sphere

A small sensory game: pull the sphere out of its socket. Each new sphere grips with a random resistance.

## Pulling

The grip gives way at a limited speed: about half a second of steady pulling for a loose sphere, about two seconds for a welded one. If you pull much faster than that, for example with a quick flick, the sphere slips out of your hand and springs back.

## Scoring

Aim the sphere so it flies into a corner. When it touches one wall, the game measures how far it is from touching the other one, in sphere radii. Distance rather than time, so a fast launch doesn't make corners easier.

| Hit | Distance from the other wall |
| --- | --- |
| Perfect | up to 0.2 radius |
| Great | up to 0.6 radius |
| Close | up to 1.2 radius |

Only Perfects count: they make a throw a **perfect throw**, which is what the form meter and the leaderboard measure. Great and Close are feedback on how close you came.

### Ice

A Perfect freezes that corner, so you can't keep scoring on the same one:

- **A frozen corner scores nothing.** Hits there chip the ice instead.
- **The opposite corner bursts into flames** as a clue. A Perfect there sets the sphere on fire: it heads straight for the iced corner without slowing down and melts the ice when it arrives. The corner you hit stays open, and the melt itself isn't a new corner hit.
- **Or smash it.** Each hit does damage equal to the impact speed × the sphere's weight, and damage adds up. Weight goes from 0.6 for a loose sphere to 1.6 for a welded one, and stronger grips also launch faster, so a strong sphere hitting the ice straight away hits hardest. Each new freeze gets a random strength (12 to 45), shown as how thick the ice looks.
- At most one corner of each diagonal can be frozen, so two corners are always open.

Frozen corners are kept in your browser, so reloading the page doesn't clear them.

**Perfect · last 20** in the top bar shows how many of your last 20 throws hit at least one Perfect corner. It is kept in your browser. When you're signed in to the leaderboard, **Season rating** next to it shows your current rating.

## Leaderboard (optional)

Players can sign in with GitHub to join a seasonal leaderboard, stored in Supabase. It stays switched off until `html/config.js` has a Supabase project URL and anon key; see [LEADERBOARD.md](LEADERBOARD.md) for how it works and how to set it up.

## Run

```bash
docker compose up -d
```

Open http://localhost:8080.

## Change the port

Edit the `ports` line in `docker-compose.yml` (the number before `:80`), or set `PORT` when starting:

```bash
PORT=9000 docker compose up -d
```

## Stop

```bash
docker compose down
```

Vibration only works in browsers that support it (mostly Chrome on Android).

## GitHub Pages

The game is published at https://exenza.github.io/sphere/. Every push to `main` that changes `html/` runs `.github/workflows/pages.yml`, which copies `html/` to the `gh-pages` branch that Pages serves.
