import { AppError } from '../../shared/errors.js';

export const ContractStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  UNDER_NEGOTIATION: 'UNDER_NEGOTIATION',
};

export const DocumentationStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED: 'APPROVED',
  OUTDATED: 'OUTDATED',
};

export const BranchSiteType = {
  HQ: 'HQ',
  BRANCH: 'BRANCH',
  OFFICE: 'OFFICE',
  DATACENTER: 'DATACENTER',
  WAREHOUSE: 'WAREHOUSE',
  STORE: 'STORE',
  OTHER: 'OTHER',
};

export const DeviceType = {
  ROUTER: 'ROUTER',
  SWITCH: 'SWITCH',
  FIREWALL: 'FIREWALL',
  ACCESS_POINT: 'ACCESS_POINT',
  NVR: 'NVR',
  IP_PBX: 'IP_PBX',
  SERVER: 'SERVER',
  CAMERA: 'CAMERA',
  PRINTER: 'PRINTER',
  UPS: 'UPS',
  OTHER: 'OTHER',
};

export const DeviceStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  FAILED: 'FAILED',
  RETIRED: 'RETIRED',
};

export const IpAllocationType = {
  GATEWAY: 'GATEWAY',
  DNS: 'DNS',
  DHCP_RESERVED: 'DHCP_RESERVED',
  STATIC: 'STATIC',
  PUBLIC: 'PUBLIC',
  MANAGEMENT: 'MANAGEMENT',
  VPN_PEER: 'VPN_PEER',
  OTHER: 'OTHER',
};

export const WanConnectionType = {
  FIBER: 'FIBER',
  WIRELESS: 'WIRELESS',
  DSL: 'DSL',
  LTE: 'LTE',
  SATELLITE: 'SATELLITE',
  OTHER: 'OTHER',
};

export const VpnType = {
  SITE_TO_SITE_IPSEC: 'SITE_TO_SITE_IPSEC',
  OPENVPN: 'OPENVPN',
  L2TP: 'L2TP',
  PPTP: 'PPTP',
  SSL_VPN: 'SSL_VPN',
  WIREGUARD: 'WIREGUARD',
  OTHER: 'OTHER',
};

export const VlanPortMode = {
  ACCESS: 'ACCESS',
  TRUNK: 'TRUNK',
};

export const WifiSecurityType = {
  OPEN: 'OPEN',
  WPA2_PSK: 'WPA2_PSK',
  WPA3_PSK: 'WPA3_PSK',
  WPA2_ENTERPRISE: 'WPA2_ENTERPRISE',
  WPA3_ENTERPRISE: 'WPA3_ENTERPRISE',
};

export const AttachmentCategory = {
  PHOTO: 'PHOTO',
  PDF: 'PDF',
  CONFIG: 'CONFIG',
  DIAGRAM: 'DIAGRAM',
  BACKUP: 'BACKUP',
  OTHER: 'OTHER',
};

export const SecretType = {
  VPN_CREDENTIALS: 'VPN_CREDENTIALS',
  VPN_KEY: 'VPN_KEY',
  WIFI_PSK: 'WIFI_PSK',
  WAN_SUBSCRIPTION: 'WAN_SUBSCRIPTION',
  DEVICE_PASSWORD: 'DEVICE_PASSWORD',
  OTHER: 'OTHER',
};

export const SensitiveAttachmentCategories = new Set([
  AttachmentCategory.CONFIG,
  AttachmentCategory.BACKUP,
]);

export const toCleanString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

export const toOptionalDate = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid date value', 400);
  }

  return date;
};

export const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toOptionalNumber = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value', 400);
  }

  return parsed;
};

export const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toCleanString(item)).filter(Boolean);
  }

  const raw = toCleanString(value);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => toCleanString(item)).filter(Boolean)
      : [];
  } catch {
    return raw.split(',').map((item) => toCleanString(item)).filter(Boolean);
  }
};

export const ensureEnum = (value, enumMap, fieldName) => {
  const raw = toCleanString(value).toUpperCase();
  if (!raw || !Object.values(enumMap).includes(raw)) {
    throw new AppError(`${fieldName} is invalid`, 400);
  }

  return raw;
};

export const toUpperString = (value) => toCleanString(value).toUpperCase();

export const normalizeMacAddress = (value) => {
  const raw = toCleanString(value).toUpperCase().replace(/[^A-F0-9]/g, '');
  if (!raw) {
    return '';
  }

  if (!/^[A-F0-9]{12}$/.test(raw)) {
    throw new AppError('Invalid MAC address', 400);
  }

  return raw.match(/.{1,2}/g).join(':');
};

export const normalizeIpv4 = (value, { allowEmpty = false } = {}) => {
  const raw = toCleanString(value);
  if (!raw) {
    if (allowEmpty) {
      return '';
    }

    throw new AppError('IP address is required', 400);
  }

  const parts = raw.split('.');
  if (parts.length !== 4) {
    throw new AppError('Invalid IPv4 address', 400);
  }

  const normalized = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new AppError('Invalid IPv4 address', 400);
    }

    const n = Number(part);
    if (n < 0 || n > 255) {
      throw new AppError('Invalid IPv4 address', 400);
    }

    return String(n);
  });

  return normalized.join('.');
};

export const ipv4ToNumber = (ip) =>
  normalizeIpv4(ip)
    .split('.')
    .reduce((sum, part) => (sum * 256) + Number(part), 0);

export const normalizeCidr = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    throw new AppError('CIDR is required', 400);
  }

  const [ip, prefixRaw] = raw.split('/');
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new AppError('Invalid CIDR prefix', 400);
  }

  return `${normalizeIpv4(ip)}/${prefix}`;
};

export const isIpInCidr = (ip, cidr) => {
  const normalizedIp = ipv4ToNumber(ip);
  const [networkIp, prefixRaw] = normalizeCidr(cidr).split('/');
  const prefix = Number(prefixRaw);
  const network = ipv4ToNumber(networkIp);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

  return (normalizedIp & mask) === (network & mask);
};

export const normalizeDnsServers = (values) => toStringArray(values).map((item) => normalizeIpv4(item));

export const normalizeDhcpRanges = (ranges = []) => {
  const source = Array.isArray(ranges)
    ? ranges
    : (() => {
      const raw = toCleanString(ranges);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

  return source
    .map((item) => ({
      startIp: normalizeIpv4(item.startIp),
      endIp: normalizeIpv4(item.endIp),
      notes: toCleanString(item.notes),
    }))
    .filter((item) => item.startIp && item.endIp);
};

export const normalizeCoordinates = (value = {}) => {
  const lat = toOptionalNumber(value.lat);
  const lng = toOptionalNumber(value.lng);

  if (lat === null && lng === null) {
    return { lat: null, lng: null };
  }

  if (lat === null || lng === null) {
    throw new AppError('Latitude and longitude must be provided together', 400);
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new AppError('Invalid geo coordinates', 400);
  }

  return { lat, lng };
};

export const buildMaskedPreview = (value = '') => {
  const raw = String(value || '');
  if (!raw) {
    return '';
  }

  if (raw.length <= 4) {
    return '*'.repeat(raw.length);
  }

  return `${'*'.repeat(Math.max(4, raw.length - 4))}${raw.slice(-4)}`;
};

export const ensureReasonIfProvided = (value) => {
  const reason = toCleanString(value);
  return reason;
};
