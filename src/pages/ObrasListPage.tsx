import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { surveysService, type Work } from '@/services/surveys.service';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Home, ArrowLeft, Plus, Search, Edit, Eye } from 'lucide-react';
import { Footer } from '@/components/ui/footer';

export default function ObrasListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [filteredWorks, setFilteredWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user?.userId) {
      loadWorks();
    }
  }, [user?.userId]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredWorks(works);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredWorks(
        works.filter(
          (w) =>
            w.recordNumber?.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, works]);

  const loadWorks = async () => {
    try {
      setLoading(true);
      setError(null);
      // Filter by current user (createdBy)
      const response = await surveysService.getWorks({ createdBy: user?.userId });
      console.log('API Response for works:', response);
      // Handle both response structures: { data: Work[] } or Work[]
      const worksData = Array.isArray(response) ? response : (response.data || []);
      console.log('Works data:', worksData);
      setWorks(worksData);
      setFilteredWorks(worksData);
    } catch (err: any) {
      console.error('Error loading works:', err);
      setError(err.response?.data?.message || 'Error al cargar las obras');
    } finally {
      setLoading(false);
    }
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
                Mis Obras
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {filteredWorks.length} obras creadas por ti
              </p>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate('/dashboard/levantamiento-obras/obras/crear')}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Obra
              </Button>
            </div>
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
              placeholder="Buscar por número de acta..."
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
        ) : (
          /* Works Table */
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-cyan-100 border-b border-cyan-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      N° Acta
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Dirección
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Barrio
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-800">
                      Empresa
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-cyan-800">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[hsl(var(--canalco-neutral-500))]">
                        {searchTerm ? 'No se encontraron obras con ese criterio' : 'No has creado ninguna obra aún'}
                      </td>
                    </tr>
                  ) : (
                    filteredWorks.map((work, index) => (
                      <tr
                        key={work.workId}
                        className={index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-cyan-700">
                          {work.recordNumber || '-'}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {work.name}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                          {work.address}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                          {work.neighborhood}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">
                          {work.company?.name || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/dashboard/levantamiento-obras/obras/editar/${work.workId}`)}
                              className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-primary))]"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
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
                    ))
                  )}
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
