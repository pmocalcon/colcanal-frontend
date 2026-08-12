import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService } from '@/services/creg.service';
import { surveysService } from '@/services/surveys.service';
import type { Ucap } from '@/services/surveys.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import {
  indiceDisponibilidad, indiceDisponibilidadOn, wiHssi, totalFacturado,
  type IddOffMes, type IddOnMes, type LiquidacionMes, type FacturaEnergia,
} from '@/services/creg.service';
import { recursoEconomicoService } from '@/services/recursoEconomico.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, AlertCircle, LineChart, Save } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  deriveParams, computeMes, monthsBetween, computeFcm, computeEnergia, rollupAnual,
  emptySupuestos, ippProyectadoDelMes, censoVigente,
  type CellQty, type MesResultado, type FlujoMonthCol, type FlujoSupuestos, type FcmMes,
  type FcmAnual, type EnergiaMes, type FacturaDelMes,
} from '@/utils/cregCalc';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const fmtCOP = (n: number | null) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO');

type Tab = 'supuestos' | 'caom' | 'cinv' | 'energia' | 'fcm' | 'anual';
const TABS: { id: Tab; label: string }[] = [
  { id: 'supuestos', label: 'Supuestos' },
  { id: 'caom', label: 'CAOM' },
  { id: 'cinv', label: 'CINV' },
  { id: 'energia', label: 'CONTROL DE ENERGÍA' },
  { id: 'fcm', label: 'FCM' },
  { id: 'anual', label: 'FCA' },
];

