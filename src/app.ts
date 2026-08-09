import express, { Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { container } from './app.container';
import { errorHandler } from './middleware/error.middleware';
import swaggerSpec from './config/swagger';
import { env } from './config/env';

export const createApp = (): Express => {
  const app = express();

  // Common Middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files for vehicle uploads
  app.use('/uploads', express.static(env.uploadPath));

  // API Documentation Route
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Routes
  app.use('/api/auth', container.authRouter);
  app.use('/api/vehicles', container.vehiclesRouter);

  // Health check route
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
};

export default createApp;
