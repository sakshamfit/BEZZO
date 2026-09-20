/**
 * Buyer (medical store) profile, addresses and compliance documents.
 *
 * Tenant isolation: every query is scoped by the authenticated buyer id — a buyer can never read or
 * mutate another store's addresses, documents or profile by changing an identifier (project rule §2).
 */
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@bezzo/contracts';
import { Database, type Database as DatabaseType } from '@bezzo/database';
import { z } from 'zod';
import { DATABASE } from '../../infrastructure/database/database.module';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthenticatedActor } from '../../common/context/request-context';

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(60),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().min(8).max(20),
  addressLine1: z.string().trim().min(4).max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(12),
  country: z.string().trim().length(2).default('IN'),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const buyerProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(200).optional(),
  storeName: z.string().trim().min(2).max(200).optional(),
  businessType: z.string().trim().max(80).optional(),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'GSTIN format is invalid')
    .optional(),
  licenseReference: z.string().trim().max(64).optional(),
});

export const buyerDocumentSchema = z.object({
  documentType: z.enum([
    'RETAIL_DRUG_LICENSE',
    'GST_CERTIFICATE',
    'PAN',
    'BUSINESS_REGISTRATION',
    'PREMISES_PROOF',
    'AUTHORIZED_PERSON_PROOF',
    'QUALIFIED_PERSON_DOCUMENT',
    'BANK_DOCUMENT',
    'OTHER',
  ]),
  documentNumber: z.string().trim().max(64).optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fileName: z.string().trim().min(3).max(200),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  /** Base64 payload. In production the client uploads directly to object storage via a signed URL. */
  contentBase64: z.string().min(16).max(20_000_000),
});

