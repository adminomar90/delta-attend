export const badgeTemplates = {
  technical: { title: 'هوية الكادر الفني', footer: 'TECHNICAL TEAM' },
  administrative: { title: 'هوية الكادر الإداري', footer: 'ADMINISTRATIVE TEAM' },
  maintenance: { title: 'هوية كادر الصيانة', footer: 'MAINTENANCE TEAM' },
};

const departmentFooters = new Map([
  ['المشاريع', 'PROJECTS TEAM'],
  ['مشاريع', 'PROJECTS TEAM'],
  ['المالي', 'FINANCE TEAM'],
  ['ماليه', 'FINANCE TEAM'],
  ['الماليه', 'FINANCE TEAM'],
  ['عام', 'GENERAL TEAM'],
  ['العام', 'GENERAL TEAM'],
]);

export function badgeTemplateForDepartment(department = '') {
  const label = department.trim().replace(/\s+/gu, ' ');
  const normalized = label.normalize('NFKD').replace(/\p{M}|ـ/gu, '').replace(/ة/gu, 'ه').toLowerCase();
  if (/(?:ال)?صيانه/u.test(normalized) || /\bmaintenance\b/.test(normalized)) return badgeTemplates.maintenance;
  if (/(?:^|\s)(?:ال)?(?:فني|فنيه|تقني|تقنيه)(?:\s|$)/u.test(normalized)
    || /\b(?:technical|it)\b/.test(normalized)) return badgeTemplates.technical;
  if (/(?:^|\s)(?:ال)?(?:اداره|اداري|اداريه)(?:\s|$)/u.test(normalized)
    || /\b(?:administration|administrative|management)\b/.test(normalized)) return badgeTemplates.administrative;
  if (!normalized) return badgeTemplates.technical;
  if (normalized === 'general') return { title: 'هوية القسم العام', footer: 'GENERAL TEAM' };

  const departmentName = normalized.replace(/^(?:ال)?قسم\s+/u, '');
  const departmentTitle = /^(?:ال)?قسم(?:\s|$)/u.test(normalized) ? label : `قسم ${label}`;
  const englishName = /^[a-z]+(?:[\s-]+[a-z]+)*$/i.test(label) ? label.toUpperCase() : '';
  return { title: `هوية ${departmentTitle}`, footer: departmentFooters.get(departmentName) || englishName || 'EMPLOYEE ID' };
}
