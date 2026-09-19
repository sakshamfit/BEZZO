# Bezzo Notification & Communication Specification
## Version 1.0

**Product:** Bezzo — B2B Pharmaceutical Marketplace  
**Primary market:** India  
**Status:** Draft for implementation

---

## 1. Purpose

This specification defines the notification and communication platform for Bezzo.

It covers:

- Push notifications
- SMS
- Email
- WhatsApp-ready architecture
- In-app notifications
- OTP delivery
- Order updates
- Payment notifications
- Supplier alerts
- Delivery notifications
- Scheduled-order reminders
- Admin/operations alerts
- Notification preferences
- Templates
- Queues and retries
- Provider abstraction
- Delivery tracking
- Audit logs

The communication layer must be reliable, idempotent, observable, and independent from individual business modules.

---

# 2. Communication Architecture

Recommended:

```text
Business Event
      ↓
Notification Event
      ↓
Notification Orchestrator
      ↓
Template Engine
      ↓
Preference / Eligibility Check
      ↓
Channel Router
 ┌────┼─────┬─────┐
 ↓    ↓     ↓     ↓
Push SMS  Email WhatsApp
      ↓
Provider Adapter
      ↓
External Provider
```

Business modules should emit events rather than directly calling SMS/email/push providers.

---

# 3. Core Principles

The notification system must:

1. Be asynchronous by default.
2. Be idempotent.
3. Support retries.
4. Support multiple providers.
5. Respect user preferences.
6. Never block checkout/order processing unnecessarily.
7. Protect sensitive information.
8. Maintain delivery/audit history.
9. Support localization.
10. Support operational alerts separately from customer messaging.

---

# 4. Notification Types

Recommended categories:

```text
AUTHENTICATION
ORDER
PAYMENT
FULFILLMENT
DELIVERY
INVENTORY
SUPPLIER
ACCOUNT
SECURITY
PROMOTIONAL
SYSTEM
ADMIN
```

---

# 5. Customer Notification Events

Core events:

```text
OTP_REQUESTED
OTP_VERIFIED
LOGIN_ALERT

ORDER_PLACED
ORDER_CONFIRMED
ORDER_CANCELLED
ORDER_PARTIALLY_CANCELLED

PAYMENT_SUCCESS
PAYMENT_FAILED
PAYMENT_REFUND_INITIATED
PAYMENT_REFUND_COMPLETED

FULFILLMENT_CONFIRMED
FULFILLMENT_DELAYED
FULFILLMENT_PACKED

DELIVERY_BOOKED
DRIVER_ASSIGNED
OUT_FOR_DELIVERY
DELIVERY_DELAYED
DELIVERY_FAILED
DELIVERED

SCHEDULED_DELIVERY_REMINDER

INVOICE_AVAILABLE
CREDIT_NOTE_AVAILABLE
```

---

# 6. Supplier Notification Events

Supplier events:

```text
SUPPLIER_VERIFICATION_SUBMITTED
SUPPLIER_VERIFIED
SUPPLIER_REJECTED

NEW_ORDER_ASSIGNED
FULFILLMENT_REQUIRED
FULFILLMENT_DEADLINE_APPROACHING
ORDER_CANCELLED

INVENTORY_LOW
INVENTORY_OUT_OF_STOCK
EXPIRY_ALERT
RECALL_ALERT

PAYMENT/SETTLEMENT_AVAILABLE
SETTLEMENT_COMPLETED
SETTLEMENT_ON_HOLD

DELIVERY_PICKUP_REQUIRED
DELIVERY_PICKUP_FAILED
```

Supplier notifications must only expose that supplier's own operational data.

---

# 7. Admin/Operations Alerts

Examples:

```text
PAYMENT_RECONCILIATION_EXCEPTION
LOGISTICS_PROVIDER_FAILURE
ORDER_ALLOCATION_FAILURE
SUPPLIER_SLA_BREACH
INVENTORY_SYNC_FAILURE
CATALOG_IMPORT_FAILURE
WEBHOOK_FAILURE
HIGH_PAYMENT_FAILURE_RATE
HIGH_DELIVERY_FAILURE_RATE
SYSTEM_HEALTH_ALERT
```

Admin alerts should use separate operational channels and escalation rules.

---

# 8. Channels

Supported architecture:

### Push

Primary mobile communication channel.

### SMS

Useful for:

- OTP
- Critical order events
- Delivery alerts
- Fallback communication

### Email

Useful for:

- Invoices
- Account communication
- Order summaries
- Settlement reports
- Formal operational messages

### WhatsApp-ready

