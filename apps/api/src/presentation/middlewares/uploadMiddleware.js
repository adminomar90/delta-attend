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
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('Only image uploads are allowed for work report images'));
    return;
  }
  cb(null, true);
};

export const uploadWorkReportImagesMiddleware = multer({
  storage: diskStorage,
  fileFilter: workReportImageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});

export const uploadImportFileMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
