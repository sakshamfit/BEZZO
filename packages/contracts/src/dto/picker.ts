/**
 * Picker / pickup / hub-receiving contracts.
 *
 * Source: Bezzo_picker_collection_system_architecture_spec_v1.0.md §5–§48 (task discovery,
 * assignment, offers, availability, state machine, scanning, partial pickup, runs, handover,
 * hub receiving, exceptions, metrics) — endpoint names follow §24 verbatim.
 */
import type {
  HubReceivingStatus,
  HubScanResult,
  OfferOutcome,
  PackageStatus,
  PickerStatus,
  PickupExceptionStatus,
  PickupExceptionType,
  PickupRunStatus,
  PickupStopStatus,
  PickupTaskPriority,
  PickupTaskStatus,
  VehicleType,
} from '../domain/enums';

/* ------------------------------------------------------------------------------------------------
 * Picker profile & availability
 * ---------------------------------------------------------------------------------------------- */
export interface PickerProfileResponse {
  id: string;
  userId: string;
  employeeCode: string;
  status: PickerStatus;
  phone: string | null;
  vehicleType: VehicleType;
  capacityPackages: number;
  homeHub: { id: string; code: string; name: string } | null;
  currentLoadPackages: number;
  availableCapacityPackages: number;
  lastHeartbeatAt: string | null;
  metrics: PickerMetricsResponse;
}

export interface PickerMetricsResponse {
  tasksCompleted: number;
  packagesCollected: number;
  acceptanceRate: number;
  averageAcceptanceSeconds: number | null;
  averagePickupDurationMinutes: number | null;
  averageHandoverMinutes: number | null;
  failedPickupRate: number;
  partialPickupRate: number;
}

export interface PickerAvailabilityResponse {
  status: PickerStatus;
  lastHeartbeatAt: string | null;
  isStale: boolean;
  heartbeatTtlSeconds: number;
  activeTask: PickupTaskSummaryResponse | null;
  currentLoadPackages: number;
  capacityPackages: number;
}

export interface SetAvailabilityRequest {
  status: Extract<PickerStatus, 'AVAILABLE' | 'OFFLINE' | 'ON_BREAK'>;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}

export interface PickerHeartbeatRequest {
  status?: PickerStatus;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  deviceConnectivity?: 'ONLINE' | 'OFFLINE' | 'WEAK';
  appVersion?: string;
  /** Local event ids queued offline, replayed for idempotent recovery. */
  pendingLocalEventIds?: string[];
}

export interface PickerHeartbeatResponse {
  serverTime: string;
  status: PickerStatus;
  heartbeatTtlSeconds: number;
  activeTask: PickupTaskSummaryResponse | null;
  outstandingOffers: PickupOfferResponse[];
}

/* ------------------------------------------------------------------------------------------------
 * Task discovery / offer
 * ---------------------------------------------------------------------------------------------- */
export interface PickupTaskSummaryResponse {
  id: string;
  taskCode: string;
  status: PickupTaskStatus;
  priority: PickupTaskPriority;
  supplier: {
    id: string;
    name: string;
    locality: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
  };
  hub: { id: string; code: string; name: string } | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  orderCount: number;
  packageCount: number;
  estimatedDistanceKm: number | null;
  estimatedTravelMinutes: number | null;
  estimatedPickupMinutes: number | null;
  slaRiskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | null;
  assignedPickerId: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  collectedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  runId: string | null;
}

