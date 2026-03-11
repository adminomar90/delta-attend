const EARTH_RADIUS_METERS = 6371000;

const toRadians = (value) => (value * Math.PI) / 180;

export const isValidLatitude = (value) =>
  Number.isFinite(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value) =>
  Number.isFinite(value) && value >= -180 && value <= 180;

export const sanitizeWhatsappNumber = (value) => {
  const cleaned = String(value || '').trim().replace(/[^\d+]/g, '');
  if (!cleaned) {
    return '';
  }

  const withoutDoubleZero = cleaned.startsWith('00') ? cleaned.slice(2) : cleaned;
  return withoutDoubleZero.replace(/\+/g, '');
};

export const buildWhatsAppSendUrl = (phone, message) => {
  const normalized = sanitizeWhatsappNumber(phone);
  if (!normalized) {
    return '';
  }

  return `https://api.whatsapp.com/send?phone=${normalized}&text=${encodeURIComponent(message || '')}`;
};

export const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

export const formatDuration = (minutes) => {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (!hours) {
    return `${mins} min`;
  }

  if (!mins) {
    return `${hours} h`;
  }

  return `${hours} h ${mins} min`;
};

export const buildMapLink = (latitude, longitude) =>
  `https://maps.google.com/?q=${latitude},${longitude}`;

export const buildAttendanceMessage = ({
  mode,
  employeeName,
  employeeCode,
  workSiteName,
  policy,
  timestamp,
  latitude,
  longitude,
  distanceMeters,
  radiusMeters,
  durationMinutes,
}) => {
  const checkTypeLabel = mode === 'CHECK_OUT' ? 'Check-out' : 'Check-in';
  const lines = [
    `Employee: ${employeeName || '-'}`,
    `Employee Code: ${employeeCode || '-'}`,
    `Attendance Policy: ${policy === 'GEOFENCE' ? 'GEOFENCE' : 'ANY_LOCATION'}`,
    `Work Site: ${workSiteName || 'Any Location'}`,
    '',
    `Type: ${checkTypeLabel}`,
    `Timestamp: ${new Date(timestamp).toLocaleString('en-US')}`,
    `Location: ${buildMapLink(latitude, longitude)}`,
  ];

  if (policy === 'GEOFENCE' && Number.isFinite(distanceMeters) && Number.isFinite(radiusMeters)) {
    lines.push(`Distance to work site: ${Math.round(distanceMeters)} m`);
    lines.push(`Allowed radius: ${Math.round(radiusMeters)} m`);
  }

  if (mode === 'CHECK_OUT') {
    lines.push(`Worked time: ${formatDuration(durationMinutes)}`);
  }

  lines.push('', 'Please verify attendance details and location.');

  return lines.join('\n');
};
