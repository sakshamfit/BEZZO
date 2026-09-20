import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { currentActor } from '../../common/context/request-context';
import { Public } from '../../common/decorators';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { pagePaginationSchema } from '../../common/pagination/pagination';
import { CatalogService } from './catalog.service';

const searchQuerySchema = pagePaginationSchema.extend({
  q: z.string().trim().min(2).max(120).optional(),
  categoryId: z.string().uuid().optional(),
  manufacturerId: z.string().uuid().optional(),
  dosageForm: z.string().trim().max(40).optional(),
  strength: z.string().trim().max(60).optional(),
  packSize: z.string().trim().max(60).optional(),
  supplierId: z.string().uuid().optional(),
  prescriptionClassification: z
    .enum(['NOT_SCHEDULED', 'PRESCRIPTION_REQUIRED', 'CONTROLLED_SCHEDULE', 'NARCOTIC', 'OTC'])
    .optional(),
  inStockOnly: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'name_asc', 'created_desc']).default('relevance'),
});

const suggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(60),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Active product categories with published product counts' })
  async categories() {
    return this.catalog.listCategories();
  }

  @Public()
  @Get('manufacturers')
  @ApiOperation({ summary: 'Active manufacturers with published product counts' })
  async manufacturers() {
    return this.catalog.listManufacturers();
  }

  @Public()
  @Get('dosage-forms')
  @ApiOperation({ summary: 'Supported dosage forms (tablet, syrup, injection, ...)' })
  async dosageForms() {
    return this.catalog.listDosageForms();
  }

  @Public()
  @Get('delivery-slots')
  @ApiOperation({ summary: 'Active delivery slots with cut-off times' })
  async deliverySlots() {
    return this.catalog.listDeliverySlots();
  }

  /**
   * Marketplace search. Public so that unauthenticated visitors can browse; pricing/offers are the
   * same for everyone because BEZZO is a B2B marketplace with uniform trade prices.
   */
  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Search published products (OpenSearch, degraded DB fallback)' })
  async products(@Query(validate(searchQuerySchema)) query: z.infer<typeof searchQuerySchema>) {
    return this.catalog.searchProducts(query);
  }

  @Public()
  @Get('products/suggest')
  @ApiOperation({ summary: 'Type-ahead product suggestions' })
  async suggest(@Query(validate(suggestQuerySchema)) query: { q: string; limit: number }) {
    return this.catalog.suggest(query.q, query.limit);
  }

  @Public()
  @Get('products/:productId')
  @ApiOperation({ summary: 'Product detail with live supplier offers (best price first)' })
  async product(@Param('productId') productId: string) {
    const actor = currentActor();
    return this.catalog.getProduct(productId, { buyerId: actor?.buyerId ?? null });
  }
}
