import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AnomalyCategory,
  AnomalySeverity,
  AnomalyStatus,
  DetectionRunStatus,
  type PrismaClient,
  Prisma,
} from "@prisma/client";
import { AnomalyService } from "../../src/modules/anomalies/anomaly.service";
import type { AnomalyDataAccess } from "../../src/modules/anomalies/anomaly.data-access";
import type { AuditService } from "../../src/modules/audit/audit.service";
import type { NotificationService } from "../../src/modules/notifications/notification.service";
import type { IDetectionStrategy } from "../../src/modules/anomalies/strategies/detection-strategy.interface";
import type {
  RawAnomalyCandidate,
  InventoryAnomalyWithRelations,
  AnomalyDetectionRunWithRelations,
} from "../../src/modules/anomalies/anomaly.types";
import { NotFoundError } from "../../src/common/errors/http-errors";

describe("AnomalyService (Unit)", () => {
  let mockDb: {
    organization: { findUnique: ReturnType<typeof vi.fn> };
    product: { findFirst: ReturnType<typeof vi.fn> };
    warehouse: { findFirst: ReturnType<typeof vi.fn> };
  };
  let mockDataAccess: {
    createDetectionRun: ReturnType<typeof vi.fn>;
    findTransactions: ReturnType<typeof vi.fn>;
    saveAnomalies: ReturnType<typeof vi.fn>;
    updateDetectionRun: ReturnType<typeof vi.fn>;
    findDetectionRunById: ReturnType<typeof vi.fn>;
    findAnomalies: ReturnType<typeof vi.fn>;
    findAnomalyById: ReturnType<typeof vi.fn>;
    updateAnomaly: ReturnType<typeof vi.fn>;
    findDetectionRuns: ReturnType<typeof vi.fn>;
  };
  let mockAudit: {
    recordAudit: ReturnType<typeof vi.fn>;
  };
  let mockNotifications: {
    notifyOrganizationAdmins: ReturnType<typeof vi.fn>;
  };
  let mockStrategy: {
    name: string;
    version: string;
    category: AnomalyCategory;
    detect: ReturnType<typeof vi.fn>;
  };
  let service: AnomalyService;

  beforeEach(() => {
    mockDb = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: "org-1", name: "Test Org" }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({ id: "prod-1", name: "Test Prod" }),
      },
      warehouse: {
        findFirst: vi.fn().mockResolvedValue({ id: "wh-1", name: "Test WH" }),
      },
    };

    mockDataAccess = {
      createDetectionRun: vi.fn().mockResolvedValue({
        id: "run-1",
        organizationId: "org-1",
        status: DetectionRunStatus.RUNNING,
        windowDays: 30,
        findingsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findTransactions: vi.fn().mockResolvedValue([]),
      saveAnomalies: vi.fn().mockResolvedValue({ count: 1 }),
      updateDetectionRun: vi.fn().mockResolvedValue({
        id: "run-1",
        organizationId: "org-1",
        status: DetectionRunStatus.COMPLETED,
        findingsCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findDetectionRunById: vi.fn().mockResolvedValue({
        id: "run-1",
        organizationId: "org-1",
        status: DetectionRunStatus.COMPLETED,
        windowDays: 30,
        startedAt: new Date(),
        completedAt: new Date(),
        initiatedByUserId: "user-1",
        findingsCount: 1,
        summary: {},
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        initiatedByUser: { id: "user-1", name: "Admin", email: "admin@example.com" },
        findings: [],
      } as AnomalyDetectionRunWithRelations),
      findAnomalies: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
      findAnomalyById: vi.fn().mockResolvedValue(null),
      updateAnomaly: vi.fn(),
      findDetectionRuns: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
    };

    mockAudit = {
      recordAudit: vi.fn().mockResolvedValue(null),
    };

    mockNotifications = {
      notifyOrganizationAdmins: vi.fn().mockResolvedValue(undefined),
    };

    mockStrategy = {
      name: "TEST_STRATEGY",
      version: "1.0.0",
      category: AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT,
      detect: vi.fn().mockResolvedValue([]),
    };

    service = new AnomalyService(
      mockDb as unknown as PrismaClient,
      mockDataAccess as unknown as AnomalyDataAccess,
      [mockStrategy as IDetectionStrategy],
      mockAudit as unknown as AuditService,
      mockNotifications as unknown as NotificationService,
    );
  });

  describe("triggerDetectionRun", () => {
    it("should throw NotFoundError if organization does not exist", async () => {
      mockDb.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerDetectionRun({
          organizationId: "non-existent",
          userId: "user-1",
          input: { windowDays: 30 },
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should execute strategies, persist findings, and record audit log", async () => {
      const candidate: RawAnomalyCandidate = {
        category: AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT,
        severity: AnomalySeverity.HIGH,
        productId: "prod-1",
        warehouseId: "wh-1",
        locationId: "loc-1",
        transactionId: "txn-1",
        strategyName: "TEST_STRATEGY",
        strategyVersion: "1.0.0",
        score: 4.5,
        explanation: "Test explanation",
        evidence: { test: true },
        dedupKey: "org-1:large_movement:txn-1",
      };
      mockStrategy.detect.mockResolvedValue([candidate]);

      const result = await service.triggerDetectionRun({
        organizationId: "org-1",
        userId: "user-1",
        input: { windowDays: 30 },
      });

      expect(result.id).toBe("run-1");
      expect(mockDataAccess.saveAnomalies).toHaveBeenCalledTimes(1);
      expect(mockAudit.recordAudit).toHaveBeenCalledTimes(1);
      expect(mockNotifications.notifyOrganizationAdmins).toHaveBeenCalledTimes(1);
    });

    it("should filter candidates by minSeverity when specified", async () => {
      const lowCandidate: RawAnomalyCandidate = {
        category: AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT,
        severity: AnomalySeverity.LOW,
        strategyName: "TEST",
        strategyVersion: "1.0.0",
        score: 1.5,
        explanation: "Low",
        evidence: {},
        dedupKey: "dedup-low",
      };
      const highCandidate: RawAnomalyCandidate = {
        category: AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT,
        severity: AnomalySeverity.HIGH,
        strategyName: "TEST",
        strategyVersion: "1.0.0",
        score: 5.5,
        explanation: "High",
        evidence: {},
        dedupKey: "dedup-high",
      };
      mockStrategy.detect.mockResolvedValue([lowCandidate, highCandidate]);

      await service.triggerDetectionRun({
        organizationId: "org-1",
        userId: "user-1",
        input: { windowDays: 30, minSeverity: AnomalySeverity.HIGH },
      });

      expect(mockDataAccess.saveAnomalies).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            severity: AnomalySeverity.HIGH,
            dedupKey: "dedup-high",
          }),
        ]),
      );
      // Low candidate should have been filtered out
      const call = mockDataAccess.saveAnomalies.mock.calls[0];
      const savedArg = call ? (call[0] as Array<{ dedupKey: string }>) : [];
      expect(savedArg).toHaveLength(1);
      expect(savedArg[0]?.dedupKey).toBe("dedup-high");
    });
  });

  describe("updateAnomalyStatus", () => {
    it("should throw NotFoundError if anomaly does not exist", async () => {
      mockDataAccess.findAnomalyById.mockResolvedValue(null);

      await expect(
        service.updateAnomalyStatus({
          organizationId: "org-1",
          anomalyId: "non-existent",
          userId: "user-1",
          input: { status: AnomalyStatus.ACKNOWLEDGED },
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should update status to RESOLVED with notes and record audit", async () => {
      const existingAnomaly: InventoryAnomalyWithRelations = {
        id: "anom-1",
        organizationId: "org-1",
        category: AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT,
        severity: AnomalySeverity.HIGH,
        status: AnomalyStatus.OPEN,
        productId: "prod-1",
        warehouseId: "wh-1",
        locationId: "loc-1",
        transactionId: "txn-1",
        strategyName: "TEST",
        strategyVersion: "1.0",
        score: new Prisma.Decimal(5.0),
        explanation: "Test",
        evidence: {},
        dedupKey: "dedup-1",
        detectionWindowStart: new Date(),
        detectionWindowEnd: new Date(),
        detectedAt: new Date(),
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionNote: null,
        dismissedAt: null,
        dismissedByUserId: null,
        detectionRunId: "run-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDataAccess.findAnomalyById.mockResolvedValue(existingAnomaly);

      const resolvedAnomaly: InventoryAnomalyWithRelations = {
        ...existingAnomaly,
        status: AnomalyStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedByUserId: "user-1",
        resolutionNote: "Count verified and corrected.",
      };
      mockDataAccess.updateAnomaly.mockResolvedValue(resolvedAnomaly);

      const result = await service.updateAnomalyStatus({
        organizationId: "org-1",
        anomalyId: "anom-1",
        userId: "user-1",
        input: {
          status: AnomalyStatus.RESOLVED,
          resolutionNote: "Count verified and corrected.",
        },
      });

      expect(result.status).toBe(AnomalyStatus.RESOLVED);
      expect(result.resolutionNote).toBe("Count verified and corrected.");
      expect(mockAudit.recordAudit).toHaveBeenCalledTimes(1);
    });
  });
});
