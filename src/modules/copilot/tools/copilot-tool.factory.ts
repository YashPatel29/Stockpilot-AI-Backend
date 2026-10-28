import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { ProductService } from "../../products/products/product.service";
import { InventoryService } from "../../inventory/inventory.service";
import { ReportsService } from "../../reporting/reports.service";
import { DashboardService } from "../../reporting/dashboard.service";
import { PurchaseOrderService } from "../../procurement/purchase-orders/purchase-order.service";
import { ForecastingService } from "../../forecasting/forecasting.service";
import { AnomalyService } from "../../anomalies/anomaly.service";
import type { CopilotSourceDto } from "../copilot.types";

// Explicit boundary avoids loading LangChain core recursive generic type overloads into compiler
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tool } = require("@langchain/core/tools") as {
  tool: <T>(
    fn: (input: T) => Promise<string>,
    fields: { name: string; description: string; schema: unknown },
  ) => StructuredToolInterface;
};

export interface CopilotToolDependencies {
  db?: PrismaClient;
  productService?: ProductService;
  inventoryService?: InventoryService;
  reportsService?: ReportsService;
  dashboardService?: DashboardService;
  purchaseOrderService?: PurchaseOrderService;
  forecastingService?: ForecastingService;
  anomalyService?: AnomalyService;
}

export interface CopilotToolContext {
  organizationId: string;
  citations: CopilotSourceDto[];
}

/**
 * Factory creating allowlisted, strictly READ-ONLY LangChain tools bound to an organization context.
 * Guaranteed zero mutation tools. Enforces multi-tenant data boundaries at the closure level.
 */
