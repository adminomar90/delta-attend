'use client';

import { usePathname, useRouter } from 'next/navigation';
import { authStorage } from '../lib/auth';
import { Permission, hasAnyPermission } from '../lib/permissions';

const menu = [
  { href: '/dashboard', label: 'لوحة التحكم' },
  { href: '/attendance', label: 'الحضور والانصراف' },
  { href: '/tasks', label: 'المهام' },
  {
    href: '/materials',
    label: 'إدارة المواد',
    anyPermissions: [
      Permission.CREATE_MATERIAL_REQUESTS,
      Permission.REVIEW_MATERIAL_REQUESTS,
      Permission.PREPARE_MATERIAL_REQUESTS,
      Permission.DISPATCH_MATERIAL_REQUESTS,
      Permission.RECONCILE_MATERIAL_CUSTODY,
      Permission.VIEW_MATERIAL_REPORTS,
    ],
  },
  {
    href: '/approvals',
    label: 'الاعتمادات',
    anyPermissions: [
      Permission.APPROVE_TASKS,
      Permission.APPROVE_PROJECTS,
      Permission.REVIEW_MATERIAL_REQUESTS,
    ],
  },
  { href: '/work-reports', label: 'تقارير العمل' },
  { href: '/projects', label: 'المشاريع' },
  { href: '/employees', label: 'الموظفون', anyPermissions: [Permission.MANAGE_USERS, Permission.MANAGE_TASKS] },
  { href: '/goals', label: 'الأهداف' },
  { href: '/notifications', label: 'الإشعارات' },
  { href: '/leaderboard', label: 'لوحة الصدارة' },
  { href: '/points-admin', label: 'إدارة النقاط', anyPermissions: [Permission.MANAGE_GAMIFICATION] },
  {
    href: '/reports',
    label: 'التقارير',
    anyPermissions: [
      Permission.VIEW_ANALYTICS,
      Permission.VIEW_EXECUTIVE_REPORTS,
      Permission.VIEW_FINANCIAL_REPORTS,
    ],
  },
  { href: '/audit-log', label: 'سجل التدقيق', anyPermissions: [Permission.VIEW_AUDIT_LOGS] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = authStorage.getUser();
  const visibleMenu = menu.filter((item) => {
    if (!item.anyPermissions?.length) {
      return true;
    }
    return hasAnyPermission(currentUser, item.anyPermissions);
  });

  const logout = () => {
    authStorage.logout();
    router.push('/login');
  };

  return (
    <aside className="sidebar card">
      <div className="brand">
        <div className="logo">
          <img className="brand-logo-img" src="/brand/delta-plus-logo.png" alt="Delta Plus" />
        </div>
        <div>
          <h2>Delta Plus</h2>
          <p>Iraq | Internal Platform</p>
        </div>
      </div>

      <nav>
        {visibleMenu.map((item) => {
          const active = pathname === item.href;
          return (
            <button
              key={item.href}
              className={`menu-item ${active ? 'active' : ''}`}
              onClick={() => router.push(item.href)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <button className="btn btn-soft logout" onClick={logout}>
        تسجيل الخروج
      </button>
    </aside>
  );
}

