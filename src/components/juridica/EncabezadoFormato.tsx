/**
 * Encabezado de formato con marco de ancho completo, según el formato oficial:
 * logo de Canales | título | logo de Alumbrado (celda propia) | cuadro de
 * codificación (tres filas: código, fecha y versión, sin etiquetas).
 *
 * El código va como plantilla («GA-___-F») para diligenciarlo a mano en cada
 * formato; la fecha y la versión traen el valor por defecto acordado.
 */
export function EncabezadoFormato({
  titulo,
  codigo = 'GA-___-F',
  fecha = '31/08/2026',
  version = '1',
  className = '',
}: {
  titulo: React.ReactNode;
  codigo?: string;
  fecha?: string;
  version?: string;
  className?: string;
}) {
  return (
    <div className={'grid grid-cols-[auto_1fr_auto_auto] border border-[#0a2a52] ' + className}>
      {/* Canales */}
      <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
        <img src="/assets/images/logo-canalco.png" alt="Canales y Contactos" className="max-h-14 object-contain" />
      </div>
      {/* Título */}
      <div className="flex items-center justify-center text-center px-3 py-2 border-r border-[#0a2a52]">
        <div>{titulo}</div>
      </div>
      {/* Alumbrado */}
      <div className="flex items-center justify-center p-2 border-r border-[#0a2a52]">
        <img src="/assets/images/logo-alumbrado.png" alt="Alumbrado Público" className="max-h-14 object-contain" />
      </div>
      {/* Cuadro de codificación: solo valores, sin etiquetas */}
      <div className="grid grid-rows-3 text-[11px] font-bold text-center min-w-[92px]">
        <div className="px-2 flex items-center justify-center border-b border-[#0a2a52]">{codigo}</div>
        <div className="px-2 flex items-center justify-center border-b border-[#0a2a52]">{fecha}</div>
        <div className="px-2 flex items-center justify-center">{version}</div>
      </div>
    </div>
  );
}
