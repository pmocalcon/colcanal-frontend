import { useMemo } from 'react';
import { parseLocalDate } from '@/utils/colombianCalendar';

export interface GanttRow {
  id: number;
  code: string;
  description: string;
  start: string;
  end: string;
  progress: number; // 0–100
}

interface MetaBar {
  label: string;
  start: string;
  end: string;
  color: string;
}

interface Props {
  metas: MetaBar[];
  rows: GanttRow[];
}

function dateMs(s: string): number {
  return parseLocalDate(s).getTime();
}

const DAY_MS = 86_400_000;

export function GanttTimeline({ metas, rows }: Props) {
  const timeline = useMemo(() => {
    const allMs = [
      ...metas.flatMap((m) => [dateMs(m.start), dateMs(m.end)]),
      ...rows.flatMap((r) => [dateMs(r.start), dateMs(r.end)]),
    ];
    if (allMs.length < 2) return null;

    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const rangeMs = maxMs - minMs;
    if (!rangeMs) return null;

    const toPos = (s: string) =>
      Math.max(0, Math.min(100, ((dateMs(s) - minMs) / rangeMs) * 100));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPct = ((today.getTime() - minMs) / rangeMs) * 100;
    const showToday = todayPct >= 0 && todayPct <= 100;

    const totalDays = rangeMs / DAY_MS;
    const step = totalDays <= 21 ? 3 : totalDays <= 60 ? 7 : totalDays <= 120 ? 14 : 30;
    const labels: Array<{ label: string; pct: number }> = [];
    const cur = new Date(minMs);
    const maxDate = new Date(maxMs);
    while (cur <= maxDate) {
      labels.push({
        label: cur.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' }),
        pct: ((cur.getTime() - minMs) / rangeMs) * 100,
      });
      cur.setDate(cur.getDate() + step);
    }

    return { toPos, todayPct, showToday, labels };
  }, [metas, rows]);

  if (!timeline) return null;

  const { toPos, todayPct, showToday, labels } = timeline;

  // Shared column widths — every row uses the same three columns so date
  // labels align perfectly with bars regardless of content.
  const LABEL = 'w-28 flex-shrink-0';
  const PCT = 'w-10 flex-shrink-0';

  const TodayLine = () =>
    showToday ? (
      <div
        className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
        style={{ left: `${todayPct}%` }}
      />
    ) : null;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 620 }}>

        {/* ── Date labels ── */}
        <div className="flex gap-2 h-7 mb-1">
          <div className={LABEL} />
          <div className="flex-1 relative">
            {labels.map(({ label, pct }) => (
              <span
                key={label}
                className="absolute bottom-0 text-[11px] text-[hsl(var(--canalco-neutral-400))] -translate-x-1/2 select-none whitespace-nowrap"
                style={{ left: `${pct}%` }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className={PCT} />
        </div>

        {/* ── Meta bars (Contractual / Operativo) ── */}
        {metas.map((m) => {
          const left = toPos(m.start);
          const width = Math.max(0.5, toPos(m.end) - left);
          return (
            <div key={m.label} className="flex items-center gap-2 mb-1.5">
              <div className={`${LABEL} text-xs text-[hsl(var(--canalco-neutral-500))] text-right pr-2 truncate`}>
                {m.label}
              </div>
              <div className="flex-1 relative h-3 overflow-hidden">
                <TodayLine />
                <div
                  className="absolute top-0 h-3 rounded-full"
                  style={{ left: `${left}%`, width: `${width}%`, background: m.color, opacity: 0.55 }}
                />
              </div>
              <div className={PCT} />
            </div>
          );
        })}

        {/* ── Divider ── */}
        {rows.length > 0 && (
          <div className="flex items-center gap-2 my-2">
            <div className={LABEL} />
            <div className="flex-1 border-t border-[hsl(var(--canalco-neutral-200))]" />
            <div className={PCT} />
          </div>
        )}

        {/* ── UCAP rows ── */}
        {rows.map((row) => {
          const left = toPos(row.start);
          const barWidth = Math.max(0.5, toPos(row.end) - left);
          const fillWidth = (row.progress / 100) * barWidth;

          const startMs = dateMs(row.start);
          const endMs = dateMs(row.end);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayMs = today.getTime();
          const temporal =
            todayMs <= startMs ? 0
            : todayMs >= endMs ? 100
            : ((todayMs - startMs) / (endMs - startMs)) * 100;
          const diff = temporal - row.progress;
          const fillColor =
            diff <= 5 ? '#22c55e' : diff <= 20 ? '#f59e0b' : '#ef4444';

          return (
            <div key={row.id} className="flex items-center gap-2 mb-2">
              <div className={`${LABEL} pr-2`}>
                <p className="text-[11px] font-mono font-semibold text-[hsl(var(--canalco-primary))] truncate leading-tight">
                  {row.code}
                </p>
                <p className="text-[11px] text-[hsl(var(--canalco-neutral-600))] truncate leading-tight">
                  {row.description}
                </p>
              </div>
              <div className="flex-1 relative h-6 overflow-hidden">
                <TodayLine />
                {/* Track */}
                <div
                  className="absolute top-1.5 h-3 rounded-full bg-[hsl(var(--canalco-neutral-200))]"
                  style={{ left: `${left}%`, width: `${barWidth}%` }}
                />
                {/* Fill */}
                <div
                  className="absolute top-1.5 h-3 rounded-full transition-all"
                  style={{ left: `${left}%`, width: `${fillWidth}%`, background: fillColor }}
                />
              </div>
              <div className={`${PCT} text-right`}>
                <span className="text-[11px] font-semibold" style={{ color: fillColor }}>
                  {Math.round(row.progress)}%
                </span>
              </div>
            </div>
          );
        })}

        {/* ── "Hoy" label ── */}
        {showToday && (
          <div className="flex items-center gap-2 mt-1">
            <div className={LABEL} />
            <div className="flex-1 relative h-4 overflow-hidden">
              <span
                className="absolute text-[10px] text-red-400 font-semibold -translate-x-1/2"
                style={{ left: `${todayPct}%` }}
              >
                hoy
              </span>
            </div>
            <div className={PCT} />
          </div>
        )}

      </div>
    </div>
  );
}
