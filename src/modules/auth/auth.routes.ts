import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateBody } from '../../middleware/validation.middleware';
import { loginSchema } from './auth.validation';

export const createAuthRouter = (authController: AuthController): Router => {
  const router = Router();
  router.post('/login', validateBody(loginSchema), authController.login);
  return router;
};

export default createAuthRouter;
