import React from 'react';
import { cn } from '../../lib/utils';

const variantStyles: Record<string, string> = {
  hot: 'bg-pastel-rose text-soft-rose',
  warm: 'bg-pastel-honey text-soft-honey',
  cold: 'bg-cream-200 text-ink-50',
  live: 'bg-cream-100 text-ink-200',
  new: 'bg-pastel-mint text-soft-mint',
  default: 'bg-cream-200 text-ink-100',
};

export interface BadgeProps {
  variant?: 'hot' | 'warm' | 'cold' | 'live' | 'new' | 'default';
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-[11px] font-bold px-2.5 py-1',
        variantStyles[variant],
        className
      )}
    >
      {variant === 'live' && (
        <span className="w-2 h-2 bg-soft-sage rounded-full shrink-0" />
      )}
      {children}
    </span>
  );
}

export default Badge;
