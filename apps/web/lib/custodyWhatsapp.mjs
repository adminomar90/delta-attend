const openStatuses = new Set(['OPEN', 'PARTIALLY_RECONCILED', 'PENDING_RECONCILIATION', 'OVERDUE']);
const units = { PIECE: 'قطعة', METER: 'متر', ROLL: 'لفة', BOX: 'صندوق', KG: 'كغم', TON: 'طن', LITER: 'لتر', SQM: 'م²', SET: 'طقم', PAIR: 'زوج', BAG: 'كيس', CARTON: 'كارتون' };
const statusNames = { OPEN: 'مفتوحة', PARTIALLY_RECONCILED: 'مصفاة جزئياً', PENDING_RECONCILIATION: 'بانتظار التصفية', OVERDUE: 'متأخرة', CLOSED: 'مغلقة', FULLY_RECONCILED: 'مصفاة بالكامل' };

export const resolveCustodyReturnPath = (path, origin) => {
  if (!path?.startsWith('/') || path.startsWith('//')) return '';
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.pathname !== '/warehouses' || url.searchParams.get('tab') !== 'custodies') return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return ''; }
};

export const custodyLoginUrl = (location) => {
  const path = resolveCustodyReturnPath(`${location.pathname}${location.search}${location.hash}`, location.origin);
  return path ? `/login?next=${encodeURIComponent(path)}` : '/login';
};

export const buildCustodyWhatsapp = ({ origin, holder, custody = null, includeClosed = false }) => {
  const custodies = custody ? [custody] : holder.custodies || [];
  const needsReconciliation = custodies.some((record) => openStatuses.has(record.status));
  const link = new URL('/warehouses', origin);
  link.searchParams.set('tab', 'custodies');
  link.searchParams.set('holderId', holder.holderId === 'unknown' ? 'unassigned' : holder.holderId);
  if (custody) { link.searchParams.set('custodyId', custody.custodyId); link.hash = `custody-${custody.custodyId}`; }
  if (includeClosed || (custody && !openStatuses.has(custody.status))) link.searchParams.set('includeClosed', 'true');
  link.searchParams.set('action', needsReconciliation ? 'reconcile' : 'view');
  const remainingByUnit = new Map();
  for (const record of custodies) {
    for (const item of record.items || []) {
      const remaining = Number(item.remainingQty || 0);
      if (remaining > 0) remainingByUnit.set(item.unit || 'OTHER', (remainingByUnit.get(item.unit || 'OTHER') || 0) + remaining);
    }
  }
  const quantities = [...remainingByUnit].map(([unit, amount]) => `${new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 3 }).format(amount)} ${units[unit] || unit}`).join('، ');
  const message = [
    needsReconciliation ? '[ طلب تصفية ذمم مواد - Delta Plus ]' : '[ كشف ذمم مواد - Delta Plus ]',
    '----------------------------------', 'السلام عليكم،',
    needsReconciliation ? 'يرجى مراجعة الذمم التالية وتسجيل الكميات المستهلكة والراجعة والمتبقية لغرض التصفية:' : 'يرجى الاطلاع على كشف الذمم التالي:',
    `الفني: ${holder.holderName || 'ذمم بدون فني'}`,
    holder.employeeCode ? `الرقم الوظيفي: ${holder.employeeCode}` : '',
    custody ? `رقم الذمة: ${custody.custodyNo}` : `عدد الذمم: ${custodies.length}`,
    custody ? `المشروع: ${custody.project || '-'}` : '',
    custody ? `الحالة: ${statusNames[custody.status] || custody.status}` : '',
    quantities ? `الكميات المتبقية: ${quantities}` : '',
    `رابط عرض الذمة${needsReconciliation ? ' والتصفية' : ''}: ${link.href}`,
    'يمكن معاينة كشف PDF وطباعته من صفحة الذمة.',
    '----------------------------------',
    needsReconciliation ? 'يرجى إرسال طلب التصفية من النظام لاعتماده.' : '',
    '[ صادر من نظام Delta Plus ]',
  ].filter(Boolean).join('\n');
  return { message, link: link.href, url: `https://wa.me/?text=${encodeURIComponent(message)}` };
};
