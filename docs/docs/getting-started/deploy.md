---
sidebar_position: 1
description: Deploy TRIP
---

# Deployment

This fork deploys from the local checkout with Docker Compose.

### Docker Compose

Copy the example environment file, edit private values, then build and recreate the container:

```bash
cp .env.example .env
make deploy
```

The app listens on `http://localhost:8050` by default. For a server, point your reverse proxy at port `8050`.

After creating the first user, keep registration closed:

```bash
REGISTER_ENABLE=false
```

Useful commands:

```bash
make deploy
make restart
make logs
make ps
make down
```
