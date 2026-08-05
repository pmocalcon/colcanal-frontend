import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService } from '@/services/creg.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Home, Loader2, Plus, Save, TrendingUp } from 'lucide-react';

/**
 * Sub-módulo "IPP por mes" (CREG).
 *
 * A diferencia del resto de CREG, esta tabla **no va por municipio**: el IPP lo
 * publica el DANE y es el mismo para todos los contratos. Se escribe una sola vez
 * al mes y de ahí lo leen la Liquidación y el Flujo de Caja de cualquier municipio.
 *
 * La cuadrícula es año × mes, como se lee la serie en la publicación del DANE.
 */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** El IPPo de referencia de la CREG es noviembre de 2015: de ahí arranca la serie. */
const ANIO_BASE = 2015;

const ym = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`;

export default function CregIppPage() {
  const navigate = useNavigate();

  const [valores, setValores] = useState<Record<string, number>>({});
  // Lo que se está escribiendo, como texto: permite dejar la casilla a medias
  // ("107,") sin que el número a medio escribir se convierta en un valor.
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [anioExtra, setAnioExtra] = useState(0);

  useEffect(() => {
    cregService.getIppMensual()
      .then(setValores)
      .catch(() => toast.error('No se pudo cargar la serie del IPP'))
      .finally(() => setLoading(false));
  }, []);

  // Del año base hasta dos por delante del actual, y siempre lo suficiente para
  // mostrar cualquier año que ya tenga datos guardados.
  const anios = useMemo(() => {
    const conDatos = Object.keys(valores).map((k) => Number(k.slice(0, 4)));
    const hasta = Math.max(new Date().getFullYear() + 2, ...conDatos, ANIO_BASE) + anioExtra;
    const desde = Math.min(ANIO_BASE, ...conDatos, hasta);
    const out: number[] = [];
    for (let a = desde; a <= hasta; a++) out.push(a);
    return out;
  }, [valores, anioExtra]);

  const textoDe = (clave: string) =>
    borrador[clave] ?? (valores[clave] != null ? String(valores[clave]) : '');

  const escribir = (clave: string, texto: string) =>
    setBorrador((b) => ({ ...b, [clave]: texto }));

  /** Al salir de la casilla se consolida: vacío borra el mes. */
  const confirmar = (clave: string) => {
    const texto = (borrador[clave] ?? '').trim();
    setBorrador((b) => { const n = { ...b }; delete n[clave]; return n; });
    if (texto === '') {
      setValores((v) => { const n = { ...v }; delete n[clave]; return n; });
      return;
    }
    const n = Number(texto.replace(',', '.'));
    if (Number.isNaN(n)) return; // se descarta y la casilla vuelve a lo guardado
    setValores((v) => ({ ...v, [clave]: n }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardados = await cregService.saveIppMensual(valores);
      setValores(guardados);
      setBorrador({});
      toast.success('Serie del IPP guardada');
    } catch {
      toast.error('No se pudo guardar la serie del IPP');
    } finally {
      setSaving(false);
    }
  };

  const cuantos = Object.keys(valores).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Ir al inicio">
            <Home className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]" title="Volver a CREG">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> IPP por mes
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Índice de precios al productor · una sola serie para todos los municipios
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving || loading}
            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            El IPP no depende del municipio: lo publica el DANE y es el mismo para todos los contratos.
            Lo que escribas aquí lo usan la <b>Liquidación</b> y el <b>Flujo de Caja</b> de cualquier municipio
            para el mes correspondiente. Un mes en blanco cae al <b>IPP final</b> de la hoja de Parámetros
            de ese municipio.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))] flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">Serie mensual</h2>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  Desde {anios[0]} · deja en blanco los meses que aún no se publican
                </p>
              </div>
              <span className="text-xs text-[hsl(var(--canalco-neutral-500))] tabular-nums">
                {cuantos} {cuantos === 1 ? 'mes con valor' : 'meses con valor'}
              </span>
            </div>

            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[hsl(var(--canalco-neutral-100))] z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold border-b border-r border-[hsl(var(--canalco-neutral-200))] w-20">Año</th>
                    {MESES.map((m) => (
                      <th key={m} className="px-2 py-2 text-center font-medium border-b border-[hsl(var(--canalco-neutral-200))]">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {anios.map((anio) => (
                    <tr key={anio} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                      <td className="px-3 py-1 font-medium tabular-nums border-r border-[hsl(var(--canalco-neutral-100))]">{anio}</td>
                      {MESES.map((_, i) => {
                        const clave = ym(anio, i + 1);
                        return (
                          <td key={clave} className="px-1 py-0.5">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={textoDe(clave)}
                              onChange={(e) => escribir(clave, e.target.value)}
                              onBlur={() => confirmar(clave)}
                              className="h-7 text-xs text-center px-1 min-w-[4.5rem]"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-[hsl(var(--canalco-neutral-200))] flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setAnioExtra((n) => n + 1)} className="gap-2">
                <Plus className="w-4 h-4" /> Agregar {anios[anios.length - 1] + 1}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || loading}
            className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar serie
          </Button>
        </div>
      </main>
    </div>
  );
}
