import { AppError } from '../../shared/errors.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation error',
      details: Object.values(err.errors).map((item) => item.message),
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid resource identifier',
    });
  }

  if (err.code === 11000) {
    const key = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      message: `Duplicate value for ${key}`,
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      message: err.message || 'File upload error',
    });
  }

  if (err.message?.includes('upload')) {
    return res.status(400).json({
      message: err.message,
    });
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  return res.status(statusCode).json({
    message: err.message || 'Unexpected server error',
  });
};

export const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

