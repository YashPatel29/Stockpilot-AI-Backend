import { type PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError } from "../../../common/errors/http-errors";
import { logger } from "../../../infrastructure/logging/logger";
import { AuditService } from "../../audit/audit.service";
import { AuditAction, AuditResourceType } from "../../audit/audit.types";
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  ListWarehousesQuery,
} from "./warehouse.schema";
import {
  toSafeWarehouse,
  type SafeWarehouseDto,
  type PaginatedWarehousesResult,
  WarehouseStatus,
} from "./warehouse.types";
import { LocationStatus } from "../locations/location.types";

/**
 * Service managing warehouse facilities with strict tenant isolation,
 * code uniqueness per organization, and atomic cascade deactivation.
 */
export class WarehouseService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient = prisma,
    audit?: AuditService,
  ) {
    this.audit = audit ?? new AuditService(this.db);
  }

  /**
   * Creates a new warehouse facility in the organization.
   * Enforces tenant-scoped uppercase warehouse code uniqueness.
   */
  public async createWarehouse(
    organizationId: string,
    input: CreateWarehouseInput,
  ): Promise<SafeWarehouseDto> {
    const normalizedCode = input.code.trim().toUpperCase();

    const existing = await this.db.warehouse.findFirst({
      where: {
        organizationId,
        code: normalizedCode,
      },
    });

    if (existing) {
      throw new ConflictError(
        `A warehouse with code '${normalizedCode}' already exists in this organization.`,
      );
    }

    const warehouse = await this.db.warehouse.create({
      data: {
        organizationId,
        code: normalizedCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        addressLine1: input.addressLine1?.trim() || null,
        addressLine2: input.addressLine2?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        country: input.country?.trim() || null,
        status: WarehouseStatus.ACTIVE,
      },
      include: {
        _count: {
          select: { locations: true },
        },
      },
    });

    logger.info(
      { organizationId, warehouseId: warehouse.id, code: normalizedCode },
      "Warehouse created successfully",
    );

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.WAREHOUSE_CREATED,
      resourceType: AuditResourceType.WAREHOUSE,
      resourceId: warehouse.id,
      metadata: { code: normalizedCode, name: warehouse.name },
    });

    return toSafeWarehouse(warehouse);
  }

  /**
   * Retrieves a single warehouse by ID scoped to the organization.
   */
  public async getWarehouseById(
    organizationId: string,
    warehouseId: string,
  ): Promise<SafeWarehouseDto> {
    const warehouse = await this.db.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId,
      },
      include: {
        _count: {
          select: { locations: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundError("Warehouse not found.");
    }

    return toSafeWarehouse(warehouse);
  }

  /**
   * Lists warehouses with tenant-scoped filtering, search across code/name,
   * status filtering, allowlisted sorting, and pagination.
   */
  public async listWarehouses(
    organizationId: string,
    query: ListWarehousesQuery,
  ): Promise<PaginatedWarehousesResult> {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = {
      organizationId,
      ...(status !== "ALL" && { status: status as WarehouseStatus }),
      ...(search && {
        OR: [
          { name: { contains: search.trim(), mode: "insensitive" } },
          { code: { contains: search.trim().toUpperCase(), mode: "insensitive" } },
        ],
      }),
    };

    const [totalItems, warehouses] = await Promise.all([
      this.db.warehouse.count({ where }),
      this.db.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          _count: {
            select: { locations: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: warehouses.map(toSafeWarehouse),
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
   * Updates warehouse details. If transitioning status to INACTIVE,
   * atomically cascade-deactivates all child storage locations.
   */
  public async updateWarehouse(
    organizationId: string,
    warehouseId: string,
    input: UpdateWarehouseInput,
  ): Promise<SafeWarehouseDto> {
    const existing = await this.db.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Warehouse not found.");
    }

    let normalizedCode: string | undefined;
    if (input.code !== undefined) {
      normalizedCode = input.code.trim().toUpperCase();
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.warehouse.findFirst({
          where: {
            organizationId,
            code: normalizedCode,
            NOT: { id: warehouseId },
          },
        });

        if (duplicate) {
          throw new ConflictError(
            `A warehouse with code '${normalizedCode}' already exists in this organization.`,
          );
        }
      }
    }

    const data: Prisma.WarehouseUpdateInput = {
      ...(normalizedCode !== undefined && { code: normalizedCode }),
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description === null ? null : input.description.trim(),
      }),
      ...(input.addressLine1 !== undefined && {
        addressLine1: input.addressLine1 === null ? null : input.addressLine1.trim(),
      }),
      ...(input.addressLine2 !== undefined && {
        addressLine2: input.addressLine2 === null ? null : input.addressLine2.trim(),
      }),
      ...(input.city !== undefined && {
        city: input.city === null ? null : input.city.trim(),
      }),
      ...(input.state !== undefined && {
        state: input.state === null ? null : input.state.trim(),
      }),
      ...(input.postalCode !== undefined && {
        postalCode: input.postalCode === null ? null : input.postalCode.trim(),
      }),
      ...(input.country !== undefined && {
        country: input.country === null ? null : input.country.trim(),
      }),
      ...(input.status !== undefined && { status: input.status }),
    };

    // If deactivating warehouse, cascade deactivation to active locations in atomic transaction
    if (input.status === WarehouseStatus.INACTIVE) {
      const [_, updated] = await this.db.$transaction([
        this.db.storageLocation.updateMany({
          where: {
            warehouseId,
            organizationId,
            status: LocationStatus.ACTIVE,
          },
          data: {
            status: LocationStatus.INACTIVE,
          },
        }),
        this.db.warehouse.update({
          where: { id: warehouseId },
          data,
          include: {
            _count: {
              select: { locations: true },
            },
          },
        }),
      ]);

      logger.info({ organizationId, warehouseId }, "Warehouse and child locations deactivated");

      await this.audit.recordAudit({
        organizationId,
        action: AuditAction.WAREHOUSE_DEACTIVATED,
        resourceType: AuditResourceType.WAREHOUSE,
        resourceId: updated.id,
        metadata: { code: updated.code, name: updated.name, status: updated.status },
      });

      return toSafeWarehouse(updated);
    }

    const updated = await this.db.warehouse.update({
      where: { id: warehouseId },
      data,
      include: {
        _count: {
          select: { locations: true },
        },
      },
    });

    logger.info({ organizationId, warehouseId }, "Warehouse updated successfully");

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.WAREHOUSE_UPDATED,
      resourceType: AuditResourceType.WAREHOUSE,
      resourceId: updated.id,
      metadata: { code: updated.code, name: updated.name, status: updated.status },
    });

    return toSafeWarehouse(updated);
  }

  /**
   * Safely deactivates a warehouse and cascade-deactivates all active child storage locations.
   */
  public async deactivateWarehouse(
    organizationId: string,
    warehouseId: string,
  ): Promise<SafeWarehouseDto> {
    const existing = await this.db.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Warehouse not found.");
    }

    const [_, deactivated] = await this.db.$transaction([
      this.db.storageLocation.updateMany({
        where: {
          warehouseId,
          organizationId,
          status: LocationStatus.ACTIVE,
        },
        data: {
          status: LocationStatus.INACTIVE,
        },
      }),
      this.db.warehouse.update({
        where: { id: warehouseId },
        data: {
          status: WarehouseStatus.INACTIVE,
        },
        include: {
          _count: {
            select: { locations: true },
          },
        },
      }),
    ]);

    logger.info(
      { organizationId, warehouseId },
      "Warehouse safely deactivated with cascading location deactivation",
    );

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.WAREHOUSE_DEACTIVATED,
      resourceType: AuditResourceType.WAREHOUSE,
      resourceId: deactivated.id,
      metadata: { code: deactivated.code, name: deactivated.name, status: deactivated.status },
    });

    return toSafeWarehouse(deactivated);
  }
}

export const warehouseService = new WarehouseService();
