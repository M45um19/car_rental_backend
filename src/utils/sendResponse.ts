import { Response } from 'express';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export const sendResponse = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
): void => {
  const responsePayload: ApiResponse<T> = {
    success: statusCode >= 200 && statusCode < 300,
    message,
    data,
  };
  res.status(statusCode).json(responsePayload);
};

export default sendResponse;
