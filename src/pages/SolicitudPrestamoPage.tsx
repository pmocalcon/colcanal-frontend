import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Clock, ExternalLink, History, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvisoAnulacion, BotonesAnulacion } from '@/components/gestionConocimiento/Anulacion';
import { CamposFaltantes } from '@/components/gestionConocimiento/CamposFaltantes';
import { PRESTAMO_OBLIGATORIOS, etiquetasFaltantes } from '@/utils/camposObligatorios';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { FORMATO_PRESTAMO } from '@/config/formatosGestion';
import {
  type PrestamoEstado,
  type PrestamoTransicion,
  accionesDisponibles,
  calcularSla,
  estadoLabel,
  estadoBadgeClass,
  PRESTAMO_ESTADOS,
  esTerminal,
  esEditable,
} from '@/utils/prestamoWorkflow';
import { textoSla } from '@/utils/juridicaWorkflow';
import {
  llenarVacios, estadoCivilDeFicha, tipoDocumentoDeFicha,
} from '@/utils/prellenarFormato';
import { useCompuertaCedula } from '@/hooks/useCompuertaCedula';
import { AvisoCedula } from '@/components/gestionConocimiento/AvisoCedula';

/**
 * Solicitud de Préstamo (G. de talento humano).
 *
 * Es un **formulario impreso**, no un documento de texto: casillas, renglones y tres
 * bloques. Por eso no usa `TextoEd` —no hay párrafos que reescribir— sino campos.
 *
 * Las tres firmas del papel son los tres pasos del trámite: el empleado lo diligencia y
 * lo envía, la Dirección Administrativa firma y Gerencia aprueba fijando el valor del
 * bloque 3. Cada firma la estampa el backend con el nombre de quien ejecutó el paso y la
 * fecha del sistema, así que no hay campo donde escribir un nombre ajeno.
 *
 * Fuera del borrador el formato queda de solo lectura: lo que se firmó es lo que se ve.
 *
 * @see prestamoWorkflow — la máquina de estados, espejo de la del backend.
 *
 * Ruta: `.../talento-humano/prestamo/:id`.
 */

type EstadoCivil = 'soltero' | 'casado' | 'union-libre' | 'viudo' | 'separado';
type TipoDocumento = 'CC' | 'TI' | 'CE';

const ESTADOS_CIVILES: { key: EstadoCivil; label: string }[] = [
  { key: 'soltero', label: 'Soltero' },
  { key: 'casado', label: 'Casado' },
  { key: 'union-libre', label: 'Unión libre' },
  { key: 'viudo', label: 'Viudo' },
  { key: 'separado', label: 'Separado' },
];

const TIPOS_DOCUMENTO: { key: TipoDocumento; label: string }[] = [
  { key: 'CC', label: 'C.C.' },
  { key: 'TI', label: 'T.I.' },
  { key: 'CE', label: 'C.E.' },
];

interface PrestamoState {
  // 1. Información básica
  primerApellido: string;
  segundoApellido: string;
  primerNombre: string;
  segundoNombre: string;
  /** Los cuatro anteriores juntos. Se arma al guardar: es lo que muestra el listado. */
  nombreCompleto: string;
  estadoCivil: EstadoCivil | '';
  tipoDocumento: TipoDocumento | '';
  numero: string;
  expedida: string;
  direccion: string;
  barrio: string;
  municipio: string;
  departamento: string;
  telefonoResidencia: string;
  celular: string;
  otros: string;

  // 2. Datos laborales
  cargo: string;
  area: string;
  salario: string;
  valorSolicitado: string;
  motivo: string;

  /*
   * Condiciones del préstamo. Las fija Dirección Administrativa cuando la solicitud
   * está en su paso, no el empleado al pedirlo.
   */
  fechaDesembolso: string;
  numeroCuotas: string;
  valorCuota: string;
  /**
   * Enlace al pagaré ya firmado, que la política del formato exige antes de entregar el
   * dinero. Se guarda el enlace y no el archivo, igual que el soporte del permiso: el
   * formato se imprime y un adjunto dentro del sistema no viaja con el papel.
   */
  pagareLink: string;

  // 3. Uso exclusivo de la empresa
  valorAprobado: string;

  /*
   * Firmas del formato. No se escriben a mano: las estampa el backend al ejecutar
   * cada paso del flujo, con el nombre de quien lo ejecutó y la fecha del sistema.
   * Acá solo se muestran.
   */
  firmaEmpleado: string; fechaFirmaEmpleado: string;
  firmaAdministrativa: string; fechaFirmaAdministrativa: string;
  firmaGerencia: string; fechaFirmaGerencia: string;
}

