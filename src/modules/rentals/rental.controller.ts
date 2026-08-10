import { Request, Response, NextFunction } from 'express';
import { RentalService } from './rental.service';
import { sendResponse } from '../../utils/sendResponse';

export class RentalController {
  private rentalService: RentalService;

  constructor(rentalService: RentalService) {
    this.rentalService = rentalService;
  }

  public createRental = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.rentalService.createRental(req.body);
      sendResponse(res, 201, 'Rental booking submitted successfully', result);
    } catch (error) {
      next(error);
    }
  };

  public getRentalsList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
      const vehicle_id = req.query.vehicle_id ? Number(req.query.vehicle_id) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const start_date = req.query.start_date ? String(req.query.start_date) : undefined;
      const end_date = req.query.end_date ? String(req.query.end_date) : undefined;

      const result = await this.rentalService.getRentalsList({
        limit,
        cursor,
        vehicle_id,
        status,
        start_date,
        end_date,
      });

      sendResponse(res, 200, 'Rentals list fetched successfully', result);
    } catch (error) {
      next(error);
    }
  };

  public getRentalById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        sendResponse(res, 400, 'Invalid rental ID parameter');
        return;
      }
      const result = await this.rentalService.getRentalById(id);
      sendResponse(res, 200, 'Rental fetched successfully', result);
    } catch (error) {
      next(error);
    }
  };

  public updateRental = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        sendResponse(res, 400, 'Invalid rental ID parameter');
        return;
      }
      const result = await this.rentalService.updateRental(id, req.body);
      sendResponse(res, 200, 'Rental updated successfully', result);
    } catch (error) {
      next(error);
    }
  };

  public deleteRental = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        sendResponse(res, 400, 'Invalid rental ID parameter');
        return;
      }
      const result = await this.rentalService.deleteRental(id);
      sendResponse(res, 200, result.message);
    } catch (error) {
      next(error);
    }
  };
}
