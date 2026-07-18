import { SupplierModel } from '../models/SupplierModel.js';

const populateFields = [
  { path: 'createdBy', select: 'fullName role employeeCode' },
  { path: 'updatedBy', select: 'fullName role employeeCode' },
  { path: 'linkedMaterials', select: 'code name category unit active' },
  { path: 'linkedProjects', select: 'name code status' },
  { path: 'evaluations.evaluator', select: 'fullName role employeeCode' },
];

export class SupplierRepository {
  create(payload) {
    return SupplierModel.create(payload);
  }

  list(filter = {}, options = {}) {
    const query = SupplierModel.find(filter)
      .populate(populateFields)
      .sort(options.sort || { createdAt: -1 });

    if (options.limit) query.limit(options.limit);
    return query;
  }

  findById(id) {
    return SupplierModel.findById(id).populate(populateFields);
  }

  findDuplicate({ normalizedMainPhone, normalizedCompanyName, excludeId } = {}) {
    const clauses = [];
    if (normalizedMainPhone) clauses.push({ normalizedMainPhone });
    if (normalizedCompanyName) clauses.push({ normalizedCompanyName });
    if (!clauses.length) return null;

    const filter = { $or: clauses };
    if (excludeId) filter._id = { $ne: excludeId };
    return SupplierModel.findOne(filter);
  }

  updateById(id, payload) {
    return SupplierModel.findByIdAndUpdate(id, payload, { new: true }).populate(populateFields);
  }
}
