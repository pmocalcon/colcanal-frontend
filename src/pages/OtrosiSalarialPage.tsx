import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { FORMATO_OTROSI_SALARIAL } from '@/config/formatosGestion';
import { buscarFicha, nombreDeFicha } from '@/utils/prellenarFormato';

/**
 * Otrosí de modificación salarial a un contrato individual de trabajo a término indefinido.
 *
 * Es un formato propio de G. talento humano, con su fila en `gc_solicitudes`
 * (`formato` = OTROSI-SALARIAL). Se diligencia, se guarda y se imprime para firmarlo en
 * papel; no tiene máquina de estados, así que se queda en borrador y siempre se puede
 * corregir.
 *
 * Con la cédula del trabajador se traen el nombre y el cargo de la ficha de personal, para
 * no redigitar lo que ya está en el sistema.
 *
 * Ruta: `.../talento-humano/otrosi-salarial/:id`.
 */

interface OtrosiSalarialState {
  // ── La empleadora (constantes de la empresa) ──
  repLegal: string;
  repLegalCc: string;
  repLegalCcLugar: string;
  empleadora: string;
  nit: string;

  // ── El trabajador ──
  nombre: string;
  cedula: string;
  cedulaLugar: string;
  cargo: string;

  // ── El contrato y el otrosí ──
  otrosiNumero: string;
  fechaContrato: string;

  // ── El ajuste ──
  motivoAjuste: string;
  salarioAnterior: string;
  salarioNuevo: string;
  fechaEfectos: string;
  formaPago: string;

  // ── La firma ──
  ciudad: string;
  dia: string;
  mes: string;
  anio: string;

  /** Texto que se reescribió a mano, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

/**
 * El formato en blanco, con su propio texto como **valor**: un `placeholder` de HTML se ve
 * en pantalla pero no se imprime, y el otrosí vacío tiene que poder imprimirse para
 * diligenciarlo a mano. Los corchetes en mayúscula marcan lo que falta.
 */
const EMPTY: OtrosiSalarialState = {
  repLegal: 'GLORIA LUCÍA ESCALANTE MANZANO',
  repLegalCc: '66.651.423',
  repLegalCcLugar: 'El Cerrito',
  empleadora: 'CANALES Y CONTACTOS S.A.S.',
  nit: '900.456.735-7',

  nombre: '[NOMBRE COMPLETO DEL/DE LA TRABAJADOR(A)]',
  cedula: '[NÚMERO]',
  cedulaLugar: '[LUGAR]',
  cargo: '[CARGO]',

  otrosiNumero: '[NÚMERO]',
  fechaContrato: '[FECHA DEL CONTRATO]',

  motivoAjuste: '[DESCRIBIR MOTIVO DEL AJUSTE: revisión salarial, promoción, ajuste interno, decisión empresarial u otro]',
  salarioAnterior: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR])',
  salarioNuevo: '[VALOR EN LETRAS] PESOS M/CTE ($[VALOR])',
  fechaEfectos: '[FECHA DE EFECTOS]',
  formaPago: '[MENSUAL / QUINCENALMENTE]',

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

