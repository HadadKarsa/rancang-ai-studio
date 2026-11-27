import * as React from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'live' | 'ready' | 'danger' | 'warn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-ink-2 border-transparent',
  live: 'bg-accent-soft text-accent-ink border-accent/20',
  ready: 'bg-ready-soft text-ready-ink border-ready/20',
  danger: 'bg-danger-soft text-danger-ink border-danger/20',
  warn: 'bg-warn-soft text-warn border-warn/25',
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-3',
  live: 'bg-accent',
  ready: 'bg-ready',
  danger: 'bg-danger',
  warn: 'bg-warn',
};

export function Badge({ className, tone = 'neutral', dot = false, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', DOT_CLASSES[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}
