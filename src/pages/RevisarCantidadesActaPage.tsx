import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { surveysService, type Work } from '@/services/surveys.service';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const TRAVEL_EXPENSE_LABELS: Record<string, string> = {
  tolls: 'Peajes',
  parking: 'Parqueadero',
  lodging: 'Hospedaje',
  food: 'Alimentación',
  additional_crew: 'Cuadrilla Adicional',
  day_hours: 'Horas Diurnas',
  holiday_overtime: 'Horas Festivas/Nocturnas',
};

interface MaterialRow {
  materialId: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  observaciones: string;
}

interface UcapRow {
  ucapId: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
}

interface TravelRow {
  expenseType: string;
  label: string;
  cantidad: number;
  observaciones: string;
}

interface ProjectData {
  work: Work;
  ucapRows: UcapRow[];
  materialRows: MaterialRow[];
  travelRows: TravelRow[];
}

function UcapTable({ rows }: { rows: UcapRow[] }) {
  if (rows.length === 0) return (
    <p className="text-xs text-[hsl(var(--canalco-neutral-500))] italic">Sin UCAPs registradas.</p>
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Código</th>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Descripción</th>
            <th className="px-3 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.ucapId} className={i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}>
              <td className="px-3 py-2 font-mono text-xs text-[hsl(var(--canalco-primary))]">{row.codigo}</td>
              <td className="px-3 py-2">{row.descripcion}</td>
              <td className="px-3 py-2 text-center font-medium">{row.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialTable({ rows }: { rows: MaterialRow[] }) {
  if (rows.length === 0) return (
    <p className="text-xs text-[hsl(var(--canalco-neutral-500))] italic">Sin materiales registrados.</p>
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Código</th>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Descripción</th>
            <th className="px-3 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidad</th>
            <th className="px-3 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Unidad</th>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.materialId} className={i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}>
              <td className="px-3 py-2 font-mono text-xs text-[hsl(var(--canalco-neutral-600))]">{row.codigo}</td>
              <td className="px-3 py-2">{row.descripcion}</td>
              <td className="px-3 py-2 text-center font-medium">{row.cantidad}</td>
              <td className="px-3 py-2 text-center text-[hsl(var(--canalco-neutral-600))]">{row.unidad}</td>
              <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-600))]">{row.observaciones || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TravelTable({ rows }: { rows: TravelRow[] }) {
  if (rows.length === 0) return (
    <p className="text-xs text-[hsl(var(--canalco-neutral-500))] italic">Sin gastos de viaje registrados.</p>
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Tipo</th>
            <th className="px-3 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidad</th>
            <th className="px-3 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.expenseType} className={i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}>
              <td className="px-3 py-2 font-medium">{row.label}</td>
              <td className="px-3 py-2 text-center">{row.cantidad}</td>
              <td className="px-3 py-2 text-[hsl(var(--canalco-neutral-600))]">{row.observaciones || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectCard({ data }: { data: ProjectData }) {
  const [expanded, setExpanded] = useState(true);
  const { work, ucapRows, materialRows, travelRows } = data;
  const hasData = ucapRows.length > 0 || materialRows.length > 0 || travelRows.length > 0;

  return (
    <div className="rounded-xl border border-[hsl(var(--canalco-neutral-200))] bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[hsl(var(--canalco-neutral-50))] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[hsl(var(--canalco-neutral-500))]">{work.workCode}</span>
            {!hasData && (
              <span className="text-xs bg-[hsl(var(--canalco-neutral-100))] text-[hsl(var(--canalco-neutral-500))] px-2 py-0.5 rounded-full">
                Sin datos
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-[hsl(var(--canalco-neutral-800))] truncate mt-0.5">
            {work.name}
          </p>
          {work.address && (
            <p className="text-xs text-[hsl(var(--canalco-neutral-500))] truncate">{work.address}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-[hsl(var(--canalco-neutral-500))]">
          {ucapRows.length > 0 && (
            <span className="bg-[hsl(var(--canalco-primary))]/10 text-[hsl(var(--canalco-primary))] px-2 py-0.5 rounded-full font-medium">
              {ucapRows.length} UCAP{ucapRows.length !== 1 ? 's' : ''}
            </span>
          )}
          {materialRows.length > 0 && (
            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
              {materialRows.length} mat.
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-[hsl(var(--canalco-neutral-100))] pt-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-2">UCAPs</h3>
            <UcapTable rows={ucapRows} />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-2">Materiales</h3>
            <MaterialTable rows={materialRows} />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--canalco-neutral-500))] mb-2">Gastos de Viaje</h3>
            <TravelTable rows={travelRows} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function RevisarCantidadesActaPage() {
  const { recordNumber } = useParams<{ recordNumber: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const works: Work[] = (location.state as any)?.works ?? [];

  const [loading, setLoading] = useState(false);
  const [projectData, setProjectData] = useState<ProjectData[]>([]);
  const [activeTab, setActiveTab] = useState<'consolidado' | 'por-proyecto'>('consolidado');

  const decodedRecord = recordNumber ? decodeURIComponent(recordNumber) : '';

  useEffect(() => {
    if (works.length === 0) return;
    const load = async () => {
      setLoading(true);
      try {
        const allSurveyLists = await Promise.all(
          works.map((w) => surveysService.getSurveys({ workId: w.workId, limit: 100 }))
        );

        const results: ProjectData[] = await Promise.all(
          works.map(async (work, wi) => {
            const surveyIds = (allSurveyLists[wi].data ?? []).map((s) => s.surveyId);
            if (surveyIds.length === 0) {
              return { work, ucapRows: [], materialRows: [], travelRows: [] };
            }

            const fullSurveys = await Promise.all(
              surveyIds.map((id) => surveysService.getSurveyById(id))
            );

            const materialMap = new Map<number, MaterialRow>();
            for (const survey of fullSurveys) {
              for (const item of survey.materialItems ?? []) {
                const qty = Number(item.quantity) || 0;
                const existing = materialMap.get(item.materialId);
                if (existing) {
                  existing.cantidad += qty;
                  if (item.observations && !existing.observaciones.includes(item.observations)) {
                    existing.observaciones = existing.observaciones
                      ? `${existing.observaciones}; ${item.observations}`
                      : item.observations;
                  }
                } else {
                  materialMap.set(item.materialId, {
                    materialId: item.materialId,
                    codigo: item.material?.code ?? '',
                    descripcion: item.material?.description ?? '',
                    cantidad: qty,
                    unidad: item.unitOfMeasure,
                    observaciones: item.observations ?? '',
                  });
                }
              }
            }

            const ucapMap = new Map<number, UcapRow>();
            for (const survey of fullSurveys) {
              for (const item of survey.budgetItems ?? []) {
                const qty = Number(item.quantity) || 0;
                const existing = ucapMap.get(item.ucapId);
                if (existing) {
                  existing.cantidad += qty;
                } else {
                  ucapMap.set(item.ucapId, {
                    ucapId: item.ucapId,
                    codigo: item.ucap?.code ?? '',
                    descripcion: item.ucap?.description ?? '',
                    cantidad: qty,
                  });
                }
              }
            }

            const travelMap = new Map<string, TravelRow>();
            for (const survey of fullSurveys) {
              for (const item of survey.travelExpenses ?? []) {
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) continue;
                const existing = travelMap.get(item.expenseType);
                if (existing) {
                  existing.cantidad += qty;
                  if (item.observations && !existing.observaciones.includes(item.observations)) {
                    existing.observaciones = existing.observaciones
                      ? `${existing.observaciones}; ${item.observations}`
                      : item.observations;
                  }
                } else {
                  travelMap.set(item.expenseType, {
                    expenseType: item.expenseType,
                    label: TRAVEL_EXPENSE_LABELS[item.expenseType] ?? item.expenseType,
                    cantidad: qty,
                    observaciones: item.observations ?? '',
                  });
                }
              }
            }

            return {
              work,
              ucapRows: Array.from(ucapMap.values()),
              materialRows: Array.from(materialMap.values()),
              travelRows: Array.from(travelMap.values()),
            };
          })
        );

        setProjectData(results);
      } catch {
        toast.error('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Consolidated (aggregated) data
  const consolidatedUcaps = (() => {
    const map = new Map<number, UcapRow>();
    for (const p of projectData) {
      for (const row of p.ucapRows) {
        const existing = map.get(row.ucapId);
        if (existing) existing.cantidad += row.cantidad;
        else map.set(row.ucapId, { ...row });
      }
    }
    return Array.from(map.values());
  })();

  const consolidatedMaterials = (() => {
    const map = new Map<number, MaterialRow>();
    for (const p of projectData) {
      for (const row of p.materialRows) {
        const existing = map.get(row.materialId);
        if (existing) {
          existing.cantidad += row.cantidad;
          if (row.observaciones && !existing.observaciones.includes(row.observaciones)) {
            existing.observaciones = existing.observaciones
              ? `${existing.observaciones}; ${row.observaciones}`
              : row.observaciones;
          }
        } else {
          map.set(row.materialId, { ...row });
        }
      }
    }
    return Array.from(map.values());
  })();

  const consolidatedTravel = (() => {
    const map = new Map<string, TravelRow>();
    for (const p of projectData) {
      for (const row of p.travelRows) {
        const existing = map.get(row.expenseType);
        if (existing) {
          existing.cantidad += row.cantidad;
          if (row.observaciones && !existing.observaciones.includes(row.observaciones)) {
            existing.observaciones = existing.observaciones
              ? `${existing.observaciones}; ${row.observaciones}`
              : row.observaciones;
          }
        } else {
          map.set(row.expenseType, { ...row });
        }
      }
    }
    return Array.from(map.values());
  })();

  const tabs = [
    { id: 'consolidado' as const, label: 'Consolidado' },
    { id: 'por-proyecto' as const, label: 'Por Proyecto' },
  ];

  return (
    <div className="min-h-screen bg-[hsl(var(--canalco-neutral-50))]">
      <header className="bg-white shadow-sm border-b border-[hsl(var(--canalco-neutral-200))] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Inicio">
          <Home className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Volver">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-lg font-semibold">Revisión de Cantidades</h1>
          <p className="text-xs text-[hsl(var(--canalco-neutral-500))]">
            Acta N° {decodedRecord} — {works.length} obra{works.length !== 1 ? 's' : ''}
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-[hsl(var(--canalco-neutral-200))]">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pt-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[hsl(var(--canalco-primary))] text-[hsl(var(--canalco-primary))]'
                  : 'border-transparent text-[hsl(var(--canalco-neutral-500))] hover:text-[hsl(var(--canalco-neutral-700))]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
          </div>
        ) : activeTab === 'consolidado' ? (
          <div className="space-y-8">
            <section>
              <h2 className="text-base font-semibold mb-3 text-[hsl(var(--canalco-neutral-800))]">UCAPs</h2>
              <UcapTable rows={consolidatedUcaps} />
            </section>
            <section>
              <h2 className="text-base font-semibold mb-3 text-[hsl(var(--canalco-neutral-800))]">Materiales</h2>
              <MaterialTable rows={consolidatedMaterials} />
            </section>
            <section>
              <h2 className="text-base font-semibold mb-3 text-[hsl(var(--canalco-neutral-800))]">Gastos de Viaje</h2>
              <TravelTable rows={consolidatedTravel} />
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            {projectData.map((data) => (
              <ProjectCard key={data.work.workId} data={data} />
            ))}
            {projectData.length === 0 && (
              <p className="text-center py-20 text-[hsl(var(--canalco-neutral-500))]">
                No hay obras para mostrar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
