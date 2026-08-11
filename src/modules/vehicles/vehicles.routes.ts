import { Router } from 'express';
import { VehiclesController } from './vehicles.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { upload } from '../../middleware/upload.middleware';
import { validateBody } from '../../middleware/validation.middleware';
import { createVehicleSchema, updateVehicleSchema } from './vehicles.validation';

export const createVehiclesRouter = (vehiclesController: VehiclesController): Router => {
  const router = Router();

  // POST /api/vehicles (Staff only)
  router.post(
    '/',
    authenticate,
    upload.single('photo'),
    validateBody(createVehicleSchema),
    vehiclesController.createVehicle,
  );

  // GET /api/vehicles (Public)
  router.get('/', vehiclesController.getVehiclesList);

  // GET /api/vehicles/:id (Public)
  router.get('/:id', vehiclesController.getVehicleById);

  // PUT /api/vehicles/:id (Staff only)
  router.put(
    '/:id',
    authenticate,
    upload.single('photo'),
    validateBody(updateVehicleSchema),
    vehiclesController.updateVehicle,
  );

  // DELETE /api/vehicles/:id (Staff only)
  router.delete('/:id', authenticate, vehiclesController.deleteVehicle);

  return router;
};

export default createVehiclesRouter;
