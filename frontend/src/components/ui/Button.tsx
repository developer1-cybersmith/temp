import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const variantStyles = {
  primary:
    'bg-ink-300 text-cream-50 hover:bg-ink-400 active:scale-[0.97] cursor-pointer',
  soft: 'text-ink-200 cursor-pointer',
  ghost:
    'bg-cream-200 text-ink-100 hover:bg-cream-200/80 active:scale-[0.97] cursor-pointer',
  danger:
    'bg-error/10 text-error hover:bg-error/20 active:scale-[0.97] cursor-pointer',
};

const softColorMap: Record<string, string> = {
  lavender: 'bg-pastel-lavender',
  sage: 'bg-pastel-sage',
  peach: 'bg-pastel-peach',
  sky: 'bg-pastel-sky',
  honey: 'bg-pastel-honey',
  rose: 'bg-pastel-rose',
  mint: 'bg-pastel-mint',
  lilac: 'bg-pastel-lilac',
};

const sizeStyles = {
  sm: 'h-9 px-3 text-sm rounded-input',
  md: 'h-12 px-5 text-sm rounded-input',
  lg: 'h-[54px] px-6 text-base rounded-input',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  softColor?: string;
}

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4 mr-2"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  softColor = 'lavender',
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors duration-150 select-none',
        variantStyles[variant],
        variant === 'soft' && softColorMap[softColor],
        sizeStyles[size],
        fullWidth && 'w-full',
        isDisabled && 'opacity-50 pointer-events-none',
        className
      )}
      disabled={isDisabled}
      {...(props as any)}
    >
      {loading && <Spinner />}
      {children}
    </motion.button>
  );
}

export default Button;
