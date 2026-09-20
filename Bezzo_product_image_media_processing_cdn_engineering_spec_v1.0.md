# Bezzo Product Image, Media Processing & CDN Engineering Specification v1.0

## 1. Purpose

This document defines the production media architecture for Bezzo product images and related marketplace media.

It covers:
- secure image upload
- supplier product media
- admin moderation
- object storage
- image validation and processing
- thumbnails and responsive variants
- CDN delivery
- image metadata
- media lifecycle
- malware/content validation
- access control
- replacement/versioning
- caching
- performance
- monitoring
- backup and recovery
- implementation structure
- testing and Definition of Done

The media subsystem must support fast marketplace browsing while keeping original uploads private and controlled.

---

## 2. Core Principles

1. Object storage is the source of truth for media binaries.
2. PostgreSQL stores authoritative media metadata.
3. CDN serves approved public marketplace derivatives.
4. Original supplier uploads remain protected.
5. Media processing is asynchronous.
6. Browser/mobile clients never receive storage credentials.
7. Every upload is validated before publication.
8. Product media visibility follows catalog moderation state.
9. Media URLs are versionable and cacheable.
10. Failed processing must not block unrelated catalog operations.

---

## 3. Architecture

```text
Supplier / Admin
       |
       v
Bezzo API
       |
       +----------------------+
       |                      |
       v                      v
Media Metadata DB       Signed Upload URL
       |                      |
       |                      v
       |                Object Storage
       |                      |
       |                      v
       |                Media Queue
       |                      |
       |                      v
       |              Image Processing Worker
       |                      |
       |              +-------+-------+
       |              |               |
       v              v               v
 PostgreSQL       Originals       Derivatives
                                      |
                                      v
                                     CDN
                                      |
                                      v
                               Web / Android / iOS
```

---

## 4. Media Types

Initial supported media:

### Product media
- front packaging
- back packaging
- side packaging
- label/details
- manufacturer-provided product imagery
- approved additional images

### Supplier media
- business documents where required
- supplier profile/logo where supported

### Operational media
- dispute attachments
- support attachments
- delivery evidence where authorized

Each media class has separate security and retention rules.

---

## 5. Product Image Rules

Product images should support:

- clear packaging visibility
- readable product identity
- consistent orientation
- appropriate resolution
- acceptable lighting
- no prohibited overlays
- no misleading claims
- no unrelated promotional material

The exact moderation rules are governed by catalog/compliance policy.

---

## 6. Media Entity

Conceptual metadata:

```text
media_id
owner_type
owner_id
product_id
supplier_id
media_type
storage_key
original_filename
mime_type
file_size
width
height
checksum
processing_status
moderation_status
visibility
version
created_at
updated_at
```

Never use the client filename as the authoritative storage identifier.

---

## 7. Product Media Ordering

Each product can have ordered media:

```text
display_order
is_primary
media_type
```

The primary image should be explicitly selected.

The API should return a deterministic order.

Do not depend on object-storage listing order.

---

## 8. Upload Flow

Recommended flow:

```text
Client
  |
  | request upload
  v
Bezzo API
  |
  | validate identity / permissions / metadata
  v
Signed upload URL
  |
  v
Object Storage
  |
  | upload complete
  v
Upload Event
  |
  v
Media Processing Worker
  |
  +--> validate
  +--> scan
  +--> transform
  +--> generate derivatives
  +--> publish
  |
  v
CDN
```

The client must not be allowed to directly choose arbitrary storage paths.

---

## 9. Signed Upload URLs

Use short-lived signed upload URLs.

The upload authorization must be bound to:
- authenticated actor
- owner/entity
- expected media type
- maximum size
- allowed content type
- expiry
- unique object key

The API should create the object key server-side.

---

## 10. Upload Validation

Validate before accepting or publishing media:

- file size
- MIME type
- file signature/magic bytes
- image dimensions
- supported format
- extension consistency
- ownership
- upload authorization

Do not trust only the filename or browser-provided MIME type.

---

## 11. Malware and Content Scanning

Uploaded files should pass security scanning before becoming trusted media.

