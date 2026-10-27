import type { Supplier } from "@prisma/client";

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Public DTO for Supplier entities.
 */
export interface SafeSupplierDto {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  address: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Paginated query result for suppliers.
 */
export interface PaginatedSuppliersResult {
  items: SafeSupplierDto[];
  pagination: PaginationMeta;
}

/**
 * Transforms a raw Prisma Supplier entity into a sanitized SafeSupplierDto.
 */
export function toSafeSupplier(supplier: Supplier): SafeSupplierDto {
  return {
    id: supplier.id,
    organizationId: supplier.organizationId,
    name: supplier.name,
    code: supplier.code,
    email: supplier.email,
    phone: supplier.phone,
    contactPerson: supplier.contactPerson,
    address: supplier.address,
    taxIdentifier: supplier.taxIdentifier,
    notes: supplier.notes,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

