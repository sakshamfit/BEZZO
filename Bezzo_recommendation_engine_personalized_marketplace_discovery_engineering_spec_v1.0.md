# Bezzo Recommendation Engine & Personalized Marketplace Discovery Engineering Specification v1.0

## 1. Purpose

This document defines the engineering design for recommendation and personalized marketplace discovery in Bezzo.

The system is intended to help medical-store buyers discover relevant catalog products, suppliers, replenishment opportunities, and marketplace content without compromising pharmaceutical eligibility, supplier isolation, pricing correctness, inventory correctness, or regulatory controls.

Recommendation is a discovery layer. It must never replace authoritative validation for:
- product eligibility
- buyer eligibility
- inventory availability
- price
- promotion eligibility
- prescription/restriction rules
- supplier status
- order placement

The recommendation system must be explainable, measurable, reversible, and safe to operate.

---

## 2. Goals

Primary goals:

1. Improve product discovery.
2. Reduce search and discovery friction.
3. Surface relevant products for repeat business purchasing.
4. Support supplier/product discovery.
5. Support replenishment-oriented workflows.
6. Improve marketplace engagement while respecting hard constraints.
7. Provide measurable recommendation quality.
8. Start with deterministic/rule-based methods and evolve toward machine learning when sufficient data exists.

Non-goals:

- Medical diagnosis.
- Treatment recommendation.
- Prescription generation.
- Clinical decision support.
- Automatically declaring one medicine therapeutically equivalent to another.
- Bypassing catalog, compliance, or eligibility rules.

---

## 3. Recommendation Architecture

```text
Buyer Apps / Web
       |
       v
Recommendation API
       |
       +------------------+
       |                  |
       v                  v
 Redis Cache       Recommendation Engine
                          |
             +------------+-------------+
             |            |             |
             v            v             v
        Candidate      Ranking       Policy/
        Generation     Engine        Eligibility
             |            |             |
             +------------+-------------+
                          |
                          v
                 Catalog / Search Data
                          |
                          v
                    PostgreSQL
                          ^
                          |
                 Event / Analytics Bus
                          ^
                          |
              Buyer & Marketplace Events
```

The recommendation API is responsible for:
- request validation
- buyer context
- candidate retrieval
- hard filtering
- ranking
- result shaping
- explanation metadata
- caching
- analytics events

---

## 4. Core Principle: Filter Before Rank

Recommendations must follow:

```text
Candidate Generation
        |
        v
Hard Eligibility Filtering
        |
        v
Business Policy Filtering
        |
        v
Ranking
        |
        v
Diversity / Deduplication
        |
        v
Result
```

No ranking score can override a hard restriction.

Examples of hard filters:
- inactive product
- suspended supplier
- buyer not eligible
- unavailable marketplace listing
- geographic/serviceability restriction
- legally restricted product
- recalled or blocked catalog entity

---

## 5. Recommendation Surfaces

Initial recommendation surfaces may include:

### Home marketplace

- Recommended for your store
- Frequently purchased
- Reorder suggestions
- Recently viewed
- Popular in your category
- New relevant products

### Product detail

- Similar catalog products
- Related products
- Other available supplier offers
- Replenishment suggestions

### Cart

- Relevant add-ons where commercially and operationally appropriate
- Reorder reminders
- Frequently purchased products not currently in cart

### Search

- Related queries
- Similar catalog results
- Search refinement suggestions

### Buyer dashboard

- Reorder list
- Recent purchasing patterns
- Frequently purchased products

Recommendations must remain catalog-discovery features rather than clinical advice.

---

## 6. Buyer Context

The system may use permitted marketplace context such as:

- buyer account
- buyer organization/store
- previous purchases
- viewed products
- searches
- cart interactions
- favorite/saved products
- preferred delivery behavior
- marketplace location/serviceability
- supplier relationships where authorized
- category purchasing history

Do not use sensitive personal information unnecessarily.

Buyer-level recommendation data must remain private to the authorized buyer/organization.

---

## 7. Supplier Context

Supplier-specific recommendation views may use:

- supplier catalog
- supplier inventory
- supplier sales history
- supplier listing performance
- supplier search activity
- supplier category coverage

Supplier-private recommendation data must never leak to another supplier.

The buyer marketplace must not expose private supplier analytics.

---

## 8. Event Tracking

Recommendation quality depends on reliable event collection.

Recommended events:

```text
ProductViewed
SearchPerformed
SearchResultClicked
ProductAddedToCart
ProductRemovedFromCart
ProductPurchased
ProductReordered
ProductSaved
RecommendationShown
RecommendationClicked
RecommendationAddedToCart
RecommendationPurchased
RecommendationDismissed
```

Each event should include:

