import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveysService } from '@/services/surveys.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Home, ArrowLeft, Search, Eye, ClipboardList } from 'lucide-react';
import { Footer } from '@/components/ui/footer';

interface Survey {
  surveyId: number;
  workId: number;
  work?: {
    workCode?: string;
    name: string;
    address: string;
  };
  surveyDate: string;
  status: string;
  receivedBy?: string;
  assignedReviewer?: string;
}

export default function LevantamientosListPage() {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [filteredSurveys, setFilteredSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSurveys();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredSurveys(surveys);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredSurveys(
        surveys.filter(
          (s) =>
            s.work?.workCode?.toLowerCase().includes(term) ||
            s.work?.name.toLowerCase().includes(term) ||
            s.status.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, surveys]);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await surveysService.getSurveys();
      setSurveys(data.data || []);
      setFilteredSurveys(data.data || []);
    } catch (err: any) {
      console.error('Error loading surveys:', err);
      setError(err.response?.data?.message || 'Error al cargar los levantamientos');
    } finally {
      setLoading(false);
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
                Levantamientos
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
        {/* Search Bar */}
        <div className="mb-6 flex gap-4">
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
            <Input
              type="text"
              placeholder="Buscar por código de obra, nombre, estado..."
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
                      Código Obra
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Nombre Obra
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Fecha Levantamiento
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-800">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Revisor
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-800">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSurveys.map((survey, index) => (
                    <tr
                      key={survey.surveyId}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-cyan-700">
                        {survey.work?.workCode || '-'}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {survey.work?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                        {survey.surveyDate ? new Date(survey.surveyDate).toLocaleDateString('es-CO') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(survey.status)}
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                        {survey.assignedReviewer || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => alert('Ver detalle - Próximamente')}
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
      </main>

      <Footer />
    </div>
  );
}