export default function CregFlujoCajaPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [ucaps, setUcaps] = useState<Ucap[]>([]);
  const [params, setParams] = useState<Record<string, any>>({});
  const [quantities, setQuantities] = useState<Record<string, Record<string, CellQty | number>>>({});
  const [liqMeses, setLiqMeses] = useState<Record<string, LiquidacionMes>>({});
  const [iddMeses, setIddMeses] = useState<Record<string, IddOffMes>>({});
  const [iddOnMeses, setIddOnMeses] = useState<Record<string, IddOnMes>>({});
  /** El +12 de media noche es por proyecto y cambia las horas fuera de servicio. */
  const [iddMediaNoche, setIddMediaNoche] = useState(false);
  /** Interventoría de Recurso Económico: 'YYYY' -> companyId -> $ mensual. */
  const [interventoriaAnual, setInterventoriaAnual] =
    useState<Record<string, Record<string, number>>>({});
  /** Facturas del comercializador cargadas en su módulo: 'YYYY-MM' -> factura. */
  const [facturasEnergia, setFacturasEnergia] = useState<Record<string, FacturaEnergia>>({});

  const [supuestos, setSupuestos] = useState<FlujoSupuestos>(emptySupuestos());

  /*
   * La pestaña vive en la URL (`?vista=energia`), no solo en el estado: así Control de
   * energía puede ofrecerse como submódulo propio de CREG —es su propia pantalla para
   * quien la usa— sin sacarla de aquí, que compartiría el censo, las UCAP y los
   * supuestos con el resto del flujo y habría que cargarlo todo dos veces.
   * Se reemplaza la entrada del historial en vez de apilarla: cambiar de pestaña no es
   * navegar, y con `push` el botón «atrás» iría deshaciendo pestañas.
   */
  const [busqueda, setBusqueda] = useSearchParams();
  const tab = (TABS.some((t) => t.id === busqueda.get('vista'))
    ? busqueda.get('vista')
    : 'caom') as Tab;
  const setTab = (t: Tab) => setBusqueda({ vista: t }, { replace: true });
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    masterDataService.getCompanies()
      .then((res) => {
        setCompanies(res.filter((c) => !EXCLUDED_COMPANY_NAMES.some((e) => c.name.includes(e))));
        setLoadingCompanies(false);
      })
      .catch(() => { setError('Error al cargar empresas'); setLoadingCompanies(false); });
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);
  const isCanalesContactos = selectedCompany?.name === 'Canales & Contactos';

  useEffect(() => {
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((res) => setProjects(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const load = useCallback((companyId: number, projectId: number | null) => {
    setLoading(true);
    setError(null);
    Promise.all([
      surveysService.getUcaps(companyId, projectId ?? undefined),
      cregService.getParametrizacion(companyId, projectId),
      cregService.getCenso(companyId, projectId),
      cregService.getLiquidacion(companyId, projectId),
      cregService.getIddOff(companyId, projectId),
      cregService.getIddOn(companyId, projectId),
      // El IPP no va por municipio: es una sola serie, su propio sub-módulo.
      cregService.getIppMensual().catch(() => ({} as Record<string, number>)),
      // La interventoría ya no se teclea acá: la lleva Recurso Económico por año
      // y por proyecto. Si el módulo todavía no tiene nada, el flujo sigue con
      // las facturas capturadas y su arrastre.
      recursoEconomicoService.getInterventoria()
        .catch(() => ({} as Record<string, Record<string, number>>)),
      // La factura del comercializador vive en su propio módulo. El mes que la
      // tenga cargada deja de proyectarse; el que no, sigue como estaba.
      cregService.getFacturaEnergia(companyId, projectId)
        .catch(() => ({ data: null } as any)),
    ])
      .then(([ucapsRes, param, censo, liq, idd, iddOn, ippMeses, intervAnual, facturas]) => {
        setUcaps(ucapsRes.ucaps);
        // La serie global entra como `ippMeses` para que `ippDelMes` la encuentre.
        setParams({ ...(param.data ?? {}), ippMeses });
        setSupuestos({ ...emptySupuestos(), ...(param.data?.flujoSupuestos ?? {}) });
        setQuantities(censo.data?.quantities ?? {});
        setLiqMeses(liq.data?.meses ?? {});
        setIddMeses(idd.data?.meses ?? {});
        setIddMediaNoche(!!idd.data?.sumaMediaNoche);
        setIddOnMeses(iddOn.data?.meses ?? {});
        setInterventoriaAnual(intervAnual ?? {});
        setFacturasEnergia(facturas?.data?.meses ?? {});
        setLoading(false);
      })
      .catch(() => { setError('Error al cargar los datos del flujo'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isCanalesContactos && !selectedProjectId) return;
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, load]);

  const P = useMemo(() => deriveParams(params), [params]);

  const cols = useMemo(
    () => monthsBetween(params.fechaInicio ?? '', params.fechaFinal ?? ''),
    [params.fechaInicio, params.fechaFinal],
  );

  /** De qué mes del censo sale cada columna (el propio o el último cierre). */
  const censo = useMemo(() => censoVigente(cols, quantities), [cols, quantities]);

  // Un resultado por mes, con ID e IPP del mes (si hay dato) o del parámetro.
  const resultados = useMemo<MesResultado[]>(() => {
    if (cols.length === 0 || ucaps.length === 0) return [];
    return cols.map((col, i) => {
      const off = iddMeses[col.ym];
      const on = iddOnMeses[col.ym];
      // El +12 va aquí también: sin él las horas fuera de servicio salen cortas y
      // el ID sube, que es justo lo que infla lo facturado.
      const idApagadas = (off
        ? indiceDisponibilidad(off.fallas ?? [], off.wt, off.t, iddMediaNoche)
        : null) ?? P.idApagadas;
      const idEncendidas = (on ? indiceDisponibilidadOn(on.fallas ?? [], on.wt, on.t) : null)
        ?? P.idEncendidasParam ?? 1;
      // Manda el IPP con que se liquidó el mes; si el mes aún no existe, el de la
      // tabla del DANE, y más allá del último publicado, la proyección al IPP anual.
      const ippMes = liqMeses[col.ym]?.ippMes
        ?? ippProyectadoDelMes(params, col.ym, supuestos.ippAnual).valor;
      return computeMes(ucaps, quantities, P, col.ym, {
        idApagadas, idEncendidas, ippMes, censoYm: censo[i]?.ym,
      });
    });
  }, [cols, ucaps, quantities, P, params, iddMeses, iddOnMeses, iddMediaNoche, liqMeses, supuestos.ippAnual, censo]);

  /**
   * Lo que dejó de entregarse por fallas, mes a mes, tomado del IDD OFF.
   *
   *   ID              = 1 − Σ(Wi × HSSi) / (WT × T)
   *   Potencia en falla = Σ(Wi × HSSi), en kWh
   *
   * El mes sin IDD OFF cargado cae al ID de Parámetros y no tiene kWh en falla:
   * no hay reporte del que sacarlos, y suponerlos sería inventar una falla.
   */
  const falla = useMemo(() => cols.map((c) => {
    const off = iddMeses[c.ym];
    const fallas = off?.fallas ?? [];
    const propio = off ? indiceDisponibilidad(fallas, off.wt, off.t, iddMediaNoche) : null;
    return {
      id: propio ?? P.idApagadas,
      delMes: propio != null,
      kwh: off ? fallas.reduce((a, f) => a + wiHssi(f, iddMediaNoche), 0) : 0,
      n: fallas.length,
    };
  }), [cols, iddMeses, iddMediaNoche, P.idApagadas]);

  /**
   * De dónde sale el IPP de cada mes. `sin` es el caso grave: sin índice el CAOM
   * y el CINV se calculan sin actualizar, a precios de la resolución, y la cifra
   * sale corta sin que nada lo diga.
   */
  const ippOrigen = useMemo<IppOrigen[]>(() => cols.map((col) => {
    if (liqMeses[col.ym]?.ippMes != null) return 'real';
    const r = ippProyectadoDelMes(params, col.ym, supuestos.ippAnual);
    if (r.valor == null) return 'sin';
    return r.proyectado ? 'proyectado' : 'real';
  }), [cols, params, liqMeses, supuestos.ippAnual]);

  const ippResumen = useMemo(() => {
    const cuenta = (t: IppOrigen) => ippOrigen.filter((o) => o === t).length;
    // El ancla es la misma para todos los proyectados: el último dato publicado.
    const primero = cols[ippOrigen.indexOf('proyectado')];
    const ancla = primero
      ? ippProyectadoDelMes(params, primero.ym, supuestos.ippAnual).anclaYm
      : undefined;
    return {
      reales: cuenta('real'), proyectados: cuenta('proyectado'),
      sinDato: cuenta('sin'), ancla,
    };
  }, [ippOrigen, cols, params, supuestos.ippAnual]);

  /** Meses que corren sobre un censo arrastrado, y cuál es ese censo. */
  const arrastrados = useMemo(() => censo.filter((c) => c.arrastrado).length, [censo]);
  // El primer mes arrastrado ya apunta al último cierre: ese es el censo vigente.
  const censoUltimo = useMemo(() => censo.find((c) => c.arrastrado)?.ym, [censo]);

  /**
   * Las facturas del módulo, reducidas a lo que el flujo usa. Solo entran las
   * que tienen una cifra girable: una factura a medio capturar —sin total ni
   * valor de energía— no debe convertir el mes en facturado.
   */
  const facturasFlujo = useMemo(() => {
    const out: Record<string, FacturaDelMes> = {};
    for (const [ym, f] of Object.entries(facturasEnergia)) {
      const total = totalFacturado(f);
      if (total == null || total <= 0) continue;
      out[ym] = {
        total,
        consumoKwh: f.consumoKwh ?? null,
        costoUnitario: f.costoUnitario ?? null,
        documento: f.documento,
      };
    }
    return out;
  }, [facturasEnergia]);

  const energia = useMemo<EnergiaMes[]>(
    () => computeEnergia(cols, ucaps, quantities, supuestos, facturasFlujo),
    [cols, ucaps, quantities, supuestos, facturasFlujo],
  );
  /** El contrato del municipio abierto, por año: 'YYYY' -> $ mensual. */
  const interventoriaDelProyecto = useMemo(() => {
    const out: Record<string, number> = {};
    if (!selectedCompanyId) return out;
    for (const [anio, porEmpresa] of Object.entries(interventoriaAnual)) {
      const v = porEmpresa?.[String(selectedCompanyId)];
      if (typeof v === 'number' && v > 0) out[anio] = v;
    }
    return out;
  }, [interventoriaAnual, selectedCompanyId]);

  const fcm = useMemo<FcmMes[]>(
    () => computeFcm(cols, resultados, supuestos, energia, interventoriaDelProyecto),
    [cols, resultados, supuestos, energia, interventoriaDelProyecto],
  );
  const anual = useMemo<FcmAnual[]>(() => rollupAnual(fcm), [fcm]);

  /**
   * Qué meses son dato y cuáles proyección, para toda la página.
   *
   * El corte lo pone el censo, que es de donde sale todo lo demás: un mes con
   * censo propio se contó de verdad; antes del primer cierre no había contrato
   * que contar y después del último se arrastra lo instalado. Dentro de un mes
   * proyectado puede haber datos sueltos capturados —una factura, un recaudo— y
   * esos se marcan celda por celda, no columna por columna.
   */
  const mesProyectado = useMemo(
    () => censo.map((c, i) => c.arrastrado || resultados[i]?.activo === 0),
    [censo, resultados],
  );

  /** Un año es proyección si ninguno de sus meses tiene censo propio. */
  const anioProyectado = useMemo(
    () => anual.map((a) => cols.every((c, i) => c.year !== a.year || mesProyectado[i])),
    [anual, cols, mesProyectado],
  );

  /**
   * Guarda una serie mensual en los supuestos. `null` (celda vacía) borra la
   * entrada y el mes vuelve a estimarse. Un 0 escrito sí se guarda cuando la
   * serie lo admite: "ese mes no hubo factura" es un dato, no una ausencia.
   */
  const setSerieMes = (
    campo: 'impuestoApMeses' | 'equityMeses' | 'otrosIngresosMeses'
      | 'interventoriaMeses' | 'fiduciariosMeses'
      | 'energiaFacturas' | 'energiaValoresKwh' | 'energiaFactores',
    { admiteCero }: { admiteCero: boolean },
  ) => (ym: string, valor: number | null) =>
    setSupuestos((prev) => {
      const serie = { ...(prev[campo] ?? {}) };
      if (valor == null || (!admiteCero && valor <= 0)) delete serie[ym];
      else serie[ym] = valor;
      return { ...prev, [campo]: serie };
    });

  // Una factura, una tarifa o un factor de pérdidas en cero no significan nada,
  // así que ahí el cero se trata como celda vacía.
  const setFactura = setSerieMes('energiaFacturas', { admiteCero: false });
  const setValorKwh = setSerieMes('energiaValoresKwh', { admiteCero: false });
  const setFactorPerdidas = setSerieMes('energiaFactores', { admiteCero: false });

  // Años del horizonte (para la tabla de Supuestos).
  const years = useMemo(() => {
    const set = new Set<number>();
    cols.forEach((c) => set.add(c.year));
    return [...set].sort((a, b) => a - b);
  }, [cols]);

  const setSupYear = (year: number, field: 'impuestoAP' | 'energia', value: number) =>
    setSupuestos((prev) => ({
      ...prev,
      years: { ...prev.years, [year]: { impuestoAP: 0, energia: 0, ...prev.years[year], [field]: value } },
    }));

  /**
   * ¿Hay algo por guardar?
   *
   * Se compara contra lo último que devolvió el servidor, normalizando el orden de
   * las llaves: las series por mes (`energiaFacturas`, `impuestoApMeses`…) se van
   * llenando en el orden en que se editan, y sin ordenarlas dos objetos idénticos
   * se verían distintos y el botón quedaría siempre encendido.
   */
  const sinGuardar = useMemo(() => {
    const estable = (v: any): any => {
      if (Array.isArray(v)) return v.map(estable);
      if (v && typeof v === 'object') {
        return Object.keys(v).sort().reduce((acc: Record<string, any>, k) => {
          acc[k] = estable(v[k]);
          return acc;
        }, {});
      }
      return v;
    };
    const guardados = { ...emptySupuestos(), ...(params.flujoSupuestos ?? {}) };
    return JSON.stringify(estable(supuestos)) !== JSON.stringify(estable(guardados));
  }, [supuestos, params.flujoSupuestos]);

  /**
   * Aviso al cerrar o recargar la pestaña con trabajo sin guardar. El navegador
   * pone su propio texto —no se puede personalizar—; esto solo enciende el aviso,
   * y solo mientras haya algo que perder.
   */
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sinGuardar]);

  /**
   * Los otros dos caminos por donde se perdía el trabajo: el botón de volver y el
   * cambio de municipio o proyecto, que recarga todo y pisa los supuestos en
   * memoria. `beforeunload` no cubre ninguno de los dos porque no sale del sitio.
   */
  const confirmarDescartar = () =>
    !sinGuardar
    || window.confirm('Hay cambios sin guardar en el flujo de caja. Si continúas se pierden. ¿Continuar?');

  const guardarSupuestos = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      // `ippMeses` es la serie global inyectada al cargar: no debe quedar copiada
      // dentro de la parametrización de este municipio.
      const { ippMeses: _global, ...delMunicipio } = params;
      void _global;
      await cregService.saveParametrizacion(
        selectedCompanyId,
        { ...delMunicipio, flujoSupuestos: supuestos },
        selectedProjectId,
      );
      setParams((p) => ({ ...p, flujoSupuestos: supuestos }));
      toast.success('Supuestos del flujo guardados');
    } catch {
      toast.error('No se pudieron guardar los supuestos');
    } finally {
      setSaving(false);
    }
  };

  const ready = selectedCompanyId && (!isCanalesContactos || selectedProjectId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => { if (confirmarDescartar()) navigate('/dashboard/creg'); }} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <LineChart className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Flujo de Caja
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Proyección mes a mes: CAOM · CINV · Energía · FCM · Flujo anual
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
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
                  onValueChange={(val) => {
                    if (!confirmarDescartar()) return;
                    setSelectedCompanyId(Number(val));
                    setSelectedProjectId(null);
                  }}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="— Selecciona una empresa —" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {isCanalesContactos && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Proyecto <span className="text-red-500">*</span></label>
                  <Select value={selectedProjectId ? String(selectedProjectId) : ''}
                    onValueChange={(val) => { if (confirmarDescartar()) setSelectedProjectId(Number(val)); }}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Selecciona un proyecto —" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (<SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {ready && cols.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Horizonte</label>
                  <div className="flex items-center h-10 text-sm font-medium text-[hsl(var(--canalco-neutral-900))] tabular-nums">
                    {cols[0].label} — {cols[cols.length - 1].label} ({cols.length} meses)
                  </div>
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

        {!ready && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <LineChart className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">
              {selectedCompanyId && isCanalesContactos
                ? 'Selecciona un proyecto de Canales & Contactos'
                : 'Selecciona una empresa para ver su flujo de caja'}
            </p>
          </div>
        )}

        {ready && loading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
        )}

        {ready && !loading && cols.length === 0 && (
          <div className="text-center py-16 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-base font-medium">Define la fecha de inicio y final en Parámetros para generar el horizonte.</p>
          </div>
        )}

        {ready && !loading && cols.length > 0 && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            {/* Pestañas */}
            <div className="p-3 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center gap-2 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    tab === t.id
                      ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                      : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              {/* El botón va en todas las pestañas, no solo en Supuestos: las
                  facturas de Energía y las series del FCM se editan en su propia
                  pestaña pero viven en la misma estructura, así que dejarlo solo
                  allá hacía perder lo escrito al cambiar de pestaña. */}
              <div className="ml-auto flex items-center gap-3">
                {sinGuardar && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Cambios sin guardar
                  </span>
                )}
                <Button
                  onClick={guardarSupuestos}
                  disabled={saving || !sinGuardar}
                  title={sinGuardar
                    ? 'Guarda los supuestos, las facturas de energía y las series del FCM'
                    : 'No hay cambios por guardar'}
                  className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                </Button>
              </div>
            </div>

            {tab === 'supuestos' && (
              <SupuestosTab years={years} supuestos={supuestos} setSupuestos={setSupuestos} setSupYear={setSupYear} />
            )}
            {(tab === 'caom' || tab === 'cinv') && (
              <>
                {/* El índice es lo que mueve estas dos tablas, así que hay que decir
                    de dónde sale cada mes: dato del DANE o proyección. */}
                <p className="px-4 pt-3 text-[11px] text-[hsl(var(--canalco-neutral-600))]">
                  El {tab === 'caom' ? 'CAOM' : 'CINV'} mensual se escala por IPP(m−1) ÷ IPPo.{' '}
                  <strong>{ippResumen.reales}</strong> mes(es) con IPP publicado
                  {ippResumen.proyectados > 0 ? (
                    <>
                      {' '}y <strong className="text-amber-700">{ippResumen.proyectados}</strong> proyectado(s)
                      al <strong>{supuestos.ippAnual}%</strong> anual
                      {ippResumen.ancla ? <> desde {ippResumen.ancla}</> : null}.
                    </>
                  ) : '.'}
                  {ippResumen.sinDato > 0 && (
                    <>
                      {' '}<strong className="text-red-700">
                        {ippResumen.sinDato} mes(es) sin IPP
                      </strong>: ahí el valor va sin actualizar. Cargue la serie en
                      Parámetros → IPP mensual.
                    </>
                  )}
                </p>
                <Leyenda proyectados={arrastrados} desde={censoUltimo} />
                <MatrizFlujo
                  cols={cols} resultados={resultados} modo={tab}
                  proyectado={mesProyectado} ippOrigen={ippOrigen}
                />
              </>
            )}
            {tab === 'energia' && (
              <>
                <Leyenda proyectados={arrastrados} desde={censoUltimo} />
                <EnergiaTab
                  energia={energia}
                  onFactura={setFactura}
                  onValorKwh={setValorKwh}
                  onFactor={setFactorPerdidas}
                  factorGlobal={supuestos.energiaFactorPerdidas || 1}
                  proyectado={mesProyectado}
                  falla={falla}
                />
              </>
            )}
            {tab === 'fcm' && (
              <>
                <Leyenda proyectados={arrastrados} desde={censoUltimo} />
                <FcmTab
                  fcm={fcm}
                  energia={energia}
                  supuestos={supuestos}
                  onImpuesto={setSerieMes('impuestoApMeses', { admiteCero: true })}
                  onEquity={setSerieMes('equityMeses', { admiteCero: true })}
                  onOtrosIngresos={setSerieMes('otrosIngresosMeses', { admiteCero: true })}
                  onInterventoria={setSerieMes('interventoriaMeses', { admiteCero: true })}
                  onFiduciarios={setSerieMes('fiduciariosMeses', { admiteCero: true })}
                  proyectado={mesProyectado}
                  interventoriaAnual={interventoriaDelProyecto}
                />
              </>
            )}
            {tab === 'anual' && <AnualTab anual={anual} proyectado={anioProyectado} />}
          </div>
        )}
      </main>
    </div>
  );
}

