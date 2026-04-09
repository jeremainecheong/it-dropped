#!/bin/bash
set -e

KUBECONFIG_PATH="$HOME/.kube/vultr-config"

echo "🌐 Setting up Vultr VKE..."

echo "📥 Download kubeconfig from Vultr dashboard"
echo "   Place it at: $KUBECONFIG_PATH"
read -p "Press enter when ready..."

# Set kubeconfig
export KUBECONFIG=$KUBECONFIG_PATH

# Verify connection
echo "🔍 Verifying cluster connection..."
kubectl cluster-info
kubectl get nodes

# Install NGINX Ingress Controller
echo "📦 Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Wait for ingress controller
echo "⏳ Waiting for Ingress Controller..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# Create namespace
kubectl create namespace dropradar --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "✅ Vultr VKE is ready!"
echo ""
echo "Ingress Controller LoadBalancer IP:"
kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
echo ""
echo ""
echo "Point your DNS records to this IP:"
echo "  api.dropradar.dev  →  <IP>"
echo "  bot.dropradar.dev  →  <IP>"
