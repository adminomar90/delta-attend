import ExcelJS from 'exceljs';

export const buildTasksExcelBuffer = async (tasks) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tasks Report');

  worksheet.columns = [
    { header: 'Task ID', key: 'id', width: 30 },
    { header: 'Title', key: 'title', width: 32 },
    { header: 'Project', key: 'project', width: 24 },
    { header: 'Assignee', key: 'assignee', width: 24 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Points', key: 'points', width: 12 },
    { header: 'Due Date', key: 'dueDate', width: 20 },
    { header: 'Approved At', key: 'approvedAt', width: 20 },
  ];

  for (const task of tasks) {
    worksheet.addRow({
      id: String(task._id),
      title: task.title,
      project: task.project?.name || '-',
      assignee: task.assignee?.fullName || '-',
      status: task.status,
      points: task.pointsAwarded,
      dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString('ar-IQ') : '-',
      approvedAt: task.approvedAt ? new Date(task.approvedAt).toLocaleDateString('ar-IQ') : '-',
    });
  }

  worksheet.getRow(1).font = { bold: true };

  return workbook.xlsx.writeBuffer();
};
