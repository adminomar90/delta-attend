import ExcelJS from 'exceljs';

export const buildProjectWarehouseExcelBuffer = async ({
  project = {},
  rows = [],
  summary = {},
} = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Delta Plus';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('ملخص مخزن المشروع');
  summarySheet.views = [{ rightToLeft: true }];
  summarySheet.columns = [
    { header: 'البند', key: 'label', width: 28 },
    { header: 'القيمة', key: 'value', width: 36 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.addRows([
    { label: 'اسم المشروع', value: project.name || '-' },
    { label: 'رمز المشروع', value: project.code || '-' },
    { label: 'عدد سندات التسليم', value: summary.dispatchesCount || 0 },
    { label: 'عدد أنواع المواد المصروفة', value: summary.uniqueMaterialsCount || 0 },
    { label: 'إجمالي الفقرات المصروفة', value: summary.itemsCount || 0 },
    { label: 'عدد المخازن', value: summary.warehousesCount || 0 },
  ]);

  const sheet = workbook.addWorksheet('سجل المواد المصروفة');
  sheet.views = [{ rightToLeft: true }];
  sheet.columns = [
    { header: 'رقم سند التسليم', key: 'dispatchNo', width: 22 },
    { header: 'رقم طلب المواد', key: 'requestNo', width: 20 },
    { header: 'تاريخ التسليم', key: 'deliveredAt', width: 18 },
    { header: 'المخزن', key: 'warehouseName', width: 22 },
    { header: 'كود المادة', key: 'materialCode', width: 16 },
    { header: 'اسم المادة', key: 'materialName', width: 30 },
    { header: 'الوحدة', key: 'unit', width: 12 },
    { header: 'الكمية المصروفة', key: 'deliveredQty', width: 16 },
    { header: 'المستلم', key: 'recipientName', width: 24 },
    { header: 'المسلم', key: 'deliveredByName', width: 24 },
    { header: 'الحالة', key: 'status', width: 16 },
    { header: 'ملاحظات السند', key: 'dispatchNotes', width: 28 },
    { header: 'ملاحظات المادة', key: 'itemNotes', width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  return workbook.xlsx.writeBuffer();
};
