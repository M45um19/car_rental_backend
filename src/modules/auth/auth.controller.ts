import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { sendResponse } from '../../utils/sendResponse';

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
      const deviceName = req.body.deviceName || req.headers['user-agent'] || 'unknown';

      const result = await this.authService.login(req.body, { ip, deviceName });
      sendResponse(res, 200, 'Login successful', result);
    } catch (err) {
      next(err);
    }
  };
}
