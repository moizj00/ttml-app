# TTML on Kubernetes — Complete Step-by-Step Guide

> **Goal:** Deploy Talk-to-My-Lawyer to your local kind cluster (6 nodes) for hands-on Kubernetes learning.
>
> **Your cluster:** kind · v1.34.3 · 1 control-plane + 5 workers

## Quick Start

```powershell
cd C:\Users\lagri\OneDrive\Documents\repositories\ttml-pro
# 1. Edit k8s/base/secret.yaml with your base64-encoded API keys
# 2. Add "127.0.0.1 ttml.local" to C:\Windows\System32\drivers\etc\hosts
# 3. Run:
.\k8s\deploy.ps1
# 4. Open http://ttml.local
```

## Architecture

- **Frontend:** Vite/React served by nginx (2 replicas, port 80)
- **Backend:** Express+tRPC (2 replicas, port 3000)
- **Database:** Supabase PostgreSQL (hosted, external)
- **Ingress:** nginx controller routes ttml.local to frontend/backend

## Learning Exercises

### Scaling
```powershell
kubectl scale deployment ttml-backend -n ttml --replicas=4
kubectl get pods -n ttml -w
```

### Rolling Updates
```powershell
docker build -f k8s/dockerfiles/Dockerfile.backend -t ttml-backend:v2 .
kind load docker-image ttml-backend:v2 --name desktop
kubectl set image deployment/ttml-backend -n ttml backend=ttml-backend:v2
kubectl rollout status deployment/ttml-backend -n ttml
kubectl rollout undo deployment/ttml-backend -n ttml
```

### Debugging
```powershell
kubectl describe pod -n ttml -l component=backend
kubectl exec -it -n ttml deployment/ttml-backend -- sh
kubectl port-forward -n ttml svc/ttml-backend 3001:3000
```

### Autoscaling
```powershell
kubectl autoscale deployment ttml-backend -n ttml --min=2 --max=6 --cpu-percent=70
kubectl get hpa -n ttml
```

## Cleanup
```powershell
kubectl delete namespace ttml
```

See the full guide in the downloaded TTML-K8S-GUIDE.md file.
