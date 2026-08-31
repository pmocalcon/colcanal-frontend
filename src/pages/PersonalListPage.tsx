import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, Loader2, Pencil, Plus, Save, Search, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Campo, CampoCalculado, CampoCheck, CampoPorcentaje, CampoSugerido, Selector } from '@/components/talentoHumano/campos';
import { talentoHumanoService, type ThBanco, type ThPersona } from '@/services/talentoHumano.service';
import { buildXlsxBlob, downloadBlob, type XlsxCell, type XlsxRow } from '@/utils/xlsxWriter';

/**
 * Listado de la base de personal.
 *
 * Trae la base entera —son menos de cien personas— y filtra en pantalla. Pedirle al
 * servidor cada tecleo obligaría a esperar por algo que ya está en memoria, y paginar
 * impediría contar cuántos activos hay sin recorrer las páginas.
 *
 * La tabla muestra **todas** las columnas del archivo original. Son veintitantas, así que
 * la de nombre queda fija al desplazarse a lo ancho: sin eso, a la altura de la carga
 * prestacional ya no se sabe de quién es la fila.
 */

const ESTADOS = ['ACTIVO', 'INACTIVO'];
const TIPOS_CUENTA = ['AHORROS', 'CORRIENTE'];

/**
 * Los tipos de documento que el archivo del banco sabe traducir a su número. Vacío se
 * lee como CC, que es lo que es casi toda la base.
 */
const TIPOS_ID = ['CC', 'CE', 'TI', 'NIT', 'PA'];

/**
 * Propone dónde termina el apellido en un «APELLIDOS NOMBRES».
 *
 * Es la misma regla del backend (`partirNombre` en `pagos.service.ts`) y está repetida a
 * propósito: acá solo sirve para mostrar en gris lo que se va a usar si nadie escribe
 * nada, y hacer un viaje al servidor para eso sería peor. Quien manda al armar el archivo
 * sigue siendo el backend.
 */
const partirNombre = (nombre: string) => {
  const palabras = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return { apellidos: '', nombres: '' };
  if (palabras.length === 1) return { apellidos: palabras[0], nombres: '' };
  const cuantos = palabras.length >= 4 ? 2 : 1;
  return {
    apellidos: palabras.slice(0, cuantos).join(' '),
    nombres: palabras.slice(cuantos).join(' '),
  };
};

/** Las cifras de la remuneración, que en la tabla van juntas y alineadas a la derecha. */
const cop = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0 ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

/** El archivo guarda la carga prestacional como fracción: 0,3783 es el 37,83 %. */
const pct = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n !== 0
    ? (n * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' %'
    : '—';
};

const fecha = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '—');
};

const esActivo = (p: ThPersona) => (p.estado ?? '').trim().toUpperCase().startsWith('ACTIVO');

/**
 * Encabezado de columna.
 *
 * Las clases de alineación se escogen de un objeto y no se arman con `text-${alinear}`:
 * Tailwind purga lo que no encuentre escrito literal en el código, y una clase construida
 * no aparecería en la hoja de estilos compilada.
 *
 * `fija` deja la columna del nombre pegada a la izquierda: son veintitantas columnas, y a
 * la altura de la carga prestacional ya no se sabría de quién es la fila.
 */
const ALINEAR = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function Th({ children, alinear = 'left', fija = false }: {
  children: React.ReactNode;
  alinear?: keyof typeof ALINEAR;
  fija?: boolean;
}) {
  // `sticky top-0` deja la fila de encabezados pegada arriba al desplazarse hacia
  // abajo; la columna del nombre (`fija`) además queda pegada a la izquierda, así
  // que su celda de encabezado es la esquina y va por encima de las demás.
  return (
    <th className={`px-3 py-2 font-semibold whitespace-nowrap sticky top-0 bg-[hsl(var(--canalco-neutral-100))] ${ALINEAR[alinear]} ${
      fija ? 'left-0 z-30' : 'z-20'
    }`}>
      {children}
    </th>
  );
}

const SEXOS = ['FEMENINO', 'MASCULINO', 'OTRO'];
const ESTADOS_CIVILES = ['SOLTERO(A)', 'CASADO(A)', 'UNIÓN LIBRE', 'SEPARADO(A)', 'DIVORCIADO(A)', 'VIUDO(A)'];
/** Las cinco clases del decreto 1607. No es la tarifa: eso es «Tarifa ARL». */
const CLASES_RIESGO = ['I', 'II', 'III', 'IV', 'V'];
/**
 * Tres respuestas y no un sí/no: hay cargos que no la necesitan, y aplanarlos a «no»
 * dejaría a un auxiliar administrativo tan incumplido como a un técnico sin certificar.
 */
