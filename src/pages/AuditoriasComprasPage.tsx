import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auditService } from '@/services/audit.service';
import type { AuditLog } from '@/services/audit.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Menu, AlertCircle, ArrowLeft, Eye } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateShort } from '@/utils/dateUtils';

// Tipo para requisiciones agrupadas
interface GroupedRequisition {
  requisitionId: number;
  requisitionNumber: string;
  companyName: string;
  actionCount: number;
  lastAction: string;
  lastActionDate: string;
  lastUser: string;
}

// Mapeo de acciones a etiquetas legibles
const ACTION_LABELS: Record<string, string> = {
  crear: 'Creada',
  revisar: 'Revisada',
  aprobar: 'Aprobada',
  rechazar: 'Rechazada',
  registrar_cotizacion: 'Cotización Registrada',
  crear_ordenes_compra: 'Órdenes de Compra Generadas',
  registrar_recepcion: 'Recepción Registrada',
};

// Mapeo de acciones a colores
const ACTION_COLORS: Record<string, string> = {
  crear: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  revisar: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  aprobar: 'bg-green-500/10 text-green-700 border-green-500/20',
  rechazar: 'bg-red-500/10 text-red-700 border-red-500/20',
  registrar_cotizacion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  crear_ordenes_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  registrar_recepcion: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
};

export default function AuditoriasComprasPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [groupedRequisitions, setGroupedRequisitions] = useState<GroupedRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadAuditLogs();
  }, [page]);

  // Función para agrupar logs por requisición
  const groupLogsByRequisition = (logs: AuditLog[]): GroupedRequisition[] => {
    const grouped = new Map<number, GroupedRequisition>();

    logs.forEach(log => {
      const reqId = log.requisition.requisitionId;

      if (!grouped.has(reqId)) {
        // Primera vez que vemos esta requisición
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
        // Ya existe, solo incrementar contador
        const existing = grouped.get(reqId)!;
        existing.actionCount += 1;

        // Actualizar si este log es más reciente
        if (new Date(log.createdAt) > new Date(existing.lastActionDate)) {
          existing.lastAction = log.action;
          existing.lastActionDate = log.createdAt;
          existing.lastUser = log.user.nombre;
        }
      }
    });

    // Convertir Map a Array y ordenar por fecha más reciente
    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.lastActionDate).getTime() - new Date(a.lastActionDate).getTime()
    );
  };

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await auditService.getAuditLogs({ page, limit });
      setLogs(response.data);
      setTotal(response.total);
      setTotalPages(response.totalPages);

      // Agrupar logs por requisición
      const grouped = groupLogsByRequisition(response.data);
      setGroupedRequisitions(grouped);
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Error al cargar los registros de auditoría');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    return ACTION_LABELS[action] || action;
  };

  const getActionColor = (action: string) => {
    return ACTION_COLORS[action] || 'bg-gray-100';
  };

  const handleViewDetail = (requisitionId: number) => {
    navigate(`/dashboard/auditorias/compras/detalle/${requisitionId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-3">
              {/* Logo 1 */}
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Home Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>

              {/* Sidebar Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
              >
                <Menu className="w-5 h-5" />
              </Button>

              {/* Back Button */}
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

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Auditorías - Compras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Registro de Actividades del Módulo de Compras
              </p>
            </div>

            {/* Right: Logo 2 */}
            <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img
                src="/assets/images/logo-alumbrado.png"
                alt="Alumbrado Público"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar (Mobile drawer / Desktop sidebar) */}
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
                onClick={() => {
                  setSidebarOpen(false);
                }}
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
                        No hay registros de auditoría disponibles.
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupedRequisitions.map((requisition) => (
                      <TableRow key={requisition.requisitionId} className="hover:bg-[hsl(var(--canalco-neutral-100))] transition-colors">
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
                        <TableCell className="font-medium">{formatDateShort(requisition.lastActionDate)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{requisition.lastUser}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
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
            {totalPages > 1 && (
              <div className="border-t border-[hsl(var(--canalco-neutral-300))] p-4 flex items-center justify-between">
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                  Mostrando {groupedRequisitions.length} {groupedRequisitions.length === 1 ? 'requisición' : 'requisiciones'} ({total} {total === 1 ? 'registro' : 'registros'} en total)
                </p>
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
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