export interface PickupTaskDetailResponse extends PickupTaskSummaryResponse {
  /** Operational-only projection: no supplier financial or retailer private data. */
  orders: Array<{
    id: string;
    orderNumber: string;
    fulfillmentId: string;
    fulfillmentReference: string;
    packageCount: number;
    packageCountCollected: number;
    status: string;
  }>;
  packages: PickupPackageResponse[];
  stops: Array<{
    id: string;
    sequenceNo: number;
    taskId: string;
    status: PickupStopStatus;
    arrivedAt: string | null;
    completedAt: string | null;
  }>;
  exceptions: Array<{
    id: string;
    type: PickupExceptionType;
    status: PickupExceptionStatus;
    reason: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  events: Array<{ eventType: string; occurredAt: string; metadata: Record<string, unknown> | null }>;
  /** Next required action, so the app can always show one obvious primary button. */
  nextAction: PickerNextAction;
  reconciliation: PickupReconciliation;
}

export type PickerNextAction =
  | { action: 'ACCEPT'; label: string; endpoint: string; enabled: boolean }
  | { action: 'REJECT'; label: string; endpoint: string; enabled: boolean }
  | { action: 'NAVIGATE'; label: string; endpoint: string; enabled: boolean }
  | { action: 'CONFIRM_ARRIVAL'; label: string; endpoint: string; enabled: boolean }
  | { action: 'START_COLLECTION'; label: string; endpoint: string; enabled: boolean }
  | { action: 'SCAN_PACKAGES'; label: string; endpoint: string; enabled: boolean }
  | { action: 'COMPLETE_PICKUP'; label: string; endpoint: string; enabled: boolean }
  | { action: 'GO_TO_HUB'; label: string; endpoint: string; enabled: boolean }
  | { action: 'START_HANDOVER'; label: string; endpoint: string; enabled: boolean }
  | { action: 'COMPLETE_HANDOVER'; label: string; endpoint: string; enabled: boolean }
  | { action: 'DONE'; label: string; endpoint: null; enabled: false };

export interface PickupOfferResponse {
  offerId: string;
  task: PickupTaskSummaryResponse;
  offeredAt: string;
  expiresAt: string;
  timeoutSeconds: number;
  /** Round-trip time budget for the mobile offer banner. */
  remainingSeconds: number;
}

export interface PickupPackageResponse {
  id: string;
  packageCode: string;
  orderId: string;
  orderNumber: string;
  fulfillmentId: string;
  fulfillmentReference: string;
  status: PackageStatus;
  expectedHubId: string | null;
  collectedAt: string | null;
  receivedAt: string | null;
  scannedByPicker: boolean;
  reconciled: boolean;
}

export interface PickupReconciliation {
  expectedPackageCount: number;
  scannedPackageCount: number;
  collectedPackageCount: number;
  missingPackageCount: number;
  unexpectedPackageCount: number;
  damagedPackageCount: number;
  isBalanced: boolean;
  missingPackageCodes: string[];
  unexpectedPackageCodes: string[];
}

export interface ScanPackageRequest {
  /** QR / barcode payload as read by the device. */
  scanCode: string;
  /** Client-side id for offline capture replay; guarantees idempotent scans. */
  localEventId?: string;
  scanResultHint?: HubScanResult | null;
  latitude?: number;
  longitude?: number;
}

export interface ScanPackageResponse {
  accepted: boolean;
  result: HubScanResult | 'ACCEPTED';
  package: PickupPackageResponse | null;
  reconciliation: PickupReconciliation;
  message: string;
  /** Duplicate scans in a time window are acknowledged without state change. */
  idempotentReplay: boolean;
}

export interface CompletePickupRequest {
  /** Required when fewer packages were collected than expected. */
  partialReason?: string;
  missingPackageCodes?: string[];
  supplierExplanation?: string;
  evidenceObjectKeys?: string[];
  notes?: string;
}

export interface CompletePickupResponse {
  task: PickupTaskSummaryResponse;
  status: PickupTaskStatus;
  reconciliation: PickupReconciliation;
  followUpTaskId: string | null;
  exceptions: string[];
}

export interface ReportPickupExceptionRequest {
  type: PickupExceptionType;
  reason: string;
  packageCode?: string;
  evidenceObjectKeys?: string[];
  latitude?: number;
  longitude?: number;
}

/* ------------------------------------------------------------------------------------------------
 * Runs
 * ---------------------------------------------------------------------------------------------- */
export interface PickupRunResponse {
  id: string;
  runCode: string;
  status: PickupRunStatus;
  pickerId: string | null;
  hub: { id: string; code: string; name: string } | null;
  plannedStartAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalOrders: number;
  totalPackages: number;
  collectedPackages: number;
  stops: PickupRunStopResponse[];
}

export interface PickupRunStopResponse {
  id: string;
  sequenceNo: number;
  taskId: string;
  taskCode: string;
  supplierName: string;
  locality: string | null;
  orderCount: number;
  packageCount: number;
  status: PickupStopStatus;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  distanceFromPreviousKm: number | null;
  estimatedMinutesFromPrevious: number | null;
  arrivedAt: string | null;
  completedAt: string | null;
}

/* ------------------------------------------------------------------------------------------------
 * Hub handover & receiving
 * ---------------------------------------------------------------------------------------------- */
export interface StartHandoverRequest {
  hubId: string;
  taskId?: string;
  runId?: string;
  latitude?: number;
  longitude?: number;
}

export interface HubHandoverResponse {
  handoverId: string;
  hubReceivingId: string;
  status: HubReceivingStatus;
  expectedPackageCount: number;
  receivedPackageCount: number;
  missingPackageCount: number;
  unexpectedPackageCount: number;
  damagedPackageCount: number;
  discrepancyCount: number;
  isBalanced: boolean;
  packages: Array<{ packageCode: string; status: PackageStatus; scanned: boolean; result: string | null }>;
  startedAt: string;
  completedAt: string | null;
}

export interface HubScanRequest {
  scanCode: string;
  localEventId?: string;
}

export interface HubScanResponse {
  accepted: boolean;
  result: HubScanResult;
  packageCode: string | null;
  handover: HubHandoverResponse;
  message: string;
  idempotentReplay: boolean;
}

export interface CompleteHandoverRequest {
  notes?: string;
  /** Required when a discrepancy remains at handover completion. */
  discrepancyReason?: string;
  /** Explicit acknowledgement of the reconciliation figures shown to the operator. */
  acknowledgedDiscrepancy: boolean;
}

export interface CompleteHandoverResponse {
  handover: HubHandoverResponse;
  taskStatus: PickupTaskStatus | null;
  runStatus: PickupRunStatus | null;
  fulfillmentsAdvanced: number;
  followUpExceptionIds: string[];
}

/* ------------------------------------------------------------------------------------------------
 * Picker history / metrics
 * ---------------------------------------------------------------------------------------------- */
export interface PickerTaskHistoryItem {
  taskId: string;
  taskCode: string;
  status: PickupTaskStatus;
  supplierName: string;
  hubCode: string | null;
  orderCount: number;
  packageCount: number;
  collectedPackageCount: number;
  completedAt: string | null;
  durationMinutes: number | null;
}

export interface PickupOperationsMetricsResponse {
  generatedAt: string;
  windowMinutes: number;
  availableTasks: number;
  unassignedTasks: number;
  offeredTasks: number;
  activePickups: number;
  atSupplier: number;
  atHub: number;
  atRiskWindows: number;
  exceptionsOpen: number;
  partialPickups: number;
  failedPickups: number;
  averageAssignmentLatencyMs: number | null;
  averagePickupDurationMinutes: number | null;
  averageHandoverMinutes: number | null;
  pickersAvailable: number;
  pickersBusy: number;
  pickersStale: number;
  hubQueueSize: number;
  hubDiscrepanciesOpen: number;
}

export interface AdminPickupTaskResponse extends PickupTaskSummaryResponse {
  pickerName: string | null;
  pickerPhone: string | null;
  offerOutcome: OfferOutcome | null;
  offerCount: number;
  lastOfferAt: string | null;
  exceededCapacityOnAssignment: boolean;
}
