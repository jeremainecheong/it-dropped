.PHONY: all build test run clean docker minikube-setup minikube-deploy

# Go commands (from backend directory)
build:
	cd backend && go build -o bin/api ./cmd/api
	cd backend && go build -o bin/bot ./cmd/bot
	cd backend && go build -o bin/scraper ./cmd/scraper

test:
	cd backend && go test -v ./...

run-api:
	cd backend && go run ./cmd/api

run-bot:
	cd backend && go run ./cmd/bot

run-scraper:
	cd backend && go run ./cmd/scraper

# Docker commands
docker-build:
	docker build -t dropradar/api:latest -f infra/docker/Dockerfile.api backend/
	docker build -t dropradar/bot:latest -f infra/docker/Dockerfile.bot backend/
	docker build -t dropradar/scraper:latest -f infra/docker/Dockerfile.scraper backend/

# Minikube commands
minikube-setup:
	chmod +x infra/scripts/minikube-setup.sh
	./infra/scripts/minikube-setup.sh

minikube-deploy:
	chmod +x infra/scripts/minikube-deploy.sh
	./infra/scripts/minikube-deploy.sh

minikube-logs-api:
	kubectl -n dropradar logs -f -l component=api

minikube-logs-bot:
	kubectl -n dropradar logs -f -l component=bot

minikube-logs-scraper:
	kubectl -n dropradar logs -f -l component=scraper

minikube-port-forward:
	kubectl -n dropradar port-forward svc/api-service 8080:8080

# Vultr commands
vultr-setup:
	chmod +x infra/scripts/vultr-setup.sh
	./infra/scripts/vultr-setup.sh

vultr-deploy:
	chmod +x infra/scripts/vultr-deploy.sh
	./infra/scripts/vultr-deploy.sh

# Frontend commands
frontend-dev:
	cd frontend && pnpm dev

frontend-build:
	cd frontend && pnpm build

frontend-install:
	cd frontend && pnpm install

# Clean
clean:
	rm -rf backend/bin/
	kubectl delete namespace dropradar --ignore-not-found
