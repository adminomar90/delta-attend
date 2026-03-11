import './globals.css';

export const metadata = {
  title: 'Delta Plus Gamification',
  description: 'نظام إدارة مهام ونقاط داخلي لشركة Delta Plus',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="app-bg">{children}</body>
    </html>
  );
}
