import { EmployeeFileModel } from '../models/EmployeeFileModel.js';

export class EmployeeFileRepository {
  async create(payload) {
    return EmployeeFileModel.create(payload);
  }

  async listByUser(userId) {
    return EmployeeFileModel.find({ user: userId }).sort({ createdAt: -1 });
  }

  async listByCategory(userId, category) {
    return EmployeeFileModel.find({ user: userId, category }).sort({ createdAt: -1 });
  }
}
