import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  surveysService,
  type Survey,
  type BlockName,
  type BlockStatus,
} from '@/services/surveys.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Home,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  CheckCheck,
  FileText,
  Package,
  Car,
  DollarSign,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { Footer } from '@/components/ui/footer';

interface BlockInfo {
  key: BlockName;
  title: string;
  icon: React.ReactNode;
  statusField: keyof Survey;
  commentsField: keyof Survey;
}

const BLOCKS: BlockInfo[] = [
  {
    key: 'budget',
    title: 'I. PRESUPUESTO',
    icon: <DollarSign className="w-5 h-5" />,
    statusField: 'budgetStatus',
    commentsField: 'budgetComments',
  },
  {
    key: 'investment',
    title: 'II. DESCRIPCION DE INVERSION',
    icon: <FileText className="w-5 h-5" />,
    statusField: 'investmentStatus',
    commentsField: 'investmentComments',
  },
  {
    key: 'materials',
    title: 'III. MATERIALES',
    icon: <Package className="w-5 h-5" />,
    statusField: 'materialsStatus',
    commentsField: 'materialsComments',
  },
  {
    key: 'travelExpenses',
    title: 'IV. COSTOS DE VIAJE',
    icon: <Car className="w-5 h-5" />,
    statusField: 'travelExpensesStatus',
    commentsField: 'travelExpensesComments',
  },
];

