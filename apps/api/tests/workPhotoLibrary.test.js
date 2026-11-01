import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkPhotoLibrary, applyPhotoPlacements, applyPhotoFolders, selectLibraryPhotos } from '../src/application/services/workPhotoLibrary.js';

const photo = (name) => ({ publicUrl: `/uploads/${name}.jpg`, mimeType: 'image/jpeg' });
test('project albums collect old and new report images, including manual names, without duplicate files or PDFs', () => {
  const reports = [
    { _id: 'r1', project: { _id: 'p1', name: 'مشروع دلتا' }, images: [photo('a'), { publicUrl: '/uploads/report.pdf', mimeType: 'application/pdf' }], createdAt: '2026-10-01' },
    { _id: 'r2', projectName: '  مشروع   دلتا ', images: [photo('a'), photo('b')], createdAt: '2026-10-02' },
    { _id: 'r3', projectName: 'مشروع آخر', images: [photo('c'), { publicUrl: 'https://external.test/x.jpg', mimeType: 'image/jpeg' }] },
  ];
  const albums = buildWorkPhotoLibrary(reports);
  assert.equal(albums.length, 2);
  const delta = albums.find((a) => a.key === 'project:p1');
  assert.equal(delta.photoCount, 2); assert.equal(delta.reportCount, 2);
  reports.push({ _id: 'r4', projectName: 'مشروع دلتا', images: [photo('new')] });
  assert.equal(buildWorkPhotoLibrary(reports).find((a) => a.key === delta.key).photoCount, 3);
  assert.equal(reports[0].images.length, 2);
});
test('different linked projects with identical names retain separate albums and ambiguous manual names stay separate', () => {
  const albums = buildWorkPhotoLibrary([
    { _id: '1', project: { _id: 'a', name: 'المركز' }, images: [photo('1')] },
    { _id: '2', project: { _id: 'b', name: 'المركز' }, images: [photo('2')] },
    { _id: '3', projectName: 'المركز', images: [photo('3')] },
    { _id: '4', projectName: 'بلا صور', images: [] },
  ]);
  assert.deepEqual(albums.map((a) => a.key).sort(), ['name:المركز', 'project:a', 'project:b']);
});

test('library moves and deletions survive refresh without changing original report photos', () => {
  const reports = [{ _id: '1', projectName: 'أ', images: [photo('a'), photo('b')] }, { _id: '2', projectName: 'ب', images: [photo('c')] }];
  const albums = buildWorkPhotoLibrary(reports), first = albums.find((a) => a.name === 'أ'), second = albums.find((a) => a.name === 'ب');
  const placements = [{ photoId: first.photos[0].id, folderKey: second.key, folderName: second.name }, { photoId: first.photos[1].id, deleted: true }];
  const organized = applyPhotoPlacements(albums, placements);
  assert.equal(organized.find((a) => a.key === first.key).photoCount, 0);
  assert.equal(organized.find((a) => a.key === second.key).photoCount, 2);
  assert.equal(reports[0].images.length, 2);
  assert.deepEqual(applyPhotoPlacements(buildWorkPhotoLibrary(reports), placements), organized);
});

test('all selection spans pages, supports exclusions and rejects stale or foreign image IDs', () => {
  const album = { photos: Array.from({ length: 65 }, (_, i) => ({ id: String(i) })) };
  assert.equal(selectLibraryPhotos(album, { all: true }).length, 65);
  assert.equal(selectLibraryPhotos(album, { all: true, excludedIds: ['0', '64'] }).length, 63);
  assert.deepEqual(selectLibraryPhotos(album, { ids: ['1', '64'] }).map((p) => p.id), ['1', '64']);
  assert.throws(() => selectLibraryPhotos(album, { ids: ['foreign'] }), /STALE_SELECTION/);
});

test('empty custom folders receive matching future project reports and deleted folders stay hidden', () => {
  const folder = { key: 'name:دلتا', name: 'دلتا', normalizedName: 'دلتا', custom: true, deleted: false };
  assert.equal(applyPhotoFolders([], [], [folder])[0].photoCount, 0);
  const albums = buildWorkPhotoLibrary([{ _id: 'r', project: { _id: 'p', name: 'دلتا' }, images: [photo('x')] }]);
  const result = applyPhotoFolders(albums, [], [folder]);
  assert.equal(result.length, 1); assert.equal(result[0].key, folder.key); assert.equal(result[0].photoCount, 1);
  assert.equal(applyPhotoFolders(albums, [], [{ ...folder, deleted: true }]).length, 0);
});
