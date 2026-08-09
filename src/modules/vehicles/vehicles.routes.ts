import { Router } from 'express';
import { VehiclesController } from './vehicles.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { upload } from '../../middleware/upload.middleware';
import { validateBody } from '../../middleware/validation.middleware';
import { createVehicleSchema } from './vehicles.validation';

export const createVehiclesRouter = (vehiclesController: VehiclesController): Router => {
  const router = Router();

  // POST /api/vehicles
  router.post(
    '/',
    authenticate,
    upload.single('photo'),
    validateBody(createVehicleSchema),
    vehiclesController.createVehicle,
  );

  // GET /api/vehicles
  router.get('/', vehiclesController.getVehiclesList);

  // GET /api/vehicles/:id
  router.get('/:id', vehiclesController.getVehicleById);

  return router;
};

export default createVehiclesRouter;
