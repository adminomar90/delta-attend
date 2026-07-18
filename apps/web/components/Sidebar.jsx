'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { authStorage } from '../lib/auth';
import { api } from '../lib/api';
import { Permission, hasAnyPermission } from '../lib/permissions';
import { useNotifications } from '../lib/notifications';

const menuIcons = {
  '/dashboard': '📊',
  '/attendance': '⏱️',
  '/tasks': '📋',
  '/materials': '🏗️',
  '/warehouses': '🏬',
  '/project-custodies': '🧰',
  '/purchases': '🧾',
  '/financial-disbursements': '💸',
  '/maintenance-reports': '🛠️',
  '/maintenance-plans': '🗓️',
  '/daily-work-plans': '🧭',
  '/field-inspections': '🧪',
  '/customers': '☎️',
  '/suppliers': '🏢',
  '/customers?tab=forms': '🧾',
  '/customer-evaluations': '⭐',
  '/approvals': '✅',
  '/work-reports': '📝',
  '/completed-work-reports': '📚',
  '/approval-history': '🗂️',
  '/projects': '📁',
  '/employees': '👥',
  '/goals': '🎯',
  '/notifications': '🔔',
  '/leaderboard': '🏆',
  '/points-admin': '⚙️',
  '/reports': '📈',
  '/audit-log': '🔍',
  '/network-documentation': '🌐',
};

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
    href: '/warehouses',
    label: 'المخازن',
    anyPermissions: [
      Permission.MANAGE_MATERIAL_CATALOG,
      Permission.MANAGE_MATERIAL_INVENTORY,
      Permission.REVIEW_MATERIAL_REQUESTS,
      Permission.PREPARE_MATERIAL_REQUESTS,
      Permission.DISPATCH_MATERIAL_REQUESTS,
      Permission.RECONCILE_MATERIAL_CUSTODY,
      Permission.RECONCILE_OTHERS_MATERIAL_CUSTODY,
      Permission.CLOSE_MATERIAL_CUSTODY,
      Permission.VIEW_MATERIAL_REPORTS,
      Permission.VIEW_PROJECT_CUSTODIES,
    ],
  },
  {
    href: '/project-custodies',
    label: 'ذمم المشاريع',
    anyPermissions: [
      Permission.VIEW_PROJECT_CUSTODIES,
      Permission.MANAGE_PROJECTS,
      Permission.MANAGE_MATERIAL_INVENTORY,
    ],
  },
  {
    href: '/financial-disbursements',
    label: 'الصرف المالي',
    anyPermissions: [
      Permission.CREATE_FINANCIAL_DISBURSEMENTS,
      Permission.REVIEW_FINANCIAL_DISBURSEMENTS,
      Permission.VIEW_ALL_FINANCIAL_DISBURSEMENTS,
      Permission.DISBURSE_FINANCIAL_FUNDS,
      Permission.VIEW_FINANCIAL_REPORTS,
    ],
  },
  {
    href: '/maintenance-reports',
    label: 'تقارير الصيانة',
    anyPermissions: [
      Permission.CREATE_MAINTENANCE_REPORT_REQUESTS,
      Permission.HANDLE_MAINTENANCE_REPORTS,
      Permission.REVIEW_MAINTENANCE_REPORTS,
      Permission.VIEW_MAINTENANCE_REPORTS,
    ],
  },
  {
    href: '/maintenance-plans',
    label: 'الصيانة الدورية',
    anyPermissions: [
      Permission.VIEW_MAINTENANCE_PLANS,
      Permission.CREATE_MAINTENANCE_PLANS,
      Permission.MANAGE_MAINTENANCE_PLANS,
      Permission.REGISTER_MAINTENANCE_VISITS,
    ],
  },
  {
    href: '/daily-work-plans',
    label: 'بلان العمل اليومي',
    anyPermissions: [
      Permission.VIEW_DAILY_WORK_PLANS,
      Permission.VIEW_ALL_DAILY_WORK_PLAN_EMPLOYEES,
      Permission.CREATE_DAILY_WORK_PLANS,
      Permission.MANAGE_DAILY_WORK_PLANS,
      Permission.UPDATE_ASSIGNED_DAILY_WORK_PLANS,
      Permission.APPROVE_DAILY_WORK_PLANS,
    ],
  },
  {
    href: '/field-inspections',
    label: 'الكشف الميداني',
    anyPermissions: [
      Permission.VIEW_FIELD_INSPECTIONS,
      Permission.CREATE_FIELD_INSPECTIONS,
      Permission.MANAGE_FIELD_INSPECTIONS,
      Permission.HANDLE_FIELD_INSPECTIONS,
    ],
  },
  {
    href: '/customers',
    label: 'معلومات الزبائن',
    anyPermissions: [
      Permission.VIEW_CUSTOMERS,
      Permission.CREATE_CUSTOMERS,
      Permission.MANAGE_CUSTOMERS,
      Permission.VIEW_CUSTOMER_FINANCIAL_INFO,
    ],
  },
  {
    href: '/suppliers',
    label: 'معلومات الموردين',
    anyPermissions: [
      Permission.VIEW_SUPPLIERS,
      Permission.VIEW_APPROVED_SUPPLIERS,
      Permission.CREATE_SUPPLIERS,
      Permission.MANAGE_SUPPLIERS,
      Permission.APPROVE_SUPPLIERS,
      Permission.VIEW_SUPPLIER_FINANCIALS,
    ],
  },
  {
    href: '/purchases',
    label: 'المشتريات',
    anyPermissions: [
      Permission.VIEW_PURCHASES,
      Permission.CREATE_PURCHASE_REQUESTS,
      Permission.MANAGE_PURCHASE_QUOTES,
      Permission.APPROVE_PURCHASES,
      Permission.RECEIVE_PURCHASES,
      Permission.VIEW_PURCHASE_REPORTS,
    ],
  },
  {
    href: '/customers?tab=forms',
    matchPath: '/customers',
    matchQuery: 'tab=forms',
    label: 'استمارات الزبائن',
    anyPermissions: [
      Permission.VIEW_CUSTOMERS,
      Permission.CREATE_CUSTOMERS,
      Permission.MANAGE_CUSTOMERS,
    ],
  },
  {
    href: '/customer-evaluations',
    label: 'تقييمات الزبائن',
    anyPermissions: [
      Permission.VIEW_CUSTOMER_EVALUATIONS,
      Permission.MANAGE_CUSTOMER_EVALUATIONS,
      Permission.VIEW_ANALYTICS,
      Permission.VIEW_EXECUTIVE_REPORTS,
    ],
  },
  {
    href: '/approvals',
    label: 'الاعتمادات',
    anyPermissions: [
      Permission.APPROVE_TASKS,
      Permission.APPROVE_PROJECTS,
      Permission.REVIEW_MATERIAL_REQUESTS,
      Permission.VIEW_TEAM_WORK_REPORTS,
    ],
  },
  {
    href: '/work-reports',
    label: 'تقارير العمل',
    anyPermissions: [
      Permission.VIEW_OWN_WORK_REPORTS,
      Permission.VIEW_TEAM_WORK_REPORTS,
      Permission.APPROVE_TASKS,
    ],
  },
  {
    href: '/completed-work-reports',
    label: 'التقارير المنجزة',
    anyPermissions: [Permission.VIEW_COMPLETED_WORK_REPORTS],
  },
  {
    href: '/approval-history',
    label: 'سجل الاعتمادات',
    anyPermissions: [Permission.VIEW_APPROVAL_HISTORY],
  },
  { href: '/projects', label: 'المشاريع', anyPermissions: [Permission.MANAGE_PROJECTS, Permission.APPROVE_PROJECTS] },
  {
    href: '/employees',
    label: 'الموظفون',
    anyPermissions: [
      Permission.MANAGE_USERS,
      Permission.MANAGE_TASKS,
      Permission.VIEW_EMPLOYEES_HIERARCHY,
    ],
  },
  { href: '/goals', label: 'الأهداف' },
  { href: '/notifications', label: 'الإشعارات' },
  { href: '/leaderboard', label: 'لوحة الصدارة', anyPermissions: [Permission.VIEW_LEADERBOARD] },
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
  {
    href: '/network-documentation',
    label: 'توثيق الشبكات',
    anyPermissions: [
      Permission.VIEW_NETWORK_DOCUMENTATION,
      Permission.MANAGE_NETWORK_CUSTOMERS,
      Permission.MANAGE_NETWORK_BRANCHES,
      Permission.MANAGE_NETWORK_DEVICES,
      Permission.MANAGE_NETWORK_IP_PLAN,
      Permission.MANAGE_NETWORK_VLANS,
      Permission.MANAGE_NETWORK_WAN,
      Permission.MANAGE_NETWORK_VPN,
      Permission.MANAGE_NETWORK_WIFI,
      Permission.MANAGE_NETWORK_ATTACHMENTS,
    ],
  },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentUser = authStorage.getUser();
  const { unreadCount } = useNotifications();
  const visibleMenu = menu.filter((item) => {
    if (!item.anyPermissions?.length) {
      return true;
    }
    return hasAnyPermission(currentUser, item.anyPermissions);
  });

  const navigate = (href) => {
    router.push(href);
    if (onClose) onClose();
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore — clear local state regardless
    }
    authStorage.logout();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar card ${mobileOpen ? 'sidebar-open' : ''}`}>
        {/* Mobile close button */}
        <button className="sidebar-close-btn" onClick={onClose} aria-label="إغلاق">✕</button>

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
            const itemPath = item.matchPath || item.href.split('?')[0];
            const active = item.matchQuery
              ? pathname === itemPath && searchParams.toString() === item.matchQuery
              : pathname === itemPath || pathname.startsWith(`${itemPath}/`);
            return (
              <button
                key={item.href}
                className={`menu-item ${active ? 'active' : ''}`}
                onClick={() => navigate(item.href)}
              >
                <span className="menu-item-icon">{menuIcons[item.href] || menuIcons[itemPath] || '📄'}</span>
                <span className="menu-item-label">{item.label}</span>
                {item.href === '/notifications' && unreadCount > 0 ? (
                  <span className="sidebar-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <button className="btn btn-soft logout" onClick={logout}>
          تسجيل الخروج
        </button>
      </aside>
    </>
  );
}
