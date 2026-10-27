import { AnomalyCategory, AnomalySeverity, InventoryTransactionType } from "@prisma/client";
import type { IDetectionStrategy, DetectionStrategyContext } from "./detection-strategy.interface";
import type { RawAnomalyCandidate, RichInventoryTransaction } from "../anomaly.types";

/**
 * Strategy detecting recurring inventory adjustments on the same product and storage location
 * within a short time window, indicating process instability or chronic counting discrepancies.
 */
export class RepeatedAdjustmentsStrategy implements IDetectionStrategy {
  public readonly name = "REPEATED_ADJUSTMENTS";
  public readonly version = "1.0.0";
  public readonly category = AnomalyCategory.REPEATED_ADJUSTMENTS;

  public async detect(context: DetectionStrategyContext): Promise<RawAnomalyCandidate[]> {
    const candidates: RawAnomalyCandidate[] = [];

    // Filter adjustments in the detection window
    const adjustments = context.transactionsInWindow.filter(
      (t) => t.type === InventoryTransactionType.ADJUSTMENT,
    );

    // Group adjustments by `productId:locationId`
    const groupMap = new Map<string, RichInventoryTransaction[]>();
    for (const adj of adjustments) {
      const locId = adj.destinationLocationId ?? adj.sourceLocationId ?? "global";
      const key = `${adj.productId}:${locId}`;
      const list = groupMap.get(key) ?? [];
      list.push(adj);
      groupMap.set(key, list);
    }

    for (const [key, txns] of groupMap.entries()) {
      if (txns.length < 3) continue;

      // Sort chronologically
      txns.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const earliest = txns[0]?.createdAt ?? new Date();
      const latest = txns[txns.length - 1]?.createdAt ?? new Date();
      const spanDays = Math.max(
        1,
        Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)),
      );

      // Trigger if 3+ adjustments in <= 7 days or 4+ adjustments in window
      if (txns.length >= 3) {
        const firstTxn = txns[0];
        if (!firstTxn) continue;

        const product = firstTxn.product;
        const productName = product?.name ?? "Unknown Product";
        const productSku = product?.sku ?? "N/A";
        const locationId = firstTxn.destinationLocationId ?? firstTxn.sourceLocationId ?? null;
        const locationName =
          firstTxn.destinationLocation?.name ??
          firstTxn.sourceLocation?.name ??
          "Designated Location";

        let netDelta = 0;
        let absDelta = 0;
        const txnIds: string[] = [];

        for (const t of txns) {
          const delta = Number(t.quantityDelta);
          netDelta += delta;
          absDelta += Math.abs(delta);
          txnIds.push(t.id);
        }

        const score = txns.length;
        const severity =
          txns.length >= 6
            ? AnomalySeverity.HIGH
            : txns.length >= 4
              ? AnomalySeverity.MEDIUM
              : AnomalySeverity.LOW;

        const dateBucket = earliest.toISOString().slice(0, 10);
        const dedupKey = `${context.organizationId}:repeated_adj:${key}:${dateBucket}`;

        const explanation =
          `Product "${productName}" (${productSku}) had ${txns.length} stock adjustments at location "${locationName}" ` +
          `within a ${spanDays}-day span (Net delta: ${netDelta > 0 ? "+" : ""}${netDelta.toFixed(2)}, Absolute delta: ${absDelta.toFixed(2)}). ` +
          `Frequent adjustments suggest recurrent cycle counting discrepancies or stock management issues.`;

        candidates.push({
          category: this.category,
          severity,
          productId: firstTxn.productId,
          warehouseId: firstTxn.warehouseId ?? null,
          locationId,
          transactionId: firstTxn.id,
          strategyName: this.name,
          strategyVersion: this.version,
          score,
          explanation,
          evidence: {
            adjustmentCount: txns.length,
            spanDays,
            netDelta,
            absoluteDelta: absDelta,
            transactionIds: txnIds,
            earliestAdjustment: earliest.toISOString(),
            latestAdjustment: latest.toISOString(),
          },
          dedupKey,
        });
      }
    }

    return candidates;
  }
}
