import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma.client";
import { NotFoundError, ConflictError } from "../../../common/errors/http-errors";
import { logger } from "../../../infrastructure/logging/logger";
import { AuditService } from "../../audit/audit.service";
import { AuditAction, AuditResourceType } from "../../audit/audit.types";
import {
  toSafeSupplier,
  type SafeSupplierDto,
  type PaginatedSuppliersResult,
} from "./supplier.types";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSuppliersQuery,
} from "./supplier.schema";

/**
 * Service orchestrating multi-tenant supplier management and catalog vendor operations.
 */
export class SupplierService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: PrismaClient = prisma,
    audit?: AuditService,
  ) {
    this.audit = audit ?? new AuditService(this.db);
  }

  /**
   * Creates a new supplier within an organization with normalized code uniqueness.
   */
  public async createSupplier(
    organizationId: string,
    input: CreateSupplierInput,
  ): Promise<SafeSupplierDto> {
    const normalizedCode = input.code ? input.code.trim().toUpperCase() : null;

    if (normalizedCode) {
      const existing = await this.db.supplier.findUnique({
        where: {
          organizationId_code: {
            organizationId,
            code: normalizedCode,
          },
        },
      });

      if (existing) {
        throw new ConflictError(
          `Supplier with code '${normalizedCode}' already exists in this organization.`,
        );
      }
    }

    const supplier = await this.db.supplier.create({
      data: {
        organizationId,
        name: input.name.trim(),
        code: normalizedCode,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        contactPerson: input.contactPerson?.trim() || null,
        address: input.address?.trim() || null,
        taxIdentifier: input.taxIdentifier?.trim() || null,
        notes: input.notes?.trim() || null,
        isActive: input.isActive ?? true,
      },
    });

    logger.info(
      { organizationId, supplierId: supplier.id, code: supplier.code },
      "Supplier created successfully",
    );

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.SUPPLIER_CREATED,
      resourceType: AuditResourceType.SUPPLIER,
      resourceId: supplier.id,
      metadata: { code: supplier.code, name: supplier.name },
    });

    return toSafeSupplier(supplier);
  }

  /**
   * Retrieves a single supplier by ID enforcing strict tenant isolation.
   */
  public async getSupplierById(
    organizationId: string,
    supplierId: string,
  ): Promise<SafeSupplierDto> {
    const supplier = await this.db.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId,
      },
    });

    if (!supplier) {
      throw new NotFoundError("Supplier not found in this organization.");
    }

    return toSafeSupplier(supplier);
  }

  /**
   * Retrieves a paginated list of suppliers with search and status filters.
   */
  public async listSuppliers(
    organizationId: string,
    query: ListSuppliersQuery,
  ): Promise<PaginatedSuppliersResult> {
    const { page, limit, search, isActive, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      organizationId,
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { contactPerson: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [totalItems, suppliers] = await Promise.all([
      this.db.supplier.count({ where }),
      this.db.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: suppliers.map(toSafeSupplier),
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
   * Updates an existing supplier within an organization with code collision checks.
   */
  public async updateSupplier(
    organizationId: string,
    supplierId: string,
    input: UpdateSupplierInput,
  ): Promise<SafeSupplierDto> {
    const existing = await this.db.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Supplier not found in this organization.");
    }

    let normalizedCode: string | null | undefined = undefined;
    if (input.code !== undefined) {
      normalizedCode = input.code ? input.code.trim().toUpperCase() : null;
      if (normalizedCode && normalizedCode !== existing.code) {
        const conflict = await this.db.supplier.findUnique({
          where: {
            organizationId_code: {
              organizationId,
              code: normalizedCode,
            },
          },
        });

        if (conflict && conflict.id !== supplierId) {
          throw new ConflictError(
            `Supplier with code '${normalizedCode}' already exists in this organization.`,
          );
        }
      }
    }

    const updated = await this.db.supplier.update({
      where: { id: supplierId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(normalizedCode !== undefined && { code: normalizedCode }),
        ...(input.email !== undefined && {
          email: input.email ? input.email.trim().toLowerCase() : null,
        }),
        ...(input.phone !== undefined && {
          phone: input.phone ? input.phone.trim() : null,
        }),
        ...(input.contactPerson !== undefined && {
          contactPerson: input.contactPerson ? input.contactPerson.trim() : null,
        }),
        ...(input.address !== undefined && {
          address: input.address ? input.address.trim() : null,
        }),
        ...(input.taxIdentifier !== undefined && {
          taxIdentifier: input.taxIdentifier ? input.taxIdentifier.trim() : null,
        }),
        ...(input.notes !== undefined && {
          notes: input.notes ? input.notes.trim() : null,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    logger.info(
      { organizationId, supplierId: updated.id, code: updated.code },
      "Supplier updated successfully",
    );

    const action =
      input.isActive === false ? AuditAction.SUPPLIER_DEACTIVATED : AuditAction.SUPPLIER_UPDATED;

    await this.audit.recordAudit({
      organizationId,
      action,
      resourceType: AuditResourceType.SUPPLIER,
      resourceId: updated.id,
      metadata: { code: updated.code, name: updated.name, isActive: updated.isActive },
    });

    return toSafeSupplier(updated);
  }

  /**
   * Soft-deactivates a supplier (isActive: false) to preserve historic procurement audit trails.
   */
  public async deactivateSupplier(
    organizationId: string,
    supplierId: string,
  ): Promise<SafeSupplierDto> {
    const existing = await this.db.supplier.findFirst({
      where: {
        id: supplierId,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Supplier not found in this organization.");
    }

    const updated = await this.db.supplier.update({
      where: { id: supplierId },
      data: { isActive: false },
    });

    logger.info({ organizationId, supplierId: updated.id }, "Supplier deactivated successfully");

    await this.audit.recordAudit({
      organizationId,
      action: AuditAction.SUPPLIER_DEACTIVATED,
      resourceType: AuditResourceType.SUPPLIER,
      resourceId: updated.id,
      metadata: { code: updated.code, name: updated.name, isActive: false },
    });

    return toSafeSupplier(updated);
  }
}

export const supplierService = new SupplierService();
