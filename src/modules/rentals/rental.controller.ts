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
}
