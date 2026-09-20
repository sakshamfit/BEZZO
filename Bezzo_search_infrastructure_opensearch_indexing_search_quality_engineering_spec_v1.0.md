# Bezzo Search Infrastructure, OpenSearch Indexing & Search Quality Engineering Specification v1.0

## 1. Purpose

Production engineering specification for Bezzo search using OpenSearch/Elasticsearch-compatible infrastructure.

Covers:
- cluster architecture and sizing
- product/listing/search index strategy
- pharmaceutical-aware mappings and analyzers
- autocomplete, typo tolerance, normalization and synonyms
- filters, facets and eligibility
- buyer marketplace search and supplier-private search
- ranking and multi-supplier result composition
- incremental/full indexing and domain events
- versioned indexes and alias rollout
- consistency, freshness and caching
- performance, scaling and query protection
- security and tenant isolation
- search analytics, relevance evaluation and experimentation
- failure handling, reconciliation and disaster recovery
- implementation structure, testing and Definition of Done

Search is a discovery/read projection. PostgreSQL and domain services remain authoritative for inventory, reservations, orders, payments, eligibility, pricing and compliance.

---

## 2. Architecture

```text
Web / Android / iOS
        |
        v
API / BFF
        |
        v
Search Application
   |            |
   v            v
Redis       OpenSearch
               ^
               |
        Search Index Workers
               ^
               |
          Domain Events
               ^
               |
       Domain Services
               |
               v
          PostgreSQL
               ^
               |
       ERP / POS adapters
```

The search application owns query parsing, normalization, filter construction, security constraints, ranking configuration, result shaping, facets, autocomplete, analytics and caching. OpenSearch performs retrieval, scoring, filtering, aggregations and sorting.

---

## 3. OpenSearch Cluster

Use a managed OpenSearch-compatible deployment where practical. Start with a small production topology and scale from measured workload.

Scale dimensions:
- query throughput
- indexing throughput
- storage
- memory
- replicas
- shards
- coordinating capacity

Sizing inputs:
- canonical product count
- supplier listing count
- searchable batch count where applicable
- document size
- average/peak query rate
- indexing rate
- aggregation workload
- growth rate
- recovery requirements

Avoid excessive shards. Shard count must be justified by dataset size, throughput and recovery requirements.

Use replicas for production availability and query capacity.

---

## 4. Index Strategy

Recommended logical indexes:

```text
bezzo-products-vN
bezzo-supplier-listings-vN
bezzo-search-suggestions-vN
bezzo-search-analytics-vN
```

A denormalized marketplace index may be introduced when query latency or join/composition requirements justify it.

### Canonical product index

Contains searchable canonical catalog data:
- product name
- brand
- generic/active ingredient
- composition
- strength
- dosage form
- manufacturer
- category
- aliases
- catalog identifiers

### Supplier listing index

Contains supplier-specific marketplace data:
- supplier/listing identity
- price
- MRP
- stock projection
- serviceability
- delivery signals
- marketplace status

### Search suggestion index

Optimized for low-latency autocomplete and controlled suggestion retrieval.

Analytics should be separated from operational search indexes where practical.

---

## 5. Marketplace Search Document

For high-performance buyer search, a denormalized product-level document may contain:

```json
{
  "product_id": "uuid",
  "canonical_product": {
    "name": "...",
    "brand_name": "...",
    "generic_name": "...",
    "composition": ["..."],
    "strength": "...",
    "dosage_form": "...",
    "manufacturer": "...",
    "category_ids": ["..."]
  },
  "supplier_offers": [],
  "availability": {
    "has_stock": true,
    "supplier_count": 0
  },
  "status": "ACTIVE"
}
```

Do not allow unbounded supplier arrays. If supplier offer counts become large, use listing documents and application-side composition.

Denormalize only frequently searched/filtered/ranked fields. Never treat the projection as authoritative.

---

## 6. Pharmaceutical Search Model

