import ExcelJS from 'exceljs';
import { buildDailyWorkPlanExportRows } from '../../application/services/dailyWorkPlanService.js';

export const buildDailyWorkPlansExcelBuffer = async (plans = []) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Daily Work Plans');
  const rows = buildDailyWorkPlanExportRows(plans);

  worksheet.columns = [
    { header: 'Plan ID', key: 'id', width: 28 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Customer', key: 'customerName', width: 24 },
    { header: 'Project', key: 'projectName', width: 24 },
    { header: 'Location', key: 'location', width: 24 },
    { header: 'Date', key: 'planDate', width: 14 },
    { header: 'Time', key: 'timeRange', width: 20 },
    { header: 'Status', key: 'statusLabel', width: 18 },
    { header: 'Priority', key: 'priorityLabel', width: 14 },
    { header: 'Type', key: 'taskTypeLabel', width: 18 },
    { header: 'Progress %', key: 'progressPercent', width: 12 },
    { header: 'Assignees', key: 'assigneesLabel', width: 32 },
    { header: 'Archived', key: 'archivedLabel', width: 12 },
    { header: 'Archived At', key: 'archivedAtLabel', width: 22 },
    { header: 'Archived By', key: 'archivedByName', width: 24 },
    { header: 'Last Updated', key: 'lastUpdatedLabel', width: 20 },
  ];

  rows.forEach((row) => {
    worksheet.addRow({
      ...row,
      archivedAtLabel: row.archivedAt
        ? new Date(row.archivedAt).toLocaleString('ar-IQ')
        : '-',
      lastUpdatedLabel: row.lastUpdatedAt
        ? new Date(row.lastUpdatedAt).toLocaleString('ar-IQ')
        : '-',
    });
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
};
