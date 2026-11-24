import * as React from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white border border-accent hover:bg-accent-hover hover:border-accent-hover shadow-xs',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-subtle hover:border-ink-3 shadow-xs',
  subtle:
    'bg-subtle text-ink border border-transparent hover:bg-hover',
  ghost:
    'bg-transparent text-ink-2 border border-transparent hover:bg-subtle hover:text-ink',
  danger:
    'bg-danger text-white border border-danger hover:opacity-90 shadow-xs',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-[13px] rounded-lg gap-1.5',
  md: 'min-h-10 px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'min-h-11 px-5 py-2.5 text-sm rounded-xl gap-2',
  icon: 'h-10 w-10 p-0 rounded-lg justify-center',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
