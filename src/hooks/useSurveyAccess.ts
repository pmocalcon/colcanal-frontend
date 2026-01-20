import { useState, useEffect } from 'react';
import { surveysService } from '@/services/surveys.service';
import type { ReviewerAccess } from '@/services/surveys.service';

interface UseSurveyAccessResult {
  access: ReviewerAccess | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook para obtener los accesos del usuario a empresas y proyectos
 * Permite filtrar obras y levantamientos por las empresas/proyectos a los que tiene acceso
 */
export function useSurveyAccess(): UseSurveyAccessResult {
  const [access, setAccess] = useState<ReviewerAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccess = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await surveysService.getMyAccess();
        setAccess(data);
      } catch (err: any) {
        console.error('Error fetching survey access:', err);
        setError('Error al cargar los accesos');
      } finally {
        setLoading(false);
      }
    };

    fetchAccess();
  }, []);

  return { access, loading, error };
}
