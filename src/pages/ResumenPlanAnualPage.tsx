import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CalendarDays, CheckCircle2, FileText, Home, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Footer } from '@/components/ui/footer';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapCompaniesToDepartments, getMunicipioName } from '@/utils/departmentMapper';
import { useAuth } from '@/contexts/AuthContext';
import {
  surveysService,
  type AnnualPlanReview,
  type AnnualPlanReviewStatus,
  type Survey,
  type Work,
} from '@/services/surveys.service';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const fmtCOP = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);

const fmtNumber = (value: number, decimals = 2) =>
  new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);

const fmtQuantity = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const parseNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const makeActaKey = (companyId: number | undefined | null, recordNumber: string) =>
  `${companyId ?? 0}:${recordNumber.trim().replace(/\s+/g, ' ').toLowerCase()}`;

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map((item, chunkIndex) => mapper(item, i + chunkIndex)));
    results.push(...chunkResults);
  }
  return results;
};

type ProjectBudgetLine = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  total: number;
};

type ProjectBudgetSummary = {
  work: Work;
  survey: Survey | null;
  lines: ProjectBudgetLine[];
  baseIpp: number;
  currentIpp: number;
  baseMonth: number | null;
  baseYear: number | null;
  baseTotal: number;
  adjustedTotal: number;
};

type ConsolidatedUcapLine = {
  key: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  hasVariableUnitValue: boolean;
  baseTotal: number;
  adjustedTotal: number;
  projectIds: Set<number>;
};

const inferUnit = (description: string) => {
  const text = description.toLowerCase();
  if (text.includes('cable') || text.includes('red') || text.includes('conductor') || text.includes('triple') || text.includes('trenz')) {
    return 'Metros';
  }
  return 'Unidad';
};