export class CopilotToolFactory {
  public static createTools(
    context: CopilotToolContext,
    deps: CopilotToolDependencies = {},
  ): StructuredToolInterface[] {
    const db = deps.db ?? prisma;
    const productService = deps.productService ?? new ProductService(db);
    const inventoryService = deps.inventoryService ?? new InventoryService(db);
    const reportsService = deps.reportsService ?? new ReportsService(db);
    const dashboardService = deps.dashboardService ?? new DashboardService(db);
    const purchaseOrderService = deps.purchaseOrderService ?? new PurchaseOrderService(db);
    const forecastingService = deps.forecastingService ?? new ForecastingService(db);
    const anomalyService = deps.anomalyService ?? new AnomalyService(db);

    const { organizationId, citations } = context;

    const addCitation = (source: CopilotSourceDto): void => {
      const key = `${source.type}:${source.id ?? source.summary}`;
      const exists = citations.some((c) => `${c.type}:${c.id ?? c.summary}` === key);
      if (!exists) {
        citations.push(source);
      }
    };

    // 1. searchProducts
    const searchProductsTool: StructuredToolInterface = tool(
      async (input: { query?: string; categoryId?: string; limit?: number }) => {
        try {
          let res = await productService.listProducts(organizationId, {
            search: input.query,
            categoryId: input.categoryId,
            limit: input.limit ?? 10,
            page: 1,
            status: "ALL",
            sortBy: "name",
            sortOrder: "asc",
          });

          // Fallback: If no exact substring match was found and a query was provided,
          // fetch catalog items so the LLM can identify product matches
          if (res.items.length === 0 && input.query) {
            const fallbackRes = await productService.listProducts(organizationId, {
              categoryId: input.categoryId,
              limit: input.limit ?? 10,
              page: 1,
              status: "ALL",
              sortBy: "name",
              sortOrder: "asc",
            });
            if (fallbackRes.items.length > 0) {
              res = fallbackRes;
            }
          }

          for (const item of res.items) {
            addCitation({
              type: "product",
              id: item.id,
              name: item.name,
              summary: `Product: ${item.name} (${item.sku}) - Price: $${item.sellingPrice}, Status: ${item.status}`,
              metadata: { sku: item.sku, category: item.category?.name },
            });
          }

          return JSON.stringify({
            total: res.pagination.totalItems,
            products: res.items.map((p) => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              costPrice: p.costPrice,
              sellingPrice: p.sellingPrice,
              status: p.status,
              category: p.category?.name,
              lowStockThreshold: p.lowStockThreshold,
            })),
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "search_products",
        description:
          "Search product catalog by SKU, name, or category ID within the current organization. Returns matching products with pricing and status.",
        schema: z.object({
          query: z.string().optional().describe("Search keyword matching product name or SKU"),
          categoryId: z.string().optional().describe("Optional product category ID filter"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(10)
            .describe("Maximum number of products to return"),
        }),
      },
    );

    // 2. getStockBalances
    const getStockBalancesTool: StructuredToolInterface = tool(
      async (input: { productId?: string; warehouseId?: string; limit?: number }) => {
        try {
          const res = await inventoryService.listBalances(organizationId, {
            productId: input.productId,
            warehouseId: input.warehouseId,
            limit: input.limit ?? 10,
            page: 1,
          });

          for (const b of res.items) {
            const prodName = b.product?.name ?? "Unknown Product";
            const prodSku = b.product?.sku ?? "N/A";
            const prodUom = b.product?.unitOfMeasure ?? "units";
            const whName = b.warehouse?.name ?? "Unknown Warehouse";

            addCitation({
              type: "inventory_balance",
              id: b.id,
              name: prodName,
              summary: `Stock Balance: ${prodName} (${prodSku}) - On Hand: ${b.quantityOnHand} ${prodUom} at Warehouse: ${whName}`,
              metadata: { warehouse: whName, location: b.location?.name },
            });
          }

          return JSON.stringify({
            total: res.pagination.totalItems,
            balances: res.items.map((b) => ({
              id: b.id,
              product: {
                id: b.productId,
                name: b.product?.name ?? "Unknown Product",
                sku: b.product?.sku ?? "N/A",
                uom: b.product?.unitOfMeasure ?? "units",
              },
              warehouse: {
                id: b.warehouseId,
                name: b.warehouse?.name ?? "Unknown Warehouse",
                code: b.warehouse?.code ?? "N/A",
              },
              location: b.location
                ? { id: b.locationId, name: b.location.name, code: b.location.code }
                : null,
              quantityOnHand: b.quantityOnHand,
            })),
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_stock_balances",
        description:
          "Query current stock balances on hand across warehouses and storage locations for products in this organization.",
        schema: z.object({
          productId: z.string().optional().describe("Filter stock balances by product ID"),
          warehouseId: z.string().optional().describe("Filter stock balances by warehouse ID"),
          limit: z.number().int().min(1).max(20).default(10).describe("Maximum records to return"),
        }),
      },
    );

    // 3. getInventoryMovements
    const getInventoryMovementsTool: StructuredToolInterface = tool(
      async (input: {
        productId?: string;
        warehouseId?: string;
        type?: "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER";
        limit?: number;
      }) => {
        try {
          const res = await inventoryService.listTransactions(organizationId, {
            productId: input.productId,
            warehouseId: input.warehouseId,
            type: input.type,
            limit: input.limit ?? 10,
            page: 1,
          });

          for (const tx of res.items) {
            const prodName = tx.product?.name ?? "Unknown Product";
            const prodSku = tx.product?.sku ?? "N/A";
            const whName = tx.warehouse?.name ?? "Unknown Facility";

            addCitation({
              type: "transaction",
              id: tx.id,
              name: tx.type,
              summary: `Movement [${tx.type}]: ${tx.quantity} units of ${prodName} (${prodSku}) at ${whName} on ${tx.createdAt}`,
              metadata: { type: tx.type, reason: tx.reason, reference: tx.reference },
            });
          }

          return JSON.stringify({
            total: res.pagination.totalItems,
            transactions: res.items.map((tx) => ({
              id: tx.id,
              type: tx.type,
              quantity: tx.quantity,
              product: {
                id: tx.productId,
                name: tx.product?.name ?? "Unknown Product",
                sku: tx.product?.sku ?? "N/A",
              },
              warehouse: { id: tx.warehouseId, name: tx.warehouse?.name ?? "Unknown Facility" },
              reason: tx.reason,
              reference: tx.reference,
              createdAt: tx.createdAt,
            })),
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_inventory_movements",
        description:
          "Query recent inventory ledger transactions (RECEIPT, ISSUE, ADJUSTMENT, TRANSFER) with quantities and timestamps.",
        schema: z.object({
          productId: z.string().optional().describe("Filter transactions by product ID"),
          warehouseId: z.string().optional().describe("Filter transactions by warehouse ID"),
          type: z
            .enum(["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER"])
            .optional()
            .describe("Transaction movement type"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(10)
            .describe("Maximum transactions to return"),
        }),
      },
    );

    // 4. getLowStockProducts
    const getLowStockProductsTool: StructuredToolInterface = tool(
      async (input: { categoryId?: string; limit?: number }) => {
        try {
          const res = await reportsService.getLowStockReport(organizationId, {
            categoryId: input.categoryId,
            limit: input.limit ?? 10,
            page: 1,
            sortBy: "name",
            sortOrder: "asc",
            includeZeroThreshold: false,
          });

          for (const item of res.items) {
            addCitation({
              type: "low_stock",
              id: item.productId,
              name: item.name,
              summary: `Low Stock Alert: ${item.name} (${item.sku}) - On Hand: ${item.totalQuantityOnHand}, Threshold: ${item.lowStockThreshold}, Deficit: ${item.deficit}`,
              metadata: { sku: item.sku, deficit: item.deficit },
            });
          }

          return JSON.stringify({
            totalCount: res.summary.lowStockProductsCount,
            items: res.items.slice(0, 15),
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_low_stock_products",
        description:
          "Retrieve products that have fallen below their configured low stock threshold, with on-hand quantities and stock deficits.",
        schema: z.object({
          categoryId: z
            .string()
            .optional()
            .describe("Filter low stock items by product category ID"),
          limit: z.number().int().min(1).max(20).default(10).describe("Maximum items to return"),
        }),
      },
    );

    // 5. getWarehouseInventory
    const getWarehouseInventoryTool: StructuredToolInterface = tool(
      async (input: { warehouseId?: string }) => {
        try {
          const res = await reportsService.getInventoryByWarehouse(organizationId, {
            warehouseId: input.warehouseId,
          });

          for (const wh of res.warehouses) {
            addCitation({
              type: "warehouse_inventory",
              id: wh.warehouseId,
              name: wh.warehouseName,
              summary: `Warehouse Facility: ${wh.warehouseName} (${wh.warehouseCode}) - Total Products: ${wh.distinctProductsCount}, Quantities: ${JSON.stringify(wh.stockByUom)}`,
            });
          }

          return JSON.stringify(res);
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_warehouse_inventory",
        description:
          "Retrieve aggregate inventory breakdown grouped by warehouse facility and units of measure.",
        schema: z.object({
          warehouseId: z.string().optional().describe("Optional warehouse ID to inspect"),
        }),
      },
    );

    // 6. listPurchaseOrders
    const listPurchaseOrdersTool: StructuredToolInterface = tool(
      async (input: {
        supplierId?: string;
        status?:
          | "DRAFT"
          | "PENDING_APPROVAL"
          | "APPROVED"
          | "PARTIALLY_RECEIVED"
          | "RECEIVED"
          | "CANCELLED";
        limit?: number;
      }) => {
        try {
          const res = await purchaseOrderService.listPurchaseOrders(organizationId, {
            supplierId: input.supplierId,
            status: input.status,
            limit: input.limit ?? 10,
            page: 1,
            sortBy: "createdAt",
            sortOrder: "desc",
          });

          for (const po of res.items) {
            addCitation({
              type: "purchase_order",
              id: po.id,
              name: po.orderNumber,
              summary: `Purchase Order: ${po.orderNumber} - Supplier: ${po.supplierName ?? po.supplierId}, Status: ${po.status}, Total: $${po.totalAmount}`,
              metadata: { orderNumber: po.orderNumber, status: po.status },
            });
          }

          return JSON.stringify({
            total: res.pagination.totalItems,
            orders: res.items.map((po) => ({
              id: po.id,
              orderNumber: po.orderNumber,
              supplier: { id: po.supplierId, name: po.supplierName ?? po.supplierId },
              status: po.status,
              totalAmount: po.totalAmount,
              currency: po.currency,
              orderDate: po.orderDate,
              expectedDeliveryDate: po.expectedDeliveryDate,
              itemCount: po.items?.length ?? 0,
            })),
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "list_purchase_orders",
        description:
          "List procurement purchase orders filtered by supplier or status (DRAFT, PENDING_APPROVAL, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED).",
        schema: z.object({
          supplierId: z.string().optional().describe("Filter by supplier ID"),
          status: z
            .enum([
              "DRAFT",
              "PENDING_APPROVAL",
              "APPROVED",
              "PARTIALLY_RECEIVED",
              "RECEIVED",
              "CANCELLED",
            ])
            .optional()
            .describe("Filter by purchase order status"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(10)
            .describe("Max purchase orders to return"),
        }),
      },
    );

    // 7. getPurchaseOrderDetail
    const getPurchaseOrderDetailTool: StructuredToolInterface = tool(
      async (input: { purchaseOrderId: string }) => {
        try {
          const po = await purchaseOrderService.getPurchaseOrderById(
            organizationId,
            input.purchaseOrderId,
          );

          addCitation({
            type: "purchase_order",
            id: po.id,
            name: po.orderNumber,
            summary: `Purchase Order Detail: ${po.orderNumber} (${po.supplierName ?? po.supplierId}) - Status: ${po.status}, Total: $${po.totalAmount}, Items: ${po.items?.length ?? 0}`,
            metadata: { orderNumber: po.orderNumber, status: po.status },
          });

          return JSON.stringify({
            id: po.id,
            orderNumber: po.orderNumber,
            status: po.status,
            supplier: { id: po.supplierId, name: po.supplierName ?? po.supplierId },
            orderDate: po.orderDate,
            expectedDeliveryDate: po.expectedDeliveryDate,
            subtotal: po.subtotal,
            taxAmount: po.taxAmount,
            totalAmount: po.totalAmount,
            notes: po.notes,
            items: (po.items ?? []).map((i) => ({
              id: i.id,
              product: {
                id: i.productId,
                name: i.productName ?? "Unknown Product",
                sku: i.productSku ?? "N/A",
              },
              quantityOrdered: i.quantityOrdered,
              quantityReceived: i.quantityReceived,
              unitCost: i.unitCost,
              lineTotal: i.lineTotal,
            })),
            receiptsCount: po.receipts?.length ?? 0,
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_purchase_order_detail",
        description:
          "Retrieve detailed information for a specific purchase order including line item products, ordered vs received quantities, and unit costs.",
        schema: z.object({
          purchaseOrderId: z.string().describe("Purchase order ID to retrieve"),
        }),
      },
    );

    // 8. getDemandForecasts
    const getDemandForecastsTool: StructuredToolInterface = tool(
      async (input: { forecastRunId?: string; limit?: number }) => {
        try {
          if (input.forecastRunId) {
            const detail = await forecastingService.getForecastRun(
              organizationId,
              input.forecastRunId,
            );
            addCitation({
              type: "demand_forecast",
              id: detail.id,
              name: detail.modelName,
              summary: `Forecast Run: ${detail.modelName} (v${detail.modelVersion}) - Status: ${detail.status}, Horizon: ${detail.horizonDays} days, Products: ${detail.productCount}`,
            });
            return JSON.stringify({
              id: detail.id,
              status: detail.status,
              model: detail.modelName,
              horizonDays: detail.horizonDays,
              points: detail.points.slice(0, 20),
            });
          }

          const res = await forecastingService.listForecastRuns(organizationId, {
            limit: input.limit ?? 5,
            page: 1,
          });

          for (const run of res.runs) {
            addCitation({
              type: "demand_forecast",
              id: run.id,
              name: run.modelName,
              summary: `Forecast Run: ${run.modelName} - Status: ${run.status}, Horizon: ${run.horizonDays} days (Created: ${run.createdAt})`,
            });
          }

          return JSON.stringify({
            total: res.pagination.total,
            runs: res.runs,
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_demand_forecasts",
        description:
          "Retrieve AI demand forecast runs and predicted consumption points for products in this organization.",
        schema: z.object({
          forecastRunId: z
            .string()
            .optional()
            .describe("Optional specific forecast run ID to fetch detailed points"),
          limit: z.number().int().min(1).max(10).default(5).describe("Max forecast runs to list"),
        }),
      },
    );

    // 9. getInventoryAnomalies
    const getInventoryAnomaliesTool: StructuredToolInterface = tool(
      async (input: {
        status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
        severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        limit?: number;
      }) => {
        try {
          const res = await anomalyService.listAnomalies(organizationId, {
            status: input.status,
            severity: input.severity,
            limit: input.limit ?? 10,
            page: 1,
            sortBy: "detectedAt",
            sortOrder: "desc",
          });

          for (const anom of res.anomalies) {
            addCitation({
              type: "anomaly",
              id: anom.id,
              name: anom.category,
              summary: `Anomaly [${anom.severity}]: ${anom.category} - Product: ${anom.product?.name ?? "N/A"}, Warehouse: ${anom.warehouse?.name ?? "N/A"} - Status: ${anom.status}`,
              metadata: { severity: anom.severity, status: anom.status },
            });
          }

          return JSON.stringify({
            total: res.pagination.total,
            anomalies: res.anomalies.map((a) => ({
              id: a.id,
              category: a.category,
              severity: a.severity,
              status: a.status,
              product: a.product
                ? { id: a.product.id, name: a.product.name, sku: a.product.sku }
                : null,
              warehouse: a.warehouse ? { id: a.warehouse.id, name: a.warehouse.name } : null,
              detectedAt: a.detectedAt,
              explanation: a.explanation,
            })),
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_inventory_anomalies",
        description:
          "Retrieve detected inventory anomalies (e.g. unusual spikes, drops, unexpected adjustments, suspicious transfers) with severity and status.",
        schema: z.object({
          status: z
            .enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"])
            .optional()
            .describe("Filter by anomaly review status"),
          severity: z
            .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
            .optional()
            .describe("Filter by anomaly severity"),
          limit: z.number().int().min(1).max(20).default(10).describe("Max anomalies to return"),
        }),
      },
    );

    // 10. getInventorySummary
    const getInventorySummaryTool: StructuredToolInterface = tool(
      async () => {
        try {
          const [summary, org] = await Promise.all([
            dashboardService.getInventoryDashboard(organizationId, {
              recentLimit: 5,
            }),
            db?.organization?.findUnique
              ? db.organization
                  .findUnique({
                    where: { id: organizationId },
                    select: { id: true, name: true, slug: true },
                  })
                  .catch(() => null)
              : null,
          ]);

          addCitation({
            type: "dashboard_summary",
            name: "Inventory Overview",
            summary: `Dashboard Summary for ${org?.name ?? "Organization"}: ${summary.overview.totalActiveProducts} active products, ${summary.overview.totalActiveWarehouses} warehouses, ${summary.movementsWindow.totalTransactions} transactions in window, ${summary.purchaseOrdersSummary.pendingApprovalCount} POs pending approval.`,
          });

          return JSON.stringify({
            organization: {
              id: organizationId,
              name: org?.name ?? "Current Organization",
              slug: org?.slug ?? "current",
            },
            overview: summary.overview,
            movementsWindow: summary.movementsWindow,
            purchaseOrdersSummary: summary.purchaseOrdersSummary,
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_inventory_summary",
        description:
          "Get high-level organizational overview of inventory status, active organization name, total active products, facilities, movement counts, and purchase order statuses.",
        schema: z.object({}),
      },
    );

    // 11. getOrganizationInfo
    const getOrganizationInfoTool: StructuredToolInterface = tool(
      async () => {
        try {
          const org = db?.organization?.findUnique
            ? await db.organization
                .findUnique({
                  where: { id: organizationId },
                  select: { id: true, name: true, slug: true, status: true, createdAt: true },
                })
                .catch(() => null)
            : null;

          if (!org) {
            return JSON.stringify({
              organizationId,
              organizationName: "Current Organization",
              status: "ACTIVE",
            });
          }

          addCitation({
            type: "dashboard_summary",
            id: org.id,
            name: org.name,
            summary: `Organization: ${org.name} (Slug: ${org.slug}, Status: ${org.status})`,
          });

          return JSON.stringify({
            organizationId: org.id,
            organizationName: org.name,
            slug: org.slug,
            status: org.status,
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
      {
        name: "get_organization_info",
        description:
          "Retrieve current organization details including its legal/display name, unique identifier, and status.",
        schema: z.object({}),
      },
    );

    return [
      searchProductsTool,
      getStockBalancesTool,
      getInventoryMovementsTool,
      getLowStockProductsTool,
      getWarehouseInventoryTool,
      listPurchaseOrdersTool,
      getPurchaseOrderDetailTool,
      getDemandForecastsTool,
      getInventoryAnomaliesTool,
      getInventorySummaryTool,
      getOrganizationInfoTool,
    ];
  }
}
