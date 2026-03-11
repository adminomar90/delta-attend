import { CounterModel } from '../../infrastructure/db/models/CounterModel.js';

const padNumber = (value, length = 5) => String(value).padStart(length, '0');

export const sequenceService = {
  async next(name, { prefix = '', year = new Date().getFullYear(), digits = 5 } = {}) {
    const key = `${String(name || '').trim()}_${year}`;
    const counter = await CounterModel.findByIdAndUpdate(
      key,
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const value = Number(counter?.seq || 0);
    if (!prefix) {
      return String(value);
    }

    return `${prefix}-${year}-${padNumber(value, digits)}`;
  },
};
