import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCompletedReports, reportNumber } from '../../web/lib/completedWorkReports.mjs';

const reports = [
  { _id: '000000001234abcd', title: 'صيانة أجهزة الشبكة', project: { name: 'مشروع الأمانة', code: 'PRJ-12' }, employeeName: 'أحمد علي', approvedAt: '2026-10-28T09:00:00Z', createdAt: '2026-10-20T09:00:00Z' },
  { _id: '000000002222efgh', title: 'تركيب كاميرات', projectName: 'منزل العميل', employeeName: 'محمد عمر', approvedAt: '2026-10-27T09:00:00Z', createdAt: '2026-10-26T09:00:00Z' },
];

test('completed report search matches Arabic project/title words, employees and mixed numerals', () => {
  assert.equal(filterCompletedReports(reports, { search: 'صِيَانة الامانة احمد' })[0]._id, reports[0]._id);
  assert.equal(filterCompletedReports(reports, { search: '#١٢٣٤ABCD' })[0]._id, reports[0]._id);
  assert.equal(filterCompletedReports(reports, { search: 'prj-۱۲' })[0]._id, reports[0]._id);
  assert.equal(filterCompletedReports(reports, { search: 'كاميرات محمد' })[0]._id, reports[1]._id);
  assert.equal(filterCompletedReports(reports, { search: 'صيانة محمد' }).length, 0);
});

test('project filter and search apply together and reset returns all reports', () => {
  assert.equal(filterCompletedReports(reports, { project: 'منزل العميل', search: 'كاميرات' }).length, 1);
  assert.equal(filterCompletedReports(reports, { project: 'منزل العميل', search: 'صيانة' }).length, 0);
  assert.equal(filterCompletedReports(reports, {}).length, 2);
  assert.deepEqual(filterCompletedReports([], {}), []);
});

test('report sorting uses approval or creation dates without mutating source data', () => {
  const original = reports.map((report) => report._id);
  assert.equal(filterCompletedReports(reports)[0]._id, reports[0]._id);
  assert.equal(filterCompletedReports(reports, { sort: 'approved-asc' })[0]._id, reports[1]._id);
  assert.equal(filterCompletedReports(reports, { sort: 'created-desc' })[0]._id, reports[1]._id);
  assert.deepEqual(reports.map((report) => report._id), original);
  assert.equal(filterCompletedReports([{ _id: 'bad', approvedAt: 'invalid' }, ...reports])[0]._id, reports[0]._id);
  assert.equal(reportNumber({ reportNo: 'WR-2026-42', _id: 'fallback' }), 'WR-2026-42');
});
