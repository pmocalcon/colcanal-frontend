import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cregService } from '@/services/creg.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, Zap, Save, SlidersHorizontal, AlertCircle,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

type FieldType = 'text' | 'percent' | 'money' | 'number' | 'select' | 'month';
interface FieldDef { key: string; label: string; type: FieldType; options?: string[]; }
interface SectionDef { title: string; fields: FieldDef[]; }

// ============ Esquema de la hoja de parametrización ============

const SECTIONS: SectionDef[] = [
  {
    title: 'General',
    fields: [
      { key: 'resolucionVigente', label: 'Resolución vigente', type: 'select', options: ['123-11', '101-103'] },
      { key: 'municipioContratante', label: 'Municipio contratante', type: 'text' },
      { key: 'contratista', label: 'Contratista', type: 'text' },
      { key: 'fecha', label: 'Fecha', type: 'text' },
      // Rango del censo físico: define los meses de esa matriz.
      { key: 'fechaInicio', label: 'Fecha inicio', type: 'month' },
      { key: 'fechaFinal', label: 'Fecha final', type: 'month' },
    ],
  },
  {
    title: 'Parámetros generales',
    fields: [
      { key: 'iva', label: 'IVA', type: 'percent' },
      { key: 'pctPropuesto', label: '% Propuesto', type: 'percent' },
      { key: 'faomOficial', label: 'FAOM Oficial', type: 'percent' },
      { key: 'faomPropuesto', label: 'FAOM Propuesto', type: 'percent' },
      { key: 'waccOficial', label: 'WACC Oficial', type: 'percent' },
      { key: 'waccPropuesto', label: 'WACC Propuesto', type: 'percent' },
      { key: 'ne', label: 'NE', type: 'percent' },
      { key: 'costoSiapLuminaria', label: 'Costo SIAP / luminaria', type: 'money' },
      { key: 'costoTransporteElementos', label: 'Costos de transporte a municipio de los elementos', type: 'percent' },
      { key: 'costoIngenieria', label: 'Costo ingeniería', type: 'percent' },
      { key: 'costoAdministracion', label: 'Costo administración', type: 'percent' },
      { key: 'costoInspectores', label: 'Costo inspectores de obra', type: 'percent' },
      { key: 'costoInterventoria', label: 'Costo interventoría', type: 'percent' },
      { key: 'costoRetieRetilap', label: 'Costos RETIE y RETILAP', type: 'percent' },
      { key: 'costosFinancieros', label: 'Costos financieros', type: 'percent' },
      { key: 'costosAmbientalesDisposicion', label: 'Costos ambientales de disposición', type: 'percent' },
      { key: 'costoTransporte', label: 'Costo transporte', type: 'percent' },
      { key: 'tasaCrecimientoAnual', label: 'Tasa crecimiento anual', type: 'percent' },
      { key: 'tasaCrecimientoMensual', label: 'Tasa crecimiento mensual', type: 'percent' },
      { key: 'ippAnual', label: 'IPP anual', type: 'percent' },
      { key: 'ipcAnual', label: 'IPC anual', type: 'percent' },
      { key: 'ippMensual', label: 'IPP mensual', type: 'percent' },
      { key: 'interventoriaMunicipio', label: 'Interventoría municipio', type: 'text' },
      { key: 'costoFiduciariaSmmlv', label: 'Costo fiduciaria SMMLV', type: 'number' },
      { key: 'costosAmbientalesAnual', label: 'Costos ambientales anual', type: 'percent' },
      { key: 'costosAmbientalesMensual', label: 'Costos ambientales mensual', type: 'percent' },
      { key: 'expansionVegetativa2a7', label: 'Expansión vegetativa 2 a 7 años', type: 'percent' },
      { key: 'expansionVegetativa8a11', label: 'Expansión vegetativa 8 a 11 años', type: 'percent' },
      { key: 'expansionVegetativa12a20', label: 'Expansión vegetativa 12 a 20 años', type: 'percent' },
      { key: 'expansionNavidad', label: 'Expansión navidad', type: 'percent' },
      { key: 'eficienciaLuminarias', label: 'Eficiencia de las luminarias [Lm/W]', type: 'number' },
      { key: 'utv', label: 'UVT', type: 'money' },
      { key: 'valorKwh', label: 'Valor KWh', type: 'money' },
      { key: 'ippoNov2015', label: 'IPPo nov 2015', type: 'number' },
      { key: 'ippFinal', label: 'IPP final', type: 'number' },
    ],
  },
  {
    title: 'Impuestos',
    fields: [
      { key: 'retefuenteDeclarante6', label: 'Retefuente persona natural o jurídica declarante', type: 'percent' },
      { key: 'retefuenteDeclarante10', label: 'Retefuente persona natural o jurídica declarante', type: 'percent' },
      { key: 'reteiva', label: 'Reteiva', type: 'percent' },
      { key: 'estampillaAdultoMayor', label: 'Estampilla adulto mayor', type: 'percent' },
      { key: 'estampillaProCultura', label: 'Estampilla pro cultura', type: 'percent' },
      { key: 'retefuente', label: 'Retefuente', type: 'percent' },
      { key: 'reteica', label: 'Reteica (8 x 1000)', type: 'text' },
      { key: 'seguridad', label: 'Seguridad', type: 'percent' },
    ],
  },
  {
    title: 'Vida útil (años)',
    fields: [
      { key: 'vuLuminariaLed', label: 'Luminaria para fuente de LED', type: 'number' },
      { key: 'vuFotocontrol', label: 'Fotocontrol', type: 'number' },
      { key: 'vuElementosSoporte', label: 'Elementos de soporte', type: 'number' },
      { key: 'vuBombillas', label: 'Bombillas', type: 'number' },
      { key: 'vuPostes', label: 'Postes', type: 'number' },
      { key: 'vuRedes', label: 'Redes', type: 'number' },
      { key: 'vuCanalizaciones', label: 'Canalizaciones', type: 'number' },
      { key: 'vuTransformadores', label: 'Transformadores', type: 'number' },
      { key: 'vuMedidores', label: 'Medidores', type: 'number' },
      { key: 'vuPuestaTierra', label: 'Puesta a tierra', type: 'number' },
      { key: 'vuTelegestion', label: 'Sistema de telegestión', type: 'number' },
    ],
  },
];

