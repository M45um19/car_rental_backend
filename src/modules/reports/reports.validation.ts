import Joi from 'joi';

export const getRentalReportSchema = Joi.object({
  month: Joi.string()
    .pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
    .required()
    .messages({
      'string.pattern.base': 'Month must be in YYYY-MM format',
      'any.required': 'Month query parameter is required',
    }),
  vehicle_id: Joi.number().integer().positive().optional(),
});
