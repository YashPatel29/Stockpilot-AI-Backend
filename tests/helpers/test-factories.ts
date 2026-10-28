import { randomUUID } from "node:crypto";
import {
  type PrismaClient,
  OrganizationRole,
  ProductStatus,
  LocationStatus,
  type User,
  type Organization,
  type Product,
  type Warehouse,
  type StorageLocation,
  type Supplier,
  type ProductCategory,
  Prisma,
} from "@prisma/client";
import { hashPassword } from "../../src/common/utils/password.util";
import { signAccessToken } from "../../src/common/utils/token.util";
import { InventoryTransactionType } from "../../src/modules/inventory/inventory.types";
import { WarehouseStatus } from "../../src/modules/warehouses/warehouses/warehouse.types";

/**
 * Creates a synthetic test user with a hashed password in PostgreSQL.
 */
export async function createTestUser(
  prisma: PrismaClient,
  overrides?: Partial<{
    name: string;
    email: string;
    password: string;
    status: string;
  }>,
): Promise<{ user: User; token: string; rawPassword: string }> {
  const uniqueSuffix = randomUUID().slice(0, 8);
  const rawPassword = overrides?.password ?? "SecureP@ssw0rd!123";
  const passwordHash = await hashPassword(rawPassword);

  const user = await prisma.user.create({
    data: {
      name: overrides?.name ?? `Test User ${uniqueSuffix}`,
      email: overrides?.email ?? `test-${uniqueSuffix}@stockpilot-test.internal`,
      passwordHash,
      status: overrides?.status ?? "ACTIVE",
    },
  });

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  return { user, token, rawPassword };
}

/**
 * Creates a synthetic organization and assigns the given user as OWNER.
 */
export async function createTestOrganization(
  prisma: PrismaClient,
  ownerUserId: string,
  overrides?: Partial<{
    name: string;
    slug: string;
  }>,
): Promise<Organization> {
  const uniqueSuffix = randomUUID().slice(0, 8);
  const name = overrides?.name ?? `Test Org ${uniqueSuffix}`;
  const slug = overrides?.slug ?? `test-org-${uniqueSuffix}`;

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name,
        slug,
        status: "ACTIVE",
      },
    });

    await tx.organizationMembership.create({
      data: {
        userId: ownerUserId,
        organizationId: org.id,
        role: OrganizationRole.OWNER,
      },
    });

    return org;
  });
}

/**
 * Adds an existing user to an organization with a specific role.
 */
export async function addOrganizationMember(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  role: OrganizationRole,
) {
  return prisma.organizationMembership.create({
    data: {
      organizationId,
      userId,
      role,
    },
  });
}

/**
 * Creates a product category within an organization.
 */
export async function createTestCategory(
  prisma: PrismaClient,
  organizationId: string,
  overrides?: Partial<{ name: string; description: string }>,
): Promise<ProductCategory> {
  const uniqueSuffix = randomUUID().slice(0, 8);
  return prisma.productCategory.create({
    data: {
      organizationId,
      name: overrides?.name ?? `Category ${uniqueSuffix}`,
      description: overrides?.description ?? "Test Category Description",
    },
  });
}

/**
 * Creates a product in an organization with exact decimal monetary precision.
 */
export async function createTestProduct(
  prisma: PrismaClient,
  organizationId: string,
  overrides?: Partial<{
    sku: string;
    name: string;
    categoryId: string | null;
    unitOfMeasure: string;
    costPrice: string;
    sellingPrice: string;
    lowStockThreshold: number | null;
  }>,
): Promise<Product> {
  const uniqueSuffix = randomUUID().slice(0, 8);
  return prisma.product.create({
    data: {
      organizationId,
      sku: overrides?.sku ?? `SKU-${uniqueSuffix.toUpperCase()}`,
      name: overrides?.name ?? `Product ${uniqueSuffix}`,
      categoryId: overrides?.categoryId ?? null,
      unitOfMeasure: overrides?.unitOfMeasure ?? "UNIT",
      costPrice: new Prisma.Decimal(overrides?.costPrice ?? "10.0000"),
      sellingPrice: new Prisma.Decimal(overrides?.sellingPrice ?? "20.0000"),
      lowStockThreshold: overrides?.lowStockThreshold ?? 10,
      status: ProductStatus.ACTIVE,
    },
  });
}

/**
 * Creates a warehouse within an organization.
 */
export async function createTestWarehouse(
  prisma: PrismaClient,
  organizationId: string,
  overrides?: Partial<{ code: string; name: string }>,
): Promise<Warehouse> {
  const uniqueSuffix = randomUUID().slice(0, 6);
  return prisma.warehouse.create({
    data: {
      organizationId,
      code: overrides?.code ?? `WH-${uniqueSuffix.toUpperCase()}`,
      name: overrides?.name ?? `Warehouse ${uniqueSuffix}`,
      status: WarehouseStatus.ACTIVE,
    },
  });
}

/**
 * Creates a storage location within a warehouse.
 */
export async function createTestLocation(
  prisma: PrismaClient,
  organizationId: string,
  warehouseId: string,
  overrides?: Partial<{ code: string; name: string }>,
): Promise<StorageLocation> {
  const uniqueSuffix = randomUUID().slice(0, 6);
  return prisma.storageLocation.create({
    data: {
      organizationId,
      warehouseId,
      code: overrides?.code ?? `LOC-${uniqueSuffix.toUpperCase()}`,
      name: overrides?.name ?? `Location ${uniqueSuffix}`,
      status: LocationStatus.ACTIVE,
    },
  });
}

/**
 * Creates a supplier within an organization.
 */
export async function createTestSupplier(
  prisma: PrismaClient,
  organizationId: string,
  overrides?: Partial<{ name: string; email: string }>,
): Promise<Supplier> {
  const uniqueSuffix = randomUUID().slice(0, 8);
  return prisma.supplier.create({
    data: {
      organizationId,
      name: overrides?.name ?? `Supplier ${uniqueSuffix}`,
      email: overrides?.email ?? `supplier-${uniqueSuffix}@test.internal`,
      isActive: true,
    },
  });
}

/**
 * Seeds initial inventory balance and ledger record atomically in PostgreSQL.
 */
export async function seedTestStock(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    warehouseId: string;
    locationId: string;
    productId: string;
    quantity: string;
    userId: string;
  },
) {
  const qtyDecimal = new Prisma.Decimal(params.quantity);

  return prisma.$transaction(async (tx) => {
    const balance = await tx.inventoryBalance.upsert({
      where: {
        productId_locationId: {
          productId: params.productId,
          locationId: params.locationId,
        },
      },
      create: {
        organizationId: params.organizationId,
        warehouseId: params.warehouseId,
        locationId: params.locationId,
        productId: params.productId,
        quantityOnHand: qtyDecimal,
      },
      update: {
        quantityOnHand: {
          increment: qtyDecimal,
        },
      },
    });

    const transaction = await tx.inventoryTransaction.create({
      data: {
        organizationId: params.organizationId,
        warehouseId: params.warehouseId,
        productId: params.productId,
        destinationLocationId: params.locationId,
        type: InventoryTransactionType.RECEIPT,
        quantity: qtyDecimal,
        quantityDelta: qtyDecimal,
        reference: "INITIAL-SEED",
        performedByUserId: params.userId,
      },
    });

    return { balance, transaction };
  });
}