const buildProjectSummary = (work: Work, survey: Survey | null): ProjectBudgetSummary => {
  const lines = (survey?.budgetItems ?? []).map((item, index) => {
    const legacyUcapCode = (item as { ucapCode?: string }).ucapCode;
    const description = item.ucap?.description || legacyUcapCode || `UCAP ${index + 1}`;
    const quantity = parseNumber(item.quantity);
    const unitValue = parseNumber(item.unitValue);

    return {
      code: item.ucap?.code || legacyUcapCode || '',
      description,
      unit: inferUnit(description),
      quantity,
      unitValue,
      total: quantity * unitValue,
    };
  });

  const baseIpp = parseNumber(survey?.ippConfig?.initialValue) || 100;
  const currentIpp = parseNumber(survey?.previousMonthIpp);
  const baseTotal = lines.reduce((sum, line) => sum + line.total, 0);
  const adjustedTotal = baseTotal * (currentIpp > 0 && baseIpp > 0 ? currentIpp / baseIpp : 1);

  return {
    work,
    survey,
    lines,
    baseIpp,
    currentIpp,
    baseMonth: survey?.ippConfig?.baseMonth ?? null,
    baseYear: survey?.ippConfig?.baseYear ?? null,
    baseTotal,
    adjustedTotal,
  };
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildWordFileName = (year: string, municipio: string) => {
  const safeMunicipio = municipio === 'all' ? 'todos-los-municipios' : municipio;
  const safeName = safeMunicipio
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `resumen-plan-anual-${year}-${safeName || 'municipio'}.doc`;
};

const REVIEW_STATUS_LABEL: Record<AnnualPlanReviewStatus, string> = {
  pendiente: 'Pendiente de aprobación',
  aprobado: 'Aprobado por Gerencia',
  rechazado: 'Rechazado por Gerencia',
};

const REVIEW_STATUS_CLASS: Record<AnnualPlanReviewStatus, string> = {
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  aprobado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rechazado: 'bg-red-100 text-red-800 border-red-200',
};

export default function ResumenPlanAnualPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { access, loading: accessLoading, error: accessError } = useSurveyAccess();

  const [selectedYear, setSelectedYear] = useState('none');
  const [selectedMunicipio, setSelectedMunicipio] = useState('none');
  const [selectedZone, setSelectedZone] = useState('all');
  const [allWorks, setAllWorks] = useState<Work[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [projectSummaries, setProjectSummaries] = useState<ProjectBudgetSummary[]>([]);
  const [annualPlanReview, setAnnualPlanReview] = useState<AnnualPlanReview | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const canReviewAnnualPlan = ['Gerencia de Proyectos', 'Analista PMO'].includes(user?.nombreRol ?? '');

  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const allCompanyIds = useMemo(
    () => departments.flatMap((department) => department.companyIds),
    [departments],
  );

  const companyIdToMunicipio = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((department) =>
      department.companies.forEach((company) => map.set(company.companyId, getMunicipioName(company.name))),
    );
    return map;
  }, [departments]);

  const getWorkMunicipio = (work: Work) =>
    companyIdToMunicipio.get(work.companyId) ?? (work.company ? getMunicipioName(work.company.name) : 'Sin municipio');

  const hasRequiredFilters = selectedYear !== 'none' && selectedMunicipio !== 'none';
  const reviewStatus = annualPlanReview?.status ?? 'pendiente';
  const reviewStatusLabel = loadingReview ? 'Cargando estado...' : REVIEW_STATUS_LABEL[reviewStatus];
  const reviewStatusClass = REVIEW_STATUS_CLASS[reviewStatus];

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    allWorks.forEach((work) => {
      if (typeof work.annualPlan === 'number') years.add(work.annualPlan);
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [allWorks]);

  const availableMunicipios = useMemo(() => {
    const year = Number(selectedYear);
    if (!Number.isFinite(year)) return [];

    return Array.from(
      new Set(
        allWorks
          .filter((work) => work.annualPlan === year)
          .map(getWorkMunicipio),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [allWorks, companyIdToMunicipio, selectedYear]);

  const worksForSelectedYearAndMunicipio = useMemo(() => {
    const year = Number(selectedYear);
    if (!Number.isFinite(year) || selectedMunicipio === 'none') return [];

    const planWorks = allWorks.filter((work) => work.annualPlan === year);
    const actaKeys = new Set(
      planWorks
        .filter((work) => !!work.recordNumber)
        .map((work) => makeActaKey(work.companyId, work.recordNumber)),
    );

    return allWorks
      .filter((work) => {
        const belongsToPlan = work.annualPlan === year;
        const belongsToPlanActa = !!work.recordNumber && actaKeys.has(makeActaKey(work.companyId, work.recordNumber));
        if (!belongsToPlan && !belongsToPlanActa) return false;
        if (selectedMunicipio !== 'all' && getWorkMunicipio(work) !== selectedMunicipio) return false;
        return true;
      })
      .sort((a, b) => {
        const actaCompare = (a.recordNumber || '').localeCompare(b.recordNumber || '');
        if (actaCompare !== 0) return actaCompare;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [allWorks, companyIdToMunicipio, selectedMunicipio, selectedYear]);

  const filteredWorks = useMemo(
    () =>
      worksForSelectedYearAndMunicipio.filter((work) =>
        selectedZone === 'all' ? true : (work.zone?.trim() || 'Sin zona') === selectedZone,
      ),
    [selectedZone, worksForSelectedYearAndMunicipio],
  );

  const availableZones = useMemo(
    () => {
      if (!hasRequiredFilters) return [];

      return Array.from(
        new Set(
          worksForSelectedYearAndMunicipio.map((work) => work.zone?.trim() || 'Sin zona'),
        ),
      ).sort((a, b) => a.localeCompare(b));
    },
    [hasRequiredFilters, worksForSelectedYearAndMunicipio],
  );

  const totalBase = useMemo(
    () => projectSummaries.reduce((sum, project) => sum + project.baseTotal, 0),
    [projectSummaries],
  );

  const totalAdjusted = useMemo(
    () => projectSummaries.reduce((sum, project) => sum + project.adjustedTotal, 0),
    [projectSummaries],
  );

  const consolidatedUcaps = useMemo(() => {
    const map = new Map<string, ConsolidatedUcapLine>();

    projectSummaries.forEach((project) => {
      const factor = project.currentIpp > 0 && project.baseIpp > 0 ? project.currentIpp / project.baseIpp : 1;

      project.lines.forEach((line) => {
        const key = (line.code || line.description).trim().toLowerCase();
        if (!key) return;

        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            key,
            code: line.code,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            unitValue: line.unitValue,
            hasVariableUnitValue: false,
            baseTotal: line.total,
            adjustedTotal: line.total * factor,
            projectIds: new Set([project.work.workId]),
          });
          return;
        }

        existing.quantity += line.quantity;
        existing.baseTotal += line.total;
        existing.adjustedTotal += line.total * factor;
        existing.projectIds.add(project.work.workId);

        if (existing.unit !== line.unit) {
          existing.unit = 'Mixta';
        }

        if (existing.unitValue !== line.unitValue) {
          existing.hasVariableUnitValue = true;
        }
      });
    });

    return Array.from(map.values()).sort(
      (a, b) => a.code.localeCompare(b.code) || a.description.localeCompare(b.description),
    );
  }, [projectSummaries]);

  const consolidatedQuantity = useMemo(
    () => consolidatedUcaps.reduce((sum, line) => sum + line.quantity, 0),
    [consolidatedUcaps],
  );

  const handleGenerateWord = () => {
    if (!hasRequiredFilters || projectSummaries.length === 0) {
      toast.error('Selecciona año y municipio antes de generar el Word');
      return;
    }

    const municipioLabel = selectedMunicipio === 'all' ? 'Todos los municipios' : selectedMunicipio;
    const zoneLabel = selectedZone !== 'all' ? ` - Zona ${selectedZone}` : '';
    const generatedAt = new Date().toLocaleDateString('es-CO');

    const consolidatedRows = consolidatedUcaps.length > 0
      ? consolidatedUcaps.map((line, index) => `
          <tr>
            <td class="center">${index + 1}</td>
            <td class="center code">${escapeHtml(line.code || '-')}</td>
            <td>
              ${escapeHtml(line.description)}
              <span class="muted">(${line.projectIds.size} proyecto${line.projectIds.size !== 1 ? 's' : ''})</span>
            </td>
            <td class="center">${escapeHtml(line.unit)}</td>
            <td class="center bold">${escapeHtml(fmtQuantity(line.quantity))}</td>
            <td class="right">${escapeHtml(line.hasVariableUnitValue ? 'Variable' : fmtCOP(line.unitValue))}</td>
            <td class="right bold">${escapeHtml(fmtCOP(line.baseTotal))}</td>
            <td class="right total">${escapeHtml(fmtCOP(line.adjustedTotal))}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td colspan="8" class="center empty">Sin UCAPs registradas en los levantamientos del plan anual.</td>
          </tr>
        `;

    const consolidatedTable = `
      <div class="section">
        <h2>Consolidado de UCAPs del Plan Anual ${escapeHtml(selectedYear)}</h2>
        <div class="table-center">
          <table class="budget-table wide" align="center">
            <colgroup>
              <col style="width: 5%;" />
              <col style="width: 11%;" />
              <col style="width: 28%;" />
              <col style="width: 9%;" />
              <col style="width: 10%;" />
              <col style="width: 12%;" />
              <col style="width: 12.5%;" />
              <col style="width: 12.5%;" />
            </colgroup>
            <thead>
              <tr><th colspan="8" class="blue-main">Resumen consolidado de UCAPs</th></tr>
              <tr><th colspan="8" class="blue-sub">${escapeHtml(municipioLabel)}${escapeHtml(zoneLabel)} - ${projectSummaries.length} proyecto${projectSummaries.length !== 1 ? 's' : ''}</th></tr>
              <tr>
                <th>Item</th>
                <th>Codigo</th>
                <th>UCAP</th>
                <th>Unidad</th>
                <th>Cant. total</th>
                <th>Valor Unit.</th>
                <th>Subtotal base</th>
                <th>Total con IPP</th>
              </tr>
            </thead>
            <tbody>
              ${consolidatedRows}
              <tr>
                <td colspan="4" class="right bold upper">Total cantidades</td>
                <td class="center bold">${escapeHtml(fmtQuantity(consolidatedQuantity))}</td>
                <td></td>
                <td class="right bold">${escapeHtml(fmtCOP(totalBase))}</td>
                <td class="right total">${escapeHtml(fmtCOP(totalAdjusted))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const projectTables = projectSummaries.map((project, projectIndex) => {
      const municipio = getWorkMunicipio(project.work);
      const zone = project.work.zone?.trim() || 'Sin zona';
      const baseLabel =
        project.baseMonth && project.baseYear
          ? `ÍNDICE DE PRECIOS AL PRODUCTOR EN ${MONTH_NAMES_ES[project.baseMonth - 1]?.toUpperCase()} DE ${project.baseYear}`
          : 'ÍNDICE DE PRECIOS AL PRODUCTOR INICIAL';

      const rows = project.lines.length > 0
        ? project.lines.map((line, index) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td>
                ${escapeHtml(line.description)}
                ${line.code ? `<span class="muted">(${escapeHtml(line.code)})</span>` : ''}
              </td>
              <td class="center">${escapeHtml(line.unit)}</td>
              <td class="center">${escapeHtml(fmtQuantity(line.quantity))}</td>
              <td class="right">${escapeHtml(fmtCOP(line.unitValue))}</td>
              <td class="right bold">${escapeHtml(fmtCOP(line.total))}</td>
            </tr>
          `).join('')
        : `
            <tr>
              <td colspan="6" class="center empty">Sin UCAPs registradas en el levantamiento del proyecto.</td>
            </tr>
          `;

      return `
        <div class="section">
          <h2>Presupuesto ${escapeHtml(project.work.name)}</h2>
          <div class="table-center">
            <table class="budget-table" align="center">
              <colgroup>
                <col style="width: 7%;" />
                <col style="width: 45%;" />
                <col style="width: 11%;" />
                <col style="width: 9%;" />
                <col style="width: 14%;" />
                <col style="width: 14%;" />
              </colgroup>
              <thead>
                <tr><th colspan="6" class="blue-main">Proyecto de iluminación ${escapeHtml(municipio)} zona ${escapeHtml(zone)}</th></tr>
                <tr><th colspan="6" class="blue-sub">${escapeHtml(project.work.name)}</th></tr>
                <tr>
                  <th>Item</th>
                  <th>Materiales</th>
                  <th>Unidad</th>
                  <th>Cant.</th>
                  <th>Valor Unit.</th>
                  <th>Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr>
                  <td colspan="5" class="center bold upper">Total obra No. ${projectIndex + 1} del ${escapeHtml(selectedYear)} (pesos base)</td>
                  <td class="right bold">${escapeHtml(fmtCOP(project.baseTotal))}</td>
                </tr>
                <tr>
                  <td colspan="5" class="right upper">${escapeHtml(baseLabel)}</td>
                  <td class="right">${escapeHtml(fmtNumber(project.baseIpp))}</td>
                </tr>
                <tr>
                  <td colspan="5" class="right upper">Índice de precios al productor del mes</td>
                  <td class="right">${project.currentIpp > 0 ? escapeHtml(fmtNumber(project.currentIpp)) : '—'}</td>
                </tr>
                <tr>
                  <td colspan="5" class="right bold upper">Valor total</td>
                  <td class="right total">${escapeHtml(fmtCOP(project.adjustedTotal))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    const documentHtml = `
      <!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
        <head>
          <meta charset="utf-8" />
          <title>Resumen Plan Anual ${escapeHtml(selectedYear)}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page WordSection1 {
              size: 11in 8.5in;
              mso-page-orientation: landscape;
              margin: 0.35in 0.35in 0.35in 0.35in;
            }

            div.WordSection1 {
              page: WordSection1;
            }

            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              font-size: 8.5pt;
              margin: 0;
            }

            h1 {
              margin: 0 0 6px;
              text-align: center;
              font-size: 14pt;
              clear: both;
              display: block;
              width: 100%;
            }

            h2 {
              margin: 16px 0 8px;
              text-align: center;
              font-size: 11pt;
              font-weight: 700;
              clear: both;
              display: block;
              width: 100%;
            }

            .meta {
              margin: 0 auto 14px;
              width: 9.6in;
              border: 1px solid #d1d5db;
              padding: 8px 10px;
              clear: both;
              display: block;
            }

            .meta-row {
              margin: 2px 0;
            }

            .section {
              clear: both;
              display: block;
              width: 100%;
              text-align: center;
              page-break-inside: avoid;
              margin-bottom: 18px;
            }

            .table-center {
              clear: both;
              display: block;
              width: 100%;
              text-align: center;
              margin: 0 auto;
            }

            .budget-table {
              width: 8.1in;
              margin-left: auto;
              margin-right: auto;
              border-collapse: collapse;
              border: 2.25pt solid #000;
              table-layout: fixed;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
              float: none;
            }

            .budget-table.wide {
              width: 10.1in;
            }

            .budget-table th,
            .budget-table td {
              border: 1px solid #000;
              padding: 3px 4px;
              vertical-align: middle;
              line-height: 1.15;
              word-wrap: break-word;
            }

            .budget-table th {
              font-weight: 700;
              text-align: center;
              white-space: normal;
            }

            .blue-main {
              background: #bdd7ee;
              text-transform: uppercase;
              text-align: center;
            }

            .blue-sub {
              background: #d9eaf7;
              text-transform: uppercase;
              text-align: center;
            }

            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: 700; }
            .upper { text-transform: uppercase; }
            .total {
              color: #f59e0b;
              font-weight: 700;
            }
            .muted {
              color: #6b7280;
              font-size: 7pt;
              margin-left: 4px;
            }
            .code {
              font-family: Consolas, monospace;
              font-size: 7pt;
            }
            .empty {
              color: #6b7280;
              padding: 18px 8px;
            }
          </style>
        </head>
        <body>
          <div class="WordSection1">
            <h1>Resumen Plan Anual</h1>
            <div class="meta">
              <div class="meta-row"><strong>Plan anual:</strong> ${escapeHtml(selectedYear)}</div>
              <div class="meta-row"><strong>Municipio:</strong> ${escapeHtml(municipioLabel)}</div>
              <div class="meta-row"><strong>Zona:</strong> ${escapeHtml(selectedZone === 'all' ? 'Todas las zonas' : selectedZone)}</div>
              <div class="meta-row"><strong>Subtotal base:</strong> ${escapeHtml(fmtCOP(totalBase))}</div>
              <div class="meta-row"><strong>Valor con IPP:</strong> ${escapeHtml(fmtCOP(totalAdjusted))}</div>
              <div class="meta-row"><strong>Fecha:</strong> ${escapeHtml(generatedAt)}</div>
            </div>
            ${consolidatedTable}
            ${projectTables}
          </div>
        </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', documentHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildWordFileName(selectedYear, municipioLabel);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const saveReviewDecision = async (decision: AnnualPlanReviewStatus, comment = '') => {
    if (!hasRequiredFilters) {
      toast.error('Selecciona año y municipio antes de revisar el resumen');
      return;
    }

    const year = Number(selectedYear);
    if (!Number.isFinite(year)) {
      toast.error('Año del plan inválido');
      return;
    }

    try {
      setReviewSaving(true);
      const review = await surveysService.reviewAnnualPlan({
        year,
        municipio: selectedMunicipio,
        zone: selectedZone,
        decision,
        comment,
      });

      setAnnualPlanReview(review);
      setRejectDialogOpen(false);
      setRejectComment('');
      toast.success(decision === 'aprobado' ? 'Resumen aprobado correctamente' : 'Resumen rechazado correctamente');
    } catch {
      toast.error('No se pudo guardar la revisión del resumen');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleApproveSummary = () => {
    void saveReviewDecision('aprobado');
  };

  const handleRejectSummary = () => {
    if (!rejectComment.trim()) {
      toast.error('Escribe el motivo del rechazo');
      return;
    }

    void saveReviewDecision('rechazado', rejectComment);
  };

  useEffect(() => {
    if (allCompanyIds.length === 0) return;

    let cancelled = false;
    const loadWorks = async () => {
      try {
        setLoadingWorks(true);
        const response = await surveysService.getWorks({ companyId: allCompanyIds });
        if (cancelled) return;
        setAllWorks(Array.isArray(response) ? response : response.data || []);
      } catch {
        toast.error('Error al cargar las obras del plan anual');
      } finally {
        if (!cancelled) setLoadingWorks(false);
      }
    };

    loadWorks();

    return () => {
      cancelled = true;
    };
  }, [allCompanyIds]);

  useEffect(() => {
    if (selectedMunicipio !== 'none' && selectedMunicipio !== 'all' && !availableMunicipios.includes(selectedMunicipio)) {
      setSelectedMunicipio('none');
      setSelectedZone('all');
    }
  }, [availableMunicipios, selectedMunicipio]);

  useEffect(() => {
    if (selectedZone !== 'all' && availableZones.length > 0 && !availableZones.includes(selectedZone)) {
      setSelectedZone('all');
    }
  }, [availableZones, selectedZone]);

  useEffect(() => {
    if (!hasRequiredFilters) {
      setAnnualPlanReview(null);
      return;
    }

    const year = Number(selectedYear);
    if (!Number.isFinite(year)) {
      setAnnualPlanReview(null);
      return;
    }

    let cancelled = false;

    const loadReview = async () => {
      try {
        setLoadingReview(true);
        const review = await surveysService.getAnnualPlanReview({
          year,
          municipio: selectedMunicipio,
          zone: selectedZone,
        });

        if (!cancelled) setAnnualPlanReview(review);
      } catch {
        if (!cancelled) {
          setAnnualPlanReview(null);
          toast.error('Error al cargar el estado de aprobación del resumen');
        }
      } finally {
        if (!cancelled) setLoadingReview(false);
      }
    };

    loadReview();

    return () => {
      cancelled = true;
    };
  }, [hasRequiredFilters, selectedMunicipio, selectedYear, selectedZone]);

  useEffect(() => {
    if (filteredWorks.length === 0) {
      setProjectSummaries([]);
      return;
    }

    let cancelled = false;

    const loadBudgets = async () => {
      try {
        setLoadingBudgets(true);
        const summaries = await mapLimit(filteredWorks, 4, async (work) => {
          try {
            const latestSurvey = await surveysService.getLatestSurveyForWork(work.workId);
            const survey = latestSurvey?.surveyId ? await surveysService.getSurveyById(latestSurvey.surveyId) : null;
            return buildProjectSummary(work, survey);
          } catch {
            return buildProjectSummary(work, null);
          }
        });

        if (!cancelled) setProjectSummaries(summaries);
      } catch {
        toast.error('Error al cargar el presupuesto de los proyectos');
      } finally {
        if (!cancelled) setLoadingBudgets(false);
      }
    };

    loadBudgets();

    return () => {
      cancelled = true;
    };
  }, [filteredWorks]);

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[hsl(var(--canalco-neutral-600))]">Cargando accesos...</p>
        </div>
      </div>
    );
  }

  if (accessError || departments.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
        <Alert className="max-w-md border-amber-500 bg-amber-50">
          <AlertDescription className="text-amber-700">
            {accessError || 'No tienes acceso a ningún departamento. Contacta al administrador.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-20 print:static print:shadow-none">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 print:hidden">
              <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
                <img
                  src="/assets/images/logo-canalco.png"
                  alt="Canales Contactos"
                  className="w-full h-full object-contain"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Ir al inicio">
                <Home className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/dashboard/levantamiento-obras/plan-anual')}
                title="Volver al Plan Anual"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-grow text-center">
              <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))]">
                Resumen Plan Anual
              </h1>
              <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
                Cuadro presupuestal por proyecto
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 print:hidden">
              {hasRequiredFilters && (
                <span className={`hidden lg:inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${reviewStatusClass}`}>
                  {reviewStatusLabel}
                </span>
              )}

              {canReviewAnnualPlan && hasRequiredFilters && projectSummaries.length > 0 && (
                <>
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={handleApproveSummary}
                    disabled={reviewSaving || loadingReview}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={reviewSaving || loadingReview}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Rechazar
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                onClick={handleGenerateWord}
                disabled={!hasRequiredFilters || loadingWorks || loadingBudgets || projectSummaries.length === 0}
              >
                <FileText className="w-4 h-4 mr-2" />
                Generar Word
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] p-4 mb-6 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Año</label>
              <Select
                value={selectedYear}
                onValueChange={(value) => {
                  setSelectedYear(value);
                  setSelectedMunicipio('none');
                  setSelectedZone('all');
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Seleccionar año" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar año</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Municipio</label>
              <Select
                value={selectedMunicipio}
                onValueChange={(value) => {
                  setSelectedMunicipio(value);
                  setSelectedZone('all');
                }}
                disabled={selectedYear === 'none'}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Seleccionar municipio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar municipio</SelectItem>
                  <SelectItem value="all">Todos los municipios</SelectItem>
                  {availableMunicipios.map((municipio) => (
                    <SelectItem key={municipio} value={municipio}>
                      {municipio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-[hsl(var(--canalco-neutral-500))] mb-1 block">Zona</label>
              <Select value={selectedZone} onValueChange={setSelectedZone} disabled={!hasRequiredFilters}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las zonas</SelectItem>
                  {availableZones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))]">Total resumen</p>
              <p className="text-lg font-bold text-[hsl(var(--canalco-primary))]">
                {hasRequiredFilters ? fmtCOP(totalAdjusted) : '—'}
              </p>
              <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
                {hasRequiredFilters ? `${projectSummaries.length} proyecto${projectSummaries.length !== 1 ? 's' : ''}` : 'Selecciona filtros'}
              </p>
            </div>
          </div>
        </div>

        {(loadingWorks || loadingBudgets) && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-10 h-10 border-4 border-[hsl(var(--canalco-primary))] border-t-transparent rounded-full" />
          </div>
        )}

        {!loadingWorks && !loadingBudgets && !hasRequiredFilters && (
          <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] p-8 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
            Selecciona año y municipio para generar el resumen del plan anual.
          </div>
        )}

        {!loadingWorks && !loadingBudgets && hasRequiredFilters && projectSummaries.length === 0 && (
          <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] p-8 text-center text-sm text-[hsl(var(--canalco-neutral-500))]">
            No hay proyectos del plan anual con los filtros seleccionados.
          </div>
        )}

        {!loadingWorks && !loadingBudgets && hasRequiredFilters && projectSummaries.length > 0 && (
          <div className="space-y-8">
            <div className="bg-white rounded-xl shadow-md border border-[hsl(var(--canalco-neutral-200))] px-5 py-4 print:shadow-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">
                    Plan anual {selectedYear}
                  </h2>
                  <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                    Subtotal base: {fmtCOP(totalBase)} · Valor con IPP: {fmtCOP(totalAdjusted)}
                  </p>
                  {annualPlanReview?.status === 'rechazado' && annualPlanReview.comment && (
                    <p className="mt-1 text-xs text-red-700">
                      Motivo de rechazo: {annualPlanReview.comment}
                    </p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-3 text-sm text-[hsl(var(--canalco-neutral-500))]">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${reviewStatusClass}`}>
                    {reviewStatusLabel}
                  </span>
                  <CalendarDays className="w-4 h-4" />
                  {new Date().toLocaleDateString('es-CO')}
                </div>
              </div>
            </div>

            <section className="break-inside-avoid print:break-inside-avoid">
              <h2 className="text-center text-lg font-bold text-[hsl(var(--canalco-neutral-900))] mb-3">
                Consolidado de UCAPs del Plan Anual {selectedYear}
              </h2>

              <div className="max-w-6xl mx-auto bg-white border-4 border-black shadow-md print:shadow-none">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th colSpan={8} className="border border-black bg-[#bdd7ee] px-2 py-2 text-center font-bold uppercase">
                        Resumen consolidado de UCAPs
                      </th>
                    </tr>
                    <tr>
                      <th colSpan={8} className="border border-black bg-[#d9eaf7] px-2 py-2 text-center font-bold uppercase">
                        {selectedMunicipio === 'all' ? 'Todos los municipios' : selectedMunicipio}
                        {selectedZone !== 'all' ? ` - Zona ${selectedZone}` : ''} - {projectSummaries.length} proyecto{projectSummaries.length !== 1 ? 's' : ''}
                      </th>
                    </tr>
                    <tr className="bg-white">
                      <th className="border border-black px-2 py-1 text-center w-12">Item</th>
                      <th className="border border-black px-2 py-1 text-center w-28">Codigo</th>
                      <th className="border border-black px-2 py-1 text-center">UCAP</th>
                      <th className="border border-black px-2 py-1 text-center w-24">Unidad</th>
                      <th className="border border-black px-2 py-1 text-center w-24">Cant. total</th>
                      <th className="border border-black px-2 py-1 text-center w-32">Valor Unit.</th>
                      <th className="border border-black px-2 py-1 text-center w-36">Subtotal base</th>
                      <th className="border border-black px-2 py-1 text-center w-36">Total con IPP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedUcaps.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="border border-black px-3 py-6 text-center text-[hsl(var(--canalco-neutral-500))]">
                          Sin UCAPs registradas en los levantamientos del plan anual.
                        </td>
                      </tr>
                    ) : (
                      consolidatedUcaps.map((line, index) => (
                        <tr key={line.key}>
                          <td className="border border-black px-2 py-1 text-center">{index + 1}</td>
                          <td className="border border-black px-2 py-1 text-center font-mono text-xs">
                            {line.code || '-'}
                          </td>
                          <td className="border border-black px-2 py-1">
                            {line.description}
                            <span className="ml-2 text-xs text-[hsl(var(--canalco-neutral-500))]">
                              ({line.projectIds.size} proyecto{line.projectIds.size !== 1 ? 's' : ''})
                            </span>
                          </td>
                          <td className="border border-black px-2 py-1 text-center">{line.unit}</td>
                          <td className="border border-black px-2 py-1 text-center font-semibold">{fmtQuantity(line.quantity)}</td>
                          <td className="border border-black px-2 py-1 text-right">
                            {line.hasVariableUnitValue ? 'Variable' : fmtCOP(line.unitValue)}
                          </td>
                          <td className="border border-black px-2 py-1 text-right font-semibold">{fmtCOP(line.baseTotal)}</td>
                          <td className="border border-black px-2 py-1 text-right font-semibold text-[hsl(var(--canalco-primary))]">
                            {fmtCOP(line.adjustedTotal)}
                          </td>
                        </tr>
                      ))
                    )}

                    <tr>
                      <td colSpan={4} className="border border-black px-2 py-1 text-right font-bold uppercase">
                        Total cantidades
                      </td>
                      <td className="border border-black px-2 py-1 text-center font-bold">{fmtQuantity(consolidatedQuantity)}</td>
                      <td className="border border-black px-2 py-1" />
                      <td className="border border-black px-2 py-1 text-right font-bold">{fmtCOP(totalBase)}</td>
                      <td className="border border-black px-2 py-1 text-right font-bold text-[hsl(var(--canalco-primary))]">
                        {fmtCOP(totalAdjusted)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {projectSummaries.map((project, projectIndex) => {
              const municipio = getWorkMunicipio(project.work);
              const zone = project.work.zone?.trim() || 'Sin zona';
              const baseLabel =
                project.baseMonth && project.baseYear
                  ? `ÍNDICE DE PRECIOS AL PRODUCTOR EN ${MONTH_NAMES_ES[project.baseMonth - 1]?.toUpperCase()} DE ${project.baseYear}`
                  : 'ÍNDICE DE PRECIOS AL PRODUCTOR INICIAL';

              return (
                <section key={project.work.workId} className="break-inside-avoid print:break-inside-avoid">
                  <h2 className="text-center text-lg font-bold text-[hsl(var(--canalco-neutral-900))] mb-3">
                    Presupuesto {project.work.name}
                  </h2>

                  <div className="max-w-4xl mx-auto bg-white border-4 border-black shadow-md print:shadow-none">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th colSpan={6} className="border border-black bg-[#bdd7ee] px-2 py-2 text-center font-bold uppercase">
                            Proyecto de iluminación {municipio} zona {zone}
                          </th>
                        </tr>
                        <tr>
                          <th colSpan={6} className="border border-black bg-[#d9eaf7] px-2 py-2 text-center font-bold uppercase">
                            {project.work.name}
                          </th>
                        </tr>
                        <tr className="bg-white">
                          <th className="border border-black px-2 py-1 text-center w-14">Item</th>
                          <th className="border border-black px-2 py-1 text-center">Materiales</th>
                          <th className="border border-black px-2 py-1 text-center w-24">Unidad</th>
                          <th className="border border-black px-2 py-1 text-center w-20">Cant.</th>
                          <th className="border border-black px-2 py-1 text-center w-32">Valor Unit.</th>
                          <th className="border border-black px-2 py-1 text-center w-36">Valor Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.lines.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="border border-black px-3 py-6 text-center text-[hsl(var(--canalco-neutral-500))]">
                              Sin UCAPs registradas en el levantamiento del proyecto.
                            </td>
                          </tr>
                        ) : (
                          project.lines.map((line, index) => (
                            <tr key={`${line.code}-${index}`}>
                              <td className="border border-black px-2 py-1 text-center">{index + 1}</td>
                              <td className="border border-black px-2 py-1">
                                {line.description}
                                {line.code && (
                                  <span className="ml-1 text-xs text-[hsl(var(--canalco-neutral-500))]">({line.code})</span>
                                )}
                              </td>
                              <td className="border border-black px-2 py-1 text-center">{line.unit}</td>
                              <td className="border border-black px-2 py-1 text-center">{fmtQuantity(line.quantity)}</td>
                              <td className="border border-black px-2 py-1 text-right">{fmtCOP(line.unitValue)}</td>
                              <td className="border border-black px-2 py-1 text-right font-semibold">{fmtCOP(line.total)}</td>
                            </tr>
                          ))
                        )}

                        <tr>
                          <td colSpan={5} className="border border-black px-2 py-1 text-center font-bold uppercase">
                            Total obra No. {projectIndex + 1} del {selectedYear} (pesos base)
                          </td>
                          <td className="border border-black px-2 py-1 text-right font-bold">{fmtCOP(project.baseTotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="border border-black px-2 py-1 text-right uppercase">
                            {baseLabel}
                          </td>
                          <td className="border border-black px-2 py-1 text-right">{fmtNumber(project.baseIpp)}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="border border-black px-2 py-1 text-right uppercase">
                            Índice de precios al productor del mes
                          </td>
                          <td className="border border-black px-2 py-1 text-right">
                            {project.currentIpp > 0 ? fmtNumber(project.currentIpp) : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="border border-black px-2 py-1 text-right font-bold uppercase">
                            Valor total
                          </td>
                          <td className="border border-black px-2 py-1 text-right font-bold text-[hsl(var(--canalco-primary))]">
                            {fmtCOP(project.adjustedTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar resumen plan anual</DialogTitle>
            <DialogDescription>
              Escribe el motivo del rechazo. Este comentario quedará visible en el resumen para los demás usuarios.
            </DialogDescription>
          </DialogHeader>

          <textarea
            value={rejectComment}
            onChange={(event) => setRejectComment(event.target.value)}
            className="min-h-[120px] w-full rounded-lg border border-[hsl(var(--canalco-neutral-300))] bg-white p-3 text-sm outline-none focus:border-[hsl(var(--canalco-primary))]"
            placeholder="Motivo del rechazo..."
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={reviewSaving}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleRejectSummary}
              disabled={reviewSaving}
            >
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
