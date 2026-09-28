import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  icon: Icon,
  sublabel,
  accent,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sublabel?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</span>
          <Icon className={cn('h-3.5 w-3.5', accent ? 'text-accent' : 'text-text-tertiary')} />
        </div>
        <div className="mono-num mt-1.5 text-2xl font-semibold text-text-primary">{value}</div>
        {sublabel && <p className="mt-0.5 text-xs text-text-tertiary">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}
