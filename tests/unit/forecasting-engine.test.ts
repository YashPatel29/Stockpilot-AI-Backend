import { describe, it, expect } from "vitest";
import { WeightedMovingAverageModel } from "../../src/modules/forecasting/engine/weighted-moving-average.model";
import { Backtester } from "../../src/modules/forecasting/engine/backtester";
import type { DailyConsumptionObservation } from "../../src/modules/forecasting/forecasting.types";

describe("Forecasting Engine (Unit)", () => {
  const model = new WeightedMovingAverageModel();
  const backtester = new Backtester();

  describe("WeightedMovingAverageModel", () => {
    it("should produce non-negative predictions for constant demand", () => {
      // 14 days of constant 10 units/day
      const historicalData: DailyConsumptionObservation[] = [];
      const baseDate = new Date("2026-10-01T00:00:00.000Z");

      for (let i = 0; i < 14; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + i);
        historicalData.push({
          date: d.toISOString().split("T")[0]!,
          quantity: 10,
          transactionCount: 2,
        });
      }

      const output = model.predict({
        productId: "prod-1",
        historicalData,
        horizonDays: 7,
      });

      expect(output.modelName).toBe("WeightedMovingAverage-DoW");
      expect(output.points.length).toBe(7);

      for (const pt of output.points) {
        expect(pt.predictedQuantity).toBe(10);
        expect(pt.lowerBound).toBeDefined();
        expect(pt.upperBound).toBeDefined();
        expect(pt.lowerBound!).toBeGreaterThanOrEqual(0);
        expect(pt.upperBound!).toBeGreaterThanOrEqual(pt.predictedQuantity);
      }
    });

    it("should handle zero historical demand safely without negative numbers or NaN", () => {
      const historicalData: DailyConsumptionObservation[] = [];
      const baseDate = new Date("2026-10-01T00:00:00.000Z");

      for (let i = 0; i < 14; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + i);
        historicalData.push({
          date: d.toISOString().split("T")[0]!,
          quantity: 0,
          transactionCount: 0,
        });
      }

      const output = model.predict({
        productId: "prod-zero",
        historicalData,
        horizonDays: 14,
      });

      expect(output.points.length).toBe(14);
      for (const pt of output.points) {
        expect(pt.predictedQuantity).toBe(0);
        expect(pt.lowerBound).toBe(0);
        expect(pt.upperBound).toBe(0);
      }
    });

    it("should weight recent consumption higher than older consumption", () => {
      // First 7 days: 5 units/day, Last 7 days: 15 units/day (Average = 10, but weighted should be > 10)
      const historicalData: DailyConsumptionObservation[] = [];
      const baseDate = new Date("2026-10-01T00:00:00.000Z");

      for (let i = 0; i < 14; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + i);
        historicalData.push({
          date: d.toISOString().split("T")[0]!,
          quantity: i < 7 ? 5 : 15,
          transactionCount: 1,
        });
      }

      const output = model.predict({
        productId: "prod-trend",
        historicalData,
        horizonDays: 7,
      });

      const avgPredicted =
        output.points.reduce((acc, p) => acc + p.predictedQuantity, 0) / output.points.length;
      expect(avgPredicted).toBeGreaterThan(10);
    });

    it("should return empty points when historical data is empty", () => {
      const output = model.predict({
        productId: "prod-empty",
        historicalData: [],
        horizonDays: 7,
      });

      expect(output.points).toEqual([]);
    });
  });

  describe("Backtester", () => {
    it("should compute MAE, RMSE, and WAPE correctly without future-data leakage", () => {
      // 21 days of history: 14 days train, 7 days test
      const historicalData: DailyConsumptionObservation[] = [];
      const baseDate = new Date("2026-10-01T00:00:00.000Z");

      for (let i = 0; i < 21; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + i);
        historicalData.push({
          date: d.toISOString().split("T")[0]!,
          quantity: 10, // Constant consumption
          transactionCount: 1,
        });
      }

      const result = backtester.evaluateProduct(
        model,
        "prod-1",
        "Widget A",
        "WGT-001",
        historicalData,
        7,
      );

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.productId).toBe("prod-1");
      expect(result.productName).toBe("Widget A");
      expect(result.series.length).toBe(7);
      // For constant consumption, prediction matches actual exactly
      expect(result.mae).toBe(0);
      expect(result.rmse).toBe(0);
      expect(result.wape).toBe(0);
      expect(result.actualTotal).toBe(70);
      expect(result.predictedTotal).toBe(70);
    });

    it("should handle zero-actual consumption safely without division by zero or NaN", () => {
      const historicalData: DailyConsumptionObservation[] = [];
      const baseDate = new Date("2026-10-01T00:00:00.000Z");

      for (let i = 0; i < 14; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(baseDate.getUTCDate() + i);
        historicalData.push({
          date: d.toISOString().split("T")[0]!,
          quantity: 0,
          transactionCount: 0,
        });
      }

      const result = backtester.evaluateProduct(
        model,
        "prod-zero",
        "Zero Widget",
        "WGT-ZERO",
        historicalData,
        7,
      );

      expect(result).not.toBeNull();
      if (!result) return;

      expect(result.mae).toBe(0);
      expect(result.rmse).toBe(0);
      expect(result.wape).toBe(0);
      expect(Number.isFinite(result.wape)).toBe(true);
      expect(Number.isNaN(result.wape)).toBe(false);
    });

    it("should return null for series shorter than minimum evaluation threshold", () => {
      const historicalData: DailyConsumptionObservation[] = [
        { date: "2026-10-01", quantity: 5, transactionCount: 1 },
        { date: "2026-10-02", quantity: 5, transactionCount: 1 },
      ];

      const result = backtester.evaluateProduct(
        model,
        "prod-short",
        "Short Widget",
        "WGT-SHORT",
        historicalData,
        7,
      );

      expect(result).toBeNull();
    });

    it("should aggregate multiple product evaluations into a comprehensive report", () => {
      const baseDate = new Date("2026-10-01T00:00:00.000Z");
      const makeHistory = (qty: number) => {
        const hist: DailyConsumptionObservation[] = [];
        for (let i = 0; i < 21; i++) {
          const d = new Date(baseDate);
          d.setUTCDate(baseDate.getUTCDate() + i);
          hist.push({
            date: d.toISOString().split("T")[0]!,
            quantity: qty,
            transactionCount: 1,
          });
        }
        return hist;
      };

      const report = backtester.generateEvaluationReport({
        forecastRunId: "run-123",
        model,
        horizonDays: 7,
        productHistories: [
          {
            productId: "prod-1",
            productName: "Product 1",
            productSku: "SKU-1",
            historicalData: makeHistory(10),
          },
          {
            productId: "prod-2",
            productName: "Product 2",
            productSku: "SKU-2",
            historicalData: makeHistory(20),
          },
        ],
      });

      expect(report.forecastRunId).toBe("run-123");
      expect(report.productEvaluations.length).toBe(2);
      expect(report.aggregateMetrics.mae).toBe(0);
      expect(report.aggregateMetrics.rmse).toBe(0);
      expect(report.aggregateMetrics.wape).toBe(0);
      expect(report.evaluationWindow.periods).toBe(7);
    });
  });
});
