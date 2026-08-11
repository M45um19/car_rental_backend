import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validateQuery } from '../../middleware/validation.middleware';
import { getRentalReportSchema } from './reports.validation';

export const createReportsRouter = (reportsController: ReportsController): Router => {
  const router = Router();

  // GET /reports/rentals?month=YYYY-MM&vehicle_id=
  router.get(
    '/rentals',
    authenticate,
    validateQuery(getRentalReportSchema),
    reportsController.getRentalReport,
  );

  return router;
};

export default createReportsRouter;
