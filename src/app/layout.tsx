import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import './fresh.css';

export const metadata: Metadata = {
  title: 'Rencang-Rancang: Teman Merancang Spesifikasi Sistem',
  description:
    'Teman merancang spesifikasi sistem dan aplikasi. Ubah satu ide singkat menjadi enam dokumen teknis yang saling nyambung.',
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('rancang.theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
