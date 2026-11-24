import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import './fresh.css';

export const metadata: Metadata = {
  title: 'rancang-ai: spec studio',
  description: 'Ubah satu ide menjadi spesifikasi aplikasi yang lengkap, lewat percakapan.',
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
