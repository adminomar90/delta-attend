import {
  COLORS,
  createDoc,
  drawDataTable,
  drawHeader,
  drawKpiCards,
  drawSectionTitle,
  finalize,
  safe,
} from './pdfTemplate.js';

const writeEmptyState = (ctx, message) => {
  ctx.doc
    .font(ctx.F)
    .fontSize(8.5)
    .fillColor(COLORS.soft)
    .text(message, ctx.ML, ctx.doc.y, {
      width: ctx.CW,
      align: 'right',
      features: ['arab'],
    });
  ctx.doc.moveDown(0.6);
};

const drawSimpleTable = (ctx, title, headers, rows, colWidths) => {
  drawSectionTitle(ctx, title);

  if (!rows.length) {
    writeEmptyState(ctx, 'لا توجد بيانات مسجلة.');
    return;
  }

  drawDataTable(ctx, {
    headers,
    rows,
    colWidths,
  });
};

export const buildNetworkCustomerPdfBuffer = async (workspace = {}) => {
  const customer = workspace.customer || {};
  const ctx = createDoc({ title: `توثيق الشبكة - ${safe(customer.name)}` });

  drawHeader(ctx, {
    title: 'توثيق شبكات الزبائن',
    reportId: safe(customer.name),
    date: new Date(),
  });

  drawKpiCards(ctx, [
    { label: 'الفروع', value: `${(workspace.branches || []).length}` },
    { label: 'الأجهزة', value: `${(workspace.devices || []).length}` },
    { label: 'الشبكات الفرعية', value: `${(workspace.subnets || []).length}` },
    { label: 'VLAN', value: `${(workspace.vlans || []).length}` },
  ]);

  drawSimpleTable(
    ctx,
    'معلومات الزبون',
    ['الحقل', 'القيمة'],
    [
      ['اسم الزبون', safe(customer.name)],
      ['حالة العقد', safe(customer.contractStatus)],
      ['العنوان', safe(customer.companyAddress)],
      ['المسؤول', safe(customer.responsiblePerson?.name)],
      ['هاتف المسؤول', safe(customer.responsiblePerson?.phone)],
      ['ملاحظات', safe(customer.notes)],
    ],
    [0.28, 0.72],
  );

  drawSimpleTable(
    ctx,
    'الفروع',
    ['#', 'الفرع', 'المدينة', 'النوع', 'حالة التوثيق'],
    (workspace.branches || []).map((branch, index) => [
      `${index + 1}`,
      safe(branch.name),
      safe(branch.city),
      safe(branch.siteType),
      safe(branch.documentationStatus),
    ]),
    [0.06, 0.34, 0.2, 0.18, 0.22],
  );

  drawSimpleTable(
    ctx,
    'الأجهزة',
    ['#', 'الاسم', 'النوع', 'الموديل', 'IP الإدارة', 'الفرع'],
    (workspace.devices || []).map((device, index) => [
      `${index + 1}`,
      safe(device.name),
      safe(device.deviceType),
      safe(device.model),
      safe(device.managementIp),
      safe(device.branch?.name),
    ]),
    [0.05, 0.24, 0.16, 0.2, 0.17, 0.18],
  );

  drawSimpleTable(
    ctx,
    'IP Plan',
    ['#', 'IP', 'النوع', 'Subnet', 'الجهاز/الغرض'],
    (workspace.ipAllocations || []).map((record, index) => [
      `${index + 1}`,
      safe(record.ipAddress),
      safe(record.ipType),
      safe(record.subnet?.cidr),
      safe(record.device?.name || record.hostname || record.purpose),
    ]),
    [0.05, 0.18, 0.18, 0.24, 0.35],
  );

  drawSimpleTable(
    ctx,
    'VLAN',
    ['#', 'ID', 'الاسم', 'الغرض', 'Subnet'],
    (workspace.vlans || []).map((vlan, index) => [
      `${index + 1}`,
      `${vlan.vlanId}`,
      safe(vlan.name),
      safe(vlan.purpose),
      safe(vlan.subnet?.cidr),
    ]),
    [0.05, 0.1, 0.24, 0.33, 0.28],
  );

  drawSimpleTable(
    ctx,
    'WAN / Internet',
    ['#', 'المزود', 'النوع', 'السرعة', 'Public IP'],
    (workspace.wanLinks || []).map((wan, index) => [
      `${index + 1}`,
      safe(wan.ispName),
      safe(wan.connectionType),
      `${Number(wan.speed?.downloadMbps || 0)}/${Number(wan.speed?.uploadMbps || 0)} Mbps`,
      safe((wan.publicIps || []).join(', ')),
    ]),
    [0.05, 0.24, 0.18, 0.19, 0.34],
  );

  drawSimpleTable(
    ctx,
    'VPN',
    ['#', 'الاسم', 'النوع', 'Peer IP', 'الحالة'],
    (workspace.vpnTunnels || []).map((vpn, index) => [
      `${index + 1}`,
      safe(vpn.name),
      safe(vpn.vpnType),
      safe(vpn.peerIp),
      safe(vpn.status),
    ]),
    [0.05, 0.28, 0.23, 0.22, 0.22],
  );

  drawSimpleTable(
    ctx,
    'Wi-Fi',
    ['#', 'SSID', 'الحماية', 'VLAN', 'الحالة'],
    (workspace.wifiProfiles || []).map((wifi, index) => [
      `${index + 1}`,
      safe(wifi.ssid),
      safe(wifi.securityType),
      safe(wifi.vlan?.name || wifi.vlan?.vlanId),
      safe(wifi.status),
    ]),
    [0.05, 0.28, 0.23, 0.22, 0.22],
  );

  return finalize(ctx, { footerLabel: 'توثيق شبكات الزبائن' });
};
