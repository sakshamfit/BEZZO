import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { AppShell } from '../components/app-shell';

export const metadata: Metadata = {
  title: 'BEZZO — B2B pharmaceutical marketplace',
  description:
    'BEZZO connects verified pharmaceutical wholesalers with verified medical stores, with controlled pickup, hub receiving and delivery.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14584a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