Searchable fields may include:
- product name
- brand name
- generic/active ingredient name
- composition
- strength
- dosage form
- pack size
- manufacturer
- category
- therapeutic class where governed by the catalog
- approved aliases
- SKU and catalog identifiers
- supplier SKU where supplier-private context permits it

Search is for catalog discovery. It must not infer medical suitability, diagnosis, prescribing or therapeutic equivalence.

---

## 7. Field Mappings

Use explicit mappings.

**Keyword/exact fields**
- IDs
- statuses
- supplier IDs
- category IDs
- SKUs
- product codes
- Boolean flags

**Analyzed text**
- product name
- brand
- generic
- composition
- manufacturer
- approved search aliases

**Numeric**
- structured strength values where available
- pack quantity
- price
- MRP
- stock quantity
- ETA

**Date**
- catalog timestamps
- listing updates
- freshness timestamps
- analytics timestamps

Keep reliable pharmaceutical values structured rather than relying exclusively on free text.

---

## 8. Analyzers and Normalization

Normalize:
- case
- whitespace
- Unicode variants
- safe punctuation/hyphenation differences
- approved spelling variants
- product formatting differences

For example, compatible representations of a product name such as:

```text
Amoxycillin 500 mg
amoxicillin-500mg
AMOXICILLIN 500 MG
```

may be normalized for retrieval without changing canonical product identity.

Normalization must never mutate authoritative catalog data.

---

## 9. Synonyms

Synonyms must be governed and versioned.

Possible classes:
- approved brand aliases
- generic-name aliases
- common catalog abbreviations
- dosage-form abbreviations
- approved search terminology

Each synonym set requires:
- owner
- version
- effective date
- review status
- rollback capability

Do not infer clinical equivalence merely from textual similarity.

---

## 10. Typo Tolerance

Use controlled typo tolerance:

```text
Exact
  -> Prefix
  -> Phrase
  -> Normalized
  -> Limited fuzzy
```

Exact identifiers should prefer exact matching. Avoid unrestricted fuzzy matching that can surface unrelated pharmaceutical products.

---

## 11. Autocomplete

Autocomplete should:
- start after a configurable minimum character count
- return compact results
- avoid expensive aggregations
- cache common prefixes
- use product/brand/generic/manufacturer/category signals
- respect marketplace visibility and eligibility
- never expose private supplier information

Target autocomplete latency: p95 below approximately 100 ms at the service boundary under agreed production load.

---

## 12. Query Types

Support:
- exact
- phrase
- prefix
- multi-field full text
- filtered search
- relevance sort
- price sort
- availability sort
- delivery ETA sort
- recent-update sort

The server converts business-level request parameters into controlled OpenSearch DSL. Clients must never submit arbitrary OpenSearch DSL.

---

## 13. Filters and Facets

Supported facets may include:
- category
- manufacturer
- brand
- dosage form
- strength
- price range
- availability
- delivery mode
- supplier
- legally appropriate prescription/restriction metadata

Use structured fields for aggregations. Avoid aggregating unrestricted analyzed text.

---

## 14. Availability and Eligibility

