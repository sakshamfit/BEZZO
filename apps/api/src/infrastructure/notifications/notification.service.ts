/**
 * Notification infrastructure (notification spec, project rule §42).
 *
 * Rules:
 *  - delivery is asynchronous with retries, backoff and dead-lettering — a provider outage never
 *    blocks the operational task that produced the notification (a picker can always recover work
 *    from `GET /picker/tasks/available`);
 *  - every notification row is written inside the business transaction that caused it, so users are
 *    never told about something that did not happen;
 *  - a channel with no configured provider records a truthful FAILED delivery with an explicit
 *    reason, rather than pretending the message was sent.
 *
 * Channels: IN_APP (always available), PUSH, SMS, EMAIL, WHATSAPP (provider-dependent).
 */
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { AppConfig } from '@bezzo/config';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { NotificationChannel, type EventCorrelation } from '@bezzo/contracts';
import { APP_CONFIG } from '../config/config.module';
import { DATABASE } from '../database/database.module';
import { InjectLogger, BEZZO_LOGGER, type BezzoLogger } from '../logger/logger.module';
import type { Queryable } from '../events/event-bus.service';
import { MetricsService } from '../metrics/metrics.service';

export interface NotificationChannelProvider {
  readonly channel: NotificationChannel;
  readonly configured: boolean;
  send(input: {
    userId: string;
    title: string;
    body: string;
    payload: Record<string, unknown>;
  }): Promise<{ providerMessageId: string | null; provider: string }>;
}

/** In-app notifications are rows the client reads; delivery always succeeds. */
class InAppProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.IN_APP;
  readonly configured = true;

  async send(): Promise<{ providerMessageId: string | null; provider: string }> {
    return { providerMessageId: null, provider: 'in-app' };
  }
}

/**
 * Development transport: records the message in the log instead of sending it.
 * Enabled only when the channel is explicitly switched on but no vendor credentials exist AND the
 * environment is not production — production refuses to boot without a real provider.
 */
class LogProvider implements NotificationChannelProvider {
  readonly configured = true;

  constructor(
    readonly channel: NotificationChannel,
    private readonly logger: BezzoLogger,
  ) {}

  async send(input: { userId: string; title: string; body: string }): Promise<{ providerMessageId: string | null; provider: string }> {
    this.logger.info(
      { channel: this.channel, userId: input.userId, title: input.title, body: input.body },
      'notification transport (log driver)',
    );
    return { providerMessageId: `log-${crypto.randomUUID()}`, provider: `log-${this.channel.toLowerCase()}` };
  }
}

/** A channel whose provider is missing: delivery is attempted, fails, and is recorded as such. */
class UnconfiguredProvider implements NotificationChannelProvider {
  readonly configured = false;

  constructor(
    readonly channel: NotificationChannel,
    private readonly logger: BezzoLogger,
  ) {}

  async send(input: { userId: string }): Promise<{ providerMessageId: string | null; provider: string }> {
    this.logger.warnWith(
      { channel: this.channel, userId: input.userId },
      `${this.channel} provider is not configured — notification not delivered`,
    );
    throw new Error(`${this.channel} provider is not configured`);
  }
}

export interface QueueNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  channels?: NotificationChannel[];
  referenceType?: string;
  referenceId?: string;
  correlation?: EventCorrelation;
  payload?: Record<string, unknown>;
  scheduledAt?: Date;
}

