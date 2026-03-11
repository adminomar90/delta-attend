import ExcelJS from 'exceljs';

const toHours = (minutes) => Number((Math.max(0, Number(minutes || 0)) / 60).toFixed(2));

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-US') : '-');

export const buildAttendanceExcelBuffer = async (rows = [], { fromLabel, toLabel } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Attendance Report');

  worksheet.columns = [
    { header: 'Employee Name', key: 'employeeName', width: 28 },
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Check-In At', key: 'checkInAt', width: 24 },
    { header: 'Check-Out At', key: 'checkOutAt', width: 24 },
    { header: 'Worked Minutes', key: 'workedMinutes', width: 16 },
    { header: 'Worked Hours', key: 'workedHours', width: 14 },
    { header: 'Check-In Lat', key: 'checkInLat', width: 14 },
    { header: 'Check-In Lng', key: 'checkInLng', width: 14 },
    { header: 'Check-Out Lat', key: 'checkOutLat', width: 14 },
    { header: 'Check-Out Lng', key: 'checkOutLng', width: 14 },
    { header: 'Check-In Accuracy (m)', key: 'checkInAccuracy', width: 18 },
    { header: 'Check-Out Accuracy (m)', key: 'checkOutAccuracy', width: 19 },
  ];

  rows.forEach((row) => {
    const workedMinutes = Number(row.durationMinutes || 0);

    worksheet.addRow({
      employeeName: row.employeeName || '-',
      employeeCode: row.employeeCode || '-',
      status: row.status || '-',
      checkInAt: formatDateTime(row.checkInAt),
      checkOutAt: formatDateTime(row.checkOutAt),
      workedMinutes,
      workedHours: toHours(workedMinutes),
      checkInLat: row.checkInLocation?.latitude ?? '-',
      checkInLng: row.checkInLocation?.longitude ?? '-',
      checkOutLat: row.checkOutLocation?.latitude ?? '-',
      checkOutLng: row.checkOutLocation?.longitude ?? '-',
      checkInAccuracy: row.checkInLocation?.accuracyMeters ?? '-',
      checkOutAccuracy: row.checkOutLocation?.accuracyMeters ?? '-',
    });
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.insertRow(1, [`Attendance Report | ${fromLabel || '-'} -> ${toLabel || '-'}`]);
  worksheet.mergeCells('A1:M1');
  worksheet.getCell('A1').font = { bold: true, size: 12 };

  return workbook.xlsx.writeBuffer();
};