const TRABAJO_ALTURA = ['SÍ', 'NO', 'NO APLICA'];

/** Los días con decimales: medio día de permiso es medio día, no cero ni uno. */
const dias = (v: number | null | undefined) =>
  v == null || v === 0 ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 1 });

type Borrador = Partial<ThPersona>;

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** A dos decimales, y sin la cola de coma flotante de 662367.36150000004. */
const dosDecimales = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Rehace los tres totales de la remuneración a partir de los cuatro datos de entrada.
 *
 * Son las mismas fórmulas del Excel, verificadas contra sus filas:
 *
 *     total salarios     = salario + auxilio de transporte + auxilio de rodamiento
 *     carga prestacional = salario × % de carga        ← sobre el salario, no sobre el total
 *     costo total        = total salarios + carga prestacional
 *
 * Se calculan en vez de dejarlos escribir porque un total tecleado a mano deja de cuadrar
 * con sus sumandos en cuanto uno cambia, y porque de los cuatro números que se digitan
 * salen los tres que de verdad se miran.
 */
const recalcular = (b: Borrador): Borrador => {
  const salario = num(b.salario);
  const total = salario + num(b.auxilioTransporte) + num(b.auxilioRodamiento);
  const carga = salario * num(b.cargaPrestacionalPct);
  return {
    ...b,
    totalSalarios: total ? dosDecimales(total) : '',
    cargaPrestacional: carga ? dosDecimales(carga) : '',
    costoTotal: total || carga ? dosDecimales(total + carga) : '',
  };
};

const VACIO: Borrador = {
  estado: 'ACTIVO', tipoContrato: '', ubicacion: '', empresaProyecto: '',
  identificacion: '', nombre: '', cargo: '', area: '',
  operacionFge: '', centroCosto: '', tipoGasto: '',
  fechaIngreso: '', escalafon: '', formacionProfesional: '',
  salario: '', auxilioTransporte: '', auxilioRodamiento: '', totalSalarios: '',
  polizaFuneraria: '', fspModo: '', aportaSalud: true, aportaPension: true,
  fechaSalida: '', banco: '', cuenta: '', tipoCuenta: '',
  tipoId: '', nombres: '', apellidos: '',
  cargaPrestacionalPct: '', cargaPrestacional: '', costoTotal: '',
  anioVigencia: new Date().getFullYear(), observaciones: '',
};

