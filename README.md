# Sphere

A small sensory game: pull the sphere out of its socket. Each new sphere grips with a random resistance.

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