export default function OtrosiSalarialPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const otrosiId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<OtrosiSalarialState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const set = <K extends keyof OtrosiSalarialState>(k: K, v: OtrosiSalarialState[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (otrosiId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await gestionConocimientoService.get(otrosiId);
        if (cancelled) return;
        const saved = (doc.data ?? {}) as Partial<OtrosiSalarialState>;
        setF({ ...EMPTY, ...saved, textos: saved.textos ?? {} });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el otrosí');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [otrosiId]);

  /**
   * Con la cédula llegan el nombre y el cargo de la ficha de personal. Se dispara al salir
   * de la casilla y solo llena lo que sigue como plantilla, para no pisar lo escrito.
   */
  const prellenar = async () => {
    if (!editable) return;
    const cedula = f.cedula.replace(/\D/g, '');
    if (cedula !== f.cedula) set('cedula', cedula);
    if (!cedula) return;
    const ficha = await buscarFicha(cedula);
    if (!ficha) return;
    setF((p) => ({
      ...p,
      nombre: (!p.nombre.trim() || p.nombre === EMPTY.nombre) ? nombreDeFicha(ficha) : p.nombre,
      cargo: (!p.cargo.trim() || p.cargo === EMPTY.cargo) ? (ficha.cargo ?? '') : p.cargo,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await gestionConocimientoService.guardar(otrosiId, {
        gestion: 'talento-humano',
        formato: FORMATO_OTROSI_SALARIAL,
        data: f,
      });
      toast.success('Otrosí guardado');
      if (otrosiId === null) {
        navigate(
          `/dashboard/gestion-conocimiento/talento-humano/otrosi-salarial/${guardado.solicitudId}`,
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/gestion-conocimiento/talento-humano/otrosi-salarial')} title="Volver a los otrosíes">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Otrosí de modificación salarial</h1>
            <p className="text-xs text-[#4a4a63]">Otrosí N.º {otrosiId ?? 'nuevo'}</p>
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

            {/* Membrete */}
            <div className="flex items-start justify-between gap-4">
              <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="h-12 object-contain" />
              <div className="text-center px-3 self-center">
                <h2 className="font-bold text-[13px]">OTROSÍ DE MODIFICACIÓN SALARIAL</h2>
                <p className="font-bold text-[11px]">CONTRATO INDIVIDUAL DE TRABAJO A TÉRMINO INDEFINIDO</p>
              </div>
              <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="h-12 object-contain" />
            </div>
            <p className="font-bold text-[11px]">NIT {f.nit}</p>

            {/* Otrosí N.º */}
            <p className="text-center font-bold pt-2">OTROSÍ No. {f.otrosiNumero}</p>

            {/* Comparecencia */}
            <TextoEd
              k="comparecencia"
              plantilla={
                `Entre los suscritos, ${f.repLegal}, identificada con cédula de ciudadanía No. `
                + `${f.repLegalCc} expedida en ${f.repLegalCcLugar}, actuando en calidad de `
                + `representante legal de ${f.empleadora}, identificada con NIT ${f.nit}, quien en `
                + `adelante se denominará LA EMPLEADORA, y ${f.nombre}, identificado(a) con cédula de `
                + `ciudadanía No. ${f.cedula} expedida en ${f.cedulaLugar}, quien en adelante se `
                + `denominará EL/LA TRABAJADOR(A), hemos convenido celebrar el presente Otrosí al `
                + `contrato individual de trabajo suscrito el ${f.fechaContrato}, conforme a los `
                + `siguientes:`
              }
            />

            {/* I. Antecedentes */}
            <p className="font-bold text-center pt-2"><span className="mr-4">I.</span>ANTECEDENTES</p>

            <TextoEd
              k="primero"
              plantilla={
                `PRIMERO. El ${f.fechaContrato}, las partes suscribieron contrato individual de trabajo `
                + `a término indefinido, en virtud del cual EL/LA TRABAJADOR(A) desempeña el cargo de `
                + `${f.cargo}.`
              }
            />
            <TextoEd
              k="segundo"
              plantilla={
                `SEGUNDO. LA EMPLEADORA ha determinado modificar la remuneración mensual de EL/LA `
                + `TRABAJADOR(A), por la siguiente razón: ${f.motivoAjuste}.`
              }
            />
            <TextoEd
              k="tercero"
              plantilla={
                `TERCERO. El salario básico mensual vigente antes del presente Otrosí corresponde a `
                + `${f.salarioAnterior}. El nuevo salario básico mensual será ${f.salarioNuevo}, `
                + `efectivo a partir del ${f.fechaEfectos}.`
              }
            />
            <TextoEd
              k="cuarto"
              plantilla={
                `CUARTO. La modificación aquí acordada no afecta la continuidad, antigüedad ni las `
                + `demás condiciones del contrato que no sean expresamente modificadas mediante este `
                + `documento.`
              }
            />

            {/* II. Cláusulas */}
            <p className="font-bold text-center pt-2"><span className="mr-4">II.</span>CLÁUSULAS</p>

            <TextoEd
              k="clausulaPrimera"
              plantilla={
                `CLÁUSULA PRIMERA. MODIFICACIÓN DE LA REMUNERACIÓN: A partir del ${f.fechaEfectos}, LA `
                + `EMPLEADORA pagará a EL/LA TRABAJADOR(A) un salario básico mensual de ${f.salarioNuevo}, `
                + `pagadero ${f.formaPago}, sin perjuicio de los recargos, horas extras, dominicales, `
                + `festivos, prestaciones sociales, aportes al Sistema de Seguridad Social Integral y `
                + `demás conceptos que legalmente correspondan.`
              }
            />
            <TextoEd
              k="paragrafoPrimero"
              plantilla={
                `PARÁGRAFO PRIMERO. LA EMPLEADORA efectuará las deducciones y retenciones legalmente `
                + `autorizadas. El pago podrá efectuarse mediante consignación en la cuenta informada por `
                + `EL/LA TRABAJADOR(A) o por cualquier otro medio legalmente autorizado.`
              }
            />
            <TextoEd
              k="paragrafoSegundo"
              plantilla={
                `PARÁGRAFO SEGUNDO. Los auxilios, beneficios o reconocimientos extralegales solo tendrán `
                + `naturaleza no salarial cuando, conforme a su finalidad real y a la legislación vigente, `
                + `no remuneren directamente el servicio y exista el soporte o acuerdo correspondiente `
                + `cuando sea exigible. La denominación utilizada por las partes no altera la naturaleza `
                + `jurídica que legalmente corresponda a cada pago.`
              }
            />
            <TextoEd
              k="clausulaSegunda"
              plantilla={
                `CLÁUSULA SEGUNDA. VIGENCIA DE LAS DEMÁS CONDICIONES: Las demás cláusulas y condiciones `
                + `del contrato individual de trabajo que no sean modificadas expresamente mediante el `
                + `presente Otrosí conservan plena vigencia.`
              }
            />

            <div className="pt-2">
              <TextoEd
                k="cierre"
                plantilla={
                  `Para constancia, se firma en ${f.ciudad}, a los ${f.dia} días del mes de ${f.mes} `
                  + `de ${f.anio}.`
                }
              />
            </div>

            {/* Firmas */}
            <div className="grid grid-cols-2 gap-8 pt-16">
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.repLegal}</p>
                <p>Representante Legal</p>
                <p className="font-bold">{f.empleadora}</p>
                <p>LA EMPLEADORA</p>
              </div>
              <div className="space-y-0.5">
                <p className="border-t border-black pt-1 font-bold">{f.nombre}</p>
                <p>C.C. {f.cedula}</p>
                <p>EL/LA TRABAJADOR(A)</p>
              </div>
            </div>
          </div>

          {/* Los datos que arman el texto. Van fuera del documento: en el papel no existen,
              pero sin ellos habría que reescribir cada párrafo a mano para cambiar un dato. */}
          <section className="no-print mt-6 bg-white border border-[#e6e6f0] rounded-lg overflow-hidden">
            <header className="bg-[#f6f6fa] border-b border-[#e6e6f0] px-5 py-2.5">
              <h2 className="text-sm font-semibold text-[#16162b]">Datos del otrosí</h2>
              <p className="text-xs text-[#4a4a63]">
                Arman los párrafos de arriba. Escribe la cédula y se traen el nombre y el cargo de la
                ficha de personal. Un párrafo reescrito a mano deja de rearmarse.
              </p>
            </header>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Cédula del trabajador" value={f.cedula} onChange={(v) => set('cedula', v)} onBlur={prellenar} />
              <Campo label="Expedida en" value={f.cedulaLugar} onChange={(v) => set('cedulaLugar', v)} />
              <Campo label="Nombre del trabajador" value={f.nombre} onChange={(v) => set('nombre', v)} />
              <Campo label="Cargo" value={f.cargo} onChange={(v) => set('cargo', v)} />
              <Campo label="Otrosí N.º" value={f.otrosiNumero} onChange={(v) => set('otrosiNumero', v)} />
              <Campo label="Fecha del contrato" value={f.fechaContrato} onChange={(v) => set('fechaContrato', v)} />
              <Campo label="Motivo del ajuste" value={f.motivoAjuste} onChange={(v) => set('motivoAjuste', v)} area />
              <Campo label="Salario anterior" value={f.salarioAnterior} onChange={(v) => set('salarioAnterior', v)} />
              <Campo label="Salario nuevo" value={f.salarioNuevo} onChange={(v) => set('salarioNuevo', v)} />
              <Campo label="Fecha de efectos" value={f.fechaEfectos} onChange={(v) => set('fechaEfectos', v)} />
              <Campo label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} />
              <Campo label="Ciudad de firma" value={f.ciudad} onChange={(v) => set('ciudad', v)} />
              <Campo label="Día" value={f.dia} onChange={(v) => set('dia', v)} />
              <Campo label="Mes" value={f.mes} onChange={(v) => set('mes', v)} />
              <Campo label="Año" value={f.anio} onChange={(v) => set('anio', v)} />
            </div>
          </section>

          <PieElaboracion />
        </TextosDocumento>
        </fieldset>

        {!editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            No tienes permiso para diligenciar este otrosí. Puedes consultarlo e imprimirlo.
          </p>
        )}
      </main>
    </div>
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
