import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientLayout from '@/components/layout/ClientLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: {
    default: 'EstateFlow CRM',
    template: '%s | EstateFlow CRM',
  },
  description:
    'White-Label Multi-Tenant SaaS CRM with AI Voice Agents — EstateFlow',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/images/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/images/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/images/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'EstateFlow CRM',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
  applicationName: 'EstateFlow CRM',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1e40af' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags */}
        <meta name="application-name" content="EstateFlow CRM" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EstateFlow CRM" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=yes,email=yes,address=yes" />

        {/* Apple Touch Icon */}
        <link rel="apple-touch-icon" href="/images/apple-touch-icon.png" sizes="180x180" />

        {/* Safari Pinned Tab */}
        <link rel="mask-icon" href="/images/icon-512.png" color="#1e40af" />

        {/* Windows Tiles */}
        <meta name="msapplication-TileColor" content="#1e40af" />
        <meta name="msapplication-TileImage" content="/images/icon-512.png" />
        <meta name="msapplication-config" content="none" />

        {/* Preconnect to critical origins */}
        <link rel="preconnect" href="https://db.xxxxx.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://db.xxxxx.supabase.co" />

        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                    updateViaCache: 'none',
                  }).then(function(registration) {
                    console.log('[SW] Registered:', registration.scope);

                    // Check for updates every 10 minutes
                    setInterval(function() {
                      registration.update();
                    }, 10 * 60 * 1000);

                    // Handle waiting service worker
                    registration.addEventListener('updatefound', function() {
                      const newWorker = registration.installing;
                      newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          // New version available
                          console.log('[SW] New version available');

                          // Dispatch custom event for UI to show update prompt
                          window.dispatchEvent(new CustomEvent('sw-update', {
                            detail: { registration: registration },
                          }));
                        }
                      });
                    });
                  }).catch(function(error) {
                    console.warn('[SW] Registration failed:', error);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <ErrorBoundary>
          <ClientLayout>{children}</ClientLayout>
        </ErrorBoundary>
      </body>
    </html>
  );
}