/** Matriz grupos × meses para CAOM (AOM del mes) o CINV (inversión del mes). */
function MatrizFlujo({ cols, resultados, modo, proyectado, ippOrigen }: {
  cols: FlujoMonthCol[]; resultados: MesResultado[]; modo: 'caom' | 'cinv';
  proyectado?: boolean[];
  ippOrigen?: IppOrigen[];
}) {
  const ippEstilo: Record<IppOrigen, string> = {
    real: 'font-semibold text-[hsl(var(--canalco-neutral-700))]',
    proyectado: 'text-amber-700',
    sin: 'text-red-600',
  };
  const ippTitulo: Record<IppOrigen, string> = {
    real: 'IPP publicado',
    proyectado: 'IPP proyectado al % anual de Supuestos',
    sin: 'Sin IPP: el valor va sin actualizar',
  };
  const valorGrupo = (r: MesResultado, gi: number): number => {
    const g = r.grupos[gi];
    const base = modo === 'caom' ? g.aomMes : g.invMes;
    return base * (r.indice ?? 1);
  };
  const total = (r: MesResultado): number => (modo === 'caom' ? r.caomMensual : r.cinvMensual);
  const grupos = resultados[0]?.grupos ?? [];
  const totalLabel = modo === 'caom' ? 'CAOM MENSUAL' : 'CINV MENSUAL';

  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[hsl(var(--canalco-neutral-100))]">
            <th className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[190px]">
              {modo === 'caom' ? 'Grupo de UCAP · AOM del mes' : 'Grupo de UCAP · Inversión del mes'}
            </th>
            {cols.map((c, i) => (
              <th key={c.ym} className={`px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[110px] whitespace-nowrap ${celdaProy(proyectado, i)}`}>
                {c.label}
                {proyectado?.[i] && (
                  <span className="block text-[9px] font-normal text-amber-700 uppercase tracking-wide">proyectado</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, gi) => (
            <tr key={g.grupo} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
              <td className="sticky left-0 z-10 bg-white px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{g.grupo}</td>
              {resultados.map((r, i) => {
                const v = valorGrupo(r, gi);
                return (
                  <td key={r.ym} className={`px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap ${celdaProy(proyectado, i)}`}>
                    {v ? fmtCOP(v) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 z-10">
          <tr className="bg-[hsl(var(--canalco-primary))]/10 font-semibold">
            <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-primary))]/10 px-3 py-1.5 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">{totalLabel}</td>
            {resultados.map((r, i) => (
              <td
                key={r.ym}
                // La cifra es buena; lo que no se contó ese mes son las cantidades.
                title={r.censoArrastrado ? `Cantidades del censo de ${r.censoYm}` : undefined}
                className={`px-2 py-1.5 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap ${celdaProy(proyectado, i)}`}
              >
                {total(r) ? fmtCOP(total(r)) : '–'}
              </td>
            ))}
          </tr>
          <tr className="bg-[hsl(var(--canalco-neutral-100))] text-[10px] text-[hsl(var(--canalco-neutral-500))]">
            <td className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap">Índice actualización (IPP)</td>
            {resultados.map((r, i) => {
              const o = ippOrigen?.[i] ?? 'real';
              return (
                <td key={r.ym} title={ippTitulo[o]}
                  className={`px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap ${ippEstilo[o]}`}>
                  {r.indice != null
                    ? r.indice.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                    : '—'}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Supuestos del flujo ─────────────────────── */
const parseNum = (v: string) => { const n = Number(v.replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };

function SupuestosTab({ years, supuestos, setSupuestos, setSupYear }: {
  years: number[];
  supuestos: FlujoSupuestos;
  setSupuestos: React.Dispatch<React.SetStateAction<FlujoSupuestos>>;
  setSupYear: (year: number, field: 'impuestoAP' | 'energia', value: number) => void;
}) {
  const set = (patch: Partial<FlujoSupuestos>) => setSupuestos((p) => ({ ...p, ...patch }));
  return (
    <div className="p-6 space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-2">Ingresos y energía por año</h3>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-3">
          Valores anuales; el flujo los reparte por mes (÷12). El Impuesto de A.P. es el
          ingreso. El costo de energía quedó de <strong>respaldo</strong>: solo se usa en
          los meses sin potencia instalada en el censo, porque la hoja de ENERGÍA ya la
          calcula desde el censo y la factura.
        </p>
        <div className="overflow-auto max-h-[45vh] border border-[hsl(var(--canalco-neutral-200))] rounded-md max-w-2xl">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[hsl(var(--canalco-neutral-100))]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))]">Año</th>
                <th className="px-3 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))]">Impuesto de A.P. (anual $)</th>
                <th className="px-3 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))]">Costo energía (anual $)</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y}>
                  <td className="px-3 py-1 font-medium border border-[hsl(var(--canalco-neutral-200))]">{y}</td>
                  <td className="px-1 py-1 border border-[hsl(var(--canalco-neutral-200))]">
                    <Input value={supuestos.years[y]?.impuestoAP || ''} onChange={(e) => setSupYear(y, 'impuestoAP', parseNum(e.target.value))} className="h-8 text-right text-xs" placeholder="0" />
                  </td>
                  <td className="px-1 py-1 border border-[hsl(var(--canalco-neutral-200))]">
                    <Input value={supuestos.years[y]?.energia || ''} onChange={(e) => setSupYear(y, 'energia', parseNum(e.target.value))} className="h-8 text-right text-xs" placeholder="0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-1">Energía</h3>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-3">
          Con qué se calcula el consumo. El crecimiento solo afecta a los meses
          proyectados: la factura y la tarifa fijada, que se capturan en la hoja de
          ENERGÍA, mandan sobre él.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 max-w-4xl">
          <NumField label="Horas de encendido al día" value={supuestos.energiaHorasDia} onValue={(v) => set({ energiaHorasDia: v })} suffix="h" />
          <NumField label="Factor de pérdidas aprobado" value={supuestos.energiaFactorPerdidas} onValue={(v) => set({ energiaFactorPerdidas: v })} />
          <NumField label="Crecimiento anual del kWh" value={supuestos.energiaCrecimientoAnual} onValue={(v) => set({ energiaCrecimientoAnual: v })} suffix="%" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-3">Otros egresos y toggles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 max-w-4xl">
          <ToggleNum label="Gestión ambiental (% del CAOM)" on={supuestos.ambientalOn} onToggle={(v) => set({ ambientalOn: v })} value={supuestos.ambientalPct} onValue={(v) => set({ ambientalPct: v })} suffix="%" />
          <NumField label="Gastos fiduciarios ($ por mes, de arranque)" value={supuestos.fiduciariosMes} onValue={(v) => set({ fiduciariosMes: v })} />
          <NumField label="IPC anual (sube los dos cada enero)" value={supuestos.ipcAnual} onValue={(v) => set({ ipcAnual: v })} suffix="%" />
          {/* Escala el CAOM y el CINV más allá del último IPP publicado, así que
              es el supuesto que más mueve el flujo completo. */}
          <NumField label="IPP anual (proyecta el índice del CAOM/CINV)" value={supuestos.ippAnual} onValue={(v) => set({ ippAnual: v })} suffix="%" />
          <NumField label="Expansión navideña (% del impuesto, dic.)" value={supuestos.expNavidenaPct} onValue={(v) => set({ expNavidenaPct: v })} suffix="%" />
          <NumField label="Expansiones vegetativas (% de los ingresos)" value={supuestos.expVegetativaPct} onValue={(v) => set({ expVegetativaPct: v })} suffix="%" />
          <MesField label="Vegetativas: desde el mes" value={supuestos.expVegetativaDesde} onValue={(v) => set({ expVegetativaDesde: v })} />
          <NumField label="Saldo acumulado fijado ($)" value={supuestos.saldoInicial} onValue={(v) => set({ saldoInicial: v })} />
          <MesField label="Saldo fijado: en el mes" value={supuestos.saldoInicialDesde} onValue={(v) => set({ saldoInicialDesde: v })} />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-5">
            <input type="checkbox" checked={supuestos.gmf} onChange={(e) => set({ gmf: e.target.checked })} className="w-4 h-4 accent-[hsl(var(--canalco-primary))]" />
            Aplicar GMF 4×1000
          </label>
        </div>
      </div>
    </div>
  );
}

/** Un mes 'YYYY-MM': marca desde cuándo rige un supuesto, o en qué mes se corta. */
function MesField({ label, value, onValue }: {
  label: string; value: string; onValue: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">{label}</label>
      <Input
        type="month"
        value={value || ''}
        onChange={(e) => onValue(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}

function NumField({ label, value, onValue, suffix }: { label: string; value: number; onValue: (v: number) => void; suffix?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <Input value={value || ''} onChange={(e) => onValue(parseNum(e.target.value))} className="h-8 text-right text-xs" placeholder="0" />
        {suffix && <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleNum({ label, on, onToggle, value, onValue, suffix }: {
  label: string; on: boolean; onToggle: (v: boolean) => void; value: number; onValue: (v: number) => void; suffix?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1 cursor-pointer select-none">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-[hsl(var(--canalco-primary))]" />
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Input value={value || ''} onChange={(e) => onValue(parseNum(e.target.value))} disabled={!on} className="h-8 text-right text-xs disabled:opacity-50" placeholder="0" />
        {suffix && <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">{suffix}</span>}
      </div>
    </div>
  );
}

/* ── ENERGÍA / FCM / Anual ─────────────────────── */

/**
 * Lenguaje visual de las tablas, uno solo para toda la página:
 *   · columna con fondo ámbar y "proyectado" en el encabezado -> el mes no tiene
 *     censo propio, se calcula sobre lo arrastrado;
 *   · celda en negrita -> ahí sí hay un dato capturado (factura, recaudo,
 *     tarifa escrita), aunque el mes sea proyectado.
 */
const celdaProy = (proyectado: boolean[] | undefined, i: number): string =>
  proyectado?.[i] ? 'bg-amber-50/70' : '';

/** De dónde salió el IPP de un mes: publicado, proyectado, o no hay. */
type IppOrigen = 'real' | 'proyectado' | 'sin';

/** La misma leyenda en las cuatro tablas: sin ella los colores no dicen nada. */
function Leyenda({ proyectados, desde }: { proyectados: number; desde?: string }) {
  return (
    <div className="px-4 pt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-[hsl(var(--canalco-neutral-600))]">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm border border-[hsl(var(--canalco-neutral-300))] bg-white" />
        mes con censo propio: <strong>dato</strong>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm border border-amber-300 bg-amber-50" />
        <span className="text-amber-700">
          mes <strong>proyectado</strong>
          {proyectados > 0 ? ` (${proyectados})` : ''}
          {desde ? `, sobre el censo de ${desde}` : ''}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <strong className="tabular-nums">123.456</strong>
        en negrita: capturado a mano (factura, recaudo, tarifa)
      </span>
    </div>
  );
}

interface FlowRow {
  label: string;
  values: number[];
  kind?: 'head' | 'total' | 'grand';
  /** Formato de la celda. Por defecto pesos; energía usa kW, kWh y $/kWh. */
  fmt?: (v: number, i: number) => string;
  /** Si está, la fila se captura a mano. `null` = la celda se dejó vacía. */
  onEdit?: (i: number, v: number | null) => void;
  /** Decimales de la celda editable. */
  editDecimales?: number;
  /** Nota bajo la etiqueta (el Kte de la UCAP, de dónde sale el dato…). */
  hint?: string;
  /** Celda capturada a mano: va en negrita y explica de dónde salió. */
  marca?: (i: number) => string | null;
  /** Explica la celda sin resaltarla: sirve para lo calculado o arrastrado. */
  nota?: (i: number) => string | null;
}

/**
 * Celda numérica editable dentro de una tabla de flujo.
 *
 * Se formatea con separadores solo cuando no está en edición: formatear mientras
 * se escribe mueve el cursor y "51.479.550" no vuelve a parsear con el parseNum
 * general, que se traga los puntos de miles. Con decimales se acepta coma o
 * punto como separador —un $/kWh no lleva miles, así que no hay ambigüedad—.
 */
function CeldaNum({ valor, onValor, titulo, resaltado, decimales = 0 }: {
  // null = celda vacía. Un 0 escrito es un dato ("ese mes no hubo factura") y
  // no puede confundirse con "no se ha capturado".
  valor: number; onValor: (v: number | null) => void; titulo: string; resaltado: boolean;
  decimales?: number;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const crudo = (v: number) => (decimales > 0 ? String(v) : String(Math.round(v)));
  const mostrado = editando
    ? texto
    : valor
      ? valor.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
      : '';
  return (
    <input
      className={`w-full px-2 py-1 text-right tabular-nums bg-transparent outline-none focus:bg-[hsl(var(--canalco-primary))]/10 ${resaltado ? 'font-semibold' : 'text-[hsl(var(--canalco-neutral-500))]'}`}
      title={titulo}
      value={mostrado}
      placeholder="–"
      onFocus={() => { setTexto(valor ? crudo(valor) : ''); setEditando(true); }}
      onBlur={() => setEditando(false)}
      onChange={(e) => {
        const limpio = decimales > 0
          // Un solo separador decimal: se conserva el primero y se descartan los demás.
          ? e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
          : e.target.value.replace(/[^\d]/g, '');
        setTexto(limpio);
        const n = Number(limpio);
        onValor(limpio && Number.isFinite(n) ? n : null);
      }}
    />
  );
}

function FlowTable({ firstCol, periodLabels, rows, proyectado }: {
  firstCol: string; periodLabels: string[]; rows: FlowRow[];
  /** Por columna: true si el mes es proyección y no dato. */
  proyectado?: boolean[];
}) {
  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[hsl(var(--canalco-neutral-100))]">
            <th className="sticky left-0 z-20 bg-[hsl(var(--canalco-neutral-100))] px-3 py-2 text-left font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[220px]">{firstCol}</th>
            {periodLabels.map((l, i) => (
              <th key={i} className={`px-2 py-2 text-right font-semibold border border-[hsl(var(--canalco-neutral-200))] min-w-[110px] whitespace-nowrap ${celdaProy(proyectado, i)}`}>
                {l}
                {proyectado?.[i] && (
                  <span className="block text-[9px] font-normal text-amber-700 uppercase tracking-wide">proyectado</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            if (r.kind === 'head') {
              return (
                <tr key={ri} className="bg-[hsl(var(--canalco-primary))]/10">
                  <td colSpan={periodLabels.length + 1} className="px-3 py-1 font-semibold uppercase text-[11px] tracking-wide border border-[hsl(var(--canalco-neutral-200))]">{r.label}</td>
                </tr>
              );
            }
            const cls = r.kind === 'grand'
              ? 'bg-[hsl(var(--canalco-primary))]/10 font-bold'
              : r.kind === 'total' ? 'font-semibold bg-[hsl(var(--canalco-neutral-50))]' : '';
            const fmt = r.fmt ?? ((v: number) => fmtCOP(v));
            return (
              <tr key={ri} className={cls || 'hover:bg-[hsl(var(--canalco-neutral-50))]'}>
                <td className={`sticky left-0 z-10 px-3 py-1 border border-[hsl(var(--canalco-neutral-200))] whitespace-nowrap ${cls ? cls : 'bg-white'}`}>
                  {r.label}
                  {r.hint && (
                    <span className="block text-[10px] font-normal text-[hsl(var(--canalco-neutral-500))]">{r.hint}</span>
                  )}
                </td>
                {r.values.map((v, i) => {
                  const marca = r.marca?.(i) ?? null;
                  const nota = marca ?? r.nota?.(i) ?? null;
                  const proy = celdaProy(proyectado, i);
                  if (r.onEdit) {
                    return (
                      <td key={i} className={`p-0 border border-[hsl(var(--canalco-neutral-100))] ${proy}`}>
                        <CeldaNum
                          valor={v}
                          resaltado={!!marca}
                          decimales={r.editDecimales ?? 0}
                          titulo={nota ?? 'Proyectado: se calcula solo'}
                          onValor={(n) => r.onEdit!(i, n)}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={i} title={nota ?? undefined}
                      className={`px-2 py-1 text-right tabular-nums border border-[hsl(var(--canalco-neutral-100))] whitespace-nowrap ${proy} ${marca ? 'font-semibold' : ''}`}>
                      {v ? fmt(v, i) : <span className="text-[hsl(var(--canalco-neutral-300))]">–</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fmtDec = (n: number, d: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Hoja de ENERGÍA: de la potencia instalada del censo al valor a pagar.
 *
 * La fila "Total a pagar" se llena sola con la factura que se haya cargado en el
 * módulo Factura de energía, y sigue siendo editable: escribirla a mano manda
 * sobre el documento —es un ajuste explícito—, y borrarla devuelve el mes a la
 * factura, o a la proyección si no hay ninguna.
 *
 * El documento trae además el consumo medido y el costo unitario impresos. No
 * reemplazan a los calculados: el consumo del flujo sale del censo y el $/kWh se
 * despeja del total, como en el Excel. Se muestran al lado para contrastar, que
 * es justamente donde se ve si el censo se quedó corto frente al medidor.
 */
function EnergiaTab({ energia, onFactura, onValorKwh, onFactor, factorGlobal, proyectado, falla }: {
  energia: EnergiaMes[];
  onFactura: (ym: string, valor: number | null) => void;
  onValorKwh: (ym: string, valor: number | null) => void;
  onFactor: (ym: string, valor: number | null) => void;
  factorGlobal: number;
  proyectado?: boolean[];
  /** Indisponibilidad del mes, del IDD OFF. */
  falla?: { id: number | null; delMes: boolean; kwh: number; n: number }[];
}) {
  const labels = energia.map((m) => `${m.mes}/${String(m.year).slice(2)}`);

  // Las UCAPs que aportan potencia en algún mes, en el orden del censo.
  const ucapsConPotencia = useMemo(() => {
    const vistas = new Map<string, { code: string; description: string; kte: number; solar: boolean }>();
    for (const m of energia) {
      for (const d of m.detalle) {
        if (d.potenciaW <= 0 && d.cantidad <= 0) continue;
        if (!vistas.has(d.key)) {
          vistas.set(d.key, { code: d.code, description: d.description, kte: d.kte, solar: d.solar });
        }
      }
    }
    return [...vistas.entries()].map(([key, v]) => ({ key, ...v }));
  }, [energia]);

  /** Un Kte en cero puede ser una solar o una UCAP sin potencia cargada. */
  const kteHint = (u: { code: string; kte: number; solar: boolean }): string => {
    if (u.kte > 0) return `${u.code} · Kte ${fmtDec(u.kte, 0)} W`;
    if (u.solar) return `${u.code} · solar, no consume de la red`;
    return `${u.code} · sin potencia cargada en la hoja de costos`;
  };
  const sinPotencia = ucapsConPotencia.filter((u) => u.kte === 0 && !u.solar);

  // La negrita significa una sola cosa en toda la página: alguien lo capturó.
  // El mes que viene del documento no la lleva —nadie lo tecleó aquí—, pero sí
  // dice de dónde sale.
  const marcaOrigen = (i: number): string | null => {
    const m = energia[i];
    if (!m) return null;
    if (m.origen === 'factura') {
      return m.facturaFuente === 'manual'
        ? 'Escrito a mano en esta fila' + (m.totalDocumento ? ' (hay factura cargada)' : '')
        : null;
    }
    if (m.origen === 'precio') return 'Tarifa fijada a mano';
    return null;
  };
  // Lo calculado —y lo que llega de otro módulo— se explica, pero no se resalta.
  const notaOrigen = (i: number): string | null => {
    const m = energia[i];
    if (!m) return null;
    switch (m.origen) {
      case 'factura':
        if (m.facturaFuente === 'documento') {
          return `De la factura ${m.facturaDoc || 'cargada'} en Factura de energía`;
        }
        return m.totalDocumento
          ? `La factura cargada dice ${fmtCOP(m.totalDocumento)}: manda lo escrito aquí`
          : null;
      case 'supuesto': return 'Sin potencia en el censo: del costo anual de Supuestos ÷ 12';
      case 'proyectado': return 'Proyectado: el $/kWh del mes anterior con el crecimiento anual';
      default: return null;
    }
  };

  const rows: FlowRow[] = [
    { label: 'Potencia instalada por unidad constructiva (kW)', values: [], kind: 'head' },
    ...ucapsConPotencia.map((u): FlowRow => ({
      label: u.description,
      hint: kteHint(u),
      values: energia.map((m) => (m.detalle.find((d) => d.key === u.key)?.potenciaW ?? 0) / 1000),
      fmt: (v) => fmtDec(v, 3),
    })),
    {
      label: 'TOTAL POTENCIA INSTALADA (kW)', kind: 'total',
      values: energia.map((m) => m.potenciaKw), fmt: (v) => fmtDec(v, 3),
      nota: (i) => (energia[i]?.potenciaProyectada
        ? 'Arrastrada del último mes con censo: lo instalado sigue instalado' : null),
    },
    { label: 'Cálculo del consumo', values: [], kind: 'head' },
    {
      label: 'Número de días del mes',
      values: energia.map((m) => m.dias), fmt: (v) => String(v),
    },
    {
      label: 'Energía consumida por potencia instalada (kWh)',
      hint: `kW × ${energia[0]?.horasDia ?? 12} h/día × días del mes`,
      values: energia.map((m) => m.energiaKwh), fmt: (v) => fmtDec(v, 2),
    },
    {
      label: 'Factor de pérdidas aprobado',
      hint: `el aprobado es ${fmtDec(factorGlobal, 2)}; se puede ajustar mes a mes`,
      values: energia.map((m) => m.factorPerdidas), fmt: (v) => fmtDec(v, 2),
      onEdit: (i, v) => { const ym = energia[i]?.ym; if (ym) onFactor(ym, v); },
      editDecimales: 2,
      // Se resalta el mes que no lleva el factor aprobado: es una excepción y
      // mueve el consumo un 8 %, no puede pasar desapercibida.
      marca: (i) => (energia[i] && energia[i].factorPerdidas !== factorGlobal
        ? `Ajustado a mano (el aprobado es ${fmtDec(factorGlobal, 2)})` : null),
    },
    {
      label: 'TOTAL ENERGÍA CONSUMIDA (kWh)', kind: 'total',
      hint: 'redondeado, es el que factura la electrificadora',
      values: energia.map((m) => m.totalKwh), fmt: (v) => fmtDec(v, 0),
      // El medidor contra el censo. La diferencia no se corrige sola: si el
      // medidor va muy por encima, lo que hay que revisar es el censo.
      nota: (i) => {
        const m = energia[i];
        const medido = m?.consumoFacturado;
        if (!m || medido == null || medido <= 0) return null;
        const dif = medido - m.totalKwh;
        const pct = m.totalKwh > 0 ? (dif / m.totalKwh) * 100 : 0;
        return `La factura mide ${fmtDec(medido, 0)} kWh (${dif >= 0 ? '+' : ''}${fmtDec(pct, 1)} %)`;
      },
    },
    {
      label: 'Valor del kWh ($)',
      hint: 'con factura se despeja de ella; si no, escribe la tarifa o déjala proyectar',
      values: energia.map((m) => m.valorKwh),
      // Editable salvo en los meses facturados, donde el valor se despeja del
      // total: dejar escribir ahí prometería un cambio que no ocurre.
      onEdit: (i, v) => {
        const m = energia[i];
        if (m && m.origen !== 'factura') onValorKwh(m.ym, v);
      },
      editDecimales: 2,
      marca: marcaOrigen,
      // El $/kWh del flujo se despeja del total sobre el consumo del censo, así
      // que no tiene por qué dar el mismo que el impreso en la factura, que va
      // sobre el consumo medido. Se muestran los dos en vez de elegir uno.
      nota: (i) => {
        const m = energia[i];
        const impreso = m?.costoUnitarioFacturado;
        const base = notaOrigen(i);
        if (!m || impreso == null || impreso <= 0) return base;
        const cu = `La factura imprime ${fmtDec(impreso, 2)} $/kWh`;
        return base ? `${base} · ${cu}` : cu;
      },
    },
    {
      label: 'TOTAL A PAGAR ENERGÍA ($)', kind: 'grand',
      hint: 'escribe aquí la factura del mes; en blanco se calcula con la tarifa',
      values: energia.map((m) => m.total),
      onEdit: (i, v) => { const ym = energia[i]?.ym; if (ym) onFactura(ym, v); },
      marca: marcaOrigen,
      nota: notaOrigen,
    },
    /*
     * Indisponibilidad, alimentada del IDD OFF. En el Excel estas tres filas están
     * tecleadas: el mismo número repetido en los 337 meses, sin fórmula. Aquí se
     * calculan del reporte de fallas del mes, que es de donde salen de verdad.
     */
    { label: 'Indisponibilidad (del IDD OFF)', values: [], kind: 'head' },
    {
      label: 'ID Índice de Falla',
      hint: '1 − Σ(Wi × HSSi) ÷ (WT × T), del reporte de apagadas del mes',
      values: (falla ?? []).map((f) => f.id ?? 0),
      fmt: (v) => (v ? fmtDec(v, 7) : '—'),
      marca: (i) => (falla?.[i]?.delMes ? 'Calculado con el IDD OFF del mes' : null),
      nota: (i) => (falla?.[i] && !falla[i].delMes
        ? 'Sin IDD OFF cargado: se usa el ID de Parámetros' : null),
    },
    {
      label: 'Potencia en falla (kWh)',
      hint: 'Σ(Wi × HSSi): potencia con pérdidas × horas fuera de servicio',
      values: (falla ?? []).map((f) => f.kwh),
      fmt: (v) => fmtDec(v, 1),
      marca: (i) => (falla?.[i]?.delMes && falla[i].kwh > 0
        ? `${falla[i].n} falla(s) reportada(s) en el mes` : null),
    },
    {
      label: 'Vlr consumo indisponible ($)',
      hint: 'kWh en falla × el $/kWh del mes: lo que no se entregó, valorado',
      values: (falla ?? []).map((f, i) => f.kwh * (energia[i]?.valorKwh ?? 0)),
      nota: notaOrigen,
    },
  ];

  const facturados = energia.filter((m) => m.origen === 'factura').length;
  const conDocumento = energia.filter((m) => m.facturaFuente === 'documento').length;
  // Meses donde alguien escribió un total distinto al de la factura cargada. No
  // es un error —puede ser una nota crédito o un pago parcial—, pero se dice.
  const pisados = energia.filter((m) => m.facturaFuente === 'manual'
    && m.totalDocumento != null && Math.abs(m.totalDocumento - m.total) >= 1);
  const conTarifa = energia.filter((m) => m.origen === 'precio').length;
  const conSupuesto = energia.filter((m) => m.origen === 'supuesto').length;
  const factorAjustado = energia.filter((m) => m.factorPerdidas !== factorGlobal);
  const conIdd = (falla ?? []).filter((f) => f.delMes).length;

  return (
    <>
      <div className="px-4 pt-3 space-y-1">
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
          Potencia instalada del censo × horas de encendido × días del mes, con el factor
          de pérdidas. El valor del kWh sale de una de tres: se despeja de la factura del
          mes, se escribe a mano cuando ya se conoce la tarifa, o se arrastra del mes
          anterior con el crecimiento de Supuestos. Este total es el que usa el FCM.
        </p>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
          <strong>{facturados}</strong> mes(es) con factura
          {conDocumento > 0 && <> —{conDocumento} de ellos cargados en <strong>Factura de energía</strong>—</>}
          {' '}y <strong>{conTarifa}</strong> con tarifa fijada, de {energia.length}.
          {pisados.length > 0 && (
            <span className="text-amber-700">
              {' '}En {pisados.length} mes(es) el total escrito aquí no coincide con la factura
              cargada ({pisados.slice(0, 3).map((m) => m.ym).join(', ')}
              {pisados.length > 3 ? '…' : ''}): manda lo escrito; borra la celda para volver
              a la factura.
            </span>
          )}
          {conSupuesto > 0 && (
            <span className="text-amber-700">
              {' '}{conSupuesto} sin potencia instalada en el censo: ahí se usa el costo
              anual de Supuestos ÷ 12.
            </span>
          )}
          {factorAjustado.length > 0 && (
            <span className="text-amber-700">
              {' '}{factorAjustado.length} mes(es) con el factor de pérdidas cambiado
              ({factorAjustado.slice(0, 3).map((m) => m.ym).join(', ')}
              {factorAjustado.length > 3 ? '…' : ''}): revisa que sea a propósito.
            </span>
          )}
          {sinPotencia.length > 0 && (
            <span className="text-amber-700">
              {' '}{sinPotencia.length} UCAP(s) sin potencia en la hoja de costos
              ({sinPotencia.map((u) => u.code).join(', ')}): no suman al consumo hasta
              que se les cargue.
            </span>
          )}
        </p>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
          La indisponibilidad sale del <strong>IDD OFF</strong>:{' '}
          <strong>{conIdd}</strong> mes(es) con reporte cargado, de {energia.length}.
          {conIdd < energia.length && (
            <span className="text-amber-700">
              {' '}El resto usa el ID de Parámetros y queda sin kWh en falla.
            </span>
          )}
        </p>
      </div>
      <FlowTable firstCol="Concepto" periodLabels={labels} rows={rows} proyectado={proyectado} />
    </>
  );
}

/**
 * Flujo de Caja Mensual.
 *
 * Tres filas se capturan a mano porque son hechos, no cálculos: el recaudo del
 * impuesto de A.P. y las facturas de interventoría y fiducia. Lo que se deja en
 * blanco se estima —el impuesto con el anual ÷ 12, las otras dos arrastrando el
 * último valor con el IPC de enero—, y esas celdas quedan atenuadas.
 */
function FcmTab({
  fcm, energia, supuestos,
  onImpuesto, onEquity, onOtrosIngresos, onInterventoria, onFiduciarios, proyectado,
  interventoriaAnual,
}: {
  fcm: FcmMes[];
  energia: EnergiaMes[];
  supuestos: FlujoSupuestos;
  onImpuesto: (ym: string, valor: number | null) => void;
  onEquity: (ym: string, valor: number | null) => void;
  onOtrosIngresos: (ym: string, valor: number | null) => void;
  onInterventoria: (ym: string, valor: number | null) => void;
  onFiduciarios: (ym: string, valor: number | null) => void;
  proyectado?: boolean[];
  /** Interventoría del contrato por año, para decir de dónde sale cada celda. */
  interventoriaAnual?: Record<string, number>;
}) {
  const labels = fcm.map((m) => `${m.mes}/${String(m.year).slice(2)}`);
  // Qué meses son dato capturado y cuáles vienen arrastrados.
  const capturado = {
    interventoria: new Set(Object.keys(supuestos.interventoriaMeses ?? {})),
    fiduciarios: new Set(Object.keys(supuestos.fiduciariosMeses ?? {})),
  };
  const R = (label: string, get: (m: FcmMes) => number, kind?: FlowRow['kind']): FlowRow => ({ label, values: fcm.map(get), kind });
  const editable = (
    label: string,
    get: (m: FcmMes) => number,
    set: (ym: string, v: number | null) => void,
    capturado: (m: FcmMes) => boolean,
    hint: string,
  ): FlowRow => ({
    label, hint,
    values: fcm.map(get),
    onEdit: (i, v) => { const ym = fcm[i]?.ym; if (ym) set(ym, v); },
    marca: (i) => (fcm[i] && capturado(fcm[i]) ? 'Capturado a mano' : null),
    nota: (i) => (fcm[i] && !capturado(fcm[i]) ? `Sin capturar: ${hint}` : null),
  });

  // De dónde sale el costo de energía de cada mes, para no confundir una
  // factura pagada con una proyección.
  const notaEnergia = (i: number): string | null => {
    const m = energia[i];
    switch (m?.origen) {
      case 'factura':
        return m.facturaFuente === 'documento'
          ? `De la factura ${m.facturaDoc || 'del mes'}, cargada en Factura de energía`
          : 'Del total escrito a mano en CONTROL DE ENERGÍA';
      case 'precio': return 'Con la tarifa fijada a mano';
      case 'supuesto': return 'Sin potencia en el censo: del costo anual ÷ 12';
      default: return 'Proyectado desde el $/kWh del mes anterior';
    }
  };
  const marcaEnergia = (i: number): string | null =>
    (energia[i]?.origen === 'factura' ? 'Facturado' : null);
  const notaCenso = (i: number): string | null => (energia[i]?.potenciaProyectada
    ? 'Cantidades arrastradas del último censo cerrado' : null);

  const rows: FlowRow[] = [
    { label: '1 · Ingresos', values: [], kind: 'head' },
    editable(
      'Impuesto de A.P.', (m) => m.impuestoAP, onImpuesto,
      (m) => !m.impuestoApEstimado,
      'escribe el recaudo del mes; en blanco se reparte el anual de Supuestos ÷ 12',
    ),
    editable('Equity', (m) => m.equity, onEquity,
      (m) => m.equity !== 0, 'aporte de capital del mes'),
    editable('Otros ingresos', (m) => m.otrosIngresos, onOtrosIngresos,
      (m) => m.otrosIngresos !== 0, 'cualquier otro ingreso del mes'),
    R('TOTAL INGRESOS', (m) => m.totalIngresos, 'total'),
    { label: '2.1 · Egresos operacionales', values: [], kind: 'head' },
    // Las tres filas de energía del Excel: cuánto se consumió, a qué precio y
    // cuánto se paga. Las dos primeras vienen tal cual de la hoja de ENERGÍA.
    {
      label: 'Consumo de energía (kWh/mes)',
      values: energia.map((m) => m.totalKwh),
      fmt: (v) => fmtDec(v, 0),
      nota: (i) => (energia[i]?.potenciaProyectada
        ? 'Sobre el censo arrastrado del último cierre' : null),
    },
    {
      label: 'Valor kWh ($)',
      values: energia.map((m) => m.valorKwh),
      fmt: (v) => fmtDec(v, 2),
      marca: marcaEnergia, nota: notaEnergia,
    },
    { ...R('Consumo de energía ($)', (m) => m.energia), marca: marcaEnergia, nota: notaEnergia },
    {
      ...editable(
        'Interventoría', (m) => m.interventoria, onInterventoria,
        (m) => capturado.interventoria.has(m.ym),
        'la factura del mes; en blanco, el contrato del año de Recurso Económico',
      ),
      // La factura sigue mandando y va en negrita; el contrato del año se
      // explica al pasar el mouse, para que nadie lo busque en Supuestos.
      nota: (i) => {
        const m = fcm[i];
        if (!m || capturado.interventoria.has(m.ym)) return null;
        const anual = interventoriaAnual?.[String(m.year)];
        return anual
          ? `Contrato de ${m.year} en Recurso Económico`
          : `Sin contrato de ${m.year} en Recurso Económico: arrastra el mes anterior`;
      },
    },
    editable(
      'Gastos fiduciarios', (m) => m.fiduciarios, onFiduciarios,
      (m) => capturado.fiduciarios.has(m.ym),
      'la factura del mes; en blanco arrastra la última y sube cada enero por el IPC',
    ),
    R('Total egresos operacionales', (m) => m.egresosOper, 'total'),
    { label: '2.2 · Pagos al concesionario', values: [], kind: 'head' },
    { ...R('CAOM', (m) => m.caom), nota: notaCenso },
    { ...R('Inversión Modernización (CINV)', (m) => m.cinv), nota: notaCenso },
    R('Gestión ambiental residuos', (m) => m.ambiental),
    R('Expansión alumbrado navideño', (m) => m.expNavidena),
    R('Expansiones vegetativas', (m) => m.expVegetativa),
    R('Total pagos concesionario', (m) => m.totalPConcesionario, 'total'),
    { label: '2.3 · Impuestos', values: [], kind: 'head' },
    {
      label: 'Impuesto transacciones financieras 4/1000',
      hint: '(total ingresos − consumo de energía) × 4/1000, redondeado',
      values: fcm.map((m) => m.gmf),
    },
    R('Total impuestos', (m) => m.totalImpuestos, 'total'),
    R('TOTAL EGRESOS', (m) => m.totalEgresos, 'total'),
    {
      label: 'SALDO OPERATIVO', kind: 'grand',
      hint: 'total ingresos − total egresos',
      values: fcm.map((m) => m.saldoOperativo),
    },
    {
      label: '3 · SALDO ACUMULADO', kind: 'grand',
      hint: 'el acumulado del mes anterior más el saldo operativo de este',
      values: fcm.map((m) => m.saldoAcumulado),
      // El mes con saldo fijado no acumula: lo reemplaza. Si no se marca, el
      // salto queda como un error de suma inexplicable.
      marca: (i) => (fcm[i]?.saldoFijado ? 'Saldo fijado a mano en Supuestos' : null),
    },
  ];
  return <FlowTable firstCol="Concepto" periodLabels={labels} rows={rows} proyectado={proyectado} />;
}

function AnualTab({ anual, proyectado }: { anual: FcmAnual[]; proyectado?: boolean[] }) {
  const labels = anual.map((a) => String(a.year));
  const R = (label: string, get: (a: FcmAnual) => number, kind?: FlowRow['kind']): FlowRow => ({ label, values: anual.map(get), kind });
  const rows: FlowRow[] = [
    R('TOTAL INGRESOS', (a) => a.totalIngresos, 'total'),
    { label: 'Egresos', values: [], kind: 'head' },
    R('Consumo de energía ($)', (a) => a.energia),
    R('Total egresos operacionales', (a) => a.egresosOper, 'total'),
    R('CAOM', (a) => a.caom),
    R('Inversión Modernización (CINV)', (a) => a.cinv),
    R('Gestión ambiental', (a) => a.ambiental),
    R('Expansión navideña', (a) => a.expNavidena),
    R('Expansiones vegetativas', (a) => a.expVegetativa),
    R('Total pagos concesionario', (a) => a.totalPConcesionario, 'total'),
    R('TOTAL EGRESOS', (a) => a.totalEgresos, 'total'),
    R('SALDO OPERATIVO', (a) => a.saldoOperativo, 'grand'),
    R('SALDO ACUMULADO', (a) => a.saldoAcumulado, 'grand'),
  ];
  return <FlowTable firstCol="Concepto" periodLabels={labels} rows={rows} proyectado={proyectado} />;
}
