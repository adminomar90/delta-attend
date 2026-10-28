import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { auditService } from '../../application/services/auditService.js';
import {
  AttachmentCategory,
  BranchSiteType,
  buildMaskedPreview,
  ContractStatus,
  DeviceStatus,
  DeviceType,
  DocumentationStatus,
  ensureEnum,
  ensureReasonIfProvided,
  IpAllocationType,
  isIpInCidr,
  normalizeCoordinates,
  normalizeCidr,
  normalizeDhcpRanges,
  normalizeDnsServers,
  normalizeIpv4,
  normalizeMacAddress,
  SecretType,
  SensitiveAttachmentCategories,
  toCleanString,
  toFiniteNumber,
  toOptionalDate,
  toStringArray,
  VlanPortMode,
  VpnType,
  WanConnectionType,
  WifiSecurityType,
} from '../../application/services/networkDocsService.js';
import { NetworkDocsRepository } from '../../infrastructure/db/repositories/NetworkDocsRepository.js';
import { buildNetworkCustomerPdfBuffer } from '../../infrastructure/reports/networkDocsPdfBuilder.js';
import { AppError, asyncHandler } from '../../shared/errors.js';
import { decryptSensitiveValue, encryptSensitiveValue } from '../../shared/security.js';
import { normalizeAttachmentFileName } from '../../shared/attachmentFileName.js';
import { Permission } from '../../shared/constants.js';
import { hasPermission } from '../../shared/permissions.js';
import { buildCameraWorkbook, parseCameraWorkbook, planCameraImport, cameraImportToken, verifyCameraImportToken } from '../../application/services/cameraExcelService.js';
import { pingStoredNetworkAddress } from '../../application/services/networkPingService.js';
import { normalizeNetworkCustomerLogo } from '../../shared/networkCustomerLogo.js';

const repository = new NetworkDocsRepository();

const publicNetworkDocsDir = path.resolve(process.cwd(), env.uploadsDir, 'network-docs');
const privateNetworkDocsDir = path.resolve(process.cwd(), env.privateUploadsDir, 'network-docs');

const toId = (value) => String(value?._id || value?.id || value || '');
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const toObjectIdString = (value, fieldName, { required = false } = {}) => {
  const raw = toCleanString(value);
  if (!raw) {
    if (required) {
      throw new AppError(`${fieldName} is required`, 400);
    }
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }

  return raw;
};

const parseObjectArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  const raw = toCleanString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const sanitizeFileName = (value = '') =>
  String(value || 'file')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const ensureDirectory = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const storeAttachmentBuffer = async ({
  file,
  category,
  customerId,
  branchId = '',
}) => {
  const storageScope = SensitiveAttachmentCategories.has(category) ? 'PRIVATE' : 'PUBLIC';
  const baseDir = storageScope === 'PRIVATE' ? privateNetworkDocsDir : publicNetworkDocsDir;
  const relativeParts = [
    customerId,
    branchId || 'shared',
    String(category || AttachmentCategory.OTHER).toLowerCase(),
  ];
  const targetDir = path.join(baseDir, ...relativeParts);
  await ensureDirectory(targetDir);

  const extension = path.extname(normalizeAttachmentFileName(file.originalname)).replace(/[^a-zA-Z0-9.]/g, '');
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const storagePath = path.join(targetDir, filename);
  await fs.writeFile(storagePath, file.buffer);

  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const publicUrl = storageScope === 'PUBLIC'
    ? `/uploads/network-docs/${relativeParts.join('/')}/${filename}`
    : '';

  return {
    storageScope,
    storagePath,
    publicUrl,
    checksum,
  };
};

const markBranchDocumentationChanged = async (branchId) => {
  if (!branchId) {
    return null;
  }

  const branch = await repository.findBranchById(branchId);
  if (!branch) {
    return null;
  }

  const currentStatus = branch.documentationStatus || DocumentationStatus.NOT_STARTED;
  const nextStatus = currentStatus === DocumentationStatus.APPROVED
    ? DocumentationStatus.OUTDATED
    : currentStatus === DocumentationStatus.NOT_STARTED
      ? DocumentationStatus.IN_PROGRESS
      : currentStatus;

  if (nextStatus !== currentStatus) {
    await repository.updateBranchById(branchId, { documentationStatus: nextStatus });
  }

  return nextStatus;
};

const logNetworkChange = async ({
  req,
  action,
  changeType,
  entityType,
  entityId,
  customerId,
  branchId = null,
  before = null,
  after = null,
  reason = '',
}) => {
  await repository.createChangeLog({
    customer: customerId,
    branch: branchId || null,
    entityType,
    entityId: toId(entityId),
    action,
    changeType,
    reason,
    before,
    after,
    changedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action,
    entityType,
    entityId,
    before,
    after: {
      ...(after || {}),
      changeReason: reason,
    },
    req,
  });
};

const toCustomerResponse = (customer) => customer ? ({ ...customer.toObject(), id: toId(customer) }) : null;
const toCustomerAuditResponse = (customer) => {
  const { logoDataUrl, ...response } = toCustomerResponse(customer);
  return { ...response, hasLogo: !!logoDataUrl };
};
const toBranchResponse = (branch) => branch ? ({ ...branch.toObject(), id: toId(branch) }) : null;

const toSecretSummary = (secret) => {
  if (!secret) {
    return null;
  }

  return {
    id: toId(secret),
    secretType: secret.secretType,
    maskedPreview: secret.maskedPreview,
    createdAt: secret.createdAt || null,
    lastViewedAt: secret.lastViewedAt || null,
  };
};

const toEntityResponse = (entity) => {
  if (!entity) {
    return null;
  }

  const plain = entity.toObject ? entity.toObject() : entity;
  const response = {
    ...plain,
    id: toId(plain),
  };
  delete response.cameraImportLock;
  if (typeof plain.originalName === 'string') response.originalName = normalizeAttachmentFileName(plain.originalName);

  if (plain.secret) {
    response.secret = toSecretSummary(plain.secret);
  }

  if (plain.subscriptionInfo?.secret) {
    response.subscriptionInfo = {
      ...plain.subscriptionInfo,
      secret: toSecretSummary(plain.subscriptionInfo.secret),
    };
  }

  return response;
};

const ensureCustomerExists = async (customerId) => {
  const customer = await repository.findCustomerById(customerId);
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  return customer;
};

const ensureBranchExists = async (branchId) => {
  const branch = await repository.findBranchById(branchId);
  if (!branch) {
    throw new AppError('Branch not found', 404);
  }

  return branch;
};

const ensureSubnetForBranch = async (subnetId, branchId) => {
  if (!subnetId) {
    return null;
  }

  const subnet = await repository.findSubnetById(subnetId);
  if (!subnet || toId(subnet.branch) !== String(branchId)) {
    throw new AppError('Subnet not found in this branch', 404);
  }

  return subnet;
};

const ensureDeviceForBranch = async (deviceId, branchId) => {
  if (!deviceId) {
    return null;
  }

  const device = await repository.findDeviceById(deviceId);
  if (!device || toId(device.branch) !== String(branchId)) {
    throw new AppError('Device not found in this branch', 404);
  }

  return device;
};

