import { OperationPointsRuleModel } from '../models/OperationPointsRuleModel.js';

export class OperationPointsRuleRepository {
  async listAll() {
    return OperationPointsRuleModel.find()
      .populate('updatedBy', 'fullName role employeeCode')
      .sort({ actionKey: 1 });
  }

  async findByActionKey(actionKey) {
    return OperationPointsRuleModel.findOne({
      actionKey: String(actionKey || '').trim().toUpperCase(),
    }).populate('updatedBy', 'fullName role employeeCode');
  }

  async upsertByActionKey(actionKey, payload = {}) {
    return OperationPointsRuleModel.findOneAndUpdate(
      {
        actionKey: String(actionKey || '').trim().toUpperCase(),
      },
      {
        $set: {
          ...payload,
          actionKey: String(actionKey || '').trim().toUpperCase(),
        },
      },
      {
        upsert: true,
        new: true,
      },
    ).populate('updatedBy', 'fullName role employeeCode');
  }
}
