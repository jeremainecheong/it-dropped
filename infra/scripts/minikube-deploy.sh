#!/bin/bash
set -e

echo "🏗️  Building and deploying to Minikube..."

# Use minikube's docker daemon
eval $(minikube docker-env)

# Build images
echo "🐳 Building Docker images..."
docker build -t dropradar/api:latest -f docker/Dockerfile.api .
docker build -t dropradar/bot:latest -f docker/Dockerfile.bot .
docker build -t dropradar/scraper:latest -f docker/Dockerfile.scraper .

# Apply K8s manifests
echo "☸️  Applying Kubernetes manifests..."
kubectl apply -k k8s/

# Wait for deployments
echo "⏳ Waiting for deployments..."
kubectl -n dropradar rollout status deployment/api-server
kubectl -n dropradar rollout status deployment/telegram-bot

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
kubectl -n dropradar get pods
echo ""

# Port forward for local access
echo "🔗 To access the API locally, run:"
echo "   kubectl -n dropradar port-forward svc/api-service 8080:8080"
echo ""
echo "🔗 To access the bot locally, run:"
echo "   kubectl -n dropradar port-forward svc/bot-service 8081:8081"
