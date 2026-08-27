import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Receipt, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/ui/footer';
import { useAuth } from '@/contexts/AuthContext';
import { puedeValidarFactura, esRolPmo } from '@/utils/rolesPmo';
import { useRecursoEconomico } from '@/hooks/useRecursoEconomico';
import { useLiquidacionCreg } from '@/hooks/useLiquidacionCreg';
import { FacturaMunicipio } from '@/components/recursoEconomico/FacturaMunicipio';
import { toast } from 'sonner';
import {
  bloqueoDeFactura, recursoEconomicoService, type FacturaMes,
} from '@/services/recursoEconomico.service';

/** El mensaje que manda el backend, que dice más que un «no se pudo». */
const mensajeDeError = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

/**
 * Factura de concesión: qué se le facturó a un municipio en el mes y cuánto queda neto.
 *
 * Es un submódulo aparte de Parámetros porque tiene otro ritmo: los contratos de
 * interventoría y los porcentajes de retención se configuran una vez al año, y esto se
 * diligencia todos los meses.
 *
 * **Las retenciones no se teclean acá**: salen del subtotal con los porcentajes que
 * están en Parámetros → Retención. Los dos submódulos escriben sobre el mismo registro,
 * así que corregir un porcentaje rehace las facturas que nadie haya escrito a mano.
 */

/** 'YYYY-MM' del mes anterior: la factura de un mes se liquida al mes siguiente. */
const periodoPorDefecto = (): string => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function FacturaConcesionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEntrar = puedeValidarFactura(user?.nombreRol);
  /*
   * El director de proyecto entra solo a validar: ve las cifras, porque tiene que
   * compararlas contra la factura que tiene en la mano, pero no las mueve ni guarda el
   * módulo. El backend le tiene cerrado el `PUT`, así que dejarle los campos abiertos
   * sería ofrecerle un botón que siempre falla.
   */
  const soloValidar = !esRolPmo(user?.nombreRol);

  const { datos, setDatos, empresas, sinEmpresa, loading, saving, sinGuardar, guardar, asentar } =
    useRecursoEconomico(puedeEntrar);

  const [periodo, setPeriodo] = useState<string>(periodoPorDefecto);
  const [companyId, setCompanyId] = useState<number | null>(null);

  // El AOM y la inversión del mes salen de la Liquidación CREG del municipio, que
  // es donde se calculan; acá solo se facturan.
  const { liquidacion, cargando: cregCargando, error: cregError } = useLiquidacionCreg(companyId);

  // Se abre en el primer municipio en cuanto llega la lista: un selector en blanco
  // frente a un formulario vacío parece una pantalla que no cargó.
  useEffect(() => {
    if (companyId == null && empresas.length) setCompanyId(empresas[0].companyId);
  }, [empresas, companyId]);

  const setFactura = (patch: Partial<FacturaMes>) => {
    if (companyId == null) return;
    setDatos((d) => {
      const mes = d.facturas?.[periodo] ?? {};
      return {
        ...d,
        facturas: {
          ...(d.facturas ?? {}),
          [periodo]: {
            ...mes,
            [companyId]: { ...(mes[companyId] ?? {}), ...patch },
          },
        },
      };
    });
  };

  /*
   * Qué impide guardar la factura que está en pantalla.
   *
   * Se mira solo la del municipio y mes abiertos, y no todas las del jsonb, porque es la
   * única que se está tocando: bloquear el botón por una factura de otro mes que quedó a
   * medias dejaría la pantalla trancada sin nada visible que arreglar.
   */
  const bloqueo = useMemo(() => {
    if (companyId == null) return null;
    return bloqueoDeFactura(
      datos.facturas?.[periodo]?.[companyId],
      datos.retenciones?.[companyId],
    );
  }, [datos.facturas, datos.retenciones, periodo, companyId]);

  const validarFactura = async (valor: number) => {
    if (companyId == null) return;
    try {
      asentar(await recursoEconomicoService.validarFactura(periodo, companyId, valor));
      toast.success('Factura validada');
    } catch (e) {
      toast.error(mensajeDeError(e) || 'No se pudo guardar el visto bueno');
    }
  };

  const quitarVisto = async () => {
    if (companyId == null) return;
    try {
      asentar(await recursoEconomicoService.quitarVistoFactura(periodo, companyId));
    } catch (e) {
      toast.error(mensajeDeError(e) || 'No se pudo quitar el visto bueno');
    }
  };

  const volver = () => {
    if (sinGuardar && !window.confirm('Hay cambios sin guardar. ¿Salir de todas formas?')) return;
    // El director no ve el módulo: devolverlo a su portada lo dejaría en una pantalla
    // que le dice que no puede entrar.
    navigate(soloValidar ? '/dashboard' : '/dashboard/recurso-economico');
  };

  if (!puedeEntrar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-50))]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">Factura</h1>
          <p className="text-[hsl(var(--canalco-neutral-600))]">
            Esta pantalla es del PMO y de los directores de proyecto. Si necesitas
            consultarla, pídesela al Analista o al Director de PMO.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => navigate('/dashboard')}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--canalco-neutral-50))]">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-200))]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={volver} title="Volver a Recurso Económico">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Receipt className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Factura
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
              Factura de concesión por municipio y mes de liquidación
            </p>
          </div>
          {!soloValidar && (
            <Button
              onClick={guardar}
              disabled={saving || !sinGuardar || !!bloqueo}
              title={bloqueo ?? (sinGuardar ? 'Guardar los cambios' : 'No hay cambios por guardar')}
              className="gap-2 bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" />
          </div>
        ) : (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-lg">
            {/* El botón de guardar está arriba y lejos; el motivo tiene que estar acá. */}
            {bloqueo && !soloValidar && (
              <div className="mx-4 mt-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                No se puede guardar: {bloqueo}
              </div>
            )}
            {sinEmpresa.length > 0 && (
              <div className="mx-4 mt-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Sin empresa registrada: <strong>{sinEmpresa.join(', ')}</strong>. Esos municipios no
                aparecen porque no hay contra qué guardarlos; hay que crear la empresa primero.
              </div>
            )}
            <FacturaMunicipio
              empresas={empresas}
              companyId={companyId}
              setCompanyId={setCompanyId}
              periodo={periodo}
              setPeriodo={setPeriodo}
              facturas={datos.facturas ?? {}}
              retenciones={datos.retenciones ?? {}}
              revisor={user?.nombre ?? ''}
              revisorRol={user?.nombreRol ?? undefined}
              onFactura={setFactura}
              soloValidar={soloValidar}
              onValidar={validarFactura}
              onQuitarVisto={quitarVisto}
              liquidacion={liquidacion(periodo)}
              cregCargando={cregCargando}
              cregError={cregError}
            />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