```text
event_id
event_type
timestamp
buyer_context
product_id where applicable
recommendation_surface where applicable
recommendation_request_id
ranking_version
session_id where applicable
```

Avoid collecting unnecessary personal data.

---

## 9. Event Reliability

Events should be:

- idempotent where appropriate
- timestamped
- versioned
- asynchronously processed where possible
- replayable where required

Recommendation decisions should not depend on a single client event arriving successfully.

Transactional purchase data remains authoritative in order services.

---

## 10. Candidate Generation

Candidate generation should combine multiple sources.

Initial candidate sources:

1. Recently viewed
2. Frequently purchased
3. Reorder candidates
4. Category-based candidates
5. Search-derived candidates
6. Similar catalog metadata
7. Popular marketplace products
8. Supplier-specific eligible listings
9. New catalog products
10. Business-configured collections

Each source should have a source identifier.

Example:

```text
candidate_source = FREQUENTLY_PURCHASED
candidate_source = REORDER
candidate_source = CATEGORY_POPULAR
candidate_source = SIMILAR_PRODUCT
```

---

## 11. Reorder Recommendations

Reorder recommendations are especially relevant for B2B pharmacy purchasing.

Signals may include:

- previous purchase frequency
- average purchase interval
- recent purchase date
- historical quantity
- recent availability
- buyer-selected reorder behavior

A reorder candidate must not imply that the buyer medically needs the product.

The UI should use neutral purchasing language such as:
- Reorder
- Purchased before
- Frequently purchased by your store

Avoid clinical statements.

---

## 12. Frequency Model

A simple initial model can calculate:

```text
purchase_count
last_purchase_at
average_purchase_interval
days_since_last_purchase
```

A reorder candidate can be considered when historical behavior suggests repeat purchasing.

This is a purchasing-pattern prediction, not a medical recommendation.

---

## 13. Recently Viewed

Recently viewed recommendations should be:

- buyer-specific
- time-bounded
- deduplicated
- filtered for current eligibility
- invalidated when products become unavailable or restricted

Store only the minimum required history.

---

## 14. Frequently Purchased

Frequently purchased products can be calculated using:

- buyer purchase history
- product purchase count
- recency
- quantity
- frequency

A product purchased often by one buyer should not automatically become a recommendation for another buyer unless it passes the broader candidate and eligibility rules.

---

## 15. Popularity Recommendations

Marketplace popularity can use:

- purchase count
- unique buyer count
- add-to-cart count
- view count
- trend velocity

Popularity should be time-windowed.

Example windows:

```text
7 days
30 days
90 days
```

Do not use raw lifetime counts as the only popularity signal.

---

## 16. New Product Discovery

New products may receive a controlled discovery mechanism so that new catalog items are not permanently suppressed by historical popularity.

Candidate conditions:
- approved/active catalog status
- eligible supplier
- available listing
- sufficient catalog metadata
- serviceability

New-product discovery must not bypass marketplace eligibility.

---

## 17. Similar Product Discovery

Similarity can use structured catalog fields:

- category
- manufacturer
- dosage form
- strength
- composition metadata
- product attributes
- approved catalog relationships

Similarity must not be interpreted as clinical equivalence.

The system should prefer catalog-governed relationships over unconstrained semantic similarity for pharmaceutical products.

---

## 18. Semantic Recommendations

Embedding/vector-based retrieval may be introduced later.

Potential uses:
- semantic search assistance
- related catalog discovery
- query understanding
- similarity candidate generation

Vector similarity must remain subordinate to:
- catalog identity
- eligibility
- compliance
- authoritative availability
- approved product relationships

Do not use embeddings as a standalone mechanism to infer therapeutic interchangeability.

---

## 19. Ranking Architecture

Conceptual ranking:

```text
Hard Filters
    |
    v
Candidate Quality
    |
    v
Personal Relevance
    |
    v
Catalog Relevance
    |
    v
Availability
    |
    v
Delivery Capability
    |
    v
Business Ranking Signals
    |
    v
Diversity
```

Ranking must be versioned.

Example:

```text
recommendation_model_version = v1
```

---

## 20. Initial Rule-Based Ranking

Before sufficient data exists, use deterministic scoring.

Example conceptual model:

```text
score =
  personal_purchase_signal
+ recency_signal
+ category_relevance
+ catalog_relevance
+ availability_signal
+ delivery_signal
+ controlled_popularity_signal
```

Weights must be configuration-driven.

Do not hard-code ranking weights across frontend applications.

---

## 21. Diversity

Recommendations should avoid showing many near-identical results.

Diversity can operate across:

- product
- brand
- manufacturer
- category
- supplier

Diversity must never remove a required eligible result merely to make a list look varied.

---

## 22. Supplier Diversity

