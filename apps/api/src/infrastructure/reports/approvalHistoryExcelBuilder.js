import ExcelJS from 'exceljs';

const columns = [
  { header: 'Operation Number', key: 'operationNumber', width: 20 },
  { header: 'Title', key: 'title', width: 28 },
  { header: 'Operation Type', key: 'operationType', width: 20 },
  { header: 'Created By', key: 'createdBy', width: 22 },
  { header: 'Creator Role', key: 'createdByRole', width: 20 },
  { header: 'Employee', key: 'employeeName', width: 22 },
  { header: 'Employee Code', key: 'employeeCode', width: 16 },
  { header: 'Project / Department', key: 'projectOrDepartment', width: 24 },
  { header: 'Approver', key: 'approverName', width: 22 },
  { header: 'Approver Role', key: 'approverRole', width: 20 },
  { header: 'Approver Permission', key: 'approverPermission', width: 24 },
  { header: 'Approval Status', key: 'approvalStatus', width: 16 },
  { header: 'Current Status', key: 'rawStatus', width: 16 },
  { header: 'Points', key: 'points', width: 12 },
  { header: 'Created Date', key: 'createdDate', width: 14 },
  { header: 'Created Time', key: 'createdTime', width: 12 },
  { header: 'Approval Date', key: 'approvalDate', width: 14 },
  { header: 'Approval Time', key: 'approvalTime', width: 12 },
  { header: 'Notes', key: 'notes', width: 36 },
  { header: 'Full Details', key: 'fullDetails', width: 60 },
  { header: 'Approval Steps', key: 'approvalSteps', width: 60 },
];

export const buildApprovalHistoryExcelBuffer = async (rows = [], { generatedAt = new Date() } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Approval History');

  worksheet.columns = columns;
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];

  worksheet.addRow(['Delta Plus Approval History Export']);
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

  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => row[column.key] ?? ''));
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: 'top',
        wrapText: true,
      };
      if (rowNumber > 2) {
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    });
  });

  worksheet.addRow([]);
  worksheet.addRow([`Generated At: ${generatedAt.toISOString()}`]);

  return workbook.xlsx.writeBuffer();
};
