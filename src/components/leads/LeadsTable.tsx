import React from 'react';
import { Phone, ExternalLink } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Lead } from '@/types/database';
import { formatPhoneDisplay, OUTCOME_COLORS, OUTCOME_LABELS, STATUS_LABELS, cn } from '@/lib/utils';
import { useDialer } from '@/contexts/DialerContext';
import { format } from 'date-fns';

export function LeadsTable({
  leads,
  loading,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
}: {
  leads: Lead[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (lead: Lead) => void;
}) {
  const dialer = useDialer();
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
          </TableHead>
          <TableHead>Business</TableHead>
          <TableHead>Section</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>City / State</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Last called</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={9} className="py-8 text-center text-text-tertiary">
              Loading leads…
            </TableCell>
          </TableRow>
        )}
        {!loading && leads.length === 0 && (
          <TableRow>
            <TableCell colSpan={9} className="py-8 text-center text-text-tertiary">
              No leads match these filters.
            </TableCell>
          </TableRow>
        )}
        {leads.map((lead) => (
          <TableRow key={lead.id} className="cursor-pointer" onClick={() => onRowClick(lead)}>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={selected.has(lead.id)} onCheckedChange={() => onToggleSelect(lead.id)} />
            </TableCell>
            <TableCell className="font-medium">{lead.business_name}</TableCell>
            <TableCell>
              {lead.list ? (
                <Badge>{lead.list.name}</Badge>
              ) : (
                <span className="text-xs text-text-tertiary">—</span>
              )}
            </TableCell>
            <TableCell className="mono-num">{formatPhoneDisplay(lead.phone)}</TableCell>
            <TableCell className="text-text-secondary">
              {[lead.city, lead.state].filter(Boolean).join(', ') || '—'}
            </TableCell>
            <TableCell>
              <Badge>{STATUS_LABELS[lead.status]}</Badge>
            </TableCell>
            <TableCell>
              {lead.outcome ? (
                <Badge className={cn(OUTCOME_COLORS[lead.outcome])}>{OUTCOME_LABELS[lead.outcome]}</Badge>
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </TableCell>
            <TableCell className="mono-num text-text-secondary">
              {lead.last_called_at ? format(new Date(lead.last_called_at), 'MMM d, yyyy') : '—'}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon"
                variant="ghost"
                title="Call now"
                onClick={() => dialer.placeCall(lead.phone, { leadId: lead.id, lead })}
              >
                <Phone className="h-3.5 w-3.5 text-accent" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
