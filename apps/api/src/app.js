import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env.js';
import routes from './presentation/routes/index.js';
import { errorHandler, notFoundHandler } from './presentation/middlewares/errorHandler.js';

export const app = express();

app.use(
  cors({
    origin: env.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadsDir)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'delta-plus-api' });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);
