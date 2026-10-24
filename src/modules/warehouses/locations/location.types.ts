import type { StorageLocation } from "@prisma/client";

export const LocationStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export type LocationStatus = (typeof LocationStatus)[keyof typeof LocationStatus];

export interface SafeStorageLocationDto {
  id: string;
  organizationId: string;
  warehouseId: string;
  code: string;
  name: string;
  description: string | null;
  type: string | null;
  status: LocationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedLocationsResult {
  items: SafeStorageLocationDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function toSafeLocation(location: StorageLocation): SafeStorageLocationDto {
  return {
    id: location.id,
    organizationId: location.organizationId,
    warehouseId: location.warehouseId,
    code: location.code,
    name: location.name,
    description: location.description,
    type: location.type,
    status: location.status,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}
