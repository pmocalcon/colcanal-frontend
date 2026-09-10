import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/ui/footer';
import { useAuth } from '@/contexts/AuthContext';
import { puedeContrastarFactura } from '@/utils/rolesPmo';
import { useRecursoEconomico } from '@/hooks/useRecursoEconomico';
import { cepService } from '@/services/cep.service';

/**
 * La cáscara que comparten las tres pantallas del Control de Excedentes.
 *
 * Las tres empiezan igual —escoger municipio y año— y eso no es casualidad de diseño:
 * **el CEP no existe sin las dos cosas**. Un mes suelto no significa nada sin saber de
 * qué municipio es, y los saldos encadenan dentro del año. Tenerlo en un solo sitio
 * evita que las tres pantallas discrepen en qué municipio está mirando cada una.
 *
 * El municipio y el año viven en la URL. Así, pasar del CEP al informe conserva dónde
 * estaba uno, y el enlace que alguien pega en un correo abre lo que quiso mostrar.
 */

export interface EmpresaCep {
  companyId: number;
  name: string;
}

/** Lee y escribe municipio y año en la barra de direcciones. */
function useSeleccion() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));

  const companyId = params.get('municipio') ? Number(params.get('municipio')) : null;
  const anio = params.get('anio') ?? String(new Date().getFullYear());

  const fijar = (cambios: { companyId?: number | null; anio?: string }) => {
    const nuevos = new URLSearchParams(window.location.search);
    if ('companyId' in cambios) {
      if (cambios.companyId == null) nuevos.delete('municipio');
      else nuevos.set('municipio', String(cambios.companyId));
    }
    if (cambios.anio) nuevos.set('anio', cambios.anio);
    window.history.replaceState(null, '', `${window.location.pathname}?${nuevos}`);
    setParams(nuevos);
  };

  return { companyId, anio, fijar };
}

export function Selector({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-3 text-sm border border-[hsl(var(--canalco-neutral-300))] rounded-md bg-white outline-none focus:border-[hsl(var(--canalco-primary))] min-w-[11rem]"
      >
        {children}
      </select>
    </label>
  );
}

interface Props {
  titulo: string;
  subtitulo: string;
  Icono: React.ComponentType<{ className?: string }>;
  /** Ancho del contenido. El informe necesita más que el CEP. */
  ancho?: string;
  /** Lo que se pinta una vez hay municipio y año. */
  children: (ctx: {
    companyId: number;
    anio: string;
    empresa: EmpresaCep | undefined;
    /** Los años que ya tienen algo cargado en ese municipio. */
    anios: string[];
  }) => React.ReactNode;
}

export function MarcoCep({ titulo, subtitulo, Icono, ancho = 'max-w-7xl', children }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const puedeEntrar = puedeContrastarFactura(user?.nombreRol);

  const { empresas, loading } = useRecursoEconomico(puedeEntrar);
  const { companyId, anio, fijar } = useSeleccion();
  const [aniosCargados, setAniosCargados] = useState<string[]>([]);

  useEffect(() => {
    if (companyId == null) { setAniosCargados([]); return; }
    cepService.anios(companyId).then(setAniosCargados).catch(() => setAniosCargados([]));
  }, [companyId]);

  /** El actual y el anterior siempre se ofrecen: es donde se está trabajando. */
  const anios = useMemo(() => {
    const hoy = new Date().getFullYear();
    return [...new Set([...aniosCargados, String(hoy - 1), String(hoy), anio])].sort();
  }, [aniosCargados, anio]);

  const empresa = empresas.find((e) => e.companyId === companyId);

  if (!puedeEntrar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--canalco-neutral-50))]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))] mb-2">{titulo}</h1>
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
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-200))] no-print">
        <div className={`${ancho} mx-auto px-6 py-4 flex items-center gap-3`}>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/recurso-economico')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Icono className="w-5 h-5 text-[hsl(var(--canalco-primary))]" />
              {titulo}
            </h1>
            <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">{subtitulo}</p>
          </div>
        </div>
      </header>

      <main className={`flex-1 ${ancho} w-full mx-auto px-6 py-6 space-y-5`}>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando los municipios…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 items-end no-print">
              <Selector
                label="Municipio"
                value={companyId != null ? String(companyId) : ''}
                onChange={(v) => fijar({ companyId: v ? Number(v) : null })}
              >
                <option value="">Escoge un municipio…</option>
                {empresas.map((e) => (
                  <option key={e.companyId} value={e.companyId}>{e.name}</option>
                ))}
              </Selector>

              <Selector label="Año" value={anio} onChange={(v) => fijar({ anio: v })}>
                {anios.map((a) => (
                  <option key={a} value={a}>
                    {/* El punto marca los años que ya tienen meses cargados: sin él hay
                        que entrar año por año para encontrar dónde quedó la carga. */}
                    {aniosCargados.includes(a) ? '• ' : ''}{a}
                  </option>
                ))}
              </Selector>
            </div>

            {companyId == null ? (
              <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                Escoge un municipio para ver su control de excedentes.
              </p>
            ) : (
              children({ companyId, anio, empresa, anios: aniosCargados })
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
