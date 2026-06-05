import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { surveysService, type Work } from '@/services/surveys.service';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';
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

export default function RevisarCantidadesActaPage() {
  const { recordNumber } = useParams<{ recordNumber: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const works: Work[] = (location.state as any)?.works ?? [];

  const [loading, setLoading] = useState(false);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [ucapRows, setUcapRows] = useState<UcapRow[]>([]);
  const [travelRows, setTravelRows] = useState<TravelRow[]>([]);

  const decodedRecord = recordNumber ? decodeURIComponent(recordNumber) : '';

  useEffect(() => {
    if (works.length === 0) return;
    const load = async () => {
      setLoading(true);
      try {
        const allSurveyLists = await Promise.all(
          works.map((w) => surveysService.getSurveys({ workId: w.workId, limit: 100 }))
        );
        const allSurveyIds = allSurveyLists.flatMap((r) => (r.data ?? []).map((s) => s.surveyId));
        if (allSurveyIds.length === 0) return;

        const fullSurveys = await Promise.all(
          allSurveyIds.map((id) => surveysService.getSurveyById(id))
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

        setMaterialRows(Array.from(materialMap.values()));
        setUcapRows(Array.from(ucapMap.values()));
        setTravelRows(Array.from(travelMap.values()));
      } catch {
        toast.error('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[hsl(var(--canalco-primary))]/30 border-t-[hsl(var(--canalco-primary))] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-base font-semibold mb-3 text-[hsl(var(--canalco-neutral-800))]">
                UCAPs
              </h2>
              {ucapRows.length === 0 ? (
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                  No hay UCAPs registradas para estas obras.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
                  <table className="w-full text-sm">
                    <thead className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Código</th>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Descripción</th>
                        <th className="px-4 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ucapRows.map((row, i) => (
                        <tr
                          key={row.ucapId}
                          className={i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}
                        >
                          <td className="px-4 py-2 font-mono text-xs text-[hsl(var(--canalco-neutral-600))]">
                            {row.codigo}
                          </td>
                          <td className="px-4 py-2">{row.descripcion}</td>
                          <td className="px-4 py-2 text-center font-medium">{row.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-base font-semibold mb-3 text-[hsl(var(--canalco-neutral-800))]">
                Materiales
              </h2>
              {materialRows.length === 0 ? (
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                  No hay materiales registrados para estas obras.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
                  <table className="w-full text-sm">
                    <thead className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Código</th>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Descripción</th>
                        <th className="px-4 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidad</th>
                        <th className="px-4 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Unidad</th>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialRows.map((row, i) => (
                        <tr
                          key={row.materialId}
                          className={i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}
                        >
                          <td className="px-4 py-2 font-mono text-xs text-[hsl(var(--canalco-neutral-600))]">
                            {row.codigo}
                          </td>
                          <td className="px-4 py-2">{row.descripcion}</td>
                          <td className="px-4 py-2 text-center font-medium">{row.cantidad}</td>
                          <td className="px-4 py-2 text-center text-[hsl(var(--canalco-neutral-600))]">
                            {row.unidad}
                          </td>
                          <td className="px-4 py-2 text-[hsl(var(--canalco-neutral-600))]">
                            {row.observaciones || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-base font-semibold mb-3 text-[hsl(var(--canalco-neutral-800))]">
                Gastos de Viaje
              </h2>
              {travelRows.length === 0 ? (
                <p className="text-sm text-[hsl(var(--canalco-neutral-500))]">
                  No hay gastos de viaje registrados para estas obras.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[hsl(var(--canalco-neutral-200))]">
                  <table className="w-full text-sm">
                    <thead className="bg-[hsl(var(--canalco-neutral-100))] border-b border-[hsl(var(--canalco-neutral-200))]">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Tipo</th>
                        <th className="px-4 py-2 text-center font-semibold text-[hsl(var(--canalco-neutral-700))]">Cantidad</th>
                        <th className="px-4 py-2 text-left font-semibold text-[hsl(var(--canalco-neutral-700))]">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {travelRows.map((row, i) => (
                        <tr
                          key={row.expenseType}
                          className={i % 2 === 0 ? 'bg-white' : 'bg-[hsl(var(--canalco-neutral-50))]'}
                        >
                          <td className="px-4 py-2 font-medium">{row.label}</td>
                          <td className="px-4 py-2 text-center">{row.cantidad}</td>
                          <td className="px-4 py-2 text-[hsl(var(--canalco-neutral-600))]">
                            {row.observaciones || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