const upsertSecret = async ({
  ownerType,
  ownerId,
  secretType,
  rawSecret,
  req,
  preserveWhitespace = false,
}) => {
  const value = preserveWhitespace ? String(rawSecret ?? '') : toCleanString(rawSecret);
  if (!value) {
    return null;
  }

  const encrypted = encryptSensitiveValue(value);
  const existing = await repository.findSecretByOwner({
    ownerType,
    ownerId: String(ownerId),
    secretType,
  });

  if (existing) {
    return repository.updateSecretById(existing._id, {
      ...encrypted,
      maskedPreview: secretType === SecretType.DEVICE_PASSWORD ? '••••••••' : buildMaskedPreview(value),
      rotatedAt: new Date(),
    });
  }

  return repository.createSecret({
    ownerType,
    ownerId: String(ownerId),
    secretType,
    ...encrypted,
    maskedPreview: secretType === SecretType.DEVICE_PASSWORD ? '••••••••' : buildMaskedPreview(value),
    createdBy: req.user.id,
  });
};

const normalizeCustomerPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'name')) {
    const name = toCleanString(body.name);
    if (!name) {
      throw new AppError('name is required', 400);
    }
    payload.name = name;
  }

  if (!partial || hasOwn(body, 'companyAddress')) payload.companyAddress = toCleanString(body.companyAddress);
  if (!partial || hasOwn(body, 'logoDataUrl')) payload.logoDataUrl = normalizeNetworkCustomerLogo(body.logoDataUrl);
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);
  if (!partial || hasOwn(body, 'tags')) payload.tags = toStringArray(body.tags);

  if (!partial || hasOwn(body, 'contractStatus')) {
    payload.contractStatus = ensureEnum(
      body.contractStatus || ContractStatus.ACTIVE,
      ContractStatus,
      'contractStatus',
    );
  }

  if (!partial || hasOwn(body, 'contactInfo')) {
    const source = body.contactInfo || {};
    payload.contactInfo = {
      phones: toStringArray(source.phones),
      emails: toStringArray(source.emails).map((item) => item.toLowerCase()),
      website: toCleanString(source.website),
    };
  }

  if (!partial || hasOwn(body, 'responsiblePerson')) {
    const responsible = body.responsiblePerson || {};
    payload.responsiblePerson = {
      name: toCleanString(responsible.name),
      title: toCleanString(responsible.title),
      phone: toCleanString(responsible.phone),
      email: toCleanString(responsible.email).toLowerCase(),
    };
  }

  return payload;
};

const normalizeBranchPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'name')) {
    const name = toCleanString(body.name);
    if (!name) {
      throw new AppError('name is required', 400);
    }
    payload.name = name;
  }

  if (!partial || hasOwn(body, 'city')) payload.city = toCleanString(body.city);
  if (!partial || hasOwn(body, 'address')) payload.address = toCleanString(body.address);
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);

  if (!partial || hasOwn(body, 'siteType')) {
    payload.siteType = ensureEnum(body.siteType || BranchSiteType.BRANCH, BranchSiteType, 'siteType');
  }

  if (!partial || hasOwn(body, 'geo')) {
    payload.geo = normalizeCoordinates(body.geo || {});
  }

  if (!partial || hasOwn(body, 'documentationStatus')) {
    payload.documentationStatus = ensureEnum(
      body.documentationStatus || DocumentationStatus.NOT_STARTED,
      DocumentationStatus,
      'documentationStatus',
    );
  }

  return payload;
};

const normalizeDevicePayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'name')) {
    const name = toCleanString(body.name) || (body.deviceType === DeviceType.CAMERA && toCleanString(body.cameraNumber) ? `كاميرا ${toCleanString(body.cameraNumber)}` : body.deviceType === DeviceType.UPS && toCleanString(body.patchPanelNumber) && toCleanString(body.patchPanelPort) ? `باج ${toCleanString(body.patchPanelNumber)} / منفذ ${toCleanString(body.patchPanelPort)}` : body.deviceType === DeviceType.UPS && toCleanString(body.portNumber) ? `منفذ ${toCleanString(body.portNumber)}` : '');
    if (!name) {
      throw new AppError('name is required', 400);
    }
    payload.name = name;
  }

  if (!partial || hasOwn(body, 'deviceType')) {
    payload.deviceType = ensureEnum(body.deviceType || DeviceType.ROUTER, DeviceType, 'deviceType');
  }

  if (!partial || hasOwn(body, 'vendor')) payload.vendor = toCleanString(body.vendor);
  if (!partial || hasOwn(body, 'model')) payload.model = toCleanString(body.model);
  if (!partial || hasOwn(body, 'portCount')) {
    const count = body.portCount === '' || body.portCount == null ? null : Number(body.portCount);
    if (count !== null && (!Number.isSafeInteger(count) || count < 1)) throw new AppError('عدد المنافذ يجب أن يكون عدداً صحيحاً موجباً', 400);
    payload.portCount = count;
  }
  if (!partial || hasOwn(body, 'serialNumber')) payload.serialNumber = toCleanString(body.serialNumber).toUpperCase();
  if (!partial || hasOwn(body, 'macAddress')) payload.macAddress = normalizeMacAddress(body.macAddress);
  if (!partial || hasOwn(body, 'managementIp')) payload.managementIp = normalizeIpv4(body.managementIp, { allowEmpty: true });
  if (!partial || hasOwn(body, 'username')) payload.username = toCleanString(body.username);
  if (!partial || hasOwn(body, 'extensionNumber')) payload.extensionNumber = toCleanString(body.extensionNumber);
  for (const field of ['cameraNumber', 'switchNumber', 'switchPort', 'portNumber', 'patchPanelPort', 'patchPanelNumber', 'connectedDeviceType', 'vlanNumber']) {
    if (!partial || hasOwn(body, field)) payload[field] = toCleanString(body[field]);
  }
  if (body.deviceType === DeviceType.CAMERA && hasOwn(body, 'cameraNumber') && !payload.cameraNumber) throw new AppError('رقم الكاميرا مطلوب', 400);
  if (body.deviceType === DeviceType.UPS && hasOwn(body, 'portNumber') && !payload.portNumber) throw new AppError('رقم المنفذ مطلوب', 400);
  if (body.deviceType === DeviceType.UPS && ['patchPanelPort', 'patchPanelNumber'].some((field) => hasOwn(body, field) && !payload[field])) throw new AppError('رقم الباج بنل ورقم المنفذ فيه مطلوبان', 400);
  if (payload.vlanNumber && (!/^\d+$/.test(payload.vlanNumber) || Number(payload.vlanNumber) < 1 || Number(payload.vlanNumber) > 4094)) throw new AppError('رقم VLAN يجب أن يكون بين 1 و4094', 400);
  if (hasOwn(body, 'password') && (typeof body.password !== 'string' || body.password.length > 4096)) throw new AppError('كلمة مرور الجهاز غير صالحة', 400);
  if (!partial || hasOwn(body, 'physicalLocation')) payload.physicalLocation = toCleanString(body.physicalLocation);
  if (!partial || hasOwn(body, 'rackName')) payload.rackName = toCleanString(body.rackName);
  if (!partial || hasOwn(body, 'rackPosition')) payload.rackPosition = toCleanString(body.rackPosition);
  if (!partial || hasOwn(body, 'firmwareVersion')) payload.firmwareVersion = toCleanString(body.firmwareVersion);
  if (!partial || hasOwn(body, 'installedAt')) payload.installedAt = toOptionalDate(body.installedAt);
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);

  if (!partial || hasOwn(body, 'status')) {
    payload.status = ensureEnum(body.status || DeviceStatus.ACTIVE, DeviceStatus, 'status');
  }

  return payload;
};

const normalizeSubnetPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'name')) payload.name = toCleanString(body.name);
  if (!partial || hasOwn(body, 'purpose')) payload.purpose = toCleanString(body.purpose);
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);

  if (!partial || hasOwn(body, 'cidr')) payload.cidr = normalizeCidr(body.cidr);
  if (!partial || hasOwn(body, 'gateway')) payload.gateway = normalizeIpv4(body.gateway, { allowEmpty: true });
  if (!partial || hasOwn(body, 'dnsServers')) payload.dnsServers = normalizeDnsServers(body.dnsServers);
  if (!partial || hasOwn(body, 'dhcpRanges')) payload.dhcpRanges = normalizeDhcpRanges(body.dhcpRanges);
  if (!partial || hasOwn(body, 'vlanId')) payload.vlan = toObjectIdString(body.vlanId, 'vlanId');

  return payload;
};

const normalizeIpAllocationPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'ipAddress')) payload.ipAddress = normalizeIpv4(body.ipAddress);
  if (!partial || hasOwn(body, 'hostname')) payload.hostname = toCleanString(body.hostname);
  if (!partial || hasOwn(body, 'purpose')) payload.purpose = toCleanString(body.purpose);
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);
  if (!partial || hasOwn(body, 'subnetId')) payload.subnet = toObjectIdString(body.subnetId, 'subnetId');
  if (!partial || hasOwn(body, 'deviceId')) payload.device = toObjectIdString(body.deviceId, 'deviceId');

  if (!partial || hasOwn(body, 'ipType')) {
    payload.ipType = ensureEnum(body.ipType || IpAllocationType.STATIC, IpAllocationType, 'ipType');
  }

  return payload;
};

const normalizeVlanPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'vlanId')) {
    const vlanId = Math.round(toFiniteNumber(body.vlanId, 0));
    if (vlanId < 1 || vlanId > 4094) {
      throw new AppError('vlanId must be between 1 and 4094', 400);
    }
    payload.vlanId = vlanId;
  }

  if (!partial || hasOwn(body, 'name')) {
    const name = toCleanString(body.name);
    if (!name) {
      throw new AppError('name is required', 400);
    }
    payload.name = name;
  }

  if (!partial || hasOwn(body, 'purpose')) payload.purpose = toCleanString(body.purpose);
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);
  if (!partial || hasOwn(body, 'subnetId')) payload.subnet = toObjectIdString(body.subnetId, 'subnetId');

  if (!partial || hasOwn(body, 'ports')) {
    payload.ports = parseObjectArray(body.ports).map((item) => ({
      device: toObjectIdString(item.deviceId || item.device, 'deviceId'),
      portName: toCleanString(item.portName),
      linkMode: ensureEnum(item.linkMode || VlanPortMode.ACCESS, VlanPortMode, 'linkMode'),
      notes: toCleanString(item.notes),
    }));
  }

  return payload;
};

const normalizeWanPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'ispName')) {
    const ispName = toCleanString(body.ispName);
    if (!ispName) {
      throw new AppError('ispName is required', 400);
    }
    payload.ispName = ispName;
  }

  if (!partial || hasOwn(body, 'connectionType')) {
    payload.connectionType = ensureEnum(
      body.connectionType || WanConnectionType.FIBER,
      WanConnectionType,
      'connectionType',
    );
  }

  if (!partial || hasOwn(body, 'downloadMbps') || hasOwn(body, 'uploadMbps')) {
    payload.speed = {
      downloadMbps: Math.max(0, toFiniteNumber(body.downloadMbps, 0)),
      uploadMbps: Math.max(0, toFiniteNumber(body.uploadMbps, 0)),
    };
  }

  if (!partial || hasOwn(body, 'publicIps')) {
    payload.publicIps = toStringArray(body.publicIps).map((item) => normalizeIpv4(item));
  }

  if (!partial || hasOwn(body, 'accountNumber') || hasOwn(body, 'planName') || hasOwn(body, 'contractEndDate')) {
    payload.subscriptionInfo = {
      accountNumber: toCleanString(body.accountNumber),
      planName: toCleanString(body.planName),
      contractEndDate: toOptionalDate(body.contractEndDate),
    };
  }

  if (!partial || hasOwn(body, 'backupLine')) payload.backupLine = toCleanString(body.backupLine);
  if (!partial || hasOwn(body, 'status')) payload.status = toCleanString(body.status).toUpperCase() || 'ACTIVE';
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);

  if (!partial || hasOwn(body, 'technicalSupport')) {
    payload.technicalSupport = parseObjectArray(body.technicalSupport).map((item) => ({
      name: toCleanString(item.name),
      phone: toCleanString(item.phone),
      email: toCleanString(item.email).toLowerCase(),
      notes: toCleanString(item.notes),
    }));
  }

  return payload;
};

const normalizeVpnPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'name')) {
    const name = toCleanString(body.name);
    if (!name) {
      throw new AppError('name is required', 400);
    }
    payload.name = name;
  }

  if (!partial || hasOwn(body, 'vpnType')) {
    payload.vpnType = ensureEnum(body.vpnType || VpnType.SITE_TO_SITE_IPSEC, VpnType, 'vpnType');
  }

  if (!partial || hasOwn(body, 'localSubnets')) payload.localSubnets = toStringArray(body.localSubnets);
  if (!partial || hasOwn(body, 'remoteSubnets')) payload.remoteSubnets = toStringArray(body.remoteSubnets);
  if (!partial || hasOwn(body, 'peerIp')) payload.peerIp = normalizeIpv4(body.peerIp, { allowEmpty: true });
  if (!partial || hasOwn(body, 'routes')) payload.routes = toStringArray(body.routes);
  if (!partial || hasOwn(body, 'firewallRules')) payload.firewallRules = toStringArray(body.firewallRules);
  if (!partial || hasOwn(body, 'natRules')) payload.natRules = toStringArray(body.natRules);
  if (!partial || hasOwn(body, 'status')) payload.status = toCleanString(body.status).toUpperCase() || 'DOWN';
  if (!partial || hasOwn(body, 'notes')) payload.notes = toCleanString(body.notes);

  return payload;
};

const normalizeWifiPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, 'ssid')) {
    const ssid = toCleanString(body.ssid);
    if (!ssid) {
      throw new AppError('ssid is required', 400);
    }
    payload.ssid = ssid;
  }

  if (!partial || hasOwn(body, 'securityType')) {
    payload.securityType = ensureEnum(
      body.securityType || WifiSecurityType.WPA2_PSK,
      WifiSecurityType,
      'securityType',
    );
  }

  if (!partial || hasOwn(body, 'vlanId')) payload.vlan = toObjectIdString(body.vlanId, 'vlanId');
  if (!partial || hasOwn(body, 'accessPointIds')) {
    payload.accessPoints = toStringArray(body.accessPointIds)
      .map((item) => toObjectIdString(item, 'accessPointIds'))
      .filter(Boolean);
  }
  if (!partial || hasOwn(body, 'coverageNotes')) payload.coverageNotes = toCleanString(body.coverageNotes);
  if (!partial || hasOwn(body, 'status')) payload.status = toCleanString(body.status).toUpperCase() || 'ACTIVE';

  return payload;
};

export const networkDocsDashboardSummary = asyncHandler(async (_req, res) => {
  const summary = await repository.getDashboardSummary();
  res.json({ summary });
});

