import type { LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ModuleCardProps {
  nombre: string;
  slug: string;
  icono: string;
  hasAccess: boolean;
  onClick: () => void;
}

export function ModuleCard({
  nombre,
  icono,
  hasAccess,
  onClick,
}: ModuleCardProps) {
  // Get the icon component dynamically from lucide-react
  const IconComponent = (Icons as any)[icono] as LucideIcon || Icons.HelpCircle;

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-300 cursor-pointer',
        'hover:shadow-xl hover:-translate-y-1',
        'border-2',
        hasAccess
          ? 'border-[hsl(var(--canalco-neutral-300))] hover:border-[hsl(var(--canalco-primary))]'
          : 'opacity-50 border-[hsl(var(--canalco-neutral-200))] cursor-not-allowed'
      )}
      onClick={onClick}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--canalco-primary))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardContent className="flex flex-col items-center justify-center p-6 text-center relative z-10">
        {/* Icon Container */}
        <div
          className={cn(
            'mb-4 p-4 rounded-full transition-all duration-300',
            'bg-gradient-to-br',
            hasAccess
              ? 'from-[hsl(var(--canalco-primary))]/10 to-[hsl(var(--canalco-primary))]/20 group-hover:from-[hsl(var(--canalco-primary))]/20 group-hover:to-[hsl(var(--canalco-primary))]/30'
              : 'from-[hsl(var(--canalco-neutral-300))]/10 to-[hsl(var(--canalco-neutral-300))]/20'
          )}
        >
          <IconComponent
            className={cn(
              'w-10 h-10 transition-all duration-300',
              hasAccess
                ? 'text-[hsl(var(--canalco-primary))] group-hover:scale-110'
                : 'text-[hsl(var(--canalco-neutral-500))]'
            )}
          />
        </div>

        {/* Module Name */}
        <h3
          className={cn(
            'text-lg font-semibold transition-colors duration-300',
            hasAccess
              ? 'text-[hsl(var(--canalco-neutral-900))] group-hover:text-[hsl(var(--canalco-primary))]'
              : 'text-[hsl(var(--canalco-neutral-600))]'
          )}
        >
          {nombre}
        </h3>

        {/* Lock Icon for restricted modules */}
        {!hasAccess && (
          <div className="mt-3">
            <Icons.Lock className="w-5 h-5 text-[hsl(var(--canalco-neutral-500))]" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
