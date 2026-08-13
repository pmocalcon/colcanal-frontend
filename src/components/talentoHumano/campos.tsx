/**
 * Los campos de los formularios de Talento Humano.
 *
 * Viven aparte porque los usan las pantallas de personal y de incapacidades, que son
 * formularios largos —veintitantos campos cada uno— donde una diferencia de alto o de
 * borde entre dos casillas contiguas se nota de inmediato.
 */

export function Campo({ label, value, onChange, tipo, ancho, paso }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  tipo?: string;
  ancho?: string;
  /** Para los `number`: «any» deja escribir decimales sin que el navegador los rechace. */
  paso?: string;
}) {
  return (
    <label className={'block ' + (ancho ?? '')}>
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <input
        type={tipo ?? 'text'}
        step={tipo === 'number' ? (paso ?? 'any') : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
      />
    </label>
  );
}

export function Selector({ label, value, opciones, onChange, ancho }: {
  label: string;
  value: string;
  opciones: string[];
  onChange: (v: string) => void;
  ancho?: string;
}) {
  return (
    <label className={'block ' + (ancho ?? '')}>
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm bg-white outline-none focus:border-[hsl(var(--canalco-primary))]"
      >
        <option value="">—</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/**
 * Campo de porcentaje.
 *
 * Por dentro la carga prestacional se guarda como fracción —0,3783— porque así viene del
 * archivo y así se multiplica por el salario. Pero **nadie piensa en fracciones**: la
 * hoja de Excel muestra «37,83 %» porque la celda tiene formato de porcentaje, y quien
 * llena esto va a escribir 37,83. Pedirle 0,3783 es invitar a que teclee 37,83 y se
 * guarde un 3.783 %, que fue justamente lo que pasó.
 *
 * Así que la casilla habla en porcentaje y la conversión ocurre acá.
 */
export function CampoPorcentaje({ label, value, onChange, ancho }: {
  label: string;
  /** La fracción guardada: «0.3783». */
  value: string | number | null;
  /** Recibe la fracción ya convertida, o '' si se borró. */
  onChange: (v: string) => void;
  ancho?: string;
}) {
  const n = Number(value ?? '');
  const mostrado = value === '' || value === null || !Number.isFinite(n)
    ? ''
    : String(Number((n * 100).toFixed(4)));

  return (
    <label className={'block ' + (ancho ?? '')}>
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <div className="relative">
        <input
          type="number"
          step="any"
          value={mostrado}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? '' : String(Number(v) / 100));
          }}
          className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded pl-2 pr-7 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-[hsl(var(--canalco-neutral-500))]">%</span>
      </div>
    </label>
  );
}

/**
 * Casilla de solo lectura para un valor que el formulario calcula.
 *
 * Se muestra en vez de esconderse porque es lo que se va a guardar y hay que poder
 * cotejarlo contra la hoja; no se deja escribir porque un total tecleado a mano deja de
 * cuadrar con sus sumandos en cuanto uno de ellos cambia.
 */
export function CampoCalculado({ label, value, nota }: {
  label: string;
  value: string;
  nota?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
        {label}
        <span className="ml-1 font-normal text-[hsl(var(--canalco-neutral-400))]">· calculado</span>
      </span>
      <output
        title={nota}
        className="block w-full border border-dashed border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))] tabular-nums"
      >
        {value || '—'}
      </output>
    </label>
  );
}

/**
 * Selector que además deja escribir un valor nuevo.
 *
 * Las listas de esta base —área, ubicación, escalafón— salen de lo que ya hay cargado, no
 * de un catálogo cerrado: sirven para no volver a teclear «ADMINISTRATIVA» ochenta veces,
 * pero no pueden impedir dar de alta la primera persona de un área que no existía.
 */
export function CampoSugerido({ label, value, onChange, opciones, ancho, id }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  ancho?: string;
  id: string;
}) {
  return (
    <label className={'block ' + (ancho ?? '')}>
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <input
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
      />
      <datalist id={id}>
        {opciones.map((o) => <option key={o} value={o} />)}
      </datalist>
    </label>
  );
}
