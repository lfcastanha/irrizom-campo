import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegistrarSW from '@/components/RegistrarSW';

export const metadata: Metadata = {
  title: 'IRRIZOM Campo',
  description: 'Registro diário das equipes de montagem',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icone-192.png', apple: '/icone-192.png' },
  appleWebApp: { capable: true, title: 'IRRIZOM', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#116b3e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
