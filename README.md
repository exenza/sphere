# Sphere

A small sensory game: pull the sphere out of its socket. Each new sphere grips with a random resistance.

## Scoring

Aim the sphere so it flies into a corner. A corner counts when it touches both walls almost at the same moment:

| Hit | Time between the two walls | Base points |
| --- | --- | --- |
| Perfect | up to 17 ms | 100 |
| Great | up to 70 ms | 40 |
| Close | up to 150 ms | 15 |

Points are multiplied by `1 + resistance` (stronger grips launch faster), and each extra corner in the same flight multiplies again (×2, ×3…).

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
