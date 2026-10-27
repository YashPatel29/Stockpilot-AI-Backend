-- CreateEnum
CREATE TYPE "ForecastRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'INSUFFICIENT_HISTORY');

-- CreateTable
CREATE TABLE "demand_forecast_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "ForecastRunStatus" NOT NULL DEFAULT 'PENDING',
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "lookback_days" INTEGER NOT NULL,
    "granularity" TEXT NOT NULL DEFAULT 'DAILY',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "initiated_by_user_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_forecast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_forecast_points" (
    "id" TEXT NOT NULL,
    "forecast_run_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "predicted_demand" DECIMAL(18,4) NOT NULL,
    "lower_bound" DECIMAL(18,4),
    "upper_bound" DECIMAL(18,4),
    "unit_of_measure" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_forecast_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demand_forecast_runs_organization_id_created_at_idx" ON "demand_forecast_runs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "demand_forecast_runs_organization_id_status_idx" ON "demand_forecast_runs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "demand_forecast_points_forecast_run_id_idx" ON "demand_forecast_points"("forecast_run_id");

-- CreateIndex
CREATE INDEX "demand_forecast_points_product_id_idx" ON "demand_forecast_points"("product_id");

-- CreateIndex
CREATE INDEX "demand_forecast_points_period_start_idx" ON "demand_forecast_points"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "demand_forecast_points_forecast_run_id_product_id_period_start_key" ON "demand_forecast_points"("forecast_run_id", "product_id", "period_start");

-- AddForeignKey
ALTER TABLE "demand_forecast_runs" ADD CONSTRAINT "demand_forecast_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecast_runs" ADD CONSTRAINT "demand_forecast_runs_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecast_points" ADD CONSTRAINT "demand_forecast_points_forecast_run_id_fkey" FOREIGN KEY ("forecast_run_id") REFERENCES "demand_forecast_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecast_points" ADD CONSTRAINT "demand_forecast_points_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

