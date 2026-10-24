import type { Warehouse } from "@prisma/client";

export const WarehouseStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export type WarehouseStatus = (typeof WarehouseStatus)[keyof typeof WarehouseStatus];

export interface SafeWarehouseDto {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  status: WarehouseStatus;
  createdAt: string;
  updatedAt: string;
  locationCount?: number;
}

export interface PaginatedWarehousesResult {
  items: SafeWarehouseDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function toSafeWarehouse(
  warehouse: Warehouse & { _count?: { locations: number } },
): SafeWarehouseDto {
  return {
    id: warehouse.id,
    organizationId: warehouse.organizationId,
    code: warehouse.code,
    name: warehouse.name,
    description: warehouse.description,
    addressLine1: warehouse.addressLine1,
    addressLine2: warehouse.addressLine2,
    city: warehouse.city,
    state: warehouse.state,
    postalCode: warehouse.postalCode,
    country: warehouse.country,
    status: warehouse.status,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
    ...(warehouse._count !== undefined && { locationCount: warehouse._count.locations }),
  };
}
