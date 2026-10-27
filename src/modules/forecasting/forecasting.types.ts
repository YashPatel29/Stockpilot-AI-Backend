import type { ForecastRunStatus } from "@prisma/client";

/**
 * Observed consumption data point for a single calendar day.
 * Labeled explicitly as observed consumption (disbursements from storage locations)
 * rather than verified point-of-sale invoices.
 */
export interface DailyConsumptionObservation {
  date: string; // YYYY-MM-DD
  quantity: number;
  transactionCount: number;
}

/**
 * Historical consumption dataset for a specific product.
 */
export interface ProductHistoricalSeries {
  productId: string;
  productName: string;
  productSku: string;
  unitOfMeasure: string;
  observations: DailyConsumptionObservation[];
}

/**
 * Mathematical statistical evaluation metrics.
 */
export interface ForecastEvaluationMetrics {
  mae: number; // Mean Absolute Error
  rmse: number; // Root Mean Squared Error
  wape: number; // Weighted Absolute Percentage Error (sum(|actual - pred|) / sum(actual))
}

/**
 * Time-series point evaluation comparing actual observed consumption to prediction.
 */
export interface PointEvaluationItem {
  date: string;
  actual: number;
  predicted: number;
  error: number; // predicted - actual
}

/**
 * Product-level backtesting evaluation output.
 */
export interface ProductEvaluationResult {
  productId: string;
  productName: string;
  productSku: string;
  mae: number;
  rmse: number;
  wape: number;
  actualTotal: number;
  predictedTotal: number;
  series: PointEvaluationItem[];
}

/**
 * Complete backtesting evaluation result for a demand forecast run.
 */
export interface DemandForecastEvaluationDto {
  forecastRunId: string;
  modelName: string;
  modelVersion: string;
  evaluationWindow: {
    startDate: string;
    endDate: string;
    periods: number;
  };
  aggregateMetrics: ForecastEvaluationMetrics;
  productEvaluations: ProductEvaluationResult[];
}

/**
 * Input DTO for generating demand forecasts.
 */
export interface CreateDemandForecastInput {
  productId?: string;
  productIds?: string[];
  horizonDays?: number; // 7, 14, 30; default 14
  lookbackDays?: number; // 14 to 90; default 30
  granularity?: "DAILY";
}

/**
 * Safe external DTO representing a forecast time-series prediction point.
 */
export interface SafeDemandForecastPointDto {
  id: string;
  forecastRunId: string;
  productId: string;
  productName?: string;
  productSku?: string;
  periodStart: string;
  periodEnd: string;
  predictedDemand: string;
  lowerBound: string | null;
  upperBound: string | null;
  unitOfMeasure: string;
  createdAt: string;
}

/**
 * Safe external DTO representing a demand forecast run.
 */
export interface SafeDemandForecastRunDto {
  id: string;
  organizationId: string;
  status: ForecastRunStatus;
  modelName: string;
  modelVersion: string;
  horizonDays: number;
  lookbackDays: number;
  granularity: string;
  startedAt: string | null;
  completedAt: string | null;
  initiatedByUserId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detailed run DTO including generated forecast points.
 */
export interface DemandForecastRunDetailDto extends SafeDemandForecastRunDto {
  points: SafeDemandForecastPointDto[];
  totalPoints: number;
  productCount: number;
  evaluation?: DemandForecastEvaluationDto | null;
}

/**
 * Paginated demand forecast runs query result.
 */
export interface PaginatedForecastRunsResult {
  runs: SafeDemandForecastRunDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Query filter options for listing demand forecast runs.
 */
export interface ListDemandForecastRunsQuery {
  page?: number;
  limit?: number;
  status?: ForecastRunStatus;
  startDate?: Date | string;
  endDate?: Date | string;
}
