import { authTokenService } from '../../application/services/authTokenService.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AppError } from '../../shared/errors.js';

const userRepository = new UserRepository();

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '').trim();
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return next(new AppError('Authentication required', 401));
  }

  try {
    const payload = authTokenService.verify(token);

    try {
      const user = await userRepository.findById(payload.sub || payload.id);
      if (!user || !user.active) {
        return next(new AppError('Invalid user session', 401));
      }

      if (payload.sv && user.sessionVersion && payload.sv !== user.sessionVersion) {
        return next(new AppError('Session expired. Please login again', 401));
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return next(new AppError('Account is temporarily locked', 423));
      }

      req.user = {
        id: String(user._id),
        role: user.role,
        fullName: user.fullName,
        email: user.email,
        pointsTotal: user.pointsTotal,
        level: user.level,
        workMinutesTotal: Number(user.workMinutesTotal || 0),
        customPermissions: user.customPermissions || [],
      };

      return next();
    } catch (dbError) {
      // Fallback mode if DB is unavailable but JWT is valid.
      req.user = {
        id: payload.sub || payload.id,
        role: payload.role,
        fullName: payload.name,
        email: payload.email,
        pointsTotal: payload.pointsTotal || 0,
        level: payload.level || 1,
        workMinutesTotal: Number(payload.workMinutesTotal || 0),
        customPermissions: payload.customPermissions || [],
      };
      return next();
    }
  } catch (error) {
    return next(new AppError('Invalid token', 401));
  }
};
