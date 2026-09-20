/**
 * Partner applications — the public intake behind the "Apply" forms.
 *
 * Design notes:
 *  - the endpoint is public (an applicant has no account yet) but everything else about it is
 *    deliberate: strict validation, a database-generated reference, one row per submission, an audit
 *    entry, a domain event and an operations notification;
 *  - **routing**: every application is handed to the operations WhatsApp line
 *    (`APPLICATIONS_WHATSAPP_NUMBER`, default +91 86046 83669, see `@bezzo/config`). The service
 *    returns a `wa.me` deep link whose message already contains the reference and the applicant's
 *    details, so the applicant's own WhatsApp sends the application to that number. The number is
 *    configuration, never a literal in the UI, and the stored row always records where it was routed;
 *  - the intake does NOT create users, suppliers or buyers: verification is a human gate
 *    (compliance spec §3), and pretending otherwise would create half-built accounts.
 */
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DomainEventName,
  ErrorCode,
  PartnerApplicationStatus,
  PartnerApplicationType,
  Permission,
  RoleCode,
} from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import type { AppConfig } from '@bezzo/config';
import { APP_CONFIG } from '../../infrastructure/config/config.module';
import { DATABASE } from '../../infrastructure/database/database.module';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { NotificationService } from '../../infrastructure/notifications/notification.service';
import { DomainError } from '../../common/errors/domain-error';
import { paginate, sqlLimitOffset, type PagePaginationInput } from '../../common/pagination/pagination';

const phone = z
  .string()
  .trim()
  .regex(/^(\+?[1-9]\d{7,14})$/, 'Use an international number, e.g. +919876543210');

export const createApplicationSchema = z.object({
  applicationType: z.enum([
    PartnerApplicationType.SUPPLIER,
    PartnerApplicationType.PICKER,
    PartnerApplicationType.RETAILER,
    PartnerApplicationType.PARTNER,
  ]),
  applicantName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(180),
  contactPhone: phone,
  contactEmail: z.string().trim().email().max(180).nullish().transform((value) => value ?? undefined),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(12).nullish().transform((value) => value ?? undefined),
  gstin: z.string().trim().min(5).max(20).nullish().transform((value) => value ?? undefined),
  licenceReference: z.string().trim().min(3).max(60).nullish().transform((value) => value ?? undefined),
  yearsInBusiness: z.coerce.number().int().min(0).max(200).nullish().transform((value) => value ?? undefined),
  monthlyVolume: z.string().trim().max(60).nullish().transform((value) => value ?? undefined),
  message: z.string().trim().max(2000).nullish().transform((value) => value ?? undefined),
});

export const updateApplicationSchema = z.object({
  status: z.enum([
    PartnerApplicationStatus.NEW,
    PartnerApplicationStatus.CONTACTED,
    PartnerApplicationStatus.IN_REVIEW,
    PartnerApplicationStatus.APPROVED,
    PartnerApplicationStatus.REJECTED,
    PartnerApplicationStatus.DUPLICATE,
  ]),
  reviewNotes: z.string().trim().max(1000).nullish().transform((value) => value ?? undefined),
});

