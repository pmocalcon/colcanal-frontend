import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Home, ArrowLeft, Printer, ChevronDown, ChevronUp, Trash2, GripVertical } from 'lucide-react';
import { surveysService, type Work, type IppConfig } from '@/services/surveys.service';
import {
  directorBudgetsService,
  type DirectorBudget,
} from '@/services/director-budgets.service';
import { getActaConfig } from '@/config/actas';
import type { EncabezadoTablaRow } from '@/config/actas/types';
import { useSurveyAccess } from '@/hooks/useSurveyAccess';
import { mapCompaniesToDepartments } from '@/utils/departmentMapper';
import { useAuth } from '@/contexts/AuthContext';

const EditContext = createContext(true);

const ROMAN_NUM = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

function InlineInput({
  value,
  onChange,
  bold = false,
  placeholder = '____',
}: {
  value: string;
  onChange: (v: string) => void;
  bold?: boolean;
  placeholder?: string;
}) {
  const canEdit = useContext(EditContext);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(40);
  const displayed = value || placeholder;
  useEffect(() => {
    if (mirrorRef.current) {
      setWidth(Math.max(mirrorRef.current.offsetWidth + 4, 20));
    }
  }, [displayed]);
  if (!canEdit) {
    return (
      <span className={bold ? 'font-bold' : ''}>
        {value || <span className="opacity-40">{placeholder}</span>}
      </span>
    );
  }
  return (
    <span className="relative inline-block">
      <span
        ref={mirrorRef}
        aria-hidden
        className={`invisible absolute whitespace-pre ${bold ? 'font-bold' : ''}`}
        style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
      >
        {displayed}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={!value ? placeholder : undefined}
        style={{ width: `${width}px`, fontFamily: 'inherit', fontSize: 'inherit' }}
        className={`border-b border-dashed border-blue-300/80 bg-transparent focus:outline-none focus:border-blue-500 print:border-none ${bold ? 'font-bold' : ''}`}
      />
    </span>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canEdit = useContext(EditContext);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  if (!canEdit) {
    return (
      <p className={`whitespace-pre-wrap ${className ?? ''}`} style={style}>
        {value}
      </p>
    );
  }
  return (
    <>
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={onChange}
        className={`print:hidden ${className ?? ''}`}
        style={style}
      />
      <p className={`hidden print:block whitespace-pre-wrap ${className ?? ''}`} style={style}>
        {value}
      </p>
    </>
  );
}

function EditableText({ children }: { children: string }) {
  const canEdit = useContext(EditContext);
  if (!canEdit) return <span>{children}</span>;
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      className="focus:outline-none focus:bg-blue-50/60 rounded print:bg-transparent"
    >
      {children}
    </span>
  );
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const fmtCOP = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

function _numWords(n: number): string {
  const u = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
              'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
              'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
              'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro',
              'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const hn = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
               'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  if (n === 0) return 'cero';
  if (n < 30) return u[n];
  if (n < 100) { const t = Math.floor(n / 10), r = n % 10; return r === 0 ? tens[t] : `${tens[t]} y ${u[r]}`; }
  if (n === 100) return 'cien';
  if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return r === 0 ? hn[h] : `${hn[h]} ${_numWords(r)}`; }
  if (n < 1_000_000) { const t = Math.floor(n / 1000), r = n % 1000; const tw = t === 1 ? 'mil' : `${_numWords(t)} mil`; return r === 0 ? tw : `${tw} ${_numWords(r)}`; }
  const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
  const mw = m === 1 ? 'un millón' : `${_numWords(m)} millones`;
  return r === 0 ? mw : `${mw} ${_numWords(r)}`;
}

function pesoText(n: number): string {
  const round = Math.round(n);
  return `${_numWords(round)} pesos moneda legal ($${new Intl.NumberFormat('es-CO').format(round)}) M/L`;
}

interface ConsolidatedItem {
  key: string;
  code: string;
  descripcion: string;
  cantidad: number;
  vrUnitario: number;
}

type Block =
  | { kind: 'clausula'; id: string; title: string; content: string }
  | { kind: 'table'; id: string; tableId: string };

