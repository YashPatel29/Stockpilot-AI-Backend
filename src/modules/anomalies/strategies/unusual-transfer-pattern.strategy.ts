import { AnomalyCategory, AnomalySeverity, InventoryTransactionType } from "@prisma/client";
import type { IDetectionStrategy, DetectionStrategyContext } from "./detection-strategy.interface";
import type { RawAnomalyCandidate, RichInventoryTransaction } from "../anomaly.types";

/**
 * Strategy detecting unusual lateral transfer patterns, such as rapid rebound transfers
 * (Location A -> Location B -> Location A) or rapid multi-hop transfers.
 *
 * Grounded in the safety invariant that internal transfers must never be treated
 * as customer demand or consumption.
 */
export class UnusualTransferPatternStrategy implements IDetectionStrategy {
  public readonly name = "UNUSUAL_TRANSFER_PATTERN";
  public readonly version = "1.0.0";
  public readonly category = AnomalyCategory.UNUSUAL_TRANSFER_PATTERN;

  public async detect(context: DetectionStrategyContext): Promise<RawAnomalyCandidate[]> {
    const candidates: RawAnomalyCandidate[] = [];

    // Filter transfers within window
    const transfers = context.transactionsInWindow.filter(
      (t) => t.type === InventoryTransactionType.TRANSFER,
    );

    // Group transfers by productId
    const productTransfers = new Map<string, RichInventoryTransaction[]>();
    for (const t of transfers) {
      const list = productTransfers.get(t.productId) ?? [];
      list.push(t);
      productTransfers.set(t.productId, list);
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const [, txns] of productTransfers.entries()) {
      if (txns.length < 2) continue;

      // Sort chronologically
      txns.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Compare pairs to detect bounce-back / rebound transfers
      for (let i = 0; i < txns.length; i++) {
        const t1 = txns[i];
        if (!t1) continue;

        for (let j = i + 1; j < txns.length; j++) {
          const t2 = txns[j];
          if (!t2) continue;

          const timeDiff = t2.createdAt.getTime() - t1.createdAt.getTime();
          if (timeDiff > sevenDaysMs) {
            // Beyond 7-day window, stop inner loop since txns are sorted
            break;
          }

          // Check if t2 reverses t1 (A -> B, then B -> A)
          const isRebound =
            t1.sourceLocationId &&
            t1.destinationLocationId &&
            t2.sourceLocationId === t1.destinationLocationId &&
            t2.destinationLocationId === t1.sourceLocationId;

          if (isRebound) {
            const q1 = Number(t1.quantity);
            const q2 = Number(t2.quantity);
            const diffHours = Math.round(timeDiff / (1000 * 60 * 60));

            const productName = t1.product?.name ?? "Unknown Product";
            const productSku = t1.product?.sku ?? "N/A";
            const locAName = t1.sourceLocation?.name ?? "Origin Location";
            const locBName = t1.destinationLocation?.name ?? "Destination Location";

            let severity: AnomalySeverity = AnomalySeverity.LOW;
            if (q1 >= 50 || q2 >= 50) {
              severity = AnomalySeverity.HIGH;
            } else if (q1 >= 10 || q2 >= 10) {
              severity = AnomalySeverity.MEDIUM;
            }

            const explanation =
              `Rapid rebound transfer detected for product "${productName}" (${productSku}): ` +
              `${q1} units transferred from "${locAName}" to "${locBName}", followed ${diffHours} hours later ` +
              `by ${q2} units returned back to "${locAName}". ` +
              `Investigation is advised to check whether the initial dispatch was in error or items were rejected upon receipt.`;

            candidates.push({
              category: this.category,
              severity,
              productId: t1.productId,
              warehouseId: t1.warehouseId ?? t2.warehouseId ?? null,
              locationId: t1.destinationLocationId,
              transactionId: t2.id,
              strategyName: this.name,
              strategyVersion: this.version,
              score: Number((q1 + q2).toFixed(2)),
              explanation,
              evidence: {
                transferOutId: t1.id,
                transferOutQuantity: q1,
                transferOutTime: t1.createdAt.toISOString(),
                transferBackId: t2.id,
                transferBackQuantity: q2,
                transferBackTime: t2.createdAt.toISOString(),
                intervalHours: diffHours,
                sourceLocationId: t1.sourceLocationId,
                destinationLocationId: t1.destinationLocationId,
              },
              dedupKey: `${context.organizationId}:rebound_transfer:${t1.id}:${t2.id}`,
            });
          }
        }
      }
    }

    return candidates;
  }
}
