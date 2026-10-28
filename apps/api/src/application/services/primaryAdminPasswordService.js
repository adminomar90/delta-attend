import bcrypt from 'bcryptjs';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { AppError } from '../../shared/errors.js';

// This is the primary administrator account provisioned in server.js.
export const PRIMARY_ADMIN_EMAIL = 'admin@delta.com';
const defaultUserRepository = new UserRepository();

export const verifyPrimaryAdminPassword = async ({ actor, password, userRepository = defaultUserRepository, maxFailures = 5, lockMinutes = 15 }) => {
  if (actor?.role !== 'GENERAL_MANAGER') throw new AppError('تأكيد الحذف متاح للمدير العام فقط', 403);
  if (typeof password !== 'string' || !password.length || password.length > 1024) throw new AppError('أدخل كلمة مرور الأدمن الرئيسي لتأكيد الحذف', 400);
  const requester = await userRepository.findById(actor.id);
  const admin = await userRepository.findByEmail(PRIMARY_ADMIN_EMAIL);
  if (!requester?.active || requester.deletedAt || requester.role !== 'GENERAL_MANAGER' || !admin?.active || admin.deletedAt || admin.role !== 'GENERAL_MANAGER') throw new AppError('تعذر التحقق من حساب الأدمن الرئيسي', 403);
  if (requester.lockedUntil > new Date() || admin.lockedUntil > new Date()) throw new AppError('الحساب مقفل مؤقتاً بسبب محاولات غير صحيحة؛ حاول لاحقاً', 423);
  if (!await bcrypt.compare(password, admin.passwordHash)) {
    const updated = await userRepository.incrementAuthFailures(requester._id);
    if (updated.authFailureCount >= maxFailures) {
      await userRepository.lockUser(requester._id, new Date(Date.now() + lockMinutes * 60000));
      throw new AppError(`تم قفل حسابك مؤقتاً لمدة ${lockMinutes} دقيقة بسبب محاولات تأكيد غير صحيحة`, 423);
    }
    throw new AppError('كلمة مرور الأدمن الرئيسي غير صحيحة', 403);
  }
  await userRepository.clearAuthFailures(requester._id);
  return { authorizedBy: String(admin._id) };
};
