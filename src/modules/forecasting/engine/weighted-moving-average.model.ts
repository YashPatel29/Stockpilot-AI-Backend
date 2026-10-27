import type {
  IForecastingModel,
  ForecastModelInput,
  ForecastModelOutput,
  ForecastModelPoint,
} from "./forecasting-model.interface";

/**
 * Deterministic baseline forecasting model using Recency-Weighted Moving Average
 * augmented with Day-of-Week Seasonality indices and empirical standard error bounds.
 *
 * Characteristics:
 * - Deterministic, pure mathematical calculation (no LLM hallucination).
 * - Strictly non-negative predictions (bounded at >= 0).
 * - Day-of-week seasonal adjustment captures weekly consumption cycles.
 * - Linear recency weights ensure recent trends carry higher priority.
 * - 95% confidence intervals derived from in-sample residual standard deviation.
 */
export class WeightedMovingAverageModel implements IForecastingModel {
  public readonly name = "WeightedMovingAverage-DoW";
  public readonly version = "1.0.0";

  public predict(input: ForecastModelInput): ForecastModelOutput {
    const { historicalData, horizonDays, referenceDate } = input;

    if (!historicalData || historicalData.length === 0) {
      return {
        modelName: this.name,
        modelVersion: this.version,
        points: [],
      };
    }

    const n = historicalData.length;

    // 1. Calculate overall mean consumption
    const totalConsumption = historicalData.reduce((acc, curr) => acc + curr.quantity, 0);
    const overallMean = totalConsumption / n;

    // 2. Calculate linear recency-weighted baseline level
    // Weights: w_i = i for i in [1..n]
    let weightedSum = 0;
    let sumOfWeights = 0;
    for (let i = 0; i < n; i++) {
      const weight = i + 1;
      const obs = historicalData[i]!;
      weightedSum += weight * obs.quantity;
      sumOfWeights += weight;
    }
    const baselineLevel = sumOfWeights > 0 ? weightedSum / sumOfWeights : 0;

    // 3. Calculate Day-of-Week (0=Sunday, ..., 6=Saturday) seasonal factors
    const dayTotals = new Array<number>(7).fill(0);
    const dayCounts = new Array<number>(7).fill(0);

    for (const obs of historicalData) {
      // Parse UTC date from YYYY-MM-DD
      const parts = obs.date.split("-").map(Number);
      const year = parts[0] ?? 2000;
      const month = (parts[1] ?? 1) - 1;
      const day = parts[2] ?? 1;
      const d = new Date(Date.UTC(year, month, day)).getUTCDay();

      dayTotals[d] = (dayTotals[d] ?? 0) + obs.quantity;
      dayCounts[d] = (dayCounts[d] ?? 0) + 1;
    }

    const seasonalFactors = new Array<number>(7).fill(1.0);
    if (overallMean > 0) {
      for (let d = 0; d < 7; d++) {
        const count = dayCounts[d] ?? 0;
        if (count > 0) {
          const dayMean = (dayTotals[d] ?? 0) / count;
          // Dampen seasonal factor between [0.2, 3.0] to prevent extreme distortions
          const rawFactor = dayMean / overallMean;
          seasonalFactors[d] = Math.max(0.2, Math.min(3.0, rawFactor));
        } else {
          seasonalFactors[d] = 1.0;
        }
      }
    }

    // 4. Calculate in-sample residual standard deviation for confidence interval
    let sumSquaredResiduals = 0;
    for (const obs of historicalData) {
      const parts = obs.date.split("-").map(Number);
      const year = parts[0] ?? 2000;
      const month = (parts[1] ?? 1) - 1;
      const day = parts[2] ?? 1;
      const d = new Date(Date.UTC(year, month, day)).getUTCDay();

      const expected = baselineLevel * (seasonalFactors[d] ?? 1.0);
      const residual = obs.quantity - expected;
      sumSquaredResiduals += residual * residual;
    }
    const residualStdDev = Math.sqrt(sumSquaredResiduals / n);

    // 5. Generate future prediction points
    const points: ForecastModelPoint[] = [];

    // Determine start date: the day after the last historical date, or after referenceDate
    let baseTime: Date;
    if (referenceDate) {
      baseTime = new Date(referenceDate);
    } else {
      const lastObs = historicalData[historicalData.length - 1]!;
      const parts = lastObs.date.split("-").map(Number);
      baseTime = new Date(Date.UTC(parts[0] ?? 2000, (parts[1] ?? 1) - 1, parts[2] ?? 1));
    }

    // Advance 1 day at a time into future horizon
    for (let step = 1; step <= horizonDays; step++) {
      const pointDate = new Date(baseTime);
      pointDate.setUTCDate(baseTime.getUTCDate() + step);

      const year = pointDate.getUTCFullYear();
      const month = pointDate.getUTCMonth();
      const dateNum = pointDate.getUTCDate();
      const dow = pointDate.getUTCDay();

      const periodStart = new Date(Date.UTC(year, month, dateNum, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(year, month, dateNum, 23, 59, 59, 999));

      const rawPrediction = baselineLevel * (seasonalFactors[dow] ?? 1.0);
      const predictedQuantity = Math.max(0, Math.round(rawPrediction * 10000) / 10000);

      // 95% Confidence Interval (z = 1.96)
      const margin = 1.96 * residualStdDev;
      const lowerBound = Math.max(0, Math.round((predictedQuantity - margin) * 10000) / 10000);
      const upperBound = Math.max(
        predictedQuantity,
        Math.round((predictedQuantity + margin) * 10000) / 10000,
      );

      points.push({
        periodStart,
        periodEnd,
        predictedQuantity,
        lowerBound,
        upperBound,
      });
    }

    return {
      modelName: this.name,
      modelVersion: this.version,
      points,
    };
  }
}
