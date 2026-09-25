# BEZZO API Kubernetes deployment template

`api.yaml` provides a cloud-neutral starting point for the API tier: three replicas, readiness-aware
service balancing, TLS ingress, graceful rolling updates, a disruption budget, and CPU/memory autoscaling.
All replicas must share the same PostgreSQL, Redis, search, and object-storage services through the
`bezzo-api-secrets` Secret. Do not place secret values in this directory.

Before applying it, replace the sample image and hostname, create the API secrets and TLS Secret, install
the NGINX Ingress controller plus metrics-server, configure the cloud load balancer and WAF, and set
resource thresholds using production load tests. The ingress balances only ready pods; `/health/ready`
is the readiness gate and `/health/live` is the process liveness gate. The deployment does not create
the database, Redis, search, workers, CDN, WAF, TLS certificate, or object storage.

API JSON/text responses negotiate `zstd`, then Brotli, then gzip. The API requires Node.js 22.15 or later
for native Zstandard support; ingress/CDN operators should preserve `Accept-Encoding` negotiation and
`Vary: Accept-Encoding`. Compression at the edge can be enabled for cacheable public content as well.
Never cache private buyer or supplier responses at a shared CDN.