// Valores por defecto (los mismos de la hoja Excel de referencia).
const DEFAULT_VALUES: Record<string, any> = {
  resolucionVigente: '123-11',
  iva: 19, pctPropuesto: 99.6, faomOficial: 10.3, faomPropuesto: 10.3,
  waccOficial: 12.09, waccPropuesto: 11.3, ne: 4.1, costoSiapLuminaria: 450,
  costoTransporteElementos: 3, costoIngenieria: 4, costoAdministracion: 16,
  costoInspectores: 2, costoInterventoria: 0, costoRetieRetilap: 0,
  costosFinancieros: 5, costosAmbientalesDisposicion: 0, costoTransporte: 3, tasaCrecimientoAnual: 2,
  tasaCrecimientoMensual: 0.17, ippAnual: 4, ipcAnual: 6, ippMensual: 0.33,
  interventoriaMunicipio: '11 SMLMV + IVA', costoFiduciariaSmmlv: 2.5,
  costosAmbientalesAnual: 5, costosAmbientalesMensual: 0.41,
  expansionVegetativa2a7: 10, expansionVegetativa8a11: 10, expansionVegetativa12a20: 10,
  expansionNavidad: 30, eficienciaLuminarias: 165, utv: 38004, valorKwh: 631.4822,
  ippoNov2015: 107.59,
  retefuenteDeclarante6: 6, retefuenteDeclarante10: 10, reteiva: 4, reteica: '8 X 1000',
  vuLuminariaLed: 15, vuFotocontrol: 15, vuElementosSoporte: 30, vuBombillas: 3.5,
  vuPostes: 30, vuRedes: 30, vuCanalizaciones: 30, vuTransformadores: 20,
  vuMedidores: 10, vuPuestaTierra: 30, vuTelegestion: 10,
};

// ============ Tabla FAOML / FAOMn por año ============

interface FaomRow { year: number; faomlA: number; faomlB: number; faomnA: number; faomnB: number; }

// FAOML 101-013 varía por año; las columnas "123" son constantes (0.103) y
// FAOMn 101-013 pasa a 0.04 desde 2021.
const FAOML_A_BY_YEAR: Record<number, number> = {
  2021: 0.093, 2022: 0.097, 2023: 0.092, 2024: 0.086, 2025: 0.08, 2026: 0.069, 2027: 0.069,
};
function defaultFaomRows(): FaomRow[] {
  const rows: FaomRow[] = [];
  for (let year = 2010; year <= 2058; year++) {
    const faomlA = year <= 2020 ? 0.103 : (FAOML_A_BY_YEAR[year] ?? 0.063);
    const faomnA = year <= 2020 ? 0.103 : 0.04;
    rows.push({ year, faomlA, faomlB: 0.103, faomnA, faomnB: 0.103 });
  }
  return rows;
}

function buildDefaultData(): Record<string, any> {
  return { ...DEFAULT_VALUES, faomRows: defaultFaomRows() };
}

const fmtNum = (n: any) =>
  n === '' || n == null ? '' : Number(n);

