import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { authService } from '@/services/auth.service';
import { useAuth } from '@/contexts/AuthContext';
import type { AxiosError } from 'axios';

/** Misma regla que exige el backend: 8+, mayúscula, minúscula y número. */
const REGLA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/** Cada requisito, para dar retroalimentación viva mientras se escribe. */
const requisitos = (v: string) => [
  { ok: v.length >= 8, txt: 'Al menos 8 caracteres' },
  { ok: /[A-Z]/.test(v), txt: 'Una letra mayúscula' },
  { ok: /[a-z]/.test(v), txt: 'Una letra minúscula' },
  { ok: /\d/.test(v), txt: 'Un número' },
];

export default function CambiarPasswordPage() {
  const navigate = useNavigate();
  const { user, marcarPasswordCambiada } = useAuth();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver, setVer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo lo mostramos como aviso; el gate lo pinta cuando el flag está en true.
  const obligatorio = user?.debeCambiarPassword ?? false;

  const reqs = requisitos(nueva);
  const nuevaValida = REGLA.test(nueva);
  const coincide = nueva.length > 0 && nueva === confirmar;
  const distinta = nueva !== actual;
  const puedeGuardar =
    actual.length > 0 && nuevaValida && coincide && distinta && !saving;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nuevaValida) {
      setError('La contraseña nueva no cumple los requisitos de seguridad.');
      return;
    }
    if (!coincide) {
      setError('La confirmación no coincide con la contraseña nueva.');
      return;
    }
    if (!distinta) {
      setError('La contraseña nueva debe ser distinta de la actual.');
      return;
    }

    try {
      setSaving(true);
      await authService.cambiarPassword(actual, nueva);
      marcarPasswordCambiada();
      navigate('/dashboard');
    } catch (err) {
      const ax = err as AxiosError<{ message: string | string[] }>;
      const msg = ax.response?.data?.message;
      setError(
        Array.isArray(msg)
          ? msg.join(', ')
          : msg || 'No se pudo cambiar la contraseña. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="w-12 h-12 rounded-full bg-[hsl(var(--canalco-primary))]/10 flex items-center justify-center mb-3">
            <KeyRound className="w-6 h-6 text-[hsl(var(--canalco-primary))]" />
          </span>
          <h1 className="text-xl font-bold text-[hsl(var(--canalco-neutral-900))]">
            {obligatorio ? 'Actualiza tu contraseña' : 'Cambiar contraseña'}
          </h1>
          <p className="text-sm text-[hsl(var(--canalco-neutral-600))] mt-1">
            {obligatorio
              ? 'Estás usando una contraseña temporal. Fija una contraseña personal para continuar.'
              : 'Fija una nueva contraseña para tu cuenta.'}
          </p>
        </div>

        {error && (
          <Alert className="mb-4 border-red-500 bg-red-50">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </div>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="actual">Contraseña actual</Label>
            <div className="relative">
              <Input
                id="actual"
                type={ver ? 'text' : 'password'}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nueva">Contraseña nueva</Label>
            <div className="relative">
              <Input
                id="nueva"
                type={ver ? 'text' : 'password'}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--canalco-neutral-500))]"
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Requisitos vivos: cada uno se marca al cumplirse. */}
          {nueva.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-[hsl(var(--canalco-neutral-50))] p-3">
              {reqs.map((r) => (
                <li
                  key={r.txt}
                  className={`flex items-center gap-2 text-xs ${
                    r.ok ? 'text-green-600' : 'text-[hsl(var(--canalco-neutral-500))]'
                  }`}
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${r.ok ? 'opacity-100' : 'opacity-40'}`} />
                  {r.txt}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <Label htmlFor="confirmar">Confirmar contraseña nueva</Label>
            <Input
              id="confirmar"
              type={ver ? 'text' : 'password'}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirmar.length > 0 && !coincide && (
              <p className="text-xs text-red-600">Las contraseñas no coinciden.</p>
            )}
          </div>

          <Button type="submit" disabled={!puedeGuardar} className="w-full">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…
              </>
            ) : (
              'Guardar contraseña'
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
