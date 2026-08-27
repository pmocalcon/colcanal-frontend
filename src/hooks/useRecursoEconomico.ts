import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import {
  recursoEconomicoService,
  type RecursoEconomicoData, type EmpresaRecurso,
} from '@/services/recursoEconomico.service';

/**
 * Carga, edición y guardado del módulo Recurso Económico.
 *
 * Vive en un hook porque el módulo se parte en dos pantallas —Parámetros y Factura— y
 * las dos escriben sobre **el mismo `data`**: el backend guarda una sola fila con todo
 * el jsonb. Duplicar la carga y el guardado en cada pantalla habría dejado dos copias
 * de la misma lógica de "hay cambios sin guardar", que es justo la que no puede fallar.
 *
 * Ojo con eso último: como se guarda el jsonb entero, tener las dos pantallas abiertas
 * a la vez y guardar en ambas hace que la segunda pise lo de la primera. Es el mismo
 * riesgo que ya tenía el módulo con dos pestañas del navegador.
 */
export function useRecursoEconomico(activo: boolean) {
  const [datos, setDatos] = useState<RecursoEconomicoData>({});
  const [guardado, setGuardado] = useState<RecursoEconomicoData>({});
  const [empresas, setEmpresas] = useState<EmpresaRecurso[]>([]);
  /** Proyectos del cuadro que no existen como empresa: no se pueden guardar. */
  const [sinEmpresa, setSinEmpresa] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activo) { setLoading(false); return; }
    let vivo = true;
    recursoEconomicoService.get()
      .then(({ data, empresas: e, sinEmpresa: falta }) => {
        if (!vivo) return;
        setDatos(data); setGuardado(data); setEmpresas(e); setSinEmpresa(falta);
      })
      .catch(() => { if (vivo) toast.error('No se pudo cargar Recurso Económico'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [activo]);

  const sinGuardar = useMemo(
    () => JSON.stringify(datos) !== JSON.stringify(guardado),
    [datos, guardado],
  );

  // Aviso del navegador al cerrar con cambios pendientes.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sinGuardar]);

  const guardar = useCallback(async () => {
    setSaving(true);
    try {
      const fresco = await recursoEconomicoService.save(datos);
      setGuardado(fresco); setDatos(fresco);
      toast.success('Guardado');
    } catch {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [datos]);

  /**
   * Deja el módulo como quedó después de una escritura que no pasó por `guardar`.
   *
   * La usa el visto bueno del director, que se guarda por su propio endpoint: como el
   * servidor devuelve el bloque completo ya escrito, se toma tal cual y queda sin cambios
   * pendientes. Tocar solo `datos` habría dejado la pantalla diciendo que hay algo por
   * guardar cuando ya está guardado.
   */
  const asentar = useCallback((fresco: RecursoEconomicoData) => {
    setDatos(fresco);
    setGuardado(fresco);
  }, []);

  return { datos, setDatos, empresas, sinEmpresa, loading, saving, sinGuardar, guardar, asentar };
}
