import type { AnomalyCategory } from "@prisma/client";
import type { RawAnomalyCandidate, RichInventoryTransaction } from "../anomaly.types";

/**
 * Context payload provided to detection strategies.
 */
export interface DetectionStrategyContext {
  organizationId: string;
  windowDays: number;
  windowStart: Date;
  windowEnd: Date;
  transactionsInWindow: RichInventoryTransaction[];
  historicalTransactions: RichInventoryTransaction[];
  filterWarehouseId?: string;
  filterProductId?: string;
}

/**
 * Contract implemented by modular anomaly detection strategies.
 */
export interface IDetectionStrategy {
  readonly name: string;
  readonly version: string;
  readonly category: AnomalyCategory;

  /**
   * Evaluates transactions in context and returns candidate anomaly findings.
   */
  detect(context: DetectionStrategyContext): Promise<RawAnomalyCandidate[]>;
}

/**
 * Calculates the statistical median of a numeric array.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const val = sorted[mid];
  if (val === undefined) return 0;
  if (sorted.length % 2 !== 0) {
    return val;
  }
  const prevVal = sorted[mid - 1];
  if (prevVal === undefined) return val;
  return (prevVal + val) / 2;
}

/**
 * Computes Median and Median Absolute Deviation (MAD).
 */
export function calculateMad(values: number[]): { median: number; mad: number } {
  if (values.length === 0) return { median: 0, mad: 0 };
  const median = calculateMedian(values);
  const deviations = values.map((v) => Math.abs(v - median));
  const mad = calculateMedian(deviations);
  return { median, mad };
}
