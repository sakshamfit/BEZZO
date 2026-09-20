import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { AppShell } from '../components/app-shell';
import { ToastProvider } from '../components/toast';
import { CartProvider } from '../components/cart-context';

/**
 * The typefaces are loaded from the Google Fonts CDN by the browser (link tags), not fetched at build
 * time, so a build machine without egress — or an air-gapped CI runner — still produces a deployable
 * artefact. When the CDN is unreachable the stack in `--font`/`--mono` takes over, which is why those
 * declarations always end in system fonts.
 */
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap';

export const metadata: Metadata = {
  title: 'BEZZO — medicines for your medical store, from verified wholesalers',
  description:
    'BEZZO connects verified pharmaceutical wholesalers with verified medical stores. Search medicines, compare supplier availability, order and track every stage to your counter.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body>
        <AuthProvider>
          <ToastProvider>
            <CartProvider>
              <AppShell>{children}</AppShell>
            </CartProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
