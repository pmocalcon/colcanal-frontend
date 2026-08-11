import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  cregService, COMPONENTES_KWH, sumaComponentes,
  type FacturaEnergia, type ComponentesCostoKwh,
} from '@/services/creg.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Footer } from '@/components/ui/footer';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Save, Receipt, Plus, AlertTriangle } from 'lucide-react';

/**
 * Factura de energía del comercializador, mes a mes.
 *
 * El formulario sigue el orden del documento —identificación, periodo, valores
 * facturados y componentes del costo— para que capturarla sea leerla de arriba
 * abajo, sin buscar en qué casilla va cada cifra.
 *
 * Tres cosas se calculan solas y se contrastan contra lo impreso, en vez de
 * pedirse dos veces:
 *   · consumo × costo unitario  vs  el valor de la energía;
 *   · energía + compensación + otros  vs  el total a pagar;
 *   · la suma de los seis componentes  vs  el costo unitario facturado.
 * Cuando no coinciden se avisa; no se corrige solo. En la factura de Tarso de
 * junio de 2026, por ejemplo, los componentes suman 694,48 $/kWh y el costo
 * facturado es 688,750: una diferencia real del documento, no un error de
 * captura.
 */

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
];
const CANALES = 'Canales & Contactos';

const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Texto a número: acepta coma o punto decimal y separadores de miles. */
const parseNum = (texto: string): number | null => {
  const limpio = texto.trim();
  if (!limpio) return null;
  // "7.828.455,79" -> 7828455.79 ; "688,750" -> 688.75
  const normalizado = limpio.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
};