@Injectable()
export class NotificationService {
  private readonly providers = new Map<NotificationChannel, NotificationChannelProvider>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseType,
    @InjectLogger() private readonly logger: BezzoLogger,
    private readonly metrics: MetricsService,
  ) {
    this.providers.set(NotificationChannel.IN_APP, new InAppProvider());

    const logTransport = (channel: NotificationChannel, enabled: boolean): NotificationChannelProvider => {
      if (!enabled) return new UnconfiguredProvider(channel, this.logger);
      if (this.config.NODE_ENV === 'production') return new UnconfiguredProvider(channel, this.logger);
      return new LogProvider(channel, this.logger);
    };

    this.providers.set(NotificationChannel.PUSH, logTransport(NotificationChannel.PUSH, config.NOTIFICATIONS_PUSH_ENABLED));
    this.providers.set(NotificationChannel.SMS, logTransport(NotificationChannel.SMS, config.NOTIFICATIONS_SMS_ENABLED));
    this.providers.set(NotificationChannel.EMAIL, logTransport(NotificationChannel.EMAIL, config.NOTIFICATIONS_EMAIL_ENABLED));
    this.providers.set(
      NotificationChannel.WHATSAPP,
      logTransport(NotificationChannel.WHATSAPP, config.NOTIFICATIONS_WHATSAPP_ENABLED),
    );
  }

  channelsConfigured(): Record<string, boolean> {
    return Object.fromEntries([...this.providers.entries()].map(([channel, provider]) => [channel, provider.configured]));
  }

  /**
   * Queue a notification. Pass the transaction client when the notification must be committed with
   * the business change that produced it.
   */
  async queue(queryable: Queryable, input: QueueNotificationInput): Promise<string[]> {
    if (!this.config.NOTIFICATIONS_ENABLED) return [];
    const channels = input.channels ?? [NotificationChannel.IN_APP];
    const ids: string[] = [];

    for (const channel of channels) {
      const inserted = await queryable.query<{ id: string }>(
        `INSERT INTO notifications (user_id, type, title, body, channel, status, reference_type, reference_id,
                                    correlation, payload, scheduled_at)
         VALUES ($1,$2,$3,$4,$5,'QUEUED',$6,$7::UUID,$8::JSONB,$9::JSONB, COALESCE($10, now()))
         RETURNING id`,
        [
          input.userId,
          input.type,
          input.title,
          input.body,
          channel,
          input.referenceType ?? null,
          input.referenceId ?? null,
          JSON.stringify(input.correlation ?? {}),
          JSON.stringify(input.payload ?? {}),
          input.scheduledAt ?? null,
        ],
      );
      const notificationId = inserted.rows[0]?.id;
      if (!notificationId) continue;
      ids.push(notificationId);

      await queryable.query(
        `INSERT INTO notification_deliveries (notification_id, channel, provider, status, next_attempt_at)
         VALUES ($1, $2, $3, 'QUEUED', now())`,
        [notificationId, channel, channel.toLowerCase()],
      );
      this.metrics.notifications.inc({ channel, status: 'queued' });
    }

    return ids;
  }

  /** Worker: dispatch due notifications with retry/backoff, then dead-letter. */
  async dispatchDue(limit: number, maxAttempts: number): Promise<{ sent: number; failed: number }> {
    const rows = await this.database.rows<NotificationDispatchRow>(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.channel, n.payload, n.reference_type, n.reference_id,
              d.id AS delivery_id, COALESCE(d.attempt_count, 0) AS attempt_count
         FROM notifications n
         LEFT JOIN notification_deliveries d ON d.notification_id = n.id AND d.channel = n.channel
        WHERE n.status = 'QUEUED' AND n.scheduled_at <= now()
          AND COALESCE(d.status, 'QUEUED') IN ('QUEUED','FAILED')
          AND COALESCE(d.next_attempt_at, now()) <= now()
        ORDER BY n.scheduled_at
        LIMIT $1`,
      [limit],
    );

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      const provider = this.providers.get(row.channel as NotificationChannel);
      if (!provider) {
        failed += 1;
        continue;
      }
      try {
        const result = await provider.send({
          userId: row.user_id,
          title: row.title,
          body: row.body,
          payload: row.payload ?? {},
        });
        await this.database.query(`UPDATE notifications SET status = 'SENT', sent_at = now() WHERE id = $1`, [row.id]);
        if (row.delivery_id) {
          await this.database.query(
            `UPDATE notification_deliveries
                SET status = 'SENT', sent_at = now(), attempt_count = attempt_count + 1,
                    provider_message_id = $2, last_error = NULL
              WHERE id = $1`,
            [row.delivery_id, result.providerMessageId],
          );
        }
        sent += 1;
        this.metrics.notifications.inc({ channel: row.channel, status: 'sent' });
      } catch (error) {
        failed += 1;
        const attempts = (row.attempt_count ?? 0) + 1;
        const exhausted = attempts >= maxAttempts;
        const backoffSeconds = Math.min(2 ** attempts * 5, 3600);
        await this.database.query(`UPDATE notifications SET status = $2 WHERE id = $1`, [
          row.id,
          exhausted ? 'DEAD_LETTER' : 'QUEUED',
        ]);
        if (row.delivery_id) {
          await this.database.query(
            `UPDATE notification_deliveries
                SET status = $2, attempt_count = attempt_count + 1, last_error = $3,
                    next_attempt_at = now() + ($4 || ' seconds')::INTERVAL
              WHERE id = $1`,
            [
              row.delivery_id,
              exhausted ? 'DEAD_LETTER' : 'FAILED',
              (error as Error).message.slice(0, 500),
              String(backoffSeconds),
            ],
          );
        }
        // IN_APP notifications are readable regardless; PUSH/SMS failures surface on the ops dashboard.
        this.metrics.notifications.inc({ channel: row.channel, status: exhausted ? 'dead_letter' : 'failed' });
      }
    }

    return { sent, failed };
  }

  async listForUser(userId: string, limit: number, offset: number, unreadOnly = false) {
    const rows = await this.database.rows<{
      id: string;
      type: string;
      title: string;
      body: string;
      channel: string;
      status: string;
      read_at: Date | null;
      created_at: Date;
      reference_type: string | null;
      reference_id: string | null;
    }>(
      `SELECT id, type, title, body, channel, status, read_at, created_at, reference_type, reference_id
         FROM notifications
        WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    const count = await this.database.row<{ count: string }>(
      `SELECT count(*)::TEXT AS count FROM notifications WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}`,
      [userId],
    );
    return {
      rows: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        channel: row.channel,
        status: row.status,
        read: Boolean(row.read_at),
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        createdAt: row.created_at.toISOString(),
      })),
      total: Number(count?.count ?? 0),
    };
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE notifications SET read_at = now(), status = 'READ'
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [notificationId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.database.query(
      `UPDATE notifications SET read_at = now(), status = 'READ' WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return result.rowCount ?? 0;
  }
}

interface NotificationDispatchRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  payload: Record<string, unknown> | null;
  reference_type: string | null;
  reference_id: string | null;
  delivery_id: string | null;
  attempt_count: number;
}

@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsInfraModule {}
