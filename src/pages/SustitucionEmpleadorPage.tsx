import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { EncabezadoFormato } from '@/components/juridica/EncabezadoFormato';
import { FORMATO_SUSTITUCION_EMPLEADOR } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Acta de sustitución de empleador y continuidad laboral.
 *
 * Formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = SUSTITUCION-EMPLEADOR). Se diligencia, se guarda y se imprime para firmarlo
 * en papel; no tiene máquina de estados, así que se queda en borrador y siempre se puede
 * corregir.
 *
 * Con la cédula del trabajador se traen el nombre y el cargo de la ficha de personal.
 *
 * Ruta: `.../talento-humano/sustitucion-empleador/:id`.
 */

interface SustitucionState {
  // ── Antiguo empleador ──
  antiguoEmpleador: string;
  nitAntiguo: string;
  repAntiguo: string;
  repAntiguoCc: string;

  // ── Nuevo empleador ──
  nuevoEmpleador: string;
  nitNuevo: string;
  repNuevo: string;
  repNuevoCc: string;

  // ── Trabajador ──
  trabajador: string;
  cedula: string;
  cedulaLugar: string;
  cargo: string;
  tipoContrato: string;
  salario: string;

  // ── Fechas ──
  fechaInicial: string;
  fechaSustitucion: string;

  // ── Firma ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * El formato en blanco, con su propio texto como **valor**: un `placeholder` de HTML se ve
 * en pantalla pero no se imprime, y el acta vacía tiene que poder imprimirse para
 * diligenciarla a mano. Los corchetes en mayúscula marcan lo que falta.
 */
const EMPTY: SustitucionState = {
  antiguoEmpleador: '[RAZÓN SOCIAL / UTAP]',
  nitAntiguo: '[NIT]',
  repAntiguo: '[NOMBRE / IDENTIFICACIÓN]',
  repAntiguoCc: '[NÚMERO]',

  nuevoEmpleador: '[RAZÓN SOCIAL / UTAP]',
  nitNuevo: '[NIT]',
  repNuevo: '[NOMBRE / IDENTIFICACIÓN]',
  repNuevoCc: '[NÚMERO]',

  trabajador: '[NOMBRE COMPLETO]',
  cedula: '[NÚMERO]',
  cedulaLugar: '[LUGAR DE EXPEDICIÓN]',
  cargo: '[CARGO]',
  tipoContrato: '[A TÉRMINO INDEFINIDO / FIJO / OBRA O LABOR]',
  salario: '[VALOR]',

  fechaInicial: '[DD/MM/AAAA]',
  fechaSustitucion: '[DD/MM/AAAA]',

  ciudad: '[CIUDAD]',
  dia: '[DÍA]',
  mes: '[MES]',
  anio: '[AÑO]',

  textos: {},
};

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('jurid') || r.includes('juríd') || r.includes('humano') || r.includes('talento');
};