export const listNetworkCustomers = asyncHandler(async (req, res) => {
  const filter = { archivedAt: null };
  if (req.query.contractStatus) {
    filter.contractStatus = ensureEnum(req.query.contractStatus, ContractStatus, 'contractStatus');
  }
  if (req.query.search) {
    filter.name = { $regex: toCleanString(req.query.search), $options: 'i' };
  }

  const [customers, branches, devices] = await Promise.all([
    repository.listCustomers(filter),
    repository.listBranches({}),
    repository.listDevices({}),
  ]);

  const branchCountMap = new Map();
  const branchSummaryMap = new Map();
  const deviceCountMap = new Map();

  for (const branch of branches) {
    const customerId = toId(branch.customer);
    branchCountMap.set(customerId, (branchCountMap.get(customerId) || 0) + 1);
    const summaries = branchSummaryMap.get(customerId) || [];
    summaries.push({ id: toId(branch), name: branch.name, city: branch.city || '', address: branch.address || '', documentationStatus: branch.documentationStatus });
    branchSummaryMap.set(customerId, summaries);
  }

  for (const device of devices) {
    const customerId = toId(device.customer);
    deviceCountMap.set(customerId, (deviceCountMap.get(customerId) || 0) + 1);
  }

  res.json({
    customers: customers.map((customer) => ({
      ...toCustomerResponse(customer),
      branchCount: branchCountMap.get(toId(customer)) || 0,
      branches: branchSummaryMap.get(toId(customer)) || [],
      deviceCount: deviceCountMap.get(toId(customer)) || 0,
    })),
  });
});

export const createNetworkCustomer = asyncHandler(async (req, res) => {
  const payload = normalizeCustomerPayload(req.body);
  const customer = await repository.createCustomer({
    ...payload,
    createdBy: req.user.id,
  });
  const fullCustomer = await repository.findCustomerById(customer._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_CUSTOMER_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_CUSTOMER',
    entityId: customer._id,
    customerId: customer._id,
    after: toCustomerAuditResponse(fullCustomer),
  });

  res.status(201).json({ customer: toCustomerResponse(fullCustomer) });
});

export const getNetworkCustomerWorkspace = asyncHandler(async (req, res) => {
  const workspace = await repository.getCustomerWorkspace(req.params.id);
  if (!workspace) {
    throw new AppError('Customer not found', 404);
  }

  res.json({
    workspace: {
      customer: toCustomerResponse(workspace.customer),
      branches: workspace.branches.map(toBranchResponse),
      devices: workspace.devices.map(toEntityResponse),
      subnets: workspace.subnets.map(toEntityResponse),
      ipAllocations: workspace.ipAllocations.map(toEntityResponse),
      vlans: workspace.vlans.map(toEntityResponse),
      wanLinks: workspace.wanLinks.map(toEntityResponse),
      vpnTunnels: workspace.vpnTunnels.map(toEntityResponse),
      wifiProfiles: workspace.wifiProfiles.map(toEntityResponse),
      attachments: workspace.attachments.map(toEntityResponse),
      changeLogs: workspace.changeLogs.map(toEntityResponse),
    },
  });
});

export const updateNetworkCustomer = asyncHandler(async (req, res) => {
  const customer = await ensureCustomerExists(req.params.id);
  const before = toCustomerAuditResponse(customer);
  const payload = normalizeCustomerPayload(req.body, { partial: true });
  const updated = await repository.updateCustomerById(customer._id, payload);

  await logNetworkChange({
    req,
    action: 'NETWORK_CUSTOMER_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_CUSTOMER',
    entityId: customer._id,
    customerId: customer._id,
    before,
    after: toCustomerAuditResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ customer: toCustomerResponse(updated) });
});

export const listCustomerBranches = asyncHandler(async (req, res) => {
  await ensureCustomerExists(req.params.customerId);
  const branches = await repository.listBranches({ customer: req.params.customerId });
  res.json({ branches: branches.map(toBranchResponse) });
});

export const createCustomerBranch = asyncHandler(async (req, res) => {
  const customer = await ensureCustomerExists(req.params.customerId);
  const payload = normalizeBranchPayload(req.body);
  const branch = await repository.createBranch({
    ...payload,
    customer: customer._id,
    createdBy: req.user.id,
  });
  const fullBranch = await repository.findBranchById(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_BRANCH_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_BRANCH',
    entityId: branch._id,
    customerId: customer._id,
    branchId: branch._id,
    after: toBranchResponse(fullBranch),
  });

  res.status(201).json({ branch: toBranchResponse(fullBranch) });
});

export const updateNetworkBranch = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.id);
  const before = toBranchResponse(branch);
  const payload = normalizeBranchPayload(req.body, { partial: true });
  const updated = await repository.updateBranchById(branch._id, payload);

  await logNetworkChange({
    req,
    action: 'NETWORK_BRANCH_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_BRANCH',
    entityId: branch._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    before,
    after: toBranchResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ branch: toBranchResponse(updated) });
});

export const approveBranchBaseline = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.id);
  const before = toBranchResponse(branch);
  const updated = await repository.updateBranchById(branch._id, {
    documentationStatus: DocumentationStatus.APPROVED,
    lastApprovedAt: new Date(),
  });

  await logNetworkChange({
    req,
    action: 'NETWORK_BRANCH_BASELINE_APPROVED',
    changeType: 'APPROVE',
    entityType: 'NETWORK_BRANCH',
    entityId: branch._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    before,
    after: toBranchResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ branch: toBranchResponse(updated) });
});

export const listBranchDevices = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const devices = await repository.listDevices({ branch: req.params.branchId });
  res.json({ devices: devices.map(toEntityResponse) });
});

export const pingNetworkDevice = asyncHandler(async (req, res) => {
  const device = await repository.findDeviceById(req.params.id);
  if (!device) throw new AppError('الجهاز غير موجود', 404);
  if (!device.managementIp) throw new AppError('سجّل عنوان IP للجهاز قبل إجراء الفحص', 400);
  const result = await pingStoredNetworkAddress(device.managementIp);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ ping: { deviceId: toId(device), ...result } });
});

export const exportNetworkCamerasExcel = asyncHandler(async (req, res) => {
  const type = req.networkExcelType || DeviceType.CAMERA, recorder = type === DeviceType.NVR;
  const group = type === DeviceType.CAMERA ? 'CAMERAS' : recorder ? 'RECORDERS' : 'DEVICES';
  const branch = await ensureBranchExists(req.params.branchId);
  const template = req.query.template === '1', includePasswords = !template && req.query.includePasswords === '1';
  if (includePasswords && !hasPermission(req.user, Permission.VIEW_NETWORK_SECRETS)) throw new AppError('تصدير كلمات المرور يحتاج صلاحية عرض أسرار الشبكة', 403);
  const devices = template ? [] : await repository.listDevices({ branch: branch._id, deviceType: type });
  const secrets = includePasswords ? await repository.findSecretsByIds(devices.map((device) => toId(device.secret)).filter(Boolean)) : [];
  const passwords = new Map(secrets.map((secret) => [toId(secret), decryptSensitiveValue(secret)]));
  const rows = devices.map((device) => ({ portNumber: device.portNumber || device.name, patchPanelPort: device.patchPanelPort, patchPanelNumber: device.patchPanelNumber, connectedDeviceType: device.connectedDeviceType, vlanNumber: device.vlanNumber, vendor: device.vendor, serialNumber: device.serialNumber, macAddress: device.macAddress, physicalLocation: device.physicalLocation, notes: device.notes, name: device.name, model: device.model, portCount: device.portCount, cameraNumber: device.cameraNumber || device.name, managementIp: device.managementIp, switchNumber: device.switchNumber,
    switchPort: device.switchPort, username: device.username, extensionNumber: device.extensionNumber, password: includePasswords ? passwords.get(toId(device.secret)) || '' : '' }));
  const buffer = await buildCameraWorkbook(rows, type);
  if (!template) await auditService.log({ actorId: req.user.id, action: `NETWORK_${group}_EXCEL_EXPORTED`, entityType: 'NETWORK_BRANCH', entityId: branch._id, after: { deviceType: type, count: rows.length, includePasswords }, req });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${type.toLowerCase()}-${template ? 'template' : branch._id}.xlsx"`);
  res.setHeader('Cache-Control', 'private, no-store'); res.send(buffer);
});

