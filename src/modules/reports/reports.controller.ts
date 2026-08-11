import { Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service';
import { sendResponse } from '../../utils/sendResponse';

export class ReportsController {
  private reportsService: ReportsService;

  constructor(reportsService: ReportsService) {
    this.reportsService = reportsService;
  }

  public getRentalReport = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const month = String(req.query.month);
      const vehicleId = req.query.vehicle_id ? Number(req.query.vehicle_id) : undefined;

      const reportData = await this.reportsService.getRentalReport(month, vehicleId);
      sendResponse(res, 200, 'Rentals report fetched successfully', reportData);
    } catch (error) {
      next(error);
    }
  };
}
