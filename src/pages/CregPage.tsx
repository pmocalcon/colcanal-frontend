import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cregService } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Loader2, Pencil, Trash2, AlertCircle, Zap, Search, X, CheckCircle2,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const fmtCOP = (n: number) =>
  '$' + (n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function CregPage() {
  const navigate = useNavigate();
  // El municipio seleccionado vive en la URL para no perderlo al ir y volver del formulario.
  const [searchParams, setSearchParams] = useSearchParams();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    () => Number(searchParams.get('company')) || null,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    () => Number(searchParams.get('project')) || null,
  );

  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  // ucapId -> valor final de su hoja de costos (si tiene)
  const [costSheets, setCostSheets] = useState<Map<number, number>>(new Map());

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingUcaps, setLoadingUcaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // UCAP marcada para eliminar (abre el diálogo de confirmación).
  const [deleteTarget, setDeleteTarget] = useState<Ucap | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    masterDataService.getCompanies()
      .then((data) => {
        setCompanies(data.filter((c) => !EXCLUDED_COMPANY_NAMES.some((e) => c.name.includes(e))));
        setLoadingCompanies(false);
      })
      .catch(() => { setError('Error al cargar empresas'); setLoadingCompanies(false); });
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);
  const isCanalesContactos = selectedCompany?.name === 'Canales & Contactos';

  // Refleja la selección en la URL (sin ensuciar el historial).
  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedCompanyId) next.set('company', String(selectedCompanyId));
    if (selectedProjectId) next.set('project', String(selectedProjectId));
    setSearchParams(next, { replace: true });
  }, [selectedCompanyId, selectedProjectId, setSearchParams]);

  useEffect(() => {
    // Hasta que no lleguen las empresas no se sabe si es Canales & Contactos:
    // salir antes evita borrar el proyecto que venía en la URL.
    if (loadingCompanies) return;
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos, loadingCompanies]);

  const load = useCallback((companyId: number, projectId: number | null) => {
    setLoadingUcaps(true);
    setError(null);
    Promise.all([
      surveysService.getUcaps(companyId, projectId ?? undefined),
      cregService.getUnits(companyId, projectId),
    ])
      .then(([ucapsRes, units]) => {
        setUcaps(ucapsRes.ucaps);
        setCostSheets(new Map(units.map((u) => [u.ucapId, u.totals.finalValue])));
        setLoadingUcaps(false);
      })
      .catch(() => { setError('Error al cargar UCAPs'); setLoadingUcaps(false); });
  }, []);

  useEffect(() => {
    if (loadingCompanies) return;
    if (!selectedCompanyId) { setUcaps([]); setCostSheets(new Map()); return; }
    if (isCanalesContactos && !selectedProjectId) { setUcaps([]); setCostSheets(new Map()); return; }
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, loadingCompanies, load]);

  const filteredUcaps = ucaps.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.code.toLowerCase().includes(q)
      || u.description.toLowerCase().includes(q)
      || u.apellidos.some((a) => a.apellido.toLowerCase().includes(q));
  });

  // Crear y editar viven en el mismo formulario que la hoja de costos.
  const openCreateUcap = () => {
    const project = selectedProjectId ? `&project=${selectedProjectId}` : '';
    navigate(`/dashboard/creg/unidad/nueva?company=${selectedCompanyId}${project}`);
  };
  const openUcap = (u: Ucap) => navigate(`/dashboard/creg/unidad/${u.ucapId}`);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await cregService.deleteUnit(deleteTarget.ucapId);
      toast.success(`UCAP "${deleteTarget.code}" eliminada`);
      setDeleteTarget(null);
      if (selectedCompanyId) load(selectedCompanyId, selectedProjectId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al eliminar la UCAP');
    } finally {
      setDeleting(false);
    }
  };

  const ready = selectedCompanyId && (!isCanalesContactos || selectedProjectId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Zap className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Unidades constructivas
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Gestiona las UCAPs y su hoja de costos (reposición a nuevo · Res. CREG 123 de 2011)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          {loadingCompanies ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando empresas...
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Municipio / empresa</label>
                <Select value={selectedCompanyId ? String(selectedCompanyId) : ''}
                  onValueChange={(val) => { setSelectedCompanyId(Number(val)); setSelectedProjectId(null); }}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="— Selecciona una empresa —" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {isCanalesContactos && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Proyecto <span className="text-red-500">*</span></label>
                  <Select value={selectedProjectId ? String(selectedProjectId) : ''} onValueChange={(val) => setSelectedProjectId(Number(val))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Selecciona un proyecto —" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (<SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Lista de UCAPs */}
        {ready && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))] flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  UCAPs — {selectedCompany?.name}{isCanalesContactos && selectedProjectId ? ` · ${projects.find((p) => p.projectId === selectedProjectId)?.name ?? ''}` : ''}
                </h2>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  {ucaps.length} {ucaps.length === 1 ? 'UCAP' : 'UCAPs'} · {costSheets.size} con hoja de costos
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                  <Input placeholder="Buscar por código o descripción..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
                  {search && (<button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5"><X className="w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" /></button>)}
                </div>
                <Button size="sm" onClick={openCreateUcap} className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white whitespace-nowrap">
                  <Plus className="w-4 h-4 mr-1" /> Nueva UCAP
                </Button>
              </div>
            </div>

            {loadingUcaps ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[hsl(var(--canalco-neutral-100))]">
                      <TableHead className="font-semibold">Código</TableHead>
                      <TableHead className="font-semibold">UCAP</TableHead>
                      <TableHead className="font-semibold text-right">Valor</TableHead>
                      <TableHead className="font-semibold text-right">IPP inicial</TableHead>
                      <TableHead className="font-semibold text-center">Hoja de costos</TableHead>
                      <TableHead className="w-36" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUcaps.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-[hsl(var(--canalco-neutral-600))]">
                          {search ? 'No se encontraron UCAPs con ese criterio.' : 'No hay UCAPs. Crea una con "Nueva UCAP".'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUcaps.map((u) => {
                        const hasSheet = costSheets.has(u.ucapId);
                        return (
                          <TableRow key={u.ucapId} className="hover:bg-[hsl(var(--canalco-neutral-100))]">
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs bg-orange-50 text-orange-700 border-orange-200">{u.code}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{u.description}</TableCell>
                            <TableCell className="text-right font-medium text-sm">{fmtCOP(u.value)}</TableCell>
                            <TableCell className="text-right text-sm text-[hsl(var(--canalco-neutral-600))]">
                              {u.initialIpp.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center">
                              {hasSheet ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Sí
                                </span>
                              ) : (
                                <span className="text-xs text-[hsl(var(--canalco-neutral-400))]">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="outline" size="sm" title="Editar la UCAP y su hoja de costos"
                                  className="h-7 gap-1 text-xs" onClick={() => openUcap(u)}>
                                  <Pencil className="w-3.5 h-3.5" /> Editar
                                </Button>
                                <Button variant="ghost" size="icon" title="Eliminar la UCAP"
                                  className="h-7 w-7 text-[hsl(var(--canalco-neutral-500))] hover:text-red-600"
                                  onClick={() => setDeleteTarget(u)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {!selectedCompanyId && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-lg font-medium">Selecciona una empresa para ver sus unidades constructivas</p>
          </div>
        )}
        {selectedCompanyId && isCanalesContactos && !selectedProjectId && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-lg font-medium">Selecciona un proyecto de Canales &amp; Contactos</p>
            <p className="text-sm mt-1">Cada proyecto maneja sus propias UCAPs y porcentajes</p>
          </div>
        )}
      </main>

      {/* Confirmación de borrado de UCAP */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar UCAP</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
            ¿Seguro que deseas eliminar la UCAP{' '}
            <strong>{deleteTarget?.code}</strong> — {deleteTarget?.description}? Se borrará también su
            hoja de costos. Esta acción no se puede deshacer y libera el código para reutilizarlo.
          </p>
          <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
            Si la UCAP está en uso por presupuestos o levantamientos, no podrá eliminarse.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

