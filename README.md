<p align="center"><img width="120" src="./src/public/favicon.png"></p>
<h2 align="center">TRIP</h2>

<div align="center">

![TRIP Planning](./docs/static/img/screenshot.jpg)

</div>

## About

TRIP (*Tourism and Recreational Interest Points*) is a self-hosted POI map and trip planner. You can save places, plan multi-day trips, track details, share routes, and keep everything on your own server.

This fork runs a hosted personal TRIP instance. It keeps the base app and adds the pieces I need for real trip planning: local Docker deploys, itinerary fields, map handoff links, imports, printable roadbooks, and automation helpers.

Use this README and [DEPLOYMENT.md](./DEPLOYMENT.md) for this fork's Docker setup.

## Changes From Original

This fork adds:

- Local deploys with `make deploy`, `docker-compose.yml`, `.env.example`, health checks, persistent storage defaults, and closed registration.
- Source-built Docker images. The compose stack builds `trip-local` from this checkout, so deployed code matches the repo.
- Itinerary fields for home/start coordinates, day start times, stop duration, nullable arrival and check-in times, currency, booking status, references, cancellation deadlines, cost status, fees, checkout details, and trip-only places.
- Faster trip editing: collapsible days, stronger mobile layout, clearer selected-place and selected-item actions, a better time picker, and retiming previews based on duration and travel time.
- Accommodation planning across multiple days, with booking/cost metadata and routing from the right base location.
- Map handoff tools for Mapy.com tiles, Mapy.com roadbook QR links, Google Maps shortcuts, coordinate navigation, Plus Codes, lat/lng parsing, and Google Maps share-link resolution.
- Place tools for category icons, saved URLs, visit duration, Google-backed creation, Google My Maps/list imports, and temporary trip-only places.
- Shared and printed trip views with a cleaner itinerary, roadbook output, route links, QR codes, and a JPG cover.
- Offline support for cached API reads and map tiles.
- A local API helper at `skills/trip-planner/scripts/trip_api.py` for API docs, token-backed place creation, roadtrip JSON validation, dry runs, and idempotent imports.
- Public-repo guardrails for `.env`, storage, backups, SQLite files, and temporary working files.

Alembic migrations for the local data model live in `backend/trip/alembic/versions/`.

## Deploy

Full deployment guide: <https://martin-gomola.github.io/trip/docs/getting-started/deploy>

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
| `MAPY_COM_API_KEY` | unset | Mapy.com API key/token for Mapy.com tile presets |
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
| ![](./docs/static/img/sc_map.jpg) | ![](./docs/static/img/sc_map_filters_list.jpg) |
| ![](./docs/static/img/sc_trip.jpg) | ![](./docs/static/img/sc_trips.jpg) |

</div>

## License

TRIP uses the MIT License. See [LICENSE](./LICENSE).

## Credits

Based on the original TRIP project by [itskovacs](https://github.com/itskovacs/trip).