Recommended controls:
- malware scanning
- decompression-bomb protection
- malformed image detection
- metadata sanitization
- content-policy validation where applicable

Failed files enter a quarantined state.

---

## 12. Processing States

Example lifecycle:

```text
REQUESTED
  -> UPLOADING
  -> UPLOADED
  -> SCANNING
  -> PROCESSING
  -> READY
```

Failure states:

```text
REJECTED
FAILED_PROCESSING
QUARANTINED
```

Only `READY` media should become normal marketplace media.

---

## 13. Image Processing

Generate standardized derivatives such as:

```text
original
thumbnail
small
medium
large
zoom
```

Exact dimensions should be configuration-driven.

Do not upscale low-resolution source images unnecessarily.

---

## 14. Responsive Images

The API should provide appropriate image variants for client use.

Example:

```json
{
  "primary_image": {
    "small": "...",
    "medium": "...",
    "large": "..."
  }
}
```

Web clients should use responsive image techniques.

Mobile clients should request an appropriate resolution rather than downloading the largest image by default.

---

## 15. Image Formats

Where supported, processing may generate modern formats such as:
- WebP
- AVIF

Maintain a compatibility fallback where required.

The processing pipeline should negotiate or expose suitable variants rather than forcing every client to understand every format.

---

## 16. Object Storage

Use S3-compatible private object storage.

Recommended logical separation:

```text
bezzo-media-originals
bezzo-media-processed
bezzo-media-quarantine
```

Storage buckets/containers should not be publicly writable.

---

## 17. Storage Key Strategy

Use generated immutable keys.

Example:

```text
products/{product_id}/{media_id}/original
products/{product_id}/{media_id}/medium
products/{product_id}/{media_id}/large
```

Do not use:

```text
products/{product_name}.jpg
```

because names can collide or change.

---

## 18. CDN Architecture

```text
Client
  |
  v
CDN
  |
  | cache miss
  v
Object Storage
```

CDN should serve only approved processed/public media.

Do not expose private supplier documents through the public product-image CDN.

---

## 19. CDN Cache Policy

Processed product images should use long cache lifetimes when their URLs are immutable/versioned.

Preferred strategy:

```text
new media version -> new URL
```

rather than aggressively purging a shared URL.

Example:

```text
/product/uuid/image/media-id/v3/large.webp
```

Immutable URLs simplify caching and rollback.

---

## 20. Cache Headers

Production CDN responses should use appropriate:
- `Cache-Control`
- `ETag`
- `Content-Type`
- compression/content negotiation headers where supported

Do not cache private documents publicly.

---

## 21. Image Replacement

When replacing an image:

```text
old media -> retained/versioned
new media -> processed
new media -> approved
new media -> becomes active
```

Avoid overwriting the active binary in place.

This prevents stale CDN content from becoming inconsistent with metadata.

---

## 22. Product Moderation

Product media can follow:

```text
UPLOADED
  -> PROCESSING
  -> MODERATION_PENDING
  -> APPROVED
  -> PUBLISHED
```

Rejected media remains inaccessible from the public marketplace.

Moderation actions should be auditable.

---

## 23. Supplier Isolation

Supplier A must not be able to:
- access Supplier B private uploads
- guess private object keys
- modify another supplier's media
- obtain signed URLs for unauthorized entities

Authorization is enforced by the API before signed URLs are issued.

---

## 24. Private Documents

Documents such as:
- licenses
- identity documents
- business proofs
- compliance records

must use separate private storage policies.

They should:
- never be placed in public CDN paths
- use short-lived signed download URLs
- be access-controlled
- be audit logged
- follow retention/deletion policies

---

## 25. Image Metadata

Store metadata in PostgreSQL, including:

```text
media_id
product_id
owner_id
media_type
storage_key
checksum
dimensions
processing_status
moderation_status
version
created_at
```

This allows the database to remain the authoritative media catalog.

---

## 26. Duplicate Detection

Use checksums to detect exact duplicate uploads.

Potentially use perceptual hashes later for near-duplicate detection.

Duplicate detection should not automatically delete a file without a defined ownership/reference policy.

