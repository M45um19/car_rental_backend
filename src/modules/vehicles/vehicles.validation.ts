import Joi from 'joi';

export const createVehicleSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  plate_number: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9-]+$/)
    .max(20)
    .required(),
  category: Joi.string().trim().max(50).required(),
  daily_rate: Joi.number().precision(2).positive().required(),
});
