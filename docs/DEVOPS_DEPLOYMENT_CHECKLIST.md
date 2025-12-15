# DOME IED - DevOps Deployment Checklist

**Date:** December 15, 2025
**Version:** 1.0.0
**Status:** Ready for infrastructure setup

---

## Pre-Deployment Summary

The DOME Interchain Event Distributor (IED) codebase is **100% complete** and tested:
- 252 tests passing (unit, integration, E2E)
- Docker and Helm charts ready
- OpenAPI documentation at `/api-docs`

This checklist covers infrastructure tasks required before production deployment.

---

## 1. Infrastructure Requirements

### 1.1 Kubernetes Cluster
- [ ] Kubernetes cluster available (v1.24+)
- [ ] kubectl configured and authenticated
- [ ] Helm v3 installed
- [ ] Ingress controller deployed (nginx recommended)
- [ ] cert-manager installed (for TLS certificates)

### 1.2 Container Registry
- [ ] Private container registry available
- [ ] IED image built and pushed: `your-registry.io/dome-ied:1.0.0`
- [ ] Image pull secrets configured in cluster

**Build commands:**
```bash
cd dome-ied
docker build -t your-registry.io/dome-ied:1.0.0 .
docker push your-registry.io/dome-ied:1.0.0
```

---

## 2. DLT Adapters

### 2.1 HashNET Adapter
- [ ] HashNET stagenet infrastructure deployed
- [ ] HashNET adapter running and healthy
- [ ] Adapter URL confirmed: `http://hashnet-adapter.dome-adapters.svc.cluster.local:8080`
- [ ] Health check passing: `GET /health`

### 2.2 Alastria Adapter
- [ ] Alastria adapter deployed (already tested on testnet)
- [ ] Adapter URL confirmed: `http://alastria-adapter.dome-adapters.svc.cluster.local:8080`
- [ ] Health check passing: `GET /health`
- [ ] Blockchain RPC endpoint accessible

---

## 3. Redis Configuration

### 3.1 Production Redis Setup
- [ ] Redis deployed (recommend Redis Sentinel or Redis Cluster for HA)
- [ ] Persistence enabled (AOF + RDB)
- [ ] Memory limit configured (minimum 512Mi recommended)
- [ ] Password authentication enabled

### 3.2 Redis Connection Details
```yaml
REDIS_HOST: redis.dome-ied.svc.cluster.local
REDIS_PORT: 6379
REDIS_PASSWORD: <from-secret>
REDIS_DB: 0
```

### 3.3 Redis Persistence Settings
```
appendonly yes
save 900 1
save 300 10
save 60 10000
```

---

## 4. Secrets Management

### 4.1 Required Secrets
Create Kubernetes secret with the following:

```bash
kubectl create secret generic dome-ied-secrets \
  --namespace dome-ied \
  --from-literal=REDIS_PASSWORD='<strong-password>'
```

### 4.2 Optional Secrets (if using external services)
- [ ] API keys for external services
- [ ] TLS certificates (if not using cert-manager)

---

## 5. Environment Configuration

### 5.1 Production Environment Variables

Update `helm/values-production.yaml` with actual values:

```yaml
ied:
  image:
    repository: your-registry.io/dome-ied  # UPDATE
    tag: "1.0.0"                            # UPDATE

  env:
    nodeEnv: production
    logLevel: info
    logFormat: json
    adapterTimeoutMs: 10000
    notificationTimeoutMs: 10000
    healthCheckIntervalMs: 30000
    maxRetryAttempts: 3
    retryDelayMs: 1000
    replicationDelayMs: 15000              # DO NOT CHANGE - prevents duplicates
    internalSubscriptionEventTypes: "*"
    internalSubscriptionMetadata: "prd"    # Production environment tag
    iedBaseUrl: "http://dome-ied.dome-ied.svc.cluster.local:8080"  # UPDATE - for webhook callbacks

adapters:
  hashnet:
    url: "http://hashnet-adapter.dome-adapters.svc.cluster.local:8080"  # UPDATE
    chainId: "1"

  alastria:
    url: "http://alastria-adapter.dome-adapters.svc.cluster.local:8080"  # UPDATE
    chainId: "2"

ingress:
  enabled: true
  hosts:
    - host: ied.dome-marketplace.eu        # UPDATE with actual domain
  tls:
    - secretName: ied-tls
      hosts:
        - ied.dome-marketplace.eu          # UPDATE with actual domain
```

### 5.2 Critical Settings (DO NOT MODIFY)

| Setting | Value | Reason |
|---------|-------|--------|
| `replicationDelayMs` | 15000 | Prevents duplicate events during network propagation |
| `internalSubscriptionEventTypes` | "*" | Subscribe to all events for replication |
| `HASHNET_CHAIN_ID` | "1" | Redis key format per specification |
| `ALASTRIA_CHAIN_ID` | "2" | Redis key format per specification |

---

## 6. TLS/SSL Configuration

### 6.1 Using cert-manager (Recommended)
```yaml
# In values-production.yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  tls:
    - secretName: ied-tls
      hosts:
        - ied.dome-marketplace.eu
```

### 6.2 Using Existing Certificates
```bash
kubectl create secret tls ied-tls \
  --namespace dome-ied \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

---

## 7. Deployment Steps

### 7.1 Create Namespace
```bash
kubectl create namespace dome-ied
```

### 7.2 Create Secrets
```bash
kubectl create secret generic dome-ied-secrets \
  --namespace dome-ied \
  --from-literal=REDIS_PASSWORD='<password>'
