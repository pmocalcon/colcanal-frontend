import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { requisitionsService } from '@/services/requisitions.service';
import type { Requisition } from '@/services/requisitions.service';
import { usersService, type User } from '@/services/users.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Package, Home, Calendar } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/utils/dateUtils';

// Mapeo de estados a colores (17 estados según backend)
const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
  pendiente_validacion: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  en_revision: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  aprobada_revisor: 'bg-green-500/10 text-green-700 border-green-500/20',
  pendiente_autorizacion: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  autorizado: 'bg-lime-500/10 text-lime-700 border-lime-500/20',
  aprobada_gerencia: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  en_cotizacion: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  rechazada_validador: 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  rechazada_revisor: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  rechazada_autorizador: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  rechazada_gerencia: 'bg-red-500/10 text-red-700 border-red-500/20',
  cotizada: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  en_orden_compra: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  pendiente_recepcion: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  en_recepcion: 'bg-violet-500/10 text-violet-700 border-violet-500/20',
  recepcion_completa: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
};

export default function DetalleRequisicionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewerUser, setReviewerUser] = useState<User | null>(null);
  const [approverUser, setApproverUser] = useState<User | null>(null);

  useEffect(() => {
    loadRequisition();
  }, [id]);

  // Cargar datos reales del revisor y aprobador por ID (el backend envía datos incorrectos en reviewer/approver)
  useEffect(() => {
    const loadUserData = async () => {
      if (requisition?.reviewedBy) {
        try {
          const user = await usersService.getById(requisition.reviewedBy);
          setReviewerUser(user);
        } catch (err) {
          console.error('Error loading reviewer:', err);
        }
      }
      if (requisition?.approvedBy) {
        try {
          const user = await usersService.getById(requisition.approvedBy);
          setApproverUser(user);
        } catch (err) {
          console.error('Error loading approver:', err);
        }
      }
    };
    loadUserData();
  }, [requisition?.reviewedBy, requisition?.approvedBy]);

  const loadRequisition = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!id) {
        setError('ID de requisición no válido');
        return;
      }
      const data = await requisitionsService.getRequisitionById(Number(id));

      // DEBUG: Log para ver qué datos vienen del backend
      console.log('📋 Requisition data:', data);
      console.log('📝 Logs array:', data.logs);
      if (data.logs && data.logs.length > 0) {
        console.log('🔍 Log actions:', data.logs.map(log => ({
          action: log.action,
          newStatus: log.newStatus,
          previousStatus: log.previousStatus,
          user: log.user.nombre
        })));
      }

      setRequisition(data);
    } catch (err: any) {
      console.error('Error loading requisition:', err);
      setError(err.response?.data?.message || 'Error al cargar la requisición');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !requisition) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white p-6">
        <div className="max-w-6xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-800">Error</CardTitle>
              <CardDescription className="text-red-600">
                {error || 'No se pudo cargar la requisición'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate(-1)} variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo 1 + Home */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Ir al inicio"
              >
                <Home className="w-5 h-5" />
              </Button>
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Detalle de Requisición
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {requisition.requisitionNumber}
              </p>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Back Button and Badge */}
        <div className="flex items-center justify-between mb-6">
          <Button onClick={() => navigate(-1)} variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <Badge variant="outline" className={`${STATUS_COLORS[requisition.status.code] || 'bg-gray-500/10'} border`}>
            {requisition.status.name}
          </Badge>
        </div>

        {/* Información Principal */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">
                  Requisición {requisition.requisitionNumber}
                </CardTitle>
                <CardDescription className="mt-2">
                  Creada el {formatDate(requisition.createdAt)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Empresa */}
              <div>
                <p className="text-xs font-medium text-gray-500">Empresa</p>
                <p className="text-sm font-medium">{requisition.company.name}</p>
              </div>

              {/* Proyecto */}
              <div>
                <p className="text-xs font-medium text-gray-500">Proyecto</p>
                <p className="text-sm font-medium">{requisition.project?.name || 'N/A'}</p>
              </div>

              {/* Obra */}
              <div>
                <p className="text-xs font-medium text-gray-500">Obra</p>
                <p className="text-sm font-medium">{requisition.obra || 'N/A'}</p>
              </div>

              {/* Código de Obra */}
              <div>
                <p className="text-xs font-medium text-gray-500">Código de Obra</p>
                <p className="text-sm font-medium">{requisition.codigoObra || 'N/A'}</p>
              </div>

              {/* Centro de Operación */}
              <div>
                <p className="text-xs font-medium text-gray-500">Centro de Operación</p>
                <p className="text-sm font-medium">{requisition.operationCenter.code}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ítems de la Requisición */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Package className="mr-2 h-5 w-5" />
              Elementos Solicitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisition.items.map((item) => (
                  <TableRow key={item.itemId}>
                    <TableCell className="font-medium">{item.itemNumber}</TableCell>
                    <TableCell className="font-mono text-sm">{item.material.code}</TableCell>
                    <TableCell>{item.material.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.material.materialGroup.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {item.observation || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sección de Firmas */}
        <Card className="bg-[hsl(var(--canalco-neutral-50))]">
          <CardHeader>
            <CardTitle>Firmas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Solicitado por - SIEMPRE se muestra */}
              <div className="border-l-4 border-[hsl(var(--canalco-primary))] pl-4">
                <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                  Solicitado por
                </p>
                <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                  {requisition.creator.nombre}
                </p>
                <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                  {requisition.creator.cargo || 'Sin cargo'}
                </p>
              </div>

              {/* Validado por - action: validar or previousStatus='pendiente_validacion' and newStatus='pendiente' */}
              {(() => {
                const validateLog = requisition.logs?.find(
                  (log) => log.action === 'validar' ||
                    log.action === 'validar_aprobar' ||
                    (log.previousStatus === 'pendiente_validacion' && log.newStatus === 'pendiente')
                );
                return validateLog ? (
                  <div className="border-l-4 border-indigo-500 pl-4">
                    <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                      Validado por
                    </p>
                    <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                      {validateLog.user.nombre}
                    </p>
                    <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                      {validateLog.user.cargo || 'Sin cargo'}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Revisado por - Solo si reviewedBy existe Y es diferente al creador */}
              {requisition.reviewedBy && requisition.reviewedBy !== requisition.creator?.userId ? (
                <div className="border-l-4 border-blue-500 pl-4">
                  <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                    Revisado por
                  </p>
                  <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                    {requisition.reviewer?.nombre || reviewerUser?.nombre || 'Sin nombre'}
                  </p>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                    {requisition.reviewer?.cargo || reviewerUser?.cargo || 'Sin cargo'}
                  </p>
                </div>
              ) : null}

              {/* Autorizado por - actions: autorizar_aprobar (newStatus = autorizado) */}
              {(() => {
                const authorizeLog = requisition.logs?.find(
                  (log) => log.action === 'autorizar_aprobar' || log.newStatus === 'autorizado'
                );
                return authorizeLog ? (
                  <div className="border-l-4 border-amber-500 pl-4">
                    <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                      Autorizado por
                    </p>
                    <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                      {authorizeLog.user.nombre}
                    </p>
                    <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                      {authorizeLog.user.cargo || 'Sin cargo'}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Aprobado por (Gerencia) - Solo si approvedBy NO es NULL */}
              {requisition.approvedBy ? (
                <div className="border-l-4 border-green-500 pl-4">
                  <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">
                    Aprobado por
                  </p>
                  <p className="font-medium text-[hsl(var(--canalco-neutral-900))]">
                    {approverUser?.nombre || 'Gerencia'}
                  </p>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                    {approverUser?.cargo || 'Gerencia'}
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Historial de Cambios - Solo visible para el creador */}
        {requisition.logs && requisition.logs.length > 0 && user?.userId === requisition.creator.userId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="mr-2 h-5 w-5" />
                Historial de Cambios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {requisition.logs
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((log, index) => {
                    const isRejection = log.action?.includes('rechazar') || log.newStatus?.includes('rechazada');
                    const isApproval = log.action?.includes('aprobar') || log.newStatus?.includes('aprobada');

                    return (
                      <div
                        key={log.logId}
                        className={`flex gap-4 p-4 rounded-lg ${
                          isRejection
                            ? 'bg-red-50 border-2 border-red-300'
                            : isApproval
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full ${
                            isRejection
                              ? 'bg-red-600'
                              : isApproval
                              ? 'bg-green-600'
                              : 'bg-blue-600'
                          }`}></div>
                          {index < requisition.logs.length - 1 && (
                            <div className="w-0.5 h-full bg-gray-300 my-1"></div>
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isRejection && <span className="text-red-600 font-bold">❌</span>}
                              {isApproval && <span className="text-green-600 font-bold">✅</span>}
                              <p className={`text-sm font-semibold ${
                                isRejection
                                  ? 'text-red-900'
                                  : isApproval
                                  ? 'text-green-900'
                                  : 'text-gray-900'
                              }`}>
                                {log.action.replace(/_/g, ' ').toUpperCase()}
                              </p>
                            </div>
                            <p className="text-xs text-gray-500">{formatDate(log.createdAt)}</p>
                          </div>
                          <p className={`text-xs font-medium mb-2 ${
                            isRejection ? 'text-red-800' : isApproval ? 'text-green-800' : 'text-gray-600'
                          }`}>
                            por {log.user.nombre} ({log.user.role?.nombreRol || "Sin rol"})
                          </p>
                          {log.comments && (
                            <div className={`text-sm mt-3 p-3 rounded-lg border ${
                              isRejection
                                ? 'bg-white border-red-300 text-red-900'
                                : isApproval
                                ? 'bg-white border-green-300 text-green-900'
                                : 'bg-gray-50 border-gray-200 text-gray-700'
                            }`}>
                              <p className="font-semibold text-xs mb-1">
                                {isRejection ? '🚫 Motivo del rechazo:' : isApproval ? '💬 Comentarios:' : '📝 Comentarios:'}
                              </p>
                              <p className="whitespace-pre-wrap">{log.comments}</p>
                            </div>
                          )}
                          {log.previousStatus && log.newStatus && (
                            <p className="text-xs text-gray-500 mt-2 font-medium">
                              Estado cambió de: <span className="font-bold">{log.previousStatus}</span> → <span className="font-bold">{log.newStatus}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