---

## 27. Media Cleanup

Background cleanup should remove:

- abandoned uploads
- expired temporary objects
- failed processing artifacts
- obsolete derivatives after retention rules
- unreferenced media

Cleanup must be reference-aware.

Never delete an object solely because it appears old.

---

## 28. Orphan Detection

Scheduled reconciliation should compare:

```text
PostgreSQL media records
        vs
Object storage objects
```

Detect:
- DB record without object
- object without DB record
- missing derivative
- invalid processing state
- unexpected storage key

Repair actions must be controlled and logged.

---

## 29. Image Processing Queue

Use the existing worker/queue architecture.

Example jobs:

```text
MediaUploadAccepted
MediaScanRequested
MediaProcessRequested
MediaDerivativeRequested
MediaModerationRequested
MediaCleanupRequested
```

Workers must be idempotent.

---

## 30. Processing Idempotency

A media-processing job should use:

```text
media_id
version
operation
```

as part of its idempotency strategy.

Repeated processing must not create uncontrolled duplicate derivatives.

---

## 31. Image Quality Validation

Automated checks may include:
- minimum dimensions
- extreme aspect ratio
- corrupt image detection
- unreadable format
- blank/near-blank image
- inappropriate file size
- unsupported color/profile conditions

Human review can remain the final authority for catalog publication when required.

---

## 32. Performance Targets

Initial targets:

- upload authorization API: p95 < 150 ms
- metadata API: p95 < 200 ms
- CDN image delivery: optimized for low-latency edge delivery
- image processing: normally seconds, depending on size
- product page should not block on full-resolution image processing

These are engineering targets and must be validated under realistic load.

---

## 33. Progressive Loading

Product pages should use:

```text
low/medium resolution
      ->
primary display
      ->
higher resolution on demand
```

This prevents large images from delaying first meaningful content.

Use lazy loading for below-the-fold media.

---

## 34. Mobile Optimization

Mobile clients should:
- request appropriate image size
- cache frequently used product images
- avoid repeated downloads
- use thumbnails in lists
- request large/zoom images only when needed

The application should remain usable on slow mobile networks.

---

## 35. Image API

Example:

```http
POST /api/v1/media/uploads
POST /api/v1/media/{mediaId}/complete
GET  /api/v1/media/{mediaId}
DELETE /api/v1/media/{mediaId}
```

Product-specific operations may be exposed through catalog APIs.

The API specification remains the authoritative contract.

---

## 36. Media URL Security

Public product media can use CDN URLs.

Private media should use:
- short-lived signed URLs
- authorization checks
- optional response-content restrictions

Never place access tokens or private credentials inside permanent public image URLs.

---

## 37. Access Control

RBAC should distinguish:
- buyer
- supplier
- supplier staff
- catalog operator
- compliance operator
- support operator
- administrator

Only authorized roles can:
- upload
- replace
- moderate
- publish
- delete
- view private documents

---

## 38. Audit Logging

Audit:
- upload
- approval
- rejection
- replacement
- deletion
- visibility change
- signed private download
- administrative override

Audit records should include:
- actor
- action
- media ID
- entity
- timestamp
- request ID
- result

---

## 39. Search Integration

Search indexes should store image references, not image binaries.

When the primary image changes:

```text
Media approved
   ->
Product media updated
   ->
ProductChanged event
   ->
Search projection updated
```

Search documents should receive the active image URL/version.

---

## 40. Product Catalog Integration

Canonical catalog data owns product-image association.

Supplier listing data may reference approved canonical product images.

Supplier-specific images should be used only where the catalog model explicitly permits them.

This prevents conflicting product identity representations.

---

## 41. CDN Failure Handling

If CDN delivery fails:
- clients may retry
- fallback to alternate approved CDN/storage endpoint where designed
- UI should show a neutral image placeholder
- no private storage URL should be exposed accidentally

Image failure must not break product purchasing workflows.

---

## 42. Broken Media Handling

If a product's active image becomes unavailable:
- detect through monitoring/reconciliation
- remove broken URL from active projection
- use another approved image if available
- otherwise use a neutral placeholder
- alert operations if required