const EMPTY: PrestamoState = {
  primerApellido: '', segundoApellido: '', primerNombre: '', segundoNombre: '',
  nombreCompleto: '',
  estadoCivil: '', tipoDocumento: '',
  numero: '', expedida: '',
  direccion: '', barrio: '', municipio: '', departamento: '',
  telefonoResidencia: '', celular: '', otros: '',
  cargo: '', area: '', salario: '',
  valorSolicitado: '', motivo: '',
  fechaDesembolso: '', numeroCuotas: '', valorCuota: '', pagareLink: '',
  valorAprobado: '',
  firmaEmpleado: '', fechaFirmaEmpleado: '',
  firmaAdministrativa: '', fechaFirmaAdministrativa: '',
  firmaGerencia: '', fechaFirmaGerencia: '',
};

// Lo diligencia el empleado, así que no se restringe a un área: lo abre quien lo pide.
// Quien no pueda editarlo igual lo consulta e imprime.

export default function SolicitudPrestamoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PrestamoState>(EMPTY);
  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const estado = (sol?.estado as PrestamoEstado | undefined) ?? undefined;
  // El formato solo se diligencia en borrador: una vez enviado, lo que se ve es lo
  // que firmaron los demás, y editarlo por debajo dejaría firmas sobre otro texto.
  const locked = !esEditable(estado ?? null);
  const esCreador = sol?.createdBy != null && sol.createdBy === user?.userId;
  /** Sin ficha no hay a quién prestarle: solo la casilla del número queda abierta. */
  const compuerta = useCompuertaCedula(f.numero);
  const bloqueado = locked || !compuerta.lista;
  const { abrirGuardada } = compuerta;
  /** Aprobado o anulado: ya no se le adjunta nada. */
  const terminalPrestamo = esTerminal(estado ?? '');
  // Fuera del borrador hay dos zonas que sí se diligencian, cada una en su paso y por
  // quien manda ahí: las condiciones del préstamo son de Dirección Administrativa y el
  // valor aprobado es de Gerencia. Ambas viajan con la acción, no con «Guardar».
  const editaAdministrativa =
    estado === 'pendiente_administrativa' &&
    accionesDisponibles(estado, user?.nombreRol, esCreador).some((a) => a.accion === 'aprobar_administrativa');
  const puedeAprobarGerencia =
    estado === 'pendiente_gerencia' &&
    accionesDisponibles(estado, user?.nombreRol, esCreador).some((a) => a.accion === 'aprobar_gerencia');

  /**
   * Con la cédula se trae lo que ya está en la ficha de personal.
   *
   * Se dispara al salir de la casilla y no en cada tecla: mientras se escribe, «11448» es
   * una cédula distinta cada vez y serían siete consultas para una sola persona.
   *
   * Solo llena lo que está en blanco. Si alguien escribió algo distinto puede ser que la
   * ficha esté vieja —un traslado que Talento Humano no ha registrado—, y pisárselo le
   * borraría el trabajo delante de los ojos.
   */
  const prellenar = async (cedula: string) => {
    if (locked) return;
    const { ficha, veniaDeOtra } = await compuerta.validar(cedula);
    if (!ficha) return;
    const deLaFicha = {
      primerApellido: ficha.primerApellido,
      segundoApellido: ficha.segundoApellido,
      primerNombre: ficha.primerNombre,
      segundoNombre: ficha.segundoNombre,
      estadoCivil: estadoCivilDeFicha(ficha.estadoCivil),
      tipoDocumento: tipoDocumentoDeFicha(ficha.tipoId),
      cargo: ficha.cargo ?? '',
      area: ficha.area ?? '',
      // Llega en nulo salvo para quien ya ve la nómina; ahí se digita como siempre.
      salario: ficha.salario ? String(Math.round(Number(ficha.salario))) : '',
    };
    // Reemplazar una cédula ya validada por otra sí pisa el bloque de datos personales:
    // si no, quedaría el nombre de la persona anterior junto a la cédula nueva.
    setF((p) => (veniaDeOtra ? { ...p, ...deLaFicha } : llenarVacios(p, deLaFicha)));
  };

  const set = <K extends keyof PrestamoState>(k: K, v: PrestamoState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  /*
   * El nombre de la autorización sale del bloque 1 y no es un campo aparte.
   *
   * El «Yo …» de abajo es el mismo que diligenció el formato —no puede ser otro—, y con
   * dos campos el papel podría acabar autorizando a una persona distinta de la que pide
   * el préstamo. Se arma acá, en pantalla, y se guarda al grabar.
   */
  const nombreCompleto = [f.primerNombre, f.segundoNombre, f.primerApellido, f.segundoApellido]
    .map((s) => s.trim()).filter(Boolean).join(' ');

  useEffect(() => {
    if (docId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const row = await gestionConocimientoService.get(docId);
        if (cancelled) return;
        setSol(row);
        const datos = { ...EMPTY, ...(row.data ?? {}) as Partial<PrestamoState> };
        setF(datos);
        // Lo ya guardado no se vuelve a pedir: la compuerta es para la solicitud nueva.
        abrirGuardada(datos.numero);
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId, abrirGuardada]);

  const recargar = async () => {
    if (docId === null) return;
    try {
      const row = await gestionConocimientoService.get(docId);
      setSol(row);
      const datos = { ...EMPTY, ...(row.data ?? {}) as Partial<PrestamoState> };
      setF(datos);
      abrirGuardada(datos.numero);
    } catch { /* si falla la recarga, la pantalla se queda con lo que ya tenía */ }
  };

  /**
   * Guarda el enlace del pagaré cuando el formato ya salió del borrador.
   *
   * En borrador viaja con «Guardar», como todo lo demás. Después, el documento está
   * cerrado y el enlace entra por su propia puerta —la que existe justamente porque el
   * pagaré se firma cuando ya aprobaron—. Se dispara al salir de la casilla y no en cada
   * tecla: si no, sería una petición por letra escrita.
   */
  const guardarPagare = async () => {
    if (!docId || !locked) return;
    if ((sol?.data?.pagareLink ?? '') === f.pagareLink) return;
    try {
      const guardada = await gestionConocimientoService.saveEnlaceSoporte(docId, 'pagareLink', f.pagareLink);
      setSol(guardada);
      toast.success('Soporte del pagaré guardado');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar el enlace');
    }
  };

  /**
   * `motivoDado` llega de la anulación, que pide el motivo en su propio cuadro de
   * diálogo —ahí cabe una explicación de verdad y se puede decir antes qué va a pasar—.
   * El resto del flujo sigue con el prompt del navegador, que para un «devolver» de una
   * línea alcanza.
   */
  const handleTransicion = async (accion: string, requiereMotivo?: boolean, motivoDado?: string) => {
    let motivo: string | undefined = motivoDado?.trim() || undefined;
    if (requiereMotivo && !motivo) {
      const m = window.prompt('Indica el motivo:');
      if (m === null) return;
      if (!m.trim()) { toast.error('Debes indicar el motivo'); return; }
      motivo = m.trim();
    }
    // Cada paso manda lo suyo: Administrativa las condiciones del préstamo y Gerencia
    // el valor aprobado, que puede ser distinto al solicitado.
    const data =
      accion === 'aprobar_administrativa'
        ? {
            fechaDesembolso: f.fechaDesembolso,
            numeroCuotas: f.numeroCuotas,
            valorCuota: f.valorCuota,
          }
        : accion === 'aprobar_gerencia'
          ? { valorAprobado: f.valorAprobado }
          : undefined;
    try {
      await gestionConocimientoService.transition(docId!, { accion, motivo, data });
      toast.success('Acción registrada');
      await recargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo ejecutar la acción');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Se guarda armado para que el listado lo lea directo: el listado lee `data` en
      // crudo y no tiene por qué saber cómo se compone un nombre en este formato.
      const guardada = await gestionConocimientoService.guardar(docId, {
        gestion: 'talento-humano',
        formato: FORMATO_PRESTAMO,
        data: { ...f, nombreCompleto },
      });
      setF((p) => ({ ...p, nombreCompleto }));
      setSol(guardada);
      toast.success('Solicitud guardada');
      // Si acaba de nacer, la pantalla pasa a su URL definitiva: sin esto el
      // siguiente guardado crearía una segunda solicitud.
      if (docId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/prestamo/${guardada.solicitudId}`,
          { replace: true },
        );
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'No se pudo guardar');
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
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/prestamo')} title="Volver a las solicitudes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Solicitud de préstamo</h1>
            <p className="text-xs text-[#4a4a63]">
              Formato GTH-008-F · Solicitud N.º {docId}{user?.nombre ? ` · ${user.nombre}` : ''}
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {/* Fuera del borrador el formato ya no se edita: guardar no tendría qué guardar. */}
          {!locked && (
            <Button onClick={handleSave} disabled={saving || !compuerta.lista} title={compuerta.lista ? undefined : 'Primero digita la cédula del colaborador'} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* El flujo aparece cuando la solicitud existe: en blanco todavía no hay nada
            que enviar ni a quién avisarle. */}
        {sol && (
          <PrestamoWorkflowPanel
            sol={sol}
            nombreRol={user?.nombreRol}
            esCreador={esCreador}
            onAccion={handleTransicion}
          />
        )}

        {/* Lo que falta por diligenciar, recalculado en cada tecla. El servidor lo
            vuelve a comprobar al enviar y es el que manda; esto existe para no llegar
            hasta el boton para enterarse de que faltaba una casilla. Solo mientras se
            puede escribir: en un formato ya enviado nadie podria corregirlo. */}
        {!locked && (
          <div className="mb-4">
            {!compuerta.lista && (
              <div className="mb-2">
                <AvisoCedula
                  buscando={compuerta.buscando}
                  sinFicha={compuerta.sinFicha}
                  etiqueta="la casilla «Número» de la cédula"
                />
              </div>
            )}
            <CamposFaltantes faltan={etiquetasFaltantes(PRESTAMO_OBLIGATORIOS, f)} />
          </div>
        )}

        <div className="doc bg-white border border-black text-[11px] text-black shadow-md">

          {/* Encabezado del formato */}
          <div className="grid grid-cols-[130px_1fr_130px_150px] border-b border-black">
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-10 object-contain" />
            </div>
            <div className="flex items-center justify-center text-center px-3 py-2 font-bold text-[13px] tracking-wide border-r border-black text-[#4a4a63]">
              SOLICITUD DE PRÉSTAMO
            </div>
            <div className="flex items-center justify-center p-2 border-r border-black">
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-10 object-contain" />
            </div>
            <div className="grid grid-cols-[auto_1fr] text-[10px] content-start">
              <Meta label="CÓDIGO:" value="GTH-008-F" />
              <Meta label="FECHA:" value="31/08/2026" />
              <Meta label="VERSIÓN:" value="2" last />
            </div>
          </div>

          <p className="px-2 py-1 font-bold italic text-[9px] border-b border-black">
            Diligencie todos los espacios del formato en tinta negra, si no aplica coloque una línea
          </p>

          {/* ── 1. Información básica ── */}
          <Seccion titulo="1. INFORMACIÓN BÁSICA" />

          <div className="grid grid-cols-4 border-b border-black">
            <Celda label="1er Apellido" value={f.primerApellido} onChange={(v) => set('primerApellido', v)} readOnly={bloqueado} />
            <Celda label="2do Apellido" value={f.segundoApellido} onChange={(v) => set('segundoApellido', v)} readOnly={bloqueado} />
            <Celda label="1er Nombre" value={f.primerNombre} onChange={(v) => set('primerNombre', v)} readOnly={bloqueado} />
            <Celda label="2do Nombre" value={f.segundoNombre} onChange={(v) => set('segundoNombre', v)} readOnly={bloqueado} last />
          </div>

          <div className="px-2 py-1.5 border-b border-black flex items-center gap-4 flex-wrap">
            <span className="font-bold">Estado Civil:</span>
            {ESTADOS_CIVILES.map((e) => (
              <Casilla
                key={e.key}
                label={e.label}
                checked={f.estadoCivil === e.key}
                onToggle={() => set('estadoCivil', f.estadoCivil === e.key ? '' : e.key)}
                disabled={bloqueado}
              />
            ))}
          </div>

          <div className="px-2 py-1.5 border-b border-black flex items-center gap-4 flex-wrap">
            <span className="font-bold">Identificación:</span>
            {TIPOS_DOCUMENTO.map((t) => (
              <Casilla
                key={t.key}
                label={t.label}
                checked={f.tipoDocumento === t.key}
                onToggle={() => set('tipoDocumento', f.tipoDocumento === t.key ? '' : t.key)}
                disabled={bloqueado}
              />
            ))}
          </div>

          <div className="px-2 py-1.5 border-b border-black grid grid-cols-2 gap-6">
            <Renglon
              label="Número:"
              value={f.numero}
              onChange={(v) => set('numero', v)}
              onSalir={() => void prellenar(f.numero)}
              readOnly={locked}
              nota={locked ? undefined : 'Escribe la cédula y sal de la casilla: el resto se llena solo.'}
            />
            <Renglon label="Expedida:" value={f.expedida} onChange={(v) => set('expedida', v)} readOnly={bloqueado} />
          </div>

          <div className="grid grid-cols-4 border-b border-black">
            <Celda label="Dirección residencia:" value={f.direccion} onChange={(v) => set('direccion', v)} readOnly={bloqueado} />
            <Celda label="Barrio:" value={f.barrio} onChange={(v) => set('barrio', v)} readOnly={bloqueado} />
            <Celda label="Municipio:" value={f.municipio} onChange={(v) => set('municipio', v)} readOnly={bloqueado} />
            <Celda label="Departamento:" value={f.departamento} onChange={(v) => set('departamento', v)} readOnly={bloqueado} last />
          </div>

          <div className="grid grid-cols-3 border-b border-black">
            <Celda label="Teléfono residencia:" value={f.telefonoResidencia} onChange={(v) => set('telefonoResidencia', v)} readOnly={bloqueado} />
            <Celda label="Celular:" value={f.celular} onChange={(v) => set('celular', v)} readOnly={bloqueado} />
            <Celda label="Otros:" value={f.otros} onChange={(v) => set('otros', v)} readOnly={bloqueado} last />
          </div>

          {/* ── 2. Datos laborales ── */}
          <Seccion titulo="2. DATOS LABORALES" />

          <div className="grid grid-cols-3 border-b border-black">
            <Celda label="Cargo:" value={f.cargo} onChange={(v) => set('cargo', v)} readOnly={bloqueado} />
            <Celda label="Area:" value={f.area} onChange={(v) => set('area', v)} readOnly={bloqueado} />
            <Celda label="Salario:" value={f.salario} onChange={(v) => set('salario', v)} readOnly={bloqueado} last />
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="px-2 py-2 border-r border-black">
              <span className="font-bold">Valor del Préstamo Solicitado: </span>
              <span className="font-bold">$</span>
              <input
                value={f.valorSolicitado}
                onChange={(e) => set('valorSolicitado', e.target.value)}
                readOnly={bloqueado}
                className="w-32 bg-transparent outline-none border-b border-black ml-1 text-[11px]"
              />
            </div>
            <Celda label="Motivo de la Solicitud:" value={f.motivo} onChange={(v) => set('motivo', v)} readOnly={bloqueado} last area />
          </div>

          {/* Va antes de las condiciones porque es del solicitante y aquéllas son de
              Dirección Administrativa: el formato se lee de arriba abajo cambiando de
              dueño una sola vez.

              Se puede escribir en el borrador y también después de radicado, porque la
              política dice que el pagaré se firma «antes de la entrega del dinero», o sea
              cuando ya aprobaron. Si solo se pudiera en borrador habría que adjuntar un
              documento que todavía no existe; si solo después, no se podría dejar listo
              cuando ya se tiene. */}
          <div className="px-2 py-1 border-b border-black flex items-baseline gap-2">
            <span className="font-bold whitespace-nowrap">Soporte del pagaré:</span>
            <span className="font-normal italic text-[9px] text-[#4a4a63] whitespace-nowrap">
              (lo adjunta el solicitante · el pagaré debe estar firmado)
            </span>
            <input
              value={f.pagareLink}
              onChange={(v) => set('pagareLink', v.target.value)}
              onBlur={guardarPagare}
              readOnly={locked && (!esCreador || terminalPrestamo)}
              placeholder="Enlace al pagaré YA FIRMADO"
              className="flex-grow min-w-0 bg-transparent outline-none border-b border-black text-[11px]"
            />
            {/* En el impreso el enlace se lee; en pantalla abre el documento. */}
            {f.pagareLink.trim() && (
              <a
                href={f.pagareLink.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="no-print inline-flex items-center gap-1 text-[10px] text-blue-700 underline whitespace-nowrap"
              >
                <ExternalLink className="w-3 h-3" /> Abrir
              </a>
            )}
          </div>
          {/* La advertencia va en el formato y no solo en la pantalla: el papel se
              archiva, y quien lo revise dentro de un año tiene que poder ver que lo que
              se exigia era un pagare firmado, no cualquier borrador. */}
          <p className="px-2 py-1 text-[8.5px] italic text-[#4a4a63] border-b border-black">
            El documento del pagaré que se enlace debe estar <b>firmado</b>. Un pagaré sin
            firma no sirve como soporte para la empresa.
          </p>

          {/* Condiciones del préstamo: cómo se desembolsa y cómo se descuenta. Las fija
              Dirección Administrativa en su paso, que es quien conoce la nómina; el
              empleado las ve pero no las escribe. */}
          <div className="px-2 py-1 font-bold border-b border-black bg-[hsl(var(--canalco-neutral-100))] flex items-baseline gap-2">
            <span>CONDICIONES DEL PRÉSTAMO</span>
            <span className="font-normal italic text-[9px] text-[#4a4a63]">
              (las diligencia Dirección Administrativa)
            </span>
          </div>

          <div className="grid grid-cols-3 border-b border-black">
            <Celda
              label="Fecha de desembolso:"
              value={f.fechaDesembolso}
              onChange={(v) => set('fechaDesembolso', v)}
              readOnly={!editaAdministrativa}
            />
            <Celda
              label="N.° de cuotas:"
              value={f.numeroCuotas}
              onChange={(v) => set('numeroCuotas', v)}
              readOnly={!editaAdministrativa}
            />
            <Celda
              label="Valor de la cuota:"
              value={f.valorCuota}
              onChange={(v) => set('valorCuota', v)}
              readOnly={!editaAdministrativa}
              last
            />
          </div>

          {/* Política */}
          <p className="px-2 py-2 text-[8.5px] text-justify border-b border-black leading-snug">
            <b>Política de la empresa: </b>
            De acuerdo a como usted firmó la solicitud de un préstamo, que en caso de su aprobación
            por el Área Administrativa y Financiera será descontado de la nómina en forma mensual
            además firmará un pagaré, antes de la entrega del dinero como soporte para la empresa.
          </p>


          {/* Firmas del empleado y de Administrativa */}
          <div className="grid grid-cols-2 border-b border-black">
            <FirmaCelda titulo="Firma Empleado" nombre={nombreCompleto} cedula={f.numero} fecha={f.fechaFirmaEmpleado} />
            <FirmaCelda
              titulo={'Firma Dirección\nAdministrativa y Financiera'}
              nombre={f.firmaAdministrativa}
              fecha={f.fechaFirmaAdministrativa}
              last
            />
          </div>

          {/* ── 3. Uso exclusivo de la empresa ── */}
          <Seccion titulo="3. ESPACIO PARA USO EXCLUSIVO DE LA EMPRESA" />

          <div className="grid grid-cols-2 border-b border-black">
            {/* El bloque 3 es de la empresa: el valor solo lo escribe Gerencia, y solo
                en su paso del flujo. Va con la acción de aprobar, no con «Guardar». */}
            <div className="px-2 py-2 border-r border-black text-center">
              <p className="font-bold">Valor<br />Aprobado</p>
              <div className="flex items-end justify-center gap-1 mt-8">
                <span className="font-bold">$</span>
                <input
                  value={f.valorAprobado}
                  onChange={(e) => set('valorAprobado', e.target.value)}
                  readOnly={!puedeAprobarGerencia}
                  placeholder={puedeAprobarGerencia ? f.valorSolicitado : ''}
                  className="w-40 bg-transparent outline-none border-b border-black text-[11px] text-center"
                />
              </div>
              {puedeAprobarGerencia && (
                <p className="no-print mt-1 text-[9px] text-[#4a4a63]">
                  En blanco se aprueba por el valor solicitado.
                </p>
              )}
            </div>
            <div className="px-2 py-2 text-center">
              <p className="font-bold">Firma de<br />Aprobación</p>
              <div className="mt-8 mx-auto w-48 border-b border-black h-4" />
              {f.firmaGerencia && <p className="leading-tight">{f.firmaGerencia}</p>}
              {f.fechaFirmaGerencia && (
                <p className="text-[9px] text-[#4a4a63] leading-tight">{fmtFecha(f.fechaFirmaGerencia)}</p>
              )}
              <p className="mt-1">GERENCIA</p>
            </div>
          </div>

          <p className="px-2 py-1.5 text-center text-[9px]">
            Declaro que los datos suministrados corresponden a mi realidad económica y me hago
            responsable de la veracidad de ellos
          </p>
        </div>

        {/* Autorización de descuento. Va en su propio recuadro, fuera de la cuadrícula del
            formato, tal como está en el papel. */}
        <div className="doc bg-white border border-black rounded-2xl text-[11px] text-black shadow-md mt-4 px-6 py-5 leading-relaxed">
          <p className="text-justify">
            Yo <Sobre valor={nombreCompleto} ancho="w-72" /> identificado con cédula de ciudadanía{' '}
            <Sobre valor={f.numero} ancho="w-44" />, autorizo a la empresa para que descuente de mi
            nómina mensual y/o liquidación, el saldo de las deudas pendientes, que en el momento de
            terminación de contrato no hayan sido cubiertas dentro de la proyección inicial del
            préstamo solicitado.
          </p>

          {/* El nombre y la cédula salen del bloque 1: quien autoriza el descuento es
              el mismo que pide el préstamo, así que no se vuelven a escribir. */}
          <div className="mt-8">
            <span className="inline-flex items-baseline gap-2">
              Firma:
              <span className="inline-block w-56 border-b border-black h-4" />
            </span>
            <p className="mt-1 pl-10 leading-tight">{nombreCompleto}</p>
            <p className="pl-10 leading-tight">CC. {f.numero}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Flujo de aprobación ────────────────────────────────── */

const fmtFecha = (d?: string | Date | null) =>
  d ? new Date(`${d}`.length === 10 ? `${d}T00:00:00` : `${d}`).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '';

const fmtFechaHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Estado del trámite, botones del paso que toca y bitácora. No se imprime: el papel
 * lleva las firmas, no el recorrido.
 */
function PrestamoWorkflowPanel({ sol, nombreRol, esCreador, onAccion }: {
  sol: GcSolicitud;
  nombreRol?: string;
  esCreador: boolean;
  onAccion: (accion: string, requiereMotivo?: boolean, motivo?: string) => void | Promise<void>;
}) {
  const estado = sol.estado as PrestamoEstado;
  const acciones = accionesDisponibles(estado, nombreRol, esCreador);
  const sla = calcularSla(estado, sol.estadoDesde);
  const terminal = esTerminal(estado);

  return (
    <div className="no-print mb-6 bg-white border border-[#e6e6f0] rounded-xl shadow-sm p-4 space-y-4">
      <AvisoAnulacion sol={sol} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[#4a4a63]">Estado del trámite:</span>
        <span className={`text-sm font-medium rounded px-2.5 py-1 ${estadoBadgeClass(estado)}`}>
          {estadoLabel(estado)}
        </span>
        {sla && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1 ${sla.vencida ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {sla.vencida ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {textoSla(sla)}
          </span>
        )}
        {PRESTAMO_ESTADOS[estado]?.sla == null && !terminal && (
          <span className="text-xs text-[#8a8aa3]">sin plazo</span>
        )}
      </div>

      {acciones.some((a) => a.accion === 'aprobar_administrativa') && (
        <p className="text-xs text-[#4a4a63]">
          Antes de firmar, diligencia las <b>condiciones del préstamo</b> —desembolso, cuotas y
          valor de la cuota—: se guardan con tu firma.
        </p>
      )}

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a: PrestamoTransicion) => (
            <Button
              key={a.accion}
              onClick={() => onAccion(a.accion, a.requiereMotivo)}
              variant={a.tone === 'danger' ? 'outline' : 'default'}
              className={a.tone === 'danger'
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]'}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {acciones.length === 0 && !terminal && (
        <p className="text-xs text-[#8a8aa3]">No tienes acciones disponibles en este estado.</p>
      )}
      {estado === 'aprobado' && (
        <p className="text-xs font-medium text-green-700">
          ✓ Préstamo aprobado. Imprime el formato para archivarlo con las firmas.
        </p>
      )}

      {/* Anular no es un paso del trámite sino salirse de él, así que va separado
          de «Aprobar» y «Devolver». Quien la puede pedir es el solicitante o quien
          la tenga ahora en su bandeja; el backend lo vuelve a comprobar. */}
      <BotonesAnulacion
        estado={estado}
        nombreRol={nombreRol}
        puedeSolicitar={esCreador || acciones.length > 0}
        onAccion={onAccion}
      />

      {sol.historial && sol.historial.length > 0 && (
        <div className="pt-3 border-t border-[#e6e6f0]">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#8a8aa3] uppercase tracking-wide mb-2">
            <History className="w-3.5 h-3.5" /> Historial
          </p>
          <ul className="space-y-1.5">
            {[...sol.historial].reverse().map((h, i) => (
              <li key={i} className="text-xs text-[#4a4a63] flex flex-wrap gap-x-2">
                <span className="text-[#a8a8bd] font-mono">{fmtFechaHora(h.fecha)}</span>
                <span className="font-medium">{estadoLabel(h.estado)}</span>
                {h.userName && <span className="text-[#8a8aa3]">· {h.userName}</span>}
                {h.motivo && <span className="italic text-red-600">— {h.motivo}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

function Meta({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <>
      <div className={'px-2 py-1 font-semibold ' + (last ? '' : 'border-b border-black')}>{label}</div>
      <div className={'px-2 py-1 text-center border-l border-black ' + (last ? '' : 'border-b border-black')}>{value}</div>
    </>
  );
}

function Seccion({ titulo }: { titulo: string }) {
  return (
    <div className="px-2 py-1 font-bold border-b border-black bg-[hsl(var(--canalco-neutral-100))]">
      {titulo}
    </div>
  );
}

/** Casilla del formato: cuadrito y etiqueta, excluyente dentro de su fila. */
function Casilla({ label, checked, onToggle, disabled }: {
  label: string; checked: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <label className={'inline-flex items-center gap-1.5 ' + (disabled ? '' : 'cursor-pointer')}>
      <span className="order-2">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="order-1 w-3.5 h-3.5 accent-black"
      />
    </label>
  );
}

/** Celda con etiqueta arriba y el espacio para escribir debajo. */
function Celda({ label, value, onChange, last, area, readOnly }: {
  label: string; value: string; onChange: (v: string) => void;
  last?: boolean; area?: boolean; readOnly?: boolean;
}) {
  return (
    <div className={'px-2 py-1 ' + (last ? '' : 'border-r border-black')}>
      <span className="font-bold">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          rows={2}
          className="w-full bg-transparent outline-none resize-none text-[11px]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className="w-full bg-transparent outline-none text-[11px]"
        />
      )}
    </div>
  );
}

/** «Etiqueta: ______» en una sola línea, como los renglones del formato. */
function Renglon({ label, value, onChange, readOnly, onSalir, nota }: {
  label: string; value: string; onChange: (v: string) => void; readOnly?: boolean;
  /** Al salir de la casilla o al pulsar Enter. Lo usa la cédula para traer la ficha. */
  onSalir?: () => void;
  /** Ayuda que se ve en pantalla y no en el papel: `no-print`. */
  nota?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-bold whitespace-nowrap">{label}</span>
      <span className="flex-grow min-w-0">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onSalir}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSalir?.(); } }}
          readOnly={readOnly}
          className="w-full bg-transparent outline-none border-b border-black text-[11px]"
        />
        {nota && <span className="no-print block text-[9px] text-[#4a4a63]">{nota}</span>}
      </span>
    </div>
  );
}

/**
 * Renglón con el dato escrito encima, como el «Yo ______» del papel. Es de solo lectura:
 * el dato vive en el bloque 1 y se edita allá.
 */
function Sobre({ valor, ancho }: { valor: string; ancho: string }) {
  return (
    <span className={`inline-block ${ancho} border-b border-black text-center align-baseline`}>
      {valor || ' '}
    </span>
  );
}

/**
 * Recuadro de firma: el espacio se firma a mano sobre el impreso.
 *
 * `nombre` y `cedula` van debajo del renglón, como en el papel, y salen del bloque 1.
 * Solo los lleva la firma del empleado: las otras dos las firma quien corresponda y
 * ponerle ahí el nombre del solicitante diría que firmó él.
 */
function FirmaCelda({ titulo, nombre, cedula, fecha, last }: {
  titulo: string; nombre?: string; cedula?: string; fecha?: string; last?: boolean;
}) {
  return (
    <div className={'px-2 py-2 text-center ' + (last ? '' : 'border-r border-black')}>
      <p className="font-bold whitespace-pre-line">{titulo}</p>
      <div className="mt-10 mx-auto w-56 border-b border-black h-4" />
      {(nombre || cedula || fecha) && (
        <div className="mt-1 leading-tight">
          {nombre && <p>{nombre}</p>}
          {cedula && <p>CC. {cedula}</p>}
          {fecha && <p className="text-[9px] text-[#4a4a63]">{fmtFecha(fecha)}</p>}
        </div>
      )}
    </div>
  );
}