const loadCameraExcelPlan = async (req) => {
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname || '')) throw new AppError('اختر ملف Excel بصيغة xlsx', 400);
  const type = req.networkExcelType || DeviceType.CAMERA;
  const parsed = await parseCameraWorkbook(req.file.buffer, type);
  const devices = await repository.listDevices({ branch: req.params.branchId });
  return { parsed, devices, ...planCameraImport(parsed, devices, type) };
};

export const previewNetworkCamerasImport = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const { parsed, devices, plan, errors } = await loadCameraExcelPlan(req);
  const expiresAt = Date.now() + 10 * 60000;
  const token = errors.length ? null : cameraImportToken({ rows: parsed.rows, devices, branchId: branch._id, userId: req.user.id, expiresAt, key: env.jwtSecret, type: req.networkExcelType || DeviceType.CAMERA });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ rows: plan.map(({ password, ...row }) => ({ ...row, passwordProvided: !!password })), errors, canImport: !!plan.length && !errors.length,
    createCount: plan.filter((row) => row.action === 'CREATE').length, updateCount: plan.filter((row) => row.action === 'UPDATE').length, previewToken: token });
});

export const importNetworkCamerasExcel = asyncHandler(async (req, res) => {
  const type = req.networkExcelType || DeviceType.CAMERA, camera = type === DeviceType.CAMERA;
  const branch = await ensureBranchExists(req.params.branchId), lockToken = crypto.randomUUID();
  if (!await repository.lockCameraImport(branch._id, lockToken)) throw new AppError('يوجد استيراد جارٍ لهذا الفرع؛ انتظر اكتماله', 409);
  const heartbeat = setInterval(() => repository.refreshCameraImportLock(branch._id, lockToken).catch(() => {}), 20000); heartbeat.unref();
  try {
    const { parsed, devices, plan, errors } = await loadCameraExcelPlan(req);
    if (errors.length) throw new AppError('الملف يحتوي أخطاء؛ أعد معاينة الملف وصححها قبل الاستيراد', 400);
    if (!verifyCameraImportToken(req.body.previewToken, { rows: parsed.rows, devices, branchId: branch._id, userId: req.user.id, key: env.jwtSecret, type })) throw new AppError('تغير الملف أو بيانات الأجهزة أو انتهت المعاينة؛ أعد المعاينة قبل الحفظ', 409);
    let createdCount = 0, updatedCount = 0; const failures = [];
    for (const row of plan) {
      let createdId = null;
      try {
        const body = type === DeviceType.UPS ? { deviceType: type, name: `باج ${row.patchPanelNumber} / منفذ ${row.patchPanelPort}`, model: row.model, patchPanelPort: row.patchPanelPort, patchPanelNumber: row.patchPanelNumber, connectedDeviceType: row.connectedDeviceType, switchPort: row.switchPort, vlanNumber: row.vlanNumber, managementIp: row.managementIp, username: row.username }
          : !camera ? { ...(type === DeviceType.IP_PBX ? { extensionNumber: row.extensionNumber } : {}), ...(type !== DeviceType.NVR ? { vendor: row.vendor, serialNumber: row.serialNumber, macAddress: row.macAddress, physicalLocation: row.physicalLocation, notes: row.notes } : {}), deviceType: type, name: row.name, model: row.model, portCount: row.portCount, managementIp: row.managementIp, username: row.username }
          : { deviceType: DeviceType.CAMERA, name: `كاميرا ${row.cameraNumber}`, cameraNumber: row.cameraNumber, managementIp: row.managementIp,
            switchNumber: row.switchNumber, switchPort: row.switchPort, username: row.username };
        const payload = normalizeDevicePayload(body, { partial: !!row.deviceId });
        if (await repository.findDeviceConflict(branch._id, payload, row.deviceId)) throw new AppError('عنوان IP مستخدم لجهاز آخر', 409);
        let device = row.deviceId ? await repository.updateDeviceById(row.deviceId, payload) : await repository.createDevice({ ...payload, customer: toId(branch.customer), branch: branch._id, createdBy: req.user.id });
        if (!device) throw new AppError('الجهاز لم يعد موجوداً', 404);
        if (!row.deviceId) createdId = device._id;
        const secret = await upsertSecret({ ownerType: 'NETWORK_DEVICE', ownerId: device._id, secretType: SecretType.DEVICE_PASSWORD, rawSecret: row.password, preserveWhitespace: true, req });
        if (secret) await repository.updateDeviceById(device._id, { secret: secret._id });
        if (row.deviceId) updatedCount++; else createdCount++;
      } catch (err) {
        if (createdId) await repository.deleteDeviceById(createdId);
        failures.push({ rowNumber: row.rowNumber, message: err.statusCode ? err.message : 'تعذر حفظ هذا الصف؛ أعد المعاينة والمحاولة.' });
      }
    }
    if (createdCount || updatedCount) await markBranchDocumentationChanged(branch._id);
    const result = { createdCount, updatedCount, failedCount: failures.length, failures };
    await logNetworkChange({ req, action: `NETWORK_${camera ? 'CAMERAS' : type === DeviceType.NVR ? 'RECORDERS' : 'DEVICES'}_EXCEL_IMPORTED`, changeType: 'IMPORT', entityType: 'NETWORK_BRANCH', entityId: branch._id,
      customerId: toId(branch.customer), branchId: branch._id, after: { ...result, deviceType: type } });
    res.json(result);
  } finally { clearInterval(heartbeat); await repository.unlockCameraImport(branch._id, lockToken); }
});

export const createBranchDevice = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  if (branch.cameraImportLock?.until > new Date()) throw new AppError('يوجد استيراد أجهزة جارٍ؛ انتظر اكتماله قبل تعديل أجهزة الفرع', 409);
  const payload = normalizeDevicePayload(req.body);
  if (await repository.findDeviceConflict(branch._id, payload)) throw new AppError('عنوان IP أو الرقم التسلسلي مستخدم لجهاز آخر في هذا الفرع', 409);
  const device = await repository.createDevice({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });
  let fullDevice;
  try {
    const secret = await upsertSecret({ ownerType: 'NETWORK_DEVICE', ownerId: device._id, secretType: SecretType.DEVICE_PASSWORD, rawSecret: req.body.password, preserveWhitespace: true, req });
    fullDevice = secret ? await repository.updateDeviceById(device._id, { secret: secret._id }) : await repository.findDeviceById(device._id);
  } catch (err) { await repository.deleteDeviceById(device._id); throw err; }
  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_DEVICE_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_DEVICE',
    entityId: device._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(fullDevice),
  });

  res.status(201).json({ device: toEntityResponse(fullDevice) });
});

