import type { Request, Response, NextFunction } from "express";
import { HttpStatus } from "../../../common/constants/http-status";
import { sendSuccess } from "../../../common/utils/response.util";
import { LocationService, locationService } from "./location.service";
import type {
  CreateLocationInput,
  UpdateLocationInput,
  ListLocationsQuery,
} from "./location.schema";

/**
 * Controller handling storage location endpoints.
 */
export class LocationController {
  constructor(private readonly service: LocationService = locationService) {}

  /**
   * POST /api/v1/organizations/:organizationId/warehouses/:warehouseId/locations
   */
  public createLocation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;
      const input = req.body as CreateLocationInput;

      const location = await this.service.createLocation(organizationId, warehouseId, input);
      sendSuccess(res, location, HttpStatus.CREATED);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/warehouses/:warehouseId/locations/:locationId
   */
  public getLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;
      const locationId = req.params["locationId"] as string;

      const location = await this.service.getLocationById(organizationId, warehouseId, locationId);
      sendSuccess(res, location, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/organizations/:organizationId/warehouses/:warehouseId/locations
   */
  public listLocations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;
      const query = req.query as unknown as ListLocationsQuery;

      const result = await this.service.listLocations(organizationId, warehouseId, query);
      sendSuccess(res, result, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/organizations/:organizationId/warehouses/:warehouseId/locations/:locationId
   */
  public updateLocation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;
      const locationId = req.params["locationId"] as string;
      const input = req.body as UpdateLocationInput;

      const location = await this.service.updateLocation(
        organizationId,
        warehouseId,
        locationId,
        input,
      );
      sendSuccess(res, location, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/organizations/:organizationId/warehouses/:warehouseId/locations/:locationId (Deactivate)
   */
  public deactivateLocation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const organizationId = req.params["organizationId"] as string;
      const warehouseId = req.params["warehouseId"] as string;
      const locationId = req.params["locationId"] as string;

      const location = await this.service.deactivateLocation(
        organizationId,
        warehouseId,
        locationId,
      );
      sendSuccess(res, location, HttpStatus.OK);
    } catch (error) {
      next(error);
    }
  };
}

export const locationController = new LocationController();