export default function PersonalListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ThPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [area, setArea] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);

  /** null = el formulario está cerrado. */
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setRows(await talentoHumanoService.listPersonal());
    } catch {
      toast.error('No se pudo cargar el personal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  /** Las listas de sugerencias salen de lo que ya está cargado, no de un catálogo. */
  const valoresDe = (campo: keyof ThPersona) =>
    [...new Set(rows.map((r) => String(r[campo] ?? '').trim()).filter(Boolean))].sort();

  const areas = useMemo(() => valoresDe('area'), [rows]);
  const ubicaciones = useMemo(() => valoresDe('ubicacion'), [rows]);
  const contratos = useMemo(() => valoresDe('tipoContrato'), [rows]);
  const empresas = useMemo(() => valoresDe('empresaProyecto'), [rows]);
  const escalafones = useMemo(() => valoresDe('escalafon'), [rows]);
  const cargos = useMemo(() => valoresDe('cargo'), [rows]);
  const formaciones = useMemo(() => valoresDe('formacionProfesional'), [rows]);
  /*
   * EPS, AFP, ARL y CCF se sugieren de lo que ya está escrito y no de una lista fija: son
   * un puñado de entidades, pero cambian de nombre —y de dueño— cada tanto, y una lista
   * fija en el código obligaría a un despliegue cada vez que una se fusione.
   */
  const epss = useMemo(() => valoresDe('eps'), [rows]);
  const afps = useMemo(() => valoresDe('afp'), [rows]);
  const arls = useMemo(() => valoresDe('arl'), [rows]);
  const ccfs = useMemo(() => valoresDe('ccf'), [rows]);
  /**
   * Los bancos salen del catálogo de Parámetros, no de lo que ya esté escrito en las
   * fichas: el archivo del portal bancario necesita el código de la entidad, y un nombre
   * escrito a mano —«Davivienda», «DAVIVIENDA S.A.»— no lo resuelve. Si el catálogo no
   * carga, se cae a los valores en uso para no dejar el campo muerto.
   */
  const [catalogoBancos, setCatalogoBancos] = useState<ThBanco[]>([]);
  useEffect(() => {
    talentoHumanoService.listBancos().then(setCatalogoBancos).catch(() => setCatalogoBancos([]));
  }, []);
  const enUso = useMemo(() => valoresDe('banco'), [rows]);
  const bancos = useMemo(() => {
    const delCatalogo = catalogoBancos.filter((b) => b.activo).map((b) => b.nombre);
    if (delCatalogo.length === 0) return enUso;
    // Los que ya estén escritos y no estén en el catálogo se dejan en la lista: sacarlos
    // borraría en silencio el banco de esa persona la próxima vez que se guarde su ficha.
    const faltantes = enUso.filter(
      (n) => !delCatalogo.some((c) => c.toUpperCase() === n.toUpperCase()),
    );
    return [...delCatalogo, ...faltantes].sort();
  }, [catalogoBancos, enUso]);

  const sugerido = useMemo(() => partirNombre(borrador?.nombre ?? ''), [borrador?.nombre]);

  /**
   * La fecha de salida solo se pide cuando la persona está inactiva: a un activo no se
   * le ha ido nadie, y el campo vacío en la ficha de todos invita a llenarlo con
   * cualquier cosa.
   */
  const estaInactivo = (borrador?.estado ?? '').trim().toUpperCase().startsWith('INACTIVO');

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return rows
      .filter((r) => (soloActivos ? esActivo(r) : true))
      .filter((r) => (area ? (r.area ?? '').trim() === area : true))
      .filter((r) => !q
        || r.nombre.toLowerCase().includes(q)
        || r.identificacion.toLowerCase().includes(q)
        || (r.cargo ?? '').toLowerCase().includes(q));
  }, [rows, buscar, area, soloActivos]);

  const activos = useMemo(() => rows.filter(esActivo).length, [rows]);

  const set = <K extends keyof ThPersona>(k: K, v: ThPersona[K]) =>
    setBorrador((p) => (p ? { ...p, [k]: v } : p));

  /** Igual que `set`, pero rehace los tres totales que dependen de lo que cambió. */
  const setCalculado = <K extends keyof ThPersona>(k: K, v: ThPersona[K]) =>
    setBorrador((p) => (p ? recalcular({ ...p, [k]: v }) : p));

  const guardar = async () => {
    if (!borrador) return;
    if (!borrador.identificacion?.trim() || !borrador.nombre?.trim()) {
      toast.error('La identificación y el nombre son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      // Los vacíos van como null: una cadena vacía en una columna `date` la rechaza
      // Postgres, y en una `numeric` entraría como cero, que no es lo mismo que «no sé».
      const limpio: Record<string, unknown> = {};
      Object.entries(borrador).forEach(([k, v]) => { limpio[k] = v === '' ? null : v; });

      if (borrador.personaId) {
        await talentoHumanoService.updatePersona(borrador.personaId, limpio);
        toast.success('Persona actualizada');
      } else {
        await talentoHumanoService.createPersona(limpio);
        toast.success('Persona agregada');
      }
      setBorrador(null);
      await cargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Exporta a Excel lo que está en pantalla (respeta buscador, área y «solo
   * activos»), con las mismas columnas de la tabla. Los pesos van como número
   * para poder sumarlos; fechas y porcentajes, como texto tal como se ven.
   */
  const exportarExcel = async () => {
    if (visibles.length === 0) {
      toast.error('No hay filas para exportar');
      return;
    }
    const txt = (v: unknown): XlsxCell => ({ v: v == null || v === '' ? null : String(v), s: 'text' });
    const money = (v: string | number | null | undefined): XlsxCell => {
      const x = Number(v ?? 0);
      return { v: Number.isFinite(x) && x !== 0 ? Math.round(x) : null, s: 'money' };
    };
    const int = (v: number | null | undefined): XlsxCell => ({ v: v == null ? null : v, s: 'qty' });
    const num1c = (v: number | null | undefined): XlsxCell => ({ v: v == null || v === 0 ? null : v, s: 'num1' });
    const fchaX = (iso: string | null | undefined): XlsxCell => { const s = fecha(iso ?? null); return txt(s === '—' ? '' : s); };
    const pctX = (v: string | null | undefined): XlsxCell => { const s = pct(v ?? null); return txt(s === '—' ? '' : s); };

    const encabezados = [
      'Nombre', 'Identificación', 'Estado', 'Cargo', 'Área', 'Edad', 'Sexo', 'Estado civil', 'Hijos',
      'Correo', 'Contrato', 'Ingreso', 'Fecha de retiro', 'Firmado', 'Otrosí', 'Ubicación',
      'Empresa o proyecto', 'Operación/FGE', 'Centro de costo', 'Tipo de gasto', 'Escalafón', 'Formación',
      'Salario', 'Aux. transporte', 'Aux. rodamiento', 'Total salarios', 'Póliza funeraria', 'FSP',
      'Salud', 'Pensión', 'Banco', 'Cuenta', 'Tipo de cuenta', 'Fecha de salida', 'EPS', 'AFP', 'ARL',
      'CCF', 'Clase de riesgo', 'Tarifa ARL', 'Alturas', 'Vac. pendientes', 'Días incap.', 'Días permiso',
      '% carga', 'Carga prestacional', 'Costo total', 'Año', 'Observaciones',
    ];

    const filas: XlsxRow[] = [
      encabezados.map((v) => ({ v, s: 'header' as const })),
      ...visibles.map((p): XlsxRow => [
        txt(p.nombre),
        txt(p.identificacion),
        txt((p.estado ?? '').trim()),
        txt(p.cargo),
        txt(p.area),
        int(p.edad),
        txt(p.sexo),
        txt(p.estadoCivil),
        int(p.hijos),
        txt(p.correo),
        txt(p.tipoContrato),
        fchaX(p.fechaIngreso),
        fchaX(p.fechaVencimientoContrato),
        txt(p.contratoFirmado == null ? '' : p.contratoFirmado ? 'Sí' : 'No'),
        txt(p.otroSi),
        txt(p.ubicacion),
        txt(p.empresaProyecto),
        txt(p.operacionFge),
        txt(p.centroCosto),
        txt(p.tipoGasto),
        txt(p.escalafon),
        txt(p.formacionProfesional),
        money(p.salario),
        money(p.auxilioTransporte),
        money(p.auxilioRodamiento),
        money(p.totalSalarios),
        money(p.polizaFuneraria),
        txt(p.fspModo || 'Auto'),
        txt(p.aportaSalud === false ? 'No' : 'Sí'),
        txt(p.aportaPension === false ? 'No' : 'Sí'),
        txt(p.banco),
        txt(p.cuenta),
        txt(p.tipoCuenta),
        fchaX(p.fechaSalida),
        txt(p.eps),
        txt(p.afp),
        txt(p.arl),
        txt(p.ccf),
        txt(p.claseRiesgo),
        pctX(p.nivelRiesgo),
        txt(p.trabajoAltura),
        int(p.diasVacacionesPendientes),
        num1c(p.diasIncapacidad),
        num1c(p.diasPermiso),
        pctX(p.cargaPrestacionalPct),
        money(p.cargaPrestacional),
        money(p.costoTotal),
        int(p.anioVigencia),
        txt(p.observaciones),
      ]),
    ];
    const anchos = [
      30, 14, 10, 26, 18, 6, 12, 14, 6, 26, 18, 12, 12, 9, 20, 16, 18, 14, 12, 14, 14, 18,
      14, 14, 14, 14, 14, 8, 7, 7, 16, 18, 12, 12, 14, 14, 14, 14, 10, 10, 10, 10, 10, 10,
      10, 16, 16, 8, 30,
    ];
    try {
      const blob = await buildXlsxBlob('Personal', filas, anchos);
      downloadBlob(blob, `Personal_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error('No se pudo generar el Excel');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano')} title="Volver a Talento Humano">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Users className="w-5 h-5 text-[hsl(var(--canalco-primary))]" /> Personal
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {loading ? 'Cargando…' : `${activos} activos de ${rows.length} registros`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={exportarExcel}
            disabled={loading || visibles.length === 0}
            className="gap-2"
            title="Exportar a Excel lo que está en pantalla"
          >
            <Download className="w-4 h-4" /> Exportar a Excel
          </Button>
          <Button
            onClick={() => setBorrador({ ...VACIO })}
            className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
          >
            <Plus className="w-4 h-4" /> Agregar persona
          </Button>
        </div>

        {/* Filtros */}
        <div className="max-w-[1800px] mx-auto px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-grow min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-400))]" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Nombre, cédula o cargo"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md outline-none focus:border-[hsl(var(--canalco-primary))]"
            />
          </div>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md px-2 py-1.5 bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            onClick={() => setSoloActivos((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              soloActivos
                ? 'bg-[hsl(var(--canalco-primary))] text-white border-[hsl(var(--canalco-primary))]'
                : 'bg-white text-[hsl(var(--canalco-neutral-700))] border-[hsl(var(--canalco-neutral-300))] hover:bg-[hsl(var(--canalco-neutral-100))]'
            }`}
          >
            Solo activos
          </button>
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">
            {visibles.length} en pantalla
          </span>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Formulario. Se abre sobre el listado, como en incapacidades. */}
        {borrador && (
          <section className="mb-6 bg-white border border-[hsl(var(--canalco-primary))] rounded-xl shadow-md overflow-hidden">
            <header className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))] px-5 py-2.5 flex items-center gap-3">
              <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))] flex-grow">
                {borrador.personaId ? `Editar a ${borrador.nombre}` : 'Agregar persona'}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setBorrador(null)} title="Cerrar">
                <X className="w-4 h-4" />
              </Button>
            </header>

            <div className="p-5 space-y-5">
              {/* Quién es */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3">
                <Campo label="Identificación *" value={borrador.identificacion ?? ''} onChange={(v) => set('identificacion', v)} />
                <Selector
                  label="Tipo de documento"
                  value={borrador.tipoId ?? ''}
                  opciones={TIPOS_ID}
                  onChange={(v) => set('tipoId', v)}
                  vacio="CC"
                  nota="Solo lo pide el archivo del banco."
                />
                <Campo label="Nombre *" value={borrador.nombre ?? ''} onChange={(v) => set('nombre', v)} ancho="md:col-span-2" />
                <Selector label="Estado" value={borrador.estado ?? ''} opciones={ESTADOS} onChange={(v) => set('estado', v)} />

                <Campo
                  label="Fecha de nacimiento"
                  value={borrador.fechaNacimiento ?? ''}
                  onChange={(v) => set('fechaNacimiento', v)}
                  tipo="date"
                  nota="La edad se calcula sola: guardarla la dejaría vieja al año siguiente."
                />
                <Campo label="Correo" value={borrador.correo ?? ''} onChange={(v) => set('correo', v)} tipo="email" />
                <Selector label="Sexo" value={borrador.sexo ?? ''} opciones={SEXOS} onChange={(v) => set('sexo', v)} />
                <Selector label="Estado civil" value={borrador.estadoCivil ?? ''} opciones={ESTADOS_CIVILES} onChange={(v) => set('estadoCivil', v)} />
                <Campo
                  label="Hijos"
                  value={borrador.hijos ?? ''}
                  onChange={(v) => set('hijos', v === '' ? null : Number(v))}
                  tipo="number"
                  paso="1"
                />

                <CampoSugerido id="lista-cargos" label="Cargo" value={borrador.cargo ?? ''} opciones={cargos} onChange={(v) => set('cargo', v)} ancho="md:col-span-2" />
                <CampoSugerido id="lista-areas" label="Área" value={borrador.area ?? ''} opciones={areas} onChange={(v) => set('area', v)} />
                <CampoSugerido id="lista-escalafon" label="Escalafón" value={borrador.escalafon ?? ''} opciones={escalafones} onChange={(v) => set('escalafon', v)} />
              </div>

              {/* Dónde y con qué contrato */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                <CampoSugerido id="lista-contratos" label="Tipo de contrato" value={borrador.tipoContrato ?? ''} opciones={contratos} onChange={(v) => set('tipoContrato', v)} />
                <Campo label="Fecha de ingreso" value={borrador.fechaIngreso ?? ''} onChange={(v) => set('fechaIngreso', v)} tipo="date" />
                {estaInactivo && (
                  <Campo
                    label="Fecha de salida"
                    value={borrador.fechaSalida ?? ''}
                    onChange={(v) => set('fechaSalida', v)}
                    tipo="date"
                    nota="El último día trabajado, no el día en que se registró la baja."
                  />
                )}
                <Campo
                  label="Fecha de retiro"
                  value={borrador.fechaVencimientoContrato ?? ''}
                  onChange={(v) => set('fechaVencimientoContrato', v)}
                  tipo="date"
                  nota="Solo en término fijo y prestación de servicios. Un indefinido no vence."
                />
                <Selector
                  label="Contrato firmado"
                  value={borrador.contratoFirmado == null ? '' : borrador.contratoFirmado ? 'SÍ' : 'NO'}
                  opciones={['SÍ', 'NO']}
                  onChange={(v) => set('contratoFirmado', v === '' ? null : v === 'SÍ')}
                  vacio="Sin revisar"
                  nota="Vacío es «sin revisar», que no es lo mismo que «sin firmar»."
                />
                <Campo
                  label="Otrosí o modificatorios"
                  value={borrador.otroSi ?? ''}
                  onChange={(v) => set('otroSi', v)}
                  ancho="md:col-span-2"
                  nota="Qué se le cambió al contrato y desde cuándo."
                />
                <CampoSugerido id="lista-ubicaciones" label="Ubicación" value={borrador.ubicacion ?? ''} opciones={ubicaciones} onChange={(v) => set('ubicacion', v)} />
                <CampoSugerido id="lista-empresas" label="Empresa o proyecto" value={borrador.empresaProyecto ?? ''} opciones={empresas} onChange={(v) => set('empresaProyecto', v)} />

                <Campo label="Operación / FGE" value={borrador.operacionFge ?? ''} onChange={(v) => set('operacionFge', v)} />
                <Campo label="Centro de costo" value={borrador.centroCosto ?? ''} onChange={(v) => set('centroCosto', v)} />
                <Campo label="Tipo de gasto" value={borrador.tipoGasto ?? ''} onChange={(v) => set('tipoGasto', v)} />
                <CampoSugerido id="lista-formacion" label="Formación profesional" value={borrador.formacionProfesional ?? ''} opciones={formaciones} onChange={(v) => set('formacionProfesional', v)} />
              </div>

              {/* Remuneración */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                <Campo label="Salario" value={borrador.salario ?? ''} onChange={(v) => setCalculado('salario', v)} tipo="number" />
                <Campo label="Auxilio de transporte" value={borrador.auxilioTransporte ?? ''} onChange={(v) => setCalculado('auxilioTransporte', v)} tipo="number" />
                <Campo label="Auxilio de rodamiento y otros" value={borrador.auxilioRodamiento ?? ''} onChange={(v) => setCalculado('auxilioRodamiento', v)} tipo="number" />
                <CampoPorcentaje label="Carga prestacional" value={borrador.cargaPrestacionalPct ?? ''} onChange={(v) => setCalculado('cargaPrestacionalPct', v)} />

                <CampoCalculado label="Total salarios" value={cop(borrador.totalSalarios ?? '')} nota="Salario + auxilio de transporte + auxilio de rodamiento" />
                <CampoCalculado label="Carga prestacional" value={cop(borrador.cargaPrestacional ?? '')} nota="Salario × % de carga" />
                <CampoCalculado label="Costo total" value={cop(borrador.costoTotal ?? '')} nota="Total salarios + carga prestacional" />
                <Campo label="Año de vigencia" value={borrador.anioVigencia ?? ''} onChange={(v) => set('anioVigencia', v === '' ? null : Number(v))} tipo="number" paso="1" />

                {/* Van con `set` y no con `setCalculado`: son descuentos, no parte del salario. */}
                <Campo
                  label="Póliza funeraria"
                  value={borrador.polizaFuneraria ?? ''}
                  onChange={(v) => set('polizaFuneraria', v)}
                  tipo="number"
                  nota="Cuota mensual. Se descuenta en nómina, en Servicios GrupoRecordar."
                />
                <Selector
                  label="FSP"
                  value={borrador.fspModo ?? ''}
                  opciones={['SI', 'NO']}
                  onChange={(v) => set('fspModo', v)}
                  vacio="Automático (según IBC)"
                  nota="Solo si aporta o no. El valor lo calcula la nómina: 1% del salario por los días."
                />
                <CampoCheck
                  label="Salud"
                  value={borrador.aportaSalud}
                  onChange={(v) => set('aportaSalud', v)}
                  nota="4% del IBC. Desmarcar solo si no cotiza salud por nómina."
                />
                <CampoCheck
                  label="Pensión"
                  value={borrador.aportaPension}
                  onChange={(v) => set('aportaPension', v)}
                  nota="4% del IBC. Al desmarcarla tampoco se le cobra FSP en automático."
                />

                <Campo label="Observaciones" value={borrador.observaciones ?? ''} onChange={(v) => set('observaciones', v)} ancho="md:col-span-3 lg:col-span-4" />
              </div>

              {/* Seguridad social y riesgo */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                <p className="md:col-span-3 lg:col-span-4 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide">
                  Seguridad social y riesgo
                </p>
                <CampoSugerido id="lista-eps" label="EPS" value={borrador.eps ?? ''} opciones={epss} onChange={(v) => set('eps', v)} />
                <CampoSugerido id="lista-afp" label="AFP" value={borrador.afp ?? ''} opciones={afps} onChange={(v) => set('afp', v)} />
                <CampoSugerido id="lista-arl" label="ARL" value={borrador.arl ?? ''} opciones={arls} onChange={(v) => set('arl', v)} />
                <CampoSugerido id="lista-ccf" label="CCF" value={borrador.ccf ?? ''} opciones={ccfs} onChange={(v) => set('ccf', v)} />

                <Selector
                  label="Clase de riesgo"
                  value={borrador.claseRiesgo ?? ''}
                  opciones={CLASES_RIESGO}
                  onChange={(v) => set('claseRiesgo', v)}
                  nota="La clase del decreto 1607, de I a V. No es la tarifa."
                />
                <CampoPorcentaje label="Tarifa ARL" value={borrador.nivelRiesgo ?? ''} onChange={(v) => set('nivelRiesgo', v)} />
                <Selector
                  label="Formación trabajo en alturas"
                  value={borrador.trabajoAltura ?? ''}
                  opciones={TRABAJO_ALTURA}
                  onChange={(v) => set('trabajoAltura', v)}
                />
                <Campo
                  label="Vacaciones pendientes (días)"
                  value={borrador.diasVacacionesPendientes ?? ''}
                  onChange={(v) => set('diasVacacionesPendientes', v === '' ? null : Number(v))}
                  tipo="number"
                  paso="1"
                  nota="A mano mientras el módulo de Vacaciones no tenga la historia. Los días de incapacidad y de permiso sí se calculan solos."
                />
              </div>

              {/* Dónde se le consigna la nómina */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 pt-4 border-t border-[hsl(var(--canalco-neutral-200))]">
                <p className="md:col-span-3 lg:col-span-4 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide">
                  Cuenta para el pago de la nómina
                </p>
                <Selector
                  label="Banco"
                  value={borrador.banco ?? ''}
                  opciones={bancos}
                  onChange={(v) => set('banco', v)}
                  nota={catalogoBancos.length
                    ? 'Del catálogo de Parámetros → Bancos.'
                    : 'El catálogo de bancos no cargó; se listan los que ya están en uso.'}
                />
                {/* Texto y no `number`: hay cuentas que empiezan por cero. */}
                <Campo
                  label="Cuenta"
                  value={borrador.cuenta ?? ''}
                  onChange={(v) => set('cuenta', v)}
                  nota="Se guarda tal cual, con los ceros de la izquierda."
                />
                <Selector
                  label="Tipo de cuenta"
                  value={borrador.tipoCuenta ?? ''}
                  opciones={TIPOS_CUENTA}
                  onChange={(v) => set('tipoCuenta', v)}
                />
                {/*
                  El archivo del banco pide el nombre en dos columnas. Se propone un corte
                  y esto guarda la corrección una sola vez, para no rehacerla cada mes:
                  «CASTILLO JORGE EDUARDO» es un apellido y dos nombres, y «CHAMORRO
                  CARVAJAL CARLOS» son dos apellidos y un nombre — las dos tienen tres
                  palabras y no hay cómo adivinarlo.
                */}
                <Campo
                  label="Apellidos"
                  value={borrador.apellidos ?? ''}
                  onChange={(v) => set('apellidos', v)}
                  nota={borrador.apellidos ? undefined : `Si se deja vacío: ${sugerido.apellidos || '—'}`}
                />
                <Campo
                  label="Nombres"
                  value={borrador.nombres ?? ''}
                  onChange={(v) => set('nombres', v)}
                  nota={borrador.nombres ? undefined : `Si se deja vacío: ${sugerido.nombres || '—'}`}
                />
              </div>
            </div>

            <footer className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-200))] flex items-center gap-3">
              <Button onClick={guardar} disabled={guardando} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
              </Button>
              <Button variant="outline" onClick={() => setBorrador(null)}>Cancelar</Button>
            </footer>
          </section>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-auto shadow-sm max-h-[calc(100vh-13rem)]">
            <table className="w-full text-sm min-w-[2400px]">
              <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))]">
                <tr>
                  <Th fija>Nombre</Th>
                  <Th>Identificación</Th>
                  <Th>Estado</Th>
                  <Th>Cargo</Th>
                  <Th>Área</Th>
                  <Th alinear="right">Edad</Th>
                  <Th>Sexo</Th>
                  <Th>Estado civil</Th>
                  <Th alinear="right">Hijos</Th>
                  <Th>Correo</Th>
                  <Th>Contrato</Th>
                  <Th>Ingreso</Th>
                  <Th>Fecha de retiro</Th>
                  <Th alinear="center">Firmado</Th>
                  <Th>Otrosí</Th>
                  <Th>Ubicación</Th>
                  <Th>Empresa o proyecto</Th>
                  <Th>Operación/FGE</Th>
                  <Th>CC</Th>
                  <Th>Tipo gasto</Th>
                  <Th>Escalafón</Th>
                  <Th>Formación</Th>
                  <Th alinear="right">Salario</Th>
                  <Th alinear="right">Aux. transporte</Th>
                  <Th alinear="right">Aux. rodamiento</Th>
                  <Th alinear="right">Total salarios</Th>
                  <Th alinear="right">Póliza funeraria</Th>
                  <Th alinear="right">FSP</Th>
                  <Th alinear="right">Salud</Th>
                  <Th alinear="right">Pensión</Th>
                  <Th>Banco</Th>
                  <Th>Cuenta</Th>
                  <Th>Tipo de cuenta</Th>
                  <Th>Fecha de salida</Th>
                  <Th>EPS</Th>
                  <Th>AFP</Th>
                  <Th>ARL</Th>
                  <Th>CCF</Th>
                  <Th alinear="center">Clase riesgo</Th>
                  <Th alinear="right">Tarifa ARL</Th>
                  <Th>Alturas</Th>
                  <Th alinear="right">Vac. pendientes</Th>
                  <Th alinear="right">Días incap.</Th>
                  <Th alinear="right">Días permiso</Th>
                  <Th alinear="right">% carga</Th>
                  <Th alinear="right">Carga prestacional</Th>
                  <Th alinear="right">Costo total</Th>
                  <Th alinear="right">Año</Th>
                  <Th>Observaciones</Th>
                  <Th alinear="center">Editar</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.personaId} className="border-t border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-neutral-100))] group">
                    <td className="px-3 py-2 font-medium text-[hsl(var(--canalco-neutral-900))] sticky left-0 z-10 bg-white group-hover:bg-[hsl(var(--canalco-neutral-100))]">
                      {p.nombre}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{p.identificacion}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium rounded px-2 py-0.5 whitespace-nowrap ${
                        esActivo(p) ? 'bg-emerald-50 text-emerald-800' : 'bg-[#eeeef5] text-[#4a4a63]'
                      }`}>
                        {(p.estado ?? '—').trim()}
                      </span>
                    </td>
                    <td className="px-3 py-2">{p.cargo || '—'}</td>
                    <td className="px-3 py-2">{p.area || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.edad ?? '—'}</td>
                    <td className="px-3 py-2">{p.sexo || '—'}</td>
                    <td className="px-3 py-2">{p.estadoCivil || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.hijos ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={p.correo ?? ''}>{p.correo || '—'}</td>
                    <td className="px-3 py-2">{p.tipoContrato || '—'}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fecha(p.fechaIngreso)}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fecha(p.fechaVencimientoContrato)}</td>
                    {/* Vacío es «sin revisar»: se deja en raya, no en «No». */}
                    <td className="px-3 py-2 text-center">
                      {p.contratoFirmado == null ? '—' : p.contratoFirmado ? 'Sí' : 'No'}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={p.otroSi ?? ''}>{p.otroSi || '—'}</td>
                    <td className="px-3 py-2">{p.ubicacion || '—'}</td>
                    <td className="px-3 py-2">{p.empresaProyecto || '—'}</td>
                    <td className="px-3 py-2">{p.operacionFge || '—'}</td>
                    <td className="px-3 py-2">{p.centroCosto || '—'}</td>
                    <td className="px-3 py-2">{p.tipoGasto || '—'}</td>
                    <td className="px-3 py-2">{p.escalafon || '—'}</td>
                    <td className="px-3 py-2">{p.formacionProfesional || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.salario)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.auxilioTransporte)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.auxilioRodamiento)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.totalSalarios)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.polizaFuneraria)}</td>
                    <td className="px-3 py-2 text-right">{p.fspModo || 'Auto'}</td>
                    <td className="px-3 py-2 text-right">{p.aportaSalud === false ? 'No' : 'Sí'}</td>
                    <td className="px-3 py-2 text-right">{p.aportaPension === false ? 'No' : 'Sí'}</td>
                    <td className="px-3 py-2">{p.banco || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{p.cuenta || '—'}</td>
                    <td className="px-3 py-2">{p.tipoCuenta || '—'}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fecha(p.fechaSalida)}</td>
                    <td className="px-3 py-2">{p.eps || '—'}</td>
                    <td className="px-3 py-2">{p.afp || '—'}</td>
                    <td className="px-3 py-2">{p.arl || '—'}</td>
                    <td className="px-3 py-2">{p.ccf || '—'}</td>
                    <td className="px-3 py-2 text-center">{p.claseRiesgo || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(p.nivelRiesgo)}</td>
                    <td className="px-3 py-2">{p.trabajoAltura || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.diasVacacionesPendientes ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title="Registrados este año en Incapacidades">
                      {dias(p.diasIncapacidad)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title="Este año en Ausentismos. Las horas sueltas cuentan como días de ocho.">
                      {dias(p.diasPermiso)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(p.cargaPrestacionalPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(p.cargaPrestacional)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(p.costoTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.anioVigencia ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate text-[hsl(var(--canalco-neutral-600))]" title={p.observaciones ?? ''}>
                      {p.observaciones || '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setBorrador({ ...p })}
                        title={`Editar a ${p.nombre}`}
                        className="text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-primary))]"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={24} className="px-3 py-10 text-center text-[hsl(var(--canalco-neutral-500))]">
                      {rows.length === 0
                        ? 'La base de personal está vacía. Falta importarla.'
                        : 'Nadie coincide con los filtros.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
