-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER');

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity_on_hand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "quantity_delta" DECIMAL(18,4) NOT NULL,
    "source_location_id" TEXT,
    "destination_location_id" TEXT,
    "reason" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "request_hash" TEXT,
    "performed_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_product_id_location_id_key" ON "inventory_balances"("product_id", "location_id");

-- CreateIndex
CREATE INDEX "inventory_balances_organization_id_idx" ON "inventory_balances"("organization_id");

-- CreateIndex
CREATE INDEX "inventory_balances_product_id_idx" ON "inventory_balances"("product_id");

-- CreateIndex
CREATE INDEX "inventory_balances_warehouse_id_idx" ON "inventory_balances"("warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_balances_location_id_idx" ON "inventory_balances"("location_id");

-- CreateIndex
CREATE INDEX "inventory_balances_organization_id_product_id_idx" ON "inventory_balances"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_balances_organization_id_warehouse_id_idx" ON "inventory_balances"("organization_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_organization_id_idempotency_key_key" ON "inventory_transactions"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_transactions_organization_id_idx" ON "inventory_transactions"("organization_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_product_id_idx" ON "inventory_transactions"("product_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_warehouse_id_idx" ON "inventory_transactions"("warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_source_location_id_idx" ON "inventory_transactions"("source_location_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_destination_location_id_idx" ON "inventory_transactions"("destination_location_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_organization_id_created_at_idx" ON "inventory_transactions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_idx" ON "inventory_transactions"("type");

-- CreateIndex
CREATE INDEX "inventory_transactions_organization_id_type_idx" ON "inventory_transactions"("organization_id", "type");

-- CreateIndex
CREATE INDEX "inventory_transactions_performed_by_user_id_idx" ON "inventory_transactions"("performed_by_user_id");

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

