-- CreateEnum
CREATE TYPE "AnomalyCategory" AS ENUM ('UNUSUALLY_LARGE_MOVEMENT', 'UNUSUAL_ADJUSTMENT', 'REPEATED_ADJUSTMENTS', 'UNUSUAL_FREQUENCY', 'UNUSUAL_TRANSFER_PATTERN');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DetectionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'INSUFFICIENT_DATA');

-- CreateTable
CREATE TABLE "inventory_anomalies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category" "AnomalyCategory" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "product_id" TEXT,
    "warehouse_id" TEXT,
    "location_id" TEXT,
    "transaction_id" TEXT,
    "strategy_name" TEXT NOT NULL,
    "strategy_version" TEXT NOT NULL,
    "score" DECIMAL(10,4),
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "detection_window_start" TIMESTAMP(3) NOT NULL,
    "detection_window_end" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "resolution_note" TEXT,
    "dismissed_at" TIMESTAMP(3),
    "dismissed_by_user_id" TEXT,
    "detection_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_detection_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "DetectionRunStatus" NOT NULL DEFAULT 'PENDING',
    "window_days" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "initiated_by_user_id" TEXT,
    "findings_count" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomaly_detection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_anomalies_organization_id_dedup_key_key" ON "inventory_anomalies"("organization_id", "dedup_key");

-- CreateIndex
CREATE INDEX "inventory_anomalies_organization_id_status_idx" ON "inventory_anomalies"("organization_id", "status");

-- CreateIndex
CREATE INDEX "inventory_anomalies_organization_id_severity_idx" ON "inventory_anomalies"("organization_id", "severity");

-- CreateIndex
CREATE INDEX "inventory_anomalies_organization_id_category_idx" ON "inventory_anomalies"("organization_id", "category");

-- CreateIndex
CREATE INDEX "inventory_anomalies_organization_id_detected_at_idx" ON "inventory_anomalies"("organization_id", "detected_at");

-- CreateIndex
CREATE INDEX "inventory_anomalies_product_id_idx" ON "inventory_anomalies"("product_id");

-- CreateIndex
CREATE INDEX "inventory_anomalies_transaction_id_idx" ON "inventory_anomalies"("transaction_id");

-- CreateIndex
CREATE INDEX "inventory_anomalies_detection_run_id_idx" ON "inventory_anomalies"("detection_run_id");

-- CreateIndex
CREATE INDEX "anomaly_detection_runs_organization_id_created_at_idx" ON "anomaly_detection_runs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "anomaly_detection_runs_organization_id_status_idx" ON "anomaly_detection_runs"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_dismissed_by_user_id_fkey" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_anomalies" ADD CONSTRAINT "inventory_anomalies_detection_run_id_fkey" FOREIGN KEY ("detection_run_id") REFERENCES "anomaly_detection_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_detection_runs" ADD CONSTRAINT "anomaly_detection_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_detection_runs" ADD CONSTRAINT "anomaly_detection_runs_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

