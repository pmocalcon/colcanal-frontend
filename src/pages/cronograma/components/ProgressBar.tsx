export function ProgressBar({ value, color = 'primary' }: { value: number; color?: 'primary' | 'green' | 'amber' | 'red' }) {
  const bg: Record<string, string> = {
    primary: 'bg-[hsl(var(--canalco-primary))]',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  const barColor = value >= 100 ? bg.green : value >= 70 ? bg.amber : bg[color];

  return (
    <div className="h-2.5 w-full rounded-full bg-[hsl(var(--canalco-neutral-200))]">
      <div
        className={`h-2.5 rounded-full transition-all ${barColor}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
