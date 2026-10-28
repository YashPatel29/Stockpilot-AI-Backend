import { describe, it, expect, vi } from "vitest";
import {
  CopilotToolFactory,
  type CopilotToolContext,
} from "../../src/modules/copilot/tools/copilot-tool.factory";
import type { CopilotSourceDto } from "../../src/modules/copilot/copilot.types";

describe("CopilotToolFactory Unit Tests", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";

  it("should create exactly 11 allowlisted, read-only tools", () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };
    const tools = CopilotToolFactory.createTools(context);

    expect(tools).toHaveLength(11);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual([
      "search_products",
      "get_stock_balances",
      "get_inventory_movements",
      "get_low_stock_products",
      "get_warehouse_inventory",
      "list_purchase_orders",
      "get_purchase_order_detail",
      "get_demand_forecasts",
      "get_inventory_anomalies",
      "get_inventory_summary",
      "get_organization_info",
    ]);
  });

  it("should execute search_products tool and capture citation", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockProductService = {
      listProducts: vi.fn().mockResolvedValue({
        items: [
          {
            id: "prod-1",
            sku: "SKU-001",
            name: "Industrial Drill",
            costPrice: "50.00",
            sellingPrice: "89.99",
            status: "ACTIVE",
            category: { name: "Tools" },
            lowStockThreshold: 10,
          },
        ],
        pagination: { totalItems: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      productService: mockProductService as unknown as never,
    });

    const searchTool = tools.find((t) => t.name === "search_products");
    expect(searchTool).toBeDefined();

    const output = await searchTool!.invoke({ query: "Drill" });
    const parsed = JSON.parse(output);

    expect(parsed.total).toBe(1);
    expect(parsed.products[0].name).toBe("Industrial Drill");
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      type: "product",
      id: "prod-1",
      name: "Industrial Drill",
    });
  });

  it("should execute get_stock_balances tool and capture citation", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockInventoryService = {
      listBalances: vi.fn().mockResolvedValue({
        items: [
          {
            id: "bal-1",
            productId: "prod-1",
            warehouseId: "wh-1",
            locationId: "loc-1",
            quantityOnHand: "150",
            reservedQuantity: "10",
            availableQuantity: "140",
            product: { name: "Industrial Drill", sku: "SKU-001", unitOfMeasure: "PCS" },
            warehouse: { name: "Central Warehouse", code: "WH-CENTRAL" },
            location: { name: "Rack A", code: "A-01" },
          },
        ],
        pagination: { totalItems: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      inventoryService: mockInventoryService as unknown as never,
    });

    const balTool = tools.find((t) => t.name === "get_stock_balances");
    const output = await balTool!.invoke({});
    const parsed = JSON.parse(output);

    expect(parsed.total).toBe(1);
    expect(parsed.balances[0].quantityOnHand).toBe("150");
    expect(citations).toHaveLength(1);
    expect(citations[0]?.type).toBe("inventory_balance");
  });

  it("should execute get_inventory_movements tool and capture citation", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockInventoryService = {
      listTransactions: vi.fn().mockResolvedValue({
        items: [
          {
            id: "tx-1",
            type: "RECEIPT",
            quantity: "50",
            productId: "prod-1",
            warehouseId: "wh-1",
            reason: "PO Receipt",
            referenceNumber: "PO-20261028-01",
            createdAt: "2026-10-28T10:00:00Z",
            product: { name: "Industrial Drill", sku: "SKU-001" },
            warehouse: { name: "Central Warehouse" },
          },
        ],
        pagination: { totalItems: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      inventoryService: mockInventoryService as unknown as never,
    });

    const txTool = tools.find((t) => t.name === "get_inventory_movements");
    const output = await txTool!.invoke({ type: "RECEIPT" });
    const parsed = JSON.parse(output);

    expect(parsed.total).toBe(1);
    expect(parsed.transactions[0].type).toBe("RECEIPT");
    expect(citations).toHaveLength(1);
    expect(citations[0]?.type).toBe("transaction");
  });

  it("should execute get_low_stock_products tool and capture citation", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockReportsService = {
      getLowStockReport: vi.fn().mockResolvedValue({
        summary: { lowStockProductsCount: 1 },
        items: [
          {
            productId: "prod-2",
            name: "Safety Goggles",
            sku: "SKU-002",
            totalQuantityOnHand: "3",
            lowStockThreshold: 10,
            deficit: "7",
          },
        ],
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      reportsService: mockReportsService as unknown as never,
    });

    const lowStockTool = tools.find((t) => t.name === "get_low_stock_products");
    const output = await lowStockTool!.invoke({});
    const parsed = JSON.parse(output);

    expect(parsed.totalCount).toBe(1);
    expect(parsed.items[0].name).toBe("Safety Goggles");
    expect(citations).toHaveLength(1);
    expect(citations[0]?.type).toBe("low_stock");
  });

  it("should execute get_warehouse_inventory tool and capture citation", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockReportsService = {
      getInventoryByWarehouse: vi.fn().mockResolvedValue({
        organizationId: orgId,
        generatedAt: "2026-10-28T10:00:00Z",
        warehouses: [
          {
            warehouseId: "wh-1",
            warehouseName: "Central Warehouse",
            warehouseCode: "WH-CENTRAL",
            distinctProductsCount: 25,
            stockByUom: [{ unitOfMeasure: "PCS", totalQuantity: "500" }],
          },
        ],
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      reportsService: mockReportsService as unknown as never,
    });

    const whTool = tools.find((t) => t.name === "get_warehouse_inventory");
    const output = await whTool!.invoke({});
    const parsed = JSON.parse(output);

    expect(parsed.warehouses).toHaveLength(1);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.type).toBe("warehouse_inventory");
  });

  it("should execute list_purchase_orders and get_purchase_order_detail tools", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockPoService = {
      listPurchaseOrders: vi.fn().mockResolvedValue({
        items: [
          {
            id: "po-1",
            orderNumber: "PO-20261028-AAAA",
            supplierId: "sup-1",
            supplierName: "Acme Industrial",
            status: "APPROVED",
            totalAmount: "1250.00",
            currency: "USD",
            orderDate: "2026-10-28",
            expectedDeliveryDate: "2026-11-05",
            items: [{ id: "item-1" }],
          },
        ],
        pagination: { totalItems: 1, page: 1, limit: 10, totalPages: 1 },
      }),
      getPurchaseOrderById: vi.fn().mockResolvedValue({
        id: "po-1",
        orderNumber: "PO-20261028-AAAA",
        status: "APPROVED",
        supplierId: "sup-1",
        supplierName: "Acme Industrial",
        orderDate: "2026-10-28",
        expectedDeliveryDate: "2026-11-05",
        subtotal: "1200.00",
        taxAmount: "50.00",
        totalAmount: "1250.00",
        notes: "Rush delivery",
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            productName: "Industrial Drill",
            productSku: "SKU-001",
            quantityOrdered: "20",
            quantityReceived: "0",
            unitCost: "60.00",
            lineTotal: "1200.00",
          },
        ],
        receipts: [],
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      purchaseOrderService: mockPoService as unknown as never,
    });

    const listPoTool = tools.find((t) => t.name === "list_purchase_orders");
    const listOut = await listPoTool!.invoke({});
    const parsedList = JSON.parse(listOut);
    expect(parsedList.total).toBe(1);

    const getPoTool = tools.find((t) => t.name === "get_purchase_order_detail");
    const getOut = await getPoTool!.invoke({ purchaseOrderId: "po-1" });
    const parsedDetail = JSON.parse(getOut);
    expect(parsedDetail.orderNumber).toBe("PO-20261028-AAAA");
    expect(parsedDetail.items).toHaveLength(1);
    // Deduplication ensures the same PO entity (po-1) is not duplicated in citations
    expect(citations).toHaveLength(1);
    expect(citations[0]?.id).toBe("po-1");
  });

  it("should execute get_demand_forecasts, get_inventory_anomalies, and get_inventory_summary", async () => {
    const citations: CopilotSourceDto[] = [];
    const context: CopilotToolContext = { organizationId: orgId, citations };

    const mockForecastingService = {
      listForecastRuns: vi.fn().mockResolvedValue({
        runs: [
          {
            id: "run-1",
            modelName: "WeightedMovingAverage",
            status: "COMPLETED",
            horizonDays: 30,
            createdAt: "2026-10-28T00:00:00Z",
          },
        ],
        pagination: { total: 1, page: 1, limit: 5, totalPages: 1 },
      }),
    };

    const mockAnomalyService = {
      listAnomalies: vi.fn().mockResolvedValue({
        anomalies: [
          {
            id: "anom-1",
            category: "UNUSUALLY_LARGE_MOVEMENT",
            severity: "HIGH",
            status: "OPEN",
            detectedAt: "2026-10-28T09:00:00Z",
            explanation: "Spike in stock issue",
            product: { id: "prod-1", name: "Industrial Drill", sku: "SKU-001" },
            warehouse: { id: "wh-1", name: "Central Warehouse" },
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    };

    const mockDashboardService = {
      getInventoryDashboard: vi.fn().mockResolvedValue({
        overview: {
          totalActiveProducts: 45,
          totalActiveWarehouses: 2,
        },
        lowStockSummary: {
          lowStockProductsCount: 3,
        },
        movementsWindow: {
          totalTransactions: 120,
        },
        purchaseOrdersSummary: {
          countsByStatus: { APPROVED: 2 },
        },
      }),
    };

    const tools = CopilotToolFactory.createTools(context, {
      forecastingService: mockForecastingService as unknown as never,
      anomalyService: mockAnomalyService as unknown as never,
      dashboardService: mockDashboardService as unknown as never,
    });

    const forecastTool = tools.find((t) => t.name === "get_demand_forecasts");
    const fcOut = await forecastTool!.invoke({});
    expect(JSON.parse(fcOut).total).toBe(1);

    const anomTool = tools.find((t) => t.name === "get_inventory_anomalies");
    const anomOut = await anomTool!.invoke({});
    expect(JSON.parse(anomOut).total).toBe(1);

    const summaryTool = tools.find((t) => t.name === "get_inventory_summary");
    const sumOut = await summaryTool!.invoke({});
    expect(JSON.parse(sumOut).overview.totalActiveProducts).toBe(45);

    expect(citations).toHaveLength(3);
  });
});
