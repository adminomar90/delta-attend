import PDFDocument from 'pdfkit';

const toHours = (minutes) => Number((Math.max(0, Number(minutes || 0)) / 60).toFixed(2));

const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-US') : '-');

export const buildAttendancePdfBuffer = async (rows = [], { fromLabel, toLabel } = {}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Delta Plus - Attendance Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Range: ${fromLabel || '-'} -> ${toLabel || '-'}`);
    doc.text(`Generated at: ${new Date().toLocaleString('en-US')}`);
    doc.moveDown();

    rows.forEach((row, index) => {
      const workedMinutes = Number(row.durationMinutes || 0);

      doc
        .fontSize(11)
        .text(`${index + 1}. ${row.employeeName || '-'} (${row.employeeCode || '-'})`)
        .fontSize(9)
        .text(`Status: ${row.status || '-'} | Worked: ${workedMinutes} min (${toHours(workedMinutes)} h)`)
        .text(`Check-In: ${formatDateTime(row.checkInAt)} | Check-Out: ${formatDateTime(row.checkOutAt)}`)
        .text(
          `In Location: ${row.checkInLocation?.latitude ?? '-'}, ${row.checkInLocation?.longitude ?? '-'} | Out Location: ${row.checkOutLocation?.latitude ?? '-'}, ${row.checkOutLocation?.longitude ?? '-'}`,
        )
        .moveDown(0.7);
    });

    doc.end();
  });