export const updateNetworkDevice = asyncHandler(async (req, res) => {
  const device = await repository.findDeviceById(req.params.id);
  if (!device) {
    throw new AppError('Device not found', 404);
  }
  const branch = await ensureBranchExists(toId(device.branch));
  if (branch.cameraImportLock?.until > new Date()) throw new AppError('يوجد استيراد أجهزة جارٍ؛ انتظر اكتماله قبل تعديل أجهزة الفرع', 409);

  const before = toEntityResponse(device);
  const payload = normalizeDevicePayload(req.body, { partial: true });
  if (await repository.findDeviceConflict(toId(device.branch), payload, device._id)) throw new AppError('عنوان IP أو الرقم التسلسلي مستخدم لجهاز آخر في هذا الفرع', 409);
  let updated = await repository.updateDeviceById(device._id, payload);
  if (!updated) throw new AppError('الجهاز غير موجود', 404);
  const secret = await upsertSecret({ ownerType: 'NETWORK_DEVICE', ownerId: device._id, secretType: SecretType.DEVICE_PASSWORD, rawSecret: req.body.password, preserveWhitespace: true, req });
  if (secret) updated = await repository.updateDeviceById(device._id, { secret: secret._id });
  await markBranchDocumentationChanged(toId(device.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_DEVICE_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_DEVICE',
    entityId: device._id,
    customerId: toId(device.customer),
    branchId: toId(device.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ device: toEntityResponse(updated) });
});

export const deleteNetworkDevice = asyncHandler(async (req, res) => {
  const device = await repository.findDeviceById(req.params.id);
  if (!device) throw new AppError('الجهاز غير موجود', 404);
  const branch = await ensureBranchExists(toId(device.branch));
  if (branch.cameraImportLock?.until > new Date()) throw new AppError('يوجد استيراد أجهزة جارٍ؛ انتظر اكتماله قبل حذف أجهزة الفرع', 409);
  const before = toEntityResponse(device);
  await repository.deleteDeviceById(device._id);
  await markBranchDocumentationChanged(toId(device.branch));
  await logNetworkChange({ req, action: 'NETWORK_DEVICE_DELETED', changeType: 'DELETE', entityType: 'NETWORK_DEVICE', entityId: device._id,
    customerId: toId(device.customer), branchId: toId(device.branch), before, after: { deleted: true }, reason: ensureReasonIfProvided(req.body?.changeReason) });
  res.json({ deleted: true, deviceId: toId(device) });
});

export const listBranchSubnets = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const subnets = await repository.listSubnets({ branch: req.params.branchId });
  res.json({ subnets: subnets.map(toEntityResponse) });
});

export const createBranchSubnet = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const payload = normalizeSubnetPayload(req.body);

  if (payload.gateway && !isIpInCidr(payload.gateway, payload.cidr)) {
    throw new AppError('gateway must be inside the subnet CIDR', 400);
  }

  const subnet = await repository.createSubnet({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });
  const fullSubnet = await repository.findSubnetById(subnet._id);
  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_SUBNET_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_SUBNET',
    entityId: subnet._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(fullSubnet),
  });

  res.status(201).json({ subnet: toEntityResponse(fullSubnet) });
});

export const updateNetworkSubnet = asyncHandler(async (req, res) => {
  const subnet = await repository.findSubnetById(req.params.id);
  if (!subnet) {
    throw new AppError('Subnet not found', 404);
  }

  const before = toEntityResponse(subnet);
  const payload = normalizeSubnetPayload(req.body, { partial: true });
  const effectiveCidr = payload.cidr || subnet.cidr;
  const effectiveGateway = payload.gateway !== undefined ? payload.gateway : subnet.gateway;
  if (effectiveGateway && !isIpInCidr(effectiveGateway, effectiveCidr)) {
    throw new AppError('gateway must be inside the subnet CIDR', 400);
  }

  const updated = await repository.updateSubnetById(subnet._id, payload);
  await markBranchDocumentationChanged(toId(subnet.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_SUBNET_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_SUBNET',
    entityId: subnet._id,
    customerId: toId(subnet.customer),
    branchId: toId(subnet.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ subnet: toEntityResponse(updated) });
});

export const listBranchIpAllocations = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const ipAllocations = await repository.listIpAllocations({ branch: req.params.branchId });
  res.json({ ipAllocations: ipAllocations.map(toEntityResponse) });
});

export const createBranchIpAllocation = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const payload = normalizeIpAllocationPayload(req.body);
  const subnet = await ensureSubnetForBranch(payload.subnet, branch._id);
  await ensureDeviceForBranch(payload.device, branch._id);

  if (subnet && ![IpAllocationType.PUBLIC, IpAllocationType.VPN_PEER].includes(payload.ipType)) {
    if (!isIpInCidr(payload.ipAddress, subnet.cidr)) {
      throw new AppError('IP address must belong to the selected subnet', 400);
    }
  }

  const ipAllocation = await repository.createIpAllocation({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });
  const fullRecord = await repository.findIpAllocationById(ipAllocation._id);
  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_IP_ALLOCATION_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_IP_ALLOCATION',
    entityId: ipAllocation._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(fullRecord),
  });

  res.status(201).json({ ipAllocation: toEntityResponse(fullRecord) });
});

export const updateNetworkIpAllocation = asyncHandler(async (req, res) => {
  const ipAllocation = await repository.findIpAllocationById(req.params.id);
  if (!ipAllocation) {
    throw new AppError('IP allocation not found', 404);
  }

  const before = toEntityResponse(ipAllocation);
  const payload = normalizeIpAllocationPayload(req.body, { partial: true });
  const subnetId = payload.subnet !== undefined ? payload.subnet : toId(ipAllocation.subnet);
  const subnet = await ensureSubnetForBranch(subnetId, toId(ipAllocation.branch));
  const deviceId = payload.device !== undefined ? payload.device : toId(ipAllocation.device);
  await ensureDeviceForBranch(deviceId, toId(ipAllocation.branch));

  const effectiveIp = payload.ipAddress || ipAllocation.ipAddress;
  const effectiveType = payload.ipType || ipAllocation.ipType;
  if (subnet && ![IpAllocationType.PUBLIC, IpAllocationType.VPN_PEER].includes(effectiveType)) {
    if (!isIpInCidr(effectiveIp, subnet.cidr)) {
      throw new AppError('IP address must belong to the selected subnet', 400);
    }
  }

  const updated = await repository.updateIpAllocationById(ipAllocation._id, payload);
  await markBranchDocumentationChanged(toId(ipAllocation.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_IP_ALLOCATION_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_IP_ALLOCATION',
    entityId: ipAllocation._id,
    customerId: toId(ipAllocation.customer),
    branchId: toId(ipAllocation.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ ipAllocation: toEntityResponse(updated) });
});

export const listBranchVlans = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const vlans = await repository.listVlans({ branch: req.params.branchId });
  res.json({ vlans: vlans.map(toEntityResponse) });
});

export const createBranchVlan = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const payload = normalizeVlanPayload(req.body);
  if (payload.subnet) {
    await ensureSubnetForBranch(payload.subnet, branch._id);
  }

  for (const port of payload.ports || []) {
    await ensureDeviceForBranch(port.device, branch._id);
  }

  const vlan = await repository.createVlan({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });
  const fullVlan = await repository.findVlanById(vlan._id);
  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_VLAN_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_VLAN',
    entityId: vlan._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(fullVlan),
  });

  res.status(201).json({ vlan: toEntityResponse(fullVlan) });
});

