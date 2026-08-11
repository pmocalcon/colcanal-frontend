import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Printer, Eraser, Save, Loader2, Clock, AlertTriangle, History, FileText, ShieldCheck, GitBranch, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  ESTADOS, estadoLabel, estadoBadgeClass, accionesDisponibles, calcularSla,
  documentosConAccion, DOCUMENTO_LABEL,
  ROLES_ADMINISTRATIVA, ROLES_JURIDICA,
  type JuridicaEstado,
} from '@/utils/juridicaWorkflow';
import { esRolPmo } from '@/utils/rolesPmo';
import {
  TIPOS_CONTRATO, habilitantesPara,
  TIPOS_REQUISICION, tipoRequisicionDe, getTipoRequisicion,
  AMPAROS, MATRIZ_GARANTIAS, REGIMEN_GARANTIAS,
  vencimientoDe, DIAS_ALERTA_VENCIMIENTO, ESTADOS_CONTRATO_VIGENTE,
  type ExigenciaClase,
} from '@/config/juridicaContratos';
import { EMPRESAS, getEmpresa } from '@/config/empresasCentroCosto';
import {
  RequisicionPersonalCuerpo, prellenarRequisicion, type RequisicionState,
} from '@/components/juridica/requisicionPersonalDoc';
import { TabsDocumentos, rutaDocumento } from '@/components/juridica/TabsDocumentos';
import { valorEnLetras, formatearMiles } from '@/utils/numeroALetras';

/**
 * Formato GTH-002-F · "Solicitud de prestación de servicios, alquiler, obra y/o suministro"
 * (G. jurídica del módulo Gestión del conocimiento).
 *
 * Se diligencia en pantalla, se guarda en el sistema (una fila por solicitud, el cuerpo
 * va en `data` jsonb) y se imprime / exporta a PDF. Ruta nueva: `.../juridica/nueva`;
 * edición: `.../juridica/:id`.
 */

const GESTION = 'juridica';
const FORMATO = 'GTH-002-F';

interface FormState {
  dia: string; mes: string; anio: string;
  empresa: string;
  contratista: string;
  tipoPersona: string; // 'natural' | 'juridica'
  centroCosto: string;
  objetoProyecto: string;
  alcanceServicio: string;
  actividades: string;
  productos: string;
  garantias: string;
  experiencia: string;
  perfil: string;
  duracion: string; fechaInicio: string; fechaTerminacion: string;
  honorarios: string; honorariosLetras: string; formaPago: string;
  herrComputador: boolean; herrCorreo: boolean; herrPuesto: boolean; accesos: string;
  sugNombre: string; sugTelefono: string; sugCorreo: string;
  modContrato: boolean; modOrdenServicio: boolean;
  tipoContrato: string;
  /** Cuál de los dos formatos de requisición rige (ver `tipoRequisicionDe`). */
  tipoRequisicion: string;
  /**
   * Cuerpo del GTH-001-F cuando el trámite va por requisición de personal. `null`
   * mientras nadie lo toque: así se sigue derivando de la solicitud —fechas,
   * remuneración, herramientas— en vez de congelar un prellenado que quedó viejo.
   */
  requisicionPersonal: RequisicionState | null;
  solicitadoNombre: string; solicitadoCargo: string;
  autorizadoNombre: string; autorizadoCargo: string;
  aprobadoNombre: string; aprobadoCargo: string;
}

const EMPTY: FormState = {
  dia: '', mes: '', anio: '',
  empresa: '',
  contratista: '',
  tipoPersona: '',
  centroCosto: '',
  objetoProyecto: '', alcanceServicio: '', actividades: '', productos: '', garantias: '',
  experiencia: '', perfil: '',
  duracion: '', fechaInicio: '', fechaTerminacion: '',
  honorarios: '', honorariosLetras: '', formaPago: '',
  herrComputador: false, herrCorreo: false, herrPuesto: false, accesos: '',
  sugNombre: '', sugTelefono: '', sugCorreo: '',
  modContrato: false, modOrdenServicio: false,
  tipoContrato: '',
  tipoRequisicion: '',
  requisicionPersonal: null,
  solicitadoNombre: '', solicitadoCargo: '',
  autorizadoNombre: '', autorizadoCargo: '',
  aprobadoNombre: '', aprobadoCargo: '',
};

export default function SolicitudPrestacionServiciosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  // "nueva" o ausente → creación; un id numérico → edición.
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<FormState>(EMPTY);
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState<boolean>(solicitudId !== null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  // El formato solo se edita en borrador (o cuando es nuevo).
  const estado = sol?.estado ?? 'borrador';
  const locked = solicitudId !== null && estado !== 'borrador';

  // Con qué formato arranca este trámite. Lo elige quien lo abre; mientras no elija,
  // lo propone el tipo de contrato. No depende de la etapa: la requisición va antes
  // que todo lo demás —pide 15 días de anticipación— y se abre desde el borrador.
  const tipoReq = tipoRequisicionDe(f.tipoRequisicion, f.tipoContrato);
  // Mientras nadie escriba en el GTH-001-F se deriva de lo que ya tiene la solicitud;
  // al primer cambio pasa a mandar lo escrito.
  const requisicion = f.requisicionPersonal ?? prellenarRequisicion(f);

  // Qué documento está habilitado en cada etapa se decide en `TabsDocumentos`: la misma
  // barra se pinta en las seis pantallas del trámite y la regla tiene que ser una sola.

  // Empresa seleccionada → centro de costo. Si solo tiene un centro, se autocompleta;
  // Canales & Contactos tiene varios (uno por proyecto) y se elige aparte.
  const empresaSel = getEmpresa(f.empresa);
  const handleEmpresa = (nombre: string) => {
    const emp = getEmpresa(nombre);
    setF((prev) => ({
      ...prev,
      empresa: nombre,
      centroCosto: emp && emp.centros.length === 1 ? emp.centros[0].code : '',
    }));
  };

  // La duración sale de las fechas, pero no pisa lo que se escriba a mano: solo llena el
  // campo vacío o reemplaza el valor que puso el propio cálculo.
  const duracionAuto = useRef('');
  useEffect(() => {
    if (locked) return;
    const calculada = duracionEntre(f.fechaInicio, f.fechaTerminacion);
    if (!calculada) return;
    // El valor anterior se lee ANTES de setF: el updater corre después, y para entonces
    // el ref ya tendría el valor nuevo, con lo que la comparación nunca daría verdadera
    // y el campo se quedaría congelado en el primer cálculo.
    const previo = duracionAuto.current;
    setF((p) => (p.duracion.trim() === '' || p.duracion === previo
      ? { ...p, duracion: calculada }
      : p));
    duracionAuto.current = calculada;
  }, [f.fechaInicio, f.fechaTerminacion, locked]);

  // Mismo trato para el valor en letras: se deriva del número y cede ante lo escrito.
  const letrasAuto = useRef('');
  useEffect(() => {
    if (locked) return;
    const calculado = valorEnLetras(f.honorarios);
    if (!calculado) return;
    const previo = letrasAuto.current;
    setF((p) => (p.honorariosLetras.trim() === '' || p.honorariosLetras === previo
      ? { ...p, honorariosLetras: calculado }
      : p));
    letrasAuto.current = calculado;
  }, [f.honorarios, locked]);

  // Carga la solicitud existente al editar.
  useEffect(() => {
    if (solicitudId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (!cancelled) {
          setSol(data);
          const guardado = { ...EMPTY, ...(data.data as Partial<FormState> | null) };
          // Las solicitudes anteriores al punto de miles traen el valor sin agrupar.
          setF({ ...guardado, honorarios: formatearMiles(guardado.honorarios) });
        }
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const [pagoPolizaAbierto, setPagoPolizaAbierto] = useState(false);

  const reload = async () => {
    if (solicitudId === null) return;
    try { setSol(await gestionConocimientoService.get(solicitudId)); } catch { /* noop */ }
  };

  const handleTransition = async (accion: string, requiereMotivo?: boolean, data?: Record<string, any>) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;            // canceló
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    // El pago de la póliza no se confirma con un botón suelto: pide los datos de la
    // garantía primero (ver PagoPolizaDialog).
    if (accion === 'pagar_polizas' && !data) { setPagoPolizaAbierto(true); return; }
    try {
      await gestionConocimientoService.transition(solicitudId!, { accion, motivo, data });
      toast.success('Acción registrada');
      setPagoPolizaAbierto(false);
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    }
  };

  const handleResolverPoliza = async (decision: 'aprobar' | 'rechazar') => {
    let comentario: string | undefined;
    if (decision === 'rechazar') {
      const m = window.prompt('Motivo del rechazo de la póliza:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      comentario = m.trim();
    }
    try {
      await gestionConocimientoService.resolverPoliza(solicitudId!, { decision, comentario });
      toast.success(decision === 'aprobar' ? 'Póliza aprobada' : 'Póliza rechazada');
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo resolver la póliza');
    }
  };

  /**
   * Pide la RQ de la póliza cuando el flujo ya pasó de "Contrato firmado". No mueve
   * el estado: solo crea la requisición en Compras y la deja enlazada.
   */
  const handleSolicitarPoliza = async () => {
    if (!window.confirm('Se creará la requisición de la póliza en Gestión de Compras. ¿Continuar?')) return;
    try {
      const actualizada = await gestionConocimientoService.solicitarRequisicionPoliza(solicitudId!);
      const nro = actualizada?.data?.requisicionPoliza?.requisitionNumber;
      toast.success(nro ? `Requisición de póliza creada · ${nro}` : 'Requisición de póliza creada');
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo crear la requisición de la póliza');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (solicitudId === null) {
        const creada = await gestionConocimientoService.create({ gestion: GESTION, formato: FORMATO, data: f });
        toast.success('Solicitud guardada');
        // Pasa a modo edición sin perder el "atrás".
        navigate(`/dashboard/gestion-conocimiento/juridica/${creada.solicitudId}`, { replace: true });
      } else {
        await gestionConocimientoService.update(solicitudId, { data: f });
        toast.success('Solicitud actualizada');
      }
    } catch {
      toast.error('No se pudo guardar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#16162b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Estilos de impresión: solo el documento, tamaño carta. */}
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { background: #fff !important; }

          /* Se imprime el formato y nada más. En vez de ir marcando con
             \`no-print\` lo que sobra —donde cualquier bloque nuevo se cuela por
             olvido, y lo que se monta fuera de esta página, como los toasts, no
             se puede marcar—, se oculta todo salvo el formato, sus ancestros y
             su contenido. */
          body :not(:has(.doc)):not(.doc):not(.doc *) { display: none !important; }

          /* Los ancestros siguen visibles porque contienen el formato, pero no
             deben aportar caja propia: el ancho máximo, el relleno del main y el
             alto mínimo de pantalla desplazarían el documento o agregarían una
             página en blanco al final. */
          body :has(.doc) {
            display: block !important;
            margin: 0 !important; padding: 0 !important; border: 0 !important;
            max-width: none !important; width: auto !important;
            min-height: 0 !important; background: transparent !important;
            box-shadow: none !important;
          }

          .no-print { display: none !important; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones (no se imprime) */}
      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3">
          {/* Fila 1: navegación, título/estado y acciones principales */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica')} title="Volver a las solicitudes">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-grow min-w-0">
              <h1 className="text-lg font-bold text-[#16162b] truncate">
                {tipoReq === 'personal' ? 'Requisición de personal' : 'Solicitud de prestación de servicios'}
              </h1>
              <div className="text-xs text-[#4a4a63] flex items-center gap-2 flex-wrap">
                <span>
                  G. jurídica · Formato {getTipoRequisicion(tipoReq).formato}
                  {solicitudId !== null ? ` · N.º ${solicitudId}` : ' · Nueva'}
                </span>
                {solicitudId !== null && (
                  <span className={`inline-block text-[11px] font-medium rounded px-2 py-0.5 ${estadoBadgeClass(estado)}`}>
                    {estadoLabel(estado)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
              {!locked && (
                <Button variant="outline" onClick={() => setF(EMPTY)} className="gap-2">
                  <Eraser className="w-4 h-4" /> Limpiar
                </Button>
              )}
              <Button onClick={() => window.print()} className={`gap-2 ${UI.primario}`}>
                <Printer className="w-4 h-4" /> Imprimir / PDF
              </Button>
              {!locked && (
                <Button onClick={handleSave} disabled={saving} className={`gap-2 ${UI.primario}`}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                </Button>
              )}
            </div>
          </div>

          {/* Fila 2: con qué formato arranca el trámite. Va arriba de los documentos
              porque es lo que decide cuál de los dos se diligencia. */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#e6e6f0] flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#4a4a63] mr-1">
              Tipo de requisición
            </span>
            <select
              value={tipoReq}
              disabled={locked}
              onChange={(e) => set('tipoRequisicion', e.target.value)}
              className="text-sm border border-[#c9c9dc] rounded-md px-2 py-1.5 bg-white text-[#16162b] min-w-[22rem] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {TIPOS_REQUISICION.map((t) => (
                <option key={t.key} value={t.key}>{t.nombre} ({t.formato})</option>
              ))}
            </select>
            {!f.tipoRequisicion && (
              <span className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
                propuesto por el tipo de contrato; queda fijo al guardar
              </span>
            )}
          </div>

          {/* Fila 3: documentos del contrato, como pestañas. Solo con la solicitud
              guardada: todas navegan a subdocumentos suyos.
              La requisición de personal no va acá: no es un documento aparte del
              trámite sino el cuerpo del formato, y se diligencia en esta misma página
              cuando el tipo de requisición es «personal».
              El `-mb-3` come el relleno inferior de la cabecera para que el riel de las
              pestañas caiga sobre su borde y no queden dos líneas. */}
          {solicitudId !== null && (
            <div className="mt-3 -mb-3">
              <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="solicitud" />
            </div>
          )}
        </div>
      </header>

      {/* Documento */}
      {/* Dos anchos: el formato conserva el suyo —es una hoja carta y estirarlo lo
          deformaría—, y lo que se consulta alrededor (el flujo y los cuadros de
          política) va más ancho, que es lo que necesita la matriz de garantías para
          caber sin desplazarse. */}
      <main className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {sol && (
          <WorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={sol.createdBy === user?.userId}
            onAccion={handleTransition}
            onResolverPoliza={handleResolverPoliza}
            onSolicitarPoliza={handleSolicitarPoliza}
          />
        )}

        <PagoPolizaDialog
          abierto={pagoPolizaAbierto}
          onCerrar={() => setPagoPolizaAbierto(false)}
          onConfirmar={(data) => void handleTransition('pagar_polizas', false, data)}
        />
        {/* Cuadros de referencia: van entre el historial y el formato porque no son
            documentos de la solicitud —no se generan ni se firman—, sino la política
            que se consulta mientras se diligencia. Fuera del fieldset, así se leen
            también cuando la solicitud ya está bloqueada, y con `no-print`, para que no
            se cuelen en el PDF del formato. */}
        {/* Lado a lado desde `xl`: la matriz de garantías es de siete columnas y la de
            documentos de tres, así que se reparten 3/2 en vez de mitad y mitad —a
            mitades, la matriz viviría desplazándose en horizontal—. Por debajo de `xl`
            no caben dos tablas y vuelven a apilarse. `items-start` para que la más
            corta no se estire hasta el alto de la otra. */}
        <div className="mb-6 grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
          <div className="xl:col-span-2">
            <DocumentosCuadro tipoPersona={f.tipoPersona} />
          </div>
          <div className="xl:col-span-3">
            <GarantiasCuadro />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        <fieldset disabled={locked} className="border-0 m-0 p-0 min-w-0">
        <div className="doc bg-white border border-[#0a2a52] mx-auto text-[13px] text-black shadow-md">

          {/* Encabezado con logos y código */}
          <div className="grid grid-cols-[130px_1fr_130px] border-b border-[#0a2a52]">
            <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-16 object-contain" />
            </div>
            {/* El título y el código son los del formato que se esté diligenciando: un
                GTH-001-F impreso bajo el encabezado del GTH-002-F sería otro documento. */}
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[15px] text-black border-r border-[#0a2a52]">
              {tipoReq === 'personal'
                ? 'SOLICITUD DE REQUISICIÓN DE PERSONAL'
                : 'SOLICITUD DE PRESTACIÓN DE SERVICIOS, ALQUILER, OBRA Y/O SUMINISTRO'}
            </div>
            <div className="grid grid-rows-[auto_1fr] min-w-0">
              <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain" />
              </div>
              <div className="grid grid-cols-[auto_1fr] text-[11px]">
                <CodeCell label="Código" value={tipoReq === 'personal' ? 'GTH-001-F' : 'GTH-002-F'} />
                <CodeCell label="Fecha" value={tipoReq === 'personal' ? '19/04/2023' : '25/07/2023'} />
                <CodeCell label="Versión" value={tipoReq === 'personal' ? '1' : '2'} last />
              </div>
            </div>
          </div>

          {/* Izq.: Fecha + Tipo de persona · Der.: Centro de costo / Contratante / Contratista */}
          <div className="grid grid-cols-2 border-b border-[#0a2a52]">
            <div className="border-r border-[#0a2a52] flex flex-col">
              <div>
                <BandTitle>FECHA DE LA SOLICITUD</BandTitle>
                <div className="grid grid-cols-3 text-center">
                  <DateBox label="DIA" value={f.dia} onChange={(v) => set('dia', v)} />
                  <DateBox label="MES" value={f.mes} onChange={(v) => set('mes', v)} />
                  <DateBox label="AÑO" value={f.anio} onChange={(v) => set('anio', v)} last />
                </div>
              </div>
              {/* Tipo de persona: modifica los ítems de la lista de chequeo. */}
              <div className="grid grid-cols-[130px_1fr] border-t border-[#0a2a52] flex-grow">
                <MiniLabel>TIPO DE PERSONA</MiniLabel>
                <div className="px-2 py-1.5 min-w-0 flex items-center">
                  <select
                    value={f.tipoPersona}
                    onChange={(e) => set('tipoPersona', e.target.value)}
                    className="w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5"
                  >
                    <option value="">— Selecciona —</option>
                    <option value="natural">Natural</option>
                    <option value="juridica">Jurídica</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-rows-3">
              {/* Centro de costo: se autocompleta con el código del contratante. */}
              <div className="grid grid-cols-[110px_1fr] border-b border-[#0a2a52]">
                <MiniLabel>CENTRO DE COSTO</MiniLabel>
                <div className="px-2 py-1.5 min-w-0">
                  {empresaSel && empresaSel.centros.length > 1 ? (
                    // Canales & Contactos: el código depende del proyecto.
                    <select
                      value={f.centroCosto}
                      onChange={(e) => set('centroCosto', e.target.value)}
                      className="w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5"
                    >
                      <option value="">— Selecciona el proyecto —</option>
                      {empresaSel.centros.map((c) => (
                        <option key={c.code} value={c.code}>{c.proyecto} — {c.code}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-[12px] py-0.5 min-h-[1.5em]">
                      {f.centroCosto || (
                        <span className="italic text-[hsl(var(--canalco-neutral-400))]">
                          Se completa al elegir el contratante
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Contratante: define el centro de costo. */}
              <div className="grid grid-cols-[110px_1fr] border-b border-[#0a2a52]">
                <MiniLabel>CONTRATANTE</MiniLabel>
                <div className="px-2 py-1.5 min-w-0">
                  <select
                    value={f.empresa}
                    onChange={(e) => handleEmpresa(e.target.value)}
                    className="w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5"
                  >
                    <option value="">— Selecciona el contratante —</option>
                    {EMPRESAS.map((emp) => (
                      <option key={emp.companyId} value={emp.nombre}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Contratista: se escribe libremente. */}
              <div className="grid grid-cols-[110px_1fr]">
                <MiniLabel>CONTRATISTA</MiniLabel>
                <div className="px-2 py-1.5 min-w-0">
                  <FieldInput value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="Nombre del contratista" />
                </div>
              </div>
            </div>
          </div>

          {/* Tipo de contrato: define los documentos requeridos y la lista de chequeo. */}
          <div className="grid grid-cols-[220px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Tipo de contrato</LabelCell>
            <div className="px-2 py-1.5">
              <select
                value={f.tipoContrato}
                onChange={(e) => set('tipoContrato', e.target.value)}
                className="w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5"
              >
                <option value="">— Selecciona el tipo de contrato —</option>
                {TIPOS_CONTRATO.map((t) => (
                  <option key={t.key} value={t.key}>{t.nombre}</option>
                ))}
              </select>

              {/* Los documentos necesarios se consultan desde el botón «Documentos
                  necesarios» de la barra superior, en una ventana aparte. */}
            </div>
          </div>

          {/* De aquí abajo cambia el formato. Lo de arriba —fecha, centro de costo,
              contratante, contratista, tipo de persona y tipo de contrato— es común a
              los dos y lo necesita el resto del trámite (lista de chequeo, contrato,
              consecutivo), así que no se reemplaza. */}
          {tipoReq === 'personal' && (
            <RequisicionPersonalCuerpo
              value={requisicion}
              onChange={(v) => set('requisicionPersonal', v)}
              /* Las firmas salen de la solicitud en vivo, no de lo guardado en el
                 formato: el flujo las estampa después de que la requisición ya está
                 escrita, y una copia se quedaría en blanco para siempre. */
              firmas={f}
            />
          )}

          {tipoReq === 'servicios' && (
          <>
          {/* 1. Alcance del servicio a contratar */}
          <SectionTitle>1. ALCANCE DEL SERVICIO A CONTRATAR</SectionTitle>
          <RowField label="Objeto del proyecto" value={f.objetoProyecto} onChange={(v) => set('objetoProyecto', v)} placeholder="Aclarar la empresa por la cual se va a contratar" />
          <RowField label="Objeto y/o alcance del servicio a contratar" value={f.alcanceServicio} onChange={(v) => set('alcanceServicio', v)} area />
          <RowField label="Actividades a desarrollar" value={f.actividades} onChange={(v) => set('actividades', v)} area />
          <RowField label="Productos a entregar" value={f.productos} onChange={(v) => set('productos', v)} area />
          <RowField label="Garantías (si aplica definir alcance)" value={f.garantias} onChange={(v) => set('garantias', v)} area />

          {/* 2. Especificaciones del servicio */}
          <SectionTitle>2. ESPECIFICACIONES DEL SERVICIO</SectionTitle>
          <RowField label="Experiencia requerida" value={f.experiencia} onChange={(v) => set('experiencia', v)} area />
          <RowField label="Perfil requerido" value={f.perfil} onChange={(v) => set('perfil', v)} area />

          {/* Duración / fechas */}
          <div className="grid grid-cols-[220px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Duración del servicio</LabelCell>
            <div className="grid grid-cols-3">
              <div className="border-r border-[#0a2a52]">
                <div className="px-2 pt-1 text-[10px] italic text-[hsl(var(--canalco-neutral-500))]">Cantidad en años, meses y/o días</div>
                <div className="px-2 pb-1"><FieldInput value={f.duracion} onChange={(v) => set('duracion', v)} /></div>
              </div>
              <div className="border-r border-[#0a2a52]">
                <div className="px-2 pt-1 text-[11px] font-semibold text-center">Fecha de inicio</div>
                <div className="px-2 pb-1"><FieldInput value={f.fechaInicio} onChange={(v) => set('fechaInicio', v)} placeholder="DD/MM/AAAA" center /></div>
              </div>
              <div>
                <div className="px-2 pt-1 text-[11px] font-semibold text-center">Fecha de terminación</div>
                <div className="px-2 pb-1"><FieldInput value={f.fechaTerminacion} onChange={(v) => set('fechaTerminacion', v)} placeholder="DD/MM/AAAA" center /></div>
              </div>
            </div>
          </div>

          {/* Honorarios / forma de pago */}
          <div className="grid grid-cols-[220px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Honorarios y/o valor a pagar</LabelCell>
            <div className="grid grid-cols-2">
              {/* El número arriba; debajo, el valor en letras que se deriva de él. */}
              <div className="border-r border-[#0a2a52] px-2 py-1">
                <MoneyInput value={f.honorarios} onChange={(v) => set('honorarios', v)} placeholder="$ 0" />
                <FieldInput value={f.honorariosLetras} onChange={(v) => set('honorariosLetras', v)} placeholder="VALOR EN LETRAS" />
              </div>
              <div className="px-2 py-1">
                <div className="text-[11px] font-semibold mb-0.5">Forma de pago</div>
                <FieldInput value={f.formaPago} onChange={(v) => set('formaPago', v)} />
              </div>
            </div>
          </div>

          {/* Herramienta de trabajo */}
          <div className="grid grid-cols-[220px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Herramienta de trabajo</LabelCell>
            <div className="px-3 py-2 space-y-2">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <CheckField label="Computador" checked={f.herrComputador} onChange={(v) => set('herrComputador', v)} />
                <CheckField label="Correo electrónico" checked={f.herrCorreo} onChange={(v) => set('herrCorreo', v)} />
                <CheckField label="Puesto de trabajo" checked={f.herrPuesto} onChange={(v) => set('herrPuesto', v)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold whitespace-nowrap">Accesos</span>
                <FieldInput value={f.accesos} onChange={(v) => set('accesos', v)} />
              </div>
            </div>
          </div>

          {/* Empresa o persona natural sugerida */}
          <div className="grid grid-cols-[220px_1fr] border-b border-[#0a2a52]">
            <LabelCell>Empresa o persona natural sugerida</LabelCell>
            <div className="px-3 py-2 space-y-1.5">
              <InlineField label="Nombre" value={f.sugNombre} onChange={(v) => set('sugNombre', v)} />
              <InlineField label="Teléfono" value={f.sugTelefono} onChange={(v) => set('sugTelefono', v)} />
              <InlineField label="Correo" value={f.sugCorreo} onChange={(v) => set('sugCorreo', v)} />
            </div>
          </div>

          {/* 3. Modalidad de contratación */}
          <SectionTitle>3. MODALIDAD DE CONTRATACIÓN (Espacio para ser diligenciado por área jurídica)</SectionTitle>
          <div className="flex flex-wrap items-center gap-x-12 gap-y-2 px-3 py-3 border-b border-[#0a2a52]">
            <CheckField label="Contrato" checked={f.modContrato} onChange={(v) => set('modContrato', v)} />
            <CheckField label="Orden de servicio" checked={f.modOrdenServicio} onChange={(v) => set('modOrdenServicio', v)} />
          </div>

          {/* Autorizaciones */}
          <SectionTitle>AUTORIZACIONES</SectionTitle>
          <div className="grid grid-cols-3">
            <SignatureCell title="Solicitado por" nombre={f.solicitadoNombre} cargo={f.solicitadoCargo}
              hint="Se toma de quien crea la solicitud" />
            <SignatureCell title="Autorizado por" nombre={f.autorizadoNombre} cargo={f.autorizadoCargo}
              hint="Gerencia de Proyectos, al autorizar la solicitud" />
            <SignatureCell title="Aprobado por" nombre={f.aprobadoNombre} cargo={f.aprobadoCargo}
              hint="Gerencia (Dra. Gloria), al firmar la solicitud" last />
          </div>
          <div className="px-3 py-4 text-[12px] border-t border-[#0a2a52]">Vo. Bo. Dirección administrativa</div>
          </>
          )}
        </div>
        </fieldset>

        <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
          {locked
            ? 'La solicitud ya avanzó en el flujo; el formato queda en solo lectura. Usa Imprimir / PDF para exportarla.'
            : 'Usa Guardar para almacenar la solicitud, o Imprimir / PDF para exportarla.'}
        </p>
      </div>
      </main>
    </div>
  );
}

/**
 * Fecha escrita a mano. Acepta DD/MM/AAAA (lo que pide el formato) y AAAA-MM-DD, que es
 * lo que sale de un selector de fecha. Devuelve null si no es una fecha real: el
 * constructor de Date corre el 31/02 a marzo en vez de fallar.
 */
function parseFecha(v: string): Date | null {
  const s = (v ?? '').trim();
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const ymd = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  let d: number, m: number, a: number;
  if (dmy) { d = +dmy[1]; m = +dmy[2]; a = +dmy[3]; }
  else if (ymd) { a = +ymd[1]; m = +ymd[2]; d = +ymd[3]; }
  else return null;
  const fecha = new Date(a, m - 1, d);
  if (fecha.getFullYear() !== a || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return fecha;
}

/**
 * Duración entre dos fechas, en años, meses y días de calendario —no en meses de 30
 * días—: del 1 al 31 de julio es «1 mes», y de enero a diciembre «1 año».
 *
 * Cuenta ambos extremos, que es como se lee un plazo de ejecución: del 1 al 15 son
 * quince días de trabajo, no catorce. Por eso el cálculo va hasta el día siguiente a la
 * terminación.
 */
function duracionEntre(desde: string, hasta: string): string {
  const ini = parseFecha(desde);
  const fin = parseFecha(hasta);
  if (!ini || !fin) return '';
  const limite = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1);
  if (limite <= ini) return '';

  let anios = limite.getFullYear() - ini.getFullYear();
  let meses = limite.getMonth() - ini.getMonth();
  let dias = limite.getDate() - ini.getDate();
  if (dias < 0) {
    meses -= 1;
    // Día 0 del mes del límite = último día del mes anterior, con bisiestos incluidos.
    dias += new Date(limite.getFullYear(), limite.getMonth(), 0).getDate();
  }
  if (meses < 0) { anios -= 1; meses += 12; }

  const partes: string[] = [];
  if (anios) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
  if (meses) partes.push(`${meses} ${meses === 1 ? 'mes' : 'meses'}`);
  if (dias) partes.push(`${dias} ${dias === 1 ? 'día' : 'días'}`);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Colores de la matriz: se exige, no se exige, o depende de algo que define Jurídica. */
/*
 * Tres niveles legibles: el amarillo marca lo que **se exige** —la pastilla lleva la
 * tinta encima, porque `#ffe81a` como letra sobre blanco da 1,2:1 de contraste y no se
 * lee—, lo condicional va en tinta plana y lo que no se exige, apagado.
 *
 * La pastilla es del "Sí" y no de lo condicional: "Sí" es una palabra corta y cabe en
 * una línea, mientras que "Según riesgo" dentro de una pastilla se parte en dos y
 * estira toda la fila.
 *
 * Van sobre un `<span>` dentro de la celda y no sobre la celda: un fondo en el `<td>`
 * pintaría también su relleno y se leería como una fila resaltada, no como un valor.
 */
const EXIGENCIA_CLASS: Record<ExigenciaClase, string> = {
  si: 'inline-block rounded px-1.5 py-0.5 bg-[#ffe81a] text-[#16162b] font-bold',
  condicional: 'text-[#16162b]',
  no: 'text-[#b0b0c4]',
};

/**
 * Matriz general de garantías (política, secciones 10 y 11). Se muestra completa: sus
 * categorías clasifican por naturaleza del objeto (suministro, obra/EPC, arrendamiento)
 * y no coinciden con el catálogo de tipos de contrato, así que el sistema no señala
 * ninguna fila —la clasificación la hace Jurídica al leerla—.
 */
function GarantiasCuadro() {
  return (
    <CuadroConsulta
      icono={<ShieldCheck className="w-4 h-4" />}
      titulo="Matriz general de garantías"
      subtitulo="Qué amparos se exigen según la naturaleza del contrato."
      nota={
        <>
          <p>
            <span className={EXIGENCIA_CLASS.si}>Sí</span> se exige ·{' '}
            <span className={EXIGENCIA_CLASS.condicional}>Si aplica / Según objeto / riesgo / bien</span>{' '}
            lo define la Dirección Jurídica ·{' '}
            <span className={EXIGENCIA_CLASS.no}>No</span> no se exige.
          </p>
          <p className="italic">
            La fila que aplica la determina Jurídica según la naturaleza del objeto
            contratado.
          </p>
        </>
      }
    >
        <div className="space-y-1.5 text-[11px] leading-snug text-[#4a4a63]">
          {REGIMEN_GARANTIAS.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        <div className="overflow-x-auto -mx-5 -mb-5 mt-3">
          {/* Sin ancho mínimo: con uno, la tabla pedía más de lo que la tarjeta le da y
              aparecía la barra de desplazamiento. Prefiere partir «Según objeto» en dos
              líneas —que se lee igual— antes que desplazarse. */}
          <table className={TABLA}>
            <thead>
              <tr className="bg-[#f6f6fa] border-y border-[#e6e6f0]">
                <th className={`${TH} w-[26%] pl-5 text-left`}>Contrato</th>
                {AMPAROS.map((a) => (
                  <th key={a.key} className={`${TH} ${DIV} text-center`}>{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIZ_GARANTIAS.map((fila) => (
                <tr key={fila.key} className={TR}>
                  <td className={`${TD} pl-5 font-semibold text-[#16162b]`}>
                    {fila.contrato}
                  </td>
                  {AMPAROS.map((a) => {
                    const e = fila.amparos[a.key];
                    return (
                      <td key={a.key} className={`${TD} ${DIV} text-center`}>
                        <span className={EXIGENCIA_CLASS[e.clase]}>{e.texto}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </CuadroConsulta>
  );
}

/**
 * Los documentos habilitantes: el mínimo de la política, que depende de la naturaleza
 * del contratista. Los propios del tipo de contrato no se listan aquí —viven en la
 * Lista de chequeo (GA-25-F), que es donde se verifican— para no pedir dos veces el
 * mismo papel en dos pantallas que pueden desincronizarse.
 */
function DocumentosCuadro({ tipoPersona }: { tipoPersona: string }) {
  const habilitantes = habilitantesPara(tipoPersona);
  const personaLabel = tipoPersona === 'natural' ? 'Persona natural'
    : tipoPersona === 'juridica' ? 'Persona jurídica' : null;

  return (
    <CuadroConsulta
      icono={<FileText className="w-4 h-4" />}
      titulo="Documentación requerida"
      subtitulo={
        <>
          {personaLabel ?? 'Sin tipo de persona'} ·{' '}
          <span className="font-medium text-[hsl(var(--canalco-neutral-700))]">Documentos habilitantes</span>
          {' '}· mínimo exigible
        </>
      }
      nota={
        <p className="italic">
          Es un mínimo: la Dirección Jurídica puede pedir más según la naturaleza del
          contratista y el nivel de riesgo.
        </p>
      }
    >
        {!personaLabel && (
          <p className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
            Elige el <b>tipo de persona</b> en el formato: los habilitantes cambian según
            sea natural o jurídica.
          </p>
        )}

        {/* La tabla se pega a los bordes de la tarjeta. Arriba solo cuando no hay aviso
            encima; con `-mt-5` fijo se comería el aviso del tipo de persona. */}
        <div className={'overflow-x-auto -mx-5 -mb-5 ' + (personaLabel ? '-mt-5' : '')}>
          <table className={TABLA}>
            <thead>
              <tr className="bg-[#f6f6fa] text-left border-y border-[#e6e6f0]">
                <th className={`${TH} w-[28%] pl-5`}>Tipo de documento</th>
                <th className={`${TH} ${DIV}`}>Requisito</th>
                <th className={`${TH} ${DIV} w-[30%] pr-5`}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {habilitantes.map((h) => (
                <tr key={h.key} className={TR}>
                  <td className={`${TD} pl-5 font-semibold text-[#16162b]`}>{h.tipo}</td>
                  <td className={`${TD} ${DIV} text-[#16162b]`}>{h.requisito}</td>
                  <td className={`${TD} ${DIV} pr-5 text-[#4a4a63]`}>{h.observaciones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </CuadroConsulta>
  );
}

/**
 * Envoltura de los cuadros de consulta que se muestran entre el historial y el formato.
 * No se imprimen: son la política de referencia, no parte del documento.
 *
 * La cabecera va en una banda propia y la nota al pie en otra, con el contenido entre
 * las dos: son tres cosas distintas —de qué habla el cuadro, qué dice, y la salvedad—
 * y separadas se distinguen sin leerlas.
 */
function CuadroConsulta({ icono, titulo, subtitulo, nota, children }: {
  icono: React.ReactNode;
  titulo: string;
  subtitulo: React.ReactNode;
  /** Salvedad al pie. Va en su banda para que no se lea como una fila más. */
  nota?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`no-print ${UI.tarjeta}`}>
      <header className={`${UI.banda} border-b px-5 py-3.5`}>
        <h2 className={UI.titulo}>
          {icono}
          {titulo}
        </h2>
        <p className={`text-xs ${UI.tenue} mt-0.5`}>{subtitulo}</p>
      </header>
      <div className="p-5">{children}</div>
      {nota && (
        <footer className={`${UI.bandaTenue} border-t px-5 py-2.5 text-[11px] ${UI.tenue} flex items-start gap-1.5`}>
          <Info className="w-3.5 h-3.5 mt-px flex-none" />
          <div className="space-y-1">{nota}</div>
        </footer>
      )}
    </section>
  );
}

/**
 * Paleta de la sección de G. jurídica: tinta casi negra sobre blanco, con el amarillo
 * como único acento. Del diseño aprobado para esta pantalla.
 *
 *   tinta   #16162b   texto, títulos y la barra lateral
 *   media   #4a4a63   texto secundario
 *   borde   #e6e6f0   líneas y separadores
 *   banda   #f6f6fa   cabeceras de tarjeta y de tabla
 *   acento  #ffe81a   la acción principal y lo que está activo
 *   suave   #fff8b0   insignias resaltadas
 *
 * El amarillo no lleva texto blanco nunca: sobre él va la tinta. Y no se usa para
 * texto sobre blanco —no se leería—; ahí va el oro oscuro #8a6d00.
 *
 * Va como constantes locales y no como tokens globales a propósito: el resto de la
 * aplicación corre sobre el naranja de `--canalco-primary`, y redefinir ese token
 * repintaría los catorce módulos. Cada clase se escribe **literal** porque Tailwind
 * lee el código fuente: una clase armada con plantillas (`bg-[${x}]`) no la genera.
 */
const UI = {
  tarjeta: 'bg-white border border-[#e6e6f0] rounded-lg shadow-[0_4px_20px_rgba(22,22,43,0.05)] overflow-hidden',
  banda: 'bg-[#f6f6fa] border-[#e6e6f0]',
  bandaTenue: 'bg-[#fbfbfd] border-[#e6e6f0]',
  titulo: 'flex items-center gap-2 font-semibold text-[#16162b] [&>svg]:text-[#d4b400]',
  texto: 'text-[#16162b]',
  tenue: 'text-[#4a4a63]',
  borde: 'border-[#e6e6f0]',
  primario: 'bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]',
  secundario: 'bg-white text-[#4a4a63] border-[#c9c9dc] hover:bg-[#f6f6fa]',
  /** Insignia resaltada: el reloj del trámite. */
  chipAcento: 'bg-[#fff8b0] text-[#16162b] border border-[#e0cc00]',
  chipNeutro: 'bg-[#eeeef5] text-[#4a4a63] border border-[#e6e6f0]',
};

/* Piezas de tabla compartidas por los cuadros de consulta: cabecera tenue, filas
   separadas por línea y divisores verticales entre columnas. Se leen como una tabla
   de datos, no como la cuadrícula del formato impreso.

   Van compactas a propósito: son tablas de referencia que se consultan de reojo
   mientras se diligencia el formato, y con el alto de una tabla de trabajo empujaban
   el formato —que es lo que se viene a hacer— fuera de la pantalla. */
const TABLA = 'w-full text-[11px] border-collapse';
const TH = 'px-3 py-1.5 font-bold text-[#16162b]';
const TD = 'px-3 py-1.5 align-top';
const DIV = 'border-l border-[#e6e6f0]';
const TR = 'border-t border-[#e6e6f0] hover:bg-[#fbfbfd] transition-colors';

/* ── Subcomponentes de maquetación del formato ─────────────────────── */

function CodeCell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-0.5 font-semibold bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] ' + (last ? '' : 'border-b border-[#0a2a52]')}>{label}</div>
      <div className={'px-2 py-0.5 text-right ' + (last ? '' : 'border-b border-[#0a2a52]')}>{value}</div>
    </>
  );
}

function BandTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-200))] text-center font-bold text-[12px] py-1 border-b border-[#0a2a52] text-black">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-200))] font-bold text-[12px] px-3 py-1.5 border-b border-[#0a2a52] text-black">
      {children}
    </div>
  );
}

function LabelCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-3 py-2 font-semibold text-[12px] flex items-center text-black">
      {children}
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-2 py-1.5 font-bold text-[11px] flex items-center text-black uppercase tracking-wide">
      {children}
    </div>
  );
}

function DateBox({ label, value, onChange, last }: { label: string; value: string; onChange: (v: string) => void; last?: boolean }) {
  return (
    <div className={last ? '' : 'border-r border-[#0a2a52]'}>
      <div className="text-[11px] font-bold py-0.5 border-b border-[#0a2a52] bg-[hsl(var(--canalco-neutral-100))]">{label}</div>
      <div className="px-1 py-1"><FieldInput value={value} onChange={onChange} center /></div>
    </div>
  );
}

function RowField({ label, value, onChange, placeholder, area }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean;
}) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-[#0a2a52]">
      <LabelCell>{label}</LabelCell>
      <div className="px-2 py-1.5">
        {area
          ? <FieldArea value={value} onChange={onChange} placeholder={placeholder} />
          : <FieldInput value={value} onChange={onChange} placeholder={placeholder} />}
      </div>
    </div>
  );
}

function InlineField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold w-16 flex-none">{label}:</span>
      <FieldInput value={value} onChange={onChange} />
    </div>
  );
}

function SignatureCell({ title, nombre, cargo, hint, last }: {
  title: string; nombre: string; cargo: string; hint: string; last?: boolean;
}) {
  return (
    <div className={'px-3 pt-3 pb-2 ' + (last ? '' : 'border-r border-[#0a2a52]')}>
      <div className="font-bold text-[12px] mb-6">{title}</div>
      <div className="space-y-2">
        <SignRow label="Nombre" value={nombre} />
        <SignRow label="Cargo" value={cargo} />
      </div>
      {!nombre && (
        <p className="no-print text-[10px] italic text-[hsl(var(--canalco-neutral-400))] mt-2">
          Automático · {hint}
        </p>
      )}
    </div>
  );
}

/** Fila de firma de solo lectura: el valor se completa automáticamente desde el flujo. */
function SignRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-semibold w-16 flex-none">{label}:</span>
      <span className="flex-1 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] text-[12px] min-h-[1.1rem]">
        {value || ' '}
      </span>
    </div>
  );
}

function FieldInput({ value, onChange, placeholder, center }: {
  value: string; onChange: (v: string) => void; placeholder?: string; center?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5 placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:italic ' + (center ? 'text-center' : '')}
    />
  );
}

/**
 * Campo de dinero: agrupa los miles con punto mientras se escribe.
 *
 * Reformatear en cada tecla reescribe todo el valor, y un input controlado manda el
 * cursor al final: escribir al final se siente igual, pero corregir un dígito en la
 * mitad daría un salto. Por eso se cuentan los dígitos a la izquierda del cursor y se
 * lo devuelve a la misma posición lógica sobre el texto ya formateado.
 */
function MoneyInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const cursor = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (cursor.current !== null && ref.current) {
      ref.current.setSelectionRange(cursor.current, cursor.current);
      cursor.current = null;
    }
  });

  const manejar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const bruto = e.target.value;
    const pos = e.target.selectionStart ?? bruto.length;
    const digitosAntes = bruto.slice(0, pos).replace(/[^\d,]/g, '').length;
    const formateado = formatearMiles(bruto);

    let vistos = 0;
    let nueva = digitosAntes === 0 ? 0 : formateado.length;
    for (let i = 0; i < formateado.length && digitosAntes > 0; i++) {
      if (/[\d,]/.test(formateado[i])) vistos++;
      if (vistos === digitosAntes) { nueva = i + 1; break; }
    }
    cursor.current = nueva;
    onChange(formateado);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={manejar}
      placeholder={placeholder}
      className="w-full bg-transparent outline-none border-0 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[12px] py-0.5 placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:italic"
    />
  );
}

function FieldArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full bg-transparent outline-none resize-y text-[12px] py-0.5 min-h-[2.6rem] placeholder:text-[hsl(var(--canalco-neutral-400))] placeholder:italic"
    />
  );
}

/**
 * Casilla del formato. El cuadro se dibuja en vez de dejar la casilla nativa a la
 * vista: bloqueado el formato —como se lee casi siempre—, el navegador apagaría a gris
 * lo marcado. Ver la nota de `Check` en `requisicionPersonalDoc`.
 */
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="text-[12px] font-semibold">{label}</span>
      <span
        className={'relative w-4 h-4 flex-shrink-0 border border-[#0a2a52] flex items-center justify-center '
          + (checked ? 'bg-[#ffe81a]' : 'bg-white')}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
        />
        {checked && (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#16162b] pointer-events-none" aria-hidden="true">
            <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}

/**
 * Datos de la póliza al registrar el pago.
 *
 * Marcarla como pagada sin dejar número ni vigencias dejaba a la verificación de
 * garantías —el paso siguiente— sin nada contra qué cotejar. El número y la fecha
 * de pago son obligatorios; el backend los exige también, así que no se puede
 * saltar por la API.
 */
function PagoPolizaDialog({ abierto, onCerrar, onConfirmar }: {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (data: Record<string, string>) => void;
}) {
  const [f, setF] = useState({
    polizaNumero: '', polizaVigenciaDesde: '', polizaVigenciaHasta: '',
    pagoFecha: '', pagoValor: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const falta = !f.polizaNumero.trim() || !f.pagoFecha.trim();

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar el pago de la póliza</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-[hsl(var(--canalco-neutral-600))] -mt-2">
          Queda en la solicitud para poder verificar la garantía en el paso siguiente.
        </p>
        <div className="space-y-3">
          <CampoPago label="N.º de la póliza" requerido value={f.polizaNumero}
            onChange={(v) => set('polizaNumero', v)} placeholder="Ej.: 21-45-101012345" />
          <div className="grid grid-cols-2 gap-3">
            <CampoPago label="Vigencia desde" value={f.polizaVigenciaDesde}
              onChange={(v) => set('polizaVigenciaDesde', v)} placeholder="dd/mm/aaaa" />
            <CampoPago label="Vigencia hasta" value={f.polizaVigenciaHasta}
              onChange={(v) => set('polizaVigenciaHasta', v)} placeholder="dd/mm/aaaa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CampoPago label="Fecha de pago" requerido value={f.pagoFecha}
              onChange={(v) => set('pagoFecha', v)} placeholder="dd/mm/aaaa" />
            <CampoPago label="Valor pagado" value={f.pagoValor}
              onChange={(v) => set('pagoValor', v)} placeholder="$" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            disabled={falta}
            onClick={() => onConfirmar(f)}
            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
          >
            Registrar pago y verificar garantías
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoPago({ label, value, onChange, placeholder, requerido }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
        {label}{requerido && <span className="text-red-600"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[hsl(var(--canalco-neutral-300))] px-2 py-1.5 text-xs outline-none focus:border-[hsl(var(--canalco-primary))] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
      />
    </label>
  );
}

const fmtFecha = (d: Date) =>
  d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function WorkflowPanel({ sol, nombreRol, esCreador, onAccion, onResolverPoliza, onSolicitarPoliza }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
  onResolverPoliza: (decision: 'aprobar' | 'rechazar') => void;
  onSolicitarPoliza: () => void;
}) {
  const navigate = useNavigate();
  const estado = sol.estado as JuridicaEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const sla = calcularSla(estado, sol.estadoDesde);
  const terminal = estado === 'finalizado';
  const consecutivo = String((sol.data as Record<string, any> | null)?.consecutivoContrato ?? '').trim();
  // Vencimiento del contrato firmado: null mientras no haya contrato, en término
  // indefinido, o si la terminación quedó en blanco.
  const vence = vencimientoDe(estado, sol.data as Record<string, any> | null);
  /** Datos de la garantía que se capturan al registrar el pago. */
  const poliza = (sol.data as Record<string, any> | null)?.poliza as
    | { numero?: string; vigenciaDesde?: string; vigenciaHasta?: string;
        pagoFecha?: string; pagoValor?: string; registradoPor?: string }
    | undefined;
  const reqPoliza = (sol.data as Record<string, any> | null)?.requisicionPoliza as
    | { requisitionNumber?: string | null; requisitionId?: number | null; error?: string; fecha?: string;
        estado?: 'aprobada' | 'rechazada' | 'en_cotizacion'; resueltaPor?: string | null; motivo?: string }
    | undefined;
  const enPolizas = (['en_solicitud_polizas', 'en_aprobacion_polizas', 'en_pago_polizas'] as JuridicaEstado[])
    .includes(estado);
  // Desde la firma en adelante el contrato existe: es cuando tiene sentido pedirle
  // la póliza, aunque el flujo ya haya pasado de la rama de pólizas.
  const contratoVigente = ESTADOS_CONTRATO_VIGENTE.has(estado);
  const puedePedirPoliza =
    contratoVigente
    && !reqPoliza?.requisitionId
    && (esRolPmo(nombreRol) || [...ROLES_ADMINISTRATIVA, ...ROLES_JURIDICA].includes((nombreRol ?? '').trim()));
  // Solo la Dirección Administrativa y Financiera (Daniela) resuelve la requisición
  // de la póliza; Gerencia no participa (regla exclusiva de este proceso).
  const esDirAdminFinanciera = (nombreRol ?? '').trim() === 'Director Financiero y Administrativo';
  const polizaPendiente = !!reqPoliza?.requisitionId && !reqPoliza?.error && !reqPoliza?.estado;
  const puedeResolverPoliza = esDirAdminFinanciera && enPolizas && polizaPendiente;
  // Las requisiciones de póliza nuevas nacen en cotización, así que no quedan
  // "pendientes" y el avance a "Aprobación (Jurídica)" vuelve a ser el botón manual
  // "Pólizas solicitadas". Solo las creadas con el flujo anterior —las que todavía
  // esperan a Daniela— siguen ocultando ese botón, porque en ésas el avance ocurre
  // al aprobar la requisición.
  // Solo las acciones que se deciden desde la solicitud. Las demás viven en el
  // documento que las justifica —"Trámite validado" en la lista de chequeo, "Contrato
  // listo" en el contrato— y abajo se dice a cuál ir, para que la etapa nunca se quede
  // sin botón y sin explicación.
  const accionesVisibles = (polizaPendiente
    ? acciones.filter((a) => a.accion !== 'polizas_solicitadas')
    : acciones
  ).filter((a) => a.documento === 'solicitud');
  const enOtroDocumento = documentosConAccion(estado, nombreRol, esCreador, 'solicitud');
  const hayHistorial = !!sol.historial && sol.historial.length > 0;

  return (
    /* Estado e historial van lado a lado: son las dos preguntas que se hacen al abrir
       la solicitud —en qué va y cómo llegó ahí— y apiladas obligaban a bajar para
       responder la segunda. En pantalla angosta vuelven a apilarse. */
    <div className="no-print mb-6 grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
    {/* Sin historial —una solicitud recién creada— la de estado ocupa todo el ancho:
        dejar un tercio en blanco parecería una tarjeta que no cargó. */}
    <section className={(hayHistorial ? 'xl:col-span-2 ' : 'xl:col-span-3 ') + UI.tarjeta}>
      <header className={`${UI.banda} border-b px-5 py-3.5`}>
        <h2 className={UI.titulo}>
          <GitBranch className="w-4 h-4" /> Estado del flujo
        </h2>
      </header>
      <div className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>{estadoLabel(estado)}</span>
        {sla && (
          /* A tiempo toma el amarillo del diseño; vencida se queda en rojo, que es una
             alarma y no puede leerse igual que el estado normal. */
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1 ${sla.vencida ? 'bg-red-100 text-red-700 border border-red-200' : UI.chipAcento}`}>
            {sla.vencida ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {sla.vencida ? 'Vencida' : 'A tiempo'} · vence {fmtFecha(sla.vence)} ({sla.diasHabiles} día{sla.diasHabiles !== 1 ? 's' : ''} háb.)
          </span>
        )}
        {ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[#4a4a63]">sin plazo</span>
        )}
        {/* El consecutivo del contrato: lo emite el sistema al guardarlo y es el
            número con el que el contrato sale a firma y a archivo. */}
        {consecutivo && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1 font-mono ${UI.chipNeutro}`}>
            {consecutivo}
          </span>
        )}
        {/* El SLA es del trámite; esto es del contrato ya firmado. Son dos relojes
            distintos y por eso van en insignias distintas. */}
        {vence && (
          <span
            title={vence.ilegible
              ? `El aviso automático necesita una fecha legible: dd/mm/aaaa, aaaa-mm-dd o "31 de diciembre de 2026".`
              : `La Dirección Administrativa recibe el aviso ${DIAS_ALERTA_VENCIMIENTO} días antes de esta fecha.`}
            className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 cursor-help ${
            vence.ilegible ? 'bg-amber-100 text-amber-800'
              : vence.dias! < 0 ? 'bg-red-100 text-red-700'
                : vence.enVentana ? 'bg-amber-100 text-amber-800'
                  : 'bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-600))]'
          }`}>
            {vence.enVentana || vence.ilegible
              ? <AlertTriangle className="w-3.5 h-3.5" />
              : <Clock className="w-3.5 h-3.5" />}
            {vence.ilegible
              ? `Terminación "${vence.texto}": no se entiende la fecha, no habrá aviso automático`
              : vence.dias! < 0
                ? `Contrato vencido el ${vence.texto} (hace ${Math.abs(vence.dias!)} día${Math.abs(vence.dias!) !== 1 ? 's' : ''})`
                : `Contrato vence ${vence.texto} · ${vence.dias} día${vence.dias !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* La RQ de la póliza puede pedirse fuera de la rama de pólizas, así que su
          recuadro se muestra en cualquier estado con contrato firmado; solo la
          aprobación sigue atada a los estados de pólizas. */}
      {contratoVigente && reqPoliza && (
        <div className="space-y-2 rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] p-3">
          {reqPoliza.error ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              No se pudo crear la requisición de la póliza automáticamente: {reqPoliza.error}
            </p>
          ) : (
            <p className="text-xs font-medium text-green-700">
              ✓ Requisición de la póliza creada en Gestión de Compras
              {reqPoliza.requisitionNumber ? <> · N.º <span className="font-mono">{reqPoliza.requisitionNumber}</span></> : null}
              {reqPoliza.estado === 'en_cotizacion' ? ' · en cotización por Compras.' : '.'}
            </p>
          )}
          {/* No pasa por aprobación: la decisión ya se tomó al firmar el contrato. */}
          {reqPoliza.estado === 'en_cotizacion' && (
            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
              Va directo a la bandeja de Compras para cotización, sin aprobación previa.
            </p>
          )}

          {/* Aprobación por la Dirección Administrativa y Financiera (no Gerencia). */}
          {reqPoliza.estado === 'aprobada' && (
            <p className="text-xs font-medium text-green-700">
              ✓ Requisición de la póliza aprobada{reqPoliza.resueltaPor ? <> por {reqPoliza.resueltaPor}</> : null}.
            </p>
          )}
          {reqPoliza.estado === 'rechazada' && (
            <p className="text-xs font-medium text-red-700">
              ✗ Requisición de la póliza rechazada{reqPoliza.resueltaPor ? <> por {reqPoliza.resueltaPor}</> : null}
              {reqPoliza.motivo ? <> — <span className="italic">{reqPoliza.motivo}</span></> : null}.
            </p>
          )}

          {puedeResolverPoliza && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => onResolverPoliza('aprobar')}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
              >
                Aprobar póliza
              </Button>
              <Button
                onClick={() => onResolverPoliza('rechazar')}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                Rechazar póliza
              </Button>
            </div>
          )}
          {puedeResolverPoliza && (
            <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
              Como Dirección Administrativa y Financiera, tú apruebas esta requisición de póliza.
            </p>
          )}

          {/* La garantía ya pagada: es lo que se coteja en la verificación. */}
          {poliza?.numero && (
            <div className="pt-2 border-t border-[hsl(var(--canalco-neutral-200))] text-[11px] text-[hsl(var(--canalco-neutral-600))] space-y-0.5">
              <p>
                Póliza <span className="font-mono font-semibold">{poliza.numero}</span>
                {poliza.vigenciaDesde || poliza.vigenciaHasta
                  ? <> · vigencia {poliza.vigenciaDesde || '…'} → {poliza.vigenciaHasta || '…'}</>
                  : null}
              </p>
              <p>
                Pagada el {poliza.pagoFecha}
                {poliza.pagoValor ? <> · {poliza.pagoValor}</> : null}
                {poliza.registradoPor ? <> · registró {poliza.registradoPor}</> : null}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Contrato firmado sin RQ de póliza: la transición "Iniciar solicitud de
          pólizas" solo existe desde "Contrato firmado", así que los contratos que
          ya pasaron de ahí —o los firmados antes de que la rama existiera— se
          quedaban sin forma de pedirla. El botón la crea sin mover el flujo. */}
      {puedePedirPoliza && (
        <div className="space-y-2 rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] p-3">
          <p className="text-xs font-medium text-[hsl(var(--canalco-neutral-700))]">
            Este contrato no tiene requisición de póliza.
          </p>
          <Button variant="outline" onClick={onSolicitarPoliza} className="gap-2">
            Solicitar RQ de póliza
          </Button>
          <p className="text-[11px] text-[hsl(var(--canalco-neutral-500))]">
            Crea la requisición con el ítem POLIZA en Gestión de Compras y la enlaza
            aquí. No cambia el estado del flujo.
          </p>
        </div>
      )}
      </div>

      {/* Las acciones al pie, separadas por su banda: es lo que se hace, no lo que se
          lee, y así no se confunden con el estado ni con los avisos de la póliza. */}
      <footer className={`${UI.bandaTenue} border-t px-5 py-3.5 flex flex-wrap items-center gap-3`}>
        {accionesVisibles.map((a) => (
          <Button
            key={a.accion}
            onClick={() => onAccion(a.accion, a.requiereMotivo)}
            variant={a.tone === 'danger' ? 'outline' : 'default'}
            className={a.tone === 'danger' ? UI.secundario : UI.primario}
          >
            {a.label}
          </Button>
        ))}
        {/* La acción de esta etapa está en otro documento: se dice cuál y se lleva
            allá. Sin esto la etapa parecería trabada. */}
        {enOtroDocumento.map((doc) => (
          <button
            key={doc}
            type="button"
            onClick={() => navigate(rutaDocumento(sol.solicitudId, doc))}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16162b] underline decoration-[#ffe81a] decoration-2 underline-offset-4 hover:decoration-[#e0cc00]"
          >
            La acción de esta etapa se hace en «{DOCUMENTO_LABEL[doc]}»
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ))}
        {accionesVisibles.length === 0 && enOtroDocumento.length === 0 && !terminal && !puedeResolverPoliza && (
          <p className="text-xs text-[#4a4a63]">No tienes acciones disponibles en este estado.</p>
        )}
        {terminal && (
          <p className="text-xs font-medium text-emerald-700">✓ Contrato en ejecución. Flujo finalizado.</p>
        )}
      </footer>
    </section>

    {/* Historial: línea de tiempo, con el más reciente arriba y marcado. */}
    {hayHistorial && (
      <section className={UI.tarjeta}>
        <header className={`${UI.banda} border-b px-5 py-3.5`}>
          <h2 className={UI.titulo}>
            <History className="w-4 h-4" /> Historial de actividad
          </h2>
        </header>
        <div className="p-5">
          <ol className="relative pl-5 space-y-4 before:absolute before:inset-y-1.5 before:left-[3px] before:w-px before:bg-[#e6e6f0]">
            {[...sol.historial].reverse().map((h, i) => {
              // Los avisos de vencimiento comparten bitácora con las transiciones,
              // pero no son un cambio de estado: si se pintaran igual, la fila diría
              // "Contrato en ejecución" y parecería que el flujo se movió. Van con su
              // propia etiqueta y con a quién se le avisó, que es lo que se audita.
              const esAlerta = h.accion === 'alerta_vencimiento';
              const esRqPoliza = h.accion === 'solicitud_rq_poliza';
              const esInicio = h.accion === 'notificacion_inicio_contrato';
              return (
                <li key={i} className="relative">
                  {/* El punto lleno marca el movimiento más reciente, que es el que
                      explica en qué estado está la solicitud ahora. */}
                  <span className={'absolute -left-5 top-1.5 w-2 h-2 rounded-full ring-4 ring-white '
                    + (i === 0 ? 'bg-[#ffe81a] ring-offset-0 outline outline-1 outline-[#e0cc00]' : 'bg-[#c9c9dc]')} />
                  <div className="text-[11px] font-mono text-[#4a4a63]">
                    {fmtFechaHora(h.fecha)}
                  </div>
                  <div className="text-xs text-[#16162b] flex flex-wrap gap-x-2">
                  {esAlerta ? (
                    <>
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> Alerta de vencimiento
                      </span>
                      <span className="text-[hsl(var(--canalco-neutral-500))]">
                        · vence {h.vence}
                        {typeof h.diasRestantes === 'number' && (
                          h.diasRestantes >= 0
                            ? ` · faltaban ${h.diasRestantes} día${h.diasRestantes !== 1 ? 's' : ''}`
                            : ` · ya habían pasado ${Math.abs(h.diasRestantes)} día${Math.abs(h.diasRestantes) !== 1 ? 's' : ''}`
                        )}
                      </span>
                      <span className="text-[hsl(var(--canalco-neutral-500))]">
                        · {Array.isArray(h.notificados) && h.notificados.length > 0
                          ? `avisada la Dir. Administrativa (${h.notificados.length})`
                          : 'sin destinatarios activos'}
                      </span>
                    </>
                  ) : esInicio ? (
                    // Se listan los destinatarios y, sobre todo, a quién NO se le
                    // pudo avisar: un supervisor sin usuario o un contratista sin
                    // correo es justo lo que hay que corregir a mano.
                    <>
                      <span className="font-medium text-green-700">Aviso de inicio del contrato</span>
                      <span className="text-[hsl(var(--canalco-neutral-500))]">
                        · {Array.isArray(h.notificados) && h.notificados.length > 0
                          ? `${h.notificados.length} destinatario${h.notificados.length !== 1 ? 's' : ''}`
                          : 'sin destinatarios'}
                      </span>
                      {Array.isArray(h.pendientes) && h.pendientes.length > 0 && (
                        <span className="italic text-amber-700">— falta avisar: {h.pendientes.join('; ')}</span>
                      )}
                    </>
                  ) : esRqPoliza ? (
                    // Tampoco es un cambio de estado: es una requisición emitida
                    // sobre un contrato que siguió su curso.
                    <>
                      <span className="font-medium text-sky-700">RQ de póliza solicitada</span>
                      {h.requisicion && (
                        <span className="font-mono text-[hsl(var(--canalco-neutral-600))]">· {h.requisicion}</span>
                      )}
                      {h.userName && <span className="text-[hsl(var(--canalco-neutral-500))]">· {h.userName}</span>}
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{estadoLabel(h.estado)}</span>
                      {h.userName && <span className="text-[hsl(var(--canalco-neutral-500))]">· {h.userName}</span>}
                      {h.motivo && <span className="italic text-red-600">— {h.motivo}</span>}
                    </>
                  )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    )}
    </div>
  );
}
