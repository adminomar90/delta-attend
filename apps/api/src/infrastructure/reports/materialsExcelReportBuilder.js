import ExcelJS from 'exceljs';

const addSheet = (workbook, title, columns, rows = []) => {
  const sheet = workbook.addWorksheet(title);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };

  rows.forEach((row) => {
    sheet.addRow(row);
  });

  sheet.views = [{ rightToLeft: true }];
  return sheet;
};

export const buildMaterialsExcelBuffer = async ({
  requests = [],
  dispatches = [],
  openCustodies = [],
  reconciliations = [],
  movement = [],
  projectSummary = [],
} = {}) => {
  const workbook = new ExcelJS.Workbook();

  addSheet(
    workbook,
    'طلبات المواد',
    [
      { header: 'رقم الطلب', key: 'requestNo', width: 18 },
      { header: 'المشروع', key: 'projectName', width: 24 },
      { header: 'العميل', key: 'clientName', width: 20 },
      { header: 'مقدم الطلب', key: 'requestedBy', width: 20 },
      { header: 'الأولوية', key: 'priority', width: 12 },
      { header: 'الحالة', key: 'status', width: 24 },
      { header: 'تاريخ الطلب', key: 'requestDate', width: 18 },
      { header: 'عدد البنود', key: 'itemsCount', width: 12 },
    ],
    requests,
  );

  addSheet(
    workbook,
    'التجهيز والتسليم',
    [
      { header: 'رقم سند التسليم', key: 'dispatchNo', width: 20 },
      { header: 'رقم الطلب', key: 'requestNo', width: 18 },
      { header: 'المشروع', key: 'projectName', width: 22 },
      { header: 'المستلم', key: 'recipient', width: 20 },
      { header: 'المجهز/المسلم', key: 'deliveredBy', width: 20 },
      { header: 'إجمالي الكمية', key: 'deliveredQty', width: 14 },
      { header: 'الحالة', key: 'status', width: 14 },
      { header: 'تاريخ التسليم', key: 'deliveredAt', width: 18 },
    ],
    dispatches,
  );

  addSheet(
    workbook,
    'الذمم المفتوحة',
    [
      { header: 'رقم الذمة', key: 'custodyNo', width: 18 },
      { header: 'الموظف/الفني', key: 'holder', width: 22 },
      { header: 'المشروع', key: 'projectName', width: 24 },
      { header: 'إجمالي المستلم', key: 'receivedQty', width: 14 },
      { header: 'المصروف', key: 'consumedQty', width: 14 },
      { header: 'المتبقي', key: 'remainingQty', width: 14 },
      { header: 'الحالة', key: 'status', width: 20 },
      { header: 'عدد أيام الفتح', key: 'openDays', width: 14 },
    ],
    openCustodies,
  );

  addSheet(
    workbook,
    'تصفية المواد',
    [
      { header: 'رقم التصفية', key: 'reconcileNo', width: 18 },
      { header: 'رقم الذمة', key: 'custodyNo', width: 18 },
      { header: 'المشروع', key: 'projectName', width: 24 },
      { header: 'المستلم', key: 'holder', width: 22 },
      { header: 'المصروف الفعلي', key: 'consumedQty', width: 14 },
      { header: 'المرجع للمخزن', key: 'toReturnQty', width: 14 },
      { header: 'التالف', key: 'damagedQty', width: 12 },
      { header: 'المفقود', key: 'lostQty', width: 12 },
      { header: 'الحالة', key: 'status', width: 16 },
    ],
    reconciliations,
  );

  addSheet(
    workbook,
    'حركة المادة',
    [
      { header: 'التاريخ', key: 'date', width: 18 },
      { header: 'المادة', key: 'materialName', width: 24 },
      { header: 'المخزن', key: 'warehouse', width: 18 },
      { header: 'نوع الحركة', key: 'transactionType', width: 16 },
      { header: 'الكمية', key: 'quantity', width: 12 },
      { header: 'رقم المرجع', key: 'referenceId', width: 20 },
      { header: 'المشروع', key: 'projectName', width: 24 },
      { header: 'المنفذ', key: 'performedBy', width: 20 },
    ],
    movement,
  );

  addSheet(
    workbook,
    'حسب المشروع',
    [
      { header: 'المشروع', key: 'projectName', width: 24 },
      { header: 'طلبات المواد', key: 'requestsCount', width: 14 },
      { header: 'المواد المطلوبة', key: 'requestedQty', width: 14 },
      { header: 'المجهزة', key: 'preparedQty', width: 14 },
      { header: 'المصروفة', key: 'consumedQty', width: 14 },
      { header: 'المرجعة', key: 'returnedQty', width: 14 },
      { header: 'المتبقي', key: 'remainingQty', width: 14 },
      { header: 'التكلفة التقديرية', key: 'estimatedCost', width: 16 },
      { header: 'التكلفة الفعلية', key: 'actualCost', width: 16 },
    ],
    projectSummary,
  );

  return workbook.xlsx.writeBuffer();
};
