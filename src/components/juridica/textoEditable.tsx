import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Texto editable de los documentos de G. jurídica (contrato, designación de supervisor,
 * acta de inicio).
 *
 * La plantilla vive en el código y **solo se guarda lo que se reescriba**, en un mapa
 * `textos` por clave. De ahí salen tres propiedades que valen la pena:
 *
 *  - los documentos ya generados no traen `textos` y se ven exactamente igual que antes;
 *  - corregir la plantilla alcanza a todos los documentos que no hayan tocado ese bloque;
 *  - guardar no copia páginas de texto a la base, solo los párrafos alterados.
 *
 * Los bloques que se arman con datos (partes, valor, fechas) reciben la plantilla ya
 * interpolada: se rearman solos mientras nadie los toque y se congelan al editarlos.
 */

interface TextosApi {
  get: (clave: string, plantilla: string) => string;
  set: (clave: string, valor: string) => void;
}

/**
 * Va por contexto y no por props porque son decenas de bloques repartidos por todo el
 * documento. Y los componentes viven a nivel de módulo a propósito: definidos dentro del
 * render, React los trataría como un tipo nuevo en cada tecla, los remontaría y el cursor
 * saltaría al final del párrafo en cada letra.
 */
const TextosCtx = createContext<TextosApi>({ get: (_c, p) => p, set: () => {} });

export const TextosDocumento = TextosCtx.Provider;

/** Arma el API del contexto sobre el estado del formulario del documento. */
export function useTextosDocumento<T extends { textos?: Record<string, string> }>(
  textos: Record<string, string> | undefined,
  setF: Dispatch<SetStateAction<T>>,
): TextosApi {
  return useMemo(
    () => ({
      get: (clave, plantilla) => textos?.[clave] ?? plantilla,
      set: (clave, valor) =>
        setF((p) => ({ ...p, textos: { ...(p.textos ?? {}), [clave]: valor } })),
    }),
    [textos, setF],
  );
}

/**
 * Campo que crece con el contenido. Se ve como el párrafo que reemplaza —sin bordes ni
 * fondo, heredando tipografía y tamaño del contenedor— para que el documento se lea como
 * un documento y no como un formulario. Al imprimir sale con la altura ya ajustada.
 */
export function AutoTextarea({ value, onChange, className }: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Se recalcula al cambiar el valor y también al montar: al abrir el documento el texto
  // ya viene largo y hay que darle su alto de una vez.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // Deshabilitado se ve igual de nítido: es un documento legal, tiene que poder
      // leerlo también quien solo lo consulta.
      className={
        'w-full bg-transparent outline-none resize-none overflow-hidden block text-justify ' +
        '[font-family:inherit] [font-size:inherit] leading-relaxed ' +
        'disabled:opacity-100 disabled:text-black ' + (className ?? '')
      }
    />
  );
}

/** Bloque de texto de la plantilla, reescribible. `k` es la clave con la que se guarda. */
export function TextoEd({ k, plantilla, className }: {
  k: string; plantilla: string; className?: string;
}) {
  const { get, set } = useContext(TextosCtx);
  return <AutoTextarea value={get(k, plantilla)} onChange={(v) => set(k, v)} className={className} />;
}

/** Cláusula o apartado con título: los dos editables. */
export function ClausulaEd({ k, titulo, texto }: { k: string; titulo: string; texto: string }) {
  const { get, set } = useContext(TextosCtx);
  return (
    <div className="text-justify">
      <input
        value={get(`${k}.titulo`, titulo)}
        onChange={(e) => set(`${k}.titulo`, e.target.value)}
        className="w-full bg-transparent outline-none font-bold [font-family:inherit] [font-size:inherit] disabled:opacity-100 disabled:text-black"
      />
      <TextoEd k={k} plantilla={texto} />
    </div>
  );
}

/** Lista numerada de la plantilla; cada ítem se edita por separado. */
export function ListaEd({ k, items }: { k: string; items: string[] }) {
  return (
    <ol className="list-decimal pl-8 space-y-1 text-justify">
      {items.map((it, i) => (
        <li key={i}><TextoEd k={`${k}.${i}`} plantilla={it} /></li>
      ))}
    </ol>
  );
}
