import { ChevronLeft, ChevronRight } from 'lucide-react';

// Selector de semana reutilizable (‹ rango ›  Hoy) para los planes diarios.
export function WeekNav({ days, offset, onPrev, onNext, onToday }: {
  days: string[]; offset: number; onPrev: () => void; onNext: () => void; onToday: () => void;
}) {
  const fmt = (s: string, withYear?: boolean) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CO', withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' });
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onPrev} aria-label="Semana anterior" className="p-1 rounded-md hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))] transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-medium text-[hsl(var(--canalco-neutral-600))] min-w-[150px] text-center tabular-nums px-2.5 py-1 rounded-md bg-[hsl(var(--canalco-neutral-50))] border border-[hsl(var(--canalco-neutral-200))]">
        {fmt(days[0])} – {fmt(days[6], true)}
      </span>
      <button onClick={onNext} aria-label="Semana siguiente" className="p-1 rounded-md hover:bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))] transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
      {offset !== 0 && (
        <button onClick={onToday} className="text-xs font-semibold text-[hsl(var(--canalco-primary))] hover:underline ml-1">Hoy</button>
      )}
    </div>
  );
}