For marketplace discovery, supplier diversification may be applied where it does not conflict with:

- availability
- eligibility
- buyer preferences
- delivery constraints
- commercial configuration

Supplier diversification should never expose supplier-private data.

---

## 23. Business Rules

Recommendation output must obey:

- catalog status
- supplier status
- buyer eligibility
- serviceability
- inventory state
- price/promotion validity
- prescription/restriction policies
- recall/expiry controls
- marketplace configuration

The recommendation engine does not own these policies; it consumes their authoritative outputs.

---

## 24. Price and Promotion Signals

Recommendations may consider:

- current marketplace price
- valid promotions
- discount availability
- supplier commercial signals

However:
- final price is authoritative at checkout
- promotion eligibility is recalculated transactionally
- expired promotions are removed from actionable recommendations

Commercial ranking must not override safety or eligibility constraints.

---

## 25. Delivery Signals

Potential signals:
- serviceability
- delivery mode availability
- estimated delivery time
- scheduled delivery compatibility

For example, a buyer may receive a recommendation for an eligible product that can be delivered through the selected delivery mode.

Final logistics availability is revalidated before order placement.

---

## 26. Recommendation API

Example:

```http
GET /api/v1/recommendations/home
GET /api/v1/recommendations/reorder
GET /api/v1/recommendations/product/{productId}
GET /api/v1/recommendations/cart
```

Example response:

```json
{
  "surface": "HOME",
  "model_version": "v1",
  "items": [
    {
      "product_id": "uuid",
      "reason_code": "FREQUENTLY_PURCHASED",
      "position": 1
    }
  ],
  "request_id": "uuid"
}
```

Reason codes should be machine-readable and mapped to approved UI language.

---

## 27. Recommendation Explanations

Use simple factual explanations:

```text
Purchased before
Frequently purchased by your store
Based on your recent searches
Available for your delivery area
New in your selected category
```

Do not expose internal ranking weights.

Do not generate clinical claims.

---

## 28. Caching

Redis can cache:
- home recommendation lists
- category recommendations
- popular products
- autocomplete-related recommendation candidates
- anonymous/public marketplace recommendations where permitted

Buyer-specific recommendations require buyer-scoped cache keys.

Example:

```text
recommendations:
buyer_id_hash:
surface:
location_context:
model_version:
```

Short TTLs are appropriate for inventory-sensitive results.

---

## 29. Cold Start

### New buyer

Use:
- popular products
- category popularity
- marketplace-wide discovery
- onboarding-selected business/category context where available

### New product

Use:
- catalog similarity
- category relevance
- controlled exploration

### New supplier

Use:
- eligible catalog listings
- category discovery
- marketplace configuration

Cold-start logic must still enforce hard eligibility.

---

## 30. Data Storage

Recommendation state may be stored in:

### PostgreSQL

For:
- durable configuration
- model versions
- recommendation policies
- curated collections

### Redis

For:
- low-latency recommendation caches
- short-lived candidate state

### Analytics warehouse

For:
- event history
- training datasets
- long-term experimentation

### OpenSearch

For:
- search-driven candidate retrieval where appropriate

Do not make Redis or OpenSearch the authoritative purchase history.

---

## 31. Feature Store Evolution

A dedicated feature store is not required initially.

Start with:
- PostgreSQL aggregates
- analytics warehouse
- cached feature projections

Introduce a feature store only when:
- feature volume grows materially
- online/offline consistency becomes difficult
- model-serving latency requires it

Avoid premature ML infrastructure.

---

## 32. Machine Learning Evolution

Recommended maturity path:

### Phase 1
Rule-based recommendations.

### Phase 2
Statistical popularity and personalization.

### Phase 3
Learning-to-rank.

### Phase 4
Hybrid retrieval with embeddings.

### Phase 5
Advanced personalized ranking.

Every phase retains the same hard policy/eligibility layer.

---

## 33. Training Data

Potential training signals:
- views
- clicks
- cart additions
- purchases
- reorders
- dismissals

Negative signals may include:
- impressions without engagement
- explicit dismissal
- repeated skips

Training data must be carefully sampled to avoid treating unavailable products as poor recommendations.

---

## 34. Model Training Governance

Models require:

- version
- training dataset version
- feature definition version
- training timestamp
- evaluation metrics
- deployment status
- rollback version

No model should be deployed without offline evaluation and production monitoring.

---

## 35. Model Serving

If ML is introduced:

```text
Recommendation API
      |
      v
Candidate Generator
      |
      v
Policy Filter
      |
      v
Ranking Model
      |
      v
Diversity
      |
      v
Response
```

The ranking model must not be able to return an item that failed hard filtering.

---

## 36. Search Integration

Search and recommendation should complement each other.

Search:
- explicit buyer intent

