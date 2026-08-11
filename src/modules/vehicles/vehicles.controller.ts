import { Request, Response, NextFunction } from 'express';
import { VehiclesService } from './vehicles.service';
import { sendResponse } from '../../utils/sendResponse';

export class VehiclesController {
  private vehiclesService: VehiclesService;

  constructor(vehiclesService: VehiclesService) {
    this.vehiclesService = vehiclesService;
  }

  public createVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.vehiclesService.createVehicle(req.body, req.file || null);
      sendResponse(res, 201, 'Vehicle created successfully', result);
    } catch (err) {
      next(err);
    }
  };

  public getVehicleById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        sendResponse(res, 400, 'Invalid vehicle ID parameter');
        return;
      }
      const result = await this.vehiclesService.getVehicleById(id);
      sendResponse(res, 200, 'Vehicle fetched successfully', result);
    } catch (err) {
      next(err);
    }
  };

  public getVehiclesList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
      const category = req.query.category ? String(req.query.category) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;

      const result = await this.vehiclesService.getVehiclesList({
        limit,
        cursor,
        category,
        search,
      });

      sendResponse(res, 200, 'Vehicles list fetched successfully', result);
    } catch (err) {
      next(err);
    }
  };

  public updateVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        sendResponse(res, 400, 'Invalid vehicle ID parameter');
        return;
      }
      const result = await this.vehiclesService.updateVehicle(id, req.body, req.file || null);
      sendResponse(res, 200, 'Vehicle updated successfully', result);
    } catch (err) {
      next(err);
    }
  };

  public deleteVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        sendResponse(res, 400, 'Invalid vehicle ID parameter');
        return;
      }
      await this.vehiclesService.deleteVehicle(id);
      sendResponse(res, 200, 'Vehicle deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}
