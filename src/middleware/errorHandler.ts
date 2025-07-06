import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // 设置默认错误状态码
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  // 记录错误日志
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // 发送错误响应
  res.status(statusCode).json({
    status,
    statusCode,
    message: err.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export const createError = (statusCode: number, message: string): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  error.isOperational = true;
  return error;
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 