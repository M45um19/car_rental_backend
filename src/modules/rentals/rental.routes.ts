import { Router } from 'express';
import { RentalController } from './rental.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validation.middleware';
import { createRentalSchema, updateRentalSchema } from './rental.validation';

export const createRentalsRouter = (rentalController: RentalController): Router => {
  const router = Router();

  // POST /api/rentals (Public / Staff)
  router.post('/', validateBody(createRentalSchema), rentalController.createRental);

  // GET /api/rentals (Staff authenticated - cursor paginated list)
  router.get('/', authenticate, rentalController.getRentalsList);

  // GET /api/rentals/:id (Staff authenticated)
  router.get('/:id', authenticate, rentalController.getRentalById);

  // PUT /api/rentals/:id (Staff authenticated)
  router.put('/:id', authenticate, validateBody(updateRentalSchema), rentalController.updateRental);

  // DELETE /api/rentals/:id (Staff authenticated)
  router.delete('/:id', authenticate, rentalController.deleteRental);

  return router;
};

export default createRentalsRouter;