Do not fabricate product imagery.

---

## 43. Backup and Recovery

Original approved media must be recoverable according to retention policy.

Recommended controls:
- object-storage versioning where appropriate
- replication according to business continuity requirements
- database backups for media metadata
- documented restore process

Derived images can generally be regenerated from retained originals.

---

## 44. Security Hardening

Apply:
- private buckets
- least-privilege IAM
- encryption at rest
- TLS
- signed upload/download URLs
- content-type validation
- file-size limits
- malware scanning
- object-key randomization
- audit logging
- rate limiting
- quarantine

Never execute uploaded content.

---

## 45. Abuse Protection

Protect upload endpoints with:
- authentication
- rate limiting
- quotas
- maximum file size
- maximum number of files per request
- per-supplier upload limits
- suspicious activity monitoring

Public image endpoints should also be protected against excessive request abuse through CDN controls.

---

## 46. Observability

Track:
- upload success/failure
- processing latency
- processing failures
- queue depth
- quarantine count
- moderation backlog
- CDN cache hit ratio
- image delivery latency
- missing image rate
- storage growth
- orphan objects
- failed derivative generation

Alert on:
- processing backlog
- abnormal failure rate
- storage anomalies
- CDN outage
- broken active-image references
- security scan failures

---

## 47. Testing

### Unit
- media validation
- object-key generation
- authorization
- metadata mapping
- derivative selection

### Integration
- signed upload
- object storage
- processing worker
- CDN
- catalog integration

### Security
- unauthorized upload
- cross-tenant access
- signed URL abuse
- malicious files
- object-key guessing

### Performance
- concurrent uploads
- processing bursts
- high product-image traffic
- CDN cache behavior

### Recovery
- missing original
- missing derivative
- orphan reconciliation
- processing retry
- storage recovery

---

## 48. Implementation Structure

Recommended backend:

```text
src/modules/media/
  application/
    media.service.ts
    upload.service.ts
    media-publish.service.ts
  domain/
    media.entity.ts
    media-status.ts
    media-policy.ts
  infrastructure/
    object-storage.client.ts
    cdn.service.ts
    malware-scanner.client.ts
    image-processor.client.ts
  workers/
    media-processing.worker.ts
    media-cleanup.worker.ts
    media-reconciliation.worker.ts
  dto/
  tests/
```

Frontend/mobile shared media utilities:

```text
packages/media/
  image-url.ts
  responsive-image.ts
  upload-client.ts
  media-types.ts
```

---

## 49. Environment Configuration

Configuration must include:
- storage bucket/container names
- CDN domain
- signed URL expiry
- upload size limits
- allowed MIME types
- processing dimensions
- cache policy
- scanner configuration
- retention policies

Secrets must come from the platform secret-management system.

---

## 50. Definition of Done

Complete when:

- secure signed uploads work
- object storage is private
- upload validation works
- malware/content scanning works
- quarantine works
- image processing works
- responsive derivatives are generated
- CDN delivery works
- immutable/versioned URLs work
- product image ordering works
- primary image selection works
- supplier isolation is verified
- private documents use separate controls
- media moderation is auditable
- abandoned upload cleanup works
- orphan reconciliation works
- search/catalog projections update correctly
- image caching is optimized
- mobile/web responsive delivery works
- monitoring and alerts exist
- security tests pass
- load tests pass
- recovery procedures are tested

---

## 51. Final Architecture

```text
                 SUPPLIER / ADMIN
                       |
                       v
                    Bezzo API
                  /                           v            v
        PostgreSQL       Signed Upload
                              |
                              v
                       Private Storage
                              |
                              v
                         Media Queue
                              |
                              v
                    Image Processing
                    /       |                          v        v        v
                Scan    Transform  Metadata
                   \        |        /
                    \       |       /
                         READY
                           |
                           v
                          CDN
                           |
              +------------+------------+
              |                         |
              v                         v
           Web App                 Mobile Apps
```

**Core rule: originals are protected, approved derivatives are optimized for delivery, and PostgreSQL remains authoritative for media metadata.**