export default function SustitucionEmpleadorPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const actaId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<SustitucionState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof SustitucionState>(k: K, v: SustitucionState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (actaId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(actaId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<SustitucionState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el acta');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [actaId]);

  /** Con la cédula llegan el nombre y el cargo de la ficha; solo llena lo que sigue en plantilla. */
  const prellenar = async () => {
    if (!editable) return;
    const cedula = f.cedula.replace(/\D/g, '');
    if (cedula !== f.cedula) set('cedula', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    setF((p) => ({
      ...p,
      trabajador: (!p.trabajador.trim() || p.trabajador === EMPTY.trabajador) ? nombreDeFicha(ficha) : p.trabajador,
      cargo: (!p.cargo.trim() || p.cargo === EMPTY.cargo) ? (ficha.cargo ?? '') : p.cargo,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(actaId, {
        gestion: 'talento-humano',
        formato: FORMATO_SUSTITUCION_EMPLEADOR,
        data: f,
      });
      toast.success('Acta guardada');
      if (actaId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/sustitucion-empleador/${guardado.solicitudId}`,
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
          @page { size: Letter portrait; margin: 12mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/sustitucion-empleador')} title="Volver a las actas">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Acta de sustitución de empleador</h1>
            <p className="text-xs text-[#4a4a63]">Acta N.º {actaId ?? 'nueva'}</p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
        <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-10 py-8 space-y-4">

            {/* Membrete con recuadro de codificación */}
            <EncabezadoFormato
              codigo="GTH-015-F"
              fecha="01/09/2026"
              titulo={
                <h2 className="font-bold text-[13px] leading-tight">
                  ACTA DE SUSTITUCIÓN DE EMPLEADOR Y CONTINUIDAD LABORAL
                </h2>
              }
            />

            {/* Identificación */}
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <Fila label="Antiguo empleador" value={f.antiguoEmpleador} />
                <Fila label="NIT antiguo empleador" value={f.nitAntiguo} />
                <Fila label="Representante legal antiguo" value={f.repAntiguo} />
                <Fila label="Nuevo empleador" value={f.nuevoEmpleador} />
                <Fila label="NIT nuevo empleador" value={f.nitNuevo} />
                <Fila label="Representante legal nuevo" value={f.repNuevo} />
                <Fila label="Trabajador(a)" value={f.trabajador} />
                <Fila label="Documento" value={`C.C. ${f.cedula} - ${f.cedulaLugar}`} />
                <Fila label="Cargo" value={f.cargo} />
                <Fila label="Fecha inicial de vinculación" value={f.fechaInicial} />
                <Fila label="Fecha efectiva de sustitución" value={f.fechaSustitucion} />
              </tbody>
            </table>

            {/* Comparecencia */}
            <TextoEd
              k="comparecencia"
              plantilla={
                `COMPARECENCIA. Comparecen ${f.antiguoEmpleador}, representado por ${f.repAntiguo}, quien `
                + `en adelante se denominará EL ANTIGUO EMPLEADOR; ${f.nuevoEmpleador}, representado por `
                + `${f.repNuevo}, quien en adelante se denominará EL NUEVO EMPLEADOR; y ${f.trabajador}, `
                + `quien en adelante se denominará EL/LA TRABAJADOR(A), con el propósito de dejar `
                + `constancia de la sustitución de empleador y de la continuidad de la relación laboral, `
                + `en los siguientes términos:`
              }
            />

            {/* Antecedentes */}
            <p className="font-bold pt-2">ANTECEDENTES</p>
            <TextoEd
              k="primero"
              plantilla={
                `PRIMERO. VÍNCULO LABORAL: EL/LA TRABAJADOR(A) se encuentra vinculado(a) mediante `
                + `contrato de trabajo ${f.tipoContrato} desde el ${f.fechaInicial}, desempeñando el `
                + `cargo de ${f.cargo}, con un salario básico mensual de ${f.salario}, sin perjuicio de `
                + `los demás derechos, beneficios y condiciones legal y contractualmente vigentes.`
              }
            />
            <TextoEd
              k="segundo"
              plantilla={
                `SEGUNDO. HECHO QUE ORIGINA LA SUSTITUCIÓN: A partir del ${f.fechaSustitucion}, se produce `
                + `el cambio de empleador de ${f.antiguoEmpleador} a ${f.nuevoEmpleador}, manteniéndose `
                + `la identidad de la actividad, establecimiento, operación o unidad económica respecto `
                + `de la cual EL/LA TRABAJADOR(A) presta sus servicios, según corresponda.`
              }
            />

            {/* Acuerdos y constancias */}
            <p className="font-bold pt-2">ACUERDOS Y CONSTANCIAS</p>
            <TextoEd
              k="acuerdoPrimera"
              plantilla={
                `PRIMERA. SUSTITUCIÓN DE EMPLEADOR: Las partes dejan constancia de que, a partir del `
                + `${f.fechaSustitucion}, EL NUEVO EMPLEADOR asume la posición de empleador respecto de `
                + `EL/LA TRABAJADOR(A), en los términos de los artículos 67 y siguientes del Código `
                + `Sustantivo del Trabajo, siempre que se configuren los presupuestos legales de la `
                + `sustitución.`
              }
            />
            <TextoEd
              k="acuerdoSegunda"
              plantilla={
                `SEGUNDA. CONTINUIDAD DEL CONTRATO: La sustitución de empleador no extingue, suspende ni `
                + `modifica por sí misma el contrato de trabajo existente. En consecuencia, se mantiene la `
                + `continuidad del vínculo, la antigüedad reconocida desde ${f.fechaInicial}, el cargo, el `
                + `salario y las demás condiciones vigentes, salvo las modificaciones que se acuerden `
                + `válidamente por separado y dentro de los límites legales.`
              }
            />
            <TextoEd
              k="acuerdoTercera"
              plantilla={
                `TERCERA. ANTIGÜEDAD Y DERECHOS CAUSADOS: EL NUEVO EMPLEADOR reconocerá para todos los `
                + `efectos laborales la continuidad y antigüedad de EL/LA TRABAJADOR(A) desde la fecha `
                + `inicial indicada. La sustitución no implica liquidación final del contrato ni renuncia, `
                + `transacción o paz y salvo general sobre derechos laborales ciertos e indiscutibles.`
              }
            />
            <TextoEd
              k="acuerdoCuarta"
              plantilla={
                `CUARTA. RESPONSABILIDADES ENTRE EMPLEADORES: Las obligaciones laborales causadas antes, `
                + `al momento y después de la sustitución se atenderán conforme al régimen de `
                + `responsabilidad previsto en el artículo 69 del Código Sustantivo del Trabajo y demás `
                + `normas aplicables. Cualquier acuerdo interno de distribución de cargas entre EL ANTIGUO `
                + `EMPLEADOR y EL NUEVO EMPLEADOR no podrá disminuir ni afectar los derechos de EL/LA `
                + `TRABAJADOR(A).`
              }
            />
            <TextoEd
              k="acuerdoQuinta"
              plantilla={
                `QUINTA. SEGURIDAD SOCIAL Y NOVEDADES ADMINISTRATIVAS: Los empleadores realizarán `
                + `oportunamente las novedades que correspondan ante EPS, administradora de pensiones, ARL, `
                + `caja de compensación, fondo de cesantías y demás entidades, procurando que no exista `
                + `interrupción en la cobertura ni afectación de los derechos derivados de la relación `
                + `laboral.`
              }
            />
            <TextoEd
              k="acuerdoSexta"
              plantilla={
                `SEXTA. ENTREGA DE INFORMACIÓN LABORAL: EL ANTIGUO EMPLEADOR entregará a EL NUEVO `
                + `EMPLEADOR, bajo las reglas de protección de datos personales y reserva, la información `
                + `estrictamente necesaria para garantizar la continuidad de la relación laboral, `
                + `incluyendo soportes de antigüedad, salario, vacaciones, prestaciones, aportes, `
                + `novedades, procesos vigentes y demás información laboral pertinente.`
              }
            />
            <TextoEd
              k="acuerdoSeptima"
              plantilla={
                `SÉPTIMA. INFORMACIÓN AL TRABAJADOR(A): Con la suscripción del presente documento EL/LA `
                + `TRABAJADOR(A) deja constancia de haber sido informado(a) del cambio de empleador y de la `
                + `continuidad de su contrato. Su firma no se entenderá como renuncia a derechos ni como `
                + `aceptación de una terminación y nueva contratación.`
              }
            />
            <TextoEd
              k="acuerdoOctava"
              plantilla={
                `OCTAVA. CONDICIONES NO MODIFICADAS: Las condiciones laborales que no sean válidamente `
                + `modificadas continuarán vigentes. Cualquier cambio posterior deberá sujetarse a la ley, `
                + `al contrato, al Reglamento Interno de Trabajo y a los límites del poder subordinante del `
                + `empleador.`
              }
            />

            <TextoEd
              k="constancia"
              plantilla={
                `CONSTANCIA: La presente acta se firma en ${f.ciudad}, a los ${f.dia} días del mes de `
                + `${f.mes} de ${f.anio}, con efectos de sustitución a partir del ${f.fechaSustitucion}.`
              }
            />

            {/* Firmas */}
            <div className="grid grid-cols-3 gap-6 pt-16 text-[11px]">
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.repAntiguo}</p>
                <p className="font-bold">{f.antiguoEmpleador}</p>
                <p>C.C. {f.repAntiguoCc}</p>
                <p>EL ANTIGUO EMPLEADOR</p>
              </div>
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.repNuevo}</p>
                <p className="font-bold">{f.nuevoEmpleador}</p>
                <p>C.C. {f.repNuevoCc}</p>
                <p>EL NUEVO EMPLEADOR</p>
              </div>
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.trabajador}</p>
                <p>C.C. {f.cedula} de {f.cedulaLugar}</p>
                <p>EL/LA TRABAJADOR(A)</p>
              </div>
            </div>

            <p className="italic text-[hsl(var(--canalco-neutral-500))] pt-3 text-[11px]">
              Plantilla jurídica parametrizable. Los campos entre corchetes [ ] deben diligenciarse y
              validarse antes de la firma.
            </p>
          </div>

          {/* Los datos que arman el texto. No se imprimen: sin ellos habría que reescribir cada
              párrafo a mano para cambiar un dato. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos del acta</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman los párrafos de arriba. Escribe la cédula del trabajador y se traen el nombre y el
                cargo de la ficha de personal. Un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Antiguo empleador" value={f.antiguoEmpleador} onChange={(v) => set('antiguoEmpleador', v)} />
              <Campo label="NIT antiguo empleador" value={f.nitAntiguo} onChange={(v) => set('nitAntiguo', v)} />
              <Campo label="Representante legal antiguo" value={f.repAntiguo} onChange={(v) => set('repAntiguo', v)} />
              <Campo label="C.C. representante antiguo" value={f.repAntiguoCc} onChange={(v) => set('repAntiguoCc', v)} />
              <Campo label="Nuevo empleador" value={f.nuevoEmpleador} onChange={(v) => set('nuevoEmpleador', v)} />
              <Campo label="NIT nuevo empleador" value={f.nitNuevo} onChange={(v) => set('nitNuevo', v)} />
              <Campo label="Representante legal nuevo" value={f.repNuevo} onChange={(v) => set('repNuevo', v)} />
              <Campo label="C.C. representante nuevo" value={f.repNuevoCc} onChange={(v) => set('repNuevoCc', v)} />
              <Campo label="Cédula del trabajador" value={f.cedula} onChange={(v) => set('cedula', v)} onBlur={prellenar} />
              <Campo label="Expedida en" value={f.cedulaLugar} onChange={(v) => set('cedulaLugar', v)} />
              <Campo label="Nombre del trabajador" value={f.trabajador} onChange={(v) => set('trabajador', v)} />
              <Campo label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
              <Campo label="Tipo de contrato" value={f.tipoContrato} onChange={(v) => set('tipoContrato', v)} />
              <Campo label="Salario básico mensual" value={f.salario} onChange={(v) => set('salario', v)} />
              <Campo label="Fecha inicial de vinculación" value={f.fechaInicial} onChange={(v) => set('fechaInicial', v)} />
              <Campo label="Fecha efectiva de sustitución" value={f.fechaSustitucion} onChange={(v) => set('fechaSustitucion', v)} />
              <Campo label="Ciudad de firma" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />
            </div>
          </section>
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar esta acta. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

/** Un renglón de la tabla de identificación: etiqueta en negrita y valor. */
function Fila({ label, value }: { label: string; value: string }) {
  return (
    <tr className="align-top">
      <td className="py-0.5 pr-4 font-bold whitespace-nowrap w-[220px]">{label}</td>
      <td className="py-0.5">{value}</td>
    </tr>
  );
}

function Campo({ label, value, onChange, onBlur, area }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; area?: boolean;
}) {
  return (
    <label className={'block ' + (area ? 'md:col-span-2' : '')}>
      <span className="block text-xs font-semibold text-[#4a4a63] mb-1">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={3}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
      )}
    </label>
  );
}
