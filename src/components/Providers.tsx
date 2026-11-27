'use client';

import * as React from 'react';
import { ThemeProvider, ToastProvider, TooltipProvider } from '@/components/ui';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={250}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
