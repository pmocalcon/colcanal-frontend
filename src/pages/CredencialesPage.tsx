import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, KeyRound, Copy, ShieldCheck, ShieldAlert,
  Lock, Download, RefreshCw, Search, UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  usersService,
  type CredencialEstado,
  type PasswordTemporal,
} from '@/services/users.service';
import { useAuth } from '@/contexts/AuthContext';
import { esRolPmo } from '@/utils/rolesPmo';

/** Copia texto al portapapeles y avisa. */
async function copiar(texto: string, mensaje = 'Copiado') {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(mensaje);
  } catch {
    toast.error('No se pudo copiar');
  }
}

/** Etiqueta de color según el estado de la clave. */
function BadgeEstado({ c }: { c: CredencialEstado }) {
  if (c.exenta) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        <ShieldCheck className="w-3 h-3" /> Exenta
      </span>
    );
  }
  if (c.estadoClave === 'temporal') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        <ShieldAlert className="w-3 h-3" /> Clave temporal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
      <ShieldCheck className="w-3 h-3" /> Personal
    </span>
  );
}

const fechaLegible = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Nunca';

export default function CredencialesPage() {
  const navigate = useNavigate();
  const { impersonar, user } = useAuth();
  // "Entrar como" (impersonar) es solo para el PMO; el backend lo reafirma.
  const puedeImpersonar = esRolPmo(user?.nombreRol);
  const [datos, setDatos] = useState<CredencialEstado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [soloTemporal, setSoloTemporal] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());

  // Diálogo con las claves temporales recién emitidas (una o varias).
  const [emitidas, setEmitidas] = useState<PasswordTemporal[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = async () => {
    try {
      setCargando(true);
      setError(null);
      setDatos(await usersService.getCredencialesEstado());
    } catch {
      setError('No se pudo cargar. Verifica que tienes permisos de administrador.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const resumen = useMemo(() => ({
    total: datos.length,
    temporal: datos.filter((d) => d.estadoClave === 'temporal').length,
    personal: datos.filter((d) => d.estadoClave === 'personal').length,
    exenta: datos.filter((d) => d.exenta).length,
    bloqueada: datos.filter((d) => d.bloqueada).length,
  }), [datos]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return datos.filter((d) => {
      if (soloTemporal && d.estadoClave !== 'temporal') return false;
      if (!q) return true;
      return (
        d.nombre.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        (d.nombreRol ?? '').toLowerCase().includes(q)
      );
    });
  }, [datos, busca, soloTemporal]);

  // Solo las cuentas no exentas se pueden seleccionar para restablecer.
  const seleccionables = visibles.filter((d) => !d.exenta);
  const todasSel =
    seleccionables.length > 0 && seleccionables.every((d) => sel.has(d.userId));

  const alternarTodas = () => {
    setSel((prev) => {
      const n = new Set(prev);
      if (todasSel) seleccionables.forEach((d) => n.delete(d.userId));
      else seleccionables.forEach((d) => n.add(d.userId));
      return n;
    });
  };

  const alternar = (id: number) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const restablecerUno = async (c: CredencialEstado) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${c.nombre}? Se generará una clave temporal nueva.`)) return;
    try {
      setTrabajando(true);
      const r = await usersService.restablecerPassword(c.userId);
      setEmitidas([r]);
      await cargar();
    } catch {
      toast.error('No se pudo restablecer la contraseña');
    } finally {
      setTrabajando(false);
    }
  };

  const restablecerSeleccionadas = async () => {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!window.confirm(`¿Restablecer ${ids.length} contraseña(s)? Se generará una clave temporal por usuario.`)) return;
    try {
      setTrabajando(true);
      const r = await usersService.restablecerLote(ids);
      setEmitidas(r.restablecidas);
      if (r.omitidas.length) {
        toast.info(`${r.omitidas.length} cuenta(s) omitida(s) (exentas o inexistentes).`);
      }
      setSel(new Set());
      await cargar();
    } catch {
      toast.error('No se pudieron restablecer las contraseñas');
    } finally {
      setTrabajando(false);
    }
  };

  const entrarComo = async (c: CredencialEstado) => {
    try {
      setTrabajando(true);
      await impersonar(c.userId);
      navigate('/dashboard');
    } catch {
      toast.error('No se pudo iniciar sesión como este usuario');
      setTrabajando(false);
    }
  };

  const descargarCsv = () => {
    if (!emitidas) return;
    const filas = [
      ['Nombre', 'Correo', 'Contraseña temporal'],
      ...emitidas.map((e) => [e.nombre, e.email, e.passwordTemporal]),
    ];
    const csv = filas
      .map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credenciales-temporales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copiarTodas = () => {
    if (!emitidas) return;
    const txt = emitidas
      .map((e) => `${e.nombre}\t${e.email}\t${e.passwordTemporal}`)
      .join('\n');
    copiar(txt, 'Lista copiada');
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-50))] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/usuarios')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-[hsl(var(--canalco-primary))]" />
            <h1 className="text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
              Panel de credenciales
            </h1>
          </div>
        </div>
        <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mb-6 ml-14">
          Las contraseñas se guardan cifradas y no pueden leerse. Aquí ves el estado de
          cada cuenta y puedes emitir una clave temporal nueva, que se muestra una sola vez.
        </p>

        {error && (
          <Card className="p-4 mb-4 border-red-300 bg-red-50 text-red-700">{error}</Card>
        )}

        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { n: resumen.total, t: 'Total', c: 'text-[hsl(var(--canalco-neutral-800))]' },
            { n: resumen.temporal, t: 'Clave temporal', c: 'text-amber-600' },
            { n: resumen.personal, t: 'Personal', c: 'text-green-600' },
            { n: resumen.exenta, t: 'Exentas', c: 'text-slate-500' },
            { n: resumen.bloqueada, t: 'Bloqueadas', c: 'text-red-600' },
          ].map((x) => (
            <Card key={x.t} className="p-4">
              <p className={`text-2xl font-bold ${x.c}`}>{x.n}</p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">{x.t}</p>
            </Card>
          ))}
        </div>

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--canalco-neutral-400))]" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nombre, correo o rol…"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-700))] select-none">
            <input
              type="checkbox"
              checked={soloTemporal}
              onChange={(e) => setSoloTemporal(e.target.checked)}
            />
            Solo con clave temporal
          </label>
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
            <RefreshCw className={`w-4 h-4 mr-2 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button
            size="sm"
            onClick={restablecerSeleccionadas}
            disabled={sel.size === 0 || trabajando}
          >
            <KeyRound className="w-4 h-4 mr-2" />
            Restablecer seleccionados ({sel.size})
          </Button>
        </div>

        {/* Tabla */}
        <Card className="overflow-hidden">
          {cargando ? (
            <div className="flex items-center justify-center py-16 text-[hsl(var(--canalco-neutral-500))]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input type="checkbox" checked={todasSel} onChange={alternarTodas} />
                    </TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado de la clave</TableHead>
                    <TableHead>Último acceso</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((c) => (
                    <TableRow key={c.userId} className={c.activo ? '' : 'opacity-50'}>
                      <TableCell>
                        <input
                          type="checkbox"
                          disabled={c.exenta}
                          checked={sel.has(c.userId)}
                          onChange={() => alternar(c.userId)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-[hsl(var(--canalco-neutral-900))]">{c.nombre}</div>
                        <div className="text-xs text-[hsl(var(--canalco-neutral-500))]">{c.email}</div>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--canalco-neutral-700))]">
                        {c.nombreRol ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <BadgeEstado c={c} />
                          {c.bloqueada && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                              <Lock className="w-3 h-3" /> Bloqueada
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-[hsl(var(--canalco-neutral-600))]">
                        {fechaLegible(c.ultimoAcceso)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {puedeImpersonar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!c.activo || trabajando}
                              onClick={() => entrarComo(c)}
                              title={c.activo ? 'Iniciar sesión como este usuario (prueba)' : 'Cuenta inactiva'}
                            >
                              <UserCog className="w-4 h-4 mr-1.5" />
                              Entrar como
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={c.exenta || trabajando}
                            onClick={() => restablecerUno(c)}
                            title={c.exenta ? 'Cuenta exenta' : 'Restablecer contraseña'}
                          >
                            Restablecer
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-[hsl(var(--canalco-neutral-500))]">
                        No hay usuarios que coincidan.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {/* Diálogo de claves emitidas */}
      <Dialog open={!!emitidas} onOpenChange={(o) => !o && setEmitidas(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Contraseña{emitidas && emitidas.length > 1 ? 's' : ''} temporal{emitidas && emitidas.length > 1 ? 'es' : ''}</DialogTitle>
            <DialogDescription>
              Cópiala y entrégala ahora: <b>no se vuelve a mostrar</b>. La persona
              deberá cambiarla al iniciar sesión.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {emitidas?.map((e) => (
              <div
                key={e.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--canalco-neutral-200))] p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{e.nombre}</p>
                  <p className="text-xs text-[hsl(var(--canalco-neutral-500))] truncate">{e.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-[hsl(var(--canalco-neutral-100))] px-2 py-1 text-sm font-mono font-semibold">
                    {e.passwordTemporal}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => copiar(e.passwordTemporal)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {emitidas && emitidas.length > 1 && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={copiarTodas}>
                <Copy className="w-4 h-4 mr-2" /> Copiar todo
              </Button>
              <Button variant="outline" size="sm" onClick={descargarCsv}>
                <Download className="w-4 h-4 mr-2" /> Descargar CSV
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
