import { AnomalyCategory, AnomalySeverity, InventoryTransactionType } from "@prisma/client";
import {
  type IDetectionStrategy,
  type DetectionStrategyContext,
  calculateMad,
} from "./detection-strategy.interface";
import type { RawAnomalyCandidate } from "../anomaly.types";

/**
 * Strategy detecting unusual inventory adjustment movements (large shrinkage or sudden positive jumps)
 * relative to normal cycle-count reconciliation baselines.
 */
export class UnusualAdjustmentStrategy implements IDetectionStrategy {
  public readonly name = "UNUSUAL_ADJUSTMENT";
  public readonly version = "1.0.0";
  public readonly category = AnomalyCategory.UNUSUAL_ADJUSTMENT;

  public async detect(context: DetectionStrategyContext): Promise<RawAnomalyCandidate[]> {
    const candidates: RawAnomalyCandidate[] = [];

    // Group historical adjustments by product
    const productAdjHistory = new Map<string, number[]>();
    for (const txn of context.historicalTransactions) {
      if (txn.type !== InventoryTransactionType.ADJUSTMENT) continue;
      const delta = Math.abs(Number(txn.quantityDelta));
      if (!Number.isFinite(delta) || delta <= 0) continue;
      const list = productAdjHistory.get(txn.productId) ?? [];
      list.push(delta);
      productAdjHistory.set(txn.productId, list);
    }

    // Inspect adjustments in the active window
    for (const txn of context.transactionsInWindow) {
      if (txn.type !== InventoryTransactionType.ADJUSTMENT) continue;

      const rawDelta = Number(txn.quantityDelta);
      const absDelta = Math.abs(rawDelta);
      if (!Number.isFinite(absDelta) || absDelta <= 0) continue;

      const history = productAdjHistory.get(txn.productId) ?? [];
      const isNegative = rawDelta < 0;

      let isOutlier = false;
      let score = 0;
      let severity: AnomalySeverity = AnomalySeverity.LOW;

      if (history.length >= 3) {
        const { median, mad } = calculateMad(history);
        if (mad > 0) {
          const modZ = (0.6745 * Math.abs(absDelta - median)) / mad;
          score = Number(modZ.toFixed(4));
          if (modZ >= 3.0 && absDelta > median) {
            isOutlier = true;
            if (isNegative && (modZ >= 6.0 || absDelta >= 100)) {
              severity = AnomalySeverity.CRITICAL;
            } else if (modZ >= 4.5 || absDelta >= 50) {
              severity = AnomalySeverity.HIGH;
            } else {
              severity = AnomalySeverity.MEDIUM;
            }
          }
        } else {
          // If MAD is 0 (e.g. typical 1-2 unit adjustments)
          if (absDelta >= Math.max(10, median * 3)) {
            isOutlier = true;
            score = Number((absDelta / Math.max(1, median)).toFixed(4));
            if (isNegative && absDelta >= 100) {
              severity = AnomalySeverity.CRITICAL;
            } else if (isNegative && absDelta >= 50) {
              severity = AnomalySeverity.HIGH;
            } else {
              severity = AnomalySeverity.MEDIUM;
            }
          }
        }
      } else {
        // Without extensive baseline, flag large raw adjustments
        if (absDelta >= 30) {
          isOutlier = true;
          score = Number(absDelta.toFixed(4));
          if (isNegative && absDelta >= 100) {
            severity = AnomalySeverity.CRITICAL;
          } else if (absDelta >= 60) {
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
        const locationName =
          txn.destinationLocation?.name ?? txn.sourceLocation?.name ?? "Unknown Location";
        const deltaLabel = isNegative ? `shrinkage of ${rawDelta}` : `increase of +${rawDelta}`;

        const explanation =
          `Unusual inventory adjustment (${deltaLabel} units) recorded for product "${productName}" (${productSku}) ` +
          `at location "${locationName}". Reason noted: "${txn.reason || "None specified"}". ` +
          `Score: ${score}. Review is recommended to verify physical stock integrity and documentation.`;

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
            quantityDelta: rawDelta,
            isNegativeShrinkage: isNegative,
            reason: txn.reason,
            reference: txn.reference,
            notes: txn.notes,
            score,
            historySampleSize: history.length,
          },
          dedupKey: `${context.organizationId}:unusual_adjustment:${txn.id}`,
        });
      }
    }

    return candidates;
  }
}
