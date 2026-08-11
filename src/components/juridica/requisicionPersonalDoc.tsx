import { getTipo, parsearFecha, CASILLA_CONTRATO_REQUISICION } from '@/config/juridicaContratos';

/**
 * Cuerpo del formato GTH-001-F · "Solicitud de Requisición de Personal": las cuatro
 * secciones numeradas, los candidatos sugeridos y las autorizaciones.
 *
 * Vive aparte porque lo pintan dos pantallas: la solicitud (cuando el trámite se abre
 * como requisición de personal, en lugar del cuerpo del GTH-002-F) y la página propia
 * del documento, que además le pone la cabecera oficial del formato para imprimir.
 * Es controlado: no sabe guardar ni de dónde vino, solo dibujar y avisar cambios.
 */

/* ── Opciones del formato ───────────────────────────────── */

interface Opcion { key: string; label: string }

// El formato reparte los motivos en dos columnas; se respeta el orden impreso.
const MOTIVOS_IZQ: Opcion[] = [
  { key: 'retiro', label: 'Retiro / Renuncia empleado' },
  { key: 'maternidad', label: 'Reemplazo por maternidad / Incapacidad' },
  { key: 'nuevoCupo', label: 'Nuevo Cupo Nómina' },
  { key: 'otro', label: '*Otro:' },
];
const MOTIVOS_DER: Opcion[] = [
  { key: 'terminacion', label: 'Terminación del contrato anterior' },
  { key: 'creacion', label: 'Creación de cargo' },
  { key: 'promocion', label: 'Promoción/Ascenso' },
];

const FORMACION: Opcion[] = [
  { key: 'primaria', label: 'Primaria' },
  { key: 'secundaria', label: 'Secundaria' },
  { key: 'tecnico', label: 'Técnico - Tecnólogo' },
  { key: 'profesional', label: 'Profesional' },
  { key: 'maestria', label: 'Maestría/Doctorado' },
  { key: 'otro', label: '*Otro' },
];

const EXPERIENCIA: Opcion[] = [
  { key: 'sin', label: 'Sin experiencia' },
  { key: 'min1', label: 'Mínimo 1 año' },
  { key: 'min3', label: 'Mínimo 3 años' },
  { key: 'min5', label: 'Mínimo 5 años' },
];

const COMPETENCIAS_IZQ: Opcion[] = [
  { key: 'comunicacion', label: 'Comunicación' },
  { key: 'trabajoEquipo', label: 'Trabajo en equipo' },
  { key: 'creatividad', label: 'Creatividad/Innovación' },
  { key: 'analisis', label: 'Análisis de problemas' },
  { key: 'orientacionCliente', label: 'Orientación al cliente' },
];
const COMPETENCIAS_DER: Opcion[] = [
  { key: 'orientacionResultados', label: 'Orientación a resultados' },
  { key: 'proactividad', label: 'Proactividad' },
  { key: 'liderazgo', label: 'Liderazgo' },
  { key: 'estrategico', label: 'Estratégico' },
  { key: 'bajoPresion', label: 'Trabajo bajo presión' },
  { key: 'estadisticas', label: 'Habilidades estadísticas y matemáticas' },
];

/* ── Estado ─────────────────────────────────────────────── */

type Marcas = Record<string, boolean>;

export interface RequisicionState {
  dia: string; mes: string; anio: string;
  empresa: string; centroCosto: string;
  // 1. Generalidades
  cargo: string; cuadrillas: string;
  ciudadCali: boolean; ciudadOtra: boolean; ciudadCual: string;
  proceso: string; area: string;
  // 2. Motivo de la solicitud
  motivos: Marcas; motivoOtroCual: string;
  inicioDia: string; inicioMes: string; inicioAnio: string;
  finDia: string; finMes: string; finAnio: string;
  // 3. Especificaciones
  formacion: Marcas; formacionOtroCual: string;
  horaIngreso: string; horaSalida: string; diasSemana: string; sabado: string;
  experiencia: Marcas;
  vincContrato: boolean; vincPasantia: boolean; remuneracion: string;
  contratoFijo: boolean; contratoIndefinido: boolean; contratoObraLabor: boolean;
  contratoOtro: string;
  herrComputador: boolean; herrCorreo: boolean; herrPuesto: boolean; accesos: string;
  // 4. Competencias
  competencias: Marcas; competenciasOtras: string;
  candidato1: string; candidato2: string; candidato3: string;
}

