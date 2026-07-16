import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  surveysService,
  type Survey,
  type BlockStatus,
  type SurveyDatabaseItem,
  type AccessCompany,
} from '@/services/surveys.service';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { mapToDepartments, getMunicipioName, visibleMunicipalitiesOf, type Municipality } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Database,
  LayoutGrid,
  Filter,
} from 'lucide-react';
import { Footer } from '@/components/ui/footer';

type MainView = 'list' | 'database';

const normalizeLocationName = (name?: string | null) =>
  getMunicipioName(name || '')
    .replace(/^Unión Temporal Alumbrado Público\s+/i, '')
    .replace(/^Uni[oó]n Temporal Alumbrado P[uú]blico\s+/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^union temporal alumbrado publico\s+/i, '')
    .toLowerCase()
    .trim();

export default function LevantamientosListPage() {
  const navigate = useNavigate();
  const { access, loading: accessLoading, error: accessError } = useSurveyAccess();
  const { hasPermission } = useGranularPermissions();
  const { user } = useAuth();
  // Roles que NO se limitan a "solo lo que yo creé". El backend ya acota los
  // levantamientos por acceso (empresa/proyecto), así que el Director de Proyecto
  // ve TODOS los de su departamento, no únicamente los que él registró.
  const canSeeAllSurveys =
    user?.nombreRol === 'Director Técnico' ||
    user?.nombreRol === 'Gerencia de Proyectos' ||
    user?.nombreRol === 'Analista PMO' ||
    (user?.nombreRol?.startsWith('Director de Proyecto') ?? false);
  const [mainView, setMainView] = useState<MainView>('list');
  const [activeTab, setActiveTab] = useState('');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [filteredSurveys, setFilteredSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMunicipality, setActiveMunicipality] = useState<Municipality | null>(null);

  // Database view state
  const [databaseData, setDatabaseData] = useState<SurveyDatabaseItem[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [databaseFilters, setDatabaseFilters] = useState({
    companyId: 'all',
    search: '',
    budgetStatus: 'all',
    investmentStatus: 'all',
    materialsStatus: 'all',
    travelExpensesStatus: 'all',
  });

  // Mapear empresas y proyectos a departamentos
  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapToDepartments(access.companies, access.projects || []);
  }, [access]);

  // Obtener IDs del departamento activo
  const activeDept = useMemo(() => departments.find((d) => d.name === activeTab), [activeTab, departments]);
  const activeCompanyIds = useMemo(() => activeDept?.companyIds || [], [activeDept]);
  const activeProjectIds = useMemo(() => activeDept?.projectIds || [], [activeDept]);
  const activeMunicipalityNames = useMemo(
    () => new Set((activeDept?.municipalities || []).map((m) => normalizeLocationName(m.name))),
    [activeDept],
  );
  // Municipios visibles en el filtro (sin la empresa matriz Canales & Contactos).
  const visibleMunicipalities = useMemo(
    () => visibleMunicipalitiesOf(activeDept?.municipalities),
    [activeDept],
  );

  // Filtrar por municipio seleccionado dentro del departamento
  const displaySurveys = useMemo(() => {
    if (!activeMunicipality) return filteredSurveys;
    const municipalityName = normalizeLocationName(activeMunicipality.name);
    if (activeMunicipality.type === 'company') {
      return filteredSurveys.filter(
        (s) =>
          s.work?.companyId === activeMunicipality.id ||
          normalizeLocationName(s.work?.company?.name) === municipalityName ||
          // Surveys stored under a related project (e.g. companyId=CanalesYContratos + projectId=CB)
          (activeMunicipality.linkedProjectId !== undefined &&
            s.work?.projectId === activeMunicipality.linkedProjectId),
      );
    }
    // Project-type: match by projectId/name, or company-level surveys (no projectId) under the same company
    return filteredSurveys.filter(
      (s) =>
        s.work?.projectId === activeMunicipality.id ||
        normalizeLocationName((s.work as any)?.project?.name) === municipalityName ||
        (!s.work?.projectId &&
          activeMunicipality.companyId !== undefined &&
          s.work?.companyId === activeMunicipality.companyId),
    );
  }, [filteredSurveys, activeMunicipality]);

  // Establecer el primer departamento como activo al cargar
  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  // Al cambiar de departamento, seleccionar el primer municipio visible automáticamente
  useEffect(() => {
    const dept = departments.find((d) => d.name === activeTab);
    const munis = visibleMunicipalitiesOf(dept?.municipalities);
    setActiveMunicipality(munis.length > 0 ? munis[0] : null);
  }, [activeTab, departments]);

  useEffect(() => {
    if (activeCompanyIds.length > 0 || activeProjectIds.length > 0) {
      loadSurveys();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyIds, activeProjectIds]);

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
            s.work?.recordNumber?.toLowerCase().includes(term) ||
            s.projectCode?.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, surveys]);

  // Load database when switching to database view
  useEffect(() => {
    if (mainView === 'database') {
      loadDatabaseData();
    }
  }, [mainView]);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters: Parameters<typeof surveysService.getSurveysDatabase>[0] = {
        limit: 500,
        ...(!canSeeAllSurveys && user?.userId ? { createdBy: user.userId } : {}),
      };
      const data = await surveysService.getSurveysDatabase(filters);
      const mappedSurveys = (data.data || [])
        .map(mapDatabaseItemToSurvey)
        .filter((survey) => {
          const companyMatches =
            activeCompanyIds.length > 0 &&
            survey.work?.companyId !== undefined &&
            activeCompanyIds.includes(survey.work.companyId);
          const projectMatches =
            activeProjectIds.length > 0 &&
            (survey.work as any)?.projectId !== undefined &&
            activeProjectIds.includes((survey.work as any).projectId);
          const nameMatches =
            activeMunicipalityNames.has(normalizeLocationName(survey.work?.company?.name)) ||
            activeMunicipalityNames.has(normalizeLocationName((survey.work as any)?.project?.name));
          return companyMatches || projectMatches || nameMatches;
        });
      setSurveys(mappedSurveys);
      setFilteredSurveys(mappedSurveys);
    } catch (err: any) {
      console.error('Error loading surveys:', err);
      setError(err.response?.data?.message || 'Error al cargar los levantamientos');
    } finally {
      setLoading(false);
    }
  };

  const mapDatabaseItemToSurvey = (item: SurveyDatabaseItem): Survey => ({
    surveyId: item.surveyId,
    surveyNumber: item.surveyNumber,
    projectCode: item.projectCode,
    workId: item.workId,
    surveyDate: item.surveyDate,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    statusId: 0,
    receivedBy: 0,
    budgetStatus: item.budgetStatus,
    budgetComments: item.budgetComments,
    investmentStatus: item.investmentStatus,
    investmentComments: item.investmentComments,
    materialsStatus: item.materialsStatus,
    materialsComments: item.materialsComments,
    travelExpensesStatus: item.travelExpensesStatus,
    travelExpensesComments: item.travelExpensesComments,
    work: {
      workId: item.workId,
      workCode: item.workCode || '',
      companyId: item.companyId,
      projectId: item.projectId,
      name: item.workName,
      address: item.workAddress || item.address || '',
      neighborhood: item.neighborhood || '',
      userName: item.userName || '',
      requestingEntity: item.requestingEntity || '',
      recordNumber: item.recordNumber || '',
      sectorVillage: item.sectorVillage || '',
      zone: item.zone || '',
      userAddress: item.userAddress || '',
      areaType: item.areaType || '',
      requestType: item.requestType || '',
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
      company: {
        companyId: item.companyId,
        name: item.companyName,
        abbreviation: '',
      },
      project:
        item.projectId || item.projectName
          ? {
              projectId: item.projectId,
              name: item.projectName || '',
            }
          : undefined,
    } as Survey['work'],
  });

  const loadDatabaseData = async () => {
    try {
      setDatabaseLoading(true);
      const filters: any = {};
      if (databaseFilters.companyId && databaseFilters.companyId !== 'all') {
        filters.companyId = Number(databaseFilters.companyId);
      }
      if (databaseFilters.search) filters.search = databaseFilters.search;
      if (databaseFilters.budgetStatus && databaseFilters.budgetStatus !== 'all') {
        filters.budgetStatus = databaseFilters.budgetStatus;
      }
      if (databaseFilters.investmentStatus && databaseFilters.investmentStatus !== 'all') {
        filters.investmentStatus = databaseFilters.investmentStatus;
      }
      if (databaseFilters.materialsStatus && databaseFilters.materialsStatus !== 'all') {
        filters.materialsStatus = databaseFilters.materialsStatus;
      }
      if (databaseFilters.travelExpensesStatus && databaseFilters.travelExpensesStatus !== 'all') {
        filters.travelExpensesStatus = databaseFilters.travelExpensesStatus;
      }
      const response = await surveysService.getSurveysDatabase(filters);
      setDatabaseData(response.data || []);
    } catch (err: any) {
      console.error('Error loading database:', err);
      setError(err.response?.data?.message || 'Error al cargar la base de datos');
    } finally {
      setDatabaseLoading(false);
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
    const { allApproved, hasRejections, approved } = getReviewSummary(survey);

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

  const getStatusBadge = (status?: string | BlockStatus) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pendiente' },
      in_review: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'En revisión' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Aprobado' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rechazado' },
    };
    const config = statusConfig[status || 'pending'] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status || '-' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  // Companies available for database filter
  const availableCompanies: AccessCompany[] = access?.companies || [];

  // Get surveys with rejections for alert
  const surveysWithRejections = displaySurveys.filter(s => getReviewSummary(s).hasRejections);

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
                {mainView === 'database'
                  ? 'Base de Datos de Levantamientos'
                  : `Mis Levantamientos - ${activeTab}`}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {mainView === 'database'
                  ? `${databaseData.length} registros`
                  : `${displaySurveys.length} levantamientos registrados`}
              </p>
            </div>

            {/* Right: View Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMainView('list')}
                  className={`rounded-none ${
                    mainView === 'list'
                      ? 'bg-[hsl(var(--canalco-primary))] text-white hover:bg-[hsl(var(--canalco-primary))]'
                      : ''
                  }`}
                >
                  <LayoutGrid className="w-4 h-4 mr-1" />
                  Mis Levantamientos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMainView('database')}
                  className={`rounded-none ${
                    mainView === 'database'
                      ? 'bg-[hsl(var(--canalco-primary))] text-white hover:bg-[hsl(var(--canalco-primary))]'
                      : ''
                  }`}
                >
                  <Database className="w-4 h-4 mr-1" />
                  Base de Datos
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {mainView === 'database' ? (
          /* Database View */
          <DatabaseView
            data={databaseData}
            loading={databaseLoading}
            filters={databaseFilters}
            setFilters={setDatabaseFilters}
            onSearch={loadDatabaseData}
            companies={availableCompanies}
            navigate={navigate}
            getStatusBadge={getStatusBadge}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
          />
        ) : (
          /* List View */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-56">
                <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Departamento</label>
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.name} value={dept.name}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {activeDept && visibleMunicipalities.length > 0 && (
                <div className="w-56">
                  <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
                  <Select
                    value={activeMunicipality ? `${activeMunicipality.type}-${activeMunicipality.id}` : ''}
                    onValueChange={(val) => {
                      const muni = visibleMunicipalities.find((m) => `${m.type}-${m.id}` === val);
                      if (muni) setActiveMunicipality(muni);
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Seleccionar municipio" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleMunicipalities.map((muni) => (
                        <SelectItem key={`${muni.type}-${muni.id}`} value={`${muni.type}-${muni.id}`}>
                          {getMunicipioName(muni.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

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
                                    onClick={() => navigate(`/dashboard/levantamiento-obras/obras/editar/${survey.workId}`)}
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
                      placeholder="Buscar por número, nombre de obra, Cod. Proyecto..."
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
                ) : displaySurveys.length === 0 ? (
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
                        <thead className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              N° Levantamiento
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              Cod. Contabilidad
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              Obra
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              Fecha
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              Estado Revisión
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              Bloques
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {displaySurveys.map((survey, index) => {
                            const reviewSummary = getReviewSummary(survey);
                            const canEdit = !reviewSummary.allApproved;

                            return (
                              <tr
                                key={survey.surveyId}
                                className={`${index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'} ${reviewSummary.hasRejections ? 'border-l-4 border-l-red-500' : ''}`}
                              >
                                <td className="px-4 py-3 font-mono font-medium text-[hsl(var(--canalco-neutral-700))]">
                                  {survey.surveyNumber || '-'}
                                </td>
                                <td className="px-4 py-3 font-mono text-sm font-semibold text-[hsl(var(--canalco-primary))]">
                                  {survey.projectCode || '-'}
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
                                      className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-primary))]"
                                      title="Ver detalle"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    {hasPermission('levantamientos:editar') && canEdit ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => navigate(`/dashboard/levantamiento-obras/obras/editar/${survey.workId}`)}
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
        )}
      </main>

      <Footer />
    </div>
  );
}

// Database View Component
interface DatabaseViewProps {
  data: SurveyDatabaseItem[];
  loading: boolean;
  filters: {
    companyId: string;
    search: string;
    budgetStatus: string;
    investmentStatus: string;
    materialsStatus: string;
    travelExpensesStatus: string;
  };
  setFilters: React.Dispatch<
    React.SetStateAction<{
      companyId: string;
      search: string;
      budgetStatus: string;
      investmentStatus: string;
      materialsStatus: string;
      travelExpensesStatus: string;
    }>
  >;
  onSearch: () => void;
  companies: AccessCompany[];
  navigate: (path: string) => void;
  getStatusBadge: (status?: string | BlockStatus) => React.ReactNode;
  formatDate: (date: string) => string;
  formatCurrency: (value: number) => string;
}

function DatabaseView({
  data,
  loading,
  filters,
  setFilters,
  onSearch,
  companies,
  navigate,
  getStatusBadge,
  formatDate,
  formatCurrency,
}: DatabaseViewProps) {
  const statusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'approved', label: 'Aprobado' },
    { value: 'rejected', label: 'Rechazado' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
          <span className="font-semibold text-sm">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Empresa</label>
            <Select
              value={filters.companyId}
              onValueChange={(value) => setFilters((f) => ({ ...f, companyId: value }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.companyId} value={c.companyId.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Presupuesto</label>
            <Select
              value={filters.budgetStatus}
              onValueChange={(value) => setFilters((f) => ({ ...f, budgetStatus: value }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Inversión</label>
            <Select
              value={filters.investmentStatus}
              onValueChange={(value) => setFilters((f) => ({ ...f, investmentStatus: value }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Materiales</label>
            <Select
              value={filters.materialsStatus}
              onValueChange={(value) => setFilters((f) => ({ ...f, materialsStatus: value }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Costos Viaje</label>
            <Select
              value={filters.travelExpensesStatus}
              onValueChange={(value) => setFilters((f) => ({ ...f, travelExpensesStatus: value }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={onSearch} className="w-full h-9" disabled={loading}>
              <Search className="w-4 h-4 mr-1" />
              Buscar
            </Button>
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Código</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Obra</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Empresa</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">N. Acta</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Total Ppto</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Presupuesto</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Inversión</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Materiales</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Viajes</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Fecha</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-[hsl(var(--canalco-neutral-500))]">
                      No se encontraron levantamientos
                    </td>
                  </tr>
                ) : (
                  data.map((item, index) => (
                    <tr
                      key={item.surveyId}
                      className={`cursor-pointer hover:bg-[hsl(var(--canalco-neutral-100))] ${index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}`}
                      onClick={() => navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${item.surveyId}`)}
                    >
                      <td className="px-3 py-2 font-mono text-[hsl(var(--canalco-primary))]">{item.projectCode || item.surveyNumber}</td>
                      <td className="px-3 py-2 font-medium max-w-[150px] truncate" title={item.workName}>
                        {item.workName}
                      </td>
                      <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-600))]">{item.companyName}</td>
                      <td className="px-3 py-2 font-mono text-sm">{item.recordNumber || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {item.budgetTotal ? formatCurrency(item.budgetTotal) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(item.budgetStatus)}</td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(item.investmentStatus)}</td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(item.materialsStatus)}</td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(item.travelExpensesStatus)}</td>
                      <td className="px-3 py-2 text-center text-[hsl(var(--canalco-neutral-600))]">
                        {formatDate(item.surveyDate)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${item.surveyId}`);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
