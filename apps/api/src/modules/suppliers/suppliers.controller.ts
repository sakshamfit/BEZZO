import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { z } from 'zod';
import { Audited, CurrentActor, Idempotent, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { pagePaginationSchema } from '../../common/pagination/pagination';
import {
  SuppliersService,
  listingCreateSchema,
  listingUpdateSchema,
  stockAdjustSchema,
  stockSetSchema,
  supplierDocumentSchema,
  supplierProfileSchema,
  type ListingCreateInput,
  type ListingUpdateInput,
  type StockAdjustInput,
  type StockSetInput,
  type SupplierDocumentInput,
  type SupplierProfileInput,
} from './suppliers.service';

const listingQuerySchema = pagePaginationSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'OUT_OF_STOCK', 'SUSPENDED']).optional(),
  search: z.string().trim().max(120).optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

const inventoryQuerySchema = pagePaginationSchema.extend({
  status: z
    .enum(['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'QUARANTINED', 'BLOCKED', 'DAMAGED', 'EXPIRED', 'RECALLED', 'DEPLETED'])
    .optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

@ApiTags('supplier')
@Controller('supplier')
@Roles('SUPPLIER', 'SUPPLIER_OWNER', 'SUPPLIER_INVENTORY', 'SUPPLIER_FINANCE')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get('profile')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_READ)
  @ApiOperation({ summary: 'Supplier profile with catalog statistics' })
  async profile(@CurrentActor() actor: AuthenticatedActor) {
    return this.suppliers.getProfile(actor);
  }

  @Patch('profile')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_WRITE)
  @Audited('supplier.profile_updated', 'supplier')
  @ApiOperation({ summary: 'Update supplier profile and pickup location' })
  async updateProfile(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(supplierProfileSchema)) body: SupplierProfileInput,
  ) {
    return this.suppliers.updateProfile(actor, body);
  }

  @Post('verification/submit')
  @Idempotent('supplier.verification_submit')
  @HttpCode(202)
  @RequirePermissions(Permission.SUPPLIER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Submit the business for compliance verification' })
  async submitForVerification(@CurrentActor() actor: AuthenticatedActor) {
    return this.suppliers.submitForVerification(actor);
  }

  @Get('documents')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_READ)
  @ApiOperation({ summary: 'List compliance documents' })
  async documents(@CurrentActor() actor: AuthenticatedActor) {
    return this.suppliers.listDocuments(actor);
  }

  @Post('documents')
  @Idempotent('supplier.document_upload')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Upload a compliance document (drug licence, GST, PAN, ...)' })
  async uploadDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(supplierDocumentSchema)) body: SupplierDocumentInput,
  ) {
    return this.suppliers.uploadDocument(actor, body);
  }

  @Get('listings')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_READ)
  @ApiOperation({ summary: 'List the supplier catalog listings with live stock' })
  async listings(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(validate(listingQuerySchema)) query: z.infer<typeof listingQuerySchema>,
  ) {
    const { rows, total } = await this.suppliers.listListings(actor, query);
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

  @Post('listings')
  @Idempotent('supplier.listing_create')
  @RequirePermissions(Permission.SUPPLIER_LISTING_WRITE)
  @Audited('supplier.listing_created', 'supplier_listing')
  @ApiOperation({ summary: 'Create a listing for a catalog product, optionally with opening stock' })
  async createListing(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(listingCreateSchema)) body: ListingCreateInput,
  ) {
    return this.suppliers.createListing(actor, body);
  }

  @Get('listings/:listingId')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_READ)
  @ApiOperation({ summary: 'Get one listing with stock and pricing' })
  async listing(@CurrentActor() actor: AuthenticatedActor, @Param('listingId') listingId: string) {
    return this.suppliers.getListing(actor, listingId);
  }

  @Patch('listings/:listingId')
  @RequirePermissions(Permission.SUPPLIER_LISTING_WRITE)
  @Audited('supplier.listing_updated', 'supplier_listing')
  @ApiOperation({ summary: 'Update price, MOQ, lead time or listing status (price changes are versioned)' })
  async updateListing(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('listingId') listingId: string,
    @Body(validate(listingUpdateSchema)) body: ListingUpdateInput,
  ) {
    return this.suppliers.updateListing(actor, listingId, body);
  }

  @Get('inventory')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_READ)
  @ApiOperation({ summary: 'List inventory positions (available, reserved, sellable)' })
  async inventory(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(validate(inventoryQuerySchema)) query: z.infer<typeof inventoryQuerySchema>,
  ) {
    const { rows, total } = await this.suppliers.listInventory(actor, query);
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

  @Post('inventory/:inventoryId/adjust')
  @Idempotent('supplier.inventory_adjust')
  @HttpCode(200)
  @RequirePermissions(Permission.SUPPLIER_INVENTORY_WRITE)
  @Audited('supplier.inventory_adjusted', 'inventory')
  @ApiOperation({ summary: 'Adjust available stock by a delta; every change is written to the stock ledger' })
  async adjustStock(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('inventoryId') inventoryId: string,
    @Body(validate(stockAdjustSchema)) body: StockAdjustInput,
  ) {
    return this.suppliers.adjustStock(actor, inventoryId, body);
  }

  @Post('inventory/:inventoryId/set')
  @Idempotent('supplier.inventory_set')
  @HttpCode(200)
  @RequirePermissions(Permission.SUPPLIER_INVENTORY_WRITE)
  @Audited('supplier.inventory_set', 'inventory')
  @ApiOperation({ summary: 'Set available stock to an absolute value (stock-take); reserved stock is preserved' })
  async setStock(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('inventoryId') inventoryId: string,
    @Body(validate(stockSetSchema)) body: StockSetInput,
  ) {
    return this.suppliers.setStock(actor, inventoryId, body);
  }

  @Get('inventory/:inventoryId/ledger')
  @RequirePermissions(Permission.SUPPLIER_PROFILE_READ)
  @ApiOperation({ summary: 'Append-only stock ledger for one inventory position' })
  async ledger(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('inventoryId') inventoryId: string,
    @Query(validate(pagePaginationSchema)) query: { page: number; pageSize: number },
  ) {
    return this.suppliers.listStockLedger(actor, inventoryId, query.page, query.pageSize);
  }
}
