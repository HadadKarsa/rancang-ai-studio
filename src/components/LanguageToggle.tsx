'use client';

import { Languages } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/cn';

/**
 * Global UI language toggle (ID | EN, default ID) for AppShell and public pages (v0.2.8).
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label={locale === 'en' ? 'Interface language' : 'Bahasa antarmuka'}
      className={cn(
        'inline-flex h-9 items-center rounded-lg border border-line bg-surface p-0.5 text-[11px] font-mono',
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={locale === 'id'}
        onClick={() => setLocale('id')}
        className={cn(
          'inline-flex h-full cursor-pointer items-center rounded-md px-2 font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
          locale === 'id' ? 'bg-accent-soft text-accent-ink' : 'text-ink-3 hover:text-ink',
        )}
      >
        ID
      </button>
      <button
        type="button"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
        className={cn(
          'inline-flex h-full cursor-pointer items-center rounded-md px-2 font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
          locale === 'en' ? 'bg-accent-soft text-accent-ink' : 'text-ink-3 hover:text-ink',
        )}
      >
        EN
      </button>
    </div>
  );
}

/**
 * Selector for AI-generated document and interview language (Indonesian or English).
 */
export function AiOutputLangPicker({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { outputLang, setOutputLang, t } = useLocale();
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      {!compact && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <Languages className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
          <span>{t('Bahasa dokumen AI', 'AI document language')}</span>
        </span>
      )}
      <div
        role="group"
        aria-label={t('Bahasa output dokumen AI', 'AI generated document language')}
        className="inline-flex items-center rounded-lg border border-line bg-sidebar/80 p-0.5 text-[11.5px]"
      >
        <button
          type="button"
          aria-pressed={outputLang === 'id'}
          onClick={() => setOutputLang('id')}
          className={cn(
            'min-h-8 cursor-pointer rounded-md px-2.5 font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            outputLang === 'id' ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink',
          )}
        >
          {compact ? 'ID' : 'Indonesia'}
        </button>
        <button
          type="button"
          aria-pressed={outputLang === 'en'}
          onClick={() => setOutputLang('en')}
          className={cn(
            'min-h-8 cursor-pointer rounded-md px-2.5 font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            outputLang === 'en' ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink',
          )}
        >
          {compact ? 'EN' : 'English'}
        </button>
      </div>
    </div>
  );
}
