import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Handle unique constraint violations or database errors gracefully if we want
  // e.g. pg error code 23505 is unique_violation
  if ('code' in err && err.code === '23505') {
    res.status(409).json({
      success: false,
      message: 'Conflict: Record with duplicate unique fields already exists',
    });
    return;
  }

  console.error('Unhandled Exception:', err);

  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};

export default errorHandler;
