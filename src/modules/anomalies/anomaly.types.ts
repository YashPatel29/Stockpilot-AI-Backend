import type {
  AnomalyCategory,
  AnomalySeverity,
  AnomalyStatus,
  DetectionRunStatus,
  InventoryAnomaly,
  AnomalyDetectionRun,
  Product,
  Warehouse,
  StorageLocation,
  User,
  InventoryTransaction,
} from "@prisma/client";

/**
 * Public DTO representing an inventory anomaly finding.
 */
export interface SafeInventoryAnomalyDto {
  id: string;
  organizationId: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  productId: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
  } | null;
  warehouseId: string | null;
  warehouse?: {
    id: string;
    name: string;
    code: string;
  } | null;
  locationId: string | null;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
  transactionId: string | null;
  transaction?: {
    id: string;
    type: string;
    quantity: string;
    quantityDelta: string;
    createdAt: string;
    performedByUserId?: string;
  } | null;
  strategyName: string;
  strategyVersion: string;
  score: string | null;
  explanation: string;
  evidence: Record<string, unknown>;
  dedupKey: string;
  detectionWindowStart: string;
  detectionWindowEnd: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  acknowledgedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  resolutionNote: string | null;
  dismissedAt: string | null;
  dismissedByUserId: string | null;
  dismissedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  detectionRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public DTO representing an anomaly detection run.
 */
