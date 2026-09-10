import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Receipt, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { esRolPmo } from '@/utils/rolesPmo';
import { mensajeDeError } from '@/utils/errorMensaje';
import { MarcoCep } from '@/components/cep/MarcoCep';
import {
  cepService, fmtCep, MESES_CEP, nombreDePeriodo, type OrdenPago,
} from '@/services/cep.service';

/**
 * Las órdenes de pago de la fiducia: el libro diario del que sale el CEP.
 *
 * Cinco columnas del Control de Excedentes no se digitan sino que son la suma de estas
 * órdenes. Por eso existe esta pantalla y no una casilla en el CEP: **una cifra de plata
 * de un municipio hay que poder abrirla**. Cuando el municipio pregunta por qué el AOM de
 * agosto fueron cuatrocientos millones, la respuesta son dos órdenes con su fecha, su
 * número y su tercero.
 *
 * El concepto va en lista y no en casilla libre porque es lo que empareja la orden con su
 * columna del CEP. Escrito de otra forma, el giro no suma en ninguna parte y no avisa.
 */

const HOY = () => new Date().toISOString().slice(0, 10);

export default function OrdenesPagoPage() {
  const { user } = useAuth();
  const puedeEscribir = esRolPmo(user?.nombreRol);

  return (
    <MarcoCep
      titulo="Órdenes de pago"
      subtitulo="Los giros de la fiducia, uno por uno, con el mes del CEP al que se imputan"
      Icono={Receipt}
    >
      {({ companyId, anio, empresa }) => (
        <Cuerpo
          key={`${companyId}-${anio}`}
          companyId={companyId}
          anio={anio}
          municipio={empresa?.name ?? ''}
          puedeEscribir={puedeEscribir}
        />
      )}
    </MarcoCep>
  );
}

type Borrador = Partial<OrdenPago> & { valor?: string | number };

