import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import { env } from './config/env.js';
import routes from './presentation/routes/index.js';
import { errorHandler, notFoundHandler } from './presentation/middlewares/errorHandler.js';

export const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: env.mongoUri,
      collectionName: 'sessions',
      ttl: env.sessionMaxAgeDays * 24 * 60 * 60,
    }),
    cookie: {
      maxAge: env.sessionMaxAgeDays * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
    },
  }),
);

app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadsDir)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'delta-plus-api' });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);