export const updateNetworkVlan = asyncHandler(async (req, res) => {
  const vlan = await repository.findVlanById(req.params.id);
  if (!vlan) {
    throw new AppError('VLAN not found', 404);
  }

  const before = toEntityResponse(vlan);
  const payload = normalizeVlanPayload(req.body, { partial: true });
  const subnetId = payload.subnet !== undefined ? payload.subnet : toId(vlan.subnet);
  if (subnetId) {
    await ensureSubnetForBranch(subnetId, toId(vlan.branch));
  }

  for (const port of payload.ports || []) {
    await ensureDeviceForBranch(port.device, toId(vlan.branch));
  }

  const updated = await repository.updateVlanById(vlan._id, payload);
  await markBranchDocumentationChanged(toId(vlan.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_VLAN_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_VLAN',
    entityId: vlan._id,
    customerId: toId(vlan.customer),
    branchId: toId(vlan.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ vlan: toEntityResponse(updated) });
});

export const listBranchWanLinks = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const wanLinks = await repository.listWanLinks({ branch: req.params.branchId });
  res.json({ wanLinks: wanLinks.map(toEntityResponse) });
});

export const createBranchWanLink = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const payload = normalizeWanPayload(req.body);
  const wan = await repository.createWanLink({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });

  const secret = await upsertSecret({
    ownerType: 'WAN_LINK',
    ownerId: wan._id,
    secretType: SecretType.WAN_SUBSCRIPTION,
    rawSecret: req.body.subscriptionSecret,
    req,
  });

  const updatedWan = secret
    ? await repository.updateWanLinkById(wan._id, { 'subscriptionInfo.secret': secret._id })
    : await repository.findWanLinkById(wan._id);

  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_WAN_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_WAN_LINK',
    entityId: wan._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(updatedWan),
  });

  res.status(201).json({ wanLink: toEntityResponse(updatedWan) });
});

export const updateNetworkWanLink = asyncHandler(async (req, res) => {
  const wan = await repository.findWanLinkById(req.params.id);
  if (!wan) {
    throw new AppError('WAN link not found', 404);
  }

  const before = toEntityResponse(wan);
  const payload = normalizeWanPayload(req.body, { partial: true });
  const updatedBase = await repository.updateWanLinkById(wan._id, payload);

  const secret = await upsertSecret({
    ownerType: 'WAN_LINK',
    ownerId: wan._id,
    secretType: SecretType.WAN_SUBSCRIPTION,
    rawSecret: req.body.subscriptionSecret,
    req,
  });

  const updated = secret
    ? await repository.updateWanLinkById(wan._id, { 'subscriptionInfo.secret': secret._id })
    : updatedBase;

  await markBranchDocumentationChanged(toId(wan.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_WAN_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_WAN_LINK',
    entityId: wan._id,
    customerId: toId(wan.customer),
    branchId: toId(wan.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ wanLink: toEntityResponse(updated) });
});

export const listBranchVpnTunnels = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const vpnTunnels = await repository.listVpnTunnels({ branch: req.params.branchId });
  res.json({ vpnTunnels: vpnTunnels.map(toEntityResponse) });
});

export const createBranchVpnTunnel = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const payload = normalizeVpnPayload(req.body);
  const vpn = await repository.createVpnTunnel({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });

  const secret = await upsertSecret({
    ownerType: 'VPN_TUNNEL',
    ownerId: vpn._id,
    secretType: SecretType.VPN_CREDENTIALS,
    rawSecret: req.body.secretValue,
    req,
  });

  const updatedVpn = secret
    ? await repository.updateVpnTunnelById(vpn._id, { secret: secret._id })
    : await repository.findVpnTunnelById(vpn._id);

  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_VPN_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_VPN_TUNNEL',
    entityId: vpn._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(updatedVpn),
  });

  res.status(201).json({ vpnTunnel: toEntityResponse(updatedVpn) });
});

export const updateNetworkVpnTunnel = asyncHandler(async (req, res) => {
  const vpn = await repository.findVpnTunnelById(req.params.id);
  if (!vpn) {
    throw new AppError('VPN tunnel not found', 404);
  }

  const before = toEntityResponse(vpn);
  const payload = normalizeVpnPayload(req.body, { partial: true });
  const updatedBase = await repository.updateVpnTunnelById(vpn._id, payload);

  const secret = await upsertSecret({
    ownerType: 'VPN_TUNNEL',
    ownerId: vpn._id,
    secretType: SecretType.VPN_CREDENTIALS,
    rawSecret: req.body.secretValue,
    req,
  });

  const updated = secret
    ? await repository.updateVpnTunnelById(vpn._id, { secret: secret._id })
    : updatedBase;

  await markBranchDocumentationChanged(toId(vpn.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_VPN_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_VPN_TUNNEL',
    entityId: vpn._id,
    customerId: toId(vpn.customer),
    branchId: toId(vpn.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ vpnTunnel: toEntityResponse(updated) });
});

export const listBranchWifiProfiles = asyncHandler(async (req, res) => {
  await ensureBranchExists(req.params.branchId);
  const wifiProfiles = await repository.listWifiProfiles({ branch: req.params.branchId });
  res.json({ wifiProfiles: wifiProfiles.map(toEntityResponse) });
});

export const createBranchWifiProfile = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const payload = normalizeWifiPayload(req.body);
  if (payload.vlan) {
    const vlan = await repository.findVlanById(payload.vlan);
    if (!vlan || toId(vlan.branch) !== toId(branch._id)) {
      throw new AppError('VLAN not found in this branch', 404);
    }
  }

  for (const apId of payload.accessPoints || []) {
    await ensureDeviceForBranch(apId, branch._id);
  }

  const wifi = await repository.createWifiProfile({
    ...payload,
    customer: toId(branch.customer),
    branch: branch._id,
    createdBy: req.user.id,
  });

  const secret = await upsertSecret({
    ownerType: 'WIFI_PROFILE',
    ownerId: wifi._id,
    secretType: SecretType.WIFI_PSK,
    rawSecret: req.body.preSharedKey,
    req,
  });

  const updatedWifi = secret
    ? await repository.updateWifiProfileById(wifi._id, { secret: secret._id })
    : await repository.findWifiProfileById(wifi._id);

  await markBranchDocumentationChanged(branch._id);

  await logNetworkChange({
    req,
    action: 'NETWORK_WIFI_CREATED',
    changeType: 'CREATE',
    entityType: 'NETWORK_WIFI_PROFILE',
    entityId: wifi._id,
    customerId: toId(branch.customer),
    branchId: branch._id,
    after: toEntityResponse(updatedWifi),
  });

  res.status(201).json({ wifiProfile: toEntityResponse(updatedWifi) });
});

