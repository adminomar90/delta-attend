import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.resolve(__dirname, 'fonts', 'arial.ttf');
const FONT_BOLD = path.resolve(__dirname, 'fonts', 'arialbd.ttf');

const safe = (value) => String(value ?? '-');

const writeSection = (doc, { title, rows = [] }) => {
  if (!rows.length) {
    return;
  }

  if (doc.y > 700) {
    doc.addPage();
  }

  doc.font('ArB').fontSize(13).fillColor('#102a5e').text(title, { align: 'right' });
  doc.moveDown(0.3);

  rows.forEach((row, index) => {
    if (doc.y > 730) {
      doc.addPage();
    }

    doc
      .font('Ar')
      .fontSize(9)
      .fillColor('#1e272e')
      .text(`${index + 1}. ${row}`, { align: 'right', lineGap: 2 });
  });

  doc.moveDown(0.8);
};

export const buildMaterialsPdfBuffer = async ({
  generatedAt = new Date(),
  requests = [],
  dispatches = [],
  openCustodies = [],
  reconciliations = [],
  movement = [],
  projectSummary = [],
} = {}) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 34, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD)) {
      doc.registerFont('Ar', FONT_REGULAR);
      doc.registerFont('ArB', FONT_BOLD);
    } else {
      doc.registerFont('Ar', 'Helvetica');
      doc.registerFont('ArB', 'Helvetica-Bold');
    }

    doc.rect(0, 0, doc.page.width, 70).fill('#0d1f3c');
    doc.font('ArB').fontSize(18).fillColor('#ffffff').text('Delta Plus - تقارير إدارة المواد', 34, 20, {
      align: 'center',
      width: doc.page.width - 68,
    });
    doc.font('Ar').fontSize(9).fillColor('#a6bfd9').text(`تاريخ الإنشاء: ${new Date(generatedAt).toLocaleString('ar-IQ')}`, 34, 48, {
      align: 'center',
      width: doc.page.width - 68,
    });

    doc.moveDown(3.2);

    writeSection(doc, {
      title: '1) تقرير طلبات المواد',
      rows: requests.map((row) =>
        `الطلب ${safe(row.requestNo)} | المشروع: ${safe(row.projectName)} | مقدم الطلب: ${safe(row.requestedBy)} | الحالة: ${safe(row.status)} | البنود: ${safe(row.itemsCount)}`,
      ),
    });

    writeSection(doc, {
      title: '2) تقرير التجهيز والتسليم',
      rows: dispatches.map((row) =>
        `السند ${safe(row.dispatchNo)} | الطلب: ${safe(row.requestNo)} | المشروع: ${safe(row.projectName)} | المستلم: ${safe(row.recipient)} | الكمية: ${safe(row.deliveredQty)} | الحالة: ${safe(row.status)}`,
      ),
    });

    writeSection(doc, {
      title: '3) تقرير الذمم المفتوحة',
      rows: openCustodies.map((row) =>
        `الذمة ${safe(row.custodyNo)} | الموظف: ${safe(row.holder)} | المشروع: ${safe(row.projectName)} | المستلم: ${safe(row.receivedQty)} | المصروف: ${safe(row.consumedQty)} | المتبقي: ${safe(row.remainingQty)} | ${safe(row.status)}`,
      ),
    });

    writeSection(doc, {
      title: '4) تقرير التصفية',
      rows: reconciliations.map((row) =>
        `التصفية ${safe(row.reconcileNo)} | الذمة: ${safe(row.custodyNo)} | المشروع: ${safe(row.projectName)} | المصروف: ${safe(row.consumedQty)} | المرجع: ${safe(row.toReturnQty)} | التالف: ${safe(row.damagedQty)} | المفقود: ${safe(row.lostQty)} | ${safe(row.status)}`,
      ),
    });

    writeSection(doc, {
      title: '5) تقرير حركة المادة',
      rows: movement.map((row) =>
        `${safe(row.date)} | المادة: ${safe(row.materialName)} | المخزن: ${safe(row.warehouse)} | ${safe(row.transactionType)} | الكمية: ${safe(row.quantity)} | المرجع: ${safe(row.referenceId)}`,
      ),
    });

    writeSection(doc, {
      title: '6) تقرير حسب المشروع',
      rows: projectSummary.map((row) =>
        `${safe(row.projectName)} | الطلبات: ${safe(row.requestsCount)} | المطلوبة: ${safe(row.requestedQty)} | المجهزة: ${safe(row.preparedQty)} | المصروفة: ${safe(row.consumedQty)} | المرجعة: ${safe(row.returnedQty)} | المتبقي: ${safe(row.remainingQty)}`,
      ),
    });

    doc.end();
  });
