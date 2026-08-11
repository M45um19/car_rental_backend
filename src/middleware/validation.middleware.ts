import { Request, Response, NextFunction } from 'express';
import { Schema } from 'joi';
import { AppError } from '../utils/appError';

export const validateBody = (schema: Schema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      next(new AppError(error.details[0].message, 400));
      return;
    }
    req.body = value;
    next();
  };
};

export const validateQuery = (schema: Schema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      convert: true,
      allowUnknown: true,
    });
    if (error) {
      next(new AppError(error.details[0].message, 400));
      return;
    }
    req.query = value;
    next();
  };
};
