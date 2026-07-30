# DROPRADAR

Stüssy product drop monitoring system with Telegram notifications.

## Features

- 🔍 **Multi-Region Monitoring** - Tracks Stüssy stores across US, UK, EU, JP, AU
- 🆕 **New Drop Alerts** - Instant notifications when new products drop
- 🔄 **Restock Notifications** - Know when sold-out items are back
- 💰 **Price Tracking** - Get alerted on price changes
- 🤖 **Telegram Bot** - Easy subscription management via Telegram
- 📊 **REST API** - Dashboard-ready API endpoints
- 🖥️ **Web Dashboard** - Next.js frontend for browsing drops

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     KUBERNETES CLUSTER                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   CRONJOB   │  │ DEPLOYMENT  │  │     DEPLOYMENT      │  │
│  │   scraper   │  │ api-server  │  │    telegram-bot     │  │
│  │  */5 * * *  │  │ replicas: 2 │  │     replicas: 1     │  │
│  └─────────────┘  └──────┬──────┘  └──────────┬──────────┘  │
│                          │                     │            │
│                   ┌──────▼──────┐      ┌──────▼──────┐      │
│                   │ api-service │      │ bot-service │      │
│                   │    :8080    │      │    :8081    │      │
│                   └─────────────┘      └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
                          │                     │
              ┌───────────▼─────────────────────▼───────────┐
              │              SUPABASE                       │
              │         PostgreSQL Database                 │
              └─────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Go 1.22+
- Node.js 18+ & pnpm
- Docker
- Minikube (for local development)
- kubectl
- Supabase account
- Telegram Bot Token (from @BotFather)

### 1. Clone & Configure

```bash
git clone https://github.com/yourusername/dropradar.git
cd dropradar

cp .env.example .env
# Edit .env with your credentials
```

### 2. Setup Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `docs/schema.sql`
3. Copy your connection string to `.env`:
   ```
   SUPABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
   ```

### 3. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### 4. Local Development with Minikube

```bash
# Setup Minikube cluster
make minikube-setup

# Build and deploy
make minikube-deploy

# Check pods are running
kubectl -n dropradar get pods

# Access API locally
kubectl -n dropradar port-forward svc/api-service 8080:8080
```

### 5. Test the API

```bash
# Health check
curl http://localhost:8080/health

# Get products
curl http://localhost:8080/products?region=us&limit=10

# Get recent drops
curl http://localhost:8080/drops?type=new&limit=10
```

## Project Structure

```
dropradar/
├── frontend/             # Next.js web dashboard
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── hooks/            # Custom hooks
│   └── lib/              # Utilities
├── backend/              # Go backend services
│   ├── cmd/
│   │   ├── api/          # API server entry point
│   │   ├── bot/          # Telegram bot entry point
│   │   └── scraper/      # Scraper entry point
│   ├── internal/
│   │   ├── api/          # REST API handlers
│   │   ├── config/       # Configuration loading
│   │   ├── database/     # Database operations
│   │   ├── models/       # Data models
│   │   ├── scraper/      # Scraping logic
│   │   └── telegram/     # Telegram bot logic
│   └── pkg/
│       └── httputil/     # HTTP utilities
├── infra/                # Infrastructure & deployment
│   ├── docker/           # Dockerfiles
│   ├── k8s/              # Kubernetes manifests
│   └── scripts/          # Deployment scripts
└── docs/                 # Documentation
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | System status with recent scrapes |
| GET | `/products` | List products (query: region, available, limit, offset) |
| GET | `/drops` | List drops (query: region, type, notified, limit, offset) |

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Subscribe to notifications |
| `/settings` | View/edit notification preferences |
| `/regions` | Select regions to monitor |
| `/stop` | Unsubscribe |
| `/help` | Show help |

## Make Commands

```bash
# Backend
make build              # Build all Go binaries
make test               # Run tests
make run-api            # Run API server locally
make run-bot            # Run Telegram bot locally
make run-scraper        # Run scraper locally

# Frontend
make frontend-install   # Install dependencies
make frontend-dev       # Run frontend dev server
make frontend-build     # Build frontend for production

# Docker
make docker-build       # Build Docker images

# Kubernetes
make minikube-setup     # Setup Minikube cluster
make minikube-deploy    # Deploy to Minikube
make minikube-logs-api  # Stream API logs
make minikube-logs-bot  # Stream bot logs
make minikube-logs-scraper # Stream scraper logs

make clean              # Clean up
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | PostgreSQL connection string | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service key | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation secret | No |
| `REGIONS` | Comma-separated regions (default: us,uk,eu,jp,au) | No |
| `LOG_LEVEL` | Logging level (default: info) | No |
| `API_PORT` | API server port (default: 8080) | No |
| `BOT_PORT` | Bot server port (default: 8081) | No |

## Production Deployment (Vultr VKE)

1. Create a Vultr Kubernetes cluster
2. Download kubeconfig
3. Run setup script:
   ```bash
   make vultr-setup
   ```
4. Deploy:
   ```bash
   make vultr-deploy
   ```

## License

MIT
