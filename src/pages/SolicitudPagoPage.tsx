import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Banknote, Download, Loader2, Plus, RefreshCw, Save, Trash2, Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Campo, Selector } from '@/components/talentoHumano/campos';
import { buildXlsxBlob, downloadBlob } from '@/utils/xlsxWriter';
import type { XlsxRow } from '@/utils/xlsxWriter';
import {
  talentoHumanoService,
  type ThBanco,
  type ThSolicitudPagoDetalle,
  type ThSolicitudPagoLinea,
} from '@/services/talentoHumano.service';

/**
 * El detalle de una solicitud de pago, con sus dos caras.
 *
 * **Solicitud de pagos** es el documento interno: a quién, cuánto, de qué proyecto.
 * **Archivo del banco** es exactamente lo mismo con las columnas y los códigos que pide
 * el portal bancario. No son dos documentos que haya que mantener sincronizados —que es
 * lo que pasaba en el Excel, donde cada hoja se llenaba por su lado—: es una sola lista
 * mirada de dos maneras.
 *
 * Lo que el archivo necesita y la solicitud no —el código de la entidad, el nombre
 * partido en dos, el tipo de producto— se resuelve de la ficha de cada persona y del
 * catálogo de bancos. Lo que falte se muestra en rojo acá, porque una fila incompleta
 * hace que el banco rechace el archivo **entero**, no esa fila.
 *
 * Ruta: `.../talento-humano/pagos/:id`.
 */

const cop = (v: number | string) => {
  const n = Number(v);
  return Number.isFinite(n) && n ? '$' + Math.round(n).toLocaleString('es-CO') : '—';
};