Search may project:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
UNKNOWN
STALE
```

Thresholds are configurable.

Availability and eligibility filters can consider:
- supplier active/verified status
- product marketplace status
- buyer eligibility
- geographic serviceability
- regulatory availability
- prescription/restriction rules
- state-specific constraints where configured

Frontend filtering is never a security boundary.

Search never reserves inventory. Cart/checkout/order services revalidate authoritative state.

---

## 15. Buyer Marketplace Search

Buyer search must not expose:
- private supplier data
- internal supplier notes
- supplier purchase cost
- integration credentials/metadata
- audit information
- unauthorized inventory details

Only approved marketplace fields are returned.

Location-aware results may use serviceability, delivery zone and ETA, but final serviceability must be revalidated before order placement.

---

## 16. Supplier-Private Search

Supplier search can cover:
- its products/listings
- SKUs
- inventory
- batches
- import mappings
- authorized orders

Every query must include server-derived tenant constraints.

Conceptually:

```text
supplier_id = authenticated_supplier_id
```

Never trust a client-supplied supplier ID for authorization.

---

## 17. Multi-Supplier Search

A canonical product can have multiple supplier offers.

Results may summarize:
- stock
- price
- delivery capability
- ETA
- marketplace eligibility

Final supplier selection and inventory reservation remain in authoritative fulfillment/order logic.

Search must not promise a specific supplier commitment merely because a listing is indexed.

---

## 18. Ranking

Ranking must be explicit, versioned and testable.

Conceptual order:

```text
Hard eligibility
  -> exact identity relevance
  -> text relevance
  -> structured-field relevance
  -> availability
  -> delivery signal
  -> configured commercial signals
  -> tie breakers
```

Potential signals:
- exact name match
- exact brand match
- generic match
- composition match
- phrase/prefix match
- popularity
- click-through
- add-to-cart
- conversion
- availability
- supplier coverage
- delivery capability

Popularity/commercial signals never override hard eligibility or safety constraints.

---

## 19. Zero Results

Zero-result handling:
1. normalize query
2. retry safe spelling normalization
3. apply controlled synonym expansion
4. try appropriate partial/prefix matching
5. offer relevant category/navigation suggestions
6. record zero-result analytics

Never automatically substitute a clinically different product.

Clearly distinguish:
- no exact result
- similar catalog match
- temporarily unavailable result

---

## 20. Indexing Pipeline

```text
Domain service
    |
    v
Domain event
    |
    v
Queue
    |
    v
Search index worker
    |
    +--> validate
    +--> transform
    +--> enrich
    +--> index
    |
    v
OpenSearch
```

Relevant events:
- ProductCreated
- ProductUpdated
- ProductStatusChanged
- SupplierListingCreated
- SupplierListingUpdated
- InventoryChanged
- SupplierVerificationChanged
- ProductEligibilityChanged
- CategoryChanged
- ManufacturerChanged

Indexing jobs should contain entity ID, event ID, entity version, timestamp and operation.

Workers must be idempotent, and stale events must not overwrite newer versions.

---

## 21. Full Reindexing

Required for:
- mapping changes
- analyzer changes
- synonym changes requiring rebuild
- schema changes
- ranking-field additions
- catalog transformation
- major search-quality changes

Never destructively rebuild the only live index.

Use versioned indexes and aliases:

```text
bezzo-products-v1
bezzo-products-v2

bezzo-products-read
bezzo-products-write
```

Rollout:

```text
Create new index
 -> backfill
 -> validate
 -> relevance test
 -> switch read alias atomically
 -> monitor
 -> retain old index for rollback window
```

---

## 22. Consistency and Freshness

Search is eventually consistent.

Initial engineering targets:
- product metadata: seconds to low minutes
- listing changes: seconds
- inventory projection: seconds where event infrastructure permits
- analytics: asynchronous

The exact SLA is established through production measurement.

Inventory projections should include:

```text
inventory_updated_at
inventory_source
inventory_version
inventory_sync_status
```

If stale beyond a configured threshold, mark the projection stale/unknown and require authoritative validation.

---

## 23. Cache Integration

Redis may cache:
- popular searches
- autocomplete prefixes
- stable category searches
- common facet queries

Cache keys must include all result-affecting context:

```text
search:
context_hash:
location:
query:
filters:
sort:
page:
```

Private supplier searches must never share public cache keys.

Use shorter TTLs for inventory-sensitive searches and longer TTLs for stable catalog metadata.

---

## 24. Performance and Query Protection

Initial targets:
- autocomplete p95 < 100 ms
- standard search p95 < 250 ms
- complex filtered search p95 < 400 ms
- bounded search timeout
- indexing events normally processed within seconds

These are engineering targets, not guarantees.

Enforce:
- maximum page size
- maximum query length
- filter limits
- aggregation limits
- request timeout
- rate limits
- payload validation

Use search-after/cursor pagination for deep navigation. Avoid unrestricted deep offsets.

---

## 25. Security

Controls:
- private OpenSearch networking
- TLS
- least-privilege credentials
- no direct browser/mobile OpenSearch access
- server-enforced tenant filters
- rate limiting
- audit logging for administrative operations
- secret rotation

OpenSearch credentials must never be shipped in web or mobile clients.

---

## 26. ERP/POS Integration Boundary

External inventory systems must flow through the integration pipeline:

```text
ERP/POS
 -> adapter
 -> validation
 -> staging
 -> authoritative domain update
 -> domain event
 -> search projection
