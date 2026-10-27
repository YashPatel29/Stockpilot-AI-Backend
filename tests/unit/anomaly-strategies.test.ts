import { describe, it, expect } from "vitest";
import { AnomalyCategory, AnomalySeverity, InventoryTransactionType, Prisma } from "@prisma/client";
import {
  calculateMedian,
  calculateMad,
} from "../../src/modules/anomalies/strategies/detection-strategy.interface";
import { UnusuallyLargeMovementStrategy } from "../../src/modules/anomalies/strategies/unusually-large-movement.strategy";
import { UnusualAdjustmentStrategy } from "../../src/modules/anomalies/strategies/unusual-adjustment.strategy";
import { RepeatedAdjustmentsStrategy } from "../../src/modules/anomalies/strategies/repeated-adjustments.strategy";
import { UnusualTransferPatternStrategy } from "../../src/modules/anomalies/strategies/unusual-transfer-pattern.strategy";
import type { RichInventoryTransaction } from "../../src/modules/anomalies/anomaly.types";

function createMockTransaction(
  overrides: Partial<RichInventoryTransaction> = {},
): RichInventoryTransaction {
  return {
    id: "txn-" + Math.random().toString(36).substring(2, 9),
    organizationId: "org-1",
    productId: "prod-1",
    warehouseId: "wh-1",
    type: InventoryTransactionType.ISSUE,
    quantity: new Prisma.Decimal(10),
    quantityDelta: new Prisma.Decimal(-10),
    sourceLocationId: "loc-1",
    destinationLocationId: null,
    reason: null,
    reference: null,
    notes: null,
    idempotencyKey: null,
    requestHash: null,
    performedByUserId: "user-1",
    createdAt: new Date(),
    product: { id: "prod-1", name: "Steel Widget", sku: "WGT-001" },
    warehouse: { id: "wh-1", name: "Main Warehouse", code: "WH-MAIN" },
    sourceLocation: { id: "loc-1", name: "Shelf A1", code: "A1" },
    destinationLocation: null,
    performedByUser: { id: "user-1", name: "Warehouse Op", email: "op@example.com" },
    ...overrides,
  };
}

describe("Statistical Helper Functions (Unit)", () => {
  it("should calculate median correctly for odd and even sets", () => {
    expect(calculateMedian([])).toBe(0);
    expect(calculateMedian([5])).toBe(5);
    expect(calculateMedian([1, 3, 2])).toBe(2);
    expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it("should compute Median and MAD accurately", () => {
    // Array: [1, 2, 3, 4, 5, 6, 7, 8, 9] -> median = 5
    // Deviations from 5: [4, 3, 2, 1, 0, 1, 2, 3, 4] -> sorted: [0, 1, 1, 2, 2, 3, 3, 4, 4] -> median deviation = 2
    const { median, mad } = calculateMad([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(median).toBe(5);
    expect(mad).toBe(2);
  });

  it("should handle zero MAD when all baseline entries are identical", () => {
    const { median, mad } = calculateMad([10, 10, 10, 10, 10]);
    expect(median).toBe(10);
    expect(mad).toBe(0);
  });
});

describe("UnusuallyLargeMovementStrategy (Unit)", () => {
  const strategy = new UnusuallyLargeMovementStrategy();

  it("should return empty if historical sample size is too small (< 4)", async () => {
    const historical = [
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
      createMockTransaction({ quantity: new Prisma.Decimal(12) }),
    ];
    const windowTxn = createMockTransaction({ quantity: new Prisma.Decimal(100) });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [windowTxn],
      historicalTransactions: historical,
    });

    expect(results).toHaveLength(0);
  });

  it("should detect statistical outlier transaction using MAD and assign appropriate severity", async () => {
    const historical = [
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
      createMockTransaction({ quantity: new Prisma.Decimal(12) }),
      createMockTransaction({ quantity: new Prisma.Decimal(11) }),
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
      createMockTransaction({ quantity: new Prisma.Decimal(9) }),
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
    ];
    // Baseline: median = 10, MAD = 0.5 ~ 1
    // A movement of 120 is an extreme outlier
    const outlierTxn = createMockTransaction({
      id: "txn-outlier-1",
      quantity: new Prisma.Decimal(120),
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [outlierTxn],
      historicalTransactions: historical,
    });

    expect(results).toHaveLength(1);
    const finding = results[0]!;
    expect(finding.category).toBe(AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT);
    expect(finding.severity).toBe(AnomalySeverity.CRITICAL);
    expect(finding.transactionId).toBe("txn-outlier-1");
    expect(finding.dedupKey).toBe("org-1:large_movement:txn-outlier-1");
    expect(finding.explanation).toContain("deviates significantly from the historical baseline");
  });

  it("should handle zero MAD using ratio fallback", async () => {
    const historical = [
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
      createMockTransaction({ quantity: new Prisma.Decimal(10) }),
    ];
    // Constant batch sizes of 10. Outlier of 50 is 5x baseline.
    const outlierTxn = createMockTransaction({
      id: "txn-zero-mad",
      quantity: new Prisma.Decimal(50),
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [outlierTxn],
      historicalTransactions: historical,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.severity).toBe(AnomalySeverity.HIGH);
  });
});

describe("UnusualAdjustmentStrategy (Unit)", () => {
  const strategy = new UnusualAdjustmentStrategy();

  it("should flag severe negative stock shrinkage", async () => {
    const routineAdj1 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-2),
    });
    const routineAdj2 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(1),
    });
    const routineAdj3 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-1),
    });

    const severeShrinkage = createMockTransaction({
      id: "txn-shrinkage-1",
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-120),
      reason: "Unexplained inventory discrepancy during audit",
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [severeShrinkage],
      historicalTransactions: [routineAdj1, routineAdj2, routineAdj3],
    });

    expect(results).toHaveLength(1);
    const finding = results[0]!;
    expect(finding.category).toBe(AnomalyCategory.UNUSUAL_ADJUSTMENT);
    expect(finding.severity).toBe(AnomalySeverity.CRITICAL);
    expect(finding.evidence["isNegativeShrinkage"]).toBe(true);
    expect(finding.explanation).toContain("shrinkage of -120 units");
  });

  it("should not flag normal small adjustments", async () => {
    const smallAdj = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-1),
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [smallAdj],
      historicalTransactions: [smallAdj],
    });

    expect(results).toHaveLength(0);
  });
});

