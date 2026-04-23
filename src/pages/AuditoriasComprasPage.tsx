import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auditService } from '@/services/audit.service';
import type { AuditLog } from '@/services/audit.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Home, Menu, AlertCircle, ArrowLeft, Eye, Search, X } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateShort } from '@/utils/dateUtils';

interface GroupedRequisition {
  requisitionId: number;
  requisitionNumber: string;
  companyName: string;
  actionCount: number;
  lastAction: string;
  lastActionDate: string;
  lastUser: string;
}

interface FilterForm {
  requisitionNumber: string;
  companyName: string;
  userName: string;
  fromDate: string;
  toDate: string;
  action: string;
}

const EMPTY_FILTERS: FilterForm = {
  requisitionNumber: '',
  companyName: '',
  userName: '',
  fromDate: '',
  toDate: '',
  action: '',
};

const ACTION_LABELS: Record<string, string> = {
  crear: 'Creada',
  revisar: 'Revisada',
  aprobar: 'Aprobada',
  rechazar: 'Rechazada',
  registrar_cotizacion: 'Cotización Registrada',
  crear_ordenes_compra: 'Órdenes de Compra Generadas',
  registrar_recepcion: 'Recepción Registrada',
  editar_requisicion: 'Requisición Editada',
  aprobar_gerencia: 'Aprobada por Gerencia',
  aprobar_todas_ordenes_compra: 'Todas las OC Aprobadas',
  autorizar: 'Autorizada',
  rechazar_autorizador: 'Rechazada por Autorizador',
};

const ACTION_COLORS: Record<string, string> = {
  crear: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  revisar: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  aprobar: 'bg-green-500/10 text-green-700 border-green-500/20',
  rechazar: 'bg-red-500/10 text-red-700 border-red-500/20',
  registrar_cotizacion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  crear_ordenes_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  registrar_recepcion: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
  editar_requisicion: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  aprobar_gerencia: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
  aprobar_todas_ordenes_compra: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  autorizar: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  rechazar_autorizador: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
};

