import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { authCache } from '../modules/auth/auth.cache';
import { AppError } from '../utils/appError';

interface IDecodedToken {
  id: number;
  email: string;
  name: string;
  deviceId: string;
}

// Extend Express Request namespace to include user info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: IDecodedToken;
    }
  }
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token required', 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('Invalid authorization header structure', 401);
    }

    let decoded: IDecodedToken;
    try {
      decoded = jwt.verify(token, env.jwtAccessSecret) as IDecodedToken;
    } catch {
      throw new AppError('Invalid or expired access token', 401);
    }

    // Verify stateful session exists in Redis
    const sessionExists = await authCache.hasSession(decoded.id, decoded.deviceId);
    if (!sessionExists) {
      throw new AppError('Session has expired or been logged out', 401);
    }

    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
};

export default authenticate;
