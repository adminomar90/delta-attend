import './globals.css';
import { AuthProvider } from '../lib/AuthContext';
import PwaRegistration from '../components/PwaRegistration';

export const metadata = {
  title: { default: 'Delta Plus', template: '%s | Delta Plus' },
  applicationName: 'Delta Plus',
  description: 'نظام إدارة مهام ونقاط داخلي لشركة Delta Plus',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: 'Delta Plus', statusBarStyle: 'default' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d182e',
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
        <PwaRegistration />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