Recommendations:
- implicit/long-term discovery

Search-derived candidates may be used for:
- related products
- query refinement
- recent search recommendations

Do not allow recommendation ranking to obscure a clear exact search result.

---

## 37. Analytics

Track recommendation funnel:

```text
Recommendation shown
      ->
Clicked
      ->
Added to cart
      ->
Purchased
```

Core metrics:
- impression count
- CTR
- add-to-cart rate
- conversion rate
- revenue contribution where appropriate
- reorder rate
- dismissal rate
- coverage
- diversity
- zero-candidate rate

---

## 38. Quality Metrics

Track:
- Precision@K
- Recall@K
- NDCG@K
- CTR
- conversion
- reorder conversion
- catalog coverage
- recommendation coverage per buyer
- diversity
- freshness

Do not optimize solely for clicks.

---

## 39. A/B Testing

Recommendation experiments may compare:
- ranking versions
- candidate sources
- surface layouts
- exploration levels

Experiments must:
- be versioned
- be reversible
- preserve hard eligibility rules
- avoid cross-tenant leakage
- record experiment assignment
- support statistical evaluation

---

## 40. Privacy

Recommendation systems can reveal behavioral information.

Controls:
- buyer-scoped history
- minimum necessary data
- configurable retention
- deletion/anonymization workflows
- access logging
- no unnecessary sensitive attributes
- strict tenant isolation

Do not use private buyer behavior to generate recommendations for another buyer unless the aggregate signal is intentionally approved and sufficiently generalized.

---

## 41. Security

Test:
- cross-buyer recommendation access
- cross-supplier recommendation access
- manipulated buyer IDs
- cache-key isolation
- unauthorized model/configuration changes
- event tampering
- recommendation API abuse

Administrative model/ranking configuration requires privileged authorization.

---

## 42. Failure Handling

If personalization fails:

```text
Personalized candidates
      |
      X
      |
      v
Rule-based candidates
      |
      X
      |
      v
Popular/eligible marketplace candidates
```

The user should still receive valid catalog discovery when possible.

Never fabricate a personalized reason.

---

## 43. Stale Data Handling

Recommendation candidates must be revalidated against current:
- product status
- supplier status
- inventory
- eligibility
- serviceability

Stale recommendation data may be used to generate candidates but cannot bypass authoritative validation.

---

## 44. Observability

Monitor:
- recommendation latency
- candidate count
- filtered candidate count
- ranking latency
- cache hit rate
- fallback rate
- model errors
- zero-candidate rate
- CTR
- conversion
- stale-candidate rate

Alert on:
- sudden candidate collapse
- unusual latency
- model-serving failure
- event pipeline lag
- recommendation conversion anomalies
- tenant-isolation/security failures

---

## 45. Testing

### Unit
- candidate generation
- policy filters
- ranking
- diversity
- reason codes
- cache keys

### Integration
- catalog integration
- inventory filtering
- supplier isolation
- recommendation API
- event processing

### Relevance
- curated test buyers
- known purchase histories
- expected candidate sets

### Load
- home page traffic
- product detail traffic
- concurrent recommendation requests

### Security
- tenant isolation
- cache isolation
- authorization
- event integrity

---

## 46. Deployment

Recommendation changes should support:
- development
- staging
- production

Deploy:
- configuration changes
- candidate rules
- ranking versions
- models
- feature definitions

Use feature flags for controlled rollout.

Every production model/ranking change must have a rollback path.

---

## 47. Definition of Done

The recommendation system is complete when:

- recommendation API is implemented
- hard eligibility filtering is enforced
- buyer/supplier isolation is verified
- rule-based candidate generation works
- reorder recommendations work
- recently viewed works
- frequently purchased works
- popularity candidates work
- similar-product discovery works within approved catalog semantics
- ranking is versioned
- diversity is implemented
- reason codes are implemented
- caching works
- cold-start behavior works
- analytics events are recorded
- relevance metrics are measurable
- failure fallback works
- stale data is revalidated
- security tests pass
- load tests pass
- configuration/model rollback works

---

## 48. Final Architecture

```text
                  Buyer
                    |
                    v
             Web / Mobile Apps
                    |
                    v
          Recommendation API
                    |
                    v
           Candidate Generator
             /      |                   /       |                   v        v         v
      Purchase   Search    Catalog/
      History    Signals   Popularity
            \       |       /
             \      |      /
              v     v     v
             Hard Policy Filters
                    |
                    v
                 Ranking
                    |
                    v
                Diversity
                    |
                    v
              Redis / Response
                    |
                    v
                  Buyer

Events -> Analytics -> Aggregates/Training Data
```

**Core rule: Bezzo recommendations personalize product discovery, not medical decisions.**
