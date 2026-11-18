import type { Metadata } from 'next';
import StyledJsxRegistry from '@/components/StyledJsxRegistry';
import './globals.css';


export const metadata: Metadata = {
  title: 'rancang-ai — spec studio',
  description: 'Turn an idea into a full app specification, in conversation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <StyledJsxRegistry>{children}</StyledJsxRegistry>
      </body>
    </html>
  );
}