export default function CregParametrosPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [data, setData] = useState<Record<string, any>>({});
  const [faomRows, setFaomRows] = useState<FaomRow[]>(defaultFaomRows());

  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    masterDataService.getCompanies()
      .then((res) => {
        setCompanies(res.filter((c) => !EXCLUDED_COMPANY_NAMES.some((e) => c.name.includes(e))));
        setLoadingCompanies(false);
      })
      .catch(() => { setError('Error al cargar empresas'); setLoadingCompanies(false); });
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);
  const isCanalesContactos = selectedCompany?.name === 'Canales & Contactos';

  // Nombre del municipio elegido (proyecto en Canales, si no la empresa).
  const municipioName = isCanalesContactos
    ? (projects.find((p) => p.projectId === selectedProjectId)?.name ?? '')
    : (selectedCompany?.name ?? '');

  useEffect(() => {
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((res) => setProjects(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const load = useCallback((companyId: number, projectId: number | null) => {
    setLoading(true);
    setError(null);
    cregService.getParametrizacion(companyId, projectId)
      .then((res) => {
        if (res.data) {
          // Hay datos guardados para este municipio: mostrarlos.
          const { faomRows: savedRows, ...scalar } = res.data;
          setData(scalar);
          setFaomRows(Array.isArray(savedRows) && savedRows.length ? savedRows : defaultFaomRows());
        } else {
          // Sin datos guardados: campos vacíos (la tabla FAOM mantiene los factores base).
          setData({});
          setFaomRows(defaultFaomRows());
        }
        setLoading(false);
      })
      .catch(() => { setError('Error al cargar la parametrización'); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (isCanalesContactos && !selectedProjectId) return;
    load(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, load]);

  const loadDefaults = () => {
    const { faomRows: rows, ...scalar } = buildDefaultData();
    setData(scalar);
    setFaomRows(rows);
    toast.info('Valores por defecto cargados (recuerda guardar)');
  };

  const setField = (key: string, value: any) => setData((d) => ({ ...d, [key]: value }));
  const setFaom = (idx: number, key: keyof FaomRow, value: number) =>
    setFaomRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      await cregService.saveParametrizacion(
        selectedCompanyId,
        { ...data, contratista: municipioName, faomRows },
        selectedProjectId,
      );
      toast.success('Parametrización guardada');
    } catch {
      toast.error('Error al guardar la parametrización');
    } finally {
      setSaving(false);
    }
  };

  const ready = selectedCompanyId && (!isCanalesContactos || selectedProjectId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <SlidersHorizontal className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Parámetros CREG
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Hoja de parametrización por municipio (Res. CREG 123 de 2011)
            </p>
          </div>
          {ready && (
            <Button onClick={handleSave} disabled={saving || loading}
              className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(var(--canalco-neutral-300))] p-5">
          {loadingCompanies ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--canalco-neutral-600))]">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando empresas...
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Municipio / empresa</label>
                <Select value={selectedCompanyId ? String(selectedCompanyId) : ''}
                  onValueChange={(val) => { setSelectedCompanyId(Number(val)); setSelectedProjectId(null); }}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="— Selecciona una empresa —" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.companyId} value={String(c.companyId)}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {isCanalesContactos && (
                <div>
                  <label className="block text-sm font-semibold text-[hsl(var(--canalco-neutral-700))] mb-2">Proyecto <span className="text-red-500">*</span></label>
                  <Select value={selectedProjectId ? String(selectedProjectId) : ''} onValueChange={(val) => setSelectedProjectId(Number(val))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Selecciona un proyecto —" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (<SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {!ready && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">
              {selectedCompanyId && isCanalesContactos
                ? 'Selecciona un proyecto de Canales & Contactos'
                : 'Selecciona una empresa para ver / editar sus parámetros'}
            </p>
          </div>
        )}

        {ready && loading && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
        )}

        {ready && !loading && (
          <>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={loadDefaults} className="gap-2">
                <SlidersHorizontal className="w-4 h-4" /> Cargar valores por defecto
              </Button>
            </div>

            {/* Secciones de parámetros */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-1 space-y-6">
                <ParamCard section={SECTIONS[0]} data={data} setField={setField} municipioName={municipioName} />
                <ParamCard section={SECTIONS[2]} data={data} setField={setField} />
                <ParamCard section={SECTIONS[3]} data={data} setField={setField} />
              </div>
              <div className="lg:col-span-2">
                <ParamCard section={SECTIONS[1]} data={data} setField={setField} twoCols />
              </div>
            </div>

            {/* Tabla FAOML / FAOMn */}
            <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
              <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))]">
                <h2 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">Factores FAOML / FAOMn por año</h2>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">Res. CRE 101-013 y 123 (2010 – 2058)</p>
              </div>
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[hsl(var(--canalco-neutral-100))] z-10">
                    <tr>
                      <th rowSpan={2} className="px-3 py-2 text-left font-semibold border-b border-r border-[hsl(var(--canalco-neutral-200))]">Año (CRE)</th>
                      <th colSpan={2} className="px-3 py-1.5 text-center font-semibold border-b border-r border-[hsl(var(--canalco-neutral-200))]">FAOML</th>
                      <th colSpan={2} className="px-3 py-1.5 text-center font-semibold border-b border-[hsl(var(--canalco-neutral-200))]">FAOMn</th>
                    </tr>
                    <tr>
                      <th className="px-3 py-1.5 text-center font-medium border-b border-[hsl(var(--canalco-neutral-200))]">101-013</th>
                      <th className="px-3 py-1.5 text-center font-medium border-b border-r border-[hsl(var(--canalco-neutral-200))]">123</th>
                      <th className="px-3 py-1.5 text-center font-medium border-b border-[hsl(var(--canalco-neutral-200))]">101-013</th>
                      <th className="px-3 py-1.5 text-center font-medium border-b border-[hsl(var(--canalco-neutral-200))]">123</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faomRows.map((row, idx) => (
                      <tr key={row.year} className="hover:bg-[hsl(var(--canalco-neutral-50))]">
                        <td className="px-3 py-1 font-medium border-r border-[hsl(var(--canalco-neutral-100))]">{row.year}</td>
                        <FaomCell value={row.faomlA} onChange={(v) => setFaom(idx, 'faomlA', v)} />
                        <FaomCell value={row.faomlB} onChange={(v) => setFaom(idx, 'faomlB', v)} border />
                        <FaomCell value={row.faomnA} onChange={(v) => setFaom(idx, 'faomnA', v)} />
                        <FaomCell value={row.faomnB} onChange={(v) => setFaom(idx, 'faomnB', v)} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}
                className="bg-[hsl(var(--canalco-primary))] hover:bg-[hsl(var(--canalco-primary))]/90 text-white gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar parametrización
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ParamCard({
  section, data, setField, twoCols, municipioName,
}: {
  section: SectionDef; data: Record<string, any>; setField: (k: string, v: any) => void;
  twoCols?: boolean; municipioName?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
      <div className="px-4 py-3 border-b border-[hsl(var(--canalco-neutral-200))] bg-[hsl(var(--canalco-neutral-100))]">
        <h3 className="text-sm font-semibold text-[hsl(var(--canalco-neutral-900))]">{section.title}</h3>
      </div>
      <div className={`p-4 grid gap-3 ${twoCols ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {section.fields.map((f) => {
          // El contratista se toma del nombre de la empresa/unión elegida (no editable).
          const isContratista = f.key === 'contratista';
          return (
            <ParamField
              key={f.key}
              field={f}
              value={isContratista ? (municipioName ?? '') : data[f.key]}
              onChange={(v) => setField(f.key, v)}
              disabled={isContratista}
            />
          );
        })}
      </div>
    </div>
  );
}

function ParamField({ field, value, onChange, disabled }: {
  field: FieldDef; value: any; onChange: (v: any) => void; disabled?: boolean;
}) {
  const isMonth = field.type === 'month';
  // El mes se guarda como string 'YYYY-MM', igual que el texto.
  const isText = field.type === 'text' || isMonth;
  const suffix = field.type === 'percent' ? '%' : field.type === 'money' ? '$' : '';

  if (field.type === 'select') {
    return (
      <div>
        <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">{field.label}</label>
        <Select value={value ? String(value) : ''} disabled={disabled} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Selecciona —" /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[hsl(var(--canalco-neutral-700))] mb-1">{field.label}</label>
      <div className="relative">
        {field.type === 'money' && (
          <span className="absolute left-2.5 top-2 text-sm text-[hsl(var(--canalco-neutral-500))]">$</span>
        )}
        <Input
          type={isMonth ? 'month' : isText ? 'text' : 'number'}
          step={isText ? undefined : 'any'}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(isText ? e.target.value : (e.target.value === '' ? '' : parseFloat(e.target.value)))}
          className={`h-9 text-sm ${disabled ? 'bg-[hsl(var(--canalco-neutral-100))]' : ''} ${field.type === 'money' ? 'pl-6' : ''} ${field.type === 'percent' ? 'pr-7' : ''}`}
        />
        {field.type === 'percent' && (
          <span className="absolute right-2.5 top-2 text-sm text-[hsl(var(--canalco-neutral-500))]">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function FaomCell({ value, onChange, border }: { value: number; onChange: (v: number) => void; border?: boolean }) {
  return (
    <td className={`px-1 py-0.5 ${border ? 'border-r border-[hsl(var(--canalco-neutral-100))]' : ''}`}>
      <Input
        type="number"
        step="any"
        value={fmtNum(value)}
        onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
        className="h-7 text-xs text-center px-1"
      />
    </td>
  );
}
