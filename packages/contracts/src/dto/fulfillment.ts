/**
 * Supplier fulfillment contracts.
 *
 * Source: Bezzo_order_fulfillment_and_multi_supplier_spec_v1.0.md §16–§24,
 * Bezzo_supplier_portal_and_supplier_operations_spec_v1.0.md §8,
 * Bezzo_picker_collection_system_architecture_spec_v1.0.md §4–§5.
 */
import type {
  FulfillmentItemStatus,
  FulfillmentStatus,
  PackageStatus,
  PickupTaskStatus,
} from '../domain/enums';

export interface SupplierFulfillmentItemResponse {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  dosageForm: string;
  packSize: string | null;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  status: FulfillmentItemStatus;
  shortPickedQuantity: number;
}

export interface SupplierFulfillmentPackageResponse {
  id: string;
  packageCode: string;
  status: PackageStatus;
  packageType: string;
  weightGrams: number | null;
  sealNumber: string | null;
  handlingNotes: string | null;
  pickupTaskId: string | null;
  collectedAt: string | null;
  createdAt: string;
}

export interface SupplierFulfillmentSummaryResponse {
  id: string;
  orderId: string;
  orderNumber: string;
  fulfillmentReference: string;
  status: FulfillmentStatus;
  subtotal: number;
  taxTotal: number;
  deliveryAllocation: number;
  total: number;
  packageCount: number;
  itemCount: number;
  buyerTradeName: string;
  deliveryLocality: string | null;
  deliveryCity: string | null;
  deliverySlotName: string | null;
  acceptedAt: string | null;
  packedAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface SupplierFulfillmentDetailResponse extends SupplierFulfillmentSummaryResponse {
  buyer: {
    id: string;
    tradeName: string;
    drugLicenceNumber: string | null;
    contactPhone: string | null;
  };
  deliveryAddress: {
    addressLine1: string;
    addressLine2: string | null;
    locality: string;
    city: string;
    state: string;
    postalCode: string;
  } | null;
  items: SupplierFulfillmentItemResponse[];
  packages: SupplierFulfillmentPackageResponse[];
  timeline: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actorType: string;
    createdAt: string;
  }>;
  pickupTask: {
    id: string;
    taskCode: string;
    status: PickupTaskStatus;
    priority: string;
    pickupWindowStart: string | null;
    pickupWindowEnd: string | null;
    assignedPickerName: string | null;
    assignedPickerPhone: string | null;
    createdAt: string;
  } | null;
}

export interface PackPackageInput {
  packageType?: 'STANDARD' | 'FRAGILE' | 'COLD_CHAIN' | 'RESTRICTED';
  weightGrams?: number;
  sealNumber?: string;
  handlingNotes?: string;
}

export interface PackFulfillmentInput {
  packages?: PackPackageInput[];
  notes?: string;
}

export interface RejectFulfillmentInput {
  reason: string;
}
