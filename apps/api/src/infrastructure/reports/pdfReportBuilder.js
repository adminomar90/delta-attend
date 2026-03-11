import PDFDocument from 'pdfkit';

export const buildTasksPdfBuffer = async (tasks) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Delta Plus - Tasks Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Generated at: ${new Date().toLocaleString('en-US')}`);
    doc.moveDown();

    tasks.forEach((task, index) => {
      doc
        .fontSize(12)
        .text(`${index + 1}. ${task.title}`)
        .fontSize(10)
        .text(`Project: ${task.project?.name || '-'} | Assignee: ${task.assignee?.fullName || '-'}`)
        .text(`Status: ${task.status} | Points: ${task.pointsAwarded}`)
        .text(`Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US') : '-'} | Approved: ${task.approvedAt ? new Date(task.approvedAt).toLocaleDateString('en-US') : '-'}`)
        .moveDown(0.8);
    });

    doc.end();
  });
};
