#!/bin/bash
set -e

REGISTRY="sjc.vultrcr.com/dropradar"
TAG=${1:-latest}

echo "🚀 Deploying to Vultr VKE (tag: $TAG)..."

# Build and push images
echo "🐳 Building and pushing images..."
docker build -t $REGISTRY/api:$TAG -f docker/Dockerfile.api .
docker build -t $REGISTRY/bot:$TAG -f docker/Dockerfile.bot .
docker build -t $REGISTRY/scraper:$TAG -f docker/Dockerfile.scraper .

docker push $REGISTRY/api:$TAG
docker push $REGISTRY/bot:$TAG
docker push $REGISTRY/scraper:$TAG

# Update image tags in kustomization
echo "☸️  Deploying to cluster..."
cd k8s
kustomize edit set image \
  dropradar/api=$REGISTRY/api:$TAG \
  dropradar/bot=$REGISTRY/bot:$TAG \
  dropradar/scraper=$REGISTRY/scraper:$TAG

kubectl apply -k .

# Rollout
kubectl -n dropradar rollout status deployment/api-server
kubectl -n dropradar rollout status deployment/telegram-bot

echo ""
echo "✅ Production deployment complete!"
kubectl -n dropradar get pods
