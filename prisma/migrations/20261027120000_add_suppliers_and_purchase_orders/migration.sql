-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contact_person" TEXT,
    "address" TEXT,
    "tax_identifier" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_ordered" DECIMAL(18,4) NOT NULL,
    "quantity_received" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "line_total" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "request_hash" TEXT,
    "received_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_code_key" ON "suppliers"("organization_id", "code");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers"("organization_id");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_is_active_idx" ON "suppliers"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_name_idx" ON "suppliers"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_order_number_key" ON "purchase_orders"("organization_id", "order_number");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_idx" ON "purchase_orders"("organization_id");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_status_idx" ON "purchase_orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_supplier_id_idx" ON "purchase_orders"("organization_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_order_date_idx" ON "purchase_orders"("organization_id", "order_date");

-- CreateIndex
CREATE INDEX "purchase_orders_created_by_user_id_idx" ON "purchase_orders"("created_by_user_id");

-- CreateIndex
CREATE INDEX "purchase_orders_approved_by_user_id_idx" ON "purchase_orders"("approved_by_user_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_receipts_organization_id_idempotency_key_key" ON "purchase_order_receipts"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_order_receipts_organization_id_idx" ON "purchase_order_receipts"("organization_id");

-- CreateIndex
CREATE INDEX "purchase_order_receipts_purchase_order_id_idx" ON "purchase_order_receipts"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_receipts_location_id_idx" ON "purchase_order_receipts"("location_id");

-- CreateIndex
CREATE INDEX "purchase_order_receipts_received_by_user_id_idx" ON "purchase_order_receipts"("received_by_user_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