export interface SafeAnomalyDetectionRunDto {
  id: string;
  organizationId: string;
  status: DetectionRunStatus;
  windowDays: number;
  startedAt: string | null;
  completedAt: string | null;
  initiatedByUserId: string | null;
  initiatedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  findingsCount: number;
  summary: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detection run with associated findings.
 */
export interface AnomalyDetectionRunDetailDto extends SafeAnomalyDetectionRunDto {
  findings: SafeInventoryAnomalyDto[];
}

/**
 * Paginated anomalies list response.
 */
export interface PaginatedAnomaliesResult {
  anomalies: SafeInventoryAnomalyDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated detection runs list response.
 */
export interface PaginatedDetectionRunsResult {
  runs: SafeAnomalyDetectionRunDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Candidate finding emitted by a detection strategy before persistence.
 */
export interface RawAnomalyCandidate {
  category: AnomalyCategory;
  severity: AnomalySeverity;
  productId?: string | null;
  warehouseId?: string | null;
  locationId?: string | null;
  transactionId?: string | null;
  strategyName: string;
  strategyVersion: string;
  score: number;
  explanation: string;
  evidence: Record<string, unknown>;
  dedupKey: string;
}

/**
 * Inventory transaction with relations needed by anomaly detection.
 */
export interface RichInventoryTransaction extends InventoryTransaction {
  product?: Pick<Product, "id" | "name" | "sku"> | null;
  warehouse?: Pick<Warehouse, "id" | "name" | "code"> | null;
  sourceLocation?:
    (Pick<StorageLocation, "id" | "name" | "code"> & { warehouseId?: string }) | null;
  destinationLocation?:
    (Pick<StorageLocation, "id" | "name" | "code"> & { warehouseId?: string }) | null;
  performedByUser?: Pick<User, "id" | "name" | "email"> | null;
}

/**
 * Full database anomaly record with joined relations.
 */
export type InventoryAnomalyWithRelations = InventoryAnomaly & {
  product?: Pick<Product, "id" | "name" | "sku"> | null;
  warehouse?: Pick<Warehouse, "id" | "name" | "code"> | null;
  location?: Pick<StorageLocation, "id" | "name" | "code"> | null;
  transaction?: Pick<
    InventoryTransaction,
    "id" | "type" | "quantity" | "quantityDelta" | "createdAt" | "performedByUserId"
  > | null;
  acknowledgedByUser?: Pick<User, "id" | "name" | "email"> | null;
  resolvedByUser?: Pick<User, "id" | "name" | "email"> | null;
  dismissedByUser?: Pick<User, "id" | "name" | "email"> | null;
};

/**
 * Full database detection run with joined relations.
 */
export type AnomalyDetectionRunWithRelations = AnomalyDetectionRun & {
  initiatedByUser?: Pick<User, "id" | "name" | "email"> | null;
  findings?: InventoryAnomalyWithRelations[];
};

/**
 * Maps a Prisma InventoryAnomaly to a safe external DTO.
 */
export function toSafeInventoryAnomaly(
  anomaly: InventoryAnomalyWithRelations,
): SafeInventoryAnomalyDto {
  return {
    id: anomaly.id,
    organizationId: anomaly.organizationId,
    category: anomaly.category,
    severity: anomaly.severity,
    status: anomaly.status,
    productId: anomaly.productId,
    product: anomaly.product
      ? {
          id: anomaly.product.id,
          name: anomaly.product.name,
          sku: anomaly.product.sku,
        }
      : null,
    warehouseId: anomaly.warehouseId,
    warehouse: anomaly.warehouse
      ? {
          id: anomaly.warehouse.id,
          name: anomaly.warehouse.name,
          code: anomaly.warehouse.code,
        }
      : null,
    locationId: anomaly.locationId,
    location: anomaly.location
      ? {
          id: anomaly.location.id,
          name: anomaly.location.name,
          code: anomaly.location.code,
        }
      : null,
    transactionId: anomaly.transactionId,
    transaction: anomaly.transaction
      ? {
          id: anomaly.transaction.id,
          type: anomaly.transaction.type,
          quantity: anomaly.transaction.quantity.toString(),
          quantityDelta: anomaly.transaction.quantityDelta.toString(),
          createdAt: anomaly.transaction.createdAt.toISOString(),
          performedByUserId: anomaly.transaction.performedByUserId,
        }
      : null,
    strategyName: anomaly.strategyName,
    strategyVersion: anomaly.strategyVersion,
    score: anomaly.score !== null ? anomaly.score.toString() : null,
    explanation: anomaly.explanation,
    evidence:
      anomaly.evidence && typeof anomaly.evidence === "object" && !Array.isArray(anomaly.evidence)
        ? (anomaly.evidence as Record<string, unknown>)
        : {},
    dedupKey: anomaly.dedupKey,
    detectionWindowStart: anomaly.detectionWindowStart.toISOString(),
    detectionWindowEnd: anomaly.detectionWindowEnd.toISOString(),
    detectedAt: anomaly.detectedAt.toISOString(),
    acknowledgedAt: anomaly.acknowledgedAt ? anomaly.acknowledgedAt.toISOString() : null,
    acknowledgedByUserId: anomaly.acknowledgedByUserId,
    acknowledgedByUser: anomaly.acknowledgedByUser
      ? {
          id: anomaly.acknowledgedByUser.id,
          name: anomaly.acknowledgedByUser.name,
          email: anomaly.acknowledgedByUser.email,
        }
      : null,
    resolvedAt: anomaly.resolvedAt ? anomaly.resolvedAt.toISOString() : null,
    resolvedByUserId: anomaly.resolvedByUserId,
    resolvedByUser: anomaly.resolvedByUser
      ? {
          id: anomaly.resolvedByUser.id,
          name: anomaly.resolvedByUser.name,
          email: anomaly.resolvedByUser.email,
        }
      : null,
    resolutionNote: anomaly.resolutionNote,
    dismissedAt: anomaly.dismissedAt ? anomaly.dismissedAt.toISOString() : null,
    dismissedByUserId: anomaly.dismissedByUserId,
    dismissedByUser: anomaly.dismissedByUser
      ? {
          id: anomaly.dismissedByUser.id,
          name: anomaly.dismissedByUser.name,
          email: anomaly.dismissedByUser.email,
        }
      : null,
    detectionRunId: anomaly.detectionRunId,
    createdAt: anomaly.createdAt.toISOString(),
    updatedAt: anomaly.updatedAt.toISOString(),
  };
}

/**
 * Maps a Prisma AnomalyDetectionRun to a safe external DTO.
 */
export function toSafeAnomalyDetectionRun(
  run: AnomalyDetectionRunWithRelations,
): SafeAnomalyDetectionRunDto {
  return {
    id: run.id,
    organizationId: run.organizationId,
    status: run.status,
    windowDays: run.windowDays,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    initiatedByUserId: run.initiatedByUserId,
    initiatedByUser: run.initiatedByUser
      ? {
          id: run.initiatedByUser.id,
          name: run.initiatedByUser.name,
          email: run.initiatedByUser.email,
        }
      : null,
    findingsCount: run.findingsCount,
    summary:
      run.summary && typeof run.summary === "object" && !Array.isArray(run.summary)
        ? (run.summary as Record<string, unknown>)
        : null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}
