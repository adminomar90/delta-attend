'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';
import PointsToast from './PointsToast';
import InAppNotifToast from './InAppNotifToast';
import { authStorage } from '../lib/auth';
import { Permission, hasAnyPermission } from '../lib/permissions';

const titleByPath = {
  '/dashboard': {
    title: 'لوحة الأداء',
    subtitle: 'مؤشرات فورية للمهام والنقاط والمستويات',
  },
  '/attendance': {
    title: 'الحضور والانصراف',
    subtitle: 'بصمة دخول وخروج بالموقع الجغرافي مع إرسال تحقق عبر واتساب',
  },
  '/tasks': {
    title: 'إدارة المهام',
    subtitle: 'توزيع، متابعة، اعتماد، واحتساب نقاط بعد الإنجاز',
  },
  '/materials': {
    title: 'إدارة المواد للمشاريع',
    subtitle: 'طلب، اعتماد، تجهيز، تسليم، ذمم، تصفية، راجع، وتقارير متكاملة',
  },
  '/approvals': {
    title: 'صفحة الاعتمادات',
    subtitle: 'اعتماد المهام والمشاريع والحضور والتقارير من مكان واحد',
  },
  '/work-reports': {
    title: 'تقارير العمل',
    subtitle: 'إنشاء تقارير إنجاز يومية/دورية مع صور واعتماد المدير بالنقاط',
  },
  '/completed-work-reports': {
    title: 'التقارير المنجزة',
    subtitle: 'أرشيف التقارير المعتمدة مع نفس ملف PDF المحفوظ وقت إنشاء التقرير',
  },
  '/approval-history': {
    title: 'سجل الاعتمادات',
    subtitle: 'أرشيف العمليات المعتمدة بالكامل مع تفاصيل المسار والموافقات والتصدير',
  },
  '/projects': {
    title: 'المشاريع',
    subtitle: 'إدارة المشاريع والفرق وربط المهام بالأهداف',
  },
  '/employees': {
    title: 'الموظفون',
    subtitle: 'إضافة موظفين جدد ومراجعة بياناتهم الأساسية',
  },
  '/goals': {
    title: 'الأهداف',
    subtitle: 'أهداف يومية وأسبوعية وشهرية مع تتبع نسبة الإنجاز',
  },
  '/notifications': {
    title: 'الإشعارات',
    subtitle: 'تنبيهات التعيين والاعتماد وتحقيق الأهداف',
  },
  '/leaderboard': {
    title: 'لوحة الصدارة',
    subtitle: 'تصنيف شفاف وعادل حسب النقاط المكتسبة',
  },
  '/reports': {
    title: 'التقارير',
    subtitle: 'ملخصات تشغيلية وتصدير PDF/Excel',
  },
  '/audit-log': {
    title: 'سجل التدقيق',
    subtitle: 'توثيق كامل للإجراءات الحساسة داخل النظام',
  },
};

const routePermissionRules = {
  '/materials': [
    Permission.CREATE_MATERIAL_REQUESTS,
    Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.PREPARE_MATERIAL_REQUESTS,
    Permission.DISPATCH_MATERIAL_REQUESTS,
    Permission.RECONCILE_MATERIAL_CUSTODY,
    Permission.CLOSE_MATERIAL_CUSTODY,
    Permission.VIEW_MATERIAL_REPORTS,
    Permission.MANAGE_MATERIAL_INVENTORY,
    Permission.MANAGE_MATERIAL_CATALOG,
  ],
  '/approvals': [
    Permission.APPROVE_TASKS,
    Permission.APPROVE_PROJECTS,
    Permission.REVIEW_MATERIAL_REQUESTS,
    Permission.VIEW_TEAM_WORK_REPORTS,
  ],
  '/work-reports': [
    Permission.VIEW_OWN_WORK_REPORTS,
    Permission.VIEW_TEAM_WORK_REPORTS,
    Permission.APPROVE_TASKS,
  ],
  '/projects': [Permission.MANAGE_PROJECTS, Permission.APPROVE_PROJECTS],
  '/employees': [
    Permission.MANAGE_USERS,
    Permission.MANAGE_TASKS,
    Permission.VIEW_EMPLOYEES_HIERARCHY,
  ],
  '/completed-work-reports': [Permission.VIEW_COMPLETED_WORK_REPORTS],
  '/approval-history': [Permission.VIEW_APPROVAL_HISTORY],
  '/leaderboard': [Permission.VIEW_LEADERBOARD],
  '/reports': [
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_EXECUTIVE_REPORTS,
    Permission.VIEW_FINANCIAL_REPORTS,
  ],
  '/audit-log': [Permission.VIEW_AUDIT_LOGS],
};

const resolveRouteValue = (pathname, config) =>
  Object.entries(config).find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] || null;

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = authStorage.getToken();
    const currentUser = authStorage.getUser();

    if (!token) {
      router.push('/login');
      return;
    }

    const requiredPermissions = resolveRouteValue(pathname, routePermissionRules);
    if (requiredPermissions && !hasAnyPermission(currentUser, requiredPermissions)) {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    setIsChecking(false);
  }, [pathname, router]);

  // Refresh user state when user data changes (e.g. avatar upload)
  useEffect(() => {
    const onUserUpdated = (e) => {
      if (e.detail) setUser(e.detail);
    };
    window.addEventListener('user-updated', onUserUpdated);
    return () => window.removeEventListener('user-updated', onUserUpdated);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const syncOverflow = () => {
      document.body.style.overflow = sidebarOpen && window.innerWidth < 1101 ? 'hidden' : '';
    };

    syncOverflow();
    window.addEventListener('resize', syncOverflow);

    return () => {
      window.removeEventListener('resize', syncOverflow);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  if (isChecking) {
    return null;
  }

  const page = resolveRouteValue(pathname, titleByPath) || {
    title: 'Delta Plus',
    subtitle: 'Gamification Platform',
  };

  return (
    <div className="shell container">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-area">
        <HeaderBar
          title={page.title}
          subtitle={page.subtitle}
          user={user}
          onMenuToggle={() => setSidebarOpen(true)}
        />
        {children}
      </main>
      <PointsToast />
      <InAppNotifToast />
    </div>
  );
}
