#!/bin/bash
set -e

echo "🚀 Setting up Minikube for Dropradar..."

# Start minikube with enough resources
minikube start \
  --cpus=4 \
  --memory=4096 \
  --driver=docker \
  --kubernetes-version=v1.28.0

# Enable required addons
echo "📦 Enabling addons..."
minikube addons enable ingress
minikube addons enable metrics-server
minikube addons enable dashboard

# Set docker env to use minikube's docker daemon
echo "🐳 Configuring Docker..."
eval $(minikube docker-env)

# Create namespace
echo "📁 Creating namespace..."
kubectl create namespace dropradar --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "✅ Minikube is ready!"
echo ""
echo "Useful commands:"
echo "  minikube dashboard     # Open K8s dashboard"
echo "  minikube tunnel        # Expose LoadBalancer services"
echo "  minikube ip            # Get cluster IP"
echo "  eval \$(minikube docker-env)  # Use minikube's Docker"
echo ""