```

External systems must not write directly into OpenSearch.

---

## 27. Promotions, Pricing and Images

Search may display current projected price and promotional signals, but:
- checkout recalculates authoritative totals
- expired promotions cannot remain actionable
- promotion eligibility is server-enforced

Search documents contain image references/URLs, never binary image content.

---

## 28. Recall, Expiry and Moderation

Marketplace-searchable products must have an eligible catalog status.

Recall, expiry, regulatory restriction or supplier suspension must update the search projection promptly.

Critical transactional checks remain outside OpenSearch.

Buyer search generally should not expose unnecessary batch-level details. Batch-level search is primarily for supplier/warehouse operations.

---

## 29. Observability

Track infrastructure:
- CPU
- memory/heap
- disk
- shard/replica health
- query latency
- indexing latency

Track application:
- requests
- errors
- timeouts
- cache hit rate
- zero-result rate
- autocomplete latency

Track quality:
- click-through
- add-to-cart
- search-to-order conversion
- reformulation
- no-click queries
- top/failed queries

Search analytics should minimize unnecessary personal information.

---

## 30. Relevance Evaluation

Maintain a versioned curated dataset:

```text
query
expected_product_ids
acceptable_product_ids
unacceptable_product_ids
test_reason
dataset_version
```

Cover:
- exact product names
- brand
- generic
- composition
- strength
- pack size
- manufacturer
- misspellings
- abbreviations
- mixed case
- numeric/alphanumeric input
- zero-result cases

Track:
- Precision@K
- Recall@K
- MRR
- NDCG@K
- zero-result rate
- search-to-click
- search-to-cart
- search-to-order

Every search-ranking release runs regression relevance tests.

---

## 31. Experimentation

Ranking configurations are versioned:

```text
ranking_version = v1
ranking_version = v2
```

Experiments must be:
- measurable
- reversible
- privacy-safe
- constrained by hard eligibility rules
- associated with configuration versions

---

## 32. Failure and Fallback

If OpenSearch is unavailable:
1. return safe cached results where available
2. return limited navigation/category data where possible
3. fail gracefully
4. hide internal errors
5. never fabricate results

Index failures use:
- retry with backoff
- dead-letter queue
- attempt count
- event/entity/version identifiers
- failure reason

Reconciliation compares authoritative PostgreSQL state against search projections and creates repair jobs.

---

## 33. Disaster Recovery

Search is rebuildable from authoritative data.

Version-control:
- mappings
- analyzers
- synonym sets
- query templates
- ranking configuration
- relevance datasets
- index configuration

Recovery:

```text
Restore infrastructure
 -> create indexes
 -> rebuild/replay from PostgreSQL
 -> validate
 -> switch aliases
```

Search recovery must not depend on undocumented manual configuration.

---

## 34. Backend Implementation Structure

```text
src/modules/search/
  application/
    search.service.ts
    autocomplete.service.ts
    relevance.service.ts
  domain/
    search-query.ts
    search-filters.ts
    ranking-policy.ts
  infrastructure/
    opensearch.client.ts
    product-search.repository.ts
    listing-search.repository.ts
    suggestion.repository.ts
    query-builders/
  indexing/
    index-worker.ts
    index-transformer.ts
    index-versioning.service.ts
    reconciliation.service.ts
  analytics/
    search-analytics.service.ts
  dto/
  tests/
