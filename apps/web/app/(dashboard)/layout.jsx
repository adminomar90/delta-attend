import AppShell from '../../components/AppShell';
import { NotificationProvider } from '../../lib/notifications';

export default function DashboardLayout({ children }) {
  return (
    <NotificationProvider>
      <AppShell>{children}</AppShell>
    </NotificationProvider>
  );
}
