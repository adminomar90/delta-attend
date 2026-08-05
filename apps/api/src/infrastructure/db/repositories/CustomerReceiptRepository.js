import { CustomerReceiptModel } from '../models/CustomerReceiptModel.js';

const populatePipeline = [
  { path: 'project', select: 'name code customer clientName' },
  { path: 'customer', select: 'name phone whatsapp' },
  { path: 'receivedBy', select: 'fullName role employeeCode' },
  { path: 'createdBy', select: 'fullName role employeeCode' },
];

export class CustomerReceiptRepository {
  async create(payload) {
    return CustomerReceiptModel.create(payload);
  }

  async list(filter = {}, { limit = 500 } = {}) {
    return CustomerReceiptModel.find(filter)
      .populate(populatePipeline)
      .sort({ receiptDate: -1, createdAt: -1 })
      .limit(limit);
  }

  async findById(id) {
    return CustomerReceiptModel.findById(id).populate(populatePipeline);
  }
}
