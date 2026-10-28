export const reportNumber = (report) => report.reportNo || `#${String(report?._id || '').slice(-8).toUpperCase()}`;
export const reportProject = (report) => report.project?.name || report.projectName || 'بدون مشروع';
export const reportEmployee = (report) => report.employeeName || report.user?.fullName || 'غير محدد';
export const normalizeReportSearch = (value) => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));

export const filterCompletedReports = (reports, { search = '', project = '', sort = 'approved-desc' } = {}) => {
  const words = normalizeReportSearch(search).trim().split(/\s+/).filter(Boolean);
  const date = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  return reports.filter((report) => {
    if (project && reportProject(report) !== project) return false;
    const text = normalizeReportSearch([reportNumber(report), report._id, report.title, reportProject(report), report.project?.code, reportEmployee(report), report.user?.employeeCode, report.approvedBy?.fullName].join(' '));
    return words.every((word) => text.includes(word));
  }).sort((a, b) => {
    if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'ar') || String(a._id).localeCompare(String(b._id));
    if (sort === 'project') return reportProject(a).localeCompare(reportProject(b), 'ar') || date(b.approvedAt || b.createdAt) - date(a.approvedAt || a.createdAt);
    if (sort === 'created-desc') return date(b.createdAt) - date(a.createdAt) || String(a._id).localeCompare(String(b._id));
    const comparison = date(b.approvedAt || b.createdAt) - date(a.approvedAt || a.createdAt);
    return (sort === 'approved-asc' ? -comparison : comparison) || String(a._id).localeCompare(String(b._id));
  });
};