function Cuerpo({ companyId, anio, municipio, puedeEscribir }: {
  companyId: number; anio: string; municipio: string; puedeEscribir: boolean;
}) {
  const [ordenes, setOrdenes] = useState<OrdenPago[]>([]);
  const [conceptos, setConceptos] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([cepService.ordenes(companyId, anio), cepService.catalogo()])
      .then(([o, cat]) => { setOrdenes(o); setConceptos(cat.conceptos); setTipos(cat.tipos); setError(null); })
      .catch((e) => setError(mensajeDeError(e, 'No se pudieron cargar las órdenes.')))
      .finally(() => setCargando(false));
  }, [companyId, anio]);

  useEffect(cargar, [cargar]);

  /** Las órdenes agrupadas por el mes al que se imputan, que es como suma el CEP. */
  const porMes = useMemo(() => {
    const mapa = new Map<string, OrdenPago[]>();
    for (const o of ordenes) {
      mapa.set(o.periodo, [...(mapa.get(o.periodo) ?? []), o]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [ordenes]);

  const total = ordenes.reduce((s, o) => s + Number(o.valor ?? 0), 0);

  const guardar = async () => {
    if (!borrador) return;
    const valor = Number(String(borrador.valor ?? '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valor) || valor === 0) { setError('La orden necesita un valor.'); return; }
    if (!borrador.periodo || !borrador.fecha || !borrador.concepto) {
      setError('Faltan el mes, la fecha o el concepto.');
      return;
    }
    setGuardando(true);
    try {
      const cuerpo = {
        companyId,
        periodo: borrador.periodo,
        fecha: borrador.fecha,
        valor,
        concepto: borrador.concepto,
        tipo: borrador.tipo || undefined,
        numeroOrden: borrador.numeroOrden || undefined,
        detalle: borrador.detalle || undefined,
        tercero: borrador.tercero || undefined,
      };
      if (borrador.ordenId) await cepService.actualizarOrden(borrador.ordenId, cuerpo);
      else await cepService.crearOrden(cuerpo);
      setBorrador(null);
      cargar();
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo guardar la orden.'));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (orden: OrdenPago) => {
    /*
     * Se pregunta porque borrar una orden le cambia una cifra al CEP del mes, y esa
     * cifra ya puede estar en un informe entregado. No es un renglón de una lista.
     */
    const seguro = window.confirm(
      `Se va a borrar el giro de ${fmtCep(Number(orden.valor))} por ${orden.concepto}, `
      + `imputado a ${nombreDePeriodo(orden.periodo)}.\n\n`
      + 'El CEP de ese mes va a cambiar. ¿Seguir?',
    );
    if (!seguro) return;
    try {
      await cepService.borrarOrden(orden.ordenId);
      cargar();
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo borrar la orden.'));
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando las órdenes…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[hsl(var(--canalco-neutral-700))]">
          <strong>{ordenes.length}</strong> {ordenes.length === 1 ? 'orden' : 'órdenes'} en {anio}
          {ordenes.length > 0 && <> · <span className="tabular-nums">{fmtCep(total)}</span></>}
        </p>
        {puedeEscribir && (
          <Button
            onClick={() => setBorrador({
              periodo: `${anio}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
              fecha: HOY(),
              concepto: conceptos[0],
            })}
          >
            <Plus className="w-4 h-4 mr-1" /> Registrar una orden
          </Button>
        )}
      </div>

      {borrador && (
        <Formulario
          borrador={borrador}
          conceptos={conceptos}
          tipos={tipos}
          anio={anio}
          guardando={guardando}
          onCambio={setBorrador}
          onGuardar={guardar}
          onCancelar={() => setBorrador(null)}
        />
      )}

      {porMes.length === 0 ? (
        <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
          {municipio} no tiene órdenes registradas en {anio}. Mientras no las haya, las
          cinco columnas del CEP que salen de aquí —el giro a la concesión, la
          interventoría, las obras, el navideño y la energía por medición— van en cero.
        </p>
      ) : (
        porMes.map(([periodo, delMes]) => (
          <div key={periodo} className="rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white overflow-hidden">
            <header className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] flex justify-between">
              <span>{nombreDePeriodo(periodo).toUpperCase()}</span>
              <span className="tabular-nums">
                {fmtCep(delMes.reduce((s, o) => s + Number(o.valor ?? 0), 0))}
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[hsl(var(--canalco-neutral-600))] border-b border-[hsl(var(--canalco-neutral-200))]">
                    <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                    <th className="text-left px-3 py-2 font-semibold">Concepto</th>
                    <th className="text-left px-3 py-2 font-semibold">Tipo</th>
                    <th className="text-left px-3 py-2 font-semibold">Tercero</th>
                    <th className="text-left px-3 py-2 font-semibold">Detalle</th>
                    <th className="text-right px-3 py-2 font-semibold">Valor</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--canalco-neutral-200))]">
                  {delMes.map((o) => (
                    <tr key={o.ordenId}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{o.fecha}</td>
                      <td className="px-3 py-1.5">{o.concepto}</td>
                      <td className="px-3 py-1.5 text-[hsl(var(--canalco-neutral-600))]">{o.tipo ?? '–'}</td>
                      <td className="px-3 py-1.5">{o.tercero ?? '–'}</td>
                      <td className="px-3 py-1.5 text-[hsl(var(--canalco-neutral-600))]">{o.detalle ?? '–'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtCep(Number(o.valor))}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {puedeEscribir && (
                          <>
                            <button
                              onClick={() => setBorrador({ ...o, valor: String(Number(o.valor)) })}
                              className="text-xs text-[hsl(var(--canalco-primary))] hover:underline mr-3"
                            >
                              Corregir
                            </button>
                            <button
                              onClick={() => borrar(o)}
                              className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> Borrar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Formulario({
  borrador, conceptos, tipos, anio, guardando, onCambio, onGuardar, onCancelar,
}: {
  borrador: Borrador;
  conceptos: string[];
  tipos: string[];
  anio: string;
  guardando: boolean;
  onCambio: (b: Borrador) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const set = (k: keyof Borrador) => (v: string) => onCambio({ ...borrador, [k]: v });
  const claseCampo =
    'h-9 px-3 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))] w-full';

  return (
    <div className="rounded-lg border-2 border-[hsl(var(--canalco-primary))] bg-white p-4 space-y-4">
      <h2 className="font-bold text-[hsl(var(--canalco-neutral-900))]">
        {borrador.ordenId ? 'Corregir la orden' : 'Nueva orden de pago'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Mes del CEP
          </span>
          <select value={borrador.periodo ?? ''} onChange={(e) => set('periodo')(e.target.value)} className={claseCampo}>
            {MESES_CEP.map((nombre, i) => {
              const p = `${anio}-${String(i + 1).padStart(2, '0')}`;
              return <option key={p} value={p}>{nombre} {anio}</option>;
            })}
          </select>
          {/*
            Es la casilla que más se equivoca: la orden se gira en febrero pero paga la
            factura de enero. Se dice aquí y no en la ayuda de la pantalla.
          */}
          <span className="block text-[11px] text-[hsl(var(--canalco-neutral-500))] mt-1">
            A qué mes se imputa, que no siempre es el mes en que se giró.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Fecha del giro
          </span>
          <input type="date" value={borrador.fecha ?? ''} onChange={(e) => set('fecha')(e.target.value)} className={claseCampo} />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Valor
          </span>
          <input
            value={String(borrador.valor ?? '')}
            inputMode="decimal"
            onChange={(e) => set('valor')(e.target.value)}
            className={`${claseCampo} text-right tabular-nums`}
            placeholder="0"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Concepto
          </span>
          <select value={borrador.concepto ?? ''} onChange={(e) => set('concepto')(e.target.value)} className={claseCampo}>
            {conceptos.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Tipo
          </span>
          <select value={borrador.tipo ?? ''} onChange={(e) => set('tipo')(e.target.value)} className={claseCampo}>
            <option value="">Sin especificar</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Tercero
          </span>
          <input value={borrador.tercero ?? ''} onChange={(e) => set('tercero')(e.target.value)} className={claseCampo} placeholder="A quién se le giró" />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            Detalle
          </span>
          <input value={borrador.detalle ?? ''} onChange={(e) => set('detalle')(e.target.value)} className={claseCampo} placeholder="FACTURA ENERO 2026" />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
            N.º de orden
          </span>
          <input value={borrador.numeroOrden ?? ''} onChange={(e) => set('numeroOrden')(e.target.value)} className={claseCampo} />
        </label>
      </div>

      <div className="flex gap-2">
        <Button onClick={onGuardar} disabled={guardando}>
          {guardando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          Guardar la orden
        </Button>
        <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
