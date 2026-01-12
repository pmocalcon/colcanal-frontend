import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  surveysService,
  type Survey,
  type AccessCompany,
  type AccessProject,
  type SurveyDatabaseItem,
  type BlockStatus,
} from '@/services/surveys.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Building2,
  FolderOpen,
  ClipboardList,
  Eye,
  CheckCircle,
  XCircle,
  ChevronRight,
  Database,
  LayoutGrid,
  Search,
  Filter,
} from 'lucide-react';
import { Footer } from '@/components/ui/footer';

type ViewMode = 'cards' | 'obras' | 'levantamientos';
type MainView = 'revision' | 'database';

interface CardData {
  id: number;
  name: string;
  type: 'company' | 'project';
  companyId: number;
  projectId?: number;
  pendingCount: number;
}

interface WorkWithSurveys {
  workId: number;
  workCode?: string;
  name: string;
  address: string;
  recordNumber?: string;
  pendingSurveys: Survey[];
  reviewedSurveys: Survey[];
}

export default function RevisarLevantamientosPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Main view toggle
  const [mainView, setMainView] = useState<MainView>('revision');

  // Reviewer access data from backend
  const [accessCompanies, setAccessCompanies] = useState<AccessCompany[]>([]);
  const [accessProjects, setAccessProjects] = useState<AccessProject[]>([]);
  const [allSurveys, setAllSurveys] = useState<Survey[]>([]);

  // View state for revision flow
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [selectedWork, setSelectedWork] = useState<WorkWithSurveys | null>(null);
  const [cardSurveys, setCardSurveys] = useState<Survey[]>([]);
  const [loadingCardSurveys, setLoadingCardSurveys] = useState(false);

  // Database view state
  const [databaseData, setDatabaseData] = useState<SurveyDatabaseItem[]>([]);
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [databaseFilters, setDatabaseFilters] = useState({
    companyId: '',
    search: '',
    budgetStatus: '',
    investmentStatus: '',
    materialsStatus: '',
    travelExpensesStatus: '',
  });

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Load database when switching to database view
  useEffect(() => {
    if (mainView === 'database') {
      loadDatabaseData();
    }
  }, [mainView]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [accessData, surveysResponse] = await Promise.all([
        surveysService.getMyAccess(),
        surveysService.getSurveysForReview(),
      ]);

      setAccessCompanies(accessData.companies || []);
      setAccessProjects(accessData.projects || []);
      setAllSurveys(surveysResponse.data || []);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const loadDatabaseData = async () => {
    try {
      setDatabaseLoading(true);
      const filters: any = {};
      if (databaseFilters.companyId) filters.companyId = Number(databaseFilters.companyId);
      if (databaseFilters.search) filters.search = databaseFilters.search;
      if (databaseFilters.budgetStatus) filters.budgetStatus = databaseFilters.budgetStatus;
      if (databaseFilters.investmentStatus) filters.investmentStatus = databaseFilters.investmentStatus;
      if (databaseFilters.materialsStatus) filters.materialsStatus = databaseFilters.materialsStatus;
      if (databaseFilters.travelExpensesStatus) filters.travelExpensesStatus = databaseFilters.travelExpensesStatus;

      const response = await surveysService.getSurveysDatabase(filters);
      setDatabaseData(response.data || []);
    } catch (err: any) {
      console.error('Error loading database:', err);
      setError(err.response?.data?.message || 'Error al cargar la base de datos');
    } finally {
      setDatabaseLoading(false);
    }
  };

  // Build cards data from backend access configuration
  const cardsData = useMemo((): CardData[] => {
    const cards: CardData[] = [];

    accessCompanies.forEach((company) => {
      const pendingCount = allSurveys.filter(
        (s) => s.work?.company?.companyId === company.companyId && s.status?.code === 'pending'
      ).length;
      cards.push({
        id: company.companyId,
        name: company.name,
        type: 'company',
        companyId: company.companyId,
        pendingCount,
      });
    });

    accessProjects.forEach((project) => {
      const pendingCount = allSurveys.filter(
        (s) =>
          s.work?.company?.companyId === project.companyId &&
          (s as any).work?.project?.projectId === project.projectId &&
          s.status?.code === 'pending'
      ).length;
      cards.push({
        id: project.projectId,
        name: project.name,
        type: 'project',
        companyId: project.companyId,
        projectId: project.projectId,
        pendingCount,
      });
    });

    return cards;
  }, [accessCompanies, accessProjects, allSurveys]);

  // Get obras for selected card
  const obrasForSelectedCard = useMemo((): WorkWithSurveys[] => {
    if (!selectedCard || cardSurveys.length === 0) return [];

    const workMap = new Map<number, WorkWithSurveys>();
    cardSurveys.forEach((survey) => {
      if (!survey.work) return;
      const workId = survey.workId;
      if (!workMap.has(workId)) {
        workMap.set(workId, {
          workId,
          workCode: survey.work.workCode,
          name: survey.work.name,
          address: survey.work.address,
          recordNumber: (survey.work as any).recordNumber,
          pendingSurveys: [],
          reviewedSurveys: [],
        });
      }
      const workEntry = workMap.get(workId)!;
      // Check if any block is pending
      const hasPendingBlocks =
        survey.budgetStatus === 'pending' ||
        survey.investmentStatus === 'pending' ||
        survey.materialsStatus === 'pending' ||
        survey.travelExpensesStatus === 'pending';

      if (hasPendingBlocks) {
        workEntry.pendingSurveys.push(survey);
      } else {
        workEntry.reviewedSurveys.push(survey);
      }
    });

    return Array.from(workMap.values());
  }, [selectedCard, cardSurveys]);

  const handleCardClick = async (card: CardData) => {
    setSelectedCard(card);
    setViewMode('obras');
    setLoadingCardSurveys(true);

    try {
      const response = await surveysService.getSurveys({ companyId: card.companyId });
      setCardSurveys(response.data || []);
    } catch (err: any) {
      console.error('Error loading surveys for card:', err);
      setError(err.response?.data?.message || 'Error al cargar levantamientos');
    } finally {
      setLoadingCardSurveys(false);
    }
  };

  const handleWorkClick = (work: WorkWithSurveys) => {
    // If there's only one survey total, go directly to detail page
    const allSurveysInWork = [...work.pendingSurveys, ...work.reviewedSurveys];
    if (allSurveysInWork.length === 1) {
      navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${allSurveysInWork[0].surveyId}`);
      return;
    }
    // Otherwise show the list
    setSelectedWork(work);
    setViewMode('levantamientos');
  };

  const handleBack = () => {
    if (viewMode === 'levantamientos') {
      setSelectedWork(null);
      setViewMode('obras');
    } else if (viewMode === 'obras') {
      setSelectedCard(null);
      setCardSurveys([]);
      setViewMode('cards');
    }
  };

  const getStatusBadge = (status?: string | BlockStatus) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pendiente' },
      in_review: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'En Revision' },
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getTitle = () => {
    if (mainView === 'database') return 'Base de Datos de Levantamientos';
    if (viewMode === 'levantamientos' && selectedWork) return `Levantamientos - ${selectedWork.name}`;
    if (viewMode === 'obras' && selectedCard) return `Obras - ${selectedCard.name}`;
    return 'Revisar Levantamientos';
  };

  const getSubtitle = () => {
    if (mainView === 'database') return `${databaseData.length} registros`;
    if (viewMode === 'levantamientos' && selectedWork)
      return `${selectedWork.pendingSurveys.length} pendientes, ${selectedWork.reviewedSurveys.length} revisados`;
    if (viewMode === 'obras' && selectedCard) return `${obrasForSelectedCard.length} obras`;
    return 'Selecciona una empresa o proyecto';
  };

  // Get unique companies for database filter
  const availableCompanies = useMemo(() => {
    const companies = [...accessCompanies];
    accessProjects.forEach((p) => {
      if (!companies.find((c) => c.companyId === p.companyId)) {
        companies.push({ companyId: p.companyId, name: `Empresa ${p.companyId}` });
      }
    });
    return companies;
  }, [accessCompanies, accessProjects]);

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
                onClick={
                  mainView === 'database'
                    ? () => setMainView('revision')
                    : viewMode === 'cards'
                    ? () => navigate('/dashboard/levantamiento-obras')
                    : handleBack
                }
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            {/* Center: Title */}
            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                {getTitle()}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">{getSubtitle()}</p>
            </div>

            {/* Right: View Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMainView('revision')}
                  className={`rounded-none ${
                    mainView === 'revision'
                      ? 'bg-[hsl(var(--canalco-primary))] text-white hover:bg-[hsl(var(--canalco-primary))]'
                      : ''
                  }`}
                >
                  <LayoutGrid className="w-4 h-4 mr-1" />
                  Revision
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
        ) : mainView === 'database' ? (
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
        ) : viewMode === 'cards' ? (
          /* Cards Grid View */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cardsData.length === 0 ? (
              <div className="col-span-full bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-12 text-center">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                  Sin accesos configurados
                </h3>
                <p className="text-[hsl(var(--canalco-neutral-500))]">
                  No tienes empresas o proyectos asignados para revision
                </p>
              </div>
            ) : (
              cardsData.map((card) => (
                <Card
                  key={`${card.type}-${card.id}`}
                  className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105 border-2 hover:border-[hsl(var(--canalco-primary))]"
                  onClick={() => handleCardClick(card)}
                >
                  <div className="flex flex-col items-center text-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        card.type === 'company' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}
                    >
                      {card.type === 'company' ? <Building2 className="w-6 h-6" /> : <FolderOpen className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-[hsl(var(--canalco-neutral-800))] line-clamp-2">
                        {card.name}
                      </h3>
                      <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
                        {card.type === 'company' ? 'Empresa' : 'Proyecto'}
                      </p>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-sm font-bold ${
                        card.pendingCount > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {card.pendingCount} pendientes
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : viewMode === 'obras' ? (
          /* Obras List View */
          <div className="space-y-4">
            {loadingCardSurveys ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
              </div>
            ) : obrasForSelectedCard.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-12 text-center">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                  No hay obras con levantamientos
                </h3>
                <p className="text-[hsl(var(--canalco-neutral-500))]">
                  No se encontraron levantamientos para {selectedCard?.name}
                </p>
              </div>
            ) : (
              obrasForSelectedCard.map((work) => (
                <Card
                  key={work.workId}
                  className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4 border-l-[hsl(var(--canalco-primary))]"
                  onClick={() => handleWorkClick(work)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-grow">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-[hsl(var(--canalco-neutral-800))]">{work.name}</h3>
                        {work.recordNumber && (
                          <span className="text-xs font-mono bg-[hsl(var(--canalco-neutral-100))] px-2 py-1 rounded">
                            Acta: {work.recordNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">{work.address}</p>
                      <div className="flex gap-4 mt-2">
                        <span
                          className={`text-sm font-medium ${
                            work.pendingSurveys.length > 0 ? 'text-orange-600' : 'text-green-600'
                          }`}
                        >
                          {work.pendingSurveys.length} pendientes
                        </span>
                        <span className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                          {work.reviewedSurveys.length} revisados
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[hsl(var(--canalco-neutral-400))]" />
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* Levantamientos View */
          <div className="space-y-6">
            {/* Pending Section */}
            {selectedWork && selectedWork.pendingSurveys.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-orange-700 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  PENDIENTES ({selectedWork.pendingSurveys.length})
                </h2>
                <div className="bg-white rounded-lg shadow-md border border-orange-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-orange-50 border-b border-orange-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-orange-800">Codigo Proyecto</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-orange-800">Fecha</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-orange-800">Estado</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-orange-800">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWork.pendingSurveys.map((survey, index) => (
                        <tr key={survey.surveyId} className={index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}>
                          <td className="px-4 py-3 font-mono font-medium text-[hsl(var(--canalco-primary))]">
                            {survey.projectCode || '-'}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                            {survey.surveyDate ? formatDate(survey.surveyDate) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(survey.status?.code)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${survey.surveyId}`)
                                }
                                className="h-8 w-8 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                                title="Ver y Revisar"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reviewed Section */}
            {selectedWork && selectedWork.reviewedSurveys.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-green-700 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  YA REVISADOS ({selectedWork.reviewedSurveys.length})
                </h2>
                <div className="bg-white rounded-lg shadow-md border border-green-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50 border-b border-green-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-green-800">Codigo Proyecto</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-green-800">Fecha</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-green-800">Estado</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-green-800">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWork.reviewedSurveys.map((survey, index) => (
                        <tr key={survey.surveyId} className={index % 2 === 0 ? 'bg-white' : 'bg-green-50/30'}>
                          <td className="px-4 py-3 font-mono font-medium text-[hsl(var(--canalco-neutral-600))]">
                            {survey.projectCode || '-'}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                            {survey.surveyDate ? formatDate(survey.surveyDate) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(survey.status?.code)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${survey.surveyId}`)
                                }
                                className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-cyan-600"
                                title="Ver detalle"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state */}
            {selectedWork && selectedWork.pendingSurveys.length === 0 && selectedWork.reviewedSurveys.length === 0 && (
              <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] p-12 text-center">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 text-[hsl(var(--canalco-neutral-400))]" />
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Sin levantamientos</h3>
                <p className="text-[hsl(var(--canalco-neutral-500))]">Esta obra no tiene levantamientos registrados</p>
              </div>
            )}
          </div>
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
    { value: '', label: 'Todos' },
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
                <SelectItem value="">Todas</SelectItem>
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
            <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Inversion</label>
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
              <thead className="bg-cyan-100 border-b border-cyan-200">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-cyan-800">Codigo</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-cyan-800">Obra</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-cyan-800">Empresa</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-cyan-800">N. Acta</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-cyan-800">Total Ppto</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-800">Presupuesto</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-800">Inversion</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-800">Materiales</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-800">Viajes</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-800">Fecha</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-cyan-800">Acciones</th>
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
                      className={`cursor-pointer hover:bg-cyan-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      onClick={() => navigate(`/dashboard/levantamiento-obras/levantamientos/revisar/${item.surveyId}`)}
                    >
                      <td className="px-3 py-2 font-mono text-cyan-700">{item.projectCode || item.surveyNumber}</td>
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
