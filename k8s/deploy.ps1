# ============================================
# TTML K8s Deploy Script
# Run from the ttml-app project root:
#   .\k8s\deploy.ps1
# ============================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TTML Kubernetes Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Pre-flight checks ---
Write-Host "[1/8] Checking prerequisites..." -ForegroundColor Yellow

$dockerCheck = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running. Start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "  Docker: OK" -ForegroundColor Green

$kubectlCheck = kubectl cluster-info --context kind-desktop 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: kind cluster 'desktop' not found. Create it first." -ForegroundColor Red
    exit 1
}
Write-Host "  Cluster: OK" -ForegroundColor Green

# --- Check secrets are configured ---
Write-Host ""
Write-Host "[2/8] Checking secrets..." -ForegroundColor Yellow

$secretContent = Get-Content "k8s\base\secret.yaml" -Raw
if ($secretContent -match "REPLACE_WITH_BASE64_ENCODED_VALUE") {
    Write-Host "WARNING: secret.yaml still has placeholder values!" -ForegroundColor Red
    Write-Host "  Edit k8s\base\secret.yaml and replace all REPLACE_WITH_BASE64_ENCODED_VALUE" -ForegroundColor Red
    Write-Host "  with your actual base64-encoded secrets." -ForegroundColor Red
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") { exit 1 }
}

# --- Build Docker images ---
Write-Host ""
Write-Host "[3/8] Building backend Docker image..." -ForegroundColor Yellow
docker build -f k8s/dockerfiles/Dockerfile.backend -t ttml-backend:latest .
if ($LASTEXITCODE -ne 0) { Write-Host "Backend build FAILED" -ForegroundColor Red; exit 1 }
Write-Host "  Backend image: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[4/8] Building frontend Docker image..." -ForegroundColor Yellow
docker build -f k8s/dockerfiles/Dockerfile.frontend -t ttml-frontend:latest .
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build FAILED" -ForegroundColor Red; exit 1 }
Write-Host "  Frontend image: OK" -ForegroundColor Green

# --- Load images into kind ---
Write-Host ""
Write-Host "[5/8] Loading images into kind cluster..." -ForegroundColor Yellow
kind load docker-image ttml-backend:latest --name desktop
kind load docker-image ttml-frontend:latest --name desktop
Write-Host "  Images loaded: OK" -ForegroundColor Green

# --- Install Ingress Controller (if not already installed) ---
Write-Host ""
Write-Host "[6/8] Setting up Ingress Controller..." -ForegroundColor Yellow
$ingressNs = kubectl get namespace ingress-nginx 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing nginx ingress controller..." -ForegroundColor Gray
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
    Write-Host "  Waiting for ingress controller to be ready (up to 120s)..." -ForegroundColor Gray
    kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s
} else {
    Write-Host "  Ingress controller already installed" -ForegroundColor Gray
}
Write-Host "  Ingress: OK" -ForegroundColor Green

# --- Apply K8s manifests ---
Write-Host ""
Write-Host "[7/8] Deploying TTML to Kubernetes..." -ForegroundColor Yellow

kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secret.yaml
kubectl apply -f k8s/base/backend-deployment.yaml
kubectl apply -f k8s/base/backend-service.yaml
kubectl apply -f k8s/base/frontend-deployment.yaml
kubectl apply -f k8s/base/frontend-service.yaml
kubectl apply -f k8s/base/ingress.yaml

Write-Host "  All manifests applied: OK" -ForegroundColor Green

# --- Wait for pods ---
Write-Host ""
Write-Host "[8/8] Waiting for pods to be ready..." -ForegroundColor Yellow
kubectl wait --namespace ttml --for=condition=ready pod --selector=app=ttml --timeout=120s

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  TTML is deployed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Make sure 'ttml.local' is in your hosts file:" -ForegroundColor White
Write-Host "    127.0.0.1 ttml.local" -ForegroundColor Gray
Write-Host ""
Write-Host "  Then open: http://ttml.local" -ForegroundColor Cyan
Write-Host ""

# Show status
kubectl get pods -n ttml
Write-Host ""
kubectl get svc -n ttml
Write-Host ""
kubectl get ingress -n ttml
