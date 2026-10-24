import { type PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError, BadRequestError } from "../../../common/errors/http-errors";
import { logger } from "../../../infrastructure/logging/logger";
import type {
  CreateLocationInput,
  UpdateLocationInput,
  ListLocationsQuery,
} from "./location.schema";
import {
  toSafeLocation,
  type SafeStorageLocationDto,
  type PaginatedLocationsResult,
  LocationStatus,
} from "./location.types";
import { WarehouseStatus } from "../warehouses/warehouse.types";

/**
 * Service managing storage locations within warehouses with multi-tenant isolation,
 * code uniqueness per warehouse, and inactive warehouse guard rules.
 */
export class LocationService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * Creates a new storage location in an active warehouse.
   * Enforces warehouse active status and warehouse-scoped code uniqueness.
   */
  public async createLocation(
    organizationId: string,
    warehouseId: string,
    input: CreateLocationInput,
  ): Promise<SafeStorageLocationDto> {
    // 1. Verify parent warehouse exists in the organization
    const warehouse = await this.db.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId,
      },
    });

    if (!warehouse) {
      throw new NotFoundError("Warehouse not found.");
    }

    if (warehouse.status === WarehouseStatus.INACTIVE) {
      throw new BadRequestError(
        "Cannot create a storage location in an inactive warehouse. Reactivate the warehouse first.",
      );
    }

    // 2. Normalize and verify code uniqueness within the warehouse
    const normalizedCode = input.code.trim().toUpperCase();

    const existingCode = await this.db.storageLocation.findFirst({
      where: {
        warehouseId,
        code: normalizedCode,
      },
    });

    if (existingCode) {
      throw new ConflictError(
        `A storage location with code '${normalizedCode}' already exists in this warehouse.`,
      );
    }

    // 3. Create storage location
    const location = await this.db.storageLocation.create({
      data: {
        organizationId,
        warehouseId,
        code: normalizedCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        type: input.type?.trim().toUpperCase() || null,
        status: LocationStatus.ACTIVE,
      },
    });

    logger.info(
      { organizationId, warehouseId, locationId: location.id, code: normalizedCode },
      "Storage location created successfully",
    );
    return toSafeLocation(location);
  }

  /**
   * Retrieves a single storage location by ID scoped to the warehouse and organization.
   */
  public async getLocationById(
    organizationId: string,
    warehouseId: string,
    locationId: string,
  ): Promise<SafeStorageLocationDto> {
    const location = await this.db.storageLocation.findFirst({
      where: {
        id: locationId,
        warehouseId,
        organizationId,
      },
    });

    if (!location) {
      throw new NotFoundError("Storage location not found.");
    }

    return toSafeLocation(location);
  }

  /**
   * Lists storage locations within a warehouse with search, filtering, and pagination.
   */
  public async listLocations(
    organizationId: string,
    warehouseId: string,
    query: ListLocationsQuery,
  ): Promise<PaginatedLocationsResult> {
    // Verify parent warehouse belongs to organization
    const warehouse = await this.db.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId,
      },
    });

    if (!warehouse) {
      throw new NotFoundError("Warehouse not found.");
    }

    const { page, limit, search, type, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StorageLocationWhereInput = {
      organizationId,
      warehouseId,
      ...(status !== "ALL" && { status: status as LocationStatus }),
      ...(type && { type: { equals: type.trim().toUpperCase(), mode: "insensitive" } }),
      ...(search && {
        OR: [
          { name: { contains: search.trim(), mode: "insensitive" } },
          { code: { contains: search.trim().toUpperCase(), mode: "insensitive" } },
        ],
      }),
    };

    const [totalItems, locations] = await Promise.all([
      this.db.storageLocation.count({ where }),
      this.db.storageLocation.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: locations.map(toSafeLocation),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Updates a storage location. Prevents activating a location if parent warehouse is inactive.
   */
  public async updateLocation(
    organizationId: string,
    warehouseId: string,
    locationId: string,
    input: UpdateLocationInput,
  ): Promise<SafeStorageLocationDto> {
    const existing = await this.db.storageLocation.findFirst({
      where: {
        id: locationId,
        warehouseId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Storage location not found.");
    }

    // If activating location, ensure warehouse is currently active
    if (input.status === LocationStatus.ACTIVE) {
      const warehouse = await this.db.warehouse.findFirst({
        where: {
          id: warehouseId,
          organizationId,
        },
      });

      if (!warehouse || warehouse.status === WarehouseStatus.INACTIVE) {
        throw new BadRequestError(
          "Cannot activate a storage location in an inactive warehouse. Reactivate the warehouse first.",
        );
      }
    }

    let normalizedCode: string | undefined;
    if (input.code !== undefined) {
      normalizedCode = input.code.trim().toUpperCase();
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.storageLocation.findFirst({
          where: {
            warehouseId,
            code: normalizedCode,
            NOT: { id: locationId },
          },
        });

        if (duplicate) {
          throw new ConflictError(
            `A storage location with code '${normalizedCode}' already exists in this warehouse.`,
          );
        }
      }
    }

    const updated = await this.db.storageLocation.update({
      where: { id: locationId },
      data: {
        ...(normalizedCode !== undefined && { code: normalizedCode }),
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description === null ? null : input.description.trim(),
        }),
        ...(input.type !== undefined && {
          type: input.type === null ? null : input.type.trim().toUpperCase(),
        }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });

    logger.info(
      { organizationId, warehouseId, locationId },
      "Storage location updated successfully",
    );
    return toSafeLocation(updated);
  }

  /**
   * Safely deactivates a storage location.
   */
  public async deactivateLocation(
    organizationId: string,
    warehouseId: string,
    locationId: string,
  ): Promise<SafeStorageLocationDto> {
    const existing = await this.db.storageLocation.findFirst({
      where: {
        id: locationId,
        warehouseId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Storage location not found.");
    }

    const deactivated = await this.db.storageLocation.update({
      where: { id: locationId },
      data: {
        status: LocationStatus.INACTIVE,
      },
    });

    logger.info({ organizationId, warehouseId, locationId }, "Storage location deactivated");
    return toSafeLocation(deactivated);
  }
}

export const locationService = new LocationService();
