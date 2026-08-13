import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService } from '@/services/gestionConocimiento.service';

/**
 * Solicitud de Préstamo (G. de talento humano).
 *
 * Es un **formulario impreso**, no un documento de texto: casillas, renglones y tres
 * bloques. Por eso no usa `TextoEd` —no hay párrafos que reescribir— sino campos.
 *
 * El empleado lo diligencia y lo firma; la Dirección Administrativa firma abajo y Gerencia
 * aprueba en el bloque 3. Hoy esas firmas van en papel: el formato se guarda y se imprime.
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

  // 3. Uso exclusivo de la empresa
  valorAprobado: string;
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
  valorAprobado: '',
};

// Lo diligencia el empleado, así que no se restringe a un área: lo abre quien lo pide.
// Quien no pueda editarlo igual lo consulta e imprime.

export default function SolicitudPrestamoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const docId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [f, setF] = useState<PrestamoState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        setF({ ...EMPTY, ...(row.data ?? {}) as Partial<PrestamoState> });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar la solicitud');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const handleSave = async () => {
    if (docId === null) return;
    setSaving(true);
    try {
      // Se guarda armado para que el listado lo lea directo: el listado lee `data` en
      // crudo y no tiene por qué saber cómo se compone un nombre en este formato.
      await gestionConocimientoService.update(docId, { data: { ...f, nombreCompleto } });
      setF((p) => ({ ...p, nombreCompleto }));
      toast.success('Solicitud guardada');
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
              Solicitud N.º {docId}{user?.nombre ? ` · ${user.nombre}` : ''}
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
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
              <Meta label="FECHA:" value="09-05-2023" />
              <Meta label="VERSIÓN:" value="1" last />
            </div>
          </div>

          <p className="px-2 py-1 font-bold italic text-[9px] border-b border-black">
            Diligencie todos los espacios del formato en tinta negra, si no aplica coloque una línea
          </p>

          {/* ── 1. Información básica ── */}
          <Seccion titulo="1. INFORMACIÓN BÁSICA" />

          <div className="grid grid-cols-4 border-b border-black">
            <Celda label="1er Apellido" value={f.primerApellido} onChange={(v) => set('primerApellido', v)} />
            <Celda label="2do Apellido" value={f.segundoApellido} onChange={(v) => set('segundoApellido', v)} />
            <Celda label="1er Nombre" value={f.primerNombre} onChange={(v) => set('primerNombre', v)} />
            <Celda label="2do Nombre" value={f.segundoNombre} onChange={(v) => set('segundoNombre', v)} last />
          </div>

          <div className="px-2 py-1.5 border-b border-black flex items-center gap-4 flex-wrap">
            <span className="font-bold">Estado Civil:</span>
            {ESTADOS_CIVILES.map((e) => (
              <Casilla
                key={e.key}
                label={e.label}
                checked={f.estadoCivil === e.key}
                onToggle={() => set('estadoCivil', f.estadoCivil === e.key ? '' : e.key)}
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
              />
            ))}
          </div>

          <div className="px-2 py-1.5 border-b border-black grid grid-cols-2 gap-6">
            <Renglon label="Número:" value={f.numero} onChange={(v) => set('numero', v)} />
            <Renglon label="Expedida:" value={f.expedida} onChange={(v) => set('expedida', v)} />
          </div>

          <div className="grid grid-cols-4 border-b border-black">
            <Celda label="Dirección residencia:" value={f.direccion} onChange={(v) => set('direccion', v)} />
            <Celda label="Barrio:" value={f.barrio} onChange={(v) => set('barrio', v)} />
            <Celda label="Municipio:" value={f.municipio} onChange={(v) => set('municipio', v)} />
            <Celda label="Departamento:" value={f.departamento} onChange={(v) => set('departamento', v)} last />
          </div>

          <div className="grid grid-cols-3 border-b border-black">
            <Celda label="Teléfono residencia:" value={f.telefonoResidencia} onChange={(v) => set('telefonoResidencia', v)} />
            <Celda label="Celular:" value={f.celular} onChange={(v) => set('celular', v)} />
            <Celda label="Otros:" value={f.otros} onChange={(v) => set('otros', v)} last />
          </div>

          {/* ── 2. Datos laborales ── */}
          <Seccion titulo="2. DATOS LABORALES" />

          <div className="grid grid-cols-3 border-b border-black">
            <Celda label="Cargo:" value={f.cargo} onChange={(v) => set('cargo', v)} />
            <Celda label="Area:" value={f.area} onChange={(v) => set('area', v)} />
            <Celda label="Salario:" value={f.salario} onChange={(v) => set('salario', v)} last />
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="px-2 py-2 border-r border-black">
              <span className="font-bold">Valor del Préstamo Solicitado: </span>
              <span className="font-bold">$</span>
              <input
                value={f.valorSolicitado}
                onChange={(e) => set('valorSolicitado', e.target.value)}
                className="w-32 bg-transparent outline-none border-b border-black ml-1 text-[11px]"
              />
            </div>
            <Celda label="Motivo de la Solicitud:" value={f.motivo} onChange={(v) => set('motivo', v)} last area />
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
            <FirmaCelda titulo="Firma Empleado" />
            <FirmaCelda titulo={'Firma Dirección\nAdministrativa'} last />
          </div>

          {/* ── 3. Uso exclusivo de la empresa ── */}
          <Seccion titulo="3. ESPACIO PARA USO EXCLUSIVO DE LA EMPRESA" />

          <div className="grid grid-cols-2 border-b border-black">
            <div className="px-2 py-2 border-r border-black text-center">
              <p className="font-bold">Valor<br />Aprobado</p>
              <div className="flex items-end justify-center gap-1 mt-8">
                <span className="font-bold">$</span>
                <input
                  value={f.valorAprobado}
                  onChange={(e) => set('valorAprobado', e.target.value)}
                  className="w-40 bg-transparent outline-none border-b border-black text-[11px] text-center"
                />
              </div>
            </div>
            <div className="px-2 py-2 text-center">
              <p className="font-bold">Firma de<br />Aprobación</p>
              <div className="mt-8 mx-auto w-48 border-b border-black h-4" />
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

          <div className="mt-8">
            <span className="inline-flex items-baseline gap-2">
              Firma:
              <span className="inline-block w-56 border-b border-black h-4" />
            </span>
            <p className="mt-1 pl-10">CC.</p>
          </div>
        </div>
      </main>
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
function Casilla({ label, checked, onToggle }: {
  label: string; checked: boolean; onToggle: () => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <span className="order-2">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="order-1 w-3.5 h-3.5 accent-black"
      />
    </label>
  );
}

/** Celda con etiqueta arriba y el espacio para escribir debajo. */
function Celda({ label, value, onChange, last, area }: {
  label: string; value: string; onChange: (v: string) => void; last?: boolean; area?: boolean;
}) {
  return (
    <div className={'px-2 py-1 ' + (last ? '' : 'border-r border-black')}>
      <span className="font-bold">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full bg-transparent outline-none resize-none text-[11px]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent outline-none text-[11px]"
        />
      )}
    </div>
  );
}

/** «Etiqueta: ______» en una sola línea, como los renglones del formato. */
function Renglon({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-bold whitespace-nowrap">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-grow min-w-0 bg-transparent outline-none border-b border-black text-[11px]"
      />
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

/** Recuadro de firma: el espacio se firma a mano sobre el impreso. */
function FirmaCelda({ titulo, last }: { titulo: string; last?: boolean }) {
  return (
    <div className={'px-2 py-2 text-center ' + (last ? '' : 'border-r border-black')}>
      <p className="font-bold whitespace-pre-line">{titulo}</p>
      <div className="mt-10 mx-auto w-56 border-b border-black h-4" />
    </div>
  );
}