```

### 7.3 Deploy with Helm
```bash
cd dome-ied

# Lint chart first
helm lint ./helm -f helm/values-production.yaml

# Dry run to verify
helm install dome-ied ./helm \
  --namespace dome-ied \
  --values helm/values-production.yaml \
  --dry-run

# Actual deployment
helm install dome-ied ./helm \
  --namespace dome-ied \
  --values helm/values-production.yaml
```

### 7.4 Verify Deployment
```bash
# Check pods
kubectl get pods -n dome-ied

# Check services
kubectl get svc -n dome-ied

# Check ingress
kubectl get ingress -n dome-ied

# View logs
kubectl logs -n dome-ied -l app.kubernetes.io/name=dome-ied -f
```

---

## 8. Post-Deployment Validation

### 8.1 Health Checks
```bash
# IED Health
curl https://ied.dome-marketplace.eu/health

# Expected response:
{
  "status": "UP",
  "timestamp": "2025-12-15T19:30:00.000Z",
  "redis": "UP",
  "adapters": [
    { "name": "hashnet", "status": "UP" },
    { "name": "alastria", "status": "UP" }
  ],
  "subscriptions": 0
}
```

### 8.2 API Documentation
```bash
# OpenAPI/Swagger UI
curl https://ied.dome-marketplace.eu/api-docs
```

### 8.3 Functional Test
```bash
# Publish test event
curl -X POST https://ied.dome-marketplace.eu/api/v1/publishEvent \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "TestEvent",
    "dataLocation": "https://example.com/test?hl=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "relevantMetadata": ["test"],
    "entityId": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "previousEntityHash": "0x0000000000000000000000000000000000000000000000000000000000000000"
  }'
```

### 8.4 Redis Verification
```bash
# Connect to Redis and check keys (with authentication)
kubectl exec -it -n dome-ied <redis-pod> -- redis-cli -a $REDIS_PASSWORD --no-auth-warning

# Check published events
KEYS publishedEvents:*
SCARD publishedEvents:1
SCARD publishedEvents:2
```

---

## 9. SonarQube Code Quality (Optional)

### 9.1 Coverage Report Generation

The project generates SonarQube-compatible coverage reports:

```bash
# Generate coverage (creates coverage/lcov.info)
npm run test:coverage

# Current coverage: 80.72%
```

### 9.2 SonarQube Scanner

Configuration file: `sonar-project.properties`

```bash
# Run SonarQube scanner (requires sonar-scanner CLI or use npx)
npx sonar-scanner \
  -Dsonar.host.url=https://sonarqube.your-domain.com \
  -Dsonar.login=$SONAR_TOKEN
```

### 9.3 SonarCloud Alternative

For hosted solution without self-managed server:

```bash
npx sonar-scanner \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.organization=your-org \
  -Dsonar.login=$SONAR_TOKEN
```

### 9.4 CI/CD Integration

Add to GitHub Actions workflow:

```yaml
- name: SonarQube Scan
  uses: sonarsource/sonarqube-scan-action@master
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```

---

## 10. Monitoring (Optional but Recommended)

### 10.1 Prometheus Metrics
- [ ] ServiceMonitor configured for IED pods
- [ ] Alerts configured for:
  - Pod restarts
  - High error rate
  - Adapter health failures
  - Redis connection issues

### 10.2 Log Aggregation
- [ ] Logs shipped to centralized system (ELK, Loki, etc.)
- [ ] Log format: JSON (configured via `LOG_FORMAT=json`)

### 10.3 Grafana Dashboard
- [ ] Dashboard for IED metrics
- [ ] Panels for:
  - Request rate
  - Error rate
  - Replication latency
  - Cache size

---

## 11. Rollback Procedure

### 11.1 Helm Rollback
```bash
# List releases
helm history dome-ied -n dome-ied

# Rollback to previous version
helm rollback dome-ied <revision> -n dome-ied
```

### 11.2 Emergency Procedures
```bash
# Scale down IED (stop processing)
kubectl scale deployment dome-ied -n dome-ied --replicas=0

# Scale back up
kubectl scale deployment dome-ied -n dome-ied --replicas=2
```

---

## 12. Checklist Summary

### Before Deployment
- [ ] Container registry configured
- [ ] IED image built and pushed
- [ ] DLT adapters deployed and healthy
- [ ] Redis deployed with persistence
- [ ] Secrets created
- [ ] TLS certificates ready
- [ ] DNS configured for ingress host

### During Deployment
- [ ] Helm lint passed
- [ ] Helm dry-run successful
- [ ] Helm install completed
- [ ] All pods running

### After Deployment
- [ ] Health endpoint returns healthy
- [ ] All adapters connected
- [ ] Redis connected
- [ ] Test event published successfully
- [ ] Swagger UI accessible

---

## 13. Support Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| IED Development | [Dev Team] | Code issues, bug fixes |
| HashNET Team | [HashNET Contact] | HashNET adapter/stagenet |
| Alastria Team | [Alastria Contact] | Alastria adapter/network |
| DevOps | [DevOps Team] | Infrastructure, deployment |

> **Note:** Replace placeholder contacts `[...]` with actual team information before deployment.

---

## 14. Reference Documentation

- IED README: `dome-ied/README.md`
- Helm Chart: `dome-ied/helm/README.md`
- API Spec: `dome-ied/docs/DOME_Interchain_Event_Distributor.md`
- Redis Schema: `dome-ied/docs/REDIS_SCHEMA_CHEATSHEET.md`

---

**Document Version:** 1.0.0
**Last Updated:** December 15, 2025
**Author:** DOME IED Development Team