/**
 * Las tres firmas del recuadro AUTORIZACIONES. **No** son parte del formato: viven en
 * la solicitud, donde las estampa el flujo (el creador al crearla, Gerencia de
 * Proyectos al autorizar, Gerencia al firmar). Se pasan aparte justamente para que no
 * se copien: copiadas se congelarían en el valor que tuvieran al guardar —vacías, si
 * el trámite todavía no había avanzado— y nunca reflejarían las firmas reales.
 */
export interface FirmasSolicitud {
  solicitadoNombre?: string; solicitadoCargo?: string;
  aprobadoNombre?: string; aprobadoCargo?: string;
  autorizadoNombre?: string; autorizadoCargo?: string;
}

export const EMPTY_REQUISICION: RequisicionState = {
  dia: '', mes: '', anio: '',
  empresa: '', centroCosto: '',
  cargo: '', cuadrillas: '',
  ciudadCali: false, ciudadOtra: false, ciudadCual: '',
  proceso: '', area: '',
  motivos: {}, motivoOtroCual: '',
  inicioDia: '', inicioMes: '', inicioAnio: '',
  finDia: '', finMes: '', finAnio: '',
  formacion: {}, formacionOtroCual: '',
  horaIngreso: '', horaSalida: '', diasSemana: '', sabado: '',
  experiencia: {},
  vincContrato: false, vincPasantia: false, remuneracion: '',
  contratoFijo: false, contratoIndefinido: false, contratoObraLabor: false, contratoOtro: '',
  herrComputador: false, herrCorreo: false, herrPuesto: false, accesos: '',
  competencias: {}, competenciasOtras: '',
  candidato1: '', candidato2: '', candidato3: '',
};

/** "31/12/2026" → { dia: '31', mes: '12', anio: '2026' }. Vacío si no se entiende. */
const partirFecha = (texto: unknown): { dia: string; mes: string; anio: string } => {
  const d = parsearFecha(texto);
  if (!d) return { dia: '', mes: '', anio: '' };
  return {
    dia: String(d.getDate()).padStart(2, '0'),
    mes: String(d.getMonth() + 1).padStart(2, '0'),
    anio: String(d.getFullYear()),
  };
};

/** El candidato sugerido de la solicitud, en la línea que espera este formato. */
const candidatoSugerido = (d: Record<string, any>): string =>
  [d.sugNombre, d.sugTelefono, d.sugCorreo]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' · ');

/**
 * Arma el estado inicial: lo ya guardado manda y lo que falte se toma de la solicitud,
 * que trae escrito casi todo (empresa, centro de costo, fechas, remuneración,
 * herramientas y el candidato sugerido). Es un punto de partida, no un candado: acá se
 * corrige sin tocar la solicitud.
 */
export const prellenarRequisicion = (
  solicitud: Record<string, any>,
  guardado?: Partial<RequisicionState> | null,
): RequisicionState => {
  const d = solicitud ?? {};
  const saved = guardado ?? {};
  const inicio = partirFecha(d.fechaInicio);
  const fin = partirFecha(d.fechaTerminacion);
  const casilla = CASILLA_CONTRATO_REQUISICION[String(d.tipoContrato ?? '')];
  return {
    ...EMPTY_REQUISICION,
    ...saved,
    dia: saved.dia || d.dia || '',
    mes: saved.mes || d.mes || '',
    anio: saved.anio || d.anio || '',
    empresa: saved.empresa || d.empresa || '',
    centroCosto: saved.centroCosto || d.centroCosto || '',
    cargo: saved.cargo || d.perfil || '',
    inicioDia: saved.inicioDia || inicio.dia,
    inicioMes: saved.inicioMes || inicio.mes,
    inicioAnio: saved.inicioAnio || inicio.anio,
    finDia: saved.finDia || fin.dia,
    finMes: saved.finMes || fin.mes,
    finAnio: saved.finAnio || fin.anio,
    remuneracion: saved.remuneracion || d.honorarios || '',
    // El tipo de contrato de la solicitud marca su casilla. Prestación de servicios
    // profesionales no tiene casilla propia en el formato y cae en «Otro».
    contratoFijo: saved.contratoFijo ?? casilla === 'fijo',
    contratoIndefinido: saved.contratoIndefinido ?? casilla === 'indefinido',
    contratoObraLabor: saved.contratoObraLabor ?? casilla === 'obraLabor',
    contratoOtro: saved.contratoOtro ?? (casilla ? '' : getTipo(d.tipoContrato)?.nombre ?? ''),
    vincContrato: saved.vincContrato ?? true,
    herrComputador: saved.herrComputador ?? !!d.herrComputador,
    herrCorreo: saved.herrCorreo ?? !!d.herrCorreo,
    herrPuesto: saved.herrPuesto ?? !!d.herrPuesto,
    accesos: saved.accesos || d.accesos || '',
    candidato1: saved.candidato1 || candidatoSugerido(d),
    motivos: saved.motivos ?? {},
    formacion: saved.formacion ?? {},
    experiencia: saved.experiencia ?? {},
    competencias: saved.competencias ?? {},
  };
};