export default function RevisarLevantamientoDetallePage() {
  const navigate = useNavigate();
  const { surveyId } = useParams<{ surveyId: string }>();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingBlock, setProcessingBlock] = useState<BlockName | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  // Reject modal state
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    block: BlockName | null;
  }>({ open: false, block: null });
  const [rejectComments, setRejectComments] = useState('');

  // Reopen modal state
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (surveyId) {
      loadSurvey();
    }
  }, [surveyId]);

  const loadSurvey = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await surveysService.getSurveyById(Number(surveyId));
      setSurvey(data);
    } catch (err: any) {
      console.error('Error loading survey:', err);
      setError(err.response?.data?.message || 'Error al cargar el levantamiento');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveBlock = async (block: BlockName) => {
    try {
      setProcessingBlock(block);
      const updated = await surveysService.reviewBlock(Number(surveyId), {
        block,
        status: 'approved',
      });
      setSurvey(updated);
    } catch (err: any) {
      console.error('Error approving block:', err);
      setError(err.response?.data?.message || 'Error al aprobar el bloque');
    } finally {
      setProcessingBlock(null);
    }
  };

  const handleRejectBlock = async () => {
    if (!rejectModal.block || !rejectComments.trim()) return;

    try {
      setProcessingBlock(rejectModal.block);
      const updated = await surveysService.reviewBlock(Number(surveyId), {
        block: rejectModal.block,
        status: 'rejected',
        comments: rejectComments,
      });
      setSurvey(updated);
      setRejectModal({ open: false, block: null });
      setRejectComments('');
    } catch (err: any) {
      console.error('Error rejecting block:', err);
      setError(err.response?.data?.message || 'Error al rechazar el bloque');
    } finally {
      setProcessingBlock(null);
    }
  };

  const handleApproveAll = async () => {
    try {
      setApprovingAll(true);
      const updated = await surveysService.approveAll(Number(surveyId));
      setSurvey(updated);
    } catch (err: any) {
      console.error('Error approving all:', err);
      setError(err.response?.data?.message || 'Error al aprobar todo');
    } finally {
      setApprovingAll(false);
    }
  };

  const handleReopenForEditing = async () => {
    try {
      setReopening(true);
      const updated = await surveysService.reopenForEditing(Number(surveyId), reopenReason || undefined);
      setSurvey(updated);
      setReopenModal(false);
      setReopenReason('');
    } catch (err: any) {
      console.error('Error reopening survey:', err);
      setError(err.response?.data?.message || 'Error al reabrir el levantamiento');
    } finally {
      setReopening(false);
    }
  };

  const getStatusBadge = (status?: BlockStatus) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Aprobado
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            Rechazado
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
            Pendiente
          </Badge>
        );
    }
  };

  const allBlocksApproved = useMemo(() => {
    if (!survey) return false;
    return (
      survey.budgetStatus === 'approved' &&
      survey.investmentStatus === 'approved' &&
      survey.materialsStatus === 'approved' &&
      survey.travelExpensesStatus === 'approved'
    );
  }, [survey]);

  const anyBlockPending = useMemo(() => {
    if (!survey) return true;
    return (
      survey.budgetStatus === 'pending' ||
      survey.investmentStatus === 'pending' ||
      survey.materialsStatus === 'pending' ||
      survey.travelExpensesStatus === 'pending'
    );
  }, [survey]);

  // Get all rejected blocks with their comments
  const rejectedBlocks = useMemo(() => {
    if (!survey) return [];
    return BLOCKS.filter(block => survey[block.statusField] === 'rejected').map(block => ({
      title: block.title,
      comments: survey[block.commentsField] as string | undefined,
    }));
  }, [survey]);

  // Check if any block has been reviewed (not pending)
  const hasReviewedBlocks = useMemo(() => {
    if (!survey) return false;
    return (
      survey.budgetStatus !== 'pending' ||
      survey.investmentStatus !== 'pending' ||
      survey.materialsStatus !== 'pending' ||
      survey.travelExpensesStatus !== 'pending'
    );
  }, [survey]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[hsl(var(--canalco-primary))] mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando levantamiento...</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-900))] font-semibold">
            Levantamiento no encontrado
          </p>
          <Button
            onClick={() => navigate(-1)}
            className="mt-4"
          >
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
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
                onClick={() => navigate(-1)}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Revisar Levantamiento
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {survey.surveyNumber} - {survey.work?.name}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {hasReviewedBlocks && (
                <Button
                  onClick={() => setReopenModal(true)}
                  variant="outline"
                  className="border-amber-500 text-amber-700 hover:bg-amber-50"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reabrir para Edición
                </Button>
              )}
              {!allBlocksApproved && anyBlockPending && (
                <Button
                  onClick={handleApproveAll}
                  disabled={approvingAll}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {approvingAll ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4 mr-2" />
                  )}
                  Aprobar Todo
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              &times;
            </button>
          </div>
        )}

        {/* Rejected Blocks Summary */}
        {rejectedBlocks.length > 0 && (
          <Card className="p-6 mb-6 border-2 border-red-300 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-red-800 text-lg">
                    Bloques Rechazados ({rejectedBlocks.length})
                  </h3>
                  <Button
                    onClick={() => setReopenModal(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reabrir para Edición
                  </Button>
                </div>
                <div className="space-y-3">
                  {rejectedBlocks.map((block, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-red-200">
                      <p className="font-semibold text-red-700">{block.title}</p>
                      {block.comments ? (
                        <p className="text-red-600 text-sm mt-1">
                          <strong>Motivo:</strong> {block.comments}
                        </p>
                      ) : (
                        <p className="text-red-400 text-sm mt-1 italic">Sin comentarios</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Survey Info */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Informacion de la Obra</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Empresa:</span>
              <p className="font-medium">{survey.work?.company?.name || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">N. Acta:</span>
              <p className="font-medium">{survey.work?.recordNumber || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Codigo Proyecto:</span>
              <p className="font-medium">{survey.projectCode || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">N. Levantamiento:</span>
              <p className="font-medium">{survey.surveyNumber || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Direccion:</span>
              <p className="font-medium">{survey.work?.address || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Barrio:</span>
              <p className="font-medium">{survey.work?.neighborhood || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Usuario:</span>
              <p className="font-medium">{survey.work?.userName || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Entidad Solicitante:</span>
              <p className="font-medium">{survey.work?.requestingEntity || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Sector/Vereda:</span>
              <p className="font-medium">{survey.work?.sectorVillage || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Zona:</span>
              <p className="font-medium">{survey.work?.zone || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Direccion Usuario:</span>
              <p className="font-medium">{survey.work?.userAddress || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Tipo de Area:</span>
              <p className="font-medium">{survey.work?.areaType || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Tipo de Solicitud:</span>
              <p className="font-medium">{survey.work?.requestType || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">N. Radicado:</span>
              <p className="font-medium">{survey.work?.filingNumber || '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Fecha Levantamiento:</span>
              <p className="font-medium">
                {survey.surveyDate ? new Date(survey.surveyDate).toLocaleDateString('es-CO') : '-'}
              </p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Fecha Solicitud:</span>
              <p className="font-medium">
                {survey.requestDate ? new Date(survey.requestDate).toLocaleDateString('es-CO') : '-'}
              </p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">IPP Mes Anterior:</span>
              <p className="font-medium text-cyan-700">{survey.previousMonthIpp ?? '-'}</p>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Recibido por:</span>
              <p className="font-medium">{survey.receiver?.nombre || '-'}</p>
            </div>
          </div>

          {/* Description */}
          <div className="mt-4 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
            <span className="text-[hsl(var(--canalco-neutral-500))] text-sm">Descripcion:</span>
            <p className="font-medium text-sm mt-1">{survey.description || '-'}</p>
          </div>

          {/* Document Links */}
          <div className="mt-4 pt-4 border-t border-[hsl(var(--canalco-neutral-200))] flex gap-6">
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))] text-sm">Croquis:</span>
              {survey.sketchUrl ? (
                <a
                  href={survey.sketchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-800 flex items-center gap-1 text-sm mt-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver Croquis
                </a>
              ) : (
                <p className="font-medium text-sm mt-1">-</p>
              )}
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))] text-sm">Mapa:</span>
              {survey.mapUrl ? (
                <a
                  href={survey.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-800 flex items-center gap-1 text-sm mt-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver Mapa
                </a>
              ) : (
                <p className="font-medium text-sm mt-1">-</p>
              )}
            </div>
          </div>
        </Card>

        {/* Blocks */}
        <div className="space-y-6">
          {BLOCKS.map((block) => {
            const status = survey[block.statusField] as BlockStatus | undefined;
            const comments = survey[block.commentsField] as string | undefined;

            return (
              <Card key={block.key} className="overflow-hidden">
                {/* Block Header */}
                <div className="bg-cyan-600 text-white px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {block.icon}
                    <h3 className="font-semibold">{block.title}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(status)}
                    {status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleApproveBlock(block.key)}
                          disabled={processingBlock === block.key}
                          className="bg-green-500 hover:bg-green-600 text-white"
                        >
                          {processingBlock === block.key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Aprobar
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setRejectModal({ open: true, block: block.key })}
                          disabled={processingBlock === block.key}
                          className="bg-red-500 hover:bg-red-600 text-white"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Block Content */}
                <div className="p-6">
                  {/* Rejection message - always show when rejected */}
                  {status === 'rejected' && (
                    <div className="mb-4 bg-red-50 border-2 border-red-300 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-red-700">Este bloque fue rechazado</p>
                          {comments ? (
                            <p className="text-red-600 mt-1">
                              <strong>Motivo:</strong> {comments}
                            </p>
                          ) : (
                            <p className="text-red-500 mt-1 italic">Sin comentarios adicionales</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Block specific content */}
                  {block.key === 'budget' && (
                    <BudgetBlockContent survey={survey} formatCurrency={formatCurrency} />
                  )}
                  {block.key === 'investment' && (
                    <InvestmentBlockContent survey={survey} />
                  )}
                  {block.key === 'materials' && (
                    <MaterialsBlockContent survey={survey} />
                  )}
                  {block.key === 'travelExpenses' && (
                    <TravelExpensesBlockContent survey={survey} />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      {/* Reject Modal */}
      <Dialog open={rejectModal.open} onOpenChange={(open) => !open && setRejectModal({ open: false, block: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Rechazar Bloque</DialogTitle>
            <DialogDescription>
              Ingresa el motivo del rechazo. Este comentario sera visible para el creador del levantamiento.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Motivo del rechazo..."
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectModal({ open: false, block: null });
                setRejectComments('');
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectBlock}
              disabled={!rejectComments.trim() || processingBlock !== null}
            >
              {processingBlock ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen for Editing Modal */}
      <Dialog open={reopenModal} onOpenChange={(open) => !open && setReopenModal(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Reabrir para Edición
            </DialogTitle>
            <DialogDescription>
              Esta acción reseteará todos los bloques a estado "Pendiente", permitiendo que el Director de Proyectos pueda editar el levantamiento. Luego deberá ser revisado nuevamente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))] mb-2 block">
              Motivo de reapertura (opcional)
            </label>
            <Textarea
              placeholder="Ej: Cambio en materiales solicitados por el cliente..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReopenModal(false);
                setReopenReason('');
              }}
              disabled={reopening}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReopenForEditing}
              disabled={reopening}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {reopening ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Reabrir Levantamiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

// Sub-components for block content

function BudgetBlockContent({
  survey,
  formatCurrency,
}: {
  survey: Survey;
  formatCurrency: (v: number) => string;
}) {
  const budgetItems = survey.budgetItems || [];
  const previousMonthIpp = survey.previousMonthIpp;
  const baseIpp = 100; // IPP base (configurable si viene del backend)

  // Calculate totals
  const totalBase = budgetItems.reduce(
    (sum, item) => sum + (item.unitValue || 0) * item.quantity,
    0
  );

  // Total ajustado por IPP: Total × (IPP Actual / IPP Base)
  const totalAjustado = previousMonthIpp
    ? totalBase * (previousMonthIpp / baseIpp)
    : totalBase;

  return (
    <div>
      {/* IPP Info */}
      {previousMonthIpp && (
        <div className="mb-4 p-3 bg-cyan-50 rounded-lg border border-cyan-200">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">IPP Base:</span>
              <span className="font-medium ml-2">{baseIpp}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">IPP Mes Anterior:</span>
              <span className="font-medium ml-2 text-cyan-700">{previousMonthIpp}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--canalco-neutral-500))]">Factor de Ajuste:</span>
              <span className="font-medium ml-2">{(previousMonthIpp / baseIpp).toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cyan-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Item</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">UCAP</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Valor Unitario</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Cantidad</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {budgetItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-[hsl(var(--canalco-neutral-500))]">
                  Sin items de presupuesto
                </td>
              </tr>
            ) : (
              budgetItems.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-cyan-700">{item.ucap?.code}</span>
                    {item.ucap?.description && (
                      <span className="text-[hsl(var(--canalco-neutral-500))] ml-2">
                        - {item.ucap.description}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(item.unitValue || 0)}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCurrency((item.unitValue || 0) * item.quantity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {budgetItems.length > 0 && (
            <tfoot className="bg-cyan-100">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">
                  SUBTOTAL:
                </td>
                <td className="px-3 py-2 text-right font-bold text-cyan-800">
                  {formatCurrency(totalBase)}
                </td>
              </tr>
              {previousMonthIpp && (
                <tr className="bg-green-100">
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold text-green-800">
                    TOTAL AJUSTADO (IPP {previousMonthIpp}):
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-green-800">
                    {formatCurrency(totalAjustado)}
                  </td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function InvestmentBlockContent({ survey }: { survey: Survey }) {
  const investmentItems = survey.investmentItems || [];

  return (
    <div>
      {/* Requirements */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={survey.requiresPhotometricStudies ? 'text-green-600' : 'text-gray-400'}>
            {survey.requiresPhotometricStudies ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          </span>
          Estudios Fotometricos
        </div>
        <div className="flex items-center gap-2">
          <span className={survey.requiresRetieCertification ? 'text-green-600' : 'text-gray-400'}>
            {survey.requiresRetieCertification ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          </span>
          Certificacion RETIE
        </div>
        <div className="flex items-center gap-2">
          <span className={survey.requiresRetilapCertification ? 'text-green-600' : 'text-gray-400'}>
            {survey.requiresRetilapCertification ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          </span>
          Certificacion RETILAP
        </div>
        <div className="flex items-center gap-2">
          <span className={survey.requiresCivilWork ? 'text-green-600' : 'text-gray-400'}>
            {survey.requiresCivilWork ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          </span>
          Obra Civil
        </div>
      </div>

      {/* Investment Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cyan-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">No. Orden</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Punto</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Descripcion</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Cant. Lum.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Lum. Reub.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Cant. Poste</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Red Trenzada</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Coordenadas</th>
            </tr>
          </thead>
          <tbody>
            {investmentItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-[hsl(var(--canalco-neutral-500))]">
                  Sin items de inversion
                </td>
              </tr>
            ) : (
              investmentItems.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2">{item.orderNumber || '-'}</td>
                  <td className="px-3 py-2 font-medium text-cyan-700">{item.point}</td>
                  <td className="px-3 py-2">{item.description || '-'}</td>
                  <td className="px-3 py-2 text-right">{item.luminaireQuantity || 0}</td>
                  <td className="px-3 py-2 text-right">{item.relocatedLuminaireQuantity || 0}</td>
                  <td className="px-3 py-2 text-right">{item.poleQuantity || 0}</td>
                  <td className="px-3 py-2">{item.braidedNetwork || '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {item.latitude && item.longitude
                      ? `${item.latitude}, ${item.longitude}`
                      : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaterialsBlockContent({ survey }: { survey: Survey }) {
  const materialItems = survey.materialItems || [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cyan-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Item</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Codigo</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Descripcion</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Unidad</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Cantidad</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {materialItems.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-[hsl(var(--canalco-neutral-500))]">
                Sin materiales
              </td>
            </tr>
          ) : (
            materialItems.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-cyan-700">{item.material?.code || '-'}</td>
                <td className="px-3 py-2">{item.material?.description || '-'}</td>
                <td className="px-3 py-2">{item.unitOfMeasure}</td>
                <td className="px-3 py-2 text-right">{item.quantity}</td>
                <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-500))]">
                  {item.observations || '-'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TravelExpensesBlockContent({ survey }: { survey: Survey }) {
  const travelExpenses = survey.travelExpenses || [];

  const expenseLabels: Record<string, string> = {
    // Spanish keys
    peajes: 'Peajes',
    parqueaderos: 'Parqueaderos',
    hospedaje: 'Hospedaje',
    alimentacion: 'Alimentación',
    combustible: 'Combustible',
    cuadrilla_adicional: 'Cuadrilla Adicional',
    horas_diurnas: 'Horas Diurnas',
    horas_extras_festivas: 'Horas Extras Festivas',
    // English keys from backend
    tolls: 'Peajes',
    parking: 'Parqueaderos',
    lodging: 'Hospedaje',
    food: 'Alimentación',
    fuel: 'Combustible',
    additional_crew: 'Cuadrilla Adicional',
    day_hours: 'Horas Diurnas',
    holiday_overtime: 'Horas Extras Festivas',
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cyan-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Item</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Descripcion</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-cyan-800">Cantidad</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-800">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {travelExpenses.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-[hsl(var(--canalco-neutral-500))]">
                Sin costos de viaje
              </td>
            </tr>
          ) : (
            travelExpenses.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2">{idx + 1}</td>
                <td className="px-3 py-2 font-medium">
                  {expenseLabels[item.expenseType] || item.expenseType}
                </td>
                <td className="px-3 py-2 text-right">{item.quantity}</td>
                <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-500))]">
                  {item.observations || '-'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
