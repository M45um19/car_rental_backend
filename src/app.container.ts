import { Router } from 'express';
import db from './config/db';
import { AuthRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { createAuthRouter } from './modules/auth/auth.routes';

class AppContainer {
  private static instance: AppContainer;

  public authRepository: AuthRepository;
  public authService: AuthService;
  public authController: AuthController;
  public authRouter: Router;

  private constructor() {
    this.authRepository = new AuthRepository(db);
    this.authService = new AuthService(this.authRepository);
    this.authController = new AuthController(this.authService);
    this.authRouter = createAuthRouter(this.authController);
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
