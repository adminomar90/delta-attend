import { PurchaseRequestModel } from '../models/PurchaseRequestModel.js';

const populateFields = [
  { path: 'createdBy', select: 'fullName role employeeCode' },
  { path: 'project', select: 'name code status' },
  { path: 'defaultWarehouse', select: 'name code location active' },
  { path: 'items.material', select: 'code name barcode imageUrl brand model category unit active estimatedUnitCost' },
  { path: 'suppliers.supplier', select: 'supplierName companyName mainPhone contactPerson status currency' },
  { path: 'purchaseOrder.approvedBy', select: 'fullName role employeeCode' },
  { path: 'purchaseOrder.supplier', select: 'supplierName companyName mainPhone' },
  { path: 'purchaseOrder.selectedLines.material', select: 'code name category unit active estimatedUnitCost' },
  { path: 'purchaseOrder.selectedLines.supplier', select: 'supplierName companyName mainPhone' },
  { path: 'receipts.receivedBy', select: 'fullName role employeeCode' },
  { path: 'receipts.warehouse', select: 'name code location active' },
  { path: 'receipts.items.material', select: 'code name category unit active estimatedUnitCost' },
];

export class PurchaseRepository {
  create(payload) {
    return PurchaseRequestModel.create(payload);
  }

  list(filter = {}, options = {}) {
    const query = PurchaseRequestModel.find(filter)
      .populate(populateFields)
      .sort(options.sort || { createdAt: -1 });
    if (options.limit) query.limit(options.limit);
    return query;
  }

  findById(id) {
    return PurchaseRequestModel.findById(id).populate(populateFields);
  }

  findByTokenHash(tokenHash) {
    return PurchaseRequestModel.findOne({ 'suppliers.tokenHash': tokenHash })
      .populate(populateFields);
  }

  findByPublicToken(token) {
    return PurchaseRequestModel.findOne({ 'suppliers.publicToken': token })
      .populate(populateFields);
  }

  updateById(id, payload) {
    return PurchaseRequestModel.findByIdAndUpdate(id, payload, { new: true }).populate(populateFields);
  }

  claimReceipt(id, { key, receiptNo, actorId, staleBefore }) {
    return PurchaseRequestModel.findOneAndUpdate(
      {
        _id: id,
        status: { $ne: 'RECEIVED' },
        'purchaseOrder.status': { $ne: 'RECEIVED' },
        $or: [
          { 'receiptProcessing.key': { $in: ['', null] } },
          { 'receiptProcessing.key': { $exists: false } },
          { 'receiptProcessing.startedAt': { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          receiptProcessing: { key, receiptNo, startedAt: new Date(), startedBy: actorId },
        },
      },
      { new: true },
    ).populate(populateFields);
  }

  releaseReceiptClaim(id, key) {
    return PurchaseRequestModel.updateOne(
      { _id: id, 'receiptProcessing.key': key },
      { $set: { receiptProcessing: { key: '', receiptNo: '', startedAt: null, startedBy: null } } },
    );
  }
}
