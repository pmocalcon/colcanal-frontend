import { surveysService, type Survey, type Work } from '@/services/surveys.service';
import { modulesService } from '@/services/modules.service';

/**
 * Qué le falta a un acta para pedir la requisición de sus materiales.
 *
 * Son las mismas condiciones con que el formulario de requisición ofrece un acta
 * (`CrearRequisicionPage`): si aquí todo cumple, allá el acta aparece y se escoge sola.
 * Si una de las dos pantallas pidiera algo que la otra no, el botón llevaría a un
 * formulario donde el acta no está.
 */

export interface RequisitoActa {
  clave: string;
  etiqueta: string;
  cumple: boolean;
  /** Qué falta y dónde se arregla, cuando no cumple. */
  detalle?: string;
}

export interface RevisionRequisitosActa {
  requisitos: RequisitoActa[];
  cumpleTodo: boolean;
  /** La dirección del formulario con el acta ya puesta. */
  destino: string;
}

const estadoDe = (s: Survey): string => {
  const st = s.status as unknown;
  return typeof st === 'string' ? st : ((st as { code?: string } | undefined)?.code ?? '');
};

const listar = (nombres: string[], max = 4): string =>
  nombres.length <= max
    ? nombres.join(', ')
    : `${nombres.slice(0, max).join(', ')} y ${nombres.length - max} más`;

export async function revisarRequisitosActa(params: {
  companyId: number;
  projectId: number | null;
  actaNumber: string;
  works: Work[];
}): Promise<RevisionRequisitosActa> {
  const { companyId, projectId, actaNumber, works } = params;

  const [modulos, acta, levantamientos] = await Promise.all([
    modulesService.getUserModules().catch(() => []),
    surveysService.getWorkActa(companyId, projectId, actaNumber),
    Promise.all(
      works.map(async (w) => {
        const r = await surveysService.getSurveys({ workId: w.workId, page: 1, limit: 1 });
        return { work: w, survey: r.data?.[0] ?? null };
      }),
    ),
  ]);

  const requisitos: RequisitoActa[] = [];

  const puedeCrear = !!modulos.find((m) => m.slug === 'compras')?.permisos?.crear;
  requisitos.push({
    clave: 'permiso',
    etiqueta: 'Permiso para crear requisiciones',
    cumple: puedeCrear,
    detalle: puedeCrear ? undefined : 'Tu rol no puede crear requisiciones en Compras.',
  });

  const aprobada = acta?.status === 'aprobada';
  requisitos.push({
    clave: 'acta-aprobada',
    etiqueta: 'Acta aprobada por Gerencia de Proyectos',
    cumple: aprobada,
    detalle: aprobada
      ? undefined
      : !acta
        ? 'El acta todavía no se ha enviado a revisión.'
        : `El acta está ${
            { borrador: 'en borrador', en_revision: 'en revisión', en_aprobacion: 'pendiente de aprobación' }[
              acta.status as string
            ] ?? acta.status
          }.`,
  });

  const codigo = (acta?.projectCode ?? '').trim();
  requisitos.push({
    clave: 'codigo',
    etiqueta: 'Código de contabilidad del acta',
    cumple: !!codigo,
    detalle: codigo ? undefined : 'Gerencia de Proyectos lo asigna al aprobar el acta.',
  });

  const sinLevantamiento = levantamientos.filter((l) => !l.survey).map((l) => l.work.name);
  const sinAprobar = levantamientos
    .filter((l) => l.survey && estadoDe(l.survey) !== 'approved')
    .map((l) => l.work.name);
  const faltanLev = [...sinLevantamiento, ...sinAprobar];
  requisitos.push({
    clave: 'levantamientos',
    etiqueta: 'Levantamiento aprobado en todas las obras',
    cumple: faltanLev.length === 0,
    detalle: faltanLev.length ? `Falta en: ${listar(faltanLev)}.` : undefined,
  });

  const sinPresupuesto = levantamientos
    .filter((l) => l.survey && estadoDe(l.survey) === 'approved' && l.survey.budgetStatus !== 'approved')
    .map((l) => l.work.name);
  requisitos.push({
    clave: 'presupuesto',
    etiqueta: 'Presupuesto aprobado en el levantamiento de cada obra',
    cumple: faltanLev.length === 0 && sinPresupuesto.length === 0,
    detalle: sinPresupuesto.length
      ? `Falta en: ${listar(sinPresupuesto)}.`
      : faltanLev.length
        ? 'Se revisa cuando los levantamientos estén aprobados.'
        : undefined,
  });

  // Los materiales solo vienen en el detalle; se piden de las obras que ya pasaron lo anterior.
  const listos = levantamientos.filter(
    (l) => l.survey && estadoDe(l.survey) === 'approved' && l.survey.budgetStatus === 'approved',
  );
  const detalles = await Promise.all(
    listos.map((l) => surveysService.getSurveyById(l.survey!.surveyId).catch(() => null)),
  );
  const conMateriales = detalles.some((d) =>
    (d?.materialItems ?? []).some((mi) => mi.materialId && Number(mi.quantity) > 0),
  );
  requisitos.push({
    clave: 'materiales',
    etiqueta: 'Materiales en los levantamientos',
    cumple: conMateriales,
    detalle: conMateriales
      ? undefined
      : listos.length
        ? 'Los levantamientos aprobados no tienen materiales con cantidad.'
        : 'Se revisa cuando haya levantamientos aprobados.',
  });

  const q = new URLSearchParams({ company: String(companyId), acta: actaNumber });
  if (projectId != null) q.set('project', String(projectId));

  return {
    requisitos,
    cumpleTodo: requisitos.every((r) => r.cumple),
    destino: `/dashboard/compras/requisiciones/crear?${q.toString()}`,
  };
}
