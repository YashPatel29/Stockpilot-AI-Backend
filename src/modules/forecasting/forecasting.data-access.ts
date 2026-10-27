import { Prisma, PrismaClient, InventoryTransactionType, ProductStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.client";
import type { DailyConsumptionObservation, ProductHistoricalSeries } from "./forecasting.types";

/**
 * Data access layer responsible for extracting observed historical consumption
 * from the inventory ledger and structuring contiguous calendar daily series.
 */
export class ForecastingDataAccess {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Generates a contiguous array of YYYY-MM-DD dates in UTC between start and end.
   */
  public generateDateRange(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    const current = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
    );
    const end = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
    );

    while (current <= end) {
      const year = current.getUTCFullYear();
      const month = String(current.getUTCMonth() + 1).padStart(2, "0");
      const day = String(current.getUTCDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  /**
   * Retrieves historical consumption for specified products or all active products in an organization.
   * Labeled accurately as "observed consumption" from inventory ledger ISSUE records.
   */
  public async getHistoricalConsumption(params: {
    organizationId: string;
    productIds?: string[];
    lookbackDays: number;
    asOfDate?: Date;
  }): Promise<ProductHistoricalSeries[]> {
    const { organizationId, productIds, lookbackDays } = params;
    const asOf = params.asOfDate ? new Date(params.asOfDate) : new Date();

    // Lookback start date: lookbackDays in the past
    const lookbackStart = new Date(asOf);
    lookbackStart.setUTCDate(asOf.getUTCDate() - lookbackDays + 1);
    lookbackStart.setUTCHours(0, 0, 0, 0);

    // 1. Fetch relevant products scoped to organization
    const whereProduct: Prisma.ProductWhereInput = {
      organizationId,
      status: ProductStatus.ACTIVE,
      ...(productIds && productIds.length > 0 ? { id: { in: productIds } } : {}),
    };

    const products = await this.db.product.findMany({
      where: whereProduct,
      select: {
        id: true,
        name: true,
        sku: true,
        unitOfMeasure: true,
      },
      orderBy: { name: "asc" },
    });

    if (products.length === 0) {
      return [];
    }

    const targetProductIds = products.map((p) => p.id);

    // 2. Fetch raw ledger ISSUE transactions within the window
    const rawTransactions = await this.db.inventoryTransaction.findMany({
      where: {
        organizationId,
        productId: { in: targetProductIds },
        type: InventoryTransactionType.ISSUE,
        createdAt: {
          gte: lookbackStart,
          lte: asOf,
        },
      },
      select: {
        productId: true,
        quantity: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 3. Generate complete contiguous calendar days
    const dateRange = this.generateDateRange(lookbackStart, asOf);

    // 4. Map transactions by product and date
    // productMap: productId -> Map<YYYY-MM-DD, { quantity: number, count: number }>
    const productAggregation = new Map<string, Map<string, { quantity: number; count: number }>>();

    for (const prod of products) {
      productAggregation.set(prod.id, new Map());
    }

    for (const tx of rawTransactions) {
      const pMap = productAggregation.get(tx.productId);
      if (!pMap) continue;

      const txDate = tx.createdAt;
      const year = txDate.getUTCFullYear();
      const month = String(txDate.getUTCMonth() + 1).padStart(2, "0");
      const day = String(txDate.getUTCDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      const existing = pMap.get(dateKey) ?? { quantity: 0, count: 0 };
      existing.quantity += Number(tx.quantity);
      existing.count += 1;
      pMap.set(dateKey, existing);
    }

    // 5. Build contiguous series with zero-filling for inactive days
    const result: ProductHistoricalSeries[] = [];

    for (const prod of products) {
      const pMap = productAggregation.get(prod.id) ?? new Map();
      const observations: DailyConsumptionObservation[] = dateRange.map((dateKey) => {
        const item = pMap.get(dateKey);
        return {
          date: dateKey,
          quantity: item ? Math.round(item.quantity * 10000) / 10000 : 0,
          transactionCount: item ? item.count : 0,
        };
      });

      result.push({
        productId: prod.id,
        productName: prod.name,
        productSku: prod.sku,
        unitOfMeasure: prod.unitOfMeasure,
        observations,
      });
    }

    return result;
  }
}

export const forecastingDataAccess = new ForecastingDataAccess();
