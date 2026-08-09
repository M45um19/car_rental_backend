import { Router } from 'express';
import db from './config/db';
import { AuthRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthCache } from './modules/auth/auth.cache';
import { VehiclesRepository } from './modules/vehicles/vehicles.repository';
import { VehiclesService } from './modules/vehicles/vehicles.service';
import { VehiclesController } from './modules/vehicles/vehicles.controller';
import { createVehiclesRouter } from './modules/vehicles/vehicles.routes';
import { VehiclesCache } from './modules/vehicles/vehicles.cache';

class AppContainer {
  private static instance: AppContainer;

  public authRepository: AuthRepository;
  public authCache: AuthCache;
  public authService: AuthService;
  public authController: AuthController;
  public authRouter: Router;

  public vehiclesRepository: VehiclesRepository;
  public vehiclesCache: VehiclesCache;
  public vehiclesService: VehiclesService;
  public vehiclesController: VehiclesController;
  public vehiclesRouter: Router;

  private constructor() {
    this.authRepository = new AuthRepository(db);
    this.authCache = new AuthCache();
    this.authService = new AuthService(this.authRepository, this.authCache);
    this.authController = new AuthController(this.authService);
    this.authRouter = createAuthRouter(this.authController);

    this.vehiclesRepository = new VehiclesRepository();
    this.vehiclesCache = new VehiclesCache();
    this.vehiclesService = new VehiclesService(this.vehiclesRepository, this.vehiclesCache);
    this.vehiclesController = new VehiclesController(this.vehiclesService);
    this.vehiclesRouter = createVehiclesRouter(this.vehiclesController);
  }

  public static getInstance(): AppContainer {
    if (!AppContainer.instance) {
      AppContainer.instance = new AppContainer();
    }
    return AppContainer.instance;
  }
}

export const container = AppContainer.getInstance();
export default container;