export type AddressInput = z.infer<typeof addressSchema>;
export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;
export type BuyerDocumentInput = z.infer<typeof buyerDocumentSchema>;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class BuyersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseType,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Resolves the caller's buyer profile, enforcing that the account actually is a buyer. */
  async requireBuyer(actor: AuthenticatedActor) {
    if (!actor.buyerId) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'This account is not associated with a medical store profile');
    }
    const buyer = await this.database.row<BuyerRow>(
      `SELECT id, user_id, business_name, store_name, business_type, gstin, license_reference, status,
              verification_status, verified_at, credit_terms_days, created_at, updated_at
         FROM buyers WHERE id = $1`,
      [actor.buyerId],
    );
    if (!buyer) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Buyer profile not found');
    return buyer;
  }

  async getProfile(actor: AuthenticatedActor) {
    const buyer = await this.requireBuyer(actor);
    return this.serializeProfile(buyer);
  }

  async updateProfile(actor: AuthenticatedActor, input: BuyerProfileInput) {
    const buyer = await this.requireBuyer(actor);
    const updated = await this.database.row<BuyerRow>(
      `UPDATE buyers
          SET business_name = COALESCE($2, business_name),
              store_name = COALESCE($3, store_name),
              business_type = COALESCE($4, business_type),
              gstin = COALESCE($5, gstin),
              license_reference = COALESCE($6, license_reference)
        WHERE id = $1
        RETURNING id, user_id, business_name, store_name, business_type, gstin, license_reference, status,
                  verification_status, verified_at, credit_terms_days, created_at, updated_at`,
      [
        buyer.id,
        input.businessName ?? null,
        input.storeName ?? null,
        input.businessType ?? null,
        input.gstin ?? null,
        input.licenseReference ?? null,
      ],
    );
    await this.audit.record(this.database, {
      action: 'buyer.profile_updated',
      resourceType: 'buyer',
      resourceId: buyer.id,
      before: { businessName: buyer.business_name, gstin: buyer.gstin },
      after: { ...input },
    });
    return this.serializeProfile(updated as BuyerRow);
  }

  async listAddresses(actor: AuthenticatedActor) {
    const buyer = await this.requireBuyer(actor);
    const rows = await this.database.rows<AddressRow>(
      `SELECT * FROM buyer_addresses WHERE buyer_id = $1 AND status = 'ACTIVE' ORDER BY is_default DESC, created_at`,
      [buyer.id],
    );
    return rows.map((row) => this.serializeAddress(row));
  }

  async getAddress(actor: AuthenticatedActor, addressId: string) {
    const buyer = await this.requireBuyer(actor);
    const row = await this.database.row<AddressRow>(
      `SELECT * FROM buyer_addresses WHERE id = $1 AND buyer_id = $2 AND status = 'ACTIVE'`,
      [addressId, buyer.id],
    );
    if (!row) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Address not found');
    return this.serializeAddress(row);
  }

  async createAddress(actor: AuthenticatedActor, input: AddressInput) {
    const buyer = await this.requireBuyer(actor);
    const address = await this.database.transaction(async (client) => {
      if (input.isDefault) {
        await client.query(`UPDATE buyer_addresses SET is_default = FALSE WHERE buyer_id = $1 AND is_default`, [
          buyer.id,
        ]);
      }
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::TEXT AS count FROM buyer_addresses WHERE buyer_id = $1 AND status = 'ACTIVE'`,
        [buyer.id],
      );
      const shouldBeDefault = input.isDefault ?? Number(count.rows[0]?.count ?? 0) === 0;
      const result = await client.query<AddressRow>(
        `INSERT INTO buyer_addresses (buyer_id, label, contact_name, contact_phone, address_line_1, address_line_2,
                                      landmark, city, state, postal_code, country, latitude, longitude, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          buyer.id,
          input.label,
          input.contactName,
          input.contactPhone,
          input.addressLine1,
          input.addressLine2 ?? null,
          input.landmark ?? null,
          input.city,
          input.state,
          input.postalCode,
          input.country ?? 'IN',
          input.latitude ?? null,
          input.longitude ?? null,
          shouldBeDefault,
        ],
      );
      return result.rows[0];
    });
    await this.audit.record(this.database, {
      action: 'buyer.address_created',
      resourceType: 'buyer_address',
      resourceId: address?.id,
      after: { label: input.label, city: input.city },
    });
    return this.serializeAddress(address as AddressRow);
  }

  async updateAddress(actor: AuthenticatedActor, addressId: string, input: Partial<AddressInput>) {
    const buyer = await this.requireBuyer(actor);
    const existing = await this.database.row<AddressRow>(
      `SELECT * FROM buyer_addresses WHERE id = $1 AND buyer_id = $2 AND status = 'ACTIVE'`,
      [addressId, buyer.id],
    );
    if (!existing) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Address not found');

    const updated = await this.database.transaction(async (client) => {
      if (input.isDefault) {
        await client.query(`UPDATE buyer_addresses SET is_default = FALSE WHERE buyer_id = $1 AND is_default`, [
          buyer.id,
        ]);
      }
      const result = await client.query<AddressRow>(
        `UPDATE buyer_addresses
            SET label = COALESCE($3, label),
                contact_name = COALESCE($4, contact_name),
                contact_phone = COALESCE($5, contact_phone),
                address_line_1 = COALESCE($6, address_line_1),
                address_line_2 = COALESCE($7, address_line_2),
                landmark = COALESCE($8, landmark),
                city = COALESCE($9, city),
                state = COALESCE($10, state),
                postal_code = COALESCE($11, postal_code),
                latitude = COALESCE($12, latitude),
                longitude = COALESCE($13, longitude),
                is_default = COALESCE($14, is_default)
          WHERE id = $1 AND buyer_id = $2
          RETURNING *`,
        [
          addressId,
          buyer.id,
          input.label ?? null,
          input.contactName ?? null,
          input.contactPhone ?? null,
          input.addressLine1 ?? null,
          input.addressLine2 ?? null,
          input.landmark ?? null,
          input.city ?? null,
          input.state ?? null,
          input.postalCode ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.isDefault ?? null,
        ],
      );
      return result.rows[0];
    });
    return this.serializeAddress(updated as AddressRow);
  }

  async deleteAddress(actor: AuthenticatedActor, addressId: string): Promise<void> {
    const buyer = await this.requireBuyer(actor);
    const result = await this.database.query(
      `UPDATE buyer_addresses SET status = 'ARCHIVED', is_default = FALSE
        WHERE id = $1 AND buyer_id = $2 AND status = 'ACTIVE'`,
      [addressId, buyer.id],
    );
    if ((result.rowCount ?? 0) === 0) throw new DomainError(ErrorCode.RESOURCE_NOT_FOUND, 'Address not found');
    await this.audit.record(this.database, {
      action: 'buyer.address_archived',
      resourceType: 'buyer_address',
      resourceId: addressId,
    });
  }

  async listDocuments(actor: AuthenticatedActor) {
    const buyer = await this.requireBuyer(actor);
    const rows = await this.database.rows<DocumentRow>(
      `SELECT * FROM buyer_documents WHERE buyer_id = $1 ORDER BY created_at DESC`,
      [buyer.id],
    );
    return Promise.all(rows.map((row) => this.serializeDocument(row)));
  }

  async uploadDocument(actor: AuthenticatedActor, input: BuyerDocumentInput) {
    const buyer = await this.requireBuyer(actor);
    const content = Buffer.from(input.contentBase64, 'base64');
    if (content.byteLength === 0 || content.byteLength > MAX_DOCUMENT_BYTES) {
      throw new DomainError(ErrorCode.UPLOAD_REJECTED, 'The uploaded document is empty or exceeds the 10 MB limit');
    }
    const objectKey = this.storage.buildObjectKey({ type: 'BUYER', id: buyer.id }, input.fileName, 'documents');
    await this.storage.put({ objectKey, content, contentType: input.contentType, visibility: 'PRIVATE' });

    const document = await this.database.transaction(async (client) => {
      const inserted = await client.query<DocumentRow>(
        `INSERT INTO buyer_documents (buyer_id, document_type, document_number, object_key, file_name, content_type,
                                      file_size_bytes, status, issued_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8::DATE,$9::DATE)
         RETURNING *`,
        [
          buyer.id,
          input.documentType,
          input.documentNumber ?? null,
          objectKey,
          input.fileName,
          input.contentType,
          content.byteLength,
          input.issuedAt ?? null,
          input.expiresAt ?? null,
        ],
      );
      await client.query(
        `INSERT INTO files (object_key, file_name, content_type, size_bytes, owner_type, owner_id, visibility, status)
         VALUES ($1,$2,$3,$4,'BUYER',$5,'PRIVATE','UPLOADED')
         ON CONFLICT (object_key) DO NOTHING`,
        [objectKey, input.fileName, input.contentType, content.byteLength, buyer.id],
      );
      // Submitting a required document moves a registered store into DOCUMENTS_PENDING.
      await client.query(
        `UPDATE buyers SET verification_status = 'DOCUMENTS_PENDING'
          WHERE id = $1 AND verification_status = 'REGISTERED'`,
        [buyer.id],
      );
      return inserted.rows[0];
    });

    await this.audit.record(this.database, {
      action: 'buyer.document_uploaded',
      resourceType: 'buyer_document',
      resourceId: document?.id,
      metadata: { documentType: input.documentType },
    });
    return this.serializeDocument(document as DocumentRow);
  }

  async deleteDocument(actor: AuthenticatedActor, documentId: string): Promise<void> {
    const buyer = await this.requireBuyer(actor);
    const result = await this.database.query(
      `DELETE FROM buyer_documents WHERE id = $1 AND buyer_id = $2 AND status IN ('PENDING','REJECTED')`,
      [documentId, buyer.id],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'Only pending or rejected documents can be removed; approved compliance documents are retained',
      );
    }
  }

  private serializeProfile(row: BuyerRow) {
    return {
      id: row.id,
      userId: row.user_id,
      businessName: row.business_name,
      storeName: row.store_name,
      businessType: row.business_type,
      gstin: row.gstin,
      licenseReference: row.license_reference,
      status: row.status,
      verificationStatus: row.verification_status,
      verifiedAt: row.verified_at?.toISOString() ?? null,
      creditTermsDays: row.credit_terms_days,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private serializeAddress(row: AddressRow) {
    return {
      id: row.id,
      label: row.label,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      landmark: row.landmark,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      country: row.country,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      isDefault: row.is_default,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async serializeDocument(row: DocumentRow) {
    let downloadUrl: string | null = null;
    try {
      if (await this.storage.exists(row.object_key)) {
        downloadUrl = await this.storage.signedUrl(row.object_key);
      }
    } catch {
      downloadUrl = null;
    }
    return {
      id: row.id,
      documentType: row.document_type,
      documentNumber: row.document_number,
      status: row.status,
      issuedAt: row.issued_at ? row.issued_at.toISOString().slice(0, 10) : null,
      expiresAt: row.expires_at ? row.expires_at.toISOString().slice(0, 10) : null,
      verifiedAt: row.verified_at?.toISOString() ?? null,
      rejectionReason: row.rejection_reason,
      downloadUrl,
      createdAt: row.created_at.toISOString(),
    };
  }
}

interface BuyerRow {
  id: string;
  user_id: string;
  business_name: string;
  store_name: string;
  business_type: string | null;
  gstin: string | null;
  license_reference: string | null;
  status: string;
  verification_status: string;
  verified_at: Date | null;
  credit_terms_days: number;
  created_at: Date;
  updated_at: Date;
}

interface AddressRow {
  id: string;
  label: string;
  contact_name: string;
  contact_phone: string;
  address_line_1: string;
  address_line_2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DocumentRow {
  id: string;
  document_type: string;
  document_number: string | null;
  object_key: string;
  status: string;
  issued_at: Date | null;
  expires_at: Date | null;
  verified_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
}
