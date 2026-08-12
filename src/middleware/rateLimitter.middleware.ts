import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';
import { AppError } from '../utils/appError';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
  message?: string;
}

export const createRateLimiter = (options: RateLimiterOptions = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // Default 15 minutes
  const windowSec = Math.ceil(windowMs / 1000);
  const max = options.max || 5;
  const keyPrefix = options.keyPrefix || 'rl:';
  const message =
    options.message || 'Too many requests, please try again later.';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        'unknown';
      const key = `${keyPrefix}${clientIp}`;

      if (!redisClient.isOpen) {
        // Fallback gracefully if Redis client is not connected
        return next();
      }

      const currentRequests = await redisClient.incr(key);

      if (currentRequests === 1) {
        await redisClient.expire(key, windowSec);
      }

      const ttl = await redisClient.ttl(key);
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - currentRequests));
      res.setHeader('X-RateLimit-Reset', resetTime.toUTCString());

      if (currentRequests > max) {
        if (ttl > 0) {
          res.setHeader('Retry-After', ttl);
        }
        return next(new AppError(message, 429));
      }

      next();
    } catch (error) {
      console.error('Rate limiter Redis error:', error);
      // Graceful fallback if Redis encounters an issue
      next();
    }
  };
};

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  keyPrefix: 'rl:login:',
  message: 'Too many login attempts, please try again after 15 minutes',
});

export default loginRateLimiter;
