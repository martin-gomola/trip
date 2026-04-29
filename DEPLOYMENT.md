# TRIP

Minimalist self-hosted POI map tracker and trip planner.

## Access

- **Web UI**: `http://<YOUR_SERVER_IP>:8050`
- **Suggested URL**: `trip.domain.com` (set up in Nginx Proxy Manager)

## First Setup

1. `cp .env.example .env` and adjust as needed.
2. `make deploy`
3. Open the web UI and register the first admin user.
4. Set `REGISTER_ENABLE=false` in `.env` (default) and `docker compose up -d` to lock down further sign-ups.

## Data

Single SQLite-backed volume at `${DATA_DIR}/trip/storage/`:

| File / Folder | Purpose |
|---------------|---------|
| `trip.sqlite` | Main database |
| `attachments/` | Trip attachments |
| `assets/` | Place / trip images |
| `backups/` | TRIP-managed backups |
| `config.env` | Optional in-container config overrides |

Back it up by archiving the storage directory from the host:

```bash
tar -czf trip-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C "${DATA_DIR:-/srv/docker}" trip/storage
```

## Configuration

Most settings can be edited in the web UI (Settings page). For the rest, use `.env` (rebuilt into the container env) or drop a `storage/config.env` file inside the data dir.

Key env vars (full list in `.env.example`):

| Var | Default | Notes |
|-----|---------|-------|
| `TRIP_PORT` | `8050` | Host port for the web UI |
| `TRIP_VERSION` | `1` | Local image tag for this fork |
| `TRIP_DOMAIN` / `TRIP_BASE_URL` | _unset_ | Public domain and URL for reverse proxy / integrations |
| `REGISTER_ENABLE` | `false` | Disable open sign-ups |
| `DEFAULT_MAP_LAT` / `DEFAULT_MAP_LNG` | _unset_ | Default map center |
| `TRIP_API_TOKEN` | _unset_ | Secret token for integrations; keep out of git |
| `MAPY_COM_API_KEY` | _unset_ | Secret Mapy.com API key/token for Mapy.com tile presets |
| `OIDC_*` | _unset_ | Set all four to enable SSO |
| `ATTACHMENT_MAX_SIZE` | `10485760` | 10 MB; raise reverse-proxy body limit too |

## Reverse Proxy

In Nginx Proxy Manager:

1. Forward `trip.domain.com` → `<server-ip>:8050`
2. Enable SSL
3. Bump `client_max_body_size` if you raise `ATTACHMENT_MAX_SIZE`

## Troubleshooting

```bash
make logs SERVICE=trip

docker exec -it trip ls /app/storage
```

If OIDC fails with an SSL/cert error against an internal IdP, build this fork's image with your CA cert and set `TRIP_IMAGE` to that local image name.