```

Worker structure:

```text
workers/search-indexer/
  event-consumer.ts
  product-indexer.ts
  listing-indexer.ts
  inventory-indexer.ts
  transformation/
  validation/
  retry/
  dead-letter/
  reconciliation/
```

Workers should be stateless where possible.

---

## 35. API Contract

Example:

```http
GET /api/v1/search/products?q=amoxicillin&category_id=...
```

Response shape:

```json
{
  "items": [],
  "facets": {},
  "pagination": {
    "next_cursor": null
  },
  "search": {
    "query": "amoxicillin",
    "result_count": 0
  }
}
```

The authoritative API specification remains the contract source.

---

## 36. Load and Security Testing

Load tests cover:
- popular searches
- autocomplete
- multi-filter searches
- high-cardinality facets
- concurrent buyers
- supplier-private search
- indexing bursts
- inventory update bursts
- reindexing
- cache cold starts
- OpenSearch node failure

Security tests cover:
- cross-supplier data access
- buyer access to private supplier fields
- arbitrary DSL injection
- query abuse
- cursor tampering
- unauthorized filters
- analytics leakage
- direct OpenSearch exposure

Measure p50/p95/p99, throughput, errors and saturation.

---

## 37. Deployment and Environment Isolation

Environments:
- development
- staging
- production

Production index changes use:

```text
build -> validate -> backfill -> test -> alias switch -> monitor -> rollback if needed
```

Each environment has isolated:
- search cluster/domain
- credentials
- index names
- cache
- analytics
- monitoring
- configuration

Production data must not be casually copied into development.

---

## 38. Cost Management

Control cost through:
- right-sized shards
- appropriate replicas
- query caching
- bounded aggregations
- lifecycle policies where appropriate
- avoiding unnecessary reindexing
- storage-growth monitoring
- separate analytics workloads where needed

Cost optimization must not weaken required security or availability.

---

## 39. Governance

| Area | Owner |
|---|---|
| Index schema | Engineering |
| Catalog fields | Catalog/Admin |
| Synonyms | Catalog + Compliance review |
| Ranking | Product + Engineering |
| Eligibility filters | Compliance + Engineering |
| Search analytics | Product/Data |
| Infrastructure | Platform/DevOps |
| Incident response | SRE/Engineering |

Ownership can be adapted as Bezzo's organization evolves.

---

## 40. Definition of Done

Complete when:
- secure OpenSearch is provisioned
- mappings are version controlled
- product and supplier listing indexing work
- inventory projections update correctly
- full-text and exact matching work
- autocomplete works
- filters/facets work
- eligibility filters are enforced
- supplier-private search is tenant-safe
- ranking is configurable and versioned
- zero-result handling works
- analytics are recorded
- caching works
- query protection is active
- incremental indexing is idempotent
- full reindexing works
- alias rollout and rollback work
- reconciliation works
- dead-letter handling works
- monitoring and alerts exist
- relevance regression tests pass
- load tests pass agreed targets
- search fallback works
- disaster-recovery rebuild is tested
- security tests pass

---

## 41. Final Architecture

```text
                         USERS
                           |
                           v
                    Web / Android / iOS
                           |
                           v
                    API / BFF Layer
                           |
                           v
                    Search Application
                     /      |                           /       |                           v        v         v
               Redis    OpenSearch   Analytics
                           ^
                           |
                    Indexing Workers
                           ^
                           |
                      Domain Events
                           ^
                           |
                   Domain Services
                           |
                           v
                       PostgreSQL
                           ^
                           |
                    ERP / POS / Supplier
                    Integration Pipeline
```

**Core rule: OpenSearch is a high-performance projection for discovery, not the source of truth.**