export const updateNetworkWifiProfile = asyncHandler(async (req, res) => {
  const wifi = await repository.findWifiProfileById(req.params.id);
  if (!wifi) {
    throw new AppError('Wi-Fi profile not found', 404);
  }

  const before = toEntityResponse(wifi);
  const payload = normalizeWifiPayload(req.body, { partial: true });
  if (payload.vlan) {
    const vlan = await repository.findVlanById(payload.vlan);
    if (!vlan || toId(vlan.branch) !== toId(wifi.branch)) {
      throw new AppError('VLAN not found in this branch', 404);
    }
  }

  for (const apId of payload.accessPoints || []) {
    await ensureDeviceForBranch(apId, toId(wifi.branch));
  }

  const updatedBase = await repository.updateWifiProfileById(wifi._id, payload);
  const secret = await upsertSecret({
    ownerType: 'WIFI_PROFILE',
    ownerId: wifi._id,
    secretType: SecretType.WIFI_PSK,
    rawSecret: req.body.preSharedKey,
    req,
  });

  const updated = secret
    ? await repository.updateWifiProfileById(wifi._id, { secret: secret._id })
    : updatedBase;

  await markBranchDocumentationChanged(toId(wifi.branch));

  await logNetworkChange({
    req,
    action: 'NETWORK_WIFI_UPDATED',
    changeType: 'UPDATE',
    entityType: 'NETWORK_WIFI_PROFILE',
    entityId: wifi._id,
    customerId: toId(wifi.customer),
    branchId: toId(wifi.branch),
    before,
    after: toEntityResponse(updated),
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.json({ wifiProfile: toEntityResponse(updated) });
});

export const uploadNetworkAttachments = asyncHandler(async (req, res) => {
  const customerId = toObjectIdString(req.body.customerId, 'customerId', { required: true });
  const branchId = toObjectIdString(req.body.branchId, 'branchId');
  const customer = await ensureCustomerExists(customerId);
  let branch = null;
  if (branchId) {
    branch = await ensureBranchExists(branchId);
    if (toId(branch.customer) !== customerId) {
      throw new AppError('Branch does not belong to the selected customer', 400);
    }
  }

  const category = ensureEnum(req.body.category || AttachmentCategory.OTHER, AttachmentCategory, 'category');
  const entityType = toCleanString(req.body.entityType) || 'CUSTOMER';
  const entityId = toCleanString(req.body.entityId) || customerId;

  if (!req.files?.length) {
    throw new AppError('At least one file is required', 400);
  }

  const uploaded = [];
  for (const file of req.files) {
    const stored = await storeAttachmentBuffer({
      file,
      category,
      customerId,
      branchId,
    });

    const attachment = await repository.createAttachment({
      customer: customer._id,
      branch: branch?._id || null,
      entityType,
      entityId,
      category,
      storageScope: stored.storageScope,
      originalName: normalizeAttachmentFileName(file.originalname),
      mimeType: file.mimetype,
      size: Number(file.size || 0),
      checksum: stored.checksum,
      publicUrl: stored.publicUrl,
      storagePath: stored.storagePath,
      uploadedBy: req.user.id,
    });

    uploaded.push(toEntityResponse(await repository.findAttachmentById(attachment._id)));
  }

  if (branchId) {
    await markBranchDocumentationChanged(branchId);
  }

  await logNetworkChange({
    req,
    action: 'NETWORK_ATTACHMENT_UPLOADED',
    changeType: 'UPLOAD',
    entityType: 'NETWORK_ATTACHMENT',
    entityId,
    customerId,
    branchId,
    after: {
      entityType,
      files: uploaded.map((item) => ({
        id: item.id,
        originalName: item.originalName,
        category: item.category,
        storageScope: item.storageScope,
      })),
    },
    reason: ensureReasonIfProvided(req.body.changeReason),
  });

  res.status(201).json({ attachments: uploaded });
});

export const listNetworkAttachments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.customerId) filter.customer = toObjectIdString(req.query.customerId, 'customerId');
  if (req.query.branchId) filter.branch = toObjectIdString(req.query.branchId, 'branchId');
  if (req.query.entityType) filter.entityType = toCleanString(req.query.entityType);
  if (req.query.entityId) filter.entityId = toCleanString(req.query.entityId);
  if (req.query.category) filter.category = ensureEnum(req.query.category, AttachmentCategory, 'category');

  const attachments = await repository.listAttachments(filter);
  res.json({ attachments: attachments.map(toEntityResponse) });
});

export const downloadNetworkAttachment = asyncHandler(async (req, res) => {
  const attachment = await repository.findAttachmentById(req.params.id);
  if (!attachment) {
    throw new AppError('Attachment not found', 404);
  }

  try {
    await fs.access(attachment.storagePath);
  } catch {
    throw new AppError('Stored file was not found on disk', 404);
  }

  res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
  res.download(attachment.storagePath, normalizeAttachmentFileName(attachment.originalName));
});

export const listNetworkChangeLogs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.customerId) filter.customer = toObjectIdString(req.query.customerId, 'customerId');
  if (req.query.branchId) filter.branch = toObjectIdString(req.query.branchId, 'branchId');
  if (req.query.entityType) filter.entityType = toCleanString(req.query.entityType);
  if (req.query.entityId) filter.entityId = toCleanString(req.query.entityId);

  const logs = await repository.listChangeLogs(filter, Number(req.query.limit || 200));
  res.json({ logs: logs.map(toEntityResponse) });
});

export const revealNetworkSecret = asyncHandler(async (req, res) => {
  const secret = await repository.findSecretById(req.params.id);
  if (!secret) {
    throw new AppError('Secret not found', 404);
  }

  const revealedValue = decryptSensitiveValue(secret);
  const updated = await repository.updateSecretById(secret._id, {
    lastViewedAt: new Date(),
    lastViewedBy: req.user.id,
  });

  await auditService.log({
    actorId: req.user.id,
    action: 'NETWORK_SECRET_VIEWED',
    entityType: 'NETWORK_SECRET',
    entityId: secret._id,
    after: {
      ownerType: secret.ownerType,
      ownerId: secret.ownerId,
      secretType: secret.secretType,
      maskedPreview: secret.maskedPreview,
    },
    req,
  });

  res.json({
    secret: {
      id: toId(updated),
      ownerType: updated.ownerType,
      ownerId: updated.ownerId,
      secretType: updated.secretType,
      maskedPreview: updated.maskedPreview,
      value: revealedValue,
      lastViewedAt: updated.lastViewedAt,
    },
  });
});

export const exportCustomerNetworkPdf = asyncHandler(async (req, res) => {
  const workspace = await repository.getCustomerWorkspace(req.params.customerId);
  if (!workspace) {
    throw new AppError('Customer not found', 404);
  }

  const buffer = await buildNetworkCustomerPdfBuffer({
    ...workspace,
    customer: workspace.customer,
  });
  const filename = `network-docs-${sanitizeFileName(workspace.customer.name || req.params.customerId)}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const exportBranchNetworkPdf = asyncHandler(async (req, res) => {
  const branch = await ensureBranchExists(req.params.branchId);
  const workspace = await repository.getCustomerWorkspace(toId(branch.customer));
  const filtered = {
    ...workspace,
    branches: workspace.branches.filter((item) => toId(item) === req.params.branchId),
    devices: workspace.devices.filter((item) => toId(item.branch) === req.params.branchId),
    subnets: workspace.subnets.filter((item) => toId(item.branch) === req.params.branchId),
    ipAllocations: workspace.ipAllocations.filter((item) => toId(item.branch) === req.params.branchId),
    vlans: workspace.vlans.filter((item) => toId(item.branch) === req.params.branchId),
    wanLinks: workspace.wanLinks.filter((item) => toId(item.branch) === req.params.branchId),
    vpnTunnels: workspace.vpnTunnels.filter((item) => toId(item.branch) === req.params.branchId),
    wifiProfiles: workspace.wifiProfiles.filter((item) => toId(item.branch) === req.params.branchId),
    attachments: workspace.attachments.filter((item) => toId(item.branch) === req.params.branchId),
    changeLogs: workspace.changeLogs.filter((item) => toId(item.branch) === req.params.branchId),
  };

  const buffer = await buildNetworkCustomerPdfBuffer(filtered);
  const filename = `network-docs-${sanitizeFileName(branch.name || req.params.branchId)}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});
