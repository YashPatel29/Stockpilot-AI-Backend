import { AnomalyCategory, AnomalySeverity } from "@prisma/client";
import {
  type IDetectionStrategy,
  type DetectionStrategyContext,
  calculateMad,
} from "./detection-strategy.interface";
import type { RawAnomalyCandidate } from "../anomaly.types";

/**
 * Strategy detecting unusually large transaction movements (receipts, issues, adjustments)
 * relative to the historical baseline for each product and transaction type using
 * Median and Median Absolute Deviation (MAD).
 */
export class UnusuallyLargeMovementStrategy implements IDetectionStrategy {
  public readonly name = "UNUSUALLY_LARGE_MOVEMENT";
  public readonly version = "1.0.0";
  public readonly category = AnomalyCategory.UNUSUALLY_LARGE_MOVEMENT;

  public async detect(context: DetectionStrategyContext): Promise<RawAnomalyCandidate[]> {
    const candidates: RawAnomalyCandidate[] = [];
    const minSampleSize = 4;

    // Group historical transactions by `productId:type`
    const baselineMap = new Map<string, number[]>();
    for (const txn of context.historicalTransactions) {
      const key = `${txn.productId}:${txn.type}`;
      const qty = Math.abs(Number(txn.quantity));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const list = baselineMap.get(key) ?? [];
      list.push(qty);
      baselineMap.set(key, list);
    }

    // Evaluate each transaction within the detection window
    for (const txn of context.transactionsInWindow) {
      // Exclude zero-quantity transactions
      const qty = Math.abs(Number(txn.quantity));
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const baselineKey = `${txn.productId}:${txn.type}`;
      const history = baselineMap.get(baselineKey) ?? [];

      if (history.length < minSampleSize) {
        // Insufficient baseline data for statistical outlier detection
        continue;
      }

      const { median, mad } = calculateMad(history);
      let isOutlier = false;
      let score = 0;
      let severity: AnomalySeverity = AnomalySeverity.LOW;

      if (mad > 0) {
        const modZ = (0.6745 * Math.abs(qty - median)) / mad;
        score = Number(modZ.toFixed(4));

        if (modZ >= 3.5 && qty > median) {
          isOutlier = true;
          if (modZ >= 7.0 || qty >= median * 10) {
            severity = AnomalySeverity.CRITICAL;
          } else if (modZ >= 5.0 || qty >= median * 5) {
            severity = AnomalySeverity.HIGH;
          } else {
            severity = AnomalySeverity.MEDIUM;
          }
        }
      } else {
        // Fallback when MAD is zero (e.g. constant batch sizes in history)
        const diff = qty - median;
        if (qty >= median * 3 && diff >= 10) {
          isOutlier = true;
          score = Number((diff / Math.max(1, median)).toFixed(4));
          if (qty >= median * 5) {
            severity = AnomalySeverity.HIGH;
          } else {
            severity = AnomalySeverity.MEDIUM;
          }
        }
      }

      if (isOutlier) {
        const productName = txn.product?.name ?? "Unknown Product";
        const productSku = txn.product?.sku ?? "N/A";
        const locationId = txn.destinationLocationId ?? txn.sourceLocationId ?? null;

        const explanation =
          `Transaction quantity of ${qty} (${txn.type}) on product "${productName}" (${productSku}) ` +
          `deviates significantly from the historical baseline (median: ${median.toFixed(2)}, MAD: ${mad.toFixed(2)}, score: ${score}). ` +
          `Operational review is advised to verify count accuracy and dispatch authorization.`;

        const confidence = Number(
          Math.min(
            0.99,
            Math.max(0.65, 0.65 + Math.min(history.length / 50, 0.2) + Math.min(score / 20, 0.14)),
          ).toFixed(2),
        );

        candidates.push({
          category: this.category,
          severity,
          productId: txn.productId,
          warehouseId: txn.warehouseId ?? null,
          locationId,
          transactionId: txn.id,
          strategyName: this.name,
          strategyVersion: this.version,
          score,
          explanation,
          evidence: {
            transactionId: txn.id,
            transactionType: txn.type,
            quantity: qty,
            historicalMedian: median,
            historicalMad: mad,
            sampleSize: history.length,
            statisticalScore: score,
            confidence,
          },
          dedupKey: `${context.organizationId}:large_movement:${txn.id}`,
        });
      }
    }

    return candidates;
  }
}
