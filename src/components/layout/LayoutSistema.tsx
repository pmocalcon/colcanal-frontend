import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { ChevronsLeft, ChevronsRight, Home, Lock, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { modulesService, type Module } from '@/services/modules.service';
import {
  prepararModulos,
  seccionesDe,
  puedeVerAprobaciones,
  APROBACIONES,
  type Seccion,
} from '@/config/modulosSistema';
import {
  SUBMODULOS_COMPRAS, SUBMODULOS_CREG, SUBMODULOS_OBRAS, accesoCompras, accesoObras,
} from '@/config/submodulos';
import { useGranularPermissions } from '@/hooks/useGranularPermissions';
import { esRolPmo } from '@/utils/rolesPmo';
import { puedeVerTalentoHumano } from '@/services/talentoHumano.service';

/**
 * Barra lateral del sistema: el navegador de la aplicación.
 *
 * Envuelve todas las pantallas desde `App.tsx`, así que se monta una sola vez y los
 * módulos se piden una sola vez —no en cada cambio de página—. No aparece en el login
 * (no hay sesión de la cual sacar módulos) ni al imprimir, y por debajo de `lg` se
 * esconde: las pantallas de formatos son tablas anchas y ahí el ancho es escaso.
 *
 * Los módulos y su orden salen de `prepararModulos`, el mismo que usa el dashboard;
 * los que el rol no puede abrir se muestran con candado, igual que las tarjetas.
 */

/**
 * Los módulos que no vienen de la tabla `gestiones` y viven fijos en el frontend.
 * En el mismo orden en que el dashboard pinta sus tarjetas: las dos pantallas son la
 * misma lista vista de dos maneras y no pueden contradecirse.
 */
const FIJOS = [
  { slug: 'gestion-conocimiento', nombre: 'Gestión del conocimiento', icono: 'BookOpen' },
  { slug: 'talento-humano', nombre: 'Talento Humano', icono: 'Users' },
  { slug: 'recurso-economico', nombre: 'Recurso Económico', icono: 'Wallet' },
];

/** Las dos primeras iniciales del nombre, para el círculo del usuario. */
const iniciales = (nombre?: string) =>
  (nombre ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '·';

/** El icono que nombra el módulo; si no existe, uno neutro. */
function IconoModulo({ nombre }: { nombre: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[nombre];
  const Final = C ?? Icons.Square;
  return <Final className="w-4 h-4 flex-none" />;
}

export function LayoutSistema({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { hasPermission } = useGranularPermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);

  /*
   * Plegada o desplegada, y recordado entre sesiones: quien trabaja en los formatos
   * —tablas anchas— la pliega y no querría volver a plegarla en cada recarga.
   *
   * Plegada deja una franja con el botón en vez de desaparecer: así el botón de volver
   * a abrirla ocupa su propio sitio y nunca se monta encima de la página.
   */
  const [abierta, setAbierta] = useState(
    () => localStorage.getItem('barraLateral') !== 'plegada',
  );
  const alternar = () => setAbierta((v) => {
    localStorage.setItem('barraLateral', v ? 'plegada' : 'abierta');
    return !v;
  });

  // Sin sesión no hay barra: el login se pinta a pantalla completa.
  const oculta = location.pathname === '/login' || location.pathname === '/';

  useEffect(() => {
    if (oculta || !user) return;
    modulesService.getUserModules()
      .then(setModules)
      // La barra no puede tumbar la pantalla: si los módulos no cargan, queda con lo
      // fijo y el usuario sigue navegando por el dashboard.
      .catch(() => setModules([]));
  }, [oculta, user]);

  const items = useMemo(() => {
    const delBackend = prepararModulos(modules).map((m) => ({
      slug: m.slug, nombre: m.nombre, icono: m.icono, acceso: m.hasAccess,
    }));
    const fijos = FIJOS
      // Talento Humano y Recurso Económico se abren por rol, no por permiso: a quien
      // no lo tenga no se le pintan, ni con candado, porque no hay permiso que pueda
      // pedir. Gestión del conocimiento sí es para todos.
      .filter((f) => {
        if (f.slug === 'talento-humano') return puedeVerTalentoHumano(user?.nombreRol);
        if (f.slug === 'recurso-economico') return esRolPmo(user?.nombreRol);
        return true;
      })
      .map((f) => ({ ...f, acceso: true }));
    // Aprobaciones encabeza la barra, en el mismo orden que el tablero: es lo que hay
    // pendiente de firmar y quien la ve entra al sistema para eso.
    const aprobaciones = puedeVerAprobaciones(user?.nombreRol)
      ? [{ ...APROBACIONES, acceso: true }]
      : [];
    return [...aprobaciones, ...delBackend, ...fijos];
  }, [modules, user?.nombreRol]);

  /*
   * Las secciones de Compras y Obras se calculan con los permisos del usuario, con las
   * mismas funciones que usan sus portadas. Se filtran, no se pintan con candado: la
   * barra es para saltar de un sitio a otro y una lista de trece entradas donde solo
   * tres se pueden abrir estorba más de lo que informa. El candado sigue en las
   * tarjetas de la portada, que es donde se ve el mapa del módulo.
   */
  const secciones = (slug: string): Seccion[] | null => {
    if (slug === 'compras') {
      const permisos = modules.find((m) => m.slug === 'compras')?.permisos ?? null;
      return SUBMODULOS_COMPRAS
        .filter((s) => accesoCompras(s.slug, permisos, user?.nombreRol, modules))
        .map((s) => ({ to: s.to, label: s.nombre }));
    }
    if (slug === 'levantamiento-obras') {
      return SUBMODULOS_OBRAS
        .filter((s) => accesoObras(s.slug, hasPermission, user?.nombreRol))
        .map((s) => ({ to: s.to, label: s.nombre }));
    }
    if (slug === 'creg') {
      // En CREG el acceso es el permiso granular y nada más.
      return SUBMODULOS_CREG
        .filter((s) => hasPermission(s.permiso))
        .map((s) => ({ to: s.to, label: s.nombre }));
    }
    return null;
  };

  if (oculta) return <>{children}</>;

  // Sobre la tinta oscura el activo va en amarillo pleno con texto oscuro: es el único
  // acento de la paleta y marca dónde está el usuario sin necesidad de otro color.
  const clase = (activo: boolean, acceso: boolean) =>
    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors text-left '
    + (!acceso
      ? 'text-[#5a5a78] cursor-not-allowed'
      : activo
        ? 'bg-[#ffe81a] text-[#16162b]'
        : 'text-[#b9b9ce] hover:bg-[#23233d] hover:text-white');

  // Plegada: una franja con la marca y el botón de abrir, nada más.
  if (!abierta) {
    return (
      <div className="min-h-screen flex bg-white">
        <nav className="no-print hidden lg:flex flex-col items-center gap-3 w-12 shrink-0 bg-[#16162b] py-4 h-screen sticky top-0">
          <span className="w-9 h-9 rounded-lg bg-[#ffe81a] text-[#16162b] text-[13px] font-extrabold tracking-tight flex items-center justify-center flex-none">
            SGE
          </span>
          <button
            onClick={alternar}
            title="Mostrar el menú"
            aria-label="Mostrar el menú"
            className="p-1.5 rounded-lg text-[#b9b9ce] hover:bg-[#23233d] hover:text-white transition-colors"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
          {/* Plegada sigue diciendo quién está, con el nombre en el `title`: es lo que
              se consulta cuando se comparte un equipo. */}
          <span
            className="mt-auto w-8 h-8 rounded-full bg-[#23233d] text-[#ffe81a] text-[11px] font-bold flex items-center justify-center flex-none"
            title={`${user?.nombre ?? 'Usuario'} · ${user?.nombreRol ?? 'Sin rol'}`}
          >
            {iniciales(user?.nombre)}
          </span>
        </nav>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white">
      <nav className="no-print hidden lg:flex flex-col w-60 shrink-0 bg-[#16162b] py-4 px-2 h-screen sticky top-0">
        <div className="mb-4 pl-3 pr-1 flex items-center gap-2.5">
          {/* El cuadro amarillo con la sigla: la marca de la barra. Va cuadrado y con
              la sigla ajustada, que con tres letras ya no cabe al tamaño del texto. */}
          <span className="w-9 h-9 rounded-lg bg-[#ffe81a] text-[#16162b] text-[13px] font-extrabold tracking-tight flex items-center justify-center flex-none">
            SGE
          </span>
          {/* Solo el nombre del sistema: quién eres va abajo, junto a cerrar sesión,
              que es donde se busca. */}
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-white leading-tight">Sistema de Gestión Empresarial</h2>
          </div>
          <button
            onClick={alternar}
            title="Ocultar el menú"
            aria-label="Ocultar el menú"
            className="p-1.5 rounded-lg text-[#b9b9ce] hover:bg-[#23233d] hover:text-white transition-colors flex-none self-start"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          <NavLink to="/dashboard" end className={({ isActive }) => clase(isActive, true)}>
            <Home className="w-4 h-4 flex-none" /> Inicio
          </NavLink>

          {items.map((m) => {
            const to = `/dashboard/${m.slug}`;
            const dentro = location.pathname.startsWith(to);
            return (
              <div key={m.slug}>
                <button
                  disabled={!m.acceso}
                  onClick={() => m.acceso && navigate(to)}
                  className={clase(dentro, m.acceso)}
                  title={m.acceso ? m.nombre : 'No tienes acceso a este módulo'}
                >
                  <IconoModulo nombre={m.icono} />
                  <span className="truncate flex-1">{m.nombre}</span>
                  {!m.acceso && <Lock className="w-3.5 h-3.5 flex-none" />}
                </button>

                {/* Las secciones del módulo solo cuando se está dentro: fuera serían
                    un menú desplegado de algo que no se está usando. */}
                {dentro && <Secciones ruta={location.pathname} secciones={secciones(m.slug)} />}
              </div>
            );
          })}
        </div>

        <div className="pt-3 mt-3 border-t border-[#2b2b47]">
          {/* Quién eres: el nombre manda y el rol va debajo, porque el rol es lo que
              decide qué se ve en la barra y conviene tenerlo a la vista. Los dos con
              `title`, que un nombre largo se corta. */}
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-[#23233d] text-[#ffe81a] text-[11px] font-bold flex items-center justify-center flex-none">
              {iniciales(user?.nombre)}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate" title={user?.nombre ?? ''}>
                {user?.nombre || 'Usuario'}
              </p>
              <p className="text-[11px] text-[#8b8ba7] truncate" title={user?.nombreRol ?? ''}>
                {user?.nombreRol || 'Sin rol'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold text-[#b9b9ce] hover:bg-[#23233d] hover:text-[#ff8a8a] transition-colors"
          >
            <LogOut className="w-4 h-4 flex-none" /> Cerrar sesión
          </button>
        </div>
      </nav>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Sub-navegación del módulo abierto. Las de Compras y Obras se calculan con los
 * permisos y llegan por `secciones`; las demás son fijas y salen de la ruta.
 */
function Secciones({ ruta, secciones: dadas }: { ruta: string; secciones: Seccion[] | null }) {
  const { search } = useLocation();
  // Manda la clave más específica: dentro de gestion-conocimiento hay varias gestiones
  // y cada una tiene lo suyo.
  const secciones = dadas ?? seccionesDe(ruta);
  if (!secciones || secciones.length === 0) return null;

  /*
   * No se usa el `isActive` de NavLink: ignora la parte de la consulta, y Flujo de Caja
   * y Control de energía son la misma ruta con distinto `?vista=`. Con él, estando en
   * una se marcarían las dos.
   */
  const aqui = ruta + search;
  const esActivo = (to: string) => (to.includes('?') ? aqui === to : ruta === to);

  return (
    <div className="mt-1 ml-4 pl-3 border-l border-[#2b2b47] space-y-0.5">
      {secciones.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end
          className={
            'block px-3 py-1.5 rounded-lg text-[12px] transition-colors '
            // La sección activa no repite el amarillo del módulo: dos amarillos en la
            // misma columna competirían. Se marca con el texto en blanco.
            + (esActivo(s.to)
              ? 'text-white font-semibold bg-[#23233d]'
              : 'text-[#8b8ba7] hover:text-white hover:bg-[#23233d]')}
        >
          {s.label}
        </NavLink>
      ))}
    </div>
  );
}