The architecture should support a WhatsApp provider adapter without making WhatsApp mandatory for the initial release.

### In-App

Persistent notification center inside Bezzo.

---

# 9. Channel Routing

Each notification event can define preferred channels.

Example:

```text
ORDER_PLACED
→ Push
→ In-App
→ Email if configured

OTP
→ SMS
→ Optional approved fallback

DELIVERED
→ Push
→ In-App
→ SMS for selected cases
```

Channel policy must be configurable.

---

# 10. Notification Priority

Recommended:

```text
CRITICAL
HIGH
NORMAL
LOW
PROMOTIONAL
```

Examples:

### Critical

- Security alert
- Payment anomaly
- Compliance action

### High

- OTP
- Delivery failure
- Order cancellation

### Normal

- Order confirmation
- Invoice available

### Low

- General operational reminder

### Promotional

- Offers
- Campaigns
- Marketing messages

Promotional messaging must be separated from transactional messaging.

---

# 11. Notification Entity

Recommended:

```text
notification_id
recipient_type
recipient_id
event_type
priority
channel
template_id
status
scheduled_at
sent_at
delivered_at
failed_at
provider
provider_message_id
deduplication_key
created_at
updated_at
```

Statuses:

```text
QUEUED
PROCESSING
SENT
DELIVERED
FAILED
CANCELLED
EXPIRED
```

---

# 12. Notification Preferences

Users should control configurable communication preferences.

Example:

```text
order_updates
payment_updates
delivery_updates
promotional_messages
email_enabled
sms_enabled
push_enabled
whatsapp_enabled
```

Transactional/security notifications may not be disableable where required for the service.

Preferences should be evaluated at send time.

---

# 13. Supplier Preferences

Suppliers may configure:

```text
new_order_alerts
inventory_alerts
settlement_alerts
delivery_alerts
expiry_alerts
administrative_alerts
```

Critical compliance/security alerts should override normal preferences where necessary.

---

# 14. Device Registration

Mobile/web push requires device registration.

Recommended:

```text
device_id
user_id
platform
push_token
app_version
device_model
os_version
locale
timezone
status
last_seen_at
```

Push tokens must be treated as sensitive identifiers.

---

# 15. Multiple Devices

A user can have multiple active devices.

Example:

```text
Buyer
 ├── Android phone
 ├── iPhone
 └── Web browser
```

Notification fan-out should send to eligible active devices.

Invalid tokens should be automatically deactivated.

---

# 16. OTP Architecture

OTP should be implemented as a dedicated security service.

Flow:

```text
Request OTP
→ generate secure OTP
→ store hashed/secured verification record
→ send
→ verify
→ invalidate
```

Recommended properties:

```text
short expiration
single-use
attempt limit
rate limit
brute-force protection
```

Never store OTPs in plaintext logs.

---

# 17. OTP Rate Limiting

Rate-limit by multiple dimensions:

```text
phone/email
IP address
device
account
time window
```

Example policy:

```text
maximum attempts per OTP
maximum OTP requests per time window
cooldown after repeated failures
```

Exact thresholds belong in security configuration.

---

# 18. OTP Providers

Use provider abstraction:

```typescript
interface MessagingProvider {
  sendSms(input: SmsMessage): Promise<MessageResult>;
}
```

Possible provider adapters can be configured later.

Do not hard-code one SMS provider into authentication logic.

---

# 19. Email Provider

Use:

```typescript
interface EmailProvider {
  send(input: EmailMessage): Promise<MessageResult>;
}
```

Provider implementation should be replaceable.

Email provider credentials must remain in secret management.

---

# 20. Push Provider

Use a push abstraction:

```typescript
interface PushProvider {
  send(input: PushMessage): Promise<MessageResult>;
}
```

The mobile notification layer should support platform-specific push infrastructure behind this interface.

---

# 21. WhatsApp Adapter

Future-ready interface:

```typescript
interface WhatsAppProvider {
  sendTemplate(input: WhatsAppTemplateMessage): Promise<MessageResult>;
}
```

WhatsApp should use approved templates and provider rules.

Do not build business logic around WhatsApp-specific APIs.

---

# 22. Template Engine

Templates should be data-driven.

Example:

```text
template_id
event_type
channel
locale
version
subject
body
variables_schema
status
```

Example variables:

```text
buyer_name
order_number
order_total
delivery_slot
tracking_reference
invoice_number
```

---

# 23. Template Example

Conceptual:

```text
Event:
ORDER_CONFIRMED

Subject:
Order {{order_number}} confirmed

Body:
Your Bezzo order {{order_number}} has been confirmed.
Total: {{order_total}}.
Delivery: {{delivery_slot}}.
```

