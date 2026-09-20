import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { DATABASE } from '../../infrastructure/database/database.module';
import { NotificationService } from '../../infrastructure/notifications/notification.service';
import { CurrentActor, Idempotent } from '../../common/decorators';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { pagePaginationSchema } from '../../common/pagination/pagination';
import type { AuthenticatedActor } from '../../common/context/request-context';

const listQuerySchema = pagePaginationSchema.extend({ unreadOnly: z.coerce.boolean().optional() });

const registerDeviceSchema = z.object({
  deviceId: z.string().min(4).max(128),
  platform: z.enum(['android', 'ios', 'web', 'admin']),
  pushToken: z.string().min(8).max(512).optional(),
  appVersion: z.string().max(32).optional(),
});

const preferenceSchema = z.object({
  eventType: z.string().min(2).max(64),
  channel: z.enum(['PUSH', 'SMS', 'EMAIL', 'IN_APP', 'WHATSAPP']),
  enabled: z.boolean(),
});

@ApiTags('notifications')
@Controller()
export class UsersController {
  constructor(
    private readonly notifications: NotificationService,
    @Inject(DATABASE) private readonly database: DatabaseType,
  ) {}

  @Get('notifications')
  @ApiOperation({ summary: "List the caller's notifications" })
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(validate(listQuerySchema)) query: { page: number; pageSize: number; unreadOnly?: boolean },
  ) {
    const { rows, total } = await this.notifications.listForUser(
      actor.userId,
      query.pageSize,
      (query.page - 1) * query.pageSize,
      query.unreadOnly ?? false,
    );
    return {
      items: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.max(Math.ceil(total / query.pageSize), 1),
      },
    };
  }

  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markRead(@CurrentActor() actor: AuthenticatedActor, @Param('notificationId') notificationId: string) {
    return { updated: await this.notifications.markRead(actor.userId, notificationId) };
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every notification as read' })
  async markAllRead(@CurrentActor() actor: AuthenticatedActor) {
    return { updated: await this.notifications.markAllRead(actor.userId) };
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'List notification preferences (defaults applied when unset)' })
  async preferences(@CurrentActor() actor: AuthenticatedActor) {
    const rows = await this.database.rows<{ event_type: string; channel: string; enabled: boolean }>(
      `SELECT event_type, channel, enabled FROM notification_preferences WHERE user_id = $1
        ORDER BY event_type, channel`,
      [actor.userId],
    );
    return rows.map((row) => ({ eventType: row.event_type, channel: row.channel, enabled: row.enabled }));
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Enable/disable a notification channel for an event type' })
  async updatePreference(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(preferenceSchema)) body: { eventType: string; channel: string; enabled: boolean },
  ) {
    await this.database.query(
      `INSERT INTO notification_preferences (user_id, event_type, channel, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, event_type, channel) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [actor.userId, body.eventType, body.channel, body.enabled],
    );
    return body;
  }

  @Post('devices')
  @Idempotent('user.device_register')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register a device and its push token' })
  async registerDevice(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(registerDeviceSchema))
    body: { deviceId: string; platform: string; pushToken?: string; appVersion?: string },
  ) {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO devices (user_id, device_id, platform, app_version, push_token, last_active_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id, device_id) DO UPDATE
           SET platform = EXCLUDED.platform,
               app_version = EXCLUDED.app_version,
               push_token = COALESCE(EXCLUDED.push_token, devices.push_token),
               last_active_at = now()`,
        [actor.userId, body.deviceId, body.platform, body.appVersion ?? null, body.pushToken ?? null],
      );
      if (body.pushToken && body.platform !== 'admin') {
        await client.query(
          `INSERT INTO device_push_tokens (user_id, token, platform, app_version, active, last_seen_at)
           VALUES ($1, $2, $3, $4, TRUE, now())
           ON CONFLICT (token) DO UPDATE
             SET user_id = EXCLUDED.user_id, active = TRUE, last_seen_at = now(),
                 platform = EXCLUDED.platform, app_version = EXCLUDED.app_version`,
          [actor.userId, body.pushToken, body.platform, body.appVersion ?? null],
        );
      }
    });
    return { registered: true };
  }

  @Delete('devices/:deviceId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unregister a device (stops push delivery to it)' })
  async removeDevice(@CurrentActor() actor: AuthenticatedActor, @Param('deviceId') deviceId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const removed = await client.query<{ push_token: string | null }>(
        `DELETE FROM devices WHERE user_id = $1 AND device_id = $2 RETURNING push_token`,
        [actor.userId, deviceId],
      );
      const token = removed.rows[0]?.push_token;
      if (token) {
        await client.query(`UPDATE device_push_tokens SET active = FALSE WHERE token = $1`, [token]);
      }
    });
  }

  @Get('devices')
  @ApiOperation({ summary: 'List the registered devices for the caller' })
  async devices(@CurrentActor() actor: AuthenticatedActor) {
    const rows = await this.database.rows<{
      device_id: string;
      platform: string;
      app_version: string | null;
      last_active_at: Date;
      push_enabled: boolean;
    }>(
      `SELECT d.device_id, d.platform, d.app_version, d.last_active_at,
              COALESCE(t.active, FALSE) AS push_enabled
         FROM devices d
         LEFT JOIN device_push_tokens t ON t.token = d.push_token
        WHERE d.user_id = $1
        ORDER BY d.last_active_at DESC`,
      [actor.userId],
    );
    return rows.map((row) => ({
      deviceId: row.device_id,
      platform: row.platform,
      appVersion: row.app_version,
      lastActiveAt: row.last_active_at.toISOString(),
      pushEnabled: row.push_enabled,
    }));
  }
}
