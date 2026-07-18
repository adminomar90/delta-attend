import { AppError } from '../../shared/errors.js';

const qty = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : 0;
};

export const normalizeReconciliationQuantities = ({ receivedQty, input = {} }) => {
  const received = Math.max(0, qty(receivedQty));
  const consumed = Math.max(0, qty(input.consumedQty));
  const damaged = Math.max(0, qty(input.damagedQty));
  const lost = Math.max(0, qty(input.lostQty));
  const dispositionTotal = qty(consumed + damaged + lost);

  if (dispositionTotal > received) {
    throw new AppError('مجموع المستخدم والتالف والمفقود لا يمكن أن يتجاوز الكمية المستلمة', 409);
  }

  const expectedRemaining = qty(received - dispositionTotal);
  const suppliedRemaining = input.remainingQty === undefined || input.remainingQty === null
    ? expectedRemaining
    : Math.max(0, qty(input.remainingQty));
  if (suppliedRemaining !== expectedRemaining) {
    throw new AppError('الكمية المتبقية لا تطابق الكمية المستلمة بعد خصم المستخدم والتالف والمفقود', 409);
  }

  const toReturn = input.toReturnQty === undefined || input.toReturnQty === null
    ? suppliedRemaining
    : Math.max(0, qty(input.toReturnQty));
  if (toReturn > suppliedRemaining) {
    throw new AppError('كمية الإرجاع لا يمكن أن تتجاوز الكمية المتبقية', 409);
  }

  return {
    receivedQty: received,
    consumedQty: consumed,
    damagedQty: damaged,
    lostQty: lost,
    remainingQty: suppliedRemaining,
    toReturnQty: toReturn,
  };
};

export const deriveCustodyStatus = (items = []) => {
  const allAccounted = items.length > 0 && items.every((line) => {
    const accounted = qty(
      Number(line.consumedQty || 0)
      + Number(line.returnedQty || 0)
      + Number(line.damagedQty || 0)
      + Number(line.lostQty || 0),
    );
    return accounted >= qty(line.receivedQty || 0);
  });
  if (allAccounted) return 'FULLY_RECONCILED';

  const anyAccounted = items.some((line) => (
    Number(line.consumedQty || 0)
    + Number(line.returnedQty || 0)
    + Number(line.damagedQty || 0)
    + Number(line.lostQty || 0)
  ) > 0);
  return anyAccounted ? 'PARTIALLY_RECONCILED' : 'OPEN';
};