export default function AuditoriasComprasPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [groupedRequisitions, setGroupedRequisitions] = useState<GroupedRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Filter state: form values (what user types) vs applied (what was last searched)
  const [filterForm, setFilterForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>(EMPTY_FILTERS);

  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;

  const groupLogsByRequisition = (auditLogs: AuditLog[]): GroupedRequisition[] => {
    const grouped = new Map<number, GroupedRequisition>();

    auditLogs.forEach(log => {
      const reqId = log.requisition.requisitionId;

      if (!grouped.has(reqId)) {
        grouped.set(reqId, {
          requisitionId: reqId,
          requisitionNumber: log.requisition.requisitionNumber,
          companyName: log.requisition.operationCenter?.company?.name || '-',
          actionCount: 1,
          lastAction: log.action,
          lastActionDate: log.createdAt,
          lastUser: log.user.nombre,
        });
      } else {
        const existing = grouped.get(reqId)!;
        existing.actionCount += 1;
        if (new Date(log.createdAt) > new Date(existing.lastActionDate)) {
          existing.lastAction = log.action;
          existing.lastActionDate = log.createdAt;
          existing.lastUser = log.user.nombre;
        }
      }
    });

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.lastActionDate).getTime() - new Date(a.lastActionDate).getTime()
    );
  };

  const loadAuditLogs = useCallback(async (currentPage: number, filters: FilterForm) => {
    try {
      setLoading(true);
      setError(null);
      const response = await auditService.getAuditLogs({
        page: currentPage,
        limit,
        requisitionNumber: filters.requisitionNumber || undefined,
        companyName: filters.companyName || undefined,
        userName: filters.userName || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        action: filters.action || undefined,
      });
      setLogs(response.data);
      setTotal(response.total);
      setTotalPages(response.totalPages);
      setGroupedRequisitions(groupLogsByRequisition(response.data));
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Error al cargar los registros de auditoría');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLogs(page, appliedFilters);
  }, [page, appliedFilters, loadAuditLogs]);

  const handleSearch = () => {
    setPage(1);
    setAppliedFilters({ ...filterForm });
  };

  const handleClear = () => {
    setFilterForm(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const getActionLabel = (action: string) => ACTION_LABELS[action] || action;
  const getActionColor = (action: string) => ACTION_COLORS[action] || 'bg-gray-100 text-gray-700';

  const handleViewDetail = (requisitionId: number) => {
    navigate(`/dashboard/auditorias/compras/detalle/${requisitionId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/auditorias')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver a Auditorías"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Auditorías - Compras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Registro de Actividades del Módulo de Compras
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="fixed left-0 top-0 h-full w-64 bg-white shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-900))] mb-4">
              Auditorías - Compras
            </h3>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start bg-[hsl(var(--canalco-primary))]/10"
                onClick={() => setSidebarOpen(false)}
              >
                Registros
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  navigate('/dashboard/auditorias');
                  setSidebarOpen(false);
                }}
              >
                Volver a Gestiones
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Info Message */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Aquí puedes consultar todos los registros de actividad del módulo de compras. Haz clic en "Ver detalle" para información completa. La información es de solo lectura.
          </p>
        </div>

        {/* Filter Panel */}
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="w-4 h-4 text-[hsl(var(--canalco-neutral-600))] flex-shrink-0" />
            <Input
              placeholder="N° Requisición"
              value={filterForm.requisitionNumber}
              onChange={(e) => setFilterForm(f => ({ ...f, requisitionNumber: e.target.value }))}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm w-36"
            />
            <Input
              placeholder="Empresa / Proyecto"
              value={filterForm.companyName}
              onChange={(e) => setFilterForm(f => ({ ...f, companyName: e.target.value }))}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm flex-1 min-w-36"
            />
            <Input
              placeholder="Usuario"
              value={filterForm.userName}
              onChange={(e) => setFilterForm(f => ({ ...f, userName: e.target.value }))}
              onKeyDown={handleKeyDown}
              className="h-9 text-sm w-40"
            />
            <Select
              value={filterForm.action}
              onValueChange={(val) => setFilterForm(f => ({ ...f, action: val === '_all' ? '' : val }))}
            >
              <SelectTrigger className="h-9 text-sm w-44">
                <SelectValue placeholder="Estado / Acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los estados</SelectItem>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterForm.fromDate}
              onChange={(e) => setFilterForm(f => ({ ...f, fromDate: e.target.value }))}
              className="h-9 text-sm w-36"
            />
            <Input
              type="date"
              value={filterForm.toDate}
              onChange={(e) => setFilterForm(f => ({ ...f, toDate: e.target.value }))}
              className="h-9 text-sm w-36"
            />
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white h-9 px-5 flex-shrink-0"
            >
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={loading}
                className="h-9 px-3 text-[hsl(var(--canalco-neutral-700))] flex-shrink-0"
                title="Limpiar filtros"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            {activeFilterCount > 0 && (
              <Badge className="bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] border-[hsl(var(--canalco-primary))]/20 text-xs flex-shrink-0">
                {activeFilterCount} activo{activeFilterCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                    <TableHead className="font-semibold">N° Requisición</TableHead>
                    <TableHead className="font-semibold">Empresa/Proyecto</TableHead>
                    <TableHead className="font-semibold">Acciones Registradas</TableHead>
                    <TableHead className="font-semibold">Última Acción</TableHead>
                    <TableHead className="font-semibold">Fecha Última Acción</TableHead>
                    <TableHead className="font-semibold">Usuario</TableHead>
                    <TableHead className="font-semibold text-center">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedRequisitions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-[hsl(var(--canalco-neutral-600))]">
                        {activeFilterCount > 0
                          ? 'No se encontraron registros con los filtros aplicados.'
                          : 'No hay registros de auditoría disponibles.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupedRequisitions.map((requisition) => (
                      <TableRow
                        key={requisition.requisitionId}
                        className="hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors"
                      >
                        <TableCell className="font-medium">{requisition.requisitionNumber}</TableCell>
                        <TableCell>{requisition.companyName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                            {requisition.actionCount} {requisition.actionCount === 1 ? 'acción' : 'acciones'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${getActionColor(requisition.lastAction)} border`}
                          >
                            {getActionLabel(requisition.lastAction)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatDateShort(requisition.lastActionDate)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{requisition.lastUser}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetail(requisition.requisitionId)}
                              className="hover:bg-blue-50 text-blue-600"
                              title="Ver detalle completo"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Ver detalle
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="border-t border-[hsl(var(--canalco-neutral-300))] p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                {activeFilterCount > 0
                  ? `${groupedRequisitions.length} ${groupedRequisitions.length === 1 ? 'requisición encontrada' : 'requisiciones encontradas'} (${total} ${total === 1 ? 'registro' : 'registros'})`
                  : `${groupedRequisitions.length} ${groupedRequisitions.length === 1 ? 'requisición' : 'requisiciones'} (${total} ${total === 1 ? 'registro' : 'registros'} en total)`
                }
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                    Página {page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
