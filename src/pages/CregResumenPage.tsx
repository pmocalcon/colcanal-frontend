import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { cregService, UCAP_GRUPOS } from '@/services/creg.service';
import type { CregUnit } from '@/services/creg.service';
import { masterDataService } from '@/services/master-data.service';
import type { Company, Project } from '@/services/master-data.service';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertCircle, Table2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const EXCLUDED_COMPANY_NAMES = [
  'Inversiones Garcés Escalante',
  'Uniones y Alianzas',
  'Unión Temporal Alumbrado Público Jamundí',
];

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCOP = (n: number) => '$' + fmt(n);

export default function CregResumenPage() {
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [units, setUnits] = useState<CregUnit[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    masterDataService.getCompanies()
      .then((data) => {
        setCompanies(data.filter((c) => !EXCLUDED_COMPANY_NAMES.some((e) => c.name.includes(e))));
        setLoadingCompanies(false);
      })
      .catch(() => { setError('Error al cargar empresas'); setLoadingCompanies(false); });
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === selectedCompanyId);
  const isCanalesContactos = selectedCompany?.name === 'Canales & Contactos';

  useEffect(() => {
    if (!selectedCompanyId || !isCanalesContactos) { setProjects([]); setSelectedProjectId(null); return; }
    masterDataService.getProjects(selectedCompanyId)
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [selectedCompanyId, isCanalesContactos]);

  const loadUnits = useCallback((companyId: number, projectId: number | null) => {
    setLoadingUnits(true);
    setError(null);
    cregService.getUnits(companyId, projectId)
      .then((data) => { setUnits(data); setLoadingUnits(false); })
      .catch(() => { setError('Error al cargar el resumen'); setLoadingUnits(false); });
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) { setUnits([]); return; }
    if (isCanalesContactos && !selectedProjectId) { setUnits([]); return; }
    loadUnits(selectedCompanyId, selectedProjectId);
  }, [selectedCompanyId, selectedProjectId, isCanalesContactos, loadUnits]);

  // Totales por columna
  const col = (getter: (u: CregUnit) => number) => units.reduce((a, u) => a + getter(u), 0);
  const ready = selectedCompanyId && (!isCanalesContactos || selectedProjectId);
  const ippBase = units[0]?.ippBase ?? null;

  // UCAPs agrupadas por grupo, en el orden de la lista fija.
  const grupos = useMemo(() => {
    const order = new Map<string, number>();
    UCAP_GRUPOS.forEach((g, i) => order.set(g, i));
    const byGroup = new Map<string, CregUnit[]>();
    for (const u of units) {
      const key = u.grupo?.trim() || 'Sin grupo';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(u);
    }
    const rank = (k: string) => (order.has(k) ? order.get(k)! : k === 'Sin grupo' ? 9999 : 5000);
    return [...byGroup.keys()]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((grupo) => ({ grupo, items: byGroup.get(grupo)! }));
  }, [units]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--canalco-neutral-100))] to-white">
      <header className="bg-white border-b border-[hsl(var(--canalco-neutral-300))] shadow-sm sticky top-0 z-10">
        <div className="max-w-[95rem] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-white rounded-xl shadow-md p-3 w-16 h-16 flex items-center justify-center border-2 border-[hsl(var(--canalco-primary))] flex-shrink-0">
            <img src="/assets/images/logo-canalco.png" alt="Canales Contactos" className="w-full h-full object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/creg')} className="hover:bg-[hsl(var(--canalco-neutral-200))]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[hsl(var(--canalco-neutral-900))] flex items-center gap-2">
              <Table2 className="w-6 h-6 text-[hsl(var(--canalco-primary))]" /> Resumen UCAP
            </h1>
            <p className="text-xs md:text-sm text-[hsl(var(--canalco-neutral-600))]">
              Desglose de costos y precio actualizado por UCAP
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[95rem] mx-auto px-6 py-8 space-y-6">
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

        {ready && (
          <div className="bg-white rounded-lg shadow-md border border-[hsl(var(--canalco-neutral-300))] overflow-hidden">
            <div className="p-4 border-b border-[hsl(var(--canalco-neutral-200))] flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[hsl(var(--canalco-neutral-900))]">
                  Resumen UCAP — {selectedCompany?.name}
                </h2>
                <p className="text-xs text-[hsl(var(--canalco-neutral-600))]">
                  {units.length} {units.length === 1 ? 'UCAP' : 'UCAPs'} con hoja de costos
                  {ippBase != null && <> · IPP base {(ippBase)}</>}
                </p>
              </div>
            </div>

            {loadingUnits ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-[hsl(var(--canalco-primary))]" /></div>
            ) : units.length === 0 ? (
              <div className="py-16 text-center text-[hsl(var(--canalco-neutral-600))]">
                No hay UCAPs con hoja de costos definida para este municipio.
              </div>
            ) : (
              <div className="overflow-auto max-h-[70vh]">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="sticky top-0 z-10 [&_th]:bg-[hsl(var(--canalco-neutral-100))]">
                    <tr className="bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-neutral-700))]">
                      <Th className="text-left sticky left-0 bg-[hsl(var(--canalco-neutral-100))]">Código</Th>
                      <Th className="text-left sticky left-[70px] bg-[hsl(var(--canalco-neutral-100))]">UCAP</Th>
                      <Th className="text-center">Unidad</Th>
                      <Th>Costo suministro</Th>
                      <Th>Costo transporte</Th>
                      <Th>Costo obra civil</Th>
                      <Th>Costo montaje</Th>
                      <Th>Costo transporte (%)</Th>
                      <Th>Costo ingeniería</Th>
                      <Th>Costo administración</Th>
                      <Th>Costo inspectores</Th>
                      <Th>Costo interventoría</Th>
                      <Th>Costos RETIE y RETILAP</Th>
                      <Th>Costo financieros</Th>
                      <Th>Costos ambientales</Th>
                      <Th className="bg-[hsl(var(--canalco-neutral-200))]">Total</Th>
                      <Th className="bg-[hsl(var(--canalco-primary))]/20">Precio actualizado</Th>
                      <Th>Potencia nominal (W)</Th>
                      <Th>Potencia pérdidas (W)</Th>
                      <Th>Potencia con pérdidas (W)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => {
                      // Subtotal del grupo, encabezando su bloque (como en la Liquidación).
                      const sub = (getter: (u: CregUnit) => number) =>
                        g.items.reduce((a, u) => a + getter(u), 0);
                      return (
                    <Fragment key={g.grupo}>
                      <tr className="bg-[hsl(var(--canalco-neutral-200))] font-semibold text-[hsl(var(--canalco-neutral-800))] border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                        <Td className="text-left uppercase text-[11px] tracking-wide sticky left-0 bg-[hsl(var(--canalco-neutral-200))]" colSpan={3}>
                          {g.grupo} <span className="font-normal normal-case text-[hsl(var(--canalco-neutral-600))]">({g.items.length})</span>
                        </Td>
                        <Td>{fmt(sub((u) => u.totals.subtotalMaterials))}</Td>
                        <Td>{fmt(sub((u) => u.totals.subtotalTransporte))}</Td>
                        <Td>{fmt(sub((u) => u.totals.subtotalObraCivil))}</Td>
                        <Td>{fmt(sub((u) => u.totals.subtotalMontaje))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.transport))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.engineering))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.administration))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.inspection))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.interventoria))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.retieRetilap))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.financial))}</Td>
                        <Td>{fmt(sub((u) => u.totals.indirect.environmental))}</Td>
                        <Td className="bg-[hsl(var(--canalco-neutral-300))]/60">{fmt(sub((u) => u.totals.totalUnit))}</Td>
                        <Td className="text-[hsl(var(--canalco-primary))] bg-[hsl(var(--canalco-primary))]/10">{fmtCOP(sub((u) => u.totals.finalValue))}</Td>
                        {/* La potencia no se suma: no tiene sentido agregarla por grupo. */}
                        <Td />
                        <Td />
                        <Td />
                      </tr>
                      {g.items.map((u, i) => (
                      <tr key={u.ucapId} className={i % 2 ? 'bg-[hsl(var(--canalco-neutral-50))]' : 'bg-white'}>
                        <Td className="text-left font-mono sticky left-0 bg-inherit">{u.code}</Td>
                        <Td className="text-left sticky left-[70px] bg-inherit font-medium">{u.name}</Td>
                        <Td className="text-center text-[hsl(var(--canalco-neutral-500))]">UN</Td>
                        <Td>{fmt(u.totals.subtotalMaterials)}</Td>
                        <Td>{fmt(u.totals.subtotalTransporte)}</Td>
                        <Td>{fmt(u.totals.subtotalObraCivil)}</Td>
                        <Td>{fmt(u.totals.subtotalMontaje)}</Td>
                        <Td>{fmt(u.totals.indirect.transport)}</Td>
                        <Td>{fmt(u.totals.indirect.engineering)}</Td>
                        <Td>{fmt(u.totals.indirect.administration)}</Td>
                        <Td>{fmt(u.totals.indirect.inspection)}</Td>
                        <Td>{fmt(u.totals.indirect.interventoria)}</Td>
                        <Td>{fmt(u.totals.indirect.retieRetilap)}</Td>
                        <Td>{fmt(u.totals.indirect.financial)}</Td>
                        <Td>{fmt(u.totals.indirect.environmental)}</Td>
                        <Td className="font-semibold bg-[hsl(var(--canalco-neutral-100))]">{fmt(u.totals.totalUnit)}</Td>
                        <Td className="font-bold text-[hsl(var(--canalco-primary))] bg-[hsl(var(--canalco-primary))]/5">{fmtCOP(u.totals.finalValue)}</Td>
                        <Td>{u.powerNominal != null ? fmt(u.powerNominal) : ''}</Td>
                        <Td>{u.powerLosses != null ? fmt(u.powerLosses) : ''}</Td>
                        <Td className="font-medium">{u.powerWithLosses != null ? fmt(u.powerWithLosses) : ''}</Td>
                      </tr>
                      ))}
                    </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[hsl(var(--canalco-neutral-200))] font-semibold border-t-2 border-[hsl(var(--canalco-neutral-300))]">
                      <Td className="text-left sticky left-0 bg-[hsl(var(--canalco-neutral-200))]" colSpan={3}>Totales</Td>
                      <Td>{fmt(col((u) => u.totals.subtotalMaterials))}</Td>
                      <Td>{fmt(col((u) => u.totals.subtotalTransporte))}</Td>
                      <Td>{fmt(col((u) => u.totals.subtotalObraCivil))}</Td>
                      <Td>{fmt(col((u) => u.totals.subtotalMontaje))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.transport))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.engineering))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.administration))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.inspection))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.interventoria))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.retieRetilap))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.financial))}</Td>
                      <Td>{fmt(col((u) => u.totals.indirect.environmental))}</Td>
                      <Td>{fmt(col((u) => u.totals.totalUnit))}</Td>
                      <Td className="text-[hsl(var(--canalco-primary))]">{fmtCOP(col((u) => u.totals.finalValue))}</Td>
                      <Td />
                      <Td />
                      <Td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {!ready && !loadingCompanies && (
          <div className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
            <p className="text-lg font-medium">
              {isCanalesContactos ? 'Selecciona un proyecto de Canales & Contactos' : 'Selecciona una empresa para ver el resumen'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-semibold text-right border-b border-[hsl(var(--canalco-neutral-300))] ${className}`}>{children}</th>;
}
function Td({ children, className = '', colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-3 py-1.5 text-right tabular-nums border-b border-[hsl(var(--canalco-neutral-100))] ${className}`}>{children}</td>;
}
