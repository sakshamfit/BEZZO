import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { CartService, cartItemSchema, cartQuantitySchema } from './cart.service';
import type { CartItemInput } from './cart.service';

const BUYER_ROLES = ['BUYER', 'BUYER_OWNER', 'BUYER_STAFF'] as const;

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_READ)
  @ApiOperation({ summary: "The buyer's active cart with live pricing and availability" })
  async view(@CurrentActor() actor: AuthenticatedActor) {
    return this.cart.view(actor);
  }

  @Post('items')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @Idempotent('cart.add_item')
  @ApiOperation({ summary: 'Add a supplier offer to the cart (quantities are validated against live stock)' })
  async addItem(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(cartItemSchema)) body: CartItemInput,
  ) {
    return this.cart.addItem(actor, body);
  }

  @Patch('items/:itemId')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @ApiOperation({ summary: 'Set the quantity of a cart line' })
  async updateItem(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('itemId') itemId: string,
    @Body(validate(cartQuantitySchema)) body: { quantity: number },
  ) {
    return this.cart.updateItem(actor, itemId, body.quantity);
  }

  @Delete('items/:itemId')
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @ApiOperation({ summary: 'Remove a line from the cart' })
  async removeItem(@CurrentActor() actor: AuthenticatedActor, @Param('itemId') itemId: string) {
    return this.cart.removeItem(actor, itemId);
  }

  @Delete()
  @Roles(...BUYER_ROLES)
  @RequirePermissions(Permission.BUYER_ORDER_WRITE)
  @HttpCode(200)
  @ApiOperation({ summary: 'Empty the active cart' })
  async clear(@CurrentActor() actor: AuthenticatedActor) {
    return this.cart.clear(actor);
  }
}
