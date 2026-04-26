SERVICE ?= trip
HEALTH_RETRIES ?= 30

.PHONY: help build up deploy ps logs restart down health

help:
	@printf '%s\n' \
		'TRIP commands:' \
		'  make deploy        Build local image, recreate container, wait for health' \
		'  make build         Build the local Docker image' \
		'  make up            Start the service without rebuilding' \
		'  make restart       Recreate the running service without rebuilding' \
		'  make ps            Show compose service status' \
		'  make logs          Tail logs, optionally SERVICE=name' \
		'  make down          Stop and remove compose services'

build:
	docker compose build $(SERVICE)

up:
	docker compose up -d --no-build $(SERVICE)

deploy: build restart health ps

restart:
	docker compose up -d --no-build --force-recreate $(SERVICE)

ps:
	docker compose ps

logs:
	docker compose logs --tail=120 -f $(SERVICE)

down:
	docker compose down

health:
	@i=0; \
	while [ $$i -lt $(HEALTH_RETRIES) ]; do \
		status=$$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $(SERVICE) 2>/dev/null || true); \
		if [ "$$status" = "healthy" ]; then \
			echo "$(SERVICE) is healthy"; \
			exit 0; \
		fi; \
		if [ "$$status" = "unhealthy" ] || [ "$$status" = "exited" ]; then \
			echo "$(SERVICE) is $$status"; \
			docker compose logs --tail=80 $(SERVICE); \
			exit 1; \
		fi; \
		i=$$((i + 1)); \
		sleep 2; \
	done; \
	echo "$(SERVICE) did not become healthy in time"; \
	docker compose ps; \
	docker compose logs --tail=80 $(SERVICE); \
	exit 1
