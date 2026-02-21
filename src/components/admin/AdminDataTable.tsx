import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Search,
  Eye,
} from 'lucide-react';

interface ColumnMeta {
  name: string;
  dataType: string;
  notNull: boolean;
  hasDefault: boolean;
  hidden: boolean;
  readOnly: boolean;
  enumValues?: string[];
}

interface ResourceMeta {
  label: string;
  icon: string;
  titleColumn?: string;
  actions: { create: boolean; edit: boolean; delete: boolean };
  listColumns?: string[];
  columns: ColumnMeta[];
}

interface AdminDataTableProps {
  resourceKey: string;
  resourceMeta: ResourceMeta;
}

function formatCellValue(value: unknown, dataType: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
  }
  if (dataType === 'json' || typeof value === 'object') {
    const str = JSON.stringify(value);
    return <span className="font-mono text-xs truncate max-w-[200px] block">{str}</span>;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleString();
    }
    if (value.length > 60) {
      return <span title={value}>{value.slice(0, 60)}...</span>;
    }
  }
  return String(value);
}

export function AdminDataTable({ resourceKey, resourceMeta }: AdminDataTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const visibleColumns = resourceMeta.columns.filter((c) => !c.hidden);
  const displayColumns = resourceMeta.listColumns
    ? visibleColumns.filter((c) => resourceMeta.listColumns!.includes(c.name))
    : visibleColumns.slice(0, 7);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', resourceKey, page, pageSize, sortBy, sortOrder, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/${resourceKey}?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<{ items: Record<string, any>[]; total: number; page: number; pageSize: number }>;
    },
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{resourceMeta.label}</h2>
          {data && (
            <p className="text-sm text-muted-foreground mt-1">
              {data.total} record{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {resourceMeta.titleColumn && (
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search by ${resourceMeta.titleColumn}...`}
                className="pl-9 w-64"
              />
            </form>
          )}
          {resourceMeta.actions.create && (
            <Link to="/admin/$resource/new" params={{ resource: resourceKey }}>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {displayColumns.map((col) => (
                <TableHead key={col.name}>
                  <button
                    onClick={() => handleSort(col.name)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {col.name}
                    {sortBy === col.name ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {displayColumns.map((col) => (
                    <TableCell key={col.name}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Skeleton className="h-5 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((item) => {
                const id = item.id ?? item.key;
                return (
                  <TableRow key={id}>
                    {displayColumns.map((col) => (
                      <TableCell key={col.name}>
                        {formatCellValue(item[col.name], col.dataType)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Link
                        to="/admin/$resource/$recordId"
                        params={{ resource: resourceKey, recordId: String(id) }}
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page <= 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
