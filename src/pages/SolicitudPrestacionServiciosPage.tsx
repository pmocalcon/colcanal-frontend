import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Home, ArrowLeft, Printer, Eraser, Save, Loader2, Clock, AlertTriangle, History, ClipboardCheck, UserCheck, FileSignature, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import {
  ESTADOS, estadoLabel, estadoBadgeClass, accionesDisponibles, calcularSla,
  type JuridicaEstado,
} from '@/utils/juridicaWorkflow';
import {
  TIPOS_CONTRATO, getTipo, filtrarPorPersona, habilitantesPara,
  AMPAROS, MATRIZ_GARANTIAS, REGIMEN_GARANTIAS, garantiasSugeridas,
  type ExigenciaClase,
} from '@/config/juridicaContratos';
import { EMPRESAS, getEmpresa } from '@/config/empresasCentroCosto';

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
  tipoPrestacion: boolean; tipoAlquiler: boolean; tipoSuministro: boolean; tipoObra: boolean;
  objetoProyecto: string;
  alcanceServicio: string;
  actividades: string;
  productos: string;
  garantias: string;
  experiencia: string;
  perfil: string;
  duracion: string; fechaInicio: string; fechaTerminacion: string;
  honorarios: string; formaPago: string;
  herrComputador: boolean; herrCorreo: boolean; herrPuesto: boolean; accesos: string;
  sugNombre: string; sugTelefono: string; sugCorreo: string;
  modContrato: boolean; modOrdenServicio: boolean;
  tipoContrato: string;
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
  tipoPrestacion: false, tipoAlquiler: false, tipoSuministro: false, tipoObra: false,
  objetoProyecto: '', alcanceServicio: '', actividades: '', productos: '', garantias: '',
  experiencia: '', perfil: '',
  duracion: '', fechaInicio: '', fechaTerminacion: '',
  honorarios: '', formaPago: '',
  herrComputador: false, herrCorreo: false, herrPuesto: false, accesos: '',
  sugNombre: '', sugTelefono: '', sugCorreo: '',
  modContrato: false, modOrdenServicio: false,
  tipoContrato: '',
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

  // La lista de chequeo (GA-25-F) la diligencia Administrativa: se habilita al remitir
  // la solicitud a Administrativa y de ahí en adelante (todos los estados salvo los previos).
  const checklistHabilitado = estado !== 'borrador' && estado !== 'pendiente_autorizacion_gp' && estado !== 'pendiente_firma_gerencia';

  // La verificación de garantías va entre el pago de la póliza y la designación: antes
  // no tiene sentido revisar la prima ni la autenticidad de una póliza que no existe.
  const verificacionHabilitada = (['en_verificacion_garantias', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'] as JuridicaEstado[])
    .includes(estado as JuridicaEstado);

  // La designación de supervisor se habilita al llegar a esa etapa (o más adelante).
  const designacionHabilitada = (['en_designacion_supervisor', 'en_acta_inicio', 'finalizado'] as JuridicaEstado[])
    .includes(estado as JuridicaEstado);

  // El acta de inicio se habilita en su etapa (o al finalizar).
  const actaHabilitada = (['en_acta_inicio', 'finalizado'] as JuridicaEstado[])
    .includes(estado as JuridicaEstado);

  // El contrato se genera desde la etapa de revisión del contrato en adelante.
  const contratoHabilitado = (['contrato_en_elaboracion', 'pendiente_firma_contrato', 'contrato_firmado', 'en_designacion_supervisor', 'en_acta_inicio', 'finalizado'] as JuridicaEstado[])
    .includes(estado as JuridicaEstado);

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

  // Carga la solicitud existente al editar.
  useEffect(() => {
    if (solicitudId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (!cancelled) {
          setSol(data);
          setF({ ...EMPTY, ...(data.data as Partial<FormState> | null) });
        }
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  const reload = async () => {
    if (solicitudId === null) return;
    try { setSol(await gestionConocimientoService.get(solicitudId)); } catch { /* noop */ }
  };

  const handleTransition = async (accion: string, requiereMotivo?: boolean) => {
    let motivo: string | undefined;
    if (requiereMotivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;            // canceló
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    try {
      await gestionConocimientoService.transition(solicitudId!, { accion, motivo });
      toast.success('Acción registrada');
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
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-100))]">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-100))]">
      {/* Estilos de impresión: solo el documento, tamaño carta. */}
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones (no se imprime) */}
      <header className="no-print bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3">
          {/* Fila 1: navegación, título/estado y acciones principales */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/juridica')} title="Volver a las solicitudes">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-grow min-w-0">
              <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] truncate">Solicitud de prestación de servicios</h1>
              <div className="text-xs text-[hsl(var(--canalco-neutral-600))] flex items-center gap-2 flex-wrap">
                <span>G. jurídica · Formato GTH-002-F{solicitudId !== null ? ` · N.º ${solicitudId}` : ' · Nueva'}</span>
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
              <Button variant="outline" onClick={() => window.print()} className="gap-2">
                <Printer className="w-4 h-4" /> Imprimir / PDF
              </Button>
              {!locked && (
                <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                </Button>
              )}
            </div>
          </div>

          {/* Fila 2: documentos del contrato. Solo con la solicitud guardada: todos
              navegan a subdocumentos suyos. */}
          {solicitudId !== null && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[hsl(var(--canalco-neutral-200))] flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mr-1">Documentos</span>
              <Button
                variant="outline" size="sm" disabled={!checklistHabilitado}
                onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}/chequeo`)}
                className="gap-2"
                title={checklistHabilitado ? 'Lista de chequeo (GA-25-F)' : 'Se habilita cuando la solicitud se remite a Administrativa'}
              >
                <ClipboardCheck className="w-4 h-4" /> Lista de chequeo
              </Button>
              <Button
                variant="outline" size="sm" disabled={!contratoHabilitado}
                onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}/contrato`)}
                className="gap-2"
                title={contratoHabilitado ? 'Contrato (GJ-001-F)' : 'Se habilita en la etapa de revisión del contrato (Jurídica)'}
              >
                <FileText className="w-4 h-4" /> Contrato
              </Button>
              <Button
                variant="outline" size="sm" disabled={!verificacionHabilitada}
                onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}/verificacion-garantias`)}
                className="gap-2"
                title={verificacionHabilitada ? 'Lista de verificación de garantías y matriz de riesgo' : 'Se habilita cuando la póliza está pagada, antes de designar supervisor'}
              >
                <ShieldCheck className="w-4 h-4" /> Verificación de garantías
              </Button>
              <Button
                variant="outline" size="sm" disabled={!designacionHabilitada}
                onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}/designacion-supervisor`)}
                className="gap-2"
                title={designacionHabilitada ? 'Designación de supervisor (GJ-003-F)' : 'Se habilita en la etapa de designación de supervisor (tras la firma del contrato)'}
              >
                <UserCheck className="w-4 h-4" /> Designación supervisor
              </Button>
              <Button
                variant="outline" size="sm" disabled={!actaHabilitada}
                onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}/acta-inicio`)}
                className="gap-2"
                title={actaHabilitada ? 'Acta de inicio (GJ-006-F)' : 'Se habilita en la etapa de acta de inicio (tras la designación de supervisor)'}
              >
                <FileSignature className="w-4 h-4" /> Acta de inicio
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Documento */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {sol && (
          <WorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={sol.createdBy === user?.userId}
            onAccion={handleTransition}
            onResolverPoliza={handleResolverPoliza}
          />
        )}
        {/* Cuadros de referencia: van entre el historial y el formato porque no son
            documentos de la solicitud —no se generan ni se firman—, sino la política
            que se consulta mientras se diligencia. Fuera del fieldset, así se leen
            también cuando la solicitud ya está bloqueada, y con `no-print`, para que no
            se cuelen en el PDF del formato. */}
        <div className="mb-6 space-y-4">
          <DocumentosCuadro tipoContrato={f.tipoContrato} tipoPersona={f.tipoPersona} />
          <GarantiasCuadro
            sugeridas={garantiasSugeridas({
              prestacion: f.tipoPrestacion,
              alquiler: f.tipoAlquiler,
              suministro: f.tipoSuministro,
              obra: f.tipoObra,
              tipoContrato: f.tipoContrato,
            })}
          />
        </div>

        <fieldset disabled={locked} className="border-0 m-0 p-0 min-w-0">
        <div className="doc bg-white border border-[#0a2a52] mx-auto text-[13px] text-[#0a2a52] shadow-md">

          {/* Encabezado con logos y código */}
          <div className="grid grid-cols-[130px_1fr_130px] border-b border-[#0a2a52]">
            <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-16 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[15px] text-[#0a2a52] border-r border-[#0a2a52]">
              SOLICITUD DE PRESTACIÓN DE SERVICIOS, ALQUILER, OBRA Y/O SUMINISTRO
            </div>
            <div className="grid grid-rows-[auto_1fr] min-w-0">
              <div className="flex items-center justify-center p-1 border-b border-[#0a2a52]">
                <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-12 object-contain" />
              </div>
              <div className="grid grid-cols-[auto_1fr] text-[11px]">
                <CodeCell label="Código" value="GTH-002-F" />
                <CodeCell label="Fecha" value="25/07/2023" />
                <CodeCell label="Versión" value="2" last />
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

          {/* Instrucciones */}
          <div className="border-b border-[#0a2a52]">
            <BandTitle>INSTRUCCIONES</BandTitle>
            <p className="px-3 py-2 text-[12px] leading-snug">
              Recuerde realizar su solicitud con mínimo 8 días calendario de anticipación a la fecha de
              inicio de labores dicha, de manera que el área de gestión humana pueda realizar el
              procedimiento de selección y anexar los documentos correspondientes.
            </p>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-3 pb-3">
              <CheckField label="Prestación de servicios" checked={f.tipoPrestacion} onChange={(v) => set('tipoPrestacion', v)} />
              <CheckField label="Alquiler" checked={f.tipoAlquiler} onChange={(v) => set('tipoAlquiler', v)} />
              <CheckField label="Suministro" checked={f.tipoSuministro} onChange={(v) => set('tipoSuministro', v)} />
              <CheckField label="Obra" checked={f.tipoObra} onChange={(v) => set('tipoObra', v)} />
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
              <div className="border-r border-[#0a2a52] px-2 py-1">
                <FieldInput value={f.honorarios} onChange={(v) => set('honorarios', v)} placeholder="VALOR EN LETRAS" />
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
        </div>
        </fieldset>

        <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
          {locked
            ? 'La solicitud ya avanzó en el flujo; el formato queda en solo lectura. Usa Imprimir / PDF para exportarla.'
            : 'Usa Guardar para almacenar la solicitud, o Imprimir / PDF para exportarla.'}
        </p>
      </main>
    </div>
  );
}

/** Colores de la matriz: se exige, no se exige, o depende de algo que define Jurídica. */
const EXIGENCIA_CLASS: Record<ExigenciaClase, string> = {
  si: 'text-emerald-700 font-semibold',
  no: 'text-[hsl(var(--canalco-neutral-400))]',
  condicional: 'text-amber-700',
};

/**
 * Matriz general de garantías (política, secciones 10 y 11). Se muestra completa porque
 * sus categorías no son las del catálogo de tipos de contrato; las filas que encajan con
 * lo marcado en la solicitud se resaltan, a modo de sugerencia.
 */
function GarantiasCuadro({ sugeridas }: { sugeridas: string[] }) {
  return (
    <CuadroConsulta
      icono={<ShieldCheck className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />}
      titulo="Matriz general de garantías"
      subtitulo="Qué amparos se exigen según la naturaleza del contrato."
    >
        <div className="space-y-2 text-[12px] leading-snug text-[hsl(var(--canalco-neutral-700))]">
          {REGIMEN_GARANTIAS.map((p, i) => <p key={i}>{p}</p>)}
        </div>


        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[12px] border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left">
                <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 w-[26%]">Contrato</th>
                {AMPAROS.map((a) => (
                  <th key={a.key} className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 text-center">{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIZ_GARANTIAS.map((fila) => {
                const resaltada = sugeridas.includes(fila.key);
                return (
                  <tr key={fila.key} className={resaltada ? 'bg-[hsl(var(--canalco-primary))]/[0.07]' : undefined}>
                    <td className={'border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 ' + (resaltada ? 'font-semibold text-[#0a2a52]' : '')}>
                      {fila.contrato}
                    </td>
                    {AMPAROS.map((a) => {
                      const e = fila.amparos[a.key];
                      return (
                        <td key={a.key} className={'border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 text-center ' + EXIGENCIA_CLASS[e.clase]}>
                          {e.texto}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-[11px] text-[hsl(var(--canalco-neutral-500))] space-y-1">
          <p>
            <span className="text-emerald-700 font-semibold">Sí</span> se exige ·{' '}
            <span className="text-amber-700">Si aplica / Según objeto / riesgo / bien</span> lo define
            la Dirección Jurídica ·{' '}
            <span className="text-[hsl(var(--canalco-neutral-400))]">No</span> no se exige.
          </p>
          {sugeridas.length > 0 ? (
            <p className="italic">
              Resaltadas: las filas que corresponden a lo marcado en la solicitud. Es una
              orientación; la clasificación final es de Jurídica.
            </p>
          ) : (
            <p className="italic">
              Marca la naturaleza en la solicitud (prestación de servicios, alquiler,
              suministro u obra) para resaltar la fila que corresponde.
            </p>
          )}
        </div>
    </CuadroConsulta>
  );
}

/**
 * Qué documentos hay que reunir para esta solicitud. Dos listas de origen distinto:
 * los del **tipo de contrato** (formato GA-25-F) y los **habilitantes**, que son el
 * mínimo de la política y dependen de la naturaleza del contratista.
 */
function DocumentosCuadro({ tipoContrato, tipoPersona }: {
  tipoContrato: string;
  tipoPersona: string;
}) {
  const t = getTipo(tipoContrato);
  const docs = filtrarPorPersona(t?.secciones.documentos ?? [], tipoPersona);
  const habilitantes = habilitantesPara(tipoPersona);
  const personaLabel = tipoPersona === 'natural' ? 'Persona natural'
    : tipoPersona === 'juridica' ? 'Persona jurídica' : null;

  return (
    <CuadroConsulta
      icono={<FileText className="w-4 h-4 text-[hsl(var(--canalco-primary))]" />}
      titulo="Documentos necesarios"
      subtitulo={`${t ? t.nombre : 'Sin tipo de contrato'}${personaLabel ? ` · ${personaLabel}` : ' · sin tipo de persona'}`}
    >
        {!personaLabel && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
            Elige el <b>tipo de persona</b> en el formato: los habilitantes cambian según
            sea natural o jurídica.
          </p>
        )}

        <section>
          <h3 className="font-semibold text-sm text-[#0a2a52] mb-2">
            Documentos habilitantes <span className="font-normal text-[hsl(var(--canalco-neutral-500))]">· mínimo exigible</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-[hsl(var(--canalco-neutral-100))] text-left">
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 w-[30%]">Tipo de documento</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1">Qué se presenta</th>
                  <th className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 w-[30%]">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {habilitantes.map((h) => (
                  <tr key={h.key} className="align-top">
                    <td className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 font-medium">{h.tipo}</td>
                    <td className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1">{h.requisito}</td>
                    <td className="border border-[hsl(var(--canalco-neutral-300))] px-2 py-1 text-[hsl(var(--canalco-neutral-600))]">{h.observaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] italic text-[hsl(var(--canalco-neutral-500))]">
            Es un mínimo: la Dirección Jurídica puede pedir más según la naturaleza del
            contratista y el nivel de riesgo.
          </p>
        </section>

        {t && docs.length > 0 && (
          <section className="mt-4">
            <h3 className="font-semibold text-sm text-[#0a2a52] mb-2">
              Del contrato <span className="font-normal text-[hsl(var(--canalco-neutral-500))]">· «{t.nombre}»</span>
            </h3>
            <ul className="list-disc pl-5 space-y-0.5 text-[12px]">
              {docs.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </section>
        )}

        {!t && (
          <p className="mt-4 text-xs text-[hsl(var(--canalco-neutral-500))]">
            Elige el tipo de contrato para ver también los documentos propios de ese tipo.
          </p>
        )}
    </CuadroConsulta>
  );
}

/**
 * Envoltura de los cuadros de consulta que se muestran entre el historial y el formato.
 * No se imprimen: son la política de referencia, no parte del documento.
 */
function CuadroConsulta({ icono, titulo, subtitulo, children }: {
  icono: React.ReactNode;
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="no-print bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4">
      <header className="mb-3">
        <h2 className="flex items-center gap-2 font-semibold text-[#0a2a52]">
          {icono}
          {titulo}
        </h2>
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mt-0.5">{subtitulo}</p>
      </header>
      {children}
    </section>
  );
}

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
    <div className="bg-[hsl(var(--canalco-neutral-200))] text-center font-bold text-[12px] py-1 border-b border-[#0a2a52] text-[#0a2a52]">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-200))] font-bold text-[12px] px-3 py-1.5 border-b border-[#0a2a52] text-[#0a2a52]">
      {children}
    </div>
  );
}

function LabelCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-3 py-2 font-semibold text-[12px] flex items-center text-[#7a1f1f]">
      {children}
    </div>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-100))] border-r border-[#0a2a52] px-2 py-1.5 font-bold text-[11px] flex items-center text-[#0a2a52] uppercase tracking-wide">
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

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="text-[12px] font-semibold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 border border-[#0a2a52] accent-[hsl(var(--canalco-primary))] cursor-pointer"
      />
    </label>
  );
}

const fmtFecha = (d: Date) =>
  d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function WorkflowPanel({ sol, nombreRol, esCreador, onAccion, onResolverPoliza }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean) => void;
  onResolverPoliza: (decision: 'aprobar' | 'rechazar') => void;
}) {
  const estado = sol.estado as JuridicaEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const sla = calcularSla(estado, sol.estadoDesde);
  const terminal = estado === 'finalizado';
  const reqPoliza = (sol.data as Record<string, any> | null)?.requisicionPoliza as
    | { requisitionNumber?: string | null; requisitionId?: number | null; error?: string; fecha?: string;
        estado?: 'aprobada' | 'rechazada'; resueltaPor?: string | null; motivo?: string }
    | undefined;
  const enPolizas = (['en_solicitud_polizas', 'en_aprobacion_polizas', 'en_pago_polizas'] as JuridicaEstado[])
    .includes(estado);
  // Solo la Dirección Administrativa y Financiera (Daniela) resuelve la requisición
  // de la póliza; Gerencia no participa (regla exclusiva de este proceso).
  const esDirAdminFinanciera = (nombreRol ?? '').trim() === 'Director Financiero y Administrativo';
  const polizaPendiente = !!reqPoliza?.requisitionId && !reqPoliza?.error && !reqPoliza?.estado;
  const puedeResolverPoliza = esDirAdminFinanciera && enPolizas && polizaPendiente;
  // Mientras la póliza esté pendiente, el avance a "Aprobación (Jurídica)" ocurre al
  // aprobar la requisición (Daniela), no con el botón manual "Pólizas solicitadas".
  const accionesVisibles = polizaPendiente
    ? acciones.filter((a) => a.accion !== 'polizas_solicitadas')
    : acciones;

  return (
    <div className="no-print mb-6 bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-700))]">Estado del flujo:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>{estadoLabel(estado)}</span>
        {sla && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 ${sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {sla.vencida ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {sla.vencida ? 'Vencida' : 'A tiempo'} · vence {fmtFecha(sla.vence)} ({sla.diasHabiles} día{sla.diasHabiles !== 1 ? 's' : ''} háb.)
          </span>
        )}
        {ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">sin plazo</span>
        )}
      </div>

      {accionesVisibles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {accionesVisibles.map((a) => (
            <Button
              key={a.accion}
              onClick={() => onAccion(a.accion, a.requiereMotivo)}
              variant={a.tone === 'danger' ? 'outline' : 'default'}
              className={a.tone === 'danger'
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white'}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {accionesVisibles.length === 0 && !terminal && !puedeResolverPoliza && (
        <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">No tienes acciones disponibles en este estado.</p>
      )}
      {terminal && <p className="text-xs font-medium text-green-700">✓ Contrato en ejecución. Flujo finalizado.</p>}

      {/* Requisición de la póliza creada automáticamente en Gestión de Compras. */}
      {enPolizas && reqPoliza && (
        <div className="space-y-2 rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] p-3">
          {reqPoliza.error ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              No se pudo crear la requisición de la póliza automáticamente: {reqPoliza.error}
            </p>
          ) : (
            <p className="text-xs font-medium text-green-700">
              ✓ Requisición de la póliza creada en Gestión de Compras
              {reqPoliza.requisitionNumber ? <> · N.º <span className="font-mono">{reqPoliza.requisitionNumber}</span></> : null}.
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
        </div>
      )}

      {sol.historial && sol.historial.length > 0 && (
        <div className="pt-3 border-t border-[hsl(var(--canalco-neutral-200))]">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--canalco-neutral-500))] uppercase tracking-wide mb-2">
            <History className="w-3.5 h-3.5" /> Historial
          </p>
          <ul className="space-y-1.5">
            {[...sol.historial].reverse().map((h, i) => (
              <li key={i} className="text-xs text-[hsl(var(--canalco-neutral-700))] flex flex-wrap gap-x-2">
                <span className="text-[hsl(var(--canalco-neutral-400))] font-mono">{fmtFechaHora(h.fecha)}</span>
                <span className="font-medium">{estadoLabel(h.estado)}</span>
                {h.userName && <span className="text-[hsl(var(--canalco-neutral-500))]">· {h.userName}</span>}
                {h.motivo && <span className="italic text-red-600">— {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
