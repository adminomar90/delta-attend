import { AppError } from '../../shared/errors.js';

const resolveMulterMessage = (err) => {
  const field = String(err.field || '').trim();

  if (err.code === 'LIMIT_FILE_SIZE') {
    if (field === 'attachments') {
      return 'حجم الملف كبير جدًا - الحد الأقصى 50 ميجابايت لكل مرفق مالي';
    }
    if (field === 'images') {
      return 'حجم الملف كبير جدًا - الحد الأقصى 10 ميجابايت لكل صورة';
    }
    return 'حجم الملف كبير جدًا';
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    if (field === 'attachments') {
      return 'عدد الملفات تجاوز الحد الأقصى المسموح (20 مرفقًا)';
    }
    if (field === 'images') {
      return 'عدد الملفات تجاوز الحد الأقصى المسموح (10 صور)';
    }
    return 'عدد الملفات تجاوز الحد المسموح';
  }

  const multerMessages = {
    LIMIT_UNEXPECTED_FILE: 'حقل رفع الملف غير متوقع',
    LIMIT_PART_COUNT: 'عدد أجزاء الطلب تجاوز الحد المسموح',
    LIMIT_FIELD_KEY: 'اسم الحقل طويل جدًا',
    LIMIT_FIELD_VALUE: 'قيمة الحقل طويلة جدًا',
    LIMIT_FIELD_COUNT: 'عدد الحقول تجاوز الحد المسموح',
  };

  return multerMessages[err.code] || err.message || 'خطأ في رفع الملف';
};

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
    console.error('[Upload Error]', err.code, err.field, err.message);
    return res.status(400).json({
      message: resolveMulterMessage(err),
    });
  }

  if (err.message?.includes('upload') || err.message?.includes('image') || err.message?.includes('نوع الملف')) {
    console.error('[Upload Filter Error]', err.message);
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
