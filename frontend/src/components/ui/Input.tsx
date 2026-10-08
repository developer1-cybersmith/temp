import React, { forwardRef, useId } from 'react';
import { cn } from '../../lib/utils';

const colorMap: Record<string, string> = {
  honey: 'bg-pastel-honey/60',
  lavender: 'bg-pastel-lavender/60',
  sage: 'bg-pastel-sage/60',
  sky: 'bg-pastel-sky/60',
  cream: 'bg-cream-100',
};

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  color?: 'honey' | 'lavender' | 'sage' | 'sky' | 'cream';
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, color = 'cream', icon, className, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-ink-100 uppercase tracking-wider"
        >
          {label}
        </label>
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-50 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-[54px] rounded-input px-4 text-sm text-ink-300 placeholder:text-ink-50',
              'outline-none border-0 transition-all duration-150',
              'focus:ring-2 focus:ring-ink-200/30',
              colorMap[color],
              icon && 'pl-10',
              error && 'ring-2 ring-error/40',
              className
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
        </div>
        {error && (
          <p id={errorId} className="text-xs text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
