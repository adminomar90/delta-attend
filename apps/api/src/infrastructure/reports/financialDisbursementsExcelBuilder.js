import ExcelJS from 'exceljs';

const typeLabel = {
  TRANSPORT_EXPENSE: 'نقل',
  FOOD_EXPENSE: 'طعام',
  MATERIALS_EXPENSE: 'مواد',
  WORK_ADVANCE: 'سلفة عمل',
  SALARY_ADVANCE: 'سلفة من راتب',
  BUSINESS_EXPENSE: 'مصروف تشغيلي',
  EXCEPTIONAL_EXPENSE: 'مصروف استثنائي',
  TRAVEL_EXPENSE: 'مصروف السفر',
  PURCHASE_REIMBURSEMENT: 'استرداد شراء',
  OTHER: 'أخرى',
};

const dateValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ar-IQ');
};

const amountValue = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

export const buildFinancialDisbursementsExcelBuffer = async (requests = [], { title = 'Financial Disbursements' } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Financial Requests');

  const columns = [
    { header: 'رقم الطلب', key: 'requestNo', width: 16 },
    { header: 'رقم المعاملة', key: 'transactionNo', width: 18 },
    { header: 'تاريخ المعاملة', key: 'transactionDate', width: 22 },
    { header: 'الموظف', key: 'employee', width: 24 },
    { header: 'موظف السلفة', key: 'advanceRecipient', width: 24 },
    { header: 'المشروع', key: 'project', width: 28 },
    { header: 'المرحلة', key: 'stage', width: 22 },
    { header: 'المهمة', key: 'task', width: 28 },
    { header: 'تصنيف المعاملة', key: 'transactionKind', width: 18 },
    { header: 'نوع الصرف', key: 'requestType', width: 18 },
    { header: 'الوصف', key: 'description', width: 42 },
    { header: 'المبلغ', key: 'amount', width: 16 },
    { header: 'المبلغ المعتمد', key: 'approvedAmount', width: 18 },
    { header: 'العملة', key: 'currency', width: 12 },
    { header: 'الحالة', key: 'statusLabel', width: 26 },
    { header: 'المراجع الحالي', key: 'currentReviewerRole', width: 18 },
    { header: 'عدد المرفقات', key: 'attachments', width: 14 },
    { header: 'ملاحظات', key: 'notes', width: 36 },
    { header: 'تاريخ الإنشاء', key: 'createdAt', width: 22 },
  ];

  worksheet.columns = columns;
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
  worksheet.addRow([title]);
  worksheet.mergeCells(1, 1, 1, columns.length);
  worksheet.getCell(1, 1).font = { size: 15, bold: true };
  worksheet.getCell(1, 1).alignment = { horizontal: 'center' };

  worksheet.addRow(columns.map((column) => column.header));
  worksheet.getRow(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A6B' },
  };
  worksheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  requests.forEach((request) => {
    worksheet.addRow({
      requestNo: request.requestNo || '',
      transactionNo: request.transactionNo || '',
      transactionDate: dateValue(request.transactionDate),
      employee: request.employee?.fullName || '',
      advanceRecipient: request.advanceRecipient?.fullName || '',
      project: request.project?.name || '',
      stage: request.stage?.name || '',
      task: request.task?.title || '',
      transactionKind: request.isProjectAdvance ? 'سلفة مشروع' : 'صرف مالي',
      requestType: typeLabel[request.requestType] || request.requestType || '',
      description: request.description || '',
      amount: amountValue(request.amount),
      approvedAmount: request.approvedAmount != null ? amountValue(request.approvedAmount) : '',
      currency: request.currency || 'IQD',
      statusLabel: request.statusLabel || request.status || '',
      currentReviewerRole: request.currentReviewerRole || '',
      attachments: (request.attachments || []).length,
      notes: request.notes || '',
      createdAt: dateValue(request.createdAt),
    });
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (rowNumber > 2) {
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      }
    });
  });

  worksheet.addRow([]);
  worksheet.addRow(['إجمالي المعاملات', requests.length]);
  worksheet.addRow(['إجمالي المبالغ', requests.reduce((sum, request) => sum + amountValue(request.amount), 0)]);

  return workbook.xlsx.writeBuffer();
};
