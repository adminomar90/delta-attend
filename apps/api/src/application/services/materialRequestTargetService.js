import { AppError } from '../../shared/errors.js';

const clean = (value) => String(value || '').trim();

export const resolveMaterialRequestTarget = async (body, { findProject, findCustomer, canSeeCustomer }) => {
  const requestTarget = clean(body.requestTarget || (body.customerId ? 'CUSTOMER' : 'PROJECT'));
  if (!['PROJECT', 'CUSTOMER'].includes(requestTarget)) throw new AppError('نوع جهة الطلب غير صالح', 400);
  if (requestTarget === 'CUSTOMER') {
    const customerId = clean(body.customerId);
    if (!customerId) throw new AppError('يرجى اختيار الزبون', 400);
    const customer = await findCustomer(customerId);
    if (!customer || customer.archived) throw new AppError('الزبون غير موجود أو مؤرشف', 404);
    if (!(await canSeeCustomer(customer))) throw new AppError('لا تملك صلاحية الوصول لهذا الزبون', 403);
    return { requestTarget, customer: customer._id, project: null, projectName: '', manualProjectName: '', clientName: customer.name };
  }
  const projectId = clean(body.projectId || body.project);
  const manualProjectName = clean(body.manualProjectName);
  if (!projectId && !manualProjectName) throw new AppError('اسم المشروع مطلوب', 400);
  const project = projectId ? await findProject(projectId) : null;
  if (projectId && !project) throw new AppError('Project not found', 404);
  return {
    requestTarget, customer: null, project: project?._id || null,
    projectName: project?.name || manualProjectName,
    manualProjectName: project ? '' : manualProjectName,
    clientName: clean(body.clientName || body.client || project?.clientName),
  };
};