/**
 * map con concurrencia limitada: evita disparar decenas de peticiones a la vez
 * (el pool de conexiones del backend es pequeño y las últimas hacían timeout).
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

export default function ResumenActaPage() {
  const navigate = useNavigate();
  const { recordNumber: encodedActa } = useParams<{ recordNumber: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const recordNumber = decodeURIComponent(encodedActa ?? '');
  // El número de acta se reutiliza entre municipios; el companyId del query param identifica el correcto.
  const actaCompanyId = searchParams.get('company') ? Number(searchParams.get('company')) : null;

  const { user } = useAuth();
  const rol = user?.nombreRol ?? '';
  const canEdit = rol.startsWith('Director de Proyecto') || rol === 'Analista PMO';

  const { access, loading: accessLoading } = useSurveyAccess();
  const departments = useMemo(() => {
    if (!access?.companies) return [];
    return mapCompaniesToDepartments(access.companies);
  }, [access]);

  const [works, setWorks] = useState<Work[]>([]);
  const [budgets, setBudgets] = useState<DirectorBudget[]>([]);
  const [consolidatedItems, setConsolidatedItems] = useState<ConsolidatedItem[]>([]);
  const [perWorkTotals, setPerWorkTotals] = useState<Map<number, number>>(new Map());
  const [perWorkItems, setPerWorkItems] = useState<Map<number, ConsolidatedItem[]>>(new Map());
  const [ippConfig, setIppConfig] = useState<IppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  const [ippCurrent, setIppCurrent] = useState('');
  const lastContratoRef = useRef('');

  // ── Editable document state ──
  const [showDocument, setShowDocument] = useState(true);
  const [docFields, setDocFields] = useState(() => getActaConfig().docFields);
  const setDF = (field: keyof typeof docFields) => (value: string) =>
    setDocFields((prev) => ({ ...prev, [field]: value }));
  const [consideraciones, setConsideraciones] = useState(() => getActaConfig().consideraciones);
  const [blocks, setBlocks] = useState<Block[]>(() =>
    getActaConfig().clausulas.map((c, i) => ({
      kind: 'clausula' as const,
      id: `c-${i}`,
      title: c.title,
      content: c.content,
    }))
  );
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(() => getActaConfig().logoUrl);
  const [hideMunicipioBanner, setHideMunicipioBanner] = useState<boolean>(() => getActaConfig().hideMunicipioBanner ?? false);
  const [encabezadoTabla, setEncabezadoTabla] = useState<EncabezadoTablaRow[] | undefined>(() => getActaConfig().encabezadoTabla);

  const loadBudgetsForWorks = async (worksInput: Work[]) => {
    setLoading(true);
    setWorks(worksInput);
    try {
      // La empresa del acta viene en la URL (?company=); es la fuente confiable.
      // El IPP inicial vive por PROYECTO, así que tomamos el projectId de las obras.
      const companyId =
        actaCompanyId ?? worksInput[0]?.companyId ?? (worksInput[0] as any)?.company?.companyId;
      const projectId =
        worksInput.find((w) => w.projectId)?.projectId ??
        (worksInput.find((w) => (w as any).project?.projectId) as any)?.project?.projectId ??
        worksInput[0]?.projectId;
      const cfg = getActaConfig(companyId, projectId);
      setDocFields({ ...cfg.docFields, actaNumero: recordNumber, actaReferenciaAnterior: recordNumber });
      setConsideraciones(cfg.consideraciones);
      const ts = Date.now();
      const clausulaBlocks: Block[] = cfg.clausulas.map((c, i) => ({
        kind: 'clausula',
        id: `c-${i}-${ts}`,
        title: c.title,
        content: c.content,
      }));
      const tableBlocks: Block[] = [
        { kind: 'table', id: 'tbl-consolidated', tableId: 'consolidated' },
        ...worksInput.map((w) => ({ kind: 'table' as const, id: `tbl-work-${w.workId}`, tableId: `work-${w.workId}` })),
        { kind: 'table', id: 'tbl-detail', tableId: 'detail' },
      ];
      setBlocks([...clausulaBlocks, ...tableBlocks]);
      setLogoUrl(cfg.logoUrl);
      setHideMunicipioBanner(cfg.hideMunicipioBanner ?? false);
      setEncabezadoTabla(cfg.encabezadoTabla);
      const [budgetResults, surveyListResults, ucapRes] = await Promise.all([
        mapLimit(worksInput, 5, (w) =>
          directorBudgetsService.getAll({ workId: w.workId, limit: 10 }).catch(() => ({ data: [] } as any)),
        ),
        mapLimit(worksInput, 5, (w) =>
          surveysService.getSurveys({ workId: w.workId, limit: 100 }).catch(() => ({ data: [] })),
        ),
        companyId ? surveysService.getUcaps(companyId, projectId).catch(() => null) : Promise.resolve(null),
      ]);

      // Fetch full survey details (with budgetItems) con concurrencia limitada
      const surveyResults = await mapLimit(surveyListResults, 4, async (listRes) => {
        const fullSurveys = await mapLimit(listRes.data ?? [], 2, (s: any) =>
          surveysService.getSurveyById(s.surveyId).catch(() => s),
        );
        return { data: fullSurveys };
      });
      if (ucapRes?.ippConfig) setIppConfig(ucapRes.ippConfig);

      // Collect best budget per work (used only for manoDeObra and vrUnitario lookup)
      const collected: DirectorBudget[] = [];
      budgetResults.forEach((res) => {
        const best =
          res.data.find((b) => b.status === 'final') ??
          res.data.find((b) => b.status === 'en_revision') ??
          res.data[0];
        if (best) collected.push(best);
      });
      setBudgets(collected);

      // Build ucapId → value map from the UCAP catalog (source of truth for prices)
      const ucapValueMap = new Map<number, number>();
      (ucapRes?.ucaps ?? []).forEach((u: any) => {
        ucapValueMap.set(u.ucapId, Number(u.value) || 0);
      });

      // Build consolidated UCAP items from survey budgetItems
      const itemMap = new Map<number, ConsolidatedItem>();
      surveyResults.forEach((res) => {
        (res.data ?? []).forEach((survey: any) => {
          (survey.budgetItems ?? []).forEach((bi: any) => {
            if (!bi.ucapId) return;
            const cant = Number(bi.quantity) || 0;
            const vr = ucapValueMap.get(bi.ucapId) ?? Number(bi.unitValue) ?? 0;
            if (itemMap.has(bi.ucapId)) {
              itemMap.get(bi.ucapId)!.cantidad += cant;
            } else {
              itemMap.set(bi.ucapId, {
                key: String(bi.ucapId),
                code: bi.ucap?.code || '',
                descripcion: bi.ucap?.description || '',
                cantidad: cant,
                vrUnitario: vr,
              });
            }
          });
        });
      });
      setConsolidatedItems(Array.from(itemMap.values()));

      // Compute per-work totals and UCAP item lists in a single pass
      const perWork = new Map<number, number>();
      const pwItems = new Map<number, ConsolidatedItem[]>();
      worksInput.forEach((w, idx) => {
        const res = surveyResults[idx];
        let workTotal = 0;
        const wMap = new Map<number, ConsolidatedItem>();
        (res.data ?? []).forEach((survey: any) => {
          (survey.budgetItems ?? []).forEach((bi: any) => {
            const vr = ucapValueMap.get(bi.ucapId) ?? Number(bi.unitValue) ?? 0;
            const cant = Number(bi.quantity) || 0;
            workTotal += cant * vr;
            if (bi.ucapId) {
              if (wMap.has(bi.ucapId)) {
                wMap.get(bi.ucapId)!.cantidad += cant;
              } else {
                wMap.set(bi.ucapId, {
                  key: String(bi.ucapId),
                  code: bi.ucap?.code || '',
                  descripcion: bi.ucap?.description || '',
                  cantidad: cant,
                  vrUnitario: vr,
                });
              }
            }
          });
        });
        const budget = collected.find((b) => b.workId === w.workId);
        const mdo = Number(budget?.manoDeObra) || 0;
        perWork.set(w.workId, workTotal + mdo);
        pwItems.set(w.workId, Array.from(wMap.values()));
      });
      setPerWorkTotals(perWork);
      setPerWorkItems(pwItems);

      // Pre-populate IPP del mes from the first survey that has it
      const ippFromSurvey = surveyResults
        .flatMap((res) => res.data ?? [])
        .map((s: any) => s.previousMonthIpp)
        .find((v: any) => v != null && Number(v) > 0);
      if (ippFromSurvey != null) {
        setIppCurrent(String(Number(ippFromSurvey)));
      }
    } finally {
      setLoading(false);
    }
  };

  const items = consolidatedItems;

  const totalMateriales = useMemo(
    () => items.reduce((s, it) => s + it.cantidad * it.vrUnitario, 0),
    [items],
  );

  const manoDeObraTotal = useMemo(
    () => budgets.reduce((s, b) => s + (Number(b.manoDeObra) || 0), 0),
    [budgets],
  );

  const totalObra = totalMateriales + manoDeObraTotal;

  const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const baseVal = ippConfig ? ippConfig.initialValue : 0;
  const currentVal = parseFloat(ippCurrent) || 0;
  const factor = baseVal > 0 && currentVal > 0 ? currentVal / baseVal : 1;
  const valorTotal = totalObra * factor;
  const baseLabel = ippConfig
    ? `IPP ${MONTH_NAMES_ES[(ippConfig.baseMonth ?? 1) - 1]} ${ippConfig.baseYear}`
    : 'IPP Base';

  const isLoading = accessLoading || loading;

  // 1) Navigation state (fast path)
  useEffect(() => {
    const stateWorks: Work[] | undefined = (location.state as any)?.works;
    if (stateWorks && stateWorks.length > 0) {
      initialized.current = true;
      loadBudgetsForWorks(stateWorks);
    }
  }, []);

  // 2) Fallback: fetch from API when opened directly by URL
  useEffect(() => {
    if (initialized.current || !departments.length) return;
    initialized.current = true;
    const allCompanyIds = Array.from(
      new Set([
        ...(actaCompanyId ? [actaCompanyId] : []),
        ...departments.flatMap((d) => d.companyIds),
      ]),
    );
    setLoading(true);
    surveysService
      .getWorks({ companyId: allCompanyIds, limit: 1000 } as any)
      .then((res) => {
        const all: Work[] = Array.isArray(res) ? res : (res as any).data ?? [];
        const filtered = all.filter(
          (w) =>
            w.recordNumber === recordNumber &&
            (actaCompanyId == null || w.companyId === actaCompanyId),
        );
        return loadBudgetsForWorks(filtered);
      })
      .catch(() => setLoading(false));
  }, [departments]);

  // 3) Auto-substitute placeholders in clausulas and consideraciones when computed values are ready
  useEffect(() => {
    const prev_contrato = lastContratoRef.current;

    const substituteText = (text: string) => {
      if (text.includes('{{VALOR_TOTAL}}') && valorTotal > 0) {
        text = text.replace(/\{\{VALOR_TOTAL\}\}/g, pesoText(valorTotal));
      }
      if (docFields.contrato) {
        if (text.includes('{{CONTRATO}}')) {
          text = text.replace(/\{\{CONTRATO\}\}/g, docFields.contrato);
        } else if (prev_contrato && text.includes(prev_contrato)) {
          text = text.replace(new RegExp(escapeRegex(prev_contrato), 'g'), docFields.contrato);
        }
      }
      if (text.includes('{{NUM_ACTA}}')) {
        text = text.replace(/\{\{NUM_ACTA\}\}/g, recordNumber || '____');
      }
      return text;
    };

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.kind !== 'clausula') return b;
        const content = substituteText(b.content);
        return content !== b.content ? { ...b, content } : b;
      })
    );
    setConsideraciones((prev) =>
      prev.map((c) => {
        const updated = substituteText(c);
        return updated !== c ? updated : c;
      })
    );

    lastContratoRef.current = docFields.contrato;
  }, [valorTotal, docFields.contrato, recordNumber]);

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDragSrcId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragSrcId) setDragOverId(id);
  };
  const handleDrop = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragSrcId || dragSrcId === id) return;
    setBlocks((prev) => {
      const src = prev.find((b) => b.id === dragSrcId);
      if (!src) return prev;
      const without = prev.filter((b) => b.id !== dragSrcId);
      const idx = without.findIndex((b) => b.id === id);
      if (idx === -1) return [...without, src];
      return [...without.slice(0, idx), src, ...without.slice(idx)];
    });
    setDragSrcId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => {
    setDragSrcId(null);
    setDragOverId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10 print:hidden">
        <div className="max-w-full px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl shadow-md p-2 w-12 h-12 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
              <img src="/assets/images/logo-canalco.png" alt="Canalco" className="w-full h-full object-contain" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="flex-1 text-lg font-bold text-[hsl(var(--canalco-neutral-900))]">
              Resumen de Acta —{' '}
              <span className="text-[hsl(var(--canalco-primary))]">{recordNumber}</span>
            </h1>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
          </div>
        ) : (
          <>
          {/* ── Acta de Obra — Texto Editable ── */}
          <div className="mb-6 bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-3 bg-[hsl(var(--canalco-primary))]/5 border-b border-[hsl(var(--canalco-neutral-200))] hover:bg-[hsl(var(--canalco-primary))]/10 transition-colors print:hidden"
              onClick={() => setShowDocument(!showDocument)}
            >
              <span className="font-semibold text-sm text-[hsl(var(--canalco-neutral-800))]">Texto del Acta de Obra</span>
              {showDocument ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showDocument && (
              <EditContext.Provider value={canEdit}>
              <div
                className="px-10 py-8 print:block"
                style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: '1.7' }}
              >
                {/* Membrete */}
                {hideMunicipioBanner ? (
                  <div className="flex justify-center mb-6">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt={`Logo ${docFields.municipio}`}
                        className="w-auto object-contain"
                        style={{ maxHeight: '160px' }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center mb-6">
                    <div className="flex-none w-24">
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt={`Logo ${docFields.municipio}`}
                          className="h-24 w-auto object-contain"
                          style={{ maxHeight: '96px' }}
                        />
                      )}
                    </div>
                    <div className="flex-1 text-center leading-snug">
                      <p className="font-bold uppercase" style={{ fontSize: '13pt' }}>
                        MUNICIPIO DE {docFields.municipioNombreCompleto || docFields.municipio}
                      </p>
                      {docFields.municipioNit && (
                        <p style={{ fontSize: '11pt' }}>NIT: {docFields.municipioNit}</p>
                      )}
                    </div>
                    <div className="flex-none w-24" />
                  </div>
                )}

                {/* Separador */}
                {!hideMunicipioBanner && (
                  <div className="flex justify-center mt-1 mb-6">
                    <div className="border-t-4 border-green-900 w-2/3" />
                  </div>
                )}

                {/* Título del documento */}
                <div className="text-center mb-6 space-y-0.5 leading-snug">
                  <p className="font-bold uppercase">
                    SISTEMA DE ALUMBRADO PÚBLICO DEL MUNICIPIO DE {docFields.municipio}
                  </p>
                  <p className="font-bold uppercase">
                    CONTRATO DE CONCESIÓN No{' '}
                    <InlineInput value={docFields.contrato} onChange={setDF('contrato')} bold />
                  </p>
                  <p className="font-bold uppercase">
                    ACTA DE OBRA No. <strong>{recordNumber}</strong>
                  </p>
                  <p className="font-bold uppercase">
                    <InlineInput value={docFields.tipoActa} onChange={setDF('tipoActa')} bold />
                  </p>
                  <p className="font-bold uppercase">
                    (<InlineInput value={docFields.actaFecha} onChange={setDF('actaFecha')} bold placeholder="DD DE MES DE YYYY" />)
                  </p>
                </div>

                {/* Tabla de encabezado (opcional, ej. Jericó modernización) */}
                {encabezadoTabla && encabezadoTabla.length > 0 && (
                  <table className="w-full border-collapse mb-6 text-[11pt]">
                    <tbody>
                      {encabezadoTabla.map((row, i) => (
                        <tr key={i}>
                          <td className="border border-gray-700 px-3 py-1 font-semibold align-top w-[35%] whitespace-pre-line">
                            {row.label}
                          </td>
                          <td className="border border-gray-700 px-3 py-1 align-top whitespace-pre-line">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Párrafo de partes */}
                <p className="text-justify mb-5">
                  <EditableText>Entre los suscritos </EditableText>
                  <InlineInput value={docFields.munNombre} onChange={setDF('munNombre')} bold />
                  <EditableText>, mayor de edad, identificada con cédula de ciudadanía No. </EditableText>
                  <InlineInput value={docFields.munCc} onChange={setDF('munCc')} />
                  <EditableText> de </EditableText>
                  <InlineInput value={docFields.munCcCiudad} onChange={setDF('munCcCiudad')} />
                  <EditableText>, quien obra en nombre y representación del </EditableText>
                  <strong>MUNICIPIO DE <InlineInput value={docFields.municipio} onChange={setDF('municipio')} bold /></strong>
                  <EditableText>, en su calidad de </EditableText>
                  <InlineInput value={docFields.munCargo} onChange={setDF('munCargo')} />
                  <EditableText>, identificada con el Acta de Posesión del </EditableText>
                  <InlineInput value={docFields.munPosesionFecha} onChange={setDF('munPosesionFecha')} />
                  <EditableText>, quien en adelante para los efectos del presente documento se denominará </EditableText>
                  <strong>EL MUNICIPIO</strong>
                  <EditableText>, por una parte, </EditableText>
                  <InlineInput value={docFields.conNombre} onChange={setDF('conNombre')} bold />
                  <EditableText>, mayor de edad, identificada con cédula de ciudadanía No. </EditableText>
                  <InlineInput value={docFields.conCc} onChange={setDF('conCc')} />
                  <EditableText> de </EditableText>
                  <InlineInput value={docFields.conCcCiudad} onChange={setDF('conCcCiudad')} />
                  <EditableText>, quien actúa en calidad de Representante Legal de la </EditableText>
                  <InlineInput value={docFields.conEmpresa} onChange={setDF('conEmpresa')} bold />
                  <EditableText>, identificada con No. De Nit </EditableText>
                  <InlineInput value={docFields.conNit} onChange={setDF('conNit')} />
                  <EditableText>, quien en adelante para los efectos del presente documento se denominará </EditableText>
                  <strong>EL CONCESIONARIO</strong>
                  <EditableText>, y por otra parte </EditableText>
                  <InlineInput value={docFields.intNombre} onChange={setDF('intNombre')} bold />
                  <EditableText>, mayor de edad, identificado con cédula de ciudadanía No. </EditableText>
                  <InlineInput value={docFields.intCc} onChange={setDF('intCc')} />
                  <EditableText> expedida en </EditableText>
                  <InlineInput value={docFields.intCcCiudad} onChange={setDF('intCcCiudad')} />
                  <EditableText>, quien actúa en calidad de representante legal de </EditableText>
                  <InlineInput value={docFields.intEmpresa} onChange={setDF('intEmpresa')} bold />
                  <EditableText> y Director de Interventoría del Contrato de Concesión, han convenido suscribir la presente acta de obra No. </EditableText>
                  <strong>{recordNumber}</strong>
                  <EditableText> para la realización de las obras de </EditableText>
                  <InlineInput value={docFields.tipoActa} onChange={setDF('tipoActa')} />
                  <EditableText> en diferentes sectores de la zona urbana y rural del Municipio de </EditableText>
                  <InlineInput value={docFields.municipio} onChange={setDF('municipio')} />
                  <EditableText> en el año </EditableText>
                  <InlineInput value={docFields.actaYear} onChange={setDF('actaYear')} />
                  <EditableText>, en el marco del contrato de Concesión No. </EditableText>
                  <InlineInput value={docFields.contrato} onChange={setDF('contrato')} />
                  <EditableText>, la cual se regirá por las siguientes cláusulas, previas las siguientes,</EditableText>
                </p>

                {/* CONSIDERACIONES */}
                <p className="font-bold text-center mb-4 uppercase tracking-wide">Consideraciones</p>
                {consideraciones.map((c, i) => (
                  <div key={i} className="flex gap-3 mb-3 items-start">
                    <span className="font-bold shrink-0 w-8">{ROMAN_NUM[i]}.</span>
                    <AutoResizeTextarea
                      value={c}
                      onChange={(e) => {
                        const updated = [...consideraciones];
                        updated[i] = e.target.value;
                        setConsideraciones(updated);
                      }}
                      className="flex-1 bg-transparent border-0 border-l-2 border-blue-200 pl-2 resize-none focus:outline-none focus:border-blue-400 text-justify leading-[1.7] print:border-l-0 print:pl-0"
                      style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                    />
                    {canEdit && (
                      <button
                        className="shrink-0 text-red-400 hover:text-red-600 mt-1 print:hidden"
                        onClick={() => setConsideraciones(consideraciones.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button
                    className="text-sm text-blue-600 hover:underline mt-2 print:hidden"
                    onClick={() => setConsideraciones([...consideraciones, 'Que...'])}
                  >
                    + Agregar consideración
                  </button>
                )}

                {/* ACUERDAN */}
                <p className="font-bold text-center mt-8 mb-5 uppercase tracking-wide">Acuerdan:</p>
                {blocks.map((block) => {
                  const isOver = block.id === dragOverId && block.id !== dragSrcId;
                  const isDragging = block.id === dragSrcId;

                  if (block.kind === 'table') {
                    const workId = block.tableId.startsWith('work-')
                      ? parseInt(block.tableId.replace('work-', ''), 10)
                      : null;
                    const wk = workId != null ? works.find((w) => w.workId === workId) : null;
                    const wItems = wk ? (perWorkItems.get(wk.workId) ?? []) : [];
                    const wUcapTotal = wItems.reduce((s, it) => s + it.cantidad * it.vrUnitario, 0);
                    const wMdo = wk ? (Number(budgets.find((b) => b.workId === wk.workId)?.manoDeObra) || 0) : 0;
                    const wTotal = (wUcapTotal + wMdo) * factor;
                    return (
                      <div
                        key={block.id}
                        className={`relative my-4 ${isDragging ? 'opacity-30' : ''}`}
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '14px', lineHeight: '1.5' }}
                        onDragOver={canEdit ? handleDragOver(block.id) : undefined}
                        onDrop={canEdit ? handleDrop(block.id) : undefined}
                      >
                        {isOver && <div className="h-0.5 bg-blue-500 mb-2 rounded" />}
                        <div className="flex gap-1 items-start">
                          {canEdit && (
                            <div
                              draggable
                              onDragStart={handleDragStart(block.id)}
                              onDragEnd={handleDragEnd}
                              className="cursor-grab text-gray-300 hover:text-gray-500 print:hidden shrink-0 mt-3"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}
                          <div className="flex-1">
                            {block.tableId === 'consolidated' && (
                              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden shadow-sm">
                                <div className="flex border-b border-[hsl(var(--canalco-neutral-200))]">
                                  <div className="flex-1 bg-[hsl(var(--canalco-primary))]/5 px-6 py-3 flex items-center justify-center border-r border-[hsl(var(--canalco-neutral-200))]">
                                    <p className="font-bold text-sm uppercase tracking-wide text-center text-[hsl(var(--canalco-neutral-900))]">
                                      Presupuesto Proyecto — N° Acta:{' '}
                                      <span className="text-[hsl(var(--canalco-primary))]">{recordNumber}</span>
                                    </p>
                                  </div>
                                  <div className="w-20 flex items-center justify-center bg-[hsl(var(--canalco-primary))]/10">
                                    <span className="font-bold text-lg text-[hsl(var(--canalco-neutral-700))]">{new Date().getFullYear()}</span>
                                  </div>
                                </div>
                                <table className="w-full">
                                  <thead>
                                    <tr className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
                                      <th className="px-3 py-2.5 text-left font-semibold text-[hsl(var(--canalco-neutral-700))] w-12" />
                                      <th className="px-3 py-2.5 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">UCAPS</th>
                                      <th className="px-3 py-2.5 text-center font-semibold text-[hsl(var(--canalco-neutral-700))] w-24">CANTIDAD</th>
                                      <th className="px-3 py-2.5 text-right font-semibold text-[hsl(var(--canalco-neutral-700))] w-36">V. UNITARIO</th>
                                      <th className="px-3 py-2.5 text-right font-semibold text-[hsl(var(--canalco-neutral-700))] w-36">V. TOTAL</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.length === 0 ? (
                                      <tr><td colSpan={5} className="px-4 py-12 text-center text-[hsl(var(--canalco-neutral-400))]">No hay UCAPsen los levantamientos de esta acta.</td></tr>
                                    ) : items.map((item, i) => (
                                      <tr key={item.key} className={`border-b border-[hsl(var(--canalco-neutral-100))] ${i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}`}>
                                        <td className="px-3 py-2.5 text-[hsl(var(--canalco-neutral-400))] text-xs font-mono text-center">1.{i + 1}</td>
                                        <td className="px-3 py-2.5 text-[hsl(var(--canalco-neutral-900))]">{item.descripcion || '—'}</td>
                                        <td className="px-3 py-2.5 text-center font-medium text-[hsl(var(--canalco-neutral-900))]">{item.cantidad}</td>
                                        <td className="px-3 py-2.5 text-right text-[hsl(var(--canalco-neutral-700))]">$ {item.vrUnitario.toLocaleString('es-CO')}</td>
                                        <td className="px-3 py-2.5 text-right font-medium text-[hsl(var(--canalco-neutral-900))]">{fmtCOP(item.cantidad * item.vrUnitario)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    {manoDeObraTotal > 0 && (
                                      <tr className="border-t border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))]">
                                        <td colSpan={4} className="px-3 py-2 text-right text-[hsl(var(--canalco-neutral-600))]">Mano de Obra</td>
                                        <td className="px-3 py-2 text-right font-medium">{fmtCOP(manoDeObraTotal)}</td>
                                      </tr>
                                    )}
                                    <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-neutral-100))]">
                                      <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-[hsl(var(--canalco-neutral-700))] uppercase text-xs tracking-wide">Total Obra (Pesos base)</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-[hsl(var(--canalco-neutral-900))]">{fmtCOP(totalObra)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                                <div className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                  <div className="flex items-center border-b border-[hsl(var(--canalco-neutral-200))]">
                                    <div className="flex-1 px-4 py-2.5"><span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase">Índice de Precios al Productor Inicial ({baseLabel})</span></div>
                                    <div className="px-4 py-2 border-l border-[hsl(var(--canalco-neutral-200))] w-36 text-right"><span className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">{baseVal > 0 ? baseVal.toFixed(2) : '—'}</span></div>
                                  </div>
                                  <div className="flex items-center border-b border-[hsl(var(--canalco-neutral-200))]">
                                    <div className="flex-1 px-4 py-2.5"><span className="text-xs font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase">Índice de Precios al Productor del Mes</span></div>
                                    <div className="px-4 py-2.5 border-l border-[hsl(var(--canalco-neutral-200))] w-36 text-right"><span className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">{currentVal > 0 ? currentVal.toFixed(2) : '—'}</span></div>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="flex-1 px-4 py-3" />
                                    <div className="px-6 py-3 bg-[hsl(var(--canalco-primary))]/10 border-l border-[hsl(var(--canalco-neutral-200))] flex items-center gap-6 w-80">
                                      <span className="font-bold text-xs uppercase text-[hsl(var(--canalco-neutral-700))]">Valor Total</span>
                                      <span className="font-bold text-base text-[hsl(var(--canalco-primary))] ml-auto">{fmtCOP(valorTotal)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {wk && (
                              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden shadow-sm">
                                <div className="px-4 py-2 bg-[hsl(var(--canalco-neutral-100))] flex items-center gap-2">
                                  <span className="font-semibold text-[hsl(var(--canalco-neutral-800))]">{wk.name}</span>
                                  {wk.address && <span className="text-xs text-[hsl(var(--canalco-neutral-500))]">— {wk.address}</span>}
                                </div>
                                <table className="w-full">
                                  <thead>
                                    <tr className="bg-[hsl(var(--canalco-neutral-50))] border-b border-[hsl(var(--canalco-neutral-100))]">
                                      <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-600))] w-10" />
                                      <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-600))]">UCAP</th>
                                      <th className="px-3 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-600))] w-24">CANTIDAD</th>
                                      <th className="px-3 py-2 text-right font-semibold text-[hsl(var(--canalco-neutral-600))] w-36">V. UNITARIO</th>
                                      <th className="px-3 py-2 text-right font-semibold text-[hsl(var(--canalco-neutral-600))] w-36">V. TOTAL</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {wItems.length === 0 ? (
                                      <tr><td colSpan={5} className="px-4 py-6 text-center text-[hsl(var(--canalco-neutral-400))]">Sin UCAPsen este proyecto.</td></tr>
                                    ) : wItems.map((item, i) => (
                                      <tr key={item.key} className={`border-b border-[hsl(var(--canalco-neutral-100))] ${i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}`}>
                                        <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-400))] text-xs font-mono text-center">{i + 1}</td>
                                        <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-900))]">{item.descripcion || '—'}</td>
                                        <td className="px-3 py-2 text-center font-medium text-[hsl(var(--canalco-neutral-900))]">{item.cantidad}</td>
                                        <td className="px-3 py-2 text-right text-[hsl(var(--canalco-neutral-700))]">$ {item.vrUnitario.toLocaleString('es-CO')}</td>
                                        <td className="px-3 py-2 text-right font-medium text-[hsl(var(--canalco-neutral-900))]">{fmtCOP(item.cantidad * item.vrUnitario)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    {wMdo > 0 && (
                                      <tr className="border-t border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-50))]">
                                        <td colSpan={4} className="px-3 py-1.5 text-right text-sm text-[hsl(var(--canalco-neutral-600))]">Mano de Obra</td>
                                        <td className="px-3 py-1.5 text-right text-sm font-medium">{fmtCOP(wMdo)}</td>
                                      </tr>
                                    )}
                                    <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-neutral-100))]">
                                      <td colSpan={4} className="px-3 py-2 text-right font-bold text-[hsl(var(--canalco-neutral-700))] uppercase text-sm tracking-wide">Subtotal pesos base</td>
                                      <td className="px-3 py-2 text-right font-bold text-[hsl(var(--canalco-neutral-900))]">{fmtCOP(wUcapTotal + wMdo)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                                <div className="border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                                  <div className="flex items-center border-b border-[hsl(var(--canalco-neutral-200))]">
                                    <div className="flex-1 px-4 py-2"><span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase">{baseLabel}</span></div>
                                    <div className="px-4 py-2 border-l border-[hsl(var(--canalco-neutral-200))] w-36 text-right"><span className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">{baseVal > 0 ? baseVal.toFixed(2) : '—'}</span></div>
                                  </div>
                                  <div className="flex items-center border-b border-[hsl(var(--canalco-neutral-200))]">
                                    <div className="flex-1 px-4 py-2"><span className="text-sm font-semibold text-[hsl(var(--canalco-neutral-600))] uppercase">IPP del Mes</span></div>
                                    <div className="px-4 py-2 border-l border-[hsl(var(--canalco-neutral-200))] w-36 text-right"><span className="text-sm font-medium text-[hsl(var(--canalco-neutral-700))]">{currentVal > 0 ? currentVal.toFixed(2) : '—'}</span></div>
                                  </div>
                                  <div className="flex items-center">
                                    <div className="flex-1 px-4 py-3" />
                                    <div className="px-6 py-3 bg-[hsl(var(--canalco-primary))]/10 border-l border-[hsl(var(--canalco-neutral-200))] flex items-center gap-6 w-80">
                                      <span className="font-bold text-xs uppercase text-[hsl(var(--canalco-neutral-700))]">Subtotal con IPP</span>
                                      <span className="font-bold text-base text-[hsl(var(--canalco-primary))] ml-auto">{fmtCOP(wTotal)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            {block.tableId === 'detail' && works.length > 0 && (
                              <div className="bg-white rounded-lg border border-[hsl(var(--canalco-neutral-200))] overflow-hidden shadow-sm">
                                <div className="px-6 py-3 bg-[hsl(var(--canalco-primary))]/5 border-b border-[hsl(var(--canalco-neutral-200))]">
                                  <p className="font-bold text-sm uppercase tracking-wide text-[hsl(var(--canalco-neutral-900))]">Detalle por Proyecto</p>
                                </div>
                                <table className="w-full">
                                  <thead>
                                    <tr className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
                                      <th className="px-3 py-2.5 text-left font-semibold text-[hsl(var(--canalco-neutral-700))] w-8">#</th>
                                      <th className="px-3 py-2.5 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Obra</th>
                                      <th className="px-3 py-2.5 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Dirección</th>
                                      <th className="px-3 py-2.5 text-left font-semibold text-[hsl(var(--canalco-neutral-700))] w-28">Zona</th>
                                      <th className="px-3 py-2.5 text-right font-semibold text-[hsl(var(--canalco-neutral-700))] w-40">Presupuesto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {works.map((w, i) => {
                                      const raw = perWorkTotals.get(w.workId) ?? 0;
                                      const total = raw * factor;
                                      return (
                                        <tr key={w.workId} className={`border-b border-[hsl(var(--canalco-neutral-100))] ${i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}`}>
                                          <td className="px-3 py-2.5 text-center text-[hsl(var(--canalco-neutral-400))] text-xs font-mono">{i + 1}</td>
                                          <td className="px-3 py-2.5 font-medium text-[hsl(var(--canalco-neutral-900))]">{w.name}</td>
                                          <td className="px-3 py-2.5 text-[hsl(var(--canalco-neutral-600))]">{w.address || '—'}</td>
                                          <td className="px-3 py-2.5 text-[hsl(var(--canalco-neutral-600))]">{w.zone || '—'}</td>
                                          <td className="px-3 py-2.5 text-right font-medium text-[hsl(var(--canalco-neutral-900))]">{total > 0 ? fmtCOP(total) : '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t-2 border-[hsl(var(--canalco-neutral-300))] bg-[hsl(var(--canalco-neutral-100))]">
                                      <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-[hsl(var(--canalco-neutral-700))] uppercase text-xs tracking-wide">Total</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-[hsl(var(--canalco-primary))]">{fmtCOP(valorTotal)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // — bloque de cláusula —
                  return (
                    <div
                      key={block.id}
                      className={`relative ${isDragging ? 'opacity-30' : ''}`}
                      onDragOver={canEdit ? handleDragOver(block.id) : undefined}
                      onDrop={canEdit ? handleDrop(block.id) : undefined}
                    >
                      {isOver && <div className="h-0.5 bg-blue-500 mb-1 rounded" />}
                      <div className="mb-4 flex gap-1 items-start">
                        {canEdit && (
                          <div
                            draggable
                            onDragStart={handleDragStart(block.id)}
                            onDragEnd={handleDragEnd}
                            className="cursor-grab text-gray-300 hover:text-gray-500 print:hidden shrink-0 mt-1.5"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="text-justify">
                            <AutoResizeTextarea
                              value={block.title}
                              onChange={(e) => setBlocks((prev) => prev.map((b) => b.id === block.id && b.kind === 'clausula' ? { ...b, title: e.target.value } : b))}
                              className="w-full bg-transparent border-0 border-b border-dashed border-blue-200 resize-none focus:outline-none focus:border-blue-400 font-bold leading-[1.7] print:border-none"
                              style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                            />
                            <AutoResizeTextarea
                              value={block.content}
                              onChange={(e) => setBlocks((prev) => prev.map((b) => b.id === block.id && b.kind === 'clausula' ? { ...b, content: e.target.value } : b))}
                              className="w-full bg-transparent border-0 border-l-2 border-blue-200 pl-2 resize-none focus:outline-none focus:border-blue-400 text-justify leading-[1.7] print:border-l-0 print:pl-0 mt-1"
                              style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
                            />
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            className="shrink-0 text-red-400 hover:text-red-600 mt-1 print:hidden"
                            onClick={() => setBlocks((prev) => prev.filter((b) => b.id !== block.id))}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Tabla de garantías — se muestra tras la cláusula que tenga GARANTÍAS en el título */}
                      {block.title.toUpperCase().includes('GARANTÍAS') && (
                        <div className="mb-6 ml-2 text-[11pt]">
                          <p className="font-semibold mb-2" contentEditable={canEdit} suppressContentEditableWarning>I. GARANTÍA DE CUMPLIMIENTO DEL CONTRATO Y DEVOLUCIÓN DEL PAGO ANTICIPADO:</p>
                          <table className="w-full border-collapse text-[10.5pt]" style={{ borderColor: '#555' }}>
                            <tbody>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 w-[28%] align-top" contentEditable={canEdit} suppressContentEditableWarning>Asegurado/<br/>beneficiario</td>
                                <td className="border border-gray-500 px-2 py-1" colSpan={3}><EditableText>Municipio de </EditableText><InlineInput value={docFields.municipio} onChange={setDF('municipio')} /><EditableText> identificado con Nit. </EditableText><InlineInput value={docFields.municipioNit} onChange={setDF('municipioNit')} /></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-middle" rowSpan={3} contentEditable={canEdit} suppressContentEditableWarning>Amparos,<br/>vigencia y<br/>valores<br/>asegurados</td>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 text-center" contentEditable={canEdit} suppressContentEditableWarning>AMPARO</td>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 text-center" contentEditable={canEdit} suppressContentEditableWarning>% DE AMPARO</td>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 text-center" contentEditable={canEdit} suppressContentEditableWarning>VIGENCIA</td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 align-top" contentEditable={canEdit} suppressContentEditableWarning>CUMPLIMIENTO DEL CONTRATO.</td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>10% del valor total del acta de obra No. </EditableText><InlineInput value={docFields.actaNumero} onChange={setDF('actaNumero')} /><EditableText>, contados a</EditableText></td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>Por el plazo de ejecución del contrato y tres (3) meses más, contados a partir de la fecha de perfeccionamiento del acta de obra No. </EditableText><InlineInput value={docFields.actaReferenciaAnterior} onChange={setDF('actaReferenciaAnterior')} /><EditableText>.</EditableText></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 align-top" contentEditable={canEdit} suppressContentEditableWarning>PÓLIZA PARA GARANTIZAR EL BUEN MANEJO Y CORRECTA INVERSIÓN DEL ANTICIPO.</td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>100% del valor total del acta de obra No. </EditableText><InlineInput value={docFields.actaNumero} onChange={setDF('actaNumero')} /></td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>La vigencia de la garantía será establecida en el acta de obra </EditableText><InlineInput value={docFields.actaReferenciaAnterior} onChange={setDF('actaReferenciaAnterior')} /><EditableText>, de manera que siempre esté cubierto el anticipo otorgado o su valor reajustado, para la cual tendrá una vigencia por el plazo de ejecución de la presente acta.</EditableText></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Tomador</td>
                                <td className="border border-gray-500 px-2 py-1" colSpan={3}><InlineInput value={docFields.conEmpresa} onChange={setDF('conEmpresa')} /><EditableText>, identificada con Nit. </EditableText><InlineInput value={docFields.conNit} onChange={setDF('conNit')} /></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Información<br/>necesaria<br/>dentro de la<br/>póliza</td>
                                <td className="border border-gray-500 px-2 py-1" colSpan={3}>
                                  <ul className="list-disc list-inside space-y-0.5">
                                    <li><EditableText>Número y año del contrato</EditableText></li>
                                    <li><EditableText>Objeto del contrato</EditableText></li>
                                    <li><EditableText>Firma del Contratista</EditableText></li>
                                  </ul>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          <p className="font-semibold mt-5 mb-1" contentEditable={canEdit} suppressContentEditableWarning>II. GARANTÍA DE RESPONSABILIDAD CIVIL EXTRACONTRACTUAL:</p>
                          <p className="mb-2 text-justify" contentEditable={canEdit} suppressContentEditableWarning>El contratista deberá contratar un seguro que ampare la responsabilidad civil extracontractual de la empresa con las siguientes características:</p>
                          <table className="w-full border-collapse text-[10.5pt]">
                            <tbody>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 w-[28%] align-top" contentEditable={canEdit} suppressContentEditableWarning>Clase</td>
                                <td className="border border-gray-500 px-2 py-1 align-top" contentEditable={canEdit} suppressContentEditableWarning>Contrato de seguro contenido en una póliza</td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Asegurados</td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>Municipio de </EditableText><InlineInput value={docFields.municipio} onChange={setDF('municipio')} /><EditableText> identificado con Nit. </EditableText><InlineInput value={docFields.municipioNit} onChange={setDF('municipioNit')} /><EditableText> y terceros afectados y el Contratista.</EditableText></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Tomador</td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><InlineInput value={docFields.conEmpresa} onChange={setDF('conEmpresa')} /><EditableText>, identificada con Nit. </EditableText><InlineInput value={docFields.conNit} onChange={setDF('conNit')} /></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Valor</td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>No debe ser inferior a: Doscientos (200) SMMLV para contratos cuyo valor sea inferior o igual a mil quinientos (1.500) SMMLV. En razón a que el presupuesto oficial del presente contrato expresado en SMMLV asciende a la suma de </EditableText><InlineInput value={docFields.smmlvPresupuesto} onChange={setDF('smmlvPresupuesto')} /><EditableText> SMMLV.</EditableText></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Vigencia</td>
                                <td className="border border-gray-500 px-2 py-1 align-top" contentEditable={canEdit} suppressContentEditableWarning>Igual al período de ejecución del contrato y un mes más</td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Beneficiarios</td>
                                <td className="border border-gray-500 px-2 py-1 align-top"><EditableText>Municipio de </EditableText><InlineInput value={docFields.municipio} onChange={setDF('municipio')} /><EditableText> identificado con Nit. </EditableText><InlineInput value={docFields.municipioNit} onChange={setDF('municipioNit')} /><EditableText> y terceros afectados y el Contratista.</EditableText></td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Amparos</td>
                                <td className="border border-gray-500 px-2 py-1 align-top" contentEditable={canEdit} suppressContentEditableWarning>Responsabilidad Civil Extracontractual de la Entidad, derivada de las actuaciones, hechos u omisiones del Contratista o Subcontratistas autorizados. El seguro de responsabilidad civil extracontractual debe contener como mínimo los amparos descritos en el numeral 3° del artículo 2.2.1.2.3.2.9 del Decreto 1082 de 2015.</td>
                              </tr>
                              <tr>
                                <td className="border border-gray-500 px-2 py-1 font-semibold bg-gray-50 align-top" contentEditable={canEdit} suppressContentEditableWarning>Información<br/>necesaria<br/>dentro de la<br/>póliza</td>
                                <td className="border border-gray-500 px-2 py-1 align-top">
                                  <ul className="list-disc list-inside space-y-0.5">
                                    <li><EditableText>Número y año del contrato</EditableText></li>
                                    <li><EditableText>Objeto del contrato</EditableText></li>
                                    <li><EditableText>Firma del representante legal del Contratista</EditableText></li>
                                    <li><EditableText>En caso de no usar centavos, los valores deben aproximarse al mayor. Ej. Cumplimiento si el valor a asegurar es $14.980.420,20 aproximar a $14.980.421</EditableText></li>
                                  </ul>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          <p className="mt-3 text-justify" contentEditable={canEdit} suppressContentEditableWarning>En esta póliza solamente se podrán pactar deducibles con un tope máximo del diez por ciento (10%) del valor de cada pérdida sin que en ningún caso puedan ser superiores a dos mil (2.000) SMMLV.</p>
                          <p className="mt-2 text-justify" contentEditable={canEdit} suppressContentEditableWarning>Este seguro deberá constituirse y presentarse para aprobación de la empresa, dentro del mismo término establecido para la garantía única de cumplimiento.</p>
                          <p className="mt-2 text-justify" contentEditable={canEdit} suppressContentEditableWarning>Las franquicias, coaseguros obligatorios y demás formas de estipulación que conlleven asunción de parte de la pérdida por la empresa asegurada no serán admisibles.</p>
                          <p className="mt-2 text-justify" contentEditable={canEdit} suppressContentEditableWarning>El contratista deberá anexar el comprobante de pago de la prima del seguro de responsabilidad civil extracontractual.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {canEdit && (
                  <button
                    className="text-sm text-blue-600 hover:underline mt-2 print:hidden"
                    onClick={() => setBlocks((prev) => [...prev, { kind: 'clausula', id: `c-new-${Date.now()}`, title: 'CLÁUSULA', content: '' }])}
                  >
                    + Agregar cláusula
                  </button>
                )}

                {/* Firmas */}
                <div className="mt-16 text-[10.5pt]">
                  {/* Fila 1: Municipio + Concesionario */}
                  <div className="grid grid-cols-2 gap-16 mb-14">
                    {/* EL MUNICIPIO */}
                    <div>
                      <p className="font-bold mb-10">EL MUNICIPIO</p>
                      <div className="border-t border-black pt-1">
                        <p className="font-bold uppercase">{docFields.munNombre}</p>
                        <p>C.C. {docFields.munCc}</p>
                        <p>{docFields.munCargo}</p>
                        <p>Municipio de {docFields.municipio}</p>
                      </div>
                    </div>
                    {/* EL CONCESIONARIO */}
                    <div>
                      <p className="font-bold mb-10">EL CONCESIONARIO</p>
                      <div className="border-t border-black pt-1">
                        <p className="font-bold uppercase">{docFields.conNombre}</p>
                        <p>C.C. {docFields.conCc}</p>
                        <p>Representante Legal</p>
                        <p>{docFields.conEmpresa}</p>
                      </div>
                    </div>
                  </div>
                  {/* Fila 2: Interventor (solo izquierda) */}
                  <div className="grid grid-cols-2 gap-16">
                    <div>
                      <p className="font-bold mb-10">EL INTERVENTOR</p>
                      <div className="border-t border-black pt-1">
                        <p className="font-bold uppercase">{docFields.intNombre}</p>
                        <p>C.C. {docFields.intCc}</p>
                        <p>{docFields.intCargo || 'Representante Legal'}</p>
                        <p>{docFields.intEmpresa}</p>
                        <p>Interventor del Contrato de Concesión</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </EditContext.Provider>
            )}
          </div>

          </>
        )}
      </main>
    </div>
  );
}
