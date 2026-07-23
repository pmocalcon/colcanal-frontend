import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { surveysService, type Work, type WorkActa, type ActaStatus } from '@/services/surveys.service';
import { useAuth } from '@/contexts/AuthContext';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Home, ArrowLeft, Plus, Search, Edit, AlertCircle, Hash, X, Layers, FileText, Check, Send, ThumbsUp, ThumbsDown, BadgeCheck, Clock, AlertTriangle, ClipboardList } from 'lucide-react';
import { Footer } from '@/components/ui/footer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/PermissionGuard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type ViewMode = 'individual' | 'agrupado';

// La identidad del acta es (empresa, proyecto, número). projectId nulo → 0.
const makeActaKey = (
  companyId: number | undefined | null,
  projectId: number | undefined | null,
  recordNumber: string,
) => `${companyId ?? 0}:${projectId ?? 0}:${recordNumber}`;

// Nombre del municipio para mostrar. Delega en getMunicipioName, que además del
// prefijo "Unión Temporal Alumbrado Público" resuelve el nombre oficial.
const getMunicipality = (name: string | null | undefined): string =>
  name ? getMunicipioName(name) : '-';

// key = `company:project:record`  (record puede no tener ':', project es 0 si es nulo)
const getActaCompanyId = (key: string) => Number(key.split(':')[0]);
const getActaProjectId = (key: string) => {
  const p = Number(key.split(':')[1]);
  return p > 0 ? p : null;
};
const getActaRecordNumber = (key: string) => key.slice(key.indexOf(':', key.indexOf(':') + 1) + 1);

