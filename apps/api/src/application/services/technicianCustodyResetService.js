import { createHash } from 'node:crypto';
import { Roles } from '../../shared/constants.js';
import { AppError } from '../../shared/errors.js';

export const RESETTABLE_CUSTODY_STATUSES = ['OPEN', 'PENDING_RECONCILIATION', 'PARTIALLY_RECONCILED', 'OVERDUE'];
export const UNASSIGNED_TECHNICIAN_ID = 'unassigned';

const assertResetAllowed = (user) => {
  if (user?.role !== Roles.GENERAL_MANAGER) throw new AppError('تهيئة ذمم الفنيين متاحة للمدير العام حصراً', 403);
};

export const previewTechnicianCustodyReset = async ({ user, technicianId, repository, findUser }) => {
  assertResetAllowed(user);
  const unassigned = technicianId === UNASSIGNED_TECHNICIAN_ID;
  const technician = unassigned ? { _id: UNASSIGNED_TECHNICIAN_ID, fullName: 'ذمم بدون فني' } : await findUser(technicianId);
  if (!technician) throw new AppError('الفني غير موجود', 404);
  const records = await repository.findResettableTechnicianCustodies(unassigned ? null : technicianId, RESETTABLE_CUSTODY_STATUSES);
  const custodies = records.map((custody) => ({
    id: String(custody._id), custodyNo: custody.custodyNo, status: custody.status,
    itemsCount: (custody.items || []).length,
    remainingQty: (custody.items || []).reduce((sum, item) => sum + Number(item.remainingQty || 0), 0),
    updatedAt: custody.updatedAt,
  }));
  const previewToken = createHash('sha256').update(JSON.stringify({ technicianId: String(technicianId),
    custodies: custodies.map((custody) => [custody.id, custody.status, custody.updatedAt]).sort(([a], [b]) => a.localeCompare(b)),
  })).digest('hex');
  return { technician: { id: String(technician._id), fullName: technician.fullName, employeeCode: technician.employeeCode || '' }, custodies, previewToken };
};

export const resetTechnicianCustodies = async (options) => {
  const preview = await previewTechnicianCustodyReset(options);
  if (String(options.confirmationName || '').trim() !== preview.technician.fullName.trim()) {
    throw new AppError('اكتب اسم الفني لتأكيد حذف ذممه المفتوحة', 400);
  }
  if (!options.previewToken || options.previewToken !== preview.previewToken) {
    throw new AppError('تغيرت ذمم الفني؛ أعد تحميل المعاينة قبل الحذف', 409);
  }
  const result = await options.repository.deleteTechnicianOpenCustodies(
    options.technicianId === UNASSIGNED_TECHNICIAN_ID ? null : options.technicianId,
    preview.custodies.map((custody) => custody.id), RESETTABLE_CUSTODY_STATUSES,
  );
  return { ...preview, ...result };
};
