import React from 'react';
import { Sidebar } from './Sidebar';
import { FloatingDialWidget } from '@/components/dialer/FloatingDialWidget';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <FloatingDialWidget />
    </div>
  );
}
