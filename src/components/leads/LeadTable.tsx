'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Pencil,
  Phone,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { cn, maskPhone, formatDate } from '@/lib/utils';
import type { LeadRow } from '@/lib/leads/queries';

interface LeadTableProps {
  data: LeadRow[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  isLoading?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  referral: 'Referral',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  cold_call: 'Cold Call',
  walk_in: 'Walk-In',
  other: 'Other',
};

export function LeadTable({
  data,
  selectedIds,
  onSelectionChange,
  onSortChange,
  sortBy: externalSortBy,
  sortDir: externalSortDir,
  isLoading = false,
}: LeadTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(
    externalSortBy
      ? [{ id: externalSortBy, desc: externalSortDir === 'desc' }]
      : [{ id: 'created_at', desc: true }]
  );

  const columns: ColumnDef<LeadRow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.full_name}`}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      accessorKey: 'full_name',
      header: 'Name',
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`./leads/${row.original.id}`)}
          className="font-medium text-primary hover:underline text-left"
        >
          {row.original.full_name}
        </button>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm font-mono">
          {maskPhone(row.original.phone)}
        </span>
      ),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => {
        const source = row.original.source;
        return (
          <span className="text-sm capitalize">
            {source ? SOURCE_LABELS[source] || source : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'ai_score',
      header: 'Score',
      cell: ({ row }) => (
        <ScoreBar score={row.original.ai_score} size="sm" />
      ),
    },
    {
      id: 'assigned_agent_id',
      header: 'Agent',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.assigned_agent_id
            ? row.original.assigned_agent_id.slice(0, 8) + '...'
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`./leads/${row.original.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`./leads/${row.original.id}?edit=true`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.open(`tel:${row.original.phone}`, '_blank')}
          >
            <Phone className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              window.open(
                `https://wa.me/${row.original.phone?.replace(/[^0-9]/g, '')}`,
                '_blank'
              )
            }
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      ),
      enableSorting: false,
    },
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection: selectedIds.reduce<RowSelectionState>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {}),
    },
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
      if (onSortChange && newSorting.length > 0) {
        onSortChange(newSorting[0]!.id, newSorting[0]!.desc ? 'desc' : 'asc');
      }
    },
    onRowSelectionChange: (updater) => {
      const current = selectedIds.reduce<RowSelectionState>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {});
      const newSelection =
        typeof updater === 'function' ? updater(current) : updater;
      const ids = Object.keys(newSelection).filter((k) => newSelection[k]);
      onSelectionChange(ids);
    },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-4 flex-1 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="h-3 flex-1 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          No leads found
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          No leads match your current filters. Try adjusting your search or
          filter criteria, or create a new lead.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    'h-12 px-4 text-left align-middle font-medium text-muted-foreground',
                    header.column.getCanSort() &&
                      'cursor-pointer select-none hover:text-foreground'
                  )}
                  style={{ width: header.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getCanSort() && (
                      <span className="inline-block">
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'border-b transition-colors hover:bg-muted/50',
                row.getIsSelected() && 'bg-muted/30'
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="p-4 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
