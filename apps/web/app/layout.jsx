import './globals.css';
import { AuthProvider } from '../lib/AuthContext';

export const metadata = {
  title: 'Delta Plus Gamification',
  description: 'نظام إدارة مهام ونقاط داخلي لشركة Delta Plus',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700&display=swap"
        />
      </head>
      <body className="app-bg">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
