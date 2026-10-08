import React from 'react';
import { cn } from '../../lib/utils';

const colorMap: Record<string, string> = {
  lavender: 'bg-pastel-lavender',
  sage: 'bg-pastel-sage',
  peach: 'bg-pastel-peach',
  sky: 'bg-pastel-sky',
  honey: 'bg-pastel-honey',
  rose: 'bg-pastel-rose',
  mint: 'bg-pastel-mint',
  lilac: 'bg-pastel-lilac',
  cream: 'bg-cream-100',
};

export interface CardProps {
  color?: 'lavender' | 'sage' | 'peach' | 'sky' | 'honey' | 'rose' | 'mint' | 'lilac' | 'cream';
  pressable?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Card({
  color = 'cream',
  pressable = false,
  className,
  children,
  onClick,
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card p-4',
        colorMap[color],
        pressable && 'card-press cursor-pointer active:scale-[0.98] transition-transform duration-150',
        className
      )}
      onClick={onClick}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
    >
      {children}
    </div>
  );
}

export default Card;
