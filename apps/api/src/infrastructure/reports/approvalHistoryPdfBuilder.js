import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.resolve(__dirname, 'fonts', 'arial.ttf');
const FONT_BOLD = path.resolve(__dirname, 'fonts', 'arialbd.ttf');

const safe = (value) => String(value ?? '-');

const ensureFonts = (doc) => {
  if (fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD)) {
    doc.registerFont('ReportRegular', FONT_REGULAR);
    doc.registerFont('ReportBold', FONT_BOLD);
    return;
  }

  doc.registerFont('ReportRegular', 'Helvetica');
  doc.registerFont('ReportBold', 'Helvetica-Bold');
};

const writeLine = (doc, value, { bold = false, size = 9, color = '#1e293b' } = {}) => {
  doc
    .font(bold ? 'ReportBold' : 'ReportRegular')
    .fontSize(size)
    .fillColor(color)
    .text(value, { align: 'left', lineGap: 2 });
};

export const buildApprovalHistoryPdfBuffer = async (rows = [], { generatedAt = new Date() } = {}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 32, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    ensureFonts(doc);

    doc.rect(0, 0, doc.page.width, 76).fill('#0f172a');
    doc.fillColor('#ffffff');
    doc.font('ReportBold').fontSize(18).text('Delta Plus - Approval History', 32, 22, {
      width: doc.page.width - 64,
      align: 'center',
    });
    doc.font('ReportRegular').fontSize(9).fillColor('#cbd5e1').text(
      `Generated At: ${generatedAt.toISOString()}`,
      32,
      50,
      { width: doc.page.width - 64, align: 'center' },
    );

    doc.moveDown(3.2);

    rows.forEach((row, index) => {
      if (doc.y > 700) {
        doc.addPage();
      }

      doc.roundedRect(32, doc.y, doc.page.width - 64, 16, 8).fill('#e2e8f0');
      doc.fillColor('#0f172a');
      doc.font('ReportBold').fontSize(10).text(`${index + 1}. ${safe(row.operationNumber)} - ${safe(row.title)}`, 40, doc.y - 12, {
        width: doc.page.width - 80,
      });
      doc.moveDown(0.8);

      writeLine(doc, `Type: ${safe(row.operationType)} | Status: ${safe(row.approvalStatus)} / ${safe(row.rawStatus)}`);
      writeLine(doc, `Creator: ${safe(row.createdBy)} (${safe(row.createdByRole)}) | Employee: ${safe(row.employeeName)} (${safe(row.employeeCode)})`);
      writeLine(doc, `Project / Department: ${safe(row.projectOrDepartment)} | Points: ${safe(row.points)}`);
      writeLine(doc, `Approver: ${safe(row.approverName)} (${safe(row.approverRole)}) | Permission: ${safe(row.approverPermission)}`);
      writeLine(doc, `Created: ${safe(row.createdDate)} ${safe(row.createdTime)} | Approved: ${safe(row.approvalDate)} ${safe(row.approvalTime)}`);
      writeLine(doc, `Notes: ${safe(row.notes)}`);
      writeLine(doc, `Approval Steps: ${safe(row.approvalSteps)}`);
      writeLine(doc, `Full Details: ${safe(row.fullDetails)}`);
      doc.moveDown(1);
    });

    doc.end();
  });
