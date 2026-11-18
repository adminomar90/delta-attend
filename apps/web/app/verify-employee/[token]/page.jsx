import EmployeeBadgeVerification from './verification';
import './verification.css';

export const metadata = {
  title: 'التحقق من هوية الموظف',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function VerifyEmployeePage({ params }) {
  const { token } = await params;
  return <EmployeeBadgeVerification key={token} token={token} />;
}
