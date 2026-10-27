import {
  Prisma,
  type PrismaClient,
  InventoryTransactionType,
  PurchaseOrderStatus,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import type { DashboardInventoryQuery } from "./reporting.schema";
import type {
  InventoryDashboardDto,
  RecentTransactionItem,
  UnitOfMeasureQuantity,
} from "./reporting.types";

/**
 * Service orchestrating inventory overview metrics and executive dashboard aggregations.
 */
export class DashboardService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Computes comprehensive, multi-tenant inventory metrics for an organization.
   */
  public async getInventoryDashboard(
    organizationId: string,
    query: DashboardInventoryQuery,
  ): Promise<InventoryDashboardDto> {
    const { recentLimit } = query;
    const windowEnd = query.endDate ?? new Date();
    const windowStart = query.startDate ?? new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Parallel execution of core counts & grouped aggregates
    const [
      totalActiveProducts,
      totalActiveWarehouses,
      totalActiveStorageLocations,
      positiveStockBalancesCount,
      zeroStockBalancesCount,
      balancesWithUom,
      totalMovementsCount,
      movementsByType,
      movementQuantities,
      purchaseOrdersByStatus,
      recentTransactionsData,
    ] = await Promise.all([
      // Product count
      this.db.product.count({
        where: { organizationId, status: "ACTIVE" },
      }),

      // Warehouse count
      this.db.warehouse.count({
        where: { organizationId, status: "ACTIVE" },
      }),

      // Storage location count
      this.db.storageLocation.count({
        where: { organizationId, status: "ACTIVE" },
      }),

      // Positive stock balances count
      this.db.inventoryBalance.count({
        where: { organizationId, quantityOnHand: { gt: 0 } },
      }),

      // Zero stock balances count
      this.db.inventoryBalance.count({
        where: { organizationId, quantityOnHand: { equals: 0 } },
      }),

      // Balances with Product UOM for non-misleading aggregation
      this.db.inventoryBalance.findMany({
        where: { organizationId, quantityOnHand: { gt: 0 } },
        select: {
          quantityOnHand: true,
          product: {
            select: { unitOfMeasure: true },
          },
        },
      }),

      // Total transactions in requested window
      this.db.inventoryTransaction.count({
        where: {
          organizationId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
      }),

      // Transactions count grouped by type
      this.db.inventoryTransaction.groupBy({
        by: ["type"],
        where: {
          organizationId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        _count: { _all: true },
      }),

      // Movement operation quantities with UOM
      this.db.inventoryTransaction.findMany({
        where: {
          organizationId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
          type: true,
          quantity: true,
          product: {
            select: { unitOfMeasure: true },
          },
        },
      }),

      // Purchase orders grouped by status with sums
      this.db.purchaseOrder.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),

      // Recent activity
      this.db.inventoryTransaction.findMany({
        where: { organizationId },
        take: recentLimit,
        orderBy: { createdAt: "desc" },
        include: {
          product: true,
          warehouse: true,
          sourceLocation: true,
          destinationLocation: true,
          performedByUser: true,
        },
      }),
    ]);

    // 2. Aggregate current units on hand per unit of measure
    const uomBalancesMap = new Map<string, Prisma.Decimal>();
    for (const b of balancesWithUom) {
      const uom = b.product.unitOfMeasure;
      const current = uomBalancesMap.get(uom) ?? new Prisma.Decimal(0);
      uomBalancesMap.set(uom, current.add(b.quantityOnHand));
    }

    const unitsOnHand: UnitOfMeasureQuantity[] = Array.from(uomBalancesMap.entries()).map(
      ([unitOfMeasure, total]) => ({
        unitOfMeasure,
        totalQuantityOnHand: total.toFixed(4),
      }),
    );

    // 3. Movement window summary calculations
    const countsByType: Record<InventoryTransactionType, number> = {
      [InventoryTransactionType.RECEIPT]: 0,
      [InventoryTransactionType.ISSUE]: 0,
      [InventoryTransactionType.ADJUSTMENT]: 0,
      [InventoryTransactionType.TRANSFER]: 0,
    };

    for (const group of movementsByType) {
      countsByType[group.type] = group._count._all;
    }

    const quantitiesMap = new Map<string, Prisma.Decimal>();
    for (const m of movementQuantities) {
      const key = `${m.type}__${m.product.unitOfMeasure}`;
      const current = quantitiesMap.get(key) ?? new Prisma.Decimal(0);
      quantitiesMap.set(key, current.add(m.quantity));
    }

    const quantitiesByTypeAndUom = Array.from(quantitiesMap.entries()).map(([key, qty]) => {
      const parts = key.split("__");
      const type = parts[0] as InventoryTransactionType;
      const unitOfMeasure = parts[1] ?? "PCS";
      return {
        type,
        unitOfMeasure,
        totalQuantity: qty.toFixed(4),
      };
    });

    // 4. Purchase order summary calculations
    const poCountsByStatus: Record<PurchaseOrderStatus, number> = {
      [PurchaseOrderStatus.DRAFT]: 0,
      [PurchaseOrderStatus.PENDING_APPROVAL]: 0,
      [PurchaseOrderStatus.APPROVED]: 0,
      [PurchaseOrderStatus.PARTIALLY_RECEIVED]: 0,
      [PurchaseOrderStatus.RECEIVED]: 0,
      [PurchaseOrderStatus.CANCELLED]: 0,
    };

    let totalCommittedValueDec = new Prisma.Decimal(0);
    let totalDraftValueDec = new Prisma.Decimal(0);
    let totalCancelledValueDec = new Prisma.Decimal(0);
    let totalOrdersCount = 0;

    for (const group of purchaseOrdersByStatus) {
      const count = group._count._all;
      const amount = group._sum.totalAmount ?? new Prisma.Decimal(0);
      poCountsByStatus[group.status] = count;
      totalOrdersCount += count;

      if (
        group.status === PurchaseOrderStatus.APPROVED ||
        group.status === PurchaseOrderStatus.PARTIALLY_RECEIVED ||
        group.status === PurchaseOrderStatus.RECEIVED
      ) {
        totalCommittedValueDec = totalCommittedValueDec.add(amount);
      } else if (
        group.status === PurchaseOrderStatus.DRAFT ||
        group.status === PurchaseOrderStatus.PENDING_APPROVAL
      ) {
        totalDraftValueDec = totalDraftValueDec.add(amount);
      } else if (group.status === PurchaseOrderStatus.CANCELLED) {
        totalCancelledValueDec = totalCancelledValueDec.add(amount);
      }
    }

    // 5. Format recent transactions
    const recentTransactions: RecentTransactionItem[] = recentTransactionsData.map((t) => ({
      id: t.id,
      productId: t.productId,
      productSku: t.product.sku,
      productName: t.product.name,
      unitOfMeasure: t.product.unitOfMeasure,
      type: t.type,
      quantity: new Prisma.Decimal(t.quantity).toFixed(4),
      quantityDelta: new Prisma.Decimal(t.quantityDelta).toFixed(4),
      warehouseId: t.warehouseId,
      warehouseName: t.warehouse ? t.warehouse.name : null,
      sourceLocationId: t.sourceLocationId,
      sourceLocationCode: t.sourceLocation ? t.sourceLocation.code : null,
      destinationLocationId: t.destinationLocationId,
      destinationLocationCode: t.destinationLocation ? t.destinationLocation.code : null,
      reference: t.reference,
      notes: t.notes,
      performedByUserId: t.performedByUserId,
      performedByUserName: t.performedByUser.name,
      createdAt: t.createdAt.toISOString(),
    }));

    return {
      overview: {
        totalActiveProducts,
        totalActiveWarehouses,
        totalActiveStorageLocations,
        positiveStockBalancesCount,
        zeroStockBalancesCount,
        unitsOnHand,
      },
      movementsWindow: {
        startDate: windowStart.toISOString(),
        endDate: windowEnd.toISOString(),
        totalTransactions: totalMovementsCount,
        countsByType,
        quantitiesByTypeAndUom,
      },
      purchaseOrdersSummary: {
        totalOrdersCount,
        countsByStatus: poCountsByStatus,
        totalCommittedValue: totalCommittedValueDec.toFixed(4),
        totalDraftValue: totalDraftValueDec.toFixed(4),
        totalCancelledValue: totalCancelledValueDec.toFixed(4),
        pendingApprovalCount: poCountsByStatus[PurchaseOrderStatus.PENDING_APPROVAL],
      },
      recentTransactions,
    };
  }
}

export const dashboardService = new DashboardService();
