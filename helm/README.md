# DOME IED Helm Chart

Helm chart for deploying the DOME Interchain Event Distributor (IED) to Kubernetes.

## Overview

The DOME IED is a middleware component that orchestrates blockchain event replication between multiple Distributed Ledger Technology (DLT) networks. This Helm chart deploys:

- **IED Service**: Main event distribution orchestrator
- **Redis Cache**: For event tracking and deduplication
- **DLT Adapters** (optional): HashNET and Alastria blockchain adapters

## Prerequisites

- Kubernetes 1.20+
- Helm 3.0+
- PersistentVolume provisioner support in the underlying infrastructure (for Redis persistence)
- (Optional) Ingress controller (nginx, traefik, etc.) if external access is required

## Installation

### Quick Start (Development)

Install with default values (development configuration):

```bash
cd helm
helm install dome-ied .
```

### Production Installation

Install with production overrides:

```bash
helm install dome-ied ./helm -f helm/values-production.yaml \
  --set redis.auth.password=YOUR_REDIS_PASSWORD \
  --set ingress.hosts[0].host=ied.your-domain.com
```

### Custom Installation

Install with custom values:

```bash
helm install dome-ied ./helm \
  --set ied.replicaCount=2 \
  --set redis.persistence.size=20Gi \
  --set adapters.enabled=true
```

## Configuration

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `nameOverride` | Override chart name | `""` |
| `fullnameOverride` | Override full resource names | `""` |

### IED Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ied.replicaCount` | Number of IED replicas | `1` |
| `ied.image.repository` | IED image repository | `dome-ied` |
| `ied.image.tag` | IED image tag | `latest` |
| `ied.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `ied.resources.requests.cpu` | CPU request | `100m` |
| `ied.resources.requests.memory` | Memory request | `256Mi` |
| `ied.resources.limits.cpu` | CPU limit | `500m` |
| `ied.resources.limits.memory` | Memory limit | `512Mi` |
| `ied.service.type` | Kubernetes service type | `ClusterIP` |
| `ied.service.port` | Service port | `8080` |

### IED Environment Variables

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ied.env.nodeEnv` | Node environment | `development` |
| `ied.env.logLevel` | Log level (debug/info/warn/error) | `info` |
| `ied.env.logFormat` | Log format (json/pretty) | `pretty` |
| `ied.env.replicationDelayMs` | Delay before replicating events (ms) | `15000` |
| `ied.env.internalSubscriptionEventTypes` | Event types for replication | `*` |
| `ied.env.adapterTimeoutMs` | Adapter request timeout (ms) | `5000` |
| `ied.env.notificationTimeoutMs` | Notification timeout (ms) | `5000` |
| `ied.env.maxRetryAttempts` | Max retry attempts | `3` |
| `ied.env.retryDelayMs` | Retry delay (ms) | `1000` |

### Redis Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.enabled` | Enable Redis deployment | `true` |
| `redis.image.repository` | Redis image repository | `redis` |
| `redis.image.tag` | Redis image tag | `7-alpine` |
| `redis.database` | Redis database number | `0` |
| `redis.auth.enabled` | Enable Redis authentication | `false` |
| `redis.auth.password` | Redis password | `""` |
| `redis.auth.existingSecret` | Use existing secret for password | `""` |
| `redis.persistence.enabled` | Enable persistence | `true` |
| `redis.persistence.size` | PVC size | `10Gi` |
| `redis.persistence.storageClass` | Storage class | `""` (default) |
| `redis.resources.requests.cpu` | CPU request | `50m` |
| `redis.resources.requests.memory` | Memory request | `128Mi` |
| `redis.resources.limits.cpu` | CPU limit | `250m` |
| `redis.resources.limits.memory` | Memory limit | `256Mi` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `nginx` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts[0].host` | Hostname | `ied.example.com` |
| `ingress.hosts[0].paths[0].path` | Path | `/` |
| `ingress.hosts[0].paths[0].pathType` | Path type | `Prefix` |
| `ingress.tls` | TLS configuration | `[]` |

### DLT Adapters Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `adapters.enabled` | Deploy adapters in same chart | `false` |
| `adapters.hashnet.url` | External HashNET adapter URL | `""` |
| `adapters.hashnet.image.repository` | HashNET image (if enabled) | `hashnet-adapter` |
| `adapters.hashnet.image.tag` | HashNET image tag (if enabled) | `latest` |
| `adapters.alastria.url` | External Alastria adapter URL | `""` |
| `adapters.alastria.image.repository` | Alastria image (if enabled) | `alastria-adapter` |
| `adapters.alastria.image.tag` | Alastria image tag (if enabled) | `latest` |

## Usage Examples

### Development Setup with Built-in Adapters

Deploy IED with adapters for local testing:

```bash
helm install dome-ied ./helm \
  --set adapters.enabled=true \
  --set ied.env.logFormat=pretty \
  --set redis.persistence.enabled=false
