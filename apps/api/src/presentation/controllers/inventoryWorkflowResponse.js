import { auditService } from '../../application/services/auditService.js';
import { notificationService } from '../../application/services/notificationService.js';
import { MaterialsRepository } from '../../infrastructure/db/repositories/MaterialsRepository.js';

const repository = new MaterialsRepository();
export const sendWorkflowResult = async (req, res, action, result) => {
  const { notice, ...response } = result;
  const entityId = result.request?._id || result.custody?._id || result.reconciliation?._id;
  if (!result.alreadyApplied) {
    await auditService.log({ actorId: req.user.id, action, entityType: 'INVENTORY_WORKFLOW', entityId,
      after: { requestId: result.request?._id, custodyId: result.custody?._id, reconciliationId: result.reconciliation?._id, status: result.request?.status || result.custody?.status || result.reconciliation?.status }, req });
    if (notice?.userId) await notificationService.notifySystem(notice.userId, 'دورة المواد والمخازن', notice.message, { requestId: result.request?._id, custodyId: result.custody?._id });
  }
  // Keep the populated response contract expected by both material screens.
  if (response.request) response.request = await repository.findRequestById(response.request._id);
  if (response.custody) response.custody = await repository.findCustodyById(response.custody._id);
  if (response.reconciliation) response.reconciliation = await repository.findReconciliationById(response.reconciliation._id);
  res.json(response);
};
