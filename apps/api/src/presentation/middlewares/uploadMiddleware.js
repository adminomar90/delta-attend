import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../../config/env.js';

const uploadDir = path.resolve(process.cwd(), env.uploadsDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/\s+/g, '-')}`;
    cb(null, safeName);
  },
});

const allowedAvatarMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const avatarFilter = (_req, file, cb) => {
  if (!allowedAvatarMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
    cb(new Error('Only JPG, PNG, and WEBP avatar uploads are allowed'));
    return;
  }
  cb(null, true);
};

export const uploadAvatarMiddleware = multer({
  storage: diskStorage,
  fileFilter: avatarFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadDocumentMiddleware = multer({
  storage: diskStorage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const workReportImageFilter = (_req, file, cb) => {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif']);
  if (!file.mimetype.startsWith('image/') && !allowed.has(String(file.mimetype || '').toLowerCase())) {
    cb(new Error('نوع الملف غير مدعوم – يُسمح فقط بالصور (JPG, PNG, WEBP, GIF)'));
    return;
  }
  cb(null, true);
};

export const uploadWorkReportImagesMiddleware = multer({
  storage: diskStorage,
  fileFilter: workReportImageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 50,
  },
});

export const uploadImportFileMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const blockedNetworkAttachmentMimeTypes = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
]);

const networkAttachmentFilter = (_req, file, cb) => {
  const mimeType = String(file.mimetype || '').toLowerCase();
  if (blockedNetworkAttachmentMimeTypes.has(mimeType)) {
    cb(new Error('This file type is not allowed'));
    return;
  }

  cb(null, true);
};

export const uploadNetworkAttachmentMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter: networkAttachmentFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
  },
});