Template rendering must escape untrusted values.

---

# 24. Template Versioning

Templates should be versioned.

```text
v1
v2
v3
```

Existing notification records should retain the template version used.

Do not silently alter historical notification content.

---

# 25. Localization

The platform should support:

```text
English
Hindi
Future regional languages
```

Localization architecture:

```text
event
→ template key
→ locale
→ rendered message
```

User locale should come from account/device preferences where available.

---

# 26. Notification Queue

Notifications should normally be asynchronous.

Flow:

```text
Business event
→ notification job
→ queue
→ worker
→ provider
```

Initial infrastructure can use the queue architecture defined in Bezzo's broader backend design.

---

# 27. Queue Priorities

Separate or prioritized queues can be used:

```text
critical
transactional
operational
promotional
```

Critical messages should not wait behind large promotional batches.

---

# 28. Retry Strategy

Provider failures should trigger controlled retries.

Recommended:

```text
attempt 1 → immediate/short delay
attempt 2 → exponential delay
attempt 3 → longer delay
```

Use:

```text
exponential backoff
jitter
maximum attempts
dead-letter handling
```

Do not retry permanent failures indefinitely.

---

# 29. Permanent vs Temporary Failure

Temporary:

```text
provider timeout
5xx
rate limit
network failure
```

Permanent:

```text
invalid phone
invalid email
invalid token
template rejected
recipient blocked
```

Retry only failures that are likely recoverable.

---

# 30. Dead-Letter Queue

Failed notifications after retry exhaustion should enter:

```text
notification_dead_letter
```

Operations can inspect:

```text
notification_id
recipient
channel
provider
failure_reason
attempt_count
last_attempt_at
```

Manual replay should be idempotent.

---

# 31. Deduplication

Every critical notification should have a deterministic deduplication key.

Example:

```text
ORDER_CONFIRMED:{order_id}
```

For delivery events:

```text
DELIVERED:{delivery_id}
```

This prevents duplicate messages when the same event is processed more than once.

---

# 32. Notification Timing

Some notifications should be immediate.

Others should be scheduled.

Examples:

```text
ORDER_CONFIRMED → immediate

SCHEDULED_DELIVERY_REMINDER
→ configurable time before slot

INVENTORY_LOW
→ debounce repeated alerts
```

Scheduled notifications should be persisted, not kept only in process memory.

---

# 33. Notification Digest

Operational users may receive aggregated notifications.

Example:

```text
Supplier has:
- 17 new orders
- 4 low-stock products
- 2 fulfillment deadlines
```

Digest behavior should be configurable.

Do not use digests for urgent/security events.

---

# 34. Delivery Reminder

For scheduled delivery:

```text
Order slot:
Tomorrow 08:00–12:00

Reminder:
Configured hours before delivery
```

The reminder job should verify that:

```text
order still active
delivery still scheduled
customer not already delivered
```

---

# 35. Order Notification State

Notifications should not be derived solely from current order status.

Store actual notification history.

Example:

```text
Order confirmed
→ notification sent
→ notification delivered
```

This allows support teams to answer:

```text
Was the customer actually notified?
```

---

# 36. Notification Audit

Audit fields:

```text
event_id
notification_id
recipient_id
channel
template_version
provider
provider_message_id
status
failure_reason
timestamps
```

For sensitive messages, avoid storing unnecessary message content.

---

# 37. Notification Security

Controls:

- Encryption in transit
- Secure provider credentials
- RBAC
- Audit logs
- Rate limiting
- Template authorization
- PII minimization
- Log redaction
- Secure token handling

Never put sensitive data into notification payloads unless required.

---

# 38. Deep Links

Push notifications may include secure deep links.

Example:

```text
Order confirmed
→ bezzo://orders/{orderId}
```

The target screen must still enforce authorization.

Never assume a deep-link ID itself grants access.

---

# 39. Web Notification Center

Buyer/supplier UI should include:

```text
All
Orders
Payments
Delivery
Account
```

Notification record:

```text
title
summary
timestamp
read/unread
action
```

Read status should be stored server-side so it synchronizes across devices.

---

# 40. Notification APIs

Representative:

```text
GET    /v1/notifications
GET    /v1/notifications/unread-count
POST   /v1/notifications/:id/read
POST   /v1/notifications/read-all

GET    /v1/notification-preferences
PATCH  /v1/notification-preferences

POST   /v1/devices
DELETE /v1/devices/:deviceId

POST   /v1/notifications/provider-webhooks/:provider
```

Admin:

```text
GET    /v1/admin/notifications
GET    /v1/admin/notifications/failures
POST   /v1/admin/notifications/:id/retry
```

---

# 41. Event Integration

Business modules should emit events such as:

```text
OrderConfirmed
PaymentCaptured
FulfillmentPacked
DeliveryCreated
DeliveryOutForDelivery
DeliveryDelivered
RefundCompleted
SettlementCompleted
```

Notification service subscribes to those events.

This avoids code like:

```text
orderService → smsProvider
orderService → emailProvider
orderService → pushProvider
```

Instead:

```text
orderService
     ↓
OrderConfirmed
     ↓
notificationService
```

---

# 42. Event-to-Notification Mapping

Example:

| Event | Push | SMS | Email | In-App |
|---|---|---|---|---|
| OTP | Optional | Yes | Optional | No |
| Order confirmed | Yes | Configurable | Optional | Yes |
| Payment success | Yes | Optional | Optional | Yes |
| Delivery out | Yes | Configurable | No | Yes |
| Delivered | Yes | Optional | Optional | Yes |
| Invoice available | Yes | No | Yes | Yes |
| Supplier new order | Yes | Optional | Yes | Yes |
| Settlement completed | Yes | Optional | Yes | Yes |

Final channel policies should remain configurable.

---

# 43. Promotional Messaging

Promotional notifications must be isolated from transactional notifications.

Requirements:

```text
explicit marketing consent where applicable
preference management
unsubscribe handling
campaign segmentation
frequency limits
audit trail
```

Transactional messages must not be disguised as promotional campaigns.

---

# 44. Communication Analytics

Track:

```text
messages_queued
messages_sent
messages_delivered
messages_failed
delivery_rate
failure_rate
provider_latency
template_usage
opt_out_rate
```

For push:

```text
open rate
```

For campaigns, track only metrics appropriate to the communication and privacy policy.

---

# 45. Provider Failover

Provider routing can support:

```text
Primary provider
      ↓ failure
Secondary provider
      ↓ failure
Dead-letter / operations
```

Failover must be safe for the message type.

For example, a provider timeout after successful acceptance can create a duplicate risk. Provider-specific idempotency/reference handling is required.

---

# 46. Observability

Metrics:

```text
notification_queue_depth
notification_processing_latency
notification_provider_latency
notification_success_rate
notification_failure_rate
webhook_processing_lag
dead_letter_count
otp_failure_rate
```

Alerts:

```text
queue backlog high
provider failure spike
OTP delivery degradation
SMS failure spike
push token invalidation spike
```

---

# 47. Testing

### Unit

- Template rendering
- Variable validation
- Preference evaluation
- Channel routing
- Deduplication
- Retry policy

### Integration

- SMS provider
- Email provider
- Push provider
- Webhooks
- Queue processing
- Device registration

### Failure

- Provider timeout
- Duplicate event
- Duplicate webhook
- Rate limiting
- Invalid recipient
- Template error
- Queue outage

### Security

- Unauthorized notification access
- Deep-link authorization
- PII leakage
- OTP brute force
- Provider credential exposure

---

# 48. Acceptance Criteria

The notification system is production-readiness eligible when:

- Business events drive notifications.
- Notification processing is asynchronous.
- Critical notifications are idempotent.
- Templates are versioned.
- Preferences are enforced.
- OTP is rate-limited and secure.
- Push, SMS, email are supported through abstractions.
- WhatsApp can be added without changing business modules.
- Provider failures are retried safely.
- Dead-letter handling exists.
- Notification history is auditable.
- Read/unread state synchronizes across devices.
- Deep links enforce authorization.
- Promotional and transactional communication are separated.
- Localization is supported architecturally.
- Notification metrics and alerts exist.
- Sensitive data is minimized.

---

# 49. Recommended Implementation Sequence

```text
1. Notification domain model
2. Event integration
3. Template engine
4. In-app notifications
5. Push notifications
6. SMS provider
7. OTP service
8. Email provider
9. Queue/retry infrastructure
10. Notification preferences
11. Notification center
12. Delivery/order notifications
13. Supplier notifications
14. Scheduled reminders
15. WhatsApp adapter
16. Campaign/promotional system
17. Analytics
18. Provider failover
```

---

# 50. Final Principle

Bezzo's business modules should **emit facts**, not send messages.

```text
Order Service
     ↓
OrderConfirmed
     ↓
Notification Platform
     ├── Push
     ├── SMS
     ├── Email
     ├── WhatsApp
     └── In-App
```

This architecture keeps communication reliable, replaceable, auditable, and scalable while allowing Bezzo to add channels and providers without rewriting the marketplace's core business logic.
