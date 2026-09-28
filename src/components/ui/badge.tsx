import * as React from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium leading-none',
        'bg-surface-hover text-text-secondary border-border-strong',
        className
      )}
      {...props}
    />
  );
}
