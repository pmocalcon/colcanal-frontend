import type { CSSProperties, ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/juridica/textoEditable';

/**
 * Los campos y el encabezado que comparten los escritos judiciales de G. jurídica.
 *
 * La contestación de tutela y el poder especial se dirigen al mismo despacho, citan el
 * mismo radicado y nombran a las mismas partes: el bloque «Doctor(a) … E. S. D. … Radicado
 * … Vinculados» es idéntico en los dos. Vive acá para que un ajuste de maqueta —los huecos
 * de la rejilla, sin ir más lejos— se arregle una vez y no una por documento.
 */

/** Renglón suelto del encabezado (ciudad, fecha, juez, correo). */
export function Linea({ value, onChange, bold, className, style }: {
  value: string; onChange: (v: string) => void; bold?: boolean;
  className?: string; style?: CSSProperties;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={style}
      className={'bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black '
        + (bold ? 'font-bold ' : '')
        + (className ?? 'w-full')}
    />
  );
}

/**
 * Ancho de un campo que va **dentro** de un renglón de texto, en caracteres.
 *
 * Un `w-full` acá abriría un hueco hasta el margen y partiría el renglón en dos —«[CIUDAD]»
 * y muy a la derecha «, [FECHA]»—, que es justo lo que no debe verse: en el papel esos dos
 * campos son una sola línea corrida.
 */
const anchoTexto = (v: string, min: number) =>
  ({ width: `${Math.max(v.length, min)}ch` }) as CSSProperties;

/**
 * Fila «Etiqueta: valor» del bloque de identificación del proceso.
 *
 * El valor va pegado a la etiqueta y no en una columna fija: en el modelo se lee
 * «Radicado: 2026-00123» como una frase, no como una tabla.
 */
export function Dato({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-bold shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-grow min-w-0 bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
      />
    </div>
  );
}

/** Campo del panel de datos, el que no se imprime. */
export function Campo({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[#4a4a63] mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[#c9c9dc] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
      />
    </label>
  );
}

/**
 * Una nota de cómo se llena la sección.
 *
 * Lleva `no-print` porque es instrucción del modelo y no parte del escrito: al juez no se le
 * radica un documento que le explique cómo debía redactarse.
 */
export function Guia({ children }: { children: ReactNode }) {
  return (
    <p className="no-print text-[11.5px] italic text-[#6a6a80] pt-1 border-l-2 border-[#e6e6f0] pl-2">
      {children}
    </p>
  );
}

/**
 * El bloque de control que se diligencia en pantalla y no viaja al despacho.
 *
 * `titulo` cambia entre documentos —«control jurídico» en la contestación, «control interno
 * de parametrización» en el poder—, pero el papel es el mismo, y el mismo el `no-print`.
 */
export function BloqueControl({ titulo, children, nota }: {
  titulo: string; nota: ReactNode; children: ReactNode;
}) {
  return (
    <section className="no-print border border-[#e0cc00] bg-[#fffbe6] rounded">
      <header className="px-4 py-2 border-b border-[#e0cc00]/60">
        <p className="text-[11px] font-bold text-[#16162b]">{titulo}</p>
        <p className="text-[11px] text-[#4a4a63] mt-0.5">{nota}</p>
      </header>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </section>
  );
}

/**
 * El membrete de los oficios de derecho de petición: Canales & Contactos a la izquierda y el
 * título al centro, con el logo de la UTAP a la derecha cuando el oficio se suscribe en esa
 * doble condición.
 *
 * Los escritos judiciales llevan el membrete de la representada **en lugar** del de la casa;
 * estos lo llevan **al lado**, porque quien responde una petición es la casa actuando como
 * integrante de la unión temporal. Cuando la UTAP escogida no tiene logo propio se pinta el
 * genérico de Alumbrado Público: repetir el de Canales & Contactos a su propio lado no diría
 * nada.
 *
 * `soloCasa` deja únicamente el de la izquierda. No todos los oficios se expiden en la doble
 * condición —la comunicación de plazo adicional la firma el responsable del trámite—, y un
 * logo de más en un oficio dirigido a un ciudadano afirma una autoría que no corresponde.
 *
 * El NIT es el de la casa y por eso es constante: quien firma es siempre ella.
 */
export function MembreteOficio({ logoUtap, empresa, titulo, subtitulo, soloCasa }: {
  logoUtap?: string; empresa?: string; titulo: string; subtitulo?: string; soloCasa?: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <img
          src="/assets/images/logo-canalco.png"
          alt="Canales & Contactos"
          className="h-14 object-contain shrink-0"
        />
        <div className="flex-grow text-center">
          <p className="font-bold text-[13px]">{titulo}</p>
          {subtitulo && <p className="font-bold text-[10px]">{subtitulo}</p>}
        </div>
        {!soloCasa && (
          <img
            src={logoUtap ?? '/assets/images/logo-alumbrado.png'}
            alt={empresa || 'Alumbrado Público'}
            className="h-14 object-contain shrink-0"
          />
        )}
      </div>
      <p className="font-bold text-[11px]">NIT 900.456.735-7</p>
    </>
  );
}

/**
 * Fila de una tabla de datos que **sí se imprime**, con la etiqueta sombreada a la izquierda.
 *
 * No confundir con `BloqueControl`, que se le parece en pantalla pero desaparece al imprimir:
 * esta es parte del documento que se radica.
 */
export function FilaTabla({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-stretch border-b border-black last:border-b-0">
      <div className="w-[45%] shrink-0 border-r border-black bg-[#e8e8e8] px-2 py-1 font-bold">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-grow min-w-0 px-2 py-1 bg-transparent outline-none text-[12px] disabled:opacity-100 disabled:text-black"
      />
    </div>
  );
}

/**
 * Lista numerada editable: las solicitudes y pruebas de la contestación, los aspectos que
 * se piden aclarar del requerimiento.
 *
 * El número se calcula por posición: son un orden de lectura dentro del acápite y no
 * identifican nada fuera de él, así que al borrar un renglón los demás deben recorrerse
 * —igual que los literales de un fundamento y al revés que los ordinales de los hechos.
 */
export function ListaNumerada({ items, onChange, onQuitar, onAgregar, etiqueta }: {
  items: string[];
  onChange: (i: number, v: string) => void;
  onQuitar: (i: number) => void;
  onAgregar: () => void;
  etiqueta: string;
}) {
  return (
    <div className="space-y-1 pt-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 group/linea">
          <span className="font-bold shrink-0 w-5">{i + 1}.</span>
          <AutoTextarea value={it} onChange={(v) => onChange(i, v)} />
          <button
            type="button"
            onClick={() => onQuitar(i)}
            title={`Quitar esta ${etiqueta}`}
            className="no-print shrink-0 text-red-600 hover:text-red-800 opacity-0 group-hover/linea:opacity-100 transition-opacity mt-0.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={onAgregar}
        className="no-print h-7 text-[11px] gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Agregar {etiqueta}
      </Button>
    </div>
  );
}

/** Los datos del despacho y de las partes, comunes a los escritos de tutela. */
export interface DatosJudiciales {
  ciudad: string;
  fecha: string;
  juezNombre: string;
  juezDespacho: string;
  juezCorreo: string;
  radicado: string;
  accionante: string;
  accionados: string;
  /**
   * Los vinculados al trámite. La clave quedó en singular de la primera versión de la
   * contestación; renombrarla dejaría sin texto los documentos ya guardados, así que lo que
   * cambia es el rótulo y no la clave.
   */
  vinculada: string;
}

/**
 * «[CIUDAD], [FECHA] · Doctor(a) … E. S. D. · Radicado … Vinculados».
 *
 * Va todo corrido, sin renglón en blanco entre «E. S. D.» y «Radicado:», como en los
 * modelos. El asunto no entra acá: cada documento tiene el suyo y lo separa distinto.
 */
export function EncabezadoJudicial({ f, set, labelVinculados = 'Vinculados:' }: {
  f: DatosJudiciales;
  set: (k: keyof DatosJudiciales, v: string) => void;
  labelVinculados?: string;
}) {
  return (
    <div className="pt-6 space-y-3">
      <div className="flex items-baseline">
        <Linea
          value={f.ciudad}
          onChange={(v) => set('ciudad', v)}
          className="shrink-0"
          style={anchoTexto(f.ciudad, 8)}
        />
        <span className="shrink-0">,&nbsp;</span>
        <Linea value={f.fecha} onChange={(v) => set('fecha', v)} />
      </div>

      <div className="space-y-0.5">
        <p>Doctor(a)</p>
        <Linea value={f.juezNombre} onChange={(v) => set('juezNombre', v)} bold />
        <Linea value={f.juezDespacho} onChange={(v) => set('juezDespacho', v)} />
        <div className="flex items-baseline gap-1">
          <span className="shrink-0">Correo:</span>
          <Linea value={f.juezCorreo} onChange={(v) => set('juezCorreo', v)} />
        </div>
        <p>E. S. D.</p>
        <Dato label="Radicado:" value={f.radicado} onChange={(v) => set('radicado', v)} />
        <Dato label="Accionante:" value={f.accionante} onChange={(v) => set('accionante', v)} />
        <Dato label="Accionados:" value={f.accionados} onChange={(v) => set('accionados', v)} />
        <Dato label={labelVinculados} value={f.vinculada} onChange={(v) => set('vinculada', v)} />
      </div>
    </div>
  );
}