describe("RepeatedAdjustmentsStrategy (Unit)", () => {
  const strategy = new RepeatedAdjustmentsStrategy();

  it("should detect recurring adjustments on the same product and location", async () => {
    const baseDate = new Date();
    const adj1 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-5),
      destinationLocationId: "loc-1",
      createdAt: new Date(baseDate.getTime() - 2 * 86400000),
    });
    const adj2 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-3),
      destinationLocationId: "loc-1",
      createdAt: new Date(baseDate.getTime() - 1 * 86400000),
    });
    const adj3 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(4),
      destinationLocationId: "loc-1",
      createdAt: baseDate,
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [adj1, adj2, adj3],
      historicalTransactions: [],
    });

    expect(results).toHaveLength(1);
    const finding = results[0]!;
    expect(finding.category).toBe(AnomalyCategory.REPEATED_ADJUSTMENTS);
    expect(finding.evidence["adjustmentCount"]).toBe(3);
    expect(finding.explanation).toContain("had 3 stock adjustments");
  });

  it("should not flag when adjustment frequency is below threshold (< 3)", async () => {
    const adj1 = createMockTransaction({
      type: InventoryTransactionType.ADJUSTMENT,
      quantityDelta: new Prisma.Decimal(-2),
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [adj1],
      historicalTransactions: [],
    });

    expect(results).toHaveLength(0);
  });
});

describe("UnusualTransferPatternStrategy (Unit)", () => {
  const strategy = new UnusualTransferPatternStrategy();

  it("should flag rapid bounce-back transfers between locations (A -> B, then B -> A)", async () => {
    const now = new Date();
    const t1 = createMockTransaction({
      id: "transfer-1",
      type: InventoryTransactionType.TRANSFER,
      quantity: new Prisma.Decimal(50),
      sourceLocationId: "loc-A",
      destinationLocationId: "loc-B",
      createdAt: new Date(now.getTime() - 3600000 * 12), // 12 hours ago
      sourceLocation: { id: "loc-A", name: "Bay A", code: "A" },
      destinationLocation: { id: "loc-B", name: "Bay B", code: "B" },
    });

    const t2 = createMockTransaction({
      id: "transfer-2",
      type: InventoryTransactionType.TRANSFER,
      quantity: new Prisma.Decimal(50),
      sourceLocationId: "loc-B",
      destinationLocationId: "loc-A",
      createdAt: now,
      sourceLocation: { id: "loc-B", name: "Bay B", code: "B" },
      destinationLocation: { id: "loc-A", name: "Bay A", code: "A" },
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [t1, t2],
      historicalTransactions: [],
    });

    expect(results).toHaveLength(1);
    const finding = results[0]!;
    expect(finding.category).toBe(AnomalyCategory.UNUSUAL_TRANSFER_PATTERN);
    expect(finding.severity).toBe(AnomalySeverity.HIGH);
    expect(finding.evidence["transferOutQuantity"]).toBe(50);
    expect(finding.evidence["transferBackQuantity"]).toBe(50);
    expect(finding.explanation).toContain("Rapid rebound transfer detected");
  });

  it("should not flag normal unidirectional transfers", async () => {
    const t1 = createMockTransaction({
      type: InventoryTransactionType.TRANSFER,
      quantity: new Prisma.Decimal(25),
      sourceLocationId: "loc-A",
      destinationLocationId: "loc-B",
    });

    const results = await strategy.detect({
      organizationId: "org-1",
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 86400000),
      windowEnd: new Date(),
      transactionsInWindow: [t1],
      historicalTransactions: [],
    });

    expect(results).toHaveLength(0);
  });
});
