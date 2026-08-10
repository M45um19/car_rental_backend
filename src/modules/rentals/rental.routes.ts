import { Router } from 'express';
import { RentalController } from './rental.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validation.middleware';
import { createRentalSchema } from './rental.validation';

export const createRentalsRouter = (rentalController: RentalController): Router => {
    const router = Router();

    // POST /api/rentals (public)
    router.post(
        '/',
        validateBody(createRentalSchema),
        rentalController.createRental,
    );

    // GET /api/rentals/:id (Staff authenticated)
    router.get(
        '/:id',
        authenticate,
        rentalController.getRentalById,
    );

    return router;
};

export default createRentalsRouter;