```

### Production Setup with External Adapters

Deploy IED connecting to external adapter services:

```bash
helm install dome-ied ./helm \
  -f helm/values-production.yaml \
  --set adapters.hashnet.url=http://hashnet-adapter.adapters.svc.cluster.local:8080 \
  --set adapters.alastria.url=http://alastria-adapter.adapters.svc.cluster.local:8080 \
  --set redis.auth.password=SECURE_PASSWORD \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=ied.production.com \
  --set ingress.tls[0].secretName=ied-tls \
  --set ingress.tls[0].hosts[0]=ied.production.com
```

### High Availability Setup

Deploy with 3 replicas and anti-affinity:

```bash
helm install dome-ied ./helm \
  --set ied.replicaCount=3 \
  --set ied.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[0].weight=100 \
  --set ied.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[0].podAffinityTerm.topologyKey=kubernetes.io/hostname
```

## Upgrading

### Upgrade to New Version

```bash
helm upgrade dome-ied ./helm \
  --set ied.image.tag=1.1.0 \
  --reuse-values
```

### Rollback

```bash
helm rollback dome-ied
```

## Uninstallation

```bash
helm uninstall dome-ied
```

**Note**: This will NOT delete PersistentVolumeClaims. To delete them:

```bash
kubectl delete pvc -l app.kubernetes.io/instance=dome-ied
```

## Monitoring and Debugging

### Check Pod Status

```bash
kubectl get pods -l app.kubernetes.io/name=dome-ied
```

### View IED Logs

```bash
kubectl logs -l app.kubernetes.io/component=ied -f
```

### View Redis Logs

```bash
kubectl logs -l app.kubernetes.io/component=redis -f
```

### Access Health Endpoint

```bash
# Port-forward to local machine
kubectl port-forward svc/dome-ied 8080:8080

# Check health
curl http://localhost:8080/health

# Check stats
curl http://localhost:8080/stats

# View API docs
open http://localhost:8080/api-docs
```

### Connect to Redis

```bash
kubectl exec -it dome-ied-redis-0 -- redis-cli
```

## Troubleshooting

### IED Pods Not Starting

1. Check if Redis is ready:
   ```bash
   kubectl get pods -l app.kubernetes.io/component=redis
   ```

2. Check init container logs:
   ```bash
   kubectl logs <ied-pod-name> -c wait-for-redis
   ```

3. Check IED logs:
   ```bash
   kubectl logs <ied-pod-name>
   ```

### Adapters Not Reachable

Check adapter configuration in ConfigMap:

```bash
kubectl get configmap dome-ied -o yaml | grep ADAPTER_URL
```

### Redis Connection Issues

1. Verify Redis service:
   ```bash
   kubectl get svc dome-ied-redis
   ```

2. Test connection from IED pod:
   ```bash
   kubectl exec -it <ied-pod> -- nc -zv dome-ied-redis 6379
   ```

## Architecture

```
┌─────────────────────────────────────┐
│     Ingress (optional)              │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   IED Service (ClusterIP)           │
│   - Port: 8080                       │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│   IED Pods (Deployment)              │
│   - Health checks: /health           │
│   - API: /api/v1/*                   │
│   - Internal: /internal/*            │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│   Redis (StatefulSet)                │
│   - Port: 6379                       │
│   - Persistent Storage               │
└──────────────────────────────────────┘
```

## Security Considerations

1. **Redis Authentication**: Always enable `redis.auth.enabled=true` in production
2. **Ingress TLS**: Use TLS/HTTPS for external access
3. **Resource Limits**: Set appropriate limits to prevent resource exhaustion
4. **Network Policies**: Consider implementing network policies to restrict traffic
5. **Image Scanning**: Scan images for vulnerabilities before deployment
6. **Secrets Management**: Use Kubernetes secrets or external secret managers

## License

ISC License

## Support

For issues and questions:
- GitHub Issues: https://github.com/dome-project/interchain-event-distributor/issues
- Documentation: See main project README