export const applicationListQuerySchema = z.object({
  status: z
    .enum([
      PartnerApplicationStatus.NEW,
      PartnerApplicationStatus.CONTACTED,
      PartnerApplicationStatus.IN_REVIEW,
      PartnerApplicationStatus.APPROVED,
      PartnerApplicationStatus.REJECTED,
      PartnerApplicationStatus.DUPLICATE,
    ])
    .optional(),
  applicationType: z
    .enum([
      PartnerApplicationType.SUPPLIER,
      PartnerApplicationType.PICKER,
      PartnerApplicationType.RETAILER,
      PartnerApplicationType.PARTNER,
    ])
    .optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

interface ApplicationRow {
  id: string;
  reference: string;
  application_type: string;
  status: string;
  applicant_name: string;
  business_name: string;
  contact_phone: string;
  contact_email: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  gstin: string | null;
  licence_reference: string | null;
  years_in_business: number | null;
  monthly_volume: string | null;
  message: string | null;
  routed_to_number: string;
  whatsapp_url: string;
  delivery_channel: string;
  source: string;
  review_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationService,
  ) {}

  /** Human-readable label used inside the WhatsApp message. */
  private static readonly TYPE_LABEL: Record<string, string> = {
    SUPPLIER: 'Wholesaler / supplier',
    PICKER: 'Pickup partner (picker)',
    RETAILER: 'Medical store / retailer',
    PARTNER: 'Other partnership',
  };

  /**
   * POST /applications — public intake.
   *
   * The response carries everything the applicant needs to complete the hand-off: the reference, the
   * operations number (formatted for display) and a ready `wa.me` link whose text is the application
   * summary. Nothing is sent automatically — no WhatsApp Business credentials are configured, and
   * claiming an automated delivery that did not happen would be a lie.
   */
  async submit(input: CreateApplicationInput, context: { requestId: string | null; ip: string | null; userId: string | null }) {
    const routedTo = this.config.APPLICATIONS_WHATSAPP_NUMBER;

    const created = await this.database.transaction(async (client) => {
      const inserted = await client.query<ApplicationRow>(
        `INSERT INTO partner_applications
           (reference, application_type, applicant_name, business_name, contact_phone, contact_email,
            city, state, postal_code, gstin, licence_reference, years_in_business, monthly_volume,
            message, routed_to_number, whatsapp_url, source, user_id, request_id, ip_address)
         VALUES (bezzo_next_application_reference(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'','web',$15,$16,$17)
         RETURNING *`,
        [
          input.applicationType,
          input.applicantName,
          input.businessName,
          input.contactPhone,
          input.contactEmail ?? null,
          input.city,
          input.state,
          input.postalCode ?? null,
          input.gstin ?? null,
          input.licenceReference ?? null,
          input.yearsInBusiness ?? null,
          input.monthlyVolume ?? null,
          input.message ?? null,
          routedTo,
          context.userId,
          context.requestId,
          context.ip,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error('Application insert returned no row');

      const whatsappUrl = this.buildWhatsappUrl(row);
      await client.query(`UPDATE partner_applications SET whatsapp_url = $2, updated_at = now() WHERE id = $1`, [
        row.id,
        whatsappUrl,
      ]);
      row.whatsapp_url = whatsappUrl;

      await this.events.emit(client, {
        eventName: DomainEventName.PartnerApplicationSubmitted,
        aggregateType: 'partner_application',
        aggregateId: row.id,
        payload: {
          reference: row.reference,
          applicationType: row.application_type,
          city: row.city,
          state: row.state,
          routedTo,
        },
      });

      await this.audit.record(client, {
        action: 'application.submitted',
        resourceType: 'partner_application',
        resourceId: row.id,
        metadata: {
          reference: row.reference,
          applicationType: row.application_type,
          routedTo,
        },
      });

      return row;
    });

    /* Operations gets an in-app notification per operator role so the queue is never missed, even if
       nobody is watching the WhatsApp line. Delivery failure here must not fail the applicant's
       submission — the row already exists. */
    await this.notifyOperations(created).catch(() => undefined);

    return this.serialize(created);
  }

  /** GET /admin/applications — the triage queue. */
  async list(query: ApplicationListQuery) {
    const { limit, offset } = sqlLimitOffset(query as PagePaginationInput);
    const filters: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.applicationType) {
      params.push(query.applicationType);
      filters.push(`application_type = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      filters.push(
        `(lower(reference) LIKE $${params.length} OR lower(business_name) LIKE $${params.length} OR lower(applicant_name) LIKE $${params.length} OR contact_phone LIKE $${params.length})`,
      );
    }
    const where = filters.join(' AND ');

    const total = await this.database.row<{ count: string }>(`SELECT count(*)::TEXT AS count FROM partner_applications WHERE ${where}`, params);
    const rows = await this.database.rows<ApplicationRow>(
      `SELECT * FROM partner_applications WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const summary = await this.database.rows<{ status: string; count: string }>(
      `SELECT status, count(*)::TEXT AS count FROM partner_applications GROUP BY status`,
    );

    return {
      ...paginate(rows.map((row) => this.serialize(row)), Number(total?.count ?? 0), query as PagePaginationInput),
      statusCounts: Object.fromEntries(summary.map((row) => [row.status, Number(row.count)])),
    };
  }

  /**
   * GET /admin/applications/summary — counters for the operations queue.
   *
   * A dedicated endpoint rather than metadata smuggled inside a paginated list: the queue header must
   * show how much work exists regardless of the filters the operator has applied.
   */
  async summary() {
    const rows = await this.database.rows<{ status: string; count: string; oldest: Date | null }>(
      `SELECT status, count(*)::TEXT AS count, min(created_at) AS oldest
         FROM partner_applications
        GROUP BY status`,
    );
    const statusCounts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)])) as Record<string, number>;
    return {
      statusCounts,
      total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
      awaitingReview: rows.find((row) => row.status === 'NEW')?.oldest ?? null,
      whatsappNumber: this.config.APPLICATIONS_WHATSAPP_DISPLAY,
    };
  }

  /** PATCH /admin/applications/:id — move an application through the review states. */
  async update(applicationId: string, input: UpdateApplicationInput, actor: { userId: string }) {
    const updated = await this.database.transaction(async (client) => {
      const existing = await client.query<{ status: string; reference: string }>(
        `SELECT status, reference FROM partner_applications WHERE id = $1 FOR UPDATE`,
        [applicationId],
      );
      const row = existing.rows[0];
      if (!row) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Application not found');

      const result = await client.query<ApplicationRow>(
        `UPDATE partner_applications
            SET status = $2, review_notes = COALESCE($3, review_notes), reviewed_by = $4, reviewed_at = now(), updated_at = now()
          WHERE id = $1
        RETURNING *`,
        [applicationId, input.status, input.reviewNotes ?? null, actor.userId],
      );
      const application = result.rows[0];
      if (!application) throw new Error('Application update returned no row');

      await this.events.emit(client, {
        eventName: DomainEventName.PartnerApplicationStatusChanged,
        aggregateType: 'partner_application',
        aggregateId: applicationId,
        payload: { reference: row.reference, fromStatus: row.status, toStatus: input.status },
      });
      await this.audit.record(client, {
        action: 'application.status_changed',
        resourceType: 'partner_application',
        resourceId: applicationId,
        metadata: { fromStatus: row.status, toStatus: input.status, reference: row.reference },
      });

      return application;
    });

    return this.serialize(updated);
  }

  /** GET /applications/routing — public: where applications are delivered (used by the apply screen). */
  routing() {
    return {
      whatsappNumber: this.config.APPLICATIONS_WHATSAPP_DISPLAY,
      whatsappNumberRaw: this.config.APPLICATIONS_WHATSAPP_NUMBER,
      whatsappUrl: `https://wa.me/${this.config.APPLICATIONS_WHATSAPP_NUMBER}`,
      channel: 'WHATSAPP_HANDOFF',
    };
  }

  /** The prefilled WhatsApp message an applicant sends from their own phone. */
  private buildWhatsappUrl(row: ApplicationRow): string {
    const type = ApplicationsService.TYPE_LABEL[row.application_type] ?? row.application_type;
    const lines = [
      `*BEZZO partner application* — ${row.reference}`,
      `Type: ${type}`,
      `Business: ${row.business_name}`,
      `Contact: ${row.applicant_name}`,
      `Phone: ${row.contact_phone}`,
      `Location: ${row.city}, ${row.state}${row.postal_code ? ` ${row.postal_code}` : ''}`,
    ];
    if (row.gstin) lines.push(`GSTIN: ${row.gstin}`);
    if (row.licence_reference) lines.push(`Drug licence: ${row.licence_reference}`);
    if (row.years_in_business !== null) lines.push(`Years in business: ${row.years_in_business}`);
    if (row.monthly_volume) lines.push(`Monthly volume: ${row.monthly_volume}`);
    if (row.message) lines.push(`Note: ${row.message}`);
    lines.push('', 'Please review this application.');

    return `https://wa.me/${row.routed_to_number}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  private serialize(row: ApplicationRow) {
    return {
      id: row.id,
      reference: row.reference,
      applicationType: row.application_type,
      status: row.status,
      applicantName: row.applicant_name,
      businessName: row.business_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      gstin: row.gstin,
      licenceReference: row.licence_reference,
      yearsInBusiness: row.years_in_business,
      monthlyVolume: row.monthly_volume,
      message: row.message,
      routedToNumber: row.routed_to_number,
      routedToDisplay: this.config.APPLICATIONS_WHATSAPP_DISPLAY,
      whatsappUrl: row.whatsapp_url,
      deliveryChannel: row.delivery_channel,
      source: row.source,
      reviewNotes: row.review_notes,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async notifyOperations(application: ApplicationRow) {
    const operators = await this.database.rows<{ user_id: string }>(
      `SELECT DISTINCT ur.user_id
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE r.code = ANY($1::text[])
          AND ur.revoked_at IS NULL`,
      [[RoleCode.ADMIN, RoleCode.SUPER_ADMIN, RoleCode.OPERATIONS_AGENT]],
    );
    await Promise.all(
      operators.map((operator) =>
        this.notifications.queue(this.database, {
          userId: operator.user_id,
          type: 'partner_application.submitted',
          title: `New ${application.application_type.toLowerCase()} application — ${application.reference}`,
          body: `${application.business_name} (${application.city}) applied; the hand-off line is ${this.config.APPLICATIONS_WHATSAPP_DISPLAY}.`,
          channels: ['IN_APP'],
          referenceType: 'partner_application',
          referenceId: application.id,
          payload: {
            reference: application.reference,
            applicationId: application.id,
            whatsappUrl: application.whatsapp_url,
            permission: Permission.ADMIN_APPLICATION_READ,
          },
        }),
      ),
    );
  }
}
