'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/i18n/LocaleProvider';

export function GoogleOAuthButton({
  nextPath = '/studio',
  label = 'Lanjutkan dengan Google',
}: {
  nextPath?: string;
  label?: string;
}) {
  const { t } = useLocale();
  const href =
    nextPath && nextPath !== '/studio'
      ? `/api/v1/auth/google?next=${encodeURIComponent(nextPath)}`
      : '/api/v1/auth/google';

  return (
    <div className="space-y-4">
      <Link
        href={href}
        prefetch={false}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.51 5.51 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.09A11.99 11.99 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.29A7.19 7.19 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.62H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.09Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.28 6.62l4 3.09c.95-2.84 3.6-4.95 6.72-4.95Z"
          />
        </svg>
        <span>{label}</span>
      </Link>

      <div className="relative flex items-center py-0.5" aria-hidden="true">
        <div className="flex-1 border-t border-line" />
        <span className="px-3 text-xs text-ink-3">{t('atau dengan email', 'or continue with email')}</span>
        <div className="flex-1 border-t border-line" />
      </div>
    </div>
  );
}
