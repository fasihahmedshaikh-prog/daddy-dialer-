import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ListChecks, PhoneCall, History, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: ListChecks },
  { to: '/call-log', label: 'Call Log', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { workspace, user, signOut } = useAuth();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface-raised">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-accent/15 text-accent">
          <PhoneCall className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Daddy Dialer</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-accent/12 text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 truncate text-xs text-text-tertiary" title={workspace?.name}>
          {workspace?.name ?? 'Loading workspace…'}
        </div>
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-text-secondary" title={user?.email ?? ''}>
            {user?.email}
          </span>
          <button onClick={() => signOut()} className="text-text-tertiary hover:text-danger" title="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
