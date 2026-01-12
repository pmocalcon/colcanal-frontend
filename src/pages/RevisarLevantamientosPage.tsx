import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveysService, type Survey, type AccessCompany, type AccessProject } from '@/services/surveys.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home, ArrowLeft, Building2, FolderOpen, ClipboardList, Eye, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { Footer } from '@/components/ui/footer';

type ViewMode = 'cards' | 'obras' | 'levantamientos';

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

  // Reviewer access data from backend
  const [accessCompanies, setAccessCompanies] = useState<AccessCompany[]>([]);
  const [accessProjects, setAccessProjects] = useState<AccessProject[]>([]);
  const [allSurveys, setAllSurveys] = useState<Survey[]>([]);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [selectedWork, setSelectedWork] = useState<WorkWithSurveys | null>(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch reviewer access and surveys in parallel
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

  // Build cards data from backend access configuration
  const cardsData = useMemo((): CardData[] => {
    const cards: CardData[] = [];

    // Add company cards from user's access
    accessCompanies.forEach((company) => {
      const pendingCount = allSurveys.filter(
        (s) => s.work?.company?.companyId === company.companyId && s.status === 'pending'
      ).length;
      cards.push({
        id: company.companyId,
        name: company.name,
        type: 'company',
        companyId: company.companyId,
        pendingCount,
      });
    });

    // Add project cards from user's access
    accessProjects.forEach((project) => {
      const pendingCount = allSurveys.filter(
        (s) => s.work?.company?.companyId === project.companyId &&
               (s as any).work?.project?.projectId === project.projectId &&
               s.status === 'pending'
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
    if (!selectedCard) return [];

    // Filter surveys by company/project
    const relevantSurveys = allSurveys.filter((s) => {
      if (selectedCard.type === 'company') {
        return s.work?.company?.companyId === selectedCard.companyId;
      } else {
        return (
          s.work?.company?.companyId === selectedCard.companyId &&
          (s as any).work?.project?.projectId === selectedCard.projectId
        );
      }
    });

    // Group by work
    const workMap = new Map<number, WorkWithSurveys>();
    relevantSurveys.forEach((survey) => {
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
      if (survey.status === 'pending') {
        workEntry.pendingSurveys.push(survey);
      } else {
        workEntry.reviewedSurveys.push(survey);
      }
    });

    return Array.from(workMap.values());
  }, [selectedCard, allSurveys]);

  const handleCardClick = (card: CardData) => {
    setSelectedCard(card);
    setViewMode('obras');
  };

  const handleWorkClick = (work: WorkWithSurveys) => {
    setSelectedWork(work);
    setViewMode('levantamientos');
  };

  const handleBack = () => {
    if (viewMode === 'levantamientos') {
      setSelectedWork(null);
      setViewMode('obras');
    } else if (viewMode === 'obras') {
      setSelectedCard(null);
      setViewMode('cards');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pendiente' },
      in_review: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'En Revisión' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Aprobado' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rechazado' },
    };
    const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
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

  // Get current title based on view mode
  const getTitle = () => {
    if (viewMode === 'levantamientos' && selectedWork) {
      return `Levantamientos - ${selectedWork.name}`;
    }
    if (viewMode === 'obras' && selectedCard) {
      return `Obras - ${selectedCard.name}`;
    }
    return 'Revisar Levantamientos';
  };

  const getSubtitle = () => {
    if (viewMode === 'levantamientos' && selectedWork) {
      return `${selectedWork.pendingSurveys.length} pendientes, ${selectedWork.reviewedSurveys.length} revisados`;
    }
    if (viewMode === 'obras' && selectedCard) {
      return `${obrasForSelectedCard.length} obras`;
    }
    return 'Selecciona una empresa o proyecto';
  };

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
                onClick={viewMode === 'cards' ? () => navigate('/dashboard/levantamiento-obras') : handleBack}
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
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {getSubtitle()}
              </p>
            </div>

            {/* Right spacer */}
            <div className="w-32" />
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
        ) : viewMode === 'cards' ? (
          /* Cards Grid View */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cardsData.map((card) => (
              <Card
                key={`${card.type}-${card.id}`}
                className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105 border-2 hover:border-[hsl(var(--canalco-primary))]"
                onClick={() => handleCardClick(card)}
              >
                <div className="flex flex-col items-center text-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    card.type === 'company'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-green-100 text-green-600'
                  }`}>
                    {card.type === 'company' ? (
                      <Building2 className="w-6 h-6" />
                    ) : (
                      <FolderOpen className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[hsl(var(--canalco-neutral-800))] line-clamp-2">
                      {card.name}
                    </h3>
                    <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-1">
                      {card.type === 'company' ? 'Empresa' : 'Proyecto'}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                    card.pendingCount > 0
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {card.pendingCount} pendientes
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : viewMode === 'obras' ? (
          /* Obras List View */
          <div className="space-y-4">
            {obrasForSelectedCard.length === 0 ? (
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
                        <h3 className="font-semibold text-[hsl(var(--canalco-neutral-800))]">
                          {work.name}
                        </h3>
                        {work.recordNumber && (
                          <span className="text-xs font-mono bg-[hsl(var(--canalco-neutral-100))] px-2 py-1 rounded">
                            Acta: {work.recordNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">
                        {work.address}
                      </p>
                      <div className="flex gap-4 mt-2">
                        <span className={`text-sm font-medium ${
                          work.pendingSurveys.length > 0 ? 'text-orange-600' : 'text-green-600'
                        }`}>
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-orange-800">
                          Código Proyecto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-orange-800">
                          Fecha Levantamiento
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-orange-800">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-orange-800">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWork.pendingSurveys.map((survey, index) => (
                        <tr
                          key={survey.surveyId}
                          className={index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}
                        >
                          <td className="px-4 py-3 font-mono font-medium text-[hsl(var(--canalco-primary))]">
                            {survey.projectCode || '-'}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                            {survey.surveyDate ? formatDate(survey.surveyDate) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(survey.status || 'pending')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/dashboard/levantamiento-obras/revisar/${survey.surveyId}`);
                                }}
                                className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-cyan-600"
                                title="Ver detalle"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert('Aprobar - Próximamente');
                                }}
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Aprobar"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  alert('Rechazar - Próximamente');
                                }}
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Rechazar"
                              >
                                <XCircle className="w-4 h-4" />
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-green-800">
                          Código Proyecto
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-green-800">
                          Fecha Levantamiento
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-green-800">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-green-800">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWork.reviewedSurveys.map((survey, index) => (
                        <tr
                          key={survey.surveyId}
                          className={index % 2 === 0 ? 'bg-white' : 'bg-green-50/30'}
                        >
                          <td className="px-4 py-3 font-mono font-medium text-[hsl(var(--canalco-neutral-600))]">
                            {survey.projectCode || '-'}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                            {survey.surveyDate ? formatDate(survey.surveyDate) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(survey.status || 'pending')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/dashboard/levantamiento-obras/revisar/${survey.surveyId}`);
                                }}
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
                <h3 className="text-lg font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">
                  Sin levantamientos
                </h3>
                <p className="text-[hsl(var(--canalco-neutral-500))]">
                  Esta obra no tiene levantamientos registrados
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
