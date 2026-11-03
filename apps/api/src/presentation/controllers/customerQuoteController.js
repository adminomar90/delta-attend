import { randomBytes, createHash } from 'node:crypto';
import { MaterialModel } from '../../infrastructure/db/models/MaterialModel.js';
import path from 'node:path';
import { env } from '../../config/env.js';
import { quoteImageUrl } from '../../application/services/customerQuoteImages.js';
import { CustomerQuoteModel } from '../../infrastructure/db/models/CustomerQuoteModel.js';
import { WarehouseModel } from '../../infrastructure/db/models/WarehouseModel.js';
import { StockBalanceModel } from '../../infrastructure/db/models/StockBalanceModel.js';
import { CustomerModel } from '../../infrastructure/db/models/CustomerModel.js';
import { UserRepository } from '../../infrastructure/db/repositories/UserRepository.js';
import { userCanSeeCustomer } from '../../application/services/customerAccessService.js';
import { sequenceService } from '../../application/services/sequenceService.js';
import { auditService } from '../../application/services/auditService.js';
import { quoteText, quoteNumber, cents, quoteTotals, quoteExpiry } from '../../application/services/customerQuotePolicy.js';
import { resolveManagedUserIds, applyManagedScopeOnFilter } from '../../shared/accessScope.js';
import { buildWhatsAppSendUrl } from '../../shared/attendanceUtils.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { buildCustomerQuotePdf } from '../../infrastructure/reports/customerQuotePdfBuilder.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const oid = (value) => { if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new AppError('معرّف غير صالح', 400); return value; };
const scope = async (req) => {
  const filter = {};
  const managedUserIds = await resolveManagedUserIds({ userRepository: new UserRepository(), actorId: req.user.id, actorRole: req.user.role, includeInactive: true });
  applyManagedScopeOnFilter({ filter, managedUserIds, field: 'createdBy' });
  return filter;
};
const findQuote = async (req, { token = false } = {}) => {
  let query = CustomerQuoteModel.findOne({ _id: oid(req.params.id), ...await scope(req) });
  if (token) query = query.select('+shareToken');
  const quote = await query;
  if (!quote) throw new AppError('عرض السعر غير موجود أو غير متاح', 404);
  return quote;
};
const loadStock = async (warehouseId) => {
  const warehouses = await WarehouseModel.find({ active: true, type: { $ne: 'DAMAGED' }, ...(warehouseId ? { _id: oid(warehouseId) } : {}) }).select('_id name code').lean();
  const [catalog, balances] = await Promise.all([
    MaterialModel.find({ active: { $ne: false }, productStatus: { $nin: ['ARCHIVED', 'DAMAGED'] } })
      .select('name code unit brand model description imageUrl active productStatus').sort({ name: 1 }).lean(),
    StockBalanceModel.find({ warehouse: { $in: warehouses.map((w) => w._id) } })
      .select('warehouse material qtyOnHand qtyReserved').lean(),
  ]);
  const availability = new Map();
  for (const balance of balances) {
    const id = String(balance.material);
    if (!availability.has(id)) availability.set(id, {});
    availability.get(id)[String(balance.warehouse)] = Math.max(0, Math.round((balance.qtyOnHand - Number(balance.qtyReserved || 0)) * 1000) / 1000);
  }
  const materials = catalog.map((material) => ({ ...material, imageUrl: quoteImageUrl(material.imageUrl), availableByWarehouse: availability.get(String(material._id)) || {} }));
  return { warehouses, materials };
};
export const quoteMetadata = asyncHandler(async (req, res) => {
  const stock = await loadStock();
  const candidates = await CustomerModel.find({ archived: { $ne: true } }).select('name phone whatsapp address createdBy linkedDailyWorkPlans').sort({ name: 1 }).limit(2000);
  const customers = [];
  for (const customer of candidates) if (await userCanSeeCustomer(req, customer)) customers.push({ _id: customer._id, name: customer.name, phone: customer.whatsapp || customer.phone, address: customer.address });
  res.set('Cache-Control', 'private, no-store').json({ ...stock, customers });
});
const payload = async (req) => {
  const body = req.body;
  const mode = body.customerMode;
  if (!['EXISTING', 'MANUAL', 'NONE'].includes(mode)) throw new AppError('اختر طريقة إدخال الزبون', 400);
  let customer = null, customerName = '', address = quoteText(body.address), phone = quoteText(body.phone, 40);
  if (mode === 'EXISTING') {
    customer = await CustomerModel.findOne({ _id: oid(body.customerId), archived: { $ne: true } });
    if (!customer || !(await userCanSeeCustomer(req, customer))) throw new AppError('الزبون غير موجود أو غير متاح', 403);
    customerName = customer.name; address = quoteText(body.address || customer.address); phone = quoteText(body.phone || customer.whatsapp || customer.phone, 40);
  } else if (mode === 'MANUAL') {
    customerName = quoteText(body.customerName, 200);
    if (!customerName) throw new AppError('اسم الزبون مطلوب', 400);
  }
  const { warehouses, materials } = await loadStock(oid(body.warehouseId));
  if (!warehouses.length) throw new AppError('اختر مخزنًا فعالًا', 400);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new AppError('أضف من 1 إلى 100 مادة من المخزن', 400);
  const seen = new Set();
  const items = body.items.map((line) => {
    const id = oid(line.materialId);
    const material = materials.find((m) => String(m._id) === id);
    if (!material) throw new AppError('إحدى المواد غير موجودة أو غير فعّالة. حدّث قائمة المنتجات', 400);
    if (seen.has(id)) throw new AppError('المادة مكررة. عدّل الكمية في بندها', 400);
    seen.add(id);
    const quantity = quoteNumber(line.quantity, { min: 0.001, max: 100000 });
    if (Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001) throw new AppError('الكمية تقبل 3 منازل عشرية فقط', 400);
    return { material: material._id, name: material.name, code: material.code, unit: material.unit, imageUrl: quoteImageUrl(material.imageUrl), brand: material.brand || '', model: material.model || '', quantity, unitPrice: cents(quoteNumber(line.unitPrice)) / 100 };
  });
  const installationFee = cents(quoteNumber(body.installationFee ?? 0)) / 100, programmingFee = cents(quoteNumber(body.programmingFee ?? 0)) / 100;
  const discount = cents(quoteNumber(body.discount ?? 0, { max: 1000000000000 })) / 100;
  const totals = quoteTotals(items, installationFee, programmingFee, discount);
  const validUntil = quoteExpiry(body.validUntil);
  if (validUntil < new Date()) throw new AppError('صلاحية العرض يجب أن تكون اليوم أو لاحقًا', 400);
  if (!['IQD', 'USD'].includes(body.currency)) throw new AppError('اختر العملة', 400);
  return { customerMode: mode, customer: customer?._id || null, customerName, phone, address,
    title: quoteText(body.title, 200) || 'عرض أسعار', warehouse: warehouses[0]._id, warehouseName: warehouses[0].name,
    currency: body.currency, items: items.map((line, i) => ({ ...line, total: totals.lineTotals[i] })), installationFee, programmingFee,
    productsTotal: totals.productsTotal, discount, total: totals.total, validUntil, notes: quoteText(body.notes, 3000), terms: quoteText(body.terms, 3000) };
};
const withQuoteImages = async (values) => {
  const quotes = values.map((value) => typeof value.toObject === 'function' ? value.toObject() : value);
  const ids = [...new Set(quotes.flatMap((quote) => quote.items.filter((line) => !line.imageUrl).map((line) => String(line.material))))].filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const materials = ids.length ? await MaterialModel.find({ _id: { $in: ids } }).select('imageUrl brand model').lean() : [];
  const byId = new Map(materials.map((material) => [String(material._id), material]));
  return quotes.map((quote) => ({ ...quote, items: quote.items.map((line) => {
    const material = byId.get(String(line.material));
    return { ...line, imageUrl: quoteImageUrl(line.imageUrl || material?.imageUrl), brand: line.brand || material?.brand || '', model: line.model || material?.model || '' };
  }) }));
};
export const listCustomerQuotes = asyncHandler(async (req, res) => {
  const quotes = await CustomerQuoteModel.find(await scope(req)).sort({ createdAt: -1 }).limit(1000).lean();
  res.set('Cache-Control', 'private, no-store').json({ quotes: await withQuoteImages(quotes) });
});
export const getCustomerQuote = asyncHandler(async (req, res) => res.set('Cache-Control', 'private, no-store').json({ quote: (await withQuoteImages([await findQuote(req)]))[0] }));
export const createCustomerQuote = asyncHandler(async (req, res) => {
  const data = await payload(req);
  const year = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Baghdad' }).format(new Date()));
  const quoteNo = await sequenceService.next('customer_quote', { prefix: 'CQ', year });
  const quote = await CustomerQuoteModel.create({ ...data, quoteNo, createdBy: req.user.id });
  await auditService.log({ actorId: req.user.id, action: 'CUSTOMER_QUOTE_CREATED', entityType: 'CUSTOMER_QUOTE', entityId: quote._id, after: { quoteNo, total: quote.total }, req });
  res.status(201).json({ quote });
});
export const updateCustomerQuote = asyncHandler(async (req, res) => {
  const existing = await findQuote(req);
  if (req.body.revision !== existing.revision) throw new AppError('تم تعديل العرض من مستخدم آخر. حدّث الصفحة', 409);
  const data = await payload(req);
  const quote = await CustomerQuoteModel.findOneAndUpdate({ _id: existing._id, revision: existing.revision }, { $set: { ...data, sharedAt: null }, $unset: { shareToken: 1, shareTokenHash: 1 }, $inc: { revision: 1 } }, { new: true, runValidators: true });
  if (!quote) throw new AppError('تغير العرض. حدّث الصفحة', 409);
  await auditService.log({ actorId: req.user.id, action: 'CUSTOMER_QUOTE_UPDATED', entityType: 'CUSTOMER_QUOTE', entityId: quote._id, after: { quoteNo: quote.quoteNo, revision: quote.revision }, req });
  res.json({ quote });
});
const publicData = async (value) => {
  const [quote] = await withQuoteImages([value]);
  return { quoteNo: quote.quoteNo, title: quote.title, customerName: quote.customerName, address: quote.address, currency: quote.currency,
  items: quote.items.map((line) => ({ name: line.name, code: line.code, unit: line.unit, imageUrl: line.imageUrl, brand: line.brand, model: line.model, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })),
  installationFee: quote.installationFee, programmingFee: quote.programmingFee, productsTotal: quote.productsTotal, discount: quote.discount || 0, total: quote.total,
  notes: quote.notes, terms: quote.terms, validUntil: quote.validUntil, createdAt: quote.createdAt };
};
const findPublic = async (token) => {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw new AppError('رابط العرض غير صالح', 404);
  const quote = await CustomerQuoteModel.findOne({ shareTokenHash: hash(token) });
  if (!quote) throw new AppError('رابط العرض غير صالح أو تم تحديثه', 404);
  if (quote.validUntil < new Date()) throw new AppError('انتهت صلاحية عرض السعر', 410);
  return quote;
};
export const publicCustomerQuote = asyncHandler(async (req, res) => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }).json({ quote: await publicData(await findPublic(req.params.token)) }));
const sendPdf = async (quote, req, res) => {
  const pdf = await buildCustomerQuotePdf(await publicData(quote), { uploadRootDir: path.resolve(process.cwd(), env.uploadsDir) });
  res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${quote.quoteNo}.pdf"`, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }).send(pdf);
};
export const customerQuotePdf = asyncHandler(async (req, res) => sendPdf(await findQuote(req), req, res));
export const publicCustomerQuotePdf = asyncHandler(async (req, res) => sendPdf(await findPublic(req.params.token), req, res));
export const shareCustomerQuote = asyncHandler(async (req, res) => {
  const quote = await findQuote(req, { token: true });
  if (quote.validUntil < new Date()) throw new AppError('انتهت صلاحية العرض. عدّل تاريخ الصلاحية أولًا', 409);
  const phone = quoteText(req.body.phone || quote.phone, 40);
  if (!/^\+?[\d\s()-]{8,40}$/.test(phone)) throw new AppError('أدخل رقم واتساب صالحًا للزبون', 400);
  const token = quote.shareToken || randomBytes(32).toString('hex');
  let origin;
  try { origin = new URL(req.body.publicOrigin || req.headers.origin || process.env.FRONTEND_ORIGIN?.split(',')[0] || 'http://localhost:3000'); }
  catch { throw new AppError('عنوان الموقع غير صالح', 400); }
  if (!['http:', 'https:'].includes(origin.protocol)) throw new AppError('عنوان الموقع غير صالح', 400);
  const updated = await CustomerQuoteModel.findOneAndUpdate({ _id: quote._id, revision: quote.revision }, { $set: { shareToken: token, shareTokenHash: hash(token), sharedAt: new Date() } }, { new: true });
  if (!updated) throw new AppError('تغير العرض. حدّث الصفحة', 409);
  const link = `${origin.origin}/customer-quote/${token}`;
  const message = ['السلام عليكم،', quote.customerName ? `السادة / ${quote.customerName}` : '', `عرض أسعار من شركة دلتا بلص - ${quote.quoteNo}`, `الإجمالي: ${quote.total.toLocaleString('en-US')} ${quote.currency}`, 'يمكنكم عرض التفاصيل وتحميل ملف PDF من الرابط التالي:', link, 'مع التقدير.'].filter(Boolean).join('\n');
  await auditService.log({ actorId: req.user.id, action: 'CUSTOMER_QUOTE_SHARE_PREPARED', entityType: 'CUSTOMER_QUOTE', entityId: quote._id, after: { quoteNo: quote.quoteNo }, req });
  res.json({ link, message, whatsappUrl: buildWhatsAppSendUrl(phone, message) });
});
