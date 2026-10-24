-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organization_id_code_key" ON "warehouses"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_id_organization_id_key" ON "warehouses"("id", "organization_id");

-- CreateIndex
CREATE INDEX "warehouses_organization_id_idx" ON "warehouses"("organization_id");

-- CreateIndex
CREATE INDEX "warehouses_organization_id_status_idx" ON "warehouses"("organization_id", "status");

-- CreateIndex
CREATE INDEX "warehouses_organization_id_name_idx" ON "warehouses"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_warehouse_id_code_key" ON "storage_locations"("warehouse_id", "code");

-- CreateIndex
CREATE INDEX "storage_locations_warehouse_id_idx" ON "storage_locations"("warehouse_id");

-- CreateIndex
CREATE INDEX "storage_locations_organization_id_idx" ON "storage_locations"("organization_id");

-- CreateIndex
CREATE INDEX "storage_locations_warehouse_id_status_idx" ON "storage_locations"("warehouse_id", "status");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_warehouse_id_organization_id_fkey" FOREIGN KEY ("warehouse_id", "organization_id") REFERENCES "warehouses"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

