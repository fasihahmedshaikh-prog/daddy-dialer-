import React, { useState } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { UploadCloud } from 'lucide-react';

const LEAD_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'business_name', label: 'Business name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'Zip' },
  { key: 'website', label: 'Website' },
  { key: 'email', label: 'Email' },
  { key: 'notes', label: 'Notes' },
  { key: '__ignore', label: 'Do not import' },
];

// Best-effort auto-mapping so a well-formed CSV needs zero manual mapping.
function guessMapping(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/business|clinic|company|name/.test(h) && !/contact|owner/.test(h)) return 'business_name';
  if (/phone|contact.?number|tel/.test(h)) return 'phone';
  if (/address|street/.test(h)) return 'address';
  if (/city/.test(h)) return 'city';
  if (/state|province/.test(h)) return 'state';
  if (/zip|postal/.test(h)) return 'zip';
  if (/website|url|site/.test(h)) return 'website';
  if (/email/.test(h)) return 'email';
  if (/note/.test(h)) return 'notes';
  return '__ignore';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImported: () => void;
}

export function ImportLeadsDialog({ open, onOpenChange, workspaceId, onImported }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');

  function reset() {
    setStep('upload');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName('');
  }

  function handleFile(file: File) {
    setFileName(file.name);
    Papa.parse<string[]>(file, {
      complete: (results) => {
        const data = (results.data as string[][]).filter((r) => r.some((c) => c && c.trim() !== ''));
        if (data.length === 0) return;

        // Heuristic header detection: if the first row's cells look like
        // labels (no digits) and later rows differ in shape, assume a header.
        const firstRow = data[0];
        const looksLikeHeader = firstRow.every((cell) => !/^\d+$/.test(cell.trim()));
        setHasHeaderRow(looksLikeHeader);

        const hdrs = looksLikeHeader ? firstRow : firstRow.map((_, i) => `Column ${i + 1}`);
        const dataRows = looksLikeHeader ? data.slice(1) : data;

        setHeaders(hdrs);
        setRows(dataRows.map((r) => Object.fromEntries(hdrs.map((h, i) => [h, r[i] ?? '']))));

        const guessed: Record<string, string> = {};
        hdrs.forEach((h) => (guessed[h] = guessMapping(h)));
        setMapping(guessed);
        setStep('map');
      },
      error: (err) => toast(`Could not parse CSV: ${err.message}`, { variant: 'error' }),
    });
  }

  async function doImport() {
    const businessCol = Object.entries(mapping).find(([, v]) => v === 'business_name')?.[0];
    const phoneCol = Object.entries(mapping).find(([, v]) => v === 'phone')?.[0];
    if (!phoneCol) {
      toast('Map a Phone column before importing.', { variant: 'error' });
      return;
    }

    setStep('importing');
    const payload = rows.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const [col, field] of Object.entries(mapping)) {
        if (field === '__ignore') continue;
        obj[field] = r[col];
      }
      if (!obj.business_name && businessCol) obj.business_name = r[businessCol];
      obj.metadata_json = { raw: r, imported_from: fileName };
      return obj;
    });

    const { data, error } = await supabase.rpc('import_leads', {
      p_workspace_id: workspaceId,
      p_rows: payload,
    });

    if (error) {
      toast(`Import failed: ${error.message}`, { variant: 'error' });
      setStep('map');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    toast(
      `Imported ${result?.inserted_count ?? 0} new leads, updated ${result?.updated_count ?? 0}, skipped ${
        result?.skipped_count ?? 0
      } (no phone).`,
      { variant: 'success' }
    );
    onImported();
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="p-8">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-surface-hover p-10 text-center hover:border-accent/50">
              <UploadCloud className="h-8 w-8 text-text-tertiary" />
              <span className="text-sm text-text-secondary">Click to choose a .csv file, or drag it here</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
        )}

        {step === 'map' && (
          <>
            <div className="max-h-[50vh] overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Checkbox checked={hasHeaderRow} onCheckedChange={(v) => setHasHeaderRow(!!v)} />
                First row is a header row
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Column mapping</p>
                <div className="grid grid-cols-2 gap-2">
                  {headers.map((h) => (
                    <div key={h} className="flex items-center justify-between gap-2 rounded border border-border bg-surface-hover px-2 py-1.5">
                      <span className="truncate text-xs text-text-secondary" title={h}>
                        {h}
                      </span>
                      <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                  Preview — first 5 rows ({rows.length} total)
                </p>
                <div className="rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          {headers.map((h) => (
                            <TableCell key={h} className="max-w-[140px] truncate text-xs">
                              {r[h]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={reset}>
                Back
              </Button>
              <Button onClick={doImport}>Import {rows.length} leads</Button>
            </DialogFooter>
          </>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center gap-3 p-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-text-secondary">Importing and deduping by phone number…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
