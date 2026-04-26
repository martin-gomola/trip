<p align="center"><img width="120" src="./src/public/favicon.png"></p>
<h2 align="center">TRIP</h2>

<div align="center">

![TRIP Planning](./.github/screenshot.jpg)

</div>

## About

TRIP (*Tourism and Recreational Interest Points*) is a self-hosted POI map and trip planner. You can save places, plan multi-day trips, track details, share routes, and keep everything on your own server.

This repository is a personal deployment fork of the original project:

- Original repository: <https://github.com/itskovacs/trip>
- Upstream documentation: <https://itskovacs.github.io/trip/docs/intro>
- Upstream demo: <https://itskovacs-trip.netlify.app/>

Use upstream docs for general app behavior. Use this README and [DEPLOYMENT.md](./DEPLOYMENT.md) for this fork's Docker workflow.

## This Fork

This fork keeps the TRIP app and adds local deployment pieces for a hosted instance:

- `make deploy` builds this checkout into a local Docker image and recreates the container.
- `.env.example` documents the runtime settings this deployment uses.
- `docker-compose.yml` builds `trip-local` from the repo instead of pulling only the upstream image.
- Alembic migrations live in `backend/trip/alembic/versions/`.
- Local runtime files stay out of git: `.env`, storage, backups, SQLite files, and `tmp/`.

Recent local additions include category icon selection, saved place URLs, Google Maps links, coordinate navigation, trip home/start fields, and print cleanup.

## Deploy

Copy the example config, edit it, then deploy:

```bash
cp .env.example .env
make deploy
```

Open the app at:

```text
http://localhost:8050
```

For a server, replace `localhost` with the server IP or point your reverse proxy at port `8050`.

After you create the first user, keep registration closed:

```env
REGISTER_ENABLE=false
```

## Commands

```bash
make deploy        # build local image, recreate container, wait for health
make build         # build the local Docker image
make restart       # recreate the container without rebuilding
make logs          # follow logs for the trip service
make ps            # show service status
make down          # stop the stack
```

`make deploy` is the normal path for this fork. Plain `docker compose up -d` can try to pull an image before the local image exists, so use the Makefile when you change code.

## Configuration

Edit `.env` for host-level settings:

| Variable | Default | Use |
|----------|---------|-----|
| `TRIP_PORT` | `8050` | Host port for the web UI |
| `TRIP_IMAGE` | `trip-local` | Local image name |
| `TRIP_VERSION` | `1` | Local image tag |
| `DATA_DIR` | `/srv/docker` | Base directory for persistent storage |
| `REGISTER_ENABLE` | `false` | Public sign-up toggle |
| `TRIP_API_TOKEN` | unset | Token for API scripts |
| `OIDC_*` | unset | Optional single sign-on settings |

Keep real values in `.env`; do not commit them.

## Data

TRIP stores runtime data under:

```text
${DATA_DIR}/trip/storage/
```

That directory contains the SQLite database, uploaded assets, attachments, backups, and optional `config.env`. Back it up from the host:

```bash
tar -czf trip-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C "${DATA_DIR:-/srv/docker}" trip/storage
```

## Screenshots

<div align="center">

|         |         |
|:-------:|:-------:|
| ![](./.github/sc_map.jpg) | ![](./.github/sc_map_filters_list.jpg) |
| ![](./.github/sc_trip.jpg) | ![](./.github/sc_trips.jpg) |

</div>

## License

TRIP uses the MIT License. See [LICENSE](./LICENSE).

Original project credit stays with [itskovacs/trip](https://github.com/itskovacs/trip).
