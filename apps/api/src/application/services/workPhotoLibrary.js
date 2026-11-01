import { createHash } from 'node:crypto';

export const normalizePhotoFolderName = (value) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');
const normalizeName = normalizePhotoFolderName;
export const workPhotoId = (url) => createHash('sha256').update(url).digest('hex');
const imageExtensions = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)(?:[?#]|$)/i;
export const isLibraryImage = (image) => Boolean(image?.publicUrl?.startsWith('/uploads/'))
  && (image.mimeType ? /^image\/(?!svg)/i.test(image.mimeType) : imageExtensions.test(image.publicUrl));

// Albums reference original report images. New reports and appended images appear without copying files.
export function buildWorkPhotoLibrary(reports) {
  const linkedNames = new Map();
  for (const report of reports) {
    const id = report.project?._id || (typeof report.project === 'string' ? report.project : null);
    const name = normalizeName(report.project?.name || report.projectName);
    if (id && name) {
      if (!linkedNames.has(name)) linkedNames.set(name, new Set());
      linkedNames.get(name).add(String(id));
    }
  }
  const albums = new Map();
  for (const report of reports) {
    const name = String(report.project?.name || report.projectName || '').trim().replace(/\s+/g, ' ') || 'بدون اسم مشروع';
    const normalized = normalizeName(name);
    const projectId = report.project?._id || (typeof report.project === 'string' ? report.project : null);
    const matchingIds = linkedNames.get(normalized);
    const key = projectId ? `project:${projectId}` : matchingIds?.size === 1 ? `project:${[...matchingIds][0]}` : `name:${normalized}`;
    const images = (report.images || []).filter(isLibraryImage);
    if (!images.length) continue;
    if (!albums.has(key)) albums.set(key, { key, name, photos: [], reports: new Set(), seen: new Set(), updatedAt: null });
    const album = albums.get(key);
    for (const image of images) {
      if (album.seen.has(image.publicUrl)) continue;
      album.seen.add(image.publicUrl);
      album.photos.push({ id: workPhotoId(image.publicUrl), publicUrl: image.publicUrl, originalName: image.originalName || '', comment: image.comment || '', reportId: String(report._id), date: report.workDate || report.createdAt });
    }
    album.reports.add(String(report._id));
    const date = report.updatedAt || report.createdAt;
    if (date && (!album.updatedAt || new Date(date) > new Date(album.updatedAt))) album.updatedAt = date;
  }
  return [...albums.values()].map(({ seen, reports: reportIds, ...album }) => ({ ...album, photoCount: album.photos.length, reportCount: reportIds.size, cover: album.photos[0]?.publicUrl }))
    .sort((a, b) => (new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)) || a.name.localeCompare(b.name, 'ar'));
}

export function applyPhotoPlacements(albums, placements) {
  const byId = new Map(placements.map((item) => [item.photoId, item]));
  const result = new Map(albums.map((album) => [album.key, { ...album, photos: [] }]));
  for (const album of albums) {
    for (const photo of album.photos) {
      const placement = byId.get(photo.id);
      if (placement?.deleted) continue;
      const key = placement?.folderKey || album.key;
      if (!result.has(key)) result.set(key, { key, name: placement.folderName, photos: [], updatedAt: placement.updatedAt });
      const target = result.get(key);
      if (!target.photos.some((item) => item.id === photo.id)) target.photos.push(photo);
    }
  }
  return [...result.values()].map((album) => ({ ...album, photoCount: album.photos.length, reportCount: new Set(album.photos.map((photo) => photo.reportId)).size, cover: album.photos[0]?.publicUrl || '' }));
}

export function selectLibraryPhotos(album, selection) {
  const ids = new Set(Array.isArray(selection.ids) ? selection.ids : []);
  const excluded = new Set(Array.isArray(selection.excludedIds) ? selection.excludedIds : []);
  if (ids.size > 10000 || excluded.size > 10000) throw new Error('SELECTION_LIMIT');
  const available = new Set(album.photos.map((photo) => photo.id));
  if ([...(selection.all === true ? excluded : ids)].some((id) => !available.has(id))) throw new Error('STALE_SELECTION');
  return album.photos.filter((photo) => selection.all === true ? !excluded.has(photo.id) : ids.has(photo.id));
}

export function applyPhotoFolders(albums, placements, folders) {
  const aliases = new Map();
  for (const album of albums) {
    const sameName = albums.filter((item) => normalizeName(item.name) === normalizeName(album.name));
    const matches = folders.filter((folder) => folder.custom && folder.normalizedName === normalizeName(album.name));
    if (sameName.length === 1 && matches.length === 1) aliases.set(album.key, matches[0].key);
  }
  const result = applyPhotoPlacements(albums.map((album) => ({ ...album, key: aliases.get(album.key) || album.key })),
    placements.map((item) => ({ ...item, folderKey: aliases.get(item.folderKey) || item.folderKey })));
  for (const folder of folders) {
    if (!folder.deleted && !result.some((album) => album.key === folder.key)) result.push({ key: folder.key, name: folder.name, photos: [], photoCount: 0, reportCount: 0, cover: '', updatedAt: folder.updatedAt });
  }
  const deleted = new Set(folders.filter((folder) => folder.deleted).map((folder) => folder.key));
  return result.filter((album) => !deleted.has(album.key));
}