export default function ObrasListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { access, loading: accessLoading, error: accessError } = useSurveyAccess();
  const [activeTab, setActiveTab] = useState('');
  // Municipio seleccionado, codificado como `${kind}-${id}` (o null = "Todos").
  const [selectedMuni, setSelectedMuni] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('individual');
  const [works, setWorks] = useState<Work[]>([]);
  const [workValues, setWorkValues] = useState<Map<number, number>>(new Map());
  // IPP inicial (base del proyecto) e IPP del mes, por obra.
  const [workIpps, setWorkIpps] = useState<Map<number, { baseIpp: number | null; mesIpp: number | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actaInput, setActaInput] = useState('');
  const [showActaInput, setShowActaInput] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [editingActa, setEditingActa] = useState<string | null>(null);
  const [editActaValue, setEditActaValue] = useState('');
  const [savingActa, setSavingActa] = useState(false);
  const [removingWorkId, setRemovingWorkId] = useState<number | null>(null);
  const [actaStatuses, setActaStatuses] = useState<Map<string, WorkActa>>(new Map());
  const [submittingActa, setSubmittingActa] = useState<string | null>(null);
  const [sendingBudget, setSendingBudget] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{ acta: string; companyId: number; projectId: number | null } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [approveDialog, setApproveDialog] = useState<{ acta: string; companyId: number; projectId: number | null } | null>(null);
  const [approveProjectCode, setApproveProjectCode] = useState('');
  const [approveSubmitting, setApproveSubmitting] = useState(false);

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapToDepartments(access.companies, access.projects || []);
  }, [access]);

  const activeDept = useMemo(
    () => departments.find((d) => d.name === activeTab),
    [departments, activeTab],
  );

  // Municipios seleccionables del departamento activo.
  // Para departamentos operados por Canales & Contactos (una sola empresa con
  // varios proyectos, p.ej. Antioquia) los municipios son sus PROYECTOS; para
  // el resto son las empresas UT.
  const municipioOptions = useMemo(() => {
    if (!activeDept) return [] as Array<{ kind: 'company' | 'project'; id: number; name: string }>;
    const projMap = new Map<number, { kind: 'project'; id: number; name: string }>();
    // Proyectos ya mapeados al departamento (acceso a nivel de proyecto, p.ej. Antioquia).
    activeDept.projects.forEach((p) => {
      if (p.name.trim().toLowerCase() !== 'oficina principal') {
        projMap.set(p.projectId, { kind: 'project', id: p.projectId, name: p.name });
      }
    });
    // Si además tiene la empresa Canales & Contactos, incluir sus proyectos desde el acceso.
    const canales = activeDept.companies.find((c) => c.name === 'Canales & Contactos');
    if (canales) {
      (access?.projects || [])
        .filter((p) => p.companyId === canales.companyId && p.name.trim().toLowerCase() !== 'oficina principal')
        .forEach((p) => projMap.set(p.projectId, { kind: 'project', id: p.projectId, name: p.name }));
    }
    // Empresas que son municipios reales por sí mismas (UT propias, p.ej. Santa
    // Bárbara). La matriz Canales & Contactos NO es un municipio, se excluye. Se
    // suman a los proyectos, no en su lugar: Antioquia tiene proyectos Y una UT.
    const companyMunis = activeDept.companies
      .filter((c) => c.name !== 'Canales & Contactos')
      .map((c) => ({ kind: 'company' as const, id: c.companyId, name: getMunicipality(c.name) }));

    // La BD tiene proyectos duplicados con y sin tilde (Ciudad Bolívar / Ciudad
    // Bolivar, Jericó / Jerico), con IDs distintos, que salían dos veces en el
    // filtro. Se deduplican por nombre normalizado, conservando el primero.
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const porNombre = new Map<string, { kind: 'company' | 'project'; id: number; name: string }>();
    for (const o of [...projMap.values(), ...companyMunis]) {
      const k = norm(o.name);
      if (!porNombre.has(k)) porNombre.set(k, o);
    }
    const todos = [...porNombre.values()];
    if (todos.length > 0) {
      return todos.sort((a, b) => a.name.localeCompare(b.name));
    }
    return activeDept.companies.map((c) => ({
      kind: 'company' as const,
      id: c.companyId,
      name: getMunicipality(c.name),
    }));
  }, [activeDept, access]);

  // Nombre de proyecto por id (para etiquetar cada acta con su municipio).
  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    (access?.projects || []).forEach((p) => m.set(p.projectId, p.name));
    return m;
  }, [access]);

  const worksFilter = useMemo<{ companyId?: number[]; projectId?: number }>(() => {
    if (!activeDept) return {};
    if (selectedMuni !== null) {
      // Municipio seleccionado: por proyecto (Canales) o por empresa-municipio (UT).
      const opt = municipioOptions.find((o) => `${o.kind}-${o.id}` === selectedMuni);
      if (opt) {
        if (opt.kind === 'project') return { projectId: opt.id };
        return { companyId: [opt.id] };
      }
    }
    // "Todos": empresas del departamento + el companyId padre de sus proyectos
    // (ej. Canales & Contactos, dueño de Ciudad Bolívar / Pueblorrico)
    const ids = new Set<number>(activeDept.companyIds);
    activeDept.projects.forEach((p) => { if (p.companyId) ids.add(p.companyId); });
    return { companyId: [...ids] };
  }, [activeDept, selectedMuni, municipioOptions]);

  useEffect(() => {
    if (departments.length > 0 && !activeTab) {
      setActiveTab(departments[0].name);
    }
  }, [departments, activeTab]);

  useEffect(() => {
    const hasScope = (worksFilter.companyId?.length ?? 0) > 0 || worksFilter.projectId != null;
    if (user?.userId && hasScope) {
      loadWorks();
    }
  }, [user?.userId, worksFilter]);

  const loadWorks = async () => {
    try {
      setLoading(true);
      setError(null);
      // El Director de Proyecto ve TODAS las obras de su departamento (no solo
      // las que él creó). El alcance ya queda acotado por worksFilter.
      const response = await surveysService.getWorks({
        companyId: worksFilter.companyId,
        projectId: worksFilter.projectId,
      });
      const worksData = Array.isArray(response) ? response : (response.data || []);
      setWorks(worksData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al cargar las obras');
    } finally {
      setLoading(false);
    }
  };

  // Valor Total (con IPP) por obra — se calcula en backend.
  useEffect(() => {
    const ids = works.map((w) => w.workId);
    if (ids.length === 0) { setWorkValues(new Map()); setWorkIpps(new Map()); return; }
    let cancelled = false;
    surveysService.getWorksValue(ids)
      .then((rows) => {
        if (cancelled) return;
        setWorkValues(new Map(rows.map((r) => [r.workId, r.value])));
        setWorkIpps(new Map(rows.map((r) => [r.workId, { baseIpp: r.baseIpp, mesIpp: r.mesIpp }])));
      })
      .catch(() => { if (!cancelled) { setWorkValues(new Map()); setWorkIpps(new Map()); } });
    return () => { cancelled = true; };
  }, [works]);

  const fmtCOP = (n: number) =>
    `$${Math.round(n).toLocaleString('es-CO')}`;

  // IPP con 2 decimales; '—' si no hay dato para esa obra.
  const fmtIpp = (n: number | null | undefined) =>
    n != null ? n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  // Works con número de acta → agrupados por (empresa, proyecto, acta).
  // Incluir el proyecto evita mezclar municipios (Pueblorrico, Tarso, ...) de Canales.
  const groupedWorksMap = useMemo(() => {
    const map = new Map<string, Work[]>();
    works
      .filter((w) => w.recordNumber)
      .forEach((w) => {
        const key = makeActaKey(w.companyId, w.projectId, w.recordNumber!);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(w);
      });
    map.forEach((ws, key) => { if (ws.length < 1) map.delete(key); });
    return map;
  }, [works]);

  // Individual = no recordNumber OR not present in grouped map (uses composite key)
  const individualWorks = useMemo(
    () => works.filter((w) => !w.recordNumber || !groupedWorksMap.has(makeActaKey(w.companyId, w.projectId, w.recordNumber!))),
    [works, groupedWorksMap],
  );

  // Filtered individual works (search by name / address / neighborhood)
  const filteredIndividualWorks = useMemo(() => {
    if (!searchTerm.trim()) return individualWorks;
    const term = searchTerm.toLowerCase();
    return individualWorks.filter(
      (w) =>
        w.name?.toLowerCase().includes(term) ||
        w.address?.toLowerCase().includes(term) ||
        w.neighborhood?.toLowerCase().includes(term),
    );
  }, [searchTerm, individualWorks]);

  // Filtered grouped works (search by acta record number)
  const filteredGroupedMap = useMemo(() => {
    if (!searchTerm.trim()) return groupedWorksMap;
    const term = searchTerm.toLowerCase();
    const result = new Map<string, Work[]>();
    groupedWorksMap.forEach((actaWorks, key) => {
      const rn = getActaRecordNumber(key);
      if (rn.toLowerCase().includes(term)) result.set(key, actaWorks);
    });
    return result;
  }, [searchTerm, groupedWorksMap]);

  const toggleSelect = (workId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(workId) ? next.delete(workId) : next.add(workId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIndividualWorks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIndividualWorks.map((w) => w.workId)));
    }
  };

  const handleAssignActa = async () => {
    if (!actaInput.trim() || selectedIds.size === 0) return;
    try {
      setAssigning(true);
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          surveysService.updateWork(id, { recordNumber: actaInput.trim() } as any),
        ),
      );
      toast.success(`N° Acta "${actaInput.trim()}" asignado a ${selectedIds.size} obra(s)`);
      setSelectedIds(new Set());
      setActaInput('');
      setShowActaInput(false);
      await loadWorks();
    } catch {
      toast.error('Error al asignar el número de acta');
    } finally {
      setAssigning(false);
    }
  };

  const handleRenameActa = async (oldKey: string, actaWorks: Work[]) => {
    const oldActa = getActaRecordNumber(oldKey);
    const newName = editActaValue.trim();
    if (!newName || newName === oldActa) { setEditingActa(null); return; }
    try {
      setSavingActa(true);
      await Promise.all(actaWorks.map((w) => surveysService.updateWork(w.workId, { recordNumber: newName } as any)));
      toast.success(`N° Acta renombrado a "${newName}"`);
      setEditingActa(null);
      await loadWorks();
    } catch {
      toast.error('Error al renombrar el acta');
    } finally {
      setSavingActa(false);
    }
  };

  const handleRemoveFromActa = async (workId: number) => {
    try {
      setRemovingWorkId(workId);
      await surveysService.updateWork(workId, { recordNumber: null } as any);
      toast.success('Obra removida del acta');
      await loadWorks();
    } catch {
      toast.error('Error al remover la obra del acta');
    } finally {
      setRemovingWorkId(null);
    }
  };

  useEffect(() => {
    const keys = Array.from(groupedWorksMap.keys());
    if (keys.length === 0) { setActaStatuses(new Map()); return; }
    const pairs = keys.map((k) => ({
      companyId: getActaCompanyId(k),
      projectId: getActaProjectId(k),
      actaNumber: getActaRecordNumber(k),
    }));
    surveysService.getWorkActasBulk(pairs)
      .then((actas) => {
        // El acta se identifica por (companyId, projectId, actaNumber); misma clave compuesta.
        const byKey = new Map<string, WorkActa>();
        actas.forEach((a) => byKey.set(makeActaKey(a.companyId, a.projectId, a.actaNumber), a));
        const map = new Map<string, WorkActa>();
        keys.forEach((key) => {
          const acta = byKey.get(key);
          if (acta) map.set(key, acta);
        });
        setActaStatuses(map);
      })
      .catch(() => { /* actas sin estado se tratan como BORRADOR */ });
  }, [groupedWorksMap]);

  const handleSubmitActa = async (actaKey: string) => {
    const companyId = getActaCompanyId(actaKey);
    const projectId = getActaProjectId(actaKey);
    const recordNumber = getActaRecordNumber(actaKey);
    try {
      setSubmittingActa(actaKey);
      const updated = await surveysService.submitActaForReview(companyId, projectId, recordNumber);
      setActaStatuses((prev) => new Map(prev).set(actaKey, updated));
      toast.success('Acta enviada a revisión al Director Técnico');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al enviar el acta');
    } finally {
      setSubmittingActa(null);
    }
  };

  const handleSendToBudget = async (actaKey: string) => {
    const companyId = getActaCompanyId(actaKey);
    const projectId = getActaProjectId(actaKey);
    const recordNumber = getActaRecordNumber(actaKey);
    try {
      setSendingBudget(actaKey);
      const updated = await surveysService.sendActaToBudget(companyId, projectId, recordNumber);
      setActaStatuses((prev) => new Map(prev).set(actaKey, updated));
      toast.success('Acta enviada a presupuesto. Se notificó a la Directora Financiera.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al enviar el acta a presupuesto');
    } finally {
      setSendingBudget(null);
    }
  };

  const handleReviewActa = async (approved: boolean) => {
    if (!reviewDialog) return;
    const key = makeActaKey(reviewDialog.companyId, reviewDialog.projectId, reviewDialog.acta);
    try {
      setReviewSubmitting(true);
      const updated = await surveysService.reviewActa(reviewDialog.companyId, reviewDialog.projectId, reviewDialog.acta, approved, reviewComment || undefined);
      setActaStatuses((prev) => new Map(prev).set(key, updated));
      toast.success(approved ? 'Acta enviada a aprobación de Gerencia' : 'Acta devuelta al Director de Proyecto');
      setReviewDialog(null);
      setReviewComment('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al revisar el acta');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleApproveActa = async () => {
    if (!approveDialog || !approveProjectCode.trim()) return;
    const key = makeActaKey(approveDialog.companyId, approveDialog.projectId, approveDialog.acta);
    try {
      setApproveSubmitting(true);
      const updated = await surveysService.approveActa(approveDialog.companyId, approveDialog.projectId, approveDialog.acta, approveProjectCode.trim());
      setActaStatuses((prev) => new Map(prev).set(key, updated));
      toast.success('Acta aprobada con código de proyecto asignado');
      setApproveDialog(null);
      setApproveProjectCode('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al aprobar el acta');
    } finally {
      setApproveSubmitting(false);
    }
  };

  const getActaStatusBadge = (acta: WorkActa | undefined) => {
    if (!acta || acta.status === 'borrador') return null;
    switch (acta.status) {
      case 'en_revision':
        return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"><Clock className="w-3 h-3" />En revisión</span>;
      case 'en_aprobacion':
        return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium"><ThumbsUp className="w-3 h-3" />En aprobación</span>;
      case 'aprobada':
        return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium"><BadgeCheck className="w-3 h-3" />Aprobada</span>;
      default:
        return null;
    }
  };


  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSelectedMuni(null);
    setSelectedIds(new Set());
    setShowActaInput(false);
    setActaInput('');
    setSearchTerm('');
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedIds(new Set());
    setShowActaInput(false);
    setActaInput('');
    setSearchTerm('');
  };

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

  const pageTitle =
    viewMode === 'agrupado'
      ? `Actas - ${activeTab}`
      : `Mis Obras - ${activeTab}`;

  const pageSubtitle =
    viewMode === 'agrupado'
      ? `${groupedWorksMap.size} grupo${groupedWorksMap.size !== 1 ? 's' : ''} de obras`
      : `${filteredIndividualWorks.length} obras creadas por ti`;

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
                onClick={() => navigate('/dashboard/levantamiento-obras')}
                className="hover:bg-[hsl(var(--canalco-neutral-200))]"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                {pageTitle}
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                {pageSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <PermissionGuard permission="levantamientos:crear">
                <Button
                  onClick={() => navigate('/dashboard/levantamiento-obras/obras/crear')}
                  className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary-hover))] text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nueva Obra
                </Button>
              </PermissionGuard>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {/* View mode toggle */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => handleViewModeChange('individual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              viewMode === 'individual'
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            Obras Individuales
          </button>
          <button
            onClick={() => handleViewModeChange('agrupado')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              viewMode === 'agrupado'
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            <Layers className="w-4 h-4" />
            Actas
            {groupedWorksMap.size > 0 && (
              <span
                className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                  viewMode === 'agrupado'
                    ? 'bg-white/30 text-white'
                    : 'bg-[hsl(var(--canalco-primary))]/15 text-[hsl(var(--canalco-primary))]'
                }`}
              >
                {groupedWorksMap.size}
              </span>
            )}
          </button>
        </div>

        {/* Tabs por Departamento */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56">
              <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Departamento</label>
              <Select value={activeTab} onValueChange={handleTabChange}>
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

            {/* Municipality filter dropdown */}
            {municipioOptions.length > 1 && (
              <div className="w-56">
                <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
                <Select
                  value={selectedMuni === null ? 'all' : selectedMuni}
                  onValueChange={(val) => setSelectedMuni(val === 'all' ? null : val)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Municipio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {municipioOptions.map((o) => (
                      <SelectItem key={`${o.kind}-${o.id}`} value={`${o.kind}-${o.id}`}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {departments.map((dept) => (
            <TabsContent key={dept.name} value={dept.name}>
              {/* Search Bar */}
              <div className="mb-4 flex gap-4">
                <div className="relative flex-grow max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-500))]" />
                  <Input
                    type="text"
                    placeholder={
                      viewMode === 'agrupado'
                        ? 'Buscar por número de acta...'
                        : 'Buscar por nombre, dirección...'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full"></div>
                </div>
              ) : viewMode === 'individual' ? (
                /* ── INDIVIDUAL VIEW ── */
                <>
                  {/* Bulk action bar */}
                  {selectedIds.size > 0 && (
                    <div className="mb-4 flex items-center gap-3 bg-[hsl(var(--canalco-primary))]/10 border border-[hsl(var(--canalco-primary))]/30 rounded-lg px-4 py-2.5">
                      <span className="text-sm font-medium text-[hsl(var(--canalco-neutral-800))]">
                        {selectedIds.size} obra{selectedIds.size > 1 ? 's' : ''} seleccionada{selectedIds.size > 1 ? 's' : ''}
                      </span>
                      {!showActaInput ? (
                        <Button
                          size="sm"
                          className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 h-8"
                          onClick={() => setShowActaInput(true)}
                        >
                          <Hash className="w-3.5 h-3.5 mr-1.5" />
                          Asignar N° Acta
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            placeholder="Número de acta..."
                            value={actaInput}
                            onChange={(e) => setActaInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAssignActa();
                              if (e.key === 'Escape') { setShowActaInput(false); setActaInput(''); }
                            }}
                            className="h-8 w-48 text-sm"
                          />
                          <Button
                            size="sm"
                            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 h-8"
                            onClick={handleAssignActa}
                            disabled={assigning || !actaInput.trim()}
                          >
                            {assigning ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : 'Confirmar'}
                          </Button>
                          <button
                            onClick={() => { setShowActaInput(false); setActaInput(''); }}
                            className="text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-700))]"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <button
                        className="ml-auto text-xs text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-700))] underline"
                        onClick={() => { setSelectedIds(new Set()); setShowActaInput(false); setActaInput(''); }}
                      >
                        Deseleccionar todo
                      </button>
                    </div>
                  )}

                  <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-neutral-200))]">
                          <tr>
                            <th className="px-3 py-3 w-10">
                              <input
                                type="checkbox"
                                className="rounded cursor-pointer"
                                checked={filteredIndividualWorks.length > 0 && selectedIds.size === filteredIndividualWorks.length}
                                onChange={toggleSelectAll}
                                title="Seleccionar todas"
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Nombre</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Dirección</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Barrio</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Empresa</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-900))]">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredIndividualWorks.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-[hsl(var(--canalco-neutral-500))]">
                                {searchTerm
                                  ? 'No se encontraron obras con ese criterio'
                                  : individualWorks.length === 0 && works.length > 0
                                  ? 'Todas las obras de este departamento ya tienen número de acta'
                                  : 'No has creado ninguna obra aún'}
                              </td>
                            </tr>
                          ) : (
                            filteredIndividualWorks.map((work, index) => (
                              <tr
                                key={work.workId}
                                className={`cursor-pointer ${selectedIds.has(work.workId) ? 'bg-[hsl(var(--canalco-primary))]/5' : index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}`}
                                onClick={() => toggleSelect(work.workId)}
                              >
                                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="rounded cursor-pointer"
                                    checked={selectedIds.has(work.workId)}
                                    onChange={() => toggleSelect(work.workId)}
                                  />
                                </td>
                                <td className="px-4 py-3 font-medium">{work.name}</td>
                                <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{work.address}</td>
                                <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{work.neighborhood}</td>
                                <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{work.company?.name || '-'}</td>
                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-2">
                                    <PermissionGuard permission="levantamientos:editar">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => navigate(`/dashboard/levantamiento-obras/obras/editar/${work.workId}`)}
                                        className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-primary))]"
                                        title="Editar"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                    </PermissionGuard>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                /* ── GROUPED VIEW ── */
                <>
                  {filteredGroupedMap.size === 0 ? (
                    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] px-4 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {searchTerm
                        ? 'No se encontraron grupos con ese número de acta'
                        : 'No hay actas en este departamento'}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {Array.from(filteredGroupedMap.entries()).map(([actaKey, actaWorks]) => {
                        const recordNumber = getActaRecordNumber(actaKey);
                        const actaCompanyId = getActaCompanyId(actaKey);
                        const actaProjectId = getActaProjectId(actaKey);
                        // Sufijo de query con empresa (+ proyecto si aplica) para navegar al acta.
                        const actaQuery = `company=${actaCompanyId}${actaProjectId != null ? `&project=${actaProjectId}` : ''}`;
                        const companyName = actaWorks[0]?.company?.name ?? '';
                        // El municipio del acta: para Canales es el nombre del proyecto;
                        // si no, el municipio de la empresa-UT.
                        const municipality = actaProjectId != null
                          ? getMunicipality(projectNameById.get(actaProjectId) ?? companyName)
                          : getMunicipality(companyName);
                        return (
                        <div
                          key={actaKey}
                          className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden"
                        >
                          {/* Group header */}
                          {(() => {
                            const actaInfo = actaStatuses.get(actaKey);
                            const status = actaInfo?.status ?? 'borrador';
                            const rol = user?.nombreRol;
                            const canSubmit = (rol?.startsWith('Director de Proyecto') || rol === 'Analista PMO') && status === 'borrador';
                            const canReview = (rol === 'Director Técnico' || rol === 'Analista PMO') && status === 'en_revision';
                            const canApprove = (rol === 'Gerencia de Proyectos' || rol === 'Analista PMO') && status === 'en_aprobacion';
                            const presupuestoStatus = actaInfo?.presupuestoStatus ?? 'pendiente';
                            const canSendToBudget = (rol === 'Director Técnico' || rol === 'Analista PMO')
                              && (presupuestoStatus === 'pendiente' || presupuestoStatus === 'rechazado');
                            return (
                              <div className="bg-[hsl(var(--canalco-primary))]/10 border-b border-[hsl(var(--canalco-primary))]/20 px-4 py-3 flex flex-wrap items-center gap-3">
                                <Layers className="w-4 h-4 text-[hsl(var(--canalco-primary))] flex-shrink-0" />
                                {editingActa === actaKey ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      autoFocus
                                      value={editActaValue}
                                      onChange={(e) => setEditActaValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameActa(actaKey, actaWorks);
                                        if (e.key === 'Escape') setEditingActa(null);
                                      }}
                                      className="h-7 w-48 text-sm font-mono"
                                    />
                                    <Button
                                      size="icon"
                                      className="h-7 w-7 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90"
                                      onClick={() => handleRenameActa(actaKey, actaWorks)}
                                      disabled={savingActa}
                                    >
                                      {savingActa
                                        ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        : <Check className="w-3.5 h-3.5" />}
                                    </Button>
                                    <button onClick={() => setEditingActa(null)} className="text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-700))]">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-semibold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-1.5">
                                    N° Acta:&nbsp;
                                    <span className="font-mono text-[hsl(var(--canalco-primary))]">{recordNumber}</span>
                                    <PermissionGuard permission="levantamientos:editar">
                                      <button
                                        onClick={() => { setEditingActa(actaKey); setEditActaValue(recordNumber); }}
                                        className="text-[hsl(var(--canalco-neutral-400))] hover:text-[hsl(var(--canalco-primary))] ml-1"
                                        title="Renombrar acta"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                    </PermissionGuard>
                                  </span>
                                )}
                                <span className="text-xs text-[hsl(var(--canalco-neutral-500))] bg-[hsl(var(--canalco-neutral-200))] px-2 py-0.5 rounded-full">
                                  {actaWorks.length} obra{actaWorks.length !== 1 ? 's' : ''}
                                </span>

                                {/* Municipality tag — visible when viewing "Todos" */}
                                {municipality && (
                                  <span className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] bg-white border border-[hsl(var(--canalco-neutral-300))] px-2 py-0.5 rounded-full">
                                    {municipality}
                                  </span>
                                )}

                                {/* Status badge */}
                                {getActaStatusBadge(actaInfo)}

                                {/* Budget (presupuesto) status badge */}
                                {presupuestoStatus !== 'pendiente' && (
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                                    presupuestoStatus === 'aprobado'
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : presupuestoStatus === 'rechazado'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-purple-50 text-purple-700 border-purple-200'
                                  }`}>
                                    {presupuestoStatus === 'aprobado'
                                      ? 'Ppto. aprobado'
                                      : presupuestoStatus === 'rechazado'
                                        ? 'Ppto. rechazado'
                                        : 'En presupuesto'}
                                  </span>
                                )}

                                {/* Rejection comment */}
                                {status === 'borrador' && actaInfo?.rejectionComment && (
                                  <span className="flex items-center gap-1 text-xs text-red-600">
                                    <AlertTriangle className="w-3 h-3" />
                                    {actaInfo.rejectionComment}
                                  </span>
                                )}

                                {/* Project code badge when approved */}
                                {status === 'aprobada' && actaInfo?.projectCode && (
                                  <span className="text-xs font-mono bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded">
                                    Cód: {actaInfo.projectCode}
                                  </span>
                                )}

                                <div className="ml-auto flex items-center gap-2">
                                  {/* Workflow buttons */}
                                  {canSubmit && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                                      onClick={() => handleSubmitActa(actaKey)}
                                      disabled={submittingActa === actaKey}
                                    >
                                      {submittingActa === actaKey
                                        ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" />
                                        : <Send className="w-3 h-3 mr-1.5" />}
                                      Enviar a revisión
                                    </Button>
                                  )}
                                  {canReview && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={() => setReviewDialog({ acta: recordNumber, companyId: actaCompanyId, projectId: actaProjectId })}
                                    >
                                      <ThumbsUp className="w-3 h-3 mr-1.5" />
                                      Revisar acta
                                    </Button>
                                  )}
                                  {canApprove && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                      onClick={() => setApproveDialog({ acta: recordNumber, companyId: actaCompanyId, projectId: actaProjectId })}
                                    >
                                      <BadgeCheck className="w-3 h-3 mr-1.5" />
                                      Aprobar acta
                                    </Button>
                                  )}
                                  {canSendToBudget && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                                      onClick={() => handleSendToBudget(actaKey)}
                                      disabled={sendingBudget === actaKey}
                                    >
                                      {sendingBudget === actaKey
                                        ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" />
                                        : <Send className="w-3 h-3 mr-1.5" />}
                                      Enviar a presupuesto
                                    </Button>
                                  )}

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-[hsl(var(--canalco-neutral-400))] text-[hsl(var(--canalco-neutral-700))] hover:bg-[hsl(var(--canalco-neutral-100))]"
                                    onClick={() =>
                                      navigate(
                                        `/dashboard/levantamiento-obras/acta/${encodeURIComponent(recordNumber)}/cantidades?${actaQuery}`,
                                        { state: { works: actaWorks } },
                                      )
                                    }
                                  >
                                    <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                                    Revisar cantidades
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/10"
                                    onClick={() =>
                                      navigate(
                                        `/dashboard/levantamiento-obras/acta/${encodeURIComponent(recordNumber)}?${actaQuery}`,
                                        { state: { works: actaWorks } },
                                      )
                                    }
                                  >
                                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                                    Resumen de Acta
                                  </Button>

                                </div>
                              </div>
                            );
                          })()}

                          {/* Works table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-[hsl(var(--canalco-neutral-50))] border-b border-[hsl(var(--canalco-neutral-200))]">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Nombre</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Dirección</th>
                                  <th className="px-4 py-2 text-right text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap" title="Índice de precios al productor inicial (IPP Julio 2015)">IPP inicial</th>
                                  <th className="px-4 py-2 text-right text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] whitespace-nowrap" title="Índice de precios al productor del mes">IPP del mes</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Valor</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Barrio</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Empresa</th>
                                  <th className="px-4 py-2 text-center text-xs font-semibold text-[hsl(var(--canalco-neutral-700))]">Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {actaWorks.map((work, index) => (
                                  <tr
                                    key={work.workId}
                                    className={index % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}
                                  >
                                    <td className="px-4 py-3 font-medium">{work.name}</td>
                                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{work.address}</td>
                                    <td className="px-4 py-3 text-right text-xs text-[hsl(var(--canalco-neutral-600))] tabular-nums whitespace-nowrap">
                                      {workIpps.has(work.workId) ? fmtIpp(workIpps.get(work.workId)!.baseIpp) : '…'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs text-[hsl(var(--canalco-neutral-600))] tabular-nums whitespace-nowrap">
                                      {workIpps.has(work.workId) ? fmtIpp(workIpps.get(work.workId)!.mesIpp) : '…'}
                                    </td>
                                    <td className="px-4 py-3 text-left text-xs font-medium text-[hsl(var(--canalco-neutral-800))] whitespace-nowrap">
                                      {workValues.has(work.workId) ? (workValues.get(work.workId)! > 0 ? fmtCOP(workValues.get(work.workId)!) : '—') : '…'}
                                    </td>
                                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{work.neighborhood}</td>
                                    <td className="px-4 py-3 text-[hsl(var(--canalco-neutral-600))]">{work.company?.name || '-'}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-center gap-2">
                                        <PermissionGuard permission="levantamientos:editar">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => navigate(`/dashboard/levantamiento-obras/obras/editar/${work.workId}`)}
                                            className="h-8 w-8 text-[hsl(var(--canalco-neutral-600))] hover:text-[hsl(var(--canalco-primary))]"
                                            title="Editar"
                                          >
                                            <Edit className="w-4 h-4" />
                                          </Button>
                                        </PermissionGuard>
                                        <PermissionGuard permission="levantamientos:editar">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveFromActa(work.workId)}
                                            disabled={removingWorkId === work.workId}
                                            className="h-8 w-8 text-[hsl(var(--canalco-neutral-400))] hover:text-red-500"
                                            title="Quitar del acta"
                                          >
                                            {removingWorkId === work.workId
                                              ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                              : <X className="w-4 h-4" />}
                                          </Button>
                                        </PermissionGuard>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <Footer />

      {/* Review Dialog — Director Técnico */}
      <Dialog open={!!reviewDialog} onOpenChange={(open) => { if (!open) { setReviewDialog(null); setReviewComment(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisar Acta: {reviewDialog?.acta}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              ¿Aprueba el acta para que pase a Gerencia de Proyectos, o la devuelve al Director de Proyecto?
            </p>
            <div>
              <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1 block">
                Comentario (obligatorio si rechaza)
              </label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Motivo del rechazo o comentarios..."
                className="w-full text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md p-2 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--canalco-primary))]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => handleReviewActa(false)}
              disabled={reviewSubmitting || !reviewComment.trim()}
            >
              {reviewSubmitting ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" /> : <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />}
              Rechazar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleReviewActa(true)}
              disabled={reviewSubmitting}
            >
              {reviewSubmitting ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" /> : <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />}
              Aprobar y enviar a Gerencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog — Gerencia de Proyectos */}
      <Dialog open={!!approveDialog} onOpenChange={(open) => { if (!open) { setApproveDialog(null); setApproveProjectCode(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprobar Acta: {approveDialog?.acta}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              Asigna el código de proyecto para finalizar la aprobación del acta.
            </p>
            <div>
              <label className="text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1 block">
                Código de proyecto <span className="text-red-500">*</span>
              </label>
              <Input
                autoFocus
                value={approveProjectCode}
                onChange={(e) => setApproveProjectCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleApproveActa(); }}
                placeholder="Ej: PRY-2026-001"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApproveActa}
              disabled={approveSubmitting || !approveProjectCode.trim()}
            >
              {approveSubmitting ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1" /> : <BadgeCheck className="w-3.5 h-3.5 mr-1.5" />}
              Aprobar acta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