const mesLargo = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[m - 1]} de ${y}`;
};

export default function CregFacturaEnergiaPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [meses, setMeses] = useState<Record<string, FacturaEnergia>>({});
  const [guardado, setGuardado] = useState<Record<string, FacturaEnergia>>({});
  const [ym, setYm] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCanalesContactos = useMemo(
    () => companies.find((c) => c.companyId === selectedCompanyId)?.name === CANALES,
    [companies, selectedCompanyId],
  );

  useEffect(() => {
    masterDataService.getCompanies()
      .then((res) => {
        const lista = (Array.isArray(res) ? res : [])
          .filter((c) => !EXCLUDED_COMPANY_NAMES.includes(c.name));
        setCompanies(lista);
        if (lista.length) setSelectedCompanyId(lista[0].companyId);
      })
      .catch(() => toast.error('No se pudieron cargar los municipios'));
  }, []);

  useEffect(() => {
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((res) => setProjects(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const load = useCallback((companyId: number, projectId: number | null) => {
    setLoading(true);
    cregService.getFacturaEnergia(companyId, projectId)
      .then((res) => {
        const m = res.data?.meses ?? {};
        setMeses(m); setGuardado(m);
        const claves = Object.keys(m).sort();
        setYm(claves.length ? claves[claves.length - 1] : '');
      })
      .catch(() => toast.error('No se pudieron cargar las facturas'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isCanalesContactos && !selectedProjectId) return;
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, load]);

  const sinGuardar = useMemo(
    () => JSON.stringify(meses) !== JSON.stringify(guardado),
    [meses, guardado],
  );

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sinGuardar]);

  const guardar = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      const res = await cregService.saveFacturaEnergia(
        selectedCompanyId, { meses }, selectedProjectId,
      );
      const m = res.data?.meses ?? {};
      setMeses(m); setGuardado(m);
      toast.success('Factura guardada');
    } catch {
      toast.error('No se pudo guardar la factura');
    } finally {
      setSaving(false);
    }
  };

  const factura = meses[ym] ?? {};
  const set = (patch: Partial<FacturaEnergia>) =>
    setMeses((prev) => ({ ...prev, [ym]: { ...(prev[ym] ?? {}), ...patch } }));
  const setComponente = (key: keyof ComponentesCostoKwh, v: number | null) =>
    setMeses((prev) => ({
      ...prev,
      [ym]: { ...(prev[ym] ?? {}), componentes: { ...(prev[ym]?.componentes ?? {}), [key]: v } },
    }));

  const nuevoMes = () => {
    const propuesto = new Date().toISOString().slice(0, 7);
    const texto = window.prompt('¿De qué mes es la factura? (AAAA-MM)', propuesto);
    if (!texto) return;
    const clave = texto.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(clave)) { toast.error('El mes va como AAAA-MM'); return; }
    if (meses[clave]) { toast.error(`Ya hay factura de ${mesLargo(clave)}`); setYm(clave); return; }
    setMeses((prev) => ({ ...prev, [clave]: {} }));
    setYm(clave);
  };

  const claves = useMemo(() => Object.keys(meses).sort().reverse(), [meses]);

  const confirmarSalir = () =>
    !sinGuardar || window.confirm('Hay una factura sin guardar. ¿Salir de todas formas?');

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--canalco-neutral-50))]">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-200))]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon"
            onClick={() => { if (confirmarSalir()) navigate('/dashboard/creg'); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Receipt className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Factura de energía
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Factura del comercializador mes a mes, con el desglose del costo del kWh
            </p>
          </div>
          <Button
            onClick={guardar}
            disabled={saving || !sinGuardar || !ym}
            className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </Button>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto px-6 py-8 w-full space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">Municipio</label>
            <Select
              value={selectedCompanyId ? String(selectedCompanyId) : ''}
              onValueChange={(v) => { if (confirmarSalir()) setSelectedCompanyId(Number(v)); }}
            >
              <SelectTrigger className="w-72 h-9 text-sm"><SelectValue placeholder="Municipio" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isCanalesContactos && (
            <div>
              <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">Proyecto</label>
              <Select
                value={selectedProjectId ? String(selectedProjectId) : ''}
                onValueChange={(v) => { if (confirmarSalir()) setSelectedProjectId(Number(v)); }}
              >
                <SelectTrigger className="w-64 h-9 text-sm"><SelectValue placeholder="Proyecto" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">Mes facturado</label>
            <select
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="h-9 px-3 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white min-w-[180px]"
            >
              {claves.length === 0 && <option value="">sin facturas</option>}
              {claves.map((k) => <option key={k} value={k}>{mesLargo(k)}</option>)}
            </select>
          </div>
          <Button variant="outline" size="sm" className="gap-2 h-9" onClick={nuevoMes}>
            <Plus className="w-4 h-4" /> Nueva factura
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : !ym ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-lg p-10 text-center">
            <p className="text-sm text-[hsl(var(--canalco-neutral-600))]">
              Este municipio todavía no tiene facturas cargadas.
            </p>
            <Button variant="outline" className="mt-4 gap-2" onClick={nuevoMes}>
              <Plus className="w-4 h-4" /> Cargar la primera
            </Button>
          </div>
        ) : (
          <FormularioFactura
            factura={factura}
            set={set}
            setComponente={setComponente}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

/* ── El formulario ─────────────────────────────── */

function FormularioFactura({ factura, set, setComponente }: {
  factura: FacturaEnergia;
  set: (patch: Partial<FacturaEnergia>) => void;
  setComponente: (key: keyof ComponentesCostoKwh, v: number | null) => void;
}) {
  const consumo = factura.consumoKwh ?? null;
  const cu = factura.costoUnitario ?? null;
  const energiaCalculada = consumo != null && cu != null
    ? Math.round(consumo * cu * 100) / 100
    : null;
  const valorEnergia = factura.valorEnergia ?? null;

  const totalCalculado = [valorEnergia, factura.compensacion, factura.otros]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .reduce((a, v) => a + v, 0);
  const totalPagar = factura.totalPagar ?? null;

  const suma = sumaComponentes(factura.componentes);

  // Cada contraste dice de cuánto es la diferencia, no solo que la hay: con el
  // monto se sabe de inmediato si es el redondeo al peso o un dato mal tecleado.
  const difEnergia = energiaCalculada != null && valorEnergia != null
    ? Math.round((valorEnergia - energiaCalculada) * 100) / 100 : null;
  const difTotal = totalPagar != null && totalCalculado
    ? Math.round((totalPagar - totalCalculado) * 100) / 100 : null;
  const difCu = suma != null && cu != null ? Math.round((suma - cu) * 100) / 100 : null;

  return (
    <div className="space-y-6">
      {/* Identificación y periodo van juntos: son los datos de la cabecera de la
          factura y por separado el bloque de arriba quedaba en tres campos. */}
      <Bloque titulo="Identificación">
        <Campo label="Contrato / cuenta" value={factura.contrato ?? ''}
          onText={(v) => set({ contrato: v })} placeholder="9072204" />
        <Campo label="Comercializador" value={factura.operador ?? ''}
          onText={(v) => set({ operador: v })} placeholder="EPM" />
        <CampoFecha label="Fecha de facturación" value={factura.fechaFacturacion ?? ''}
          onText={(v) => set({ fechaFacturacion: v })} />
        <CampoFecha label="Fecha de liquidación" value={factura.fechaLiquidacion ?? ''}
          onText={(v) => set({ fechaLiquidacion: v })} />
        <CampoFecha label="Desde" value={factura.desde ?? ''} onText={(v) => set({ desde: v })} />
        <CampoFecha label="Hasta" value={factura.hasta ?? ''} onText={(v) => set({ hasta: v })} />
        <CampoNum label="Días de consumo" value={factura.dias ?? null}
          onNum={(v) => set({ dias: v })} placeholder="30" decimales={0} />
      </Bloque>

      <Bloque titulo="Valores facturados">
        <CampoNum label="Consumo (kWh)" value={consumo}
          onNum={(v) => set({ consumoKwh: v })} placeholder="11.366,179" decimales={3} />
        <CampoNum label="Costo unitario ($/kWh)" value={cu}
          onNum={(v) => set({ costoUnitario: v })} placeholder="688,750" decimales={3} />
        <CampoNum label="Valor energía ($)" value={valorEnergia}
          onNum={(v) => set({ valorEnergia: v })} placeholder="7.828.455,79"
          ayuda={energiaCalculada != null ? `consumo × costo = ${fmtCOP(energiaCalculada)}` : undefined} />
        <CampoNum label="Compensación ($)" value={factura.compensacion ?? null}
          onNum={(v) => set({ compensacion: v })} placeholder="-9.050,41"
          ayuda="en negativo cuando el comercializador devuelve" />
        <CampoNum label="Otros conceptos ($)" value={factura.otros ?? null}
          onNum={(v) => set({ otros: v })} placeholder="0" />
        <CampoNum label="Total a pagar ($)" value={totalPagar}
          onNum={(v) => set({ totalPagar: v })} placeholder="7.819.405"
          ayuda={totalCalculado ? `energía + compensación + otros = ${fmtCOP(totalCalculado)}` : undefined} />
      </Bloque>

      {(difEnergia != null || difTotal != null) && (
        <div className="space-y-2">
          {difEnergia != null && Math.abs(difEnergia) >= 0.01 && (
            <Aviso>
              El valor de la energía difiere de consumo × costo unitario en{' '}
              <strong>{fmtCOP(difEnergia)}</strong>. Revisa el consumo o el costo.
            </Aviso>
          )}
          {difTotal != null && Math.abs(difTotal) >= 1 && (
            <Aviso>
              El total a pagar difiere de la suma de los conceptos en{' '}
              <strong>{fmtCOP(difTotal)}</strong>. Diferencias por debajo del peso son el
              ajuste al peso de la factura; esta es mayor.
            </Aviso>
          )}
        </div>
      )}

      <Bloque
        titulo="Componentes del costo ($/kWh)"
        nota="El desglose de la tarifa: generación, transmisión, distribución, comercialización, pérdidas y restricciones."
      >
        {COMPONENTES_KWH.map(({ key, label }) => (
          <CampoNum
            key={key}
            label={label}
            value={factura.componentes?.[key] ?? null}
            onNum={(v) => setComponente(key, v)}
            decimales={2}
          />
        ))}
      </Bloque>

      {suma != null && (
        <div className={`px-4 py-3 rounded-md border text-sm flex flex-wrap items-center gap-x-6 gap-y-1 ${
          difCu != null && Math.abs(difCu) >= 0.01
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-[hsl(var(--canalco-neutral-100))] border-[hsl(var(--canalco-neutral-200))]'
        }`}>
          <span>Suma de componentes: <strong className="tabular-nums">{fmtNum(suma)} $/kWh</strong></span>
          {cu != null && (
            <span>Costo unitario facturado: <strong className="tabular-nums">{fmtNum(cu, 3)} $/kWh</strong></span>
          )}
          {difCu != null && Math.abs(difCu) >= 0.01 && (
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              difieren en <strong className="tabular-nums">{fmtNum(difCu)}</strong>: así viene en el
              documento, no lo corrijas a la fuerza.
            </span>
          )}
        </div>
      )}

      <Bloque titulo="Observaciones" ancho>
        <textarea
          className="w-full min-h-[70px] px-3 py-2 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md"
          value={factura.observaciones ?? ''}
          placeholder="Lo que haya que dejar dicho de esta factura"
          onChange={(e) => set({ observaciones: e.target.value })}
        />
      </Bloque>
    </div>
  );
}

/* ── Piezas del formulario ─────────────────────── */

function Bloque({ titulo, nota, ancho, children }: {
  titulo: string; nota?: string; ancho?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-lg p-5">
      <h2 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] mb-1">{titulo}</h2>
      {nota && <p className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-3">{nota}</p>}
      <div className={ancho ? 'mt-3' : 'mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4'}>
        {children}
      </div>
    </section>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Campo({ label, value, onText, placeholder }: {
  label: string; value: string; onText: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">{label}</label>
      <Input className="h-9 text-sm" value={value} placeholder={placeholder}
        onChange={(e) => onText(e.target.value)} />
    </div>
  );
}

function CampoFecha({ label, value, onText }: {
  label: string; value: string; onText: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">{label}</label>
      <Input type="date" className="h-9 text-sm" value={value}
        onChange={(e) => onText(e.target.value)} />
    </div>
  );
}

/**
 * Campo numérico. Mientras se escribe muestra el texto crudo —formatear en vivo
 * mueve el cursor— y al salir lo presenta con separadores.
 */
function CampoNum({ label, value, onNum, placeholder, decimales = 2, ayuda }: {
  label: string;
  value: number | null;
  onNum: (v: number | null) => void;
  placeholder?: string;
  decimales?: number;
  ayuda?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const mostrado = editando
    ? texto
    : value != null ? fmtNum(value, decimales) : '';
  return (
    <div>
      <label className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-700))] mb-1">{label}</label>
      <Input
        className="h-9 text-sm text-right tabular-nums"
        value={mostrado}
        placeholder={placeholder}
        onFocus={() => {
          setTexto(value != null ? String(value).replace('.', ',') : '');
          setEditando(true);
        }}
        onBlur={() => setEditando(false)}
        onChange={(e) => { setTexto(e.target.value); onNum(parseNum(e.target.value)); }}
      />
      {ayuda && (
        <p className="mt-1 text-[11px] text-[hsl(var(--canalco-neutral-500))]">{ayuda}</p>
      )}
    </div>
  );
}
