import { ProjectInvoiceModel } from '../models/ProjectInvoiceModel.js';

const populatePipeline = [
  { path: 'project', select: 'name code status' },
  { path: 'supplier', select: 'supplierName companyName mainPhone paymentMethod currency' },
  { path: 'createdBy', select: 'fullName role employeeCode' },
  { path: 'originalInvoice.uploadedBy', select: 'fullName role employeeCode' },
];

export class ProjectInvoiceRepository {
  async create(payload) {
    return ProjectInvoiceModel.create(payload);
  }

  async listByProject(projectId, filter = {}) {
    return ProjectInvoiceModel.find({ project: projectId, ...filter })
      .populate(populatePipeline)
      .sort({ invoiceDate: -1, createdAt: -1 });
  }

  async findOne(projectId, invoiceId) {
    return ProjectInvoiceModel.findOne({ _id: invoiceId, project: projectId }).populate(populatePipeline);
  }

  async updateById(projectId, invoiceId, payload) {
    return ProjectInvoiceModel.findOneAndUpdate(
      { _id: invoiceId, project: projectId },
      payload,
      { new: true },
    ).populate(populatePipeline);
  }
}
