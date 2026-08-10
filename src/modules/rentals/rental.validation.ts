import Joi from 'joi';

export const createRentalSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive().required().messages({
    'number.base': 'Vehicle ID must be a number',
    'number.positive': 'Vehicle ID must be a positive integer',
    'any.required': 'Vehicle ID is required',
  }),
  customer_name: Joi.string().trim().min(2).max(100).required().messages({
    'string.empty': 'Customer name cannot be empty',
    'any.required': 'Customer name is required',
  }),
  customer_phone: Joi.string().trim().min(5).max(20).required().messages({
    'string.empty': 'Customer phone cannot be empty',
    'any.required': 'Customer phone is required',
  }),
  start_date: Joi.string()
    .isoDate()
    .required()
    .messages({
      'string.isoDate': 'Start date must be a valid ISO date string (YYYY-MM-DD)',
      'any.required': 'Start date is required',
    }),
  end_date: Joi.string()
    .isoDate()
    .required()
    .custom((value, helpers) => {
      const { start_date } = helpers.state.ancestors[0];
      if (start_date && new Date(value) < new Date(start_date)) {
        return helpers.error('date.min');
      }
      return value;
    })
    .messages({
      'string.isoDate': 'End date must be a valid ISO date string (YYYY-MM-DD)',
      'date.min': 'End date must be on or after start date',
      'any.required': 'End date is required',
    }),
  total_amount: Joi.number().positive().required().messages({
    'number.positive': 'Total amount must be a positive number',
    'any.required': 'Total amount is required',
  }),
});
