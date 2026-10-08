import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-pastel-lilac flex items-center justify-center text-soft-lilac mb-4">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-ink-300 mb-1">
        {title}
      </h3>
      <p className="text-sm text-ink-50 max-w-xs mb-5">{description}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
