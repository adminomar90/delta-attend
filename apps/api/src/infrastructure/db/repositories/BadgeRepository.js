import { BadgeModel } from '../models/BadgeModel.js';

export class BadgeRepository {
  async list() {
    return BadgeModel.find().sort({ threshold: 1 });
  }

  async findByCode(code) {
    return BadgeModel.findOne({ code });
  }

  async upsertByCode(code, payload) {
    return BadgeModel.findOneAndUpdate(
      { code },
      payload,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  }
}
