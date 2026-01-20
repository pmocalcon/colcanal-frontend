import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveysService, type Survey, type BlockStatus } from '@/services/surveys.service';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';
import { mapCompaniesToDepartments } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Home,
  ArrowLeft,
  Search,
  Eye,
  Edit,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { Footer } from '@/components/ui/footer';

export default function LevantamientosListPage() {
  const navigate = useNavigate();
  const { access, loading: accessLoading, error: accessError } = useSurveyAccess();
  const { hasPermission } = useGranularPermissions();
  const [activeTab, setActiveTab] = useState('');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [filteredSurveys, setFilteredSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Mapear empresas a departamentos
  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  // Obtener IDs de empresas del departamento activo
  const activeCompanyIds = useMemo(() => {
    const dept = departments.find((d) => d.name === activeTab);
    return dept?.companyIds || [];
  }, [activeTab, departments]);

  // Establecer el primer departamento como activo al cargar
  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  useEffect(() => {
    if (activeCompanyIds.length > 0) {
      loadSurveys();
    }
  }, [activeCompanyIds]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredSurveys(surveys);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredSurveys(
        surveys.filter(
          (s) =>
            s.surveyNumber?.toLowerCase().includes(term) ||
            s.work?.name?.toLowerCase().includes(term) ||
            s.work?.recordNumber?.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, surveys]);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await surveysService.getSurveys({
        companyId: activeCompanyIds
      });
      setSurveys(data.data || []);
      setFilteredSurveys(data.data || []);
    } catch (err: any) {
      console.error('Error loading surveys:', err);
      setError(err.response?.data?.message || 'Error al cargar los levantamientos');
    } finally {
      setLoading(false);
    }
  };

  // Calculate review status for a survey
  const getReviewSummary = (survey: Survey) => {
    const blocks = [
      { name: 'Presupuesto', status: survey.budgetStatus, comments: survey.budgetComments },
      { name: 'Inversión', status: survey.investmentStatus, comments: survey.investmentComments },
      { name: 'Materiales', status: survey.materialsStatus, comments: survey.materialsComments },
      { name: 'Costos Viaje', status: survey.travelExpensesStatus, comments: survey.travelExpensesComments },
    ];

    const approved = blocks.filter(b => b.status === 'approved').length;
    const rejected = blocks.filter(b => b.status === 'rejected');
    const pending = blocks.filter(b => b.status === 'pending' || !b.status).length;

    const allApproved = approved === 4;
    const hasRejections = rejected.length > 0;

    return { blocks, approved, rejected, pending, allApproved, hasRejections };
  };

  const getBlockStatusIcon = (status?: BlockStatus) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-3 h-3 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-3 h-3 text-red-600" />;
      default:
        return <Clock className="w-3 h-3 text-amber-500" />;
    }
  };

  const getOverallStatusBadge = (survey: Survey) => {
    const { allApproved, hasRejections, pending, approved } = getReviewSummary(survey);

    if (allApproved) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <Lock className="w-3 h-3 mr-1" />
          Aprobado
        </Badge>
      );
    }
    if (hasRejections) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Requiere Corrección
        </Badge>
      );
    }
    if (approved > 0) {
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
          <Clock className="w-3 h-3 mr-1" />
          En Revisión ({approved}/4)
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">
        <Clock className="w-3 h-3 mr-1" />
        Pendiente
      </Badge>
    );
  };

  // Get surveys with rejections for alert
  const surveysWithRejections = filteredSurveys.filter(s => getReviewSummary(s).hasRejections);

  // Loading state
  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando accesos...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <Alert className="max-w-md border-red-500 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700">{accessError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // No access state
  if (departments.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <Alert className="max-w-md border-amber-500 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            No tienes acceso a ningún departamento. Contacta al administrador.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Navigation */}
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
                onClick={() => navigate('/dashboard/levantamiento-obras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Mis Levantamientos - {activeTab}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {filteredSurveys.length} levantamientos registrados
              </p>
            </div>

            {/* Right spacer */}
            <div className="w-32" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Tabs por Departamento */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground mx-auto">
            {departments.map((dept) => (
              <TabsTrigger key={dept.name} value={dept.name}>
                {dept.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {departments.map((dept) => (
            <TabsContent key={dept.name} value={dept.name}>
        {/* Rejections Alert */}
        {surveysWithRejections.length > 0 && (
          <Card className="p-4 mb-6 border-2 border-red-300 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-red-800 mb-2">
                  Tienes {surveysWithRejections.length} levantamiento(s) con rechazos
                </h3>
                <div className="space-y-2">
                  {surveysWithRejections.map(survey => {
                    const { rejected } = getReviewSummary(survey);
                    return (
                      <div key={survey.surveyId} className="bg-white rounded p-3 border border-red-200">
                        <p className="font-medium text-red-700">
                          {survey.surveyNumber} - {survey.work?.name}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {rejected.map((block, idx) => (
                            <li key={idx} className="text-sm text-red-600">
                              <strong>{block.name}:</strong> {block.comments || 'Sin comentarios'}
                            </li>
                          ))}
                        </ul>
                        {hasPermission('levantamientos:editar') && (
                          <Button
                            size="sm"
                            className="mt-2 bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => navigate(`/dashboard/levantamiento-obras/levantamientos/editar/${survey.surveyId}`)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Corregir
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Search Bar */}
        <div className="mb-6 flex gap-4">
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <Input
              type="text"
              placeholder="Buscar por número, nombre de obra..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
          </div>
        ) : filteredSurveys.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-12 text-center">
            <ClipboardList className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
            <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
              {searchTerm ? 'No se encontraron levantamientos' : 'No hay levantamientos registrados'}
            </h3>
            <p className="text-[hsl(var(--canalco-neutral-500))]">
              {searchTerm
                ? 'Intenta con otros términos de búsqueda'
                : 'Los levantamientos aparecerán aquí una vez se creen desde las obras'}
            </p>
          </div>
        ) : (
          /* Surveys Table */
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-cyan-100 border-b border-cyan-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      N° Levantamiento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Obra
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Fecha
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-800">
                      Estado Revisión
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-800">
                      Bloques
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-800">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSurveys.map((survey, index) => {
                    const reviewSummary = getReviewSummary(survey);
                    const canEdit = !reviewSummary.allApproved;

                    return (
                      <tr
                        key={survey.surveyId}
                        className={`${index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'} ${reviewSummary.hasRejections ? 'border-l-4 border-l-red-500' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-cyan-700">
                          {survey.surveyNumber || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{survey.work?.name || '-'}</p>
                            <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                              {survey.work?.recordNumber || '-'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                          {survey.surveyDate ? new Date(survey.surveyDate).toLocaleDateString('es-CO') : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getOverallStatusBadge(survey)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1" title="Presupuesto | Inversión | Materiales | Costos Viaje">
                            {reviewSummary.blocks.map((block, idx) => (
                              <div key={idx} title={`${block.name}: ${block.status || 'pendiente'}`}>
                                {getBlockStatusIcon(block.status as BlockStatus)}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${survey.surveyId}`)}
                              className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-cyan-600"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {hasPermission('levantamientos:editar') && canEdit ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/dashboard/levantamiento-obras/levantamientos/editar/${survey.surveyId}`)}
                                className={`h-8 w-8 ${reviewSummary.hasRejections ? 'text-red-600 hover:text-red-700' : 'text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-primary))]'}`}
                                title={reviewSummary.hasRejections ? 'Corregir rechazos' : 'Editar'}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            ) : !canEdit ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled
                                className="h-8 w-8 text-gray-300 cursor-not-allowed"
                                title="Aprobado - No editable"
                              >
                                <Lock className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-300))] p-4">
          <h4 className="font-semibold text-sm text-[hsl(var(--canalco-neutral-700))] mb-3">Leyenda de estados</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Aprobado</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span>Rechazado</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Pendiente</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <span>Bloqueado (Completamente aprobado)</span>
            </div>
          </div>
        </div>
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