/* ── El cuerpo del formato ──────────────────────────────── */

export function RequisicionPersonalCuerpo({ value: f, onChange, firmas }: {
  value: RequisicionState;
  onChange: (siguiente: RequisicionState) => void;
  /** Las del recuadro AUTORIZACIONES: vienen de la solicitud, no del formato. */
  firmas: FirmasSolicitud;
}) {
  const set = <K extends keyof RequisicionState>(k: K, v: RequisicionState[K]) =>
    onChange({ ...f, [k]: v });
  const toggle = (grupo: 'motivos' | 'formacion' | 'experiencia' | 'competencias', key: string) =>
    onChange({ ...f, [grupo]: { ...f[grupo], [key]: !f[grupo][key] } });

  return (
    <>
      {/* Instrucciones */}
      <Banda>INSTRUCCIONES</Banda>
      <p className="px-2 py-1.5 border-b border-[#0a2a52] font-semibold text-[11px] leading-snug">
        Recuerde realizar su requisición de personal con mínimo 15 días calendario de
        anticipación a la fecha de inicio de labores solicitada de manera que el área de
        gestión humana pueda realizar el procedimiento de selección.
      </p>

      {/* 1. Generalidades */}
      <Banda>1. GENERALIDADES</Banda>
      <div className="grid grid-cols-[1fr_170px_1fr] border-b border-[#0a2a52]">
        <div className="border-r border-[#0a2a52] px-2 py-1.5 flex items-center gap-2">
          <span className="font-bold whitespace-nowrap">CARGO SOLICITADO:</span>
          <Linea value={f.cargo} onChange={(v) => set('cargo', v)} />
        </div>
        <div className="border-r border-[#0a2a52] px-2 py-1.5">
          <div className="font-bold text-center">No. DE CUADRILLAS</div>
          <Caja value={f.cuadrillas} onChange={(v) => set('cuadrillas', v)} />
        </div>
        <div className="px-2 py-1.5">
          <div className="font-bold">CIUDAD:</div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Check label="CALI" checked={f.ciudadCali} onChange={(v) => set('ciudadCali', v)} />
            <Check label="OTRA" checked={f.ciudadOtra} onChange={(v) => set('ciudadOtra', v)} />
            <span className="whitespace-nowrap">CUAL</span>
            <Linea value={f.ciudadCual} onChange={(v) => set('ciudadCual', v)} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-b border-[#0a2a52]">
        <div className="border-r border-[#0a2a52] px-2 py-1.5 flex items-center gap-2">
          <span className="font-bold">PROCESO:</span>
          <Linea value={f.proceso} onChange={(v) => set('proceso', v)} />
        </div>
        <div className="px-2 py-1.5 flex items-center gap-2">
          <span className="font-bold">ÁREA:</span>
          <Linea value={f.area} onChange={(v) => set('area', v)} />
        </div>
      </div>

      {/* 2. Motivo */}
      <Banda>2. MOTIVO DE LA SOLICITUD</Banda>
      <div className="grid grid-cols-2 border-b border-[#0a2a52]">
        <ul className="px-2 py-1.5 space-y-1 border-r border-[#0a2a52]">
          {MOTIVOS_IZQ.map((o) => (
            <li key={o.key}>
              <Check label={o.label} checked={!!f.motivos[o.key]} onChange={() => toggle('motivos', o.key)} />
            </li>
          ))}
        </ul>
        <ul className="px-2 py-1.5 space-y-1">
          {MOTIVOS_DER.map((o) => (
            <li key={o.key}>
              <Check label={o.label} checked={!!f.motivos[o.key]} onChange={() => toggle('motivos', o.key)} />
            </li>
          ))}
        </ul>
      </div>
      <div className="px-2 py-1.5 border-b border-[#0a2a52] flex items-center gap-2">
        <span className="italic whitespace-nowrap">*En caso de seleccionar <b>Otro</b>, especifique cual:</span>
        <Linea value={f.motivoOtroCual} onChange={(v) => set('motivoOtroCual', v)} />
      </div>
      <div className="grid grid-cols-2 border-b border-[#0a2a52]">
        <RangoFecha
          titulo="FECHA DE INICIO:"
          dia={f.inicioDia} mes={f.inicioMes} anio={f.inicioAnio}
          onDia={(v) => set('inicioDia', v)} onMes={(v) => set('inicioMes', v)} onAnio={(v) => set('inicioAnio', v)}
          borde
        />
        <RangoFecha
          titulo="FECHA DE TERMINACIÓN:"
          dia={f.finDia} mes={f.finMes} anio={f.finAnio}
          onDia={(v) => set('finDia', v)} onMes={(v) => set('finMes', v)} onAnio={(v) => set('finAnio', v)}
        />
      </div>

      {/* 3. Especificaciones */}
      <Banda>3. ESPECIFICACIONES DE LA SOLICITUD</Banda>
      <div className="grid grid-cols-3 border-b border-[#0a2a52]">
        <div className="border-r border-[#0a2a52]">
          <SubBanda>FORMACION ACADEMICA</SubBanda>
          <ul className="px-2 py-1.5 space-y-1">
            {FORMACION.map((o) => (
              <li key={o.key}>
                <Check label={o.label} checked={!!f.formacion[o.key]} onChange={() => toggle('formacion', o.key)} />
              </li>
            ))}
          </ul>
        </div>
        <div className="border-r border-[#0a2a52]">
          <SubBanda>HORARIO</SubBanda>
          <div className="px-2 py-1.5 space-y-1">
            <Horario label="Hora de ingreso" value={f.horaIngreso} onChange={(v) => set('horaIngreso', v)} />
            <Horario label="Hora de salida" value={f.horaSalida} onChange={(v) => set('horaSalida', v)} />
            <Horario label="Días a laborar en la semana" value={f.diasSemana} onChange={(v) => set('diasSemana', v)} />
            <Horario label="Sabado a laborar" value={f.sabado} onChange={(v) => set('sabado', v)} />
          </div>
        </div>
        <div>
          <SubBanda>EXPERIENCIA REQUERIDA</SubBanda>
          <ul className="px-2 py-1.5 space-y-1">
            {EXPERIENCIA.map((o) => (
              <li key={o.key}>
                <Check label={o.label} checked={!!f.experiencia[o.key]} onChange={() => toggle('experiencia', o.key)} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="px-2 py-1.5 border-b border-[#0a2a52] flex items-center gap-2">
        <span className="italic whitespace-nowrap">*En caso de seleccionar <b>Otro</b> especifique cuál:</span>
        <Linea value={f.formacionOtroCual} onChange={(v) => set('formacionOtroCual', v)} />
      </div>

      <div className="px-2 py-1.5 border-b border-[#0a2a52] flex items-center gap-3 flex-wrap">
        <span className="font-bold whitespace-nowrap">Tipo de vinculación:</span>
        <Check label="Contrato de trabajo" checked={f.vincContrato} onChange={(v) => set('vincContrato', v)} />
        <Check label="Pasantía" checked={f.vincPasantia} onChange={(v) => set('vincPasantia', v)} />
        <span className="font-bold whitespace-nowrap">Remuneración</span>
        <Linea value={f.remuneracion} onChange={(v) => set('remuneracion', v)} />
      </div>
      <div className="px-2 py-1.5 border-b border-[#0a2a52] flex items-center gap-3 flex-wrap">
        <span className="font-bold whitespace-nowrap">Tipo de Contrato:</span>
        <Check label="Fijo" checked={f.contratoFijo} onChange={(v) => set('contratoFijo', v)} />
        <Check label="Indefinido" checked={f.contratoIndefinido} onChange={(v) => set('contratoIndefinido', v)} />
        <Check label="Obra o labor" checked={f.contratoObraLabor} onChange={(v) => set('contratoObraLabor', v)} />
        <span className="whitespace-nowrap">Otro:</span>
        <Linea value={f.contratoOtro} onChange={(v) => set('contratoOtro', v)} />
      </div>
      <div className="px-2 py-1.5 border-b border-[#0a2a52] flex items-center gap-3 flex-wrap">
        <span className="font-bold whitespace-nowrap">Herramienta de trabajo:</span>
        <Check label="Computador" checked={f.herrComputador} onChange={(v) => set('herrComputador', v)} />
        <Check label="Correo electrónico" checked={f.herrCorreo} onChange={(v) => set('herrCorreo', v)} />
        <Check label="Puesto de trabajo" checked={f.herrPuesto} onChange={(v) => set('herrPuesto', v)} />
        <span className="whitespace-nowrap">Accesos</span>
        <Linea value={f.accesos} onChange={(v) => set('accesos', v)} />
      </div>

      {/* 4. Competencias */}
      <Banda>4. COMPETENCIAS REQUERIDAS PARA EL PUESTO</Banda>
      <div className="grid grid-cols-2 border-b border-[#0a2a52]">
        <ul className="px-2 py-1.5 space-y-1 border-r border-[#0a2a52]">
          {COMPETENCIAS_IZQ.map((o) => (
            <li key={o.key}>
              <Check label={o.label} checked={!!f.competencias[o.key]} onChange={() => toggle('competencias', o.key)} />
            </li>
          ))}
        </ul>
        <ul className="px-2 py-1.5 space-y-1">
          {COMPETENCIAS_DER.map((o) => (
            <li key={o.key}>
              <Check label={o.label} checked={!!f.competencias[o.key]} onChange={() => toggle('competencias', o.key)} />
            </li>
          ))}
        </ul>
      </div>
      <div className="px-2 py-1.5 border-b border-[#0a2a52] flex items-center gap-2">
        <span className="whitespace-nowrap">En caso de requerir otras competencias indíquelas:</span>
        <Linea value={f.competenciasOtras} onChange={(v) => set('competenciasOtras', v)} />
      </div>

      {/* Candidatos sugeridos */}
      <div className="px-2 py-1.5 border-b border-[#0a2a52]">
        <p className="text-[10.5px] leading-snug">
          <b>CANDIDATOS SUGERIDOS PARA CUBRIR LA VACANTE:</b> El candidato puede ser interno
          o externo por lo que se solicita hacer la precisión para cada caso. En el caso de
          ser una persona externa se debe incluir el número telefónico
        </p>
        <ol className="mt-2 space-y-1.5">
          {([['1', f.candidato1, 'candidato1'], ['2', f.candidato2, 'candidato2'], ['3', f.candidato3, 'candidato3']] as const).map(
            ([n, valor, key]) => (
              <li key={n} className="flex items-center gap-2">
                <span className="w-4">{n}.</span>
                <Linea value={valor} onChange={(v) => set(key, v)} />
              </li>
            ),
          )}
        </ol>
      </div>

      {/*
        Autorizaciones. No se teclean: las estampa el flujo al pasar cada paso, igual
        que en el GTH-002-F. Una firma escribible sería una firma que cualquiera puede
        poner en nombre de otro, y estas tres son justamente el respaldo del trámite.
        Van en el orden en que ocurren —se solicita, lo autoriza Gerencia de Proyectos y
        lo aprueba Gerencia—, que es además el del GTH-002-F. El formato impreso las
        pone al revés en las dos últimas casillas; manda el orden del trámite, que es
        como se leen sin confundir quién hizo qué.
      */}
      <Banda>AUTORIZACIONES</Banda>
      <div className="grid grid-cols-3">
        <Firma titulo="Solicitado por"
          nombre={firmas.solicitadoNombre ?? ''} cargo={firmas.solicitadoCargo ?? ''}
          pista="quien crea la solicitud" borde />
        <Firma titulo="Autorizado por"
          nombre={firmas.autorizadoNombre ?? ''} cargo={firmas.autorizadoCargo ?? ''}
          pista="Gerencia de Proyectos, al autorizar la solicitud" borde />
        <Firma titulo="Aprobado por"
          nombre={firmas.aprobadoNombre ?? ''} cargo={firmas.aprobadoCargo ?? ''}
          pista="Gerencia (Dra. Gloria), al firmar la solicitud" />
      </div>
    </>
  );
}

/* ── Piezas reutilizables del formato ───────────────────── */

/** Banda gris de sección, como las del formato impreso. */
export function Banda({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[hsl(var(--canalco-neutral-200))] border-b border-[#0a2a52] px-2 py-0.5 font-bold text-center text-[11px]">
      {children}
    </div>
  );
}

function SubBanda({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[#0a2a52] px-2 py-0.5 font-bold text-center text-[11px]">
      {children}
    </div>
  );
}

/**
 * Casilla del formato: el cuadro y su etiqueta al lado.
 *
 * El cuadro se dibuja a mano en vez de dejar la casilla nativa a la vista. Con la
 * nativa, `accent-color` solo se ve mientras la casilla está habilitada: en cuanto el
 * formato se bloquea —que es como se lee la mayor parte del tiempo— el navegador la
 * apaga a gris y lo marcado deja de distinguirse de lo no marcado. Y el `<fieldset
 * disabled>` no se puede desactivar desde dentro. Dibujado, lo marcado se ve igual
 * bloqueado, y además se imprime: `accent-color` no llega al papel y un fondo sí.
 *
 * La casilla real sigue ahí, transparente encima, para que siga siendo una casilla:
 * teclado, lectores de pantalla y el bloqueo del `fieldset`.
 */
function Check({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <span
        className={'relative w-3.5 h-3.5 flex-shrink-0 border border-[#0a2a52] flex items-center justify-center '
          + (checked ? 'bg-[#ffe81a]' : 'bg-white')}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
        />
        {checked && (
          <svg viewBox="0 0 16 16" className="w-3 h-3 text-[#16162b] pointer-events-none" aria-hidden="true">
            <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </label>
  );
}

/** Línea escribible que ocupa el ancho disponible. */
function Linea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-grow min-w-0 bg-transparent outline-none border-b border-dotted border-[hsl(var(--canalco-neutral-300))] focus:border-[hsl(var(--canalco-primary))] text-[11.5px] py-0.5 placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
    />
  );
}

/** Recuadro pequeño y centrado (las casillas con borde del formato). */
function Caja({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full border border-[#0a2a52] bg-transparent outline-none text-center text-[11.5px] py-0.5 focus:border-[hsl(var(--canalco-primary))]"
    />
  );
}

export function DateBox({ label, value, onChange, last }: {
  label: string; value: string; onChange: (v: string) => void; last?: boolean;
}) {
  return (
    <div className={last ? '' : 'border-r border-[#0a2a52]'}>
      <div className="text-center font-bold text-[10px] border-b border-dotted border-[hsl(var(--canalco-neutral-300))]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent outline-none text-center text-[11.5px] py-0.5"
      />
    </div>
  );
}

function RangoFecha({ titulo, dia, mes, anio, onDia, onMes, onAnio, borde }: {
  titulo: string;
  dia: string; mes: string; anio: string;
  onDia: (v: string) => void; onMes: (v: string) => void; onAnio: (v: string) => void;
  borde?: boolean;
}) {
  return (
    <div className={'px-2 py-1.5 flex items-center gap-2 ' + (borde ? 'border-r border-[#0a2a52]' : '')}>
      <span className="font-bold whitespace-nowrap">{titulo}</span>
      <div className="grid grid-cols-3 flex-grow border border-[#0a2a52]">
        <DateBox label="DIA" value={dia} onChange={onDia} />
        <DateBox label="MES" value={mes} onChange={onMes} />
        <DateBox label="AÑO" value={anio} onChange={onAnio} last />
      </div>
    </div>
  );
}

/** Fila del bloque HORARIO: etiqueta y su recuadro, como en el formato. */
function Horario({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-grow">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 border border-[#0a2a52] bg-transparent outline-none text-center text-[11.5px] py-0.5 focus:border-[hsl(var(--canalco-primary))]"
      />
    </div>
  );
}

/** Firma de solo lectura: el valor lo pone el flujo, no quien diligencia. */
function Firma({ titulo, nombre, cargo, pista, borde }: {
  titulo: string; nombre: string; cargo: string; pista: string; borde?: boolean;
}) {
  return (
    <div className={'px-3 pt-3 pb-2 ' + (borde ? 'border-r border-[#0a2a52]' : '')}>
      <div className="font-bold mb-6">{titulo}</div>
      <div className="space-y-2">
        <FirmaFila label="Nombre" value={nombre} />
        <FirmaFila label="Cargo" value={cargo} />
      </div>
      {!nombre && (
        <p className="no-print text-[10px] italic text-[hsl(var(--canalco-neutral-400))] mt-2">
          Automático · {pista}
        </p>
      )}
    </div>
  );
}

function FirmaFila({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-semibold w-16 flex-none">{label}:</span>
      <span className="flex-1 border-b border-dotted border-[hsl(var(--canalco-neutral-300))] text-[11.5px] min-h-[1.1rem]">
        {value || ' '}
      </span>
    </div>
  );
}
