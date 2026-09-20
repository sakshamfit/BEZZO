import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@bezzo/contracts';
import { CurrentActor, Idempotent, RequirePermissions, Roles } from '../../common/decorators';
import type { AuthenticatedActor } from '../../common/context/request-context';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { BuyersService, addressSchema, buyerDocumentSchema, buyerProfileSchema } from './buyers.service';
import type { AddressInput, BuyerDocumentInput, BuyerProfileInput } from './buyers.service';

@ApiTags('buyer')
@Controller('buyer')
export class BuyersController {
  constructor(private readonly buyers: BuyersService) {}

  @Get('profile')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_READ)
  @ApiOperation({ summary: 'Get the medical-store business profile' })
  async profile(@CurrentActor() actor: AuthenticatedActor) {
    return this.buyers.getProfile(actor);
  }

  @Patch('profile')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Update the medical-store business profile' })
  async updateProfile(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(buyerProfileSchema)) body: BuyerProfileInput,
  ) {
    return this.buyers.updateProfile(actor, body);
  }

  @Get('addresses')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_READ)
  @ApiOperation({ summary: 'List delivery addresses for the store' })
  async addresses(@CurrentActor() actor: AuthenticatedActor) {
    return this.buyers.listAddresses(actor);
  }

  @Get('addresses/:addressId')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_READ)
  async address(@CurrentActor() actor: AuthenticatedActor, @Param('addressId') addressId: string) {
    return this.buyers.getAddress(actor, addressId);
  }

  @Post('addresses')
  @Idempotent('buyer.address_create')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Create a delivery address' })
  async createAddress(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(addressSchema)) body: AddressInput,
  ) {
    return this.buyers.createAddress(actor, body);
  }

  @Patch('addresses/:addressId')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Update a delivery address' })
  async updateAddress(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('addressId') addressId: string,
    @Body(validate(addressSchema.partial())) body: Partial<AddressInput>,
  ) {
    return this.buyers.updateAddress(actor, addressId, body);
  }

  @Delete('addresses/:addressId')
  @HttpCode(204)
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Archive a delivery address' })
  async deleteAddress(@CurrentActor() actor: AuthenticatedActor, @Param('addressId') addressId: string): Promise<void> {
    await this.buyers.deleteAddress(actor, addressId);
  }

  @Get('documents')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_READ)
  @ApiOperation({ summary: 'List compliance documents (signed URLs only, never raw object keys)' })
  async documents(@CurrentActor() actor: AuthenticatedActor) {
    return this.buyers.listDocuments(actor);
  }

  @Post('documents')
  @Idempotent('buyer.document_upload')
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Upload a compliance document (retail drug licence, GST, PAN, ...)' })
  async uploadDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(validate(buyerDocumentSchema)) body: BuyerDocumentInput,
  ) {
    return this.buyers.uploadDocument(actor, body);
  }

  @Delete('documents/:documentId')
  @HttpCode(204)
  @Roles('BUYER', 'BUYER_OWNER', 'BUYER_STAFF')
  @RequirePermissions(Permission.BUYER_PROFILE_WRITE)
  @ApiOperation({ summary: 'Remove a pending or rejected document' })
  async deleteDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    await this.buyers.deleteDocument(actor, documentId);
  }
}
