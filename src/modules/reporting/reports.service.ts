import {
  Prisma,
  type PrismaClient,
  InventoryTransactionType,
  PurchaseOrderStatus,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import type {
  WarehouseInventoryQuery,
  InventoryMovementsQuery,
  ProductInventoryQuery,
  LowStockQuery,
  PurchaseOrderReportQuery,
  RecentActivityQuery,
} from "./reporting.schema";
import type {
  WarehouseInventoryReportDto,
  WarehouseInventorySummaryItem,
  InventoryMovementsReportDto,
  ProductInventoryReportDto,
  ProductInventoryReportItem,
  LowStockReportDto,
  LowStockReportItem,
  PurchaseOrderReportDto,
  PurchaseOrderReportItem,
  RecentActivityReportDto,
  RecentTransactionItem,
} from "./reporting.types";

/**
 * Service managing cross-cutting multi-tenant inventory analytics and business reports.
 */
export class ReportsService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Generates warehouse inventory breakdown grouped by storage facility and unit of measure.
   */
  public async getInventoryByWarehouse(
    organizationId: string,
    query: WarehouseInventoryQuery,
  ): Promise<WarehouseInventoryReportDto> {
    const { warehouseId, categoryId } = query;

    // 1. Fetch targeted warehouses for the organization
    const warehouses = await this.db.warehouse.findMany({
      where: {
        organizationId,
        ...(warehouseId && { id: warehouseId }),
      },
      include: {
        _count: {
          select: {
            locations: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    if (warehouses.length === 0) {
      return { warehouses: [] };
    }

    const warehouseIds = warehouses.map((w) => w.id);

    // 2. Fetch positive stock balances scoped to these warehouses and optional category
    const balances = await this.db.inventoryBalance.findMany({
      where: {
        organizationId,
        warehouseId: { in: warehouseIds },
        quantityOnHand: { gt: 0 },
        ...(categoryId && {
          product: { categoryId },
        }),
      },
      select: {
        warehouseId: true,
        locationId: true,
        productId: true,
        quantityOnHand: true,
        product: {
          select: { unitOfMeasure: true },
        },
      },
    });

    // 3. Aggregate metrics per warehouse
    const balancesByWarehouse = new Map<string, typeof balances>();
    for (const b of balances) {
      const list = balancesByWarehouse.get(b.warehouseId) ?? [];
      list.push(b);
      balancesByWarehouse.set(b.warehouseId, list);
    }

    const reportItems: WarehouseInventorySummaryItem[] = warehouses.map((w) => {
      const whBalances = balancesByWarehouse.get(w.id) ?? [];
      const distinctLocations = new Set(whBalances.map((b) => b.locationId));
      const distinctProducts = new Set(whBalances.map((b) => b.productId));

      const uomTotals = new Map<string, Prisma.Decimal>();
      for (const b of whBalances) {
        const uom = b.product.unitOfMeasure;
        const current = uomTotals.get(uom) ?? new Prisma.Decimal(0);
        uomTotals.set(uom, current.add(b.quantityOnHand));
      }

      const stockByUom = Array.from(uomTotals.entries()).map(([unitOfMeasure, qty]) => ({
        unitOfMeasure,
        totalQuantityOnHand: qty.toFixed(4),
      }));

      return {
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        status: w.status,
        locationCount: w._count.locations,
        positiveStockLocationsCount: distinctLocations.size,
        distinctProductsCount: distinctProducts.size,
        stockByUom,
      };
    });

    return { warehouses: reportItems };
  }

  /**
   * Generates inventory movement transactions report with type aggregations and pagination.
   */
  public async getInventoryMovements(
    organizationId: string,
    query: InventoryMovementsQuery,
  ): Promise<InventoryMovementsReportDto> {
    const {
      page,
      limit,
      startDate,
      endDate,
      type,
      productId,
      warehouseId,
      locationId,
      sortBy,
      sortOrder,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.InventoryTransactionWhereInput = {
      organizationId,
      ...(type && { type }),
      ...(productId && { productId }),
      ...(warehouseId && { warehouseId }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }),
      ...(locationId && {
        OR: [{ sourceLocationId: locationId }, { destinationLocationId: locationId }],
      }),
    };

    // Parallel execution of total count, grouped counts, grouped quantities, and paginated rows
    const [totalItems, countsGroup, quantityRows, transactions] = await Promise.all([
      this.db.inventoryTransaction.count({ where }),

      this.db.inventoryTransaction.groupBy({
        by: ["type"],
        where,
        _count: { _all: true },
      }),

      this.db.inventoryTransaction.findMany({
        where,
        select: {
          type: true,
          quantity: true,
          product: {
            select: { unitOfMeasure: true },
          },
        },
      }),

      this.db.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          product: true,
          warehouse: true,
          sourceLocation: true,
          destinationLocation: true,
          performedByUser: true,
        },
      }),
    ]);

    const countsByType: Record<InventoryTransactionType, number> = {
      [InventoryTransactionType.RECEIPT]: 0,
      [InventoryTransactionType.ISSUE]: 0,
      [InventoryTransactionType.ADJUSTMENT]: 0,
      [InventoryTransactionType.TRANSFER]: 0,
    };

    for (const group of countsGroup) {
      countsByType[group.type] = group._count._all;
    }

    const uomQuantitiesMap = new Map<string, Prisma.Decimal>();
    for (const r of quantityRows) {
      const key = `${r.type}__${r.product.unitOfMeasure}`;
      const current = uomQuantitiesMap.get(key) ?? new Prisma.Decimal(0);
      uomQuantitiesMap.set(key, current.add(r.quantity));
    }

    const quantitiesByTypeAndUom = Array.from(uomQuantitiesMap.entries()).map(([key, qty]) => {
      const [transType, uom] = key.split("__");
      return {
        type: transType as InventoryTransactionType,
        unitOfMeasure: uom ?? "PCS",
        totalQuantity: qty.toFixed(4),
      };
    });

    const items: RecentTransactionItem[] = transactions.map((t) => ({
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

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      summary: {
        totalTransactions: totalItems,
        countsByType,
        quantitiesByTypeAndUom,
      },
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Generates product inventory report with non-duplicated product rows and detailed location breakdown.
   */
  public async getProductInventory(
    organizationId: string,
    query: ProductInventoryQuery,
  ): Promise<ProductInventoryReportDto> {
    const {
      page,
      limit,
      productId,
      search,
      categoryId,
      warehouseId,
      locationId,
      sortBy,
      sortOrder,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      status: "ACTIVE",
      ...(productId && { id: productId }),
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { sku: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...((warehouseId || locationId) && {
        inventoryBalances: {
          some: {
            ...(warehouseId && { warehouseId }),
            ...(locationId && { locationId }),
            quantityOnHand: { gt: 0 },
          },
        },
      }),
    };

    const [totalItems, products] = await Promise.all([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          category: { select: { name: true } },
          inventoryBalances: {
            where: {
              quantityOnHand: { gt: 0 },
              ...(warehouseId && { warehouseId }),
              ...(locationId && { locationId }),
            },
            include: {
              warehouse: true,
              location: true,
            },
          },
        },
      }),
    ]);

    const items: ProductInventoryReportItem[] = products.map((p) => {
      let totalDec = new Prisma.Decimal(0);
      const locations = p.inventoryBalances.map((b) => {
        totalDec = totalDec.add(b.quantityOnHand);
        return {
          warehouseId: b.warehouseId,
          warehouseCode: b.warehouse.code,
          warehouseName: b.warehouse.name,
          locationId: b.locationId,
          locationCode: b.location.code,
          locationName: b.location.name,
          quantityOnHand: new Prisma.Decimal(b.quantityOnHand).toFixed(4),
        };
      });

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.category ? p.category.name : null,
        unitOfMeasure: p.unitOfMeasure,
        costPrice: new Prisma.Decimal(p.costPrice).toFixed(4),
        sellingPrice: new Prisma.Decimal(p.sellingPrice).toFixed(4),
        status: p.status,
        totalQuantityOnHand: totalDec.toFixed(4),
        locationCount: locations.length,
        locations,
      };
    });

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Generates low stock replenishment report based on configured Product.lowStockThreshold.
   */
  public async getLowStockReport(
    organizationId: string,
    query: LowStockQuery,
  ): Promise<LowStockReportDto> {
    const { page, limit, categoryId, thresholdOverride, includeZeroThreshold, sortBy, sortOrder } =
      query;

    // 1. Fetch active products matching category
    const products = await this.db.product.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        ...(categoryId && { categoryId }),
        ...(!includeZeroThreshold &&
          thresholdOverride === undefined && {
            lowStockThreshold: { gt: 0 },
          }),
      },
      include: {
        category: { select: { name: true } },
        inventoryBalances: {
          select: {
            quantityOnHand: true,
          },
        },
      },
    });

    // 2. Calculate organization-wide stock total per product and filter by threshold
    const lowStockItems: LowStockReportItem[] = [];

    for (const p of products) {
      const threshold = thresholdOverride !== undefined ? thresholdOverride : p.lowStockThreshold;

      // If threshold is 0 and includeZeroThreshold is false, skip
      if (threshold === 0 && !includeZeroThreshold && thresholdOverride === undefined) {
        continue;
      }

      let totalOnHand = new Prisma.Decimal(0);
      for (const b of p.inventoryBalances) {
        totalOnHand = totalOnHand.add(b.quantityOnHand);
      }

      const thresholdDec = new Prisma.Decimal(threshold);
      if (totalOnHand.lte(thresholdDec)) {
        const deficitDec = thresholdDec.sub(totalOnHand);
        const safeDeficit = deficitDec.isNegative() ? new Prisma.Decimal(0) : deficitDec;

        lowStockItems.push({
          productId: p.id,
          sku: p.sku,
          name: p.name,
          categoryName: p.category ? p.category.name : null,
          unitOfMeasure: p.unitOfMeasure,
          lowStockThreshold: threshold,
          totalQuantityOnHand: totalOnHand.toFixed(4),
          deficit: safeDeficit.toFixed(4),
          status: p.status,
          locationsCount: p.inventoryBalances.length,
        });
      }
    }

    // 3. Sort items
    lowStockItems.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "deficit") {
        comparison = parseFloat(a.deficit) - parseFloat(b.deficit);
      } else if (sortBy === "totalQuantityOnHand") {
        comparison = parseFloat(a.totalQuantityOnHand) - parseFloat(b.totalQuantityOnHand);
      } else if (sortBy === "lowStockThreshold") {
        comparison = a.lowStockThreshold - b.lowStockThreshold;
      } else if (sortBy === "sku") {
        comparison = a.sku.localeCompare(b.sku);
      } else {
        comparison = a.name.localeCompare(b.name);
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // 4. Paginate
    const totalItems = lowStockItems.length;
    const skip = (page - 1) * limit;
    const paginatedItems = lowStockItems.slice(skip, skip + limit);
    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      summary: {
        lowStockProductsCount: totalItems,
      },
      items: paginatedItems,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Generates purchase order procurement analytics and outstanding fulfillment commitments.
   */
  public async getPurchaseOrderReport(
    organizationId: string,
    query: PurchaseOrderReportQuery,
  ): Promise<PurchaseOrderReportDto> {
    const { page, limit, startDate, endDate, supplierId, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      ...(status && { status }),
      ...(supplierId && { supplierId }),
      ...((startDate || endDate) && {
        orderDate: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }),
    };

    // Parallel execution of total count, status groups, all order items summary, and paginated orders
    const [totalItems, statusGroups, allOrderLines, orders] = await Promise.all([
      this.db.purchaseOrder.count({ where }),

      this.db.purchaseOrder.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),

      this.db.purchaseOrderItem.findMany({
        where: {
          purchaseOrder: where,
        },
        select: {
          quantityOrdered: true,
          quantityReceived: true,
        },
      }),

      this.db.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          supplier: true,
          createdByUser: true,
          approvedByUser: true,
          items: true,
        },
      }),
    ]);

    // Summary calculations
    const countsByStatus: Record<PurchaseOrderStatus, number> = {
      [PurchaseOrderStatus.DRAFT]: 0,
      [PurchaseOrderStatus.PENDING_APPROVAL]: 0,
      [PurchaseOrderStatus.APPROVED]: 0,
      [PurchaseOrderStatus.PARTIALLY_RECEIVED]: 0,
      [PurchaseOrderStatus.RECEIVED]: 0,
      [PurchaseOrderStatus.CANCELLED]: 0,
    };

    let totalCommittedDec = new Prisma.Decimal(0);
    let totalDraftDec = new Prisma.Decimal(0);
    let totalCancelledDec = new Prisma.Decimal(0);

    for (const group of statusGroups) {
      const count = group._count._all;
      const amount = group._sum.totalAmount ?? new Prisma.Decimal(0);
      countsByStatus[group.status] = count;

      if (
        group.status === PurchaseOrderStatus.APPROVED ||
        group.status === PurchaseOrderStatus.PARTIALLY_RECEIVED ||
        group.status === PurchaseOrderStatus.RECEIVED
      ) {
        totalCommittedDec = totalCommittedDec.add(amount);
      } else if (
        group.status === PurchaseOrderStatus.DRAFT ||
        group.status === PurchaseOrderStatus.PENDING_APPROVAL
      ) {
        totalDraftDec = totalDraftDec.add(amount);
      } else if (group.status === PurchaseOrderStatus.CANCELLED) {
        totalCancelledDec = totalCancelledDec.add(amount);
      }
    }

    let totalOrderedQtyDec = new Prisma.Decimal(0);
    let totalReceivedQtyDec = new Prisma.Decimal(0);
    let outstandingLinesCount = 0;

    for (const line of allOrderLines) {
      totalOrderedQtyDec = totalOrderedQtyDec.add(line.quantityOrdered);
      totalReceivedQtyDec = totalReceivedQtyDec.add(line.quantityReceived);
      if (new Prisma.Decimal(line.quantityOrdered).gt(line.quantityReceived)) {
        outstandingLinesCount++;
      }
    }

    const totalOutstandingQtyDec = totalOrderedQtyDec.sub(totalReceivedQtyDec);
    const safeOutstandingQty = totalOutstandingQtyDec.isNegative()
      ? new Prisma.Decimal(0)
      : totalOutstandingQtyDec;

    const items: PurchaseOrderReportItem[] = orders.map((po) => {
      let orderOrderedDec = new Prisma.Decimal(0);
      let orderReceivedDec = new Prisma.Decimal(0);

      for (const item of po.items) {
        orderOrderedDec = orderOrderedDec.add(item.quantityOrdered);
        orderReceivedDec = orderReceivedDec.add(item.quantityReceived);
      }

      const orderOutstandingDec = orderOrderedDec.sub(orderReceivedDec);
      const safeOrderOutstanding = orderOutstandingDec.isNegative()
        ? new Prisma.Decimal(0)
        : orderOutstandingDec;

      return {
        id: po.id,
        orderNumber: po.orderNumber,
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        status: po.status,
        orderDate: po.orderDate.toISOString(),
        expectedDeliveryDate: po.expectedDeliveryDate
          ? po.expectedDeliveryDate.toISOString()
          : null,
        currency: po.currency,
        subtotal: new Prisma.Decimal(po.subtotal).toFixed(4),
        taxAmount: new Prisma.Decimal(po.taxAmount).toFixed(4),
        totalAmount: new Prisma.Decimal(po.totalAmount).toFixed(4),
        createdByUserEmail: po.createdByUser.email,
        approvedByUserEmail: po.approvedByUser ? po.approvedByUser.email : null,
        approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
        cancelledAt: po.cancelledAt ? po.cancelledAt.toISOString() : null,
        lineItemsCount: po.items.length,
        totalOrderedQuantity: orderOrderedDec.toFixed(4),
        totalReceivedQuantity: orderReceivedDec.toFixed(4),
        totalOutstandingQuantity: safeOrderOutstanding.toFixed(4),
      };
    });

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      summary: {
        totalOrdersCount: totalItems,
        countsByStatus,
        totalCommittedValue: totalCommittedDec.toFixed(4),
        totalDraftValue: totalDraftDec.toFixed(4),
        totalCancelledValue: totalCancelledDec.toFixed(4),
        pendingApprovalCount: countsByStatus[PurchaseOrderStatus.PENDING_APPROVAL],
        receivedOrdersCount: countsByStatus[PurchaseOrderStatus.RECEIVED],
        partiallyReceivedOrdersCount: countsByStatus[PurchaseOrderStatus.PARTIALLY_RECEIVED],
        outstandingLinesCount,
        totalQuantityOrdered: totalOrderedQtyDec.toFixed(4),
        totalQuantityReceived: totalReceivedQtyDec.toFixed(4),
        totalQuantityOutstanding: safeOutstandingQty.toFixed(4),
      },
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves recent inventory ledger activity with stable sorting and user metadata.
   */
  public async getRecentActivity(
    organizationId: string,
    query: RecentActivityQuery,
  ): Promise<RecentActivityReportDto> {
    const { limit } = query;

    const transactions = await this.db.inventoryTransaction.findMany({
      where: { organizationId },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
        warehouse: true,
        sourceLocation: true,
        destinationLocation: true,
        performedByUser: true,
      },
    });

    const items: RecentTransactionItem[] = transactions.map((t) => ({
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
      items,
      limit,
    };
  }
}

export const reportsService = new ReportsService();
