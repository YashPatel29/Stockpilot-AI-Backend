import type {
  DailyConsumptionObservation,
  ForecastEvaluationMetrics,
  PointEvaluationItem,
  ProductEvaluationResult,
  DemandForecastEvaluationDto,
} from "../forecasting.types";
import type { IForecastingModel } from "./forecasting-model.interface";

/**
 * Executes walk-forward temporal backtesting to evaluate forecasting accuracy
 * without future-data leakage.
 */
export class Backtester {
  /**
   * Evaluates a model against a single product's historical consumption series.
   */
  public evaluateProduct(
    model: IForecastingModel,
    productId: string,
    productName: string,
    productSku: string,
    historicalData: DailyConsumptionObservation[],
    horizonDays: number,
  ): ProductEvaluationResult | null {
    const n = historicalData.length;
    // Require at least 7 days to perform a meaningful backtest split
    if (n < 7) {
      return null;
    }

    // Determine backtest window size (at least 3 days, up to horizonDays, max 1/3 of series)
    const testSize = Math.max(3, Math.min(horizonDays, Math.floor(n / 3)));
    const trainSize = n - testSize;

    const trainData = historicalData.slice(0, trainSize);
    const testData = historicalData.slice(trainSize);

    if (trainData.length === 0 || testData.length === 0) {
      return null;
    }

    // As-of date is the last date in trainData
    const lastTrainObs = trainData[trainData.length - 1]!;
    const parts = lastTrainObs.date.split("-").map(Number);
    const referenceDate = new Date(Date.UTC(parts[0] ?? 2000, (parts[1] ?? 1) - 1, parts[2] ?? 1));

    // Predict forward using strictly the training partition
    const predictionOutput = model.predict({
      productId,
      historicalData: trainData,
      horizonDays: testSize,
      referenceDate,
    });

    const series: PointEvaluationItem[] = [];
    let sumAbsoluteError = 0;
    let sumSquaredError = 0;
    let actualTotal = 0;
    let predictedTotal = 0;

    for (let i = 0; i < testData.length; i++) {
      const actualObs = testData[i]!;
      const predPoint = predictionOutput.points[i];
      const predicted = predPoint ? predPoint.predictedQuantity : 0;
      const actual = actualObs.quantity;
      const error = Math.round((predicted - actual) * 10000) / 10000;
      const absError = Math.abs(predicted - actual);

      sumAbsoluteError += absError;
      sumSquaredError += (predicted - actual) * (predicted - actual);
      actualTotal += actual;
      predictedTotal += predicted;

      series.push({
        date: actualObs.date,
        actual: Math.round(actual * 10000) / 10000,
        predicted: Math.round(predicted * 10000) / 10000,
        error,
      });
    }

    const periods = testData.length;
    const mae = Math.round((sumAbsoluteError / periods) * 10000) / 10000;
    const rmse = Math.round(Math.sqrt(sumSquaredError / periods) * 10000) / 10000;

    // Safe WAPE computation avoiding divide-by-zero or infinite values
    let wape: number;
    if (actualTotal > 0) {
      wape = Math.round((sumAbsoluteError / actualTotal) * 10000) / 10000;
    } else if (sumAbsoluteError === 0) {
      wape = 0.0;
    } else {
      wape = 1.0; // Penalty value when all actuals were 0 but model predicted consumption
    }

    return {
      productId,
      productName,
      productSku,
      mae,
      rmse,
      wape,
      actualTotal: Math.round(actualTotal * 10000) / 10000,
      predictedTotal: Math.round(predictedTotal * 10000) / 10000,
      series,
    };
  }

  /**
   * Aggregates multiple product evaluations into a comprehensive backtesting report.
   */
  public generateEvaluationReport(params: {
    forecastRunId: string;
    model: IForecastingModel;
    horizonDays: number;
    productHistories: Array<{
      productId: string;
      productName: string;
      productSku: string;
      historicalData: DailyConsumptionObservation[];
    }>;
  }): DemandForecastEvaluationDto {
    const { forecastRunId, model, horizonDays, productHistories } = params;

    const productEvaluations: ProductEvaluationResult[] = [];
    let grandActualTotal = 0;
    let grandAbsoluteError = 0;
    let sumMae = 0;
    let sumRmse = 0;

    let evalStartDate = "";
    let evalEndDate = "";
    let evalPeriods = 0;

    for (const ph of productHistories) {
      const evalResult = this.evaluateProduct(
        model,
        ph.productId,
        ph.productName,
        ph.productSku,
        ph.historicalData,
        horizonDays,
      );

      if (evalResult) {
        productEvaluations.push(evalResult);
        grandActualTotal += evalResult.actualTotal;
        grandAbsoluteError += evalResult.series.reduce(
          (acc, pt) => acc + Math.abs(pt.predicted - pt.actual),
          0,
        );
        sumMae += evalResult.mae;
        sumRmse += evalResult.rmse;

        if (evalResult.series.length > 0) {
          const firstDate = evalResult.series[0]!.date;
          const lastDate = evalResult.series[evalResult.series.length - 1]!.date;
          if (!evalStartDate || firstDate < evalStartDate) {
            evalStartDate = firstDate;
          }
          if (!evalEndDate || lastDate > evalEndDate) {
            evalEndDate = lastDate;
          }
          if (evalResult.series.length > evalPeriods) {
            evalPeriods = evalResult.series.length;
          }
        }
      }
    }

    const count = productEvaluations.length;
    let aggregateMetrics: ForecastEvaluationMetrics;

    if (count > 0) {
      const avgMae = Math.round((sumMae / count) * 10000) / 10000;
      const avgRmse = Math.round((sumRmse / count) * 10000) / 10000;
      let aggWape: number;
      if (grandActualTotal > 0) {
        aggWape = Math.round((grandAbsoluteError / grandActualTotal) * 10000) / 10000;
      } else if (grandAbsoluteError === 0) {
        aggWape = 0.0;
      } else {
        aggWape = 1.0;
      }

      aggregateMetrics = {
        mae: avgMae,
        rmse: avgRmse,
        wape: aggWape,
      };
    } else {
      aggregateMetrics = { mae: 0, rmse: 0, wape: 0 };
    }

    return {
      forecastRunId,
      modelName: model.name,
      modelVersion: model.version,
      evaluationWindow: {
        startDate: evalStartDate,
        endDate: evalEndDate,
        periods: evalPeriods,
      },
      aggregateMetrics,
      productEvaluations,
    };
  }
}