const fechaLarga = (f: string | null) => {
  if (!f) return '—';
  const [a, m, d] = f.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

const TIPOS_CUENTA = ['AHORROS', 'CORRIENTE'];
const TIPOS_ID = ['CC', 'CE', 'TI', 'NIT', 'PA'];
const ESTADOS = ['BORRADOR', 'ENVIADA', 'PAGADA'];

type Pestana = 'solicitud' | 'banco';

/** El borrador de una línea; `lineaId` ausente significa que es nueva. */
type BorradorLinea = Partial<ThSolicitudPagoLinea> & { lineaId?: number };

export default function SolicitudPagoPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const solicitudId = Number(id);

  const [datos, setDatos] = useState<ThSolicitudPagoDetalle | null>(null);
  const [bancos, setBancos] = useState<ThBanco[]>([]);
  const [loading, setLoading] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('solicitud');
  const [linea, setLinea] = useState<BorradorLinea | null>(null);
  /**
   * La cabecera se escribe acá y se manda al servidor al salir del campo.
   * Atada directo al `onChange` haría un PATCH por cada tecla del concepto.
   */
  const [cabecera, setCabecera] = useState({ fecha: '', concepto: '', observaciones: '' });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await talentoHumanoService.getSolicitudPago(solicitudId);
      setDatos(d);
      setCabecera({
        fecha: d.solicitud.fecha?.slice(0, 10) ?? '',
        concepto: d.solicitud.concepto ?? '',
        observaciones: d.solicitud.observaciones ?? '',
      });
    } catch {
      toast.error('No se pudo cargar la solicitud');
    } finally {
      setLoading(false);
    }
  }, [solicitudId]);

  useEffect(() => {
    void cargar();
    talentoHumanoService.listBancos().then(setBancos).catch(() => setBancos([]));
  }, [cargar]);

  const solicitud = datos?.solicitud;
  const lineas = useMemo(() => datos?.lineas ?? [], [datos]);
  const esBorrador = solicitud?.estado === 'BORRADOR';
  const listas = useMemo(() => lineas.filter((l) => l.faltantes.length === 0), [lineas]);
  const totalListas = useMemo(
    () => listas.reduce((s, l) => s + Number(l.valor), 0),
    [listas],
  );

  const nombresBanco = useMemo(
    () => bancos.filter((b) => b.activo).map((b) => b.nombre),
    [bancos],
  );

  /** Envuelve una acción del servidor: apaga los botones y refresca con lo que devuelva. */
  const accion = async (fn: () => Promise<ThSolicitudPagoDetalle>, exito?: string) => {
    setTrabajando(true);
    try {
      setDatos(await fn());
      if (exito) toast.success(exito);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo completar la acción');
    } finally {
      setTrabajando(false);
    }
  };

  const cambiarCabecera = (campos: { fecha?: string; concepto?: string; estado?: string; observaciones?: string | null }) =>
    accion(() => talentoHumanoService.actualizarSolicitudPago(solicitudId, campos));

  const regenerar = () => {
    if (!window.confirm(
      'Regenerar bota todas las líneas y las vuelve a traer de la nómina del periodo. ' +
      'Se pierde lo que se haya editado a mano acá. ¿Seguir?',
    )) return;
    void accion(() => talentoHumanoService.regenerarSolicitudPago(solicitudId), 'Líneas regeneradas');
  };

  const refrescar = () =>
    accion(
      () => talentoHumanoService.refrescarBancariosSolicitud(solicitudId),
      'Se volvieron a leer las fichas',
    );

  const guardarLinea = async () => {
    if (!linea) return;
    await accion(() => talentoHumanoService.guardarLineaPago(solicitudId, linea));
    setLinea(null);
  };

  const borrarLinea = (l: ThSolicitudPagoLinea) => {
    if (!window.confirm(`¿Quitar a ${l.nombre} de la solicitud?`)) return;
    void accion(() => talentoHumanoService.borrarLineaPago(solicitudId, l.lineaId));
  };

  // ── Exportar ──

  const exportarSolicitud = async () => {
    if (!solicitud) return;
    try {
      const filas: XlsxRow[] = [
        [{ v: 'SOLICITUD DE PAGOS', s: 'title' }],
        [],
        [{ v: 'Fecha', s: 'labelBold' }, { v: fechaLarga(solicitud.fecha), s: 'value' }],
        [{ v: 'Concepto', s: 'labelBold' }, { v: solicitud.concepto, s: 'value' }],
        [{ v: 'Periodo', s: 'labelBold' }, { v: solicitud.periodo ?? '—', s: 'value' }],
        [],
        [
          'No. De documento', 'Nombre', 'TI', 'Proyecto', 'Valor',
          'Banco', 'Tipo de cuenta', 'Cuenta', 'Observación',
        ].map((v) => ({ v, s: 'header' as const })),
        ...lineas.map((l): XlsxRow => [
          { v: l.identificacion, s: 'text' },
          { v: l.nombre, s: 'text' },
          { v: l.tipoId || 'CC', s: 'text' },
          { v: l.proyecto ?? '', s: 'text' },
          { v: Number(l.valor), s: 'money' },
          { v: l.banco ?? '', s: 'text' },
          { v: l.tipoCuenta ?? '', s: 'text' },
          // El número de cuenta va como texto: los ceros de la izquierda son parte de él.
          { v: l.cuenta ?? '', s: 'text' },
          { v: l.observacion ?? '', s: 'text' },
        ]),
        [
          { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
          { v: 'Total general', s: 'totalText' },
          { v: datos?.total ?? 0, s: 'totalMoney' },
          { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
          { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
        ],
      ];
      const blob = await buildXlsxBlob(
        'Solicitud de pagos', filas,
        [18, 36, 6, 18, 14, 26, 15, 22, 18],
        [],
        // Sin esto Excel llena la columna de cuentas de triangulitos verdes.
        [`H8:H${7 + lineas.length}`],
      );
      downloadBlob(blob, `Solicitud_de_pagos_${solicitud.periodo ?? solicitud.fecha}.xlsx`);
    } catch {
      toast.error('No se pudo generar el Excel');
    }
  };

  const exportarArchivoBanco = async () => {
    if (!solicitud) return;
    try {
      const { filas: bancarias, total, excluidas } = await talentoHumanoService.archivoBanco(solicitudId);
      if (bancarias.length === 0) {
        toast.error('Ninguna línea está completa todavía, así que el archivo saldría vacío');
        return;
      }
      const filas: XlsxRow[] = [
        [
          'TIPO ID', 'N° Documento', 'NOMBRES', 'PRIMER APELLIDO', 'COD DEL BANCO',
          'TIPO DE PRODUCTO O SERVICIO', 'NUMERO DEL PRODUCTO', 'VALOR DEL PAGO',
        ].map((v) => ({ v, s: 'header' as const })),
        ...bancarias.map((f): XlsxRow => [
          { v: f.tipoId, s: 'qty' },
          { v: f.identificacion, s: 'text' },
          { v: f.nombres, s: 'text' },
          { v: f.apellidos, s: 'text' },
          { v: f.codigoBanco, s: 'qty' },
          { v: f.tipoProducto, s: 'text' },
          { v: f.numeroProducto, s: 'text' },
          { v: f.valor, s: 'money' },
        ]),
        [
          { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
          { v: '', s: 'totalText' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
          { v: 'TOTAL', s: 'totalText' },
          { v: total, s: 'totalMoney' },
        ],
      ];
      const blob = await buildXlsxBlob(
        'Banco', filas,
        [9, 16, 22, 26, 14, 26, 22, 15],
        [],
        [`B2:B${1 + bancarias.length}`, `G2:G${1 + bancarias.length}`],
      );
      downloadBlob(blob, `Banco_${solicitud.periodo ?? solicitud.fecha}.xlsx`);
      if (excluidas.length) {
        toast.warning(
          `${excluidas.length} ${excluidas.length === 1 ? 'persona quedó' : 'personas quedaron'} por fuera del archivo`,
        );
      }
    } catch {
      toast.error('No se pudo generar el archivo del banco');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--canalco-primary))]" />
      </div>
    );
  }
  if (!solicitud || !datos) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-4">
        <p className="text-[hsl(var(--canalco-neutral-500))]">Esa solicitud no existe.</p>
        <Button variant="outline" onClick={() => navigate('/dashboard/talento-humano/pagos')}>
          Volver al listado
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 pt-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/talento-humano/pagos')} title="Volver al listado">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              {solicitud.concepto} · {fechaLarga(solicitud.fecha)}
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              {lineas.length} {lineas.length === 1 ? 'persona' : 'personas'} · {cop(datos.total)}
              {solicitud.periodo && ` · periodo ${solicitud.periodo}`}
              {solicitud.creadoPor && ` · creada por ${solicitud.creadoPor}`}
            </p>
          </div>
          <Selector
            label="Estado"
            value={solicitud.estado}
            opciones={ESTADOS}
            onChange={(v) => void cambiarCabecera({ estado: v })}
            ancho="w-40"
          />
        </div>
        <nav className="max-w-[1400px] mx-auto px-6 flex gap-1 mt-3">
          {([
            ['solicitud', 'Solicitud de pagos'],
            ['banco', 'Archivo del banco'],
          ] as Array<[Pestana, string]>).map(([id_, texto]) => (
            <button
              key={id_}
              onClick={() => setPestana(id_)}
              className={
                'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
                (pestana === id_
                  ? 'border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                  : 'border-transparent text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-800))]')
              }
            >
              {texto}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {/*
          Lo que falta se avisa arriba y no solo fila por fila: una sola línea incompleta
          deja el archivo del banco sin poder subirse, así que no puede quedar escondida
          al final de una tabla de cuarenta y pico.
        */}
        {datos.incompletas > 0 && (
          <div className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-grow">
              <p className="font-semibold">
                {datos.incompletas} de {lineas.length} {datos.incompletas === 1 ? 'línea no puede' : 'líneas no pueden'} salir en el archivo del banco.
              </p>
              <p className="text-red-800 mt-0.5">
                Casi siempre es que a la persona le falta el banco o la cuenta en su ficha. Llénalos en{' '}
                <button className="underline font-semibold" onClick={() => navigate('/dashboard/talento-humano/personal')}>
                  Personal
                </button>
                {' '}y vuelve a leerlas acá, o corrígelas en la línea directamente.
              </p>
            </div>
            {esBorrador && (
              <Button variant="outline" size="sm" onClick={refrescar} disabled={trabajando} className="gap-2 shrink-0">
                <Wand2 className="w-4 h-4" /> Volver a leer las fichas
              </Button>
            )}
          </div>
        )}

        {pestana === 'solicitud' ? (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <CampoCabecera
                label="Fecha"
                value={cabecera.fecha}
                tipo="date"
                onChange={(v) => setCabecera((c) => ({ ...c, fecha: v }))}
                onListo={(v) => { if (v !== solicitud.fecha?.slice(0, 10)) void cambiarCabecera({ fecha: v }); }}
              />
              <CampoCabecera
                label="Concepto"
                value={cabecera.concepto}
                onChange={(v) => setCabecera((c) => ({ ...c, concepto: v }))}
                onListo={(v) => { if (v !== solicitud.concepto) void cambiarCabecera({ concepto: v }); }}
              />
              <CampoCabecera
                label="Observaciones"
                value={cabecera.observaciones}
                ancho="flex-grow min-w-[240px]"
                onChange={(v) => setCabecera((c) => ({ ...c, observaciones: v }))}
                onListo={(v) => { if (v !== (solicitud.observaciones ?? '')) void cambiarCabecera({ observaciones: v }); }}
              />
              <div className="flex gap-2 ml-auto">
                {esBorrador && solicitud.periodo && (
                  <Button variant="outline" onClick={regenerar} disabled={trabajando} className="gap-2">
                    <RefreshCw className="w-4 h-4" /> Regenerar
                  </Button>
                )}
                {esBorrador && (
                  <Button
                    variant="outline"
                    onClick={() => setLinea({ tipoId: 'CC', valor: '0' })}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" /> Agregar línea
                  </Button>
                )}
                <Button onClick={exportarSolicitud} className="gap-2">
                  <Download className="w-4 h-4" /> Exportar
                </Button>
              </div>
            </div>

            {linea && (
              <FormularioLinea
                linea={linea}
                bancos={nombresBanco}
                trabajando={trabajando}
                onChange={setLinea}
                onGuardar={guardarLinea}
                onCancelar={() => setLinea(null)}
              />
            )}

            <TablaSolicitud
              lineas={lineas}
              total={datos.total}
              editable={!!esBorrador}
              onEditar={setLinea}
              onBorrar={borrarLinea}
            />
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-4">
              <p className="flex-grow text-sm bg-sky-50 text-sky-900 border border-sky-200 rounded-md px-3 py-2">
                Estas son las columnas y los códigos que espera el portal bancario. Salen{' '}
                <strong>{listas.length} de {lineas.length}</strong> líneas, por {cop(totalListas)}
                {datos.incompletas > 0 && ' — el resto queda por fuera hasta que se complete'}.
              </p>
              <Button onClick={exportarArchivoBanco} className="gap-2 shrink-0">
                <Download className="w-4 h-4" /> Exportar
              </Button>
            </div>
            <TablaBanco lineas={lineas} bancos={bancos} total={totalListas} />
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Un campo de la cabecera: se escribe libre y solo avisa al salir o con Enter.
 *
 * No usa `Campo` porque ese llama a `onChange` en cada tecla, que acá sería un PATCH por
 * letra del concepto.
 */
function CampoCabecera({ label, value, onChange, onListo, tipo, ancho }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onListo: (v: string) => void;
  tipo?: string;
  ancho?: string;
}) {
  return (
    <label className={'block ' + (ancho ?? '')}>
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">{label}</span>
      <input
        type={tipo ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onListo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-full border border-[hsl(var(--canalco-neutral-300))] rounded px-2 py-1 text-sm bg-white"
      />
    </label>
  );
}

// ── Formulario de una línea ──

function FormularioLinea({ linea, bancos, trabajando, onChange, onGuardar, onCancelar }: {
  linea: BorradorLinea;
  bancos: string[];
  trabajando: boolean;
  onChange: (l: BorradorLinea) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const set = <K extends keyof BorradorLinea>(k: K, v: BorradorLinea[K]) =>
    onChange({ ...linea, [k]: v });

  return (
    <div className="mb-6 bg-white border-2 border-[hsl(var(--canalco-primary))] rounded-xl shadow-sm">
      <div className="px-5 py-3 border-b border-[hsl(var(--canalco-neutral-200))] text-sm font-semibold">
        {linea.lineaId ? `Editar ${linea.nombre}` : 'Agregar línea'}
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3">
        <Campo label="Identificación" value={linea.identificacion ?? ''} onChange={(v) => set('identificacion', v)} />
        <Selector label="Tipo de documento" value={linea.tipoId ?? 'CC'} opciones={TIPOS_ID} onChange={(v) => set('tipoId', v)} />
        <Campo label="Nombre" value={linea.nombre ?? ''} onChange={(v) => set('nombre', v)} ancho="md:col-span-2" />
        <Campo label="Apellidos" value={linea.apellidos ?? ''} onChange={(v) => set('apellidos', v)} nota="Como va en el archivo del banco." />
        <Campo label="Nombres" value={linea.nombres ?? ''} onChange={(v) => set('nombres', v)} />
        <Campo label="Proyecto" value={linea.proyecto ?? ''} onChange={(v) => set('proyecto', v)} />
        <Campo label="Valor" value={linea.valor ?? ''} onChange={(v) => set('valor', v)} tipo="number" />
        <Selector label="Banco" value={linea.banco ?? ''} opciones={bancos} onChange={(v) => set('banco', v)} />
        <Campo label="Cuenta" value={linea.cuenta ?? ''} onChange={(v) => set('cuenta', v)} nota="Con los ceros de la izquierda." />
        <Selector label="Tipo de cuenta" value={linea.tipoCuenta ?? ''} opciones={TIPOS_CUENTA} onChange={(v) => set('tipoCuenta', v)} />
        <Campo label="Observación" value={linea.observacion ?? ''} onChange={(v) => set('observacion', v)} />
      </div>
      <footer className="px-5 py-3 border-t border-[hsl(var(--canalco-neutral-200))] flex gap-3">
        <Button onClick={onGuardar} disabled={trabajando} className="gap-2">
          {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
        </Button>
        <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
      </footer>
    </div>
  );
}

// ── La solicitud, tal como se imprime ──

function TablaSolicitud({ lineas, total, editable, onEditar, onBorrar }: {
  lineas: ThSolicitudPagoLinea[];
  total: number;
  editable: boolean;
  onEditar: (l: BorradorLinea) => void;
  onBorrar: (l: ThSolicitudPagoLinea) => void;
}) {
  if (lineas.length === 0) {
    return (
      <p className="text-center text-[hsl(var(--canalco-neutral-500))] py-12">
        Esta solicitud no tiene ninguna línea todavía.
      </p>
    );
  }
  return (
    <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-auto shadow-sm max-h-[calc(100vh-13rem)]">
      <table className="text-sm w-full">
        <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))] [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-[hsl(var(--canalco-neutral-100))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">No. de documento</th>
            <th className="px-3 py-2 text-left font-semibold">Nombre</th>
            <th className="px-3 py-2 text-left font-semibold">TI</th>
            <th className="px-3 py-2 text-left font-semibold">Proyecto</th>
            <th className="px-3 py-2 text-right font-semibold">Valor</th>
            <th className="px-3 py-2 text-left font-semibold">Banco</th>
            <th className="px-3 py-2 text-left font-semibold">Tipo de cuenta</th>
            <th className="px-3 py-2 text-left font-semibold">Cuenta</th>
            <th className="px-3 py-2 text-left font-semibold">Observación</th>
            {editable && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const incompleta = l.faltantes.length > 0;
            return (
              <tr
                key={l.lineaId}
                className={
                  'border-t border-[hsl(var(--canalco-neutral-200))] ' +
                  (incompleta ? 'bg-red-50' : '')
                }
                title={incompleta ? `Falta: ${l.faltantes.join(', ')}` : undefined}
              >
                <td className="px-3 py-2 tabular-nums">{l.identificacion}</td>
                <td className="px-3 py-2 whitespace-nowrap">{l.nombre}</td>
                <td className="px-3 py-2">{l.tipoId || 'CC'}</td>
                <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-600))]">{l.proyecto || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(l.valor)}</td>
                <td className={'px-3 py-2 ' + (l.bancoCodigo ? '' : 'text-red-700 font-semibold')}>
                  {l.banco || 'falta'}
                </td>
                <td className={'px-3 py-2 ' + (l.tipoCuenta ? '' : 'text-red-700 font-semibold')}>
                  {l.tipoCuenta || 'falta'}
                </td>
                <td className={'px-3 py-2 tabular-nums ' + (l.cuenta ? '' : 'text-red-700 font-semibold')}>
                  {l.cuenta || 'falta'}
                </td>
                <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-600))] max-w-[180px] truncate">
                  {l.observacion || '—'}
                </td>
                {editable && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => onEditar(l)}>Editar</Button>
                    <Button variant="ghost" size="icon" onClick={() => onBorrar(l)} title={`Quitar a ${l.nombre}`}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
          <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
            <td className="px-3 py-2" colSpan={4}>Total general</td>
            <td className="px-3 py-2 text-right tabular-nums">{cop(total)}</td>
            <td className="px-3 py-2" colSpan={editable ? 5 : 4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── El archivo del banco, tal como se sube ──

function TablaBanco({ lineas, bancos, total }: {
  lineas: ThSolicitudPagoLinea[];
  bancos: ThBanco[];
  total: number;
}) {
  const CODIGO_TIPO_ID: Record<string, number> = { CC: 1, CE: 2, NIT: 3, TI: 4, PA: 5 };
  const CODIGO_TIPO_CUENTA: Record<string, string> = { AHORROS: 'CA', CORRIENTE: 'CC' };
  const nombrePorCodigo = new Map(bancos.map((b) => [b.codigo, b.nombre]));

  return (
    <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl overflow-auto shadow-sm max-h-[calc(100vh-13rem)]">
      <table className="text-sm w-full">
        <thead className="bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-700))] [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-[hsl(var(--canalco-neutral-100))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">TIPO ID</th>
            <th className="px-3 py-2 text-left font-semibold">N° Documento</th>
            <th className="px-3 py-2 text-left font-semibold">NOMBRES</th>
            <th className="px-3 py-2 text-left font-semibold">PRIMER APELLIDO</th>
            <th className="px-3 py-2 text-right font-semibold">COD DEL BANCO</th>
            <th className="px-3 py-2 text-left font-semibold">TIPO DE PRODUCTO</th>
            <th className="px-3 py-2 text-left font-semibold">NUMERO DEL PRODUCTO</th>
            <th className="px-3 py-2 text-right font-semibold">VALOR DEL PAGO</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const fuera = l.faltantes.length > 0;
            return (
              <tr
                key={l.lineaId}
                className={
                  'border-t border-[hsl(var(--canalco-neutral-200))] ' +
                  (fuera ? 'bg-red-50 text-red-900' : '')
                }
                title={fuera ? `No sale en el archivo — falta: ${l.faltantes.join(', ')}` : undefined}
              >
                <td className="px-3 py-2 tabular-nums">{CODIGO_TIPO_ID[l.tipoId] ?? 1}</td>
                <td className="px-3 py-2 tabular-nums">{l.identificacion}</td>
                <td className="px-3 py-2">{l.nombres || <span className="font-semibold">falta</span>}</td>
                <td className="px-3 py-2">{l.apellidos || <span className="font-semibold">falta</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.bancoCodigo ? (
                    <span title={nombrePorCodigo.get(l.bancoCodigo) ?? l.banco ?? ''}>{l.bancoCodigo}</span>
                  ) : (
                    <span className="font-semibold">falta</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {CODIGO_TIPO_CUENTA[l.tipoCuenta ?? ''] ?? <span className="font-semibold">falta</span>}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {l.cuenta || <span className="font-semibold">falta</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{cop(l.valor)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-[hsl(var(--canalco-neutral-100))] font-semibold">
          <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
            <td className="px-3 py-2" colSpan={6} />
            <td className="px-3 py-2 text-right">TOTAL</td>
            <td className="px-3 py-2 text-right tabular-nums">{cop(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
