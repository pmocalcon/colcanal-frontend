import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { gestionConocimientoService, type GcSolicitud } from '@/services/gestionConocimiento.service';
import { getTipo } from '@/config/juridicaContratos';
import { TextosDocumento, useTextosDocumento, TextoEd } from '@/components/juridica/textoEditable';
import { TabsDocumentos } from '@/components/juridica/TabsDocumentos';
import { AccionesFlujo } from '@/components/juridica/AccionesFlujo';
import { PieElaboracion } from '@/components/juridica/PieElaboracion';
import { PieMembrete } from '@/components/juridica/PieMembrete';
import { MembreteOficio, BloqueControl } from '@/components/juridica/camposDocumento';

/**
 * "Acta de inicio" del contrato de prestación de servicios, alquiler, suministro u otro
 * (fase 2 de G. jurídica). La diligencia Jurídica.
 *
 * La firman quien supervisa por parte de la contratante y la contratista. El supervisor es
 * un campo propio y no se deduce del representante legal: desde que la designación admite
 * nombrar a un tercero, quien supervisa puede no ser quien representa a la empresa, y el
 * acta lo tiene que decir con el nombre de quien de verdad va a firmarla.
 *
 * Reutiliza datos del contrato (solicitud) y de la designación de supervisor, y el texto se
 * puede reescribir. Ruta: `.../juridica/:id/acta-inicio`. Se guarda en data.actaInicio.
 */

interface ActaState {
  // ── Control interno de parametrización, no se imprime ──
  codigoDocumental: string;
  version: string;
  /**
   * Si el contrato exige garantías como condición de inicio.
   *
   * Manda sobre el texto: apagado, el acta afirma que el contrato no las exige y no queda
   * ninguna referencia a su aprobación. El modelo lo pide expresamente, y con razón —un
   * acta que diga «las garantías fueron aprobadas» donde no había garantías es una
   * constancia falsa sobre un requisito de inicio.
   */
  exigeGarantias: boolean;

  // ── La contratante ──
  contratante: string; identTributaria: string;
  representanteLegal: string; representanteCc: string;

  tipologia: string;

  // ── La contratista ──
  contratista: string; contratistaCc: string;
  contratistaRepLegal: string; contratistaRepCc: string;
  direccion: string; celular: string; correo: string;

  objeto: string;
  valor: string; formaPago: string;
  plazo: string;

  /** Quien supervisa. Sale de la designación; puede no ser el representante legal. */
  supervisorNombre: string; supervisorId: string; supervisorCargo: string;

  garantias: string;
  /** Fecha del acta de aprobación de garantías, cuando el contrato las exige. */
  aprobacionGarantias: string;

  inicio: string; terminacion: string;

  /** Dónde y cuándo se reunieron las partes. Solo aparece en el párrafo de apertura. */
  ciudadReunion: string;
  fechaReunion: string;
  /** Qué requisitos de inicio se dan por cumplidos. */
  requisitos: string;

  // Constancia de inicio
  fechaInicio: string; plazoCorto: string; fechaFinal: string;

  /** Quién la elaboró. Quien la revisa es siempre Jurídica y va en `PieElaboracion`. */
  elaboro: string;

  /** Texto del acta que Jurídica reescribió, por clave. Vacío = plantilla. */
  textos: Record<string, string>;
}

const EMPTY: ActaState = {
  codigoDocumental: '[ASIGNAR / VALIDAR POR GESTIÓN DOCUMENTAL]',
  version: '[VERSIÓN]',
  exigeGarantias: true,

  contratante: '', identTributaria: '',
  representanteLegal: '', representanteCc: '',

  tipologia: '',

  contratista: '', contratistaCc: '',
  contratistaRepLegal: '', contratistaRepCc: '',
  direccion: '', celular: '', correo: '',

  objeto: '',
  valor: '', formaPago: '',
  plazo: '',

  supervisorNombre: '', supervisorId: '', supervisorCargo: '',

  garantias: '',
  aprobacionGarantias: '',

  inicio: '', terminacion: '',

  ciudadReunion: '',
  fechaReunion: '',
  requisitos: '',

  fechaInicio: '', plazoCorto: '', fechaFinal: '',

  elaboro: '',
  textos: {},
};

/**
 * Las claves de `textos` de esta versión del formato van con prefijo `v2.`.
 *
 * Los párrafos cambiaron de redacción y de estructura —donde había uno solo ahora hay
 * tres—, pero conservan el mismo papel dentro del acta. Reusar las claves viejas haría que
 * un acta que hubiera reescrito «apertura» heredara ese párrafo en un lugar donde ahora
 * dice otra cosa. Con prefijo propio, lo guardado antes se queda quieto y esta versión
 * arranca de su plantilla.
 */
const claveTexto = (clave: string) => `v2.${clave}`;

const puedeEditar = (rol?: string) => {
  const r = (rol ?? '').toLowerCase();
  return r === 'analista pmo' || r.includes('juríd') || r.includes('jurid');
};

const HABILITADO = ['en_acta_inicio', 'finalizado'];

export default function ActaInicioPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: idParam } = useParams<{ id: string }>();
  const solicitudId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  const [sol, setSol] = useState<GcSolicitud | null>(null);
  const [f, setF] = useState<ActaState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editable = puedeEditar(user?.nombreRol);
  const habilitada = !!sol && HABILITADO.includes(sol.estado);
  const set = <K extends keyof ActaState>(k: K, v: ActaState[K]) => setF((p) => ({ ...p, [k]: v }));
  const textosCtx = useTextosDocumento(f.textos, setF);

  useEffect(() => {
    if (solicitudId === null) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await gestionConocimientoService.get(solicitudId);
        if (cancelled) return;
        setSol(data);
        const d = data.data ?? {};
        const saved = (d.actaInicio ?? {}) as Partial<ActaState>;
        /*
         * Lo que el acta hereda de la designación. Se enumera en vez de leerlo suelto para
         * que se vea de una qué campos cruzan de un documento al otro: los de más abajo son
         * de versiones anteriores de la designación y solo sirven para no perder datos.
         */
        const des = (d.designacionSupervisor ?? {}) as {
          mismaPersona?: boolean;
          firmanteNombre?: string; firmanteCc?: string; firmanteCargo?: string;
          supervisorNombre?: string; supervisorId?: string; supervisorCargo?: string;
          contratanteNit?: string; contratistaNit?: string;
          garantias?: string; inicio?: string; terminacion?: string;
          aprobacionGarantias?: string; supervisorCiudad?: string;
        };
        // `viejoSup` son los campos del acta anterior, que tenía supervisor aparte del
        // representante legal. Se leen para que un acta ya guardada no pierda la firma.
        const viejoSup = (d.actaInicio ?? {}) as Record<string, string>;
        /*
         * De la designación: si allá se marcó que quien designa ejerce la supervisión, el
         * supervisor es el firmante; si no, es la persona designada. Leerlo mal pondría a
         * firmar el acta a alguien que no supervisa.
         */
        const supDesignado = des.mismaPersona ? des.firmanteNombre : des.supervisorNombre;
        const supCargo = des.mismaPersona ? des.firmanteCargo : des.supervisorCargo;
        // Prellenado: primero lo guardado del acta; luego el contrato (solicitud) y la designación.
        setF({
          ...EMPTY,
          ...saved,
          contratante: saved.contratante || d.empresa || '',
          tipologia: saved.tipologia || getTipo(d.tipoContrato)?.nombre || '',
          contratista: saved.contratista || d.contratista || '',
          objeto: saved.objeto || d.alcanceServicio || d.objetoProyecto || '',
          valor: saved.valor || d.honorarios || '',
          formaPago: saved.formaPago || d.formaPago || '',
          plazo: saved.plazo || d.duracion || '',
          plazoCorto: saved.plazoCorto || d.duracion || '',
          // De la designación de supervisor (mismo contrato):
          identTributaria: saved.identTributaria || des.contratanteNit || '',
          representanteLegal: saved.representanteLegal || des.firmanteNombre || '',
          representanteCc: saved.representanteCc || des.firmanteCc || '',
          contratistaCc: saved.contratistaCc || des.contratistaNit || '',
          /*
           * Las actas anteriores no tenían supervisor propio: figuraba como representante
           * legal y firmaba como «La Supervisora». Ese nombre se hereda para que un acta ya
           * guardada siga mostrando a quien la firmó.
           */
          supervisorNombre: saved.supervisorNombre || supDesignado || viejoSup.supervisorNombre || saved.representanteLegal || des.firmanteNombre || '',
          supervisorId: saved.supervisorId || des.supervisorId || viejoSup.supervisorCc || saved.representanteCc || des.firmanteCc || '',
          supervisorCargo: saved.supervisorCargo || supCargo || '',
          garantias: saved.garantias || des.garantias || '',
          aprobacionGarantias: saved.aprobacionGarantias || des.aprobacionGarantias || '',
          inicio: saved.inicio || des.inicio || '',
          terminacion: saved.terminacion || des.terminacion || '',
          ciudadReunion: saved.ciudadReunion || des.supervisorCiudad || '',
          textos: saved.textos ?? {},
        });
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el acta de inicio');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitudId]);

  /** Devuelve si logró guardar: la acción de la etapa guarda antes de avanzar. */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await gestionConocimientoService.saveDocumento(solicitudId!, 'actaInicio', f);
      toast.success('Acta de inicio guardada');
      return true;
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#16162b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page { size: Letter portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* Barra de acciones */}
      <header className="no-print bg-white border-b border-[#e6e6f0] shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 pt-4 pb-2 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)} title="Volver a la solicitud">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-grow">
            <h1 className="text-lg font-bold text-[#16162b]">Acta de Inicio</h1>
            <p className="text-xs text-[#4a4a63]">Solicitud N.º {solicitudId}</p>
          </div>
          <Button onClick={() => window.print()} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          {editable && habilitada && (
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#ffe81a] hover:bg-[#ffe81a]/85 text-[#16162b] border border-[#e0cc00]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </Button>
          )}
        </div>
        {/* Los documentos del trámite: se navega entre ellos sin volver a la solicitud. */}
        {solicitudId !== null && (
          <div className="max-w-4xl mx-auto px-6">
            <TabsDocumentos solicitudId={solicitudId} sol={sol} activo="acta-inicio" />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* La acción de la etapa va donde se decide: se firma el acta y se finaliza acá. */}
        <AccionesFlujo
          sol={sol} documento="acta-inicio" onCambio={setSol}
          onAntes={editable && habilitada ? handleSave : undefined}
        />
        {!habilitada ? (
          <div className="bg-white border border-[hsl(var(--canalco-neutral-200))] rounded-xl p-8 text-center">
            <p className="text-[hsl(var(--canalco-neutral-700))]">El acta de inicio aún no está <b>habilitada</b>.</p>
            <p className="text-sm text-[hsl(var(--canalco-neutral-500))] mt-1">Se habilita en la etapa «Acta de inicio» (después de la designación de supervisor).</p>
            <Button variant="link" className="text-[hsl(var(--canalco-primary))] mt-2" onClick={() => navigate(`/dashboard/gestion-conocimiento/juridica/${solicitudId}`)}>
              Ir a la solicitud
            </Button>
          </div>
        ) : (
          <fieldset disabled={!editable} className="border-0 m-0 p-0 min-w-0">
          <TextosDocumento value={textosCtx}>
          <div className="doc bg-white border border-[#e6e6f0] text-[12px] text-black shadow-md px-10 py-8 space-y-4">

            <MembreteOficio
              titulo="ACTA DE INICIO"
              subtitulo="PRESTACIÓN DE SERVICIOS / ALQUILER / SUMINISTRO / OTRO"
            />

            <BloqueControl
              titulo="CONTROL INTERNO DE PARAMETRIZACIÓN — NO SE IMPRIME"
              nota="El tipo contractual, el supervisor, las garantías y la fecha final se llenan según el contrato concreto. Revísalos contra él antes de imprimir."
            >
              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Código documental</span>
                <input
                  value={f.codigoDocumental}
                  onChange={(e) => set('codigoDocumental', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                />
              </label>

              <label className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold text-[#4a4a63] w-36 shrink-0">Versión</span>
                <input
                  value={f.version}
                  onChange={(e) => set('version', e.target.value)}
                  className="flex-grow min-w-0 border border-[#c9c9dc] rounded px-2 py-1 bg-white"
                />
              </label>

              {/* La regla del modelo: sin garantías, ninguna referencia a su aprobación. */}
              <label className="flex items-start gap-2 text-[11.5px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.exigeGarantias}
                  onChange={(e) => set('exigeGarantias', e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  El contrato exige garantías como condición de inicio
                  <span className="block text-[10.5px] text-[#8a6d00]">
                    Si lo apagas, el acta afirma que no las exige y desaparece toda referencia a
                    su aprobación.
                  </span>
                </span>
              </label>
            </BloqueControl>

            {/* Tabla de datos del contrato */}
            <h3 className="font-bold text-center pt-2">INFORMACIÓN DEL CONTRATO</h3>

            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <Row label="Entidad contratante" value={f.contratante} onChange={(v) => set('contratante', v)} />
                <Row label="NIT" value={f.identTributaria} onChange={(v) => set('identTributaria', v)} placeholder="900.000.000-0" />
                <RowDoble
                  label="Representante legal"
                  a={f.representanteLegal} onA={(v) => set('representanteLegal', v)} phA="Nombre completo"
                  b={f.representanteCc} onB={(v) => set('representanteCc', v)} phB="C.C. 00.000.000 de …"
                />
                <Row label="Tipo de contrato" value={f.tipologia} onChange={(v) => set('tipologia', v)}
                  placeholder="Prestación de servicios / alquiler / suministro / otro" />
                <Row label="Contratista" value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="Nombre o razón social" />
                <Row label="CC / NIT" value={f.contratistaCc} onChange={(v) => set('contratistaCc', v)} placeholder="000.000.000-0" />
                <RowDoble
                  label="Representante legal, si aplica"
                  a={f.contratistaRepLegal} onA={(v) => set('contratistaRepLegal', v)} phA="Nombre / No aplica"
                  b={f.contratistaRepCc} onB={(v) => set('contratistaRepCc', v)} phB="Identificación"
                />
                <Row label="Domicilio" value={f.direccion} onChange={(v) => set('direccion', v)} placeholder="Dirección / ciudad" />
                <Row label="Teléfono" value={f.celular} onChange={(v) => set('celular', v)} />
                <Row label="Correo electrónico" value={f.correo} onChange={(v) => set('correo', v)} />
                <Row label="Objeto" value={f.objeto} onChange={(v) => set('objeto', v)} area />
                <Row label="Valor total" value={f.valor} onChange={(v) => set('valor', v)} area
                  placeholder="$0 M/CTE, IVA incluido / más IVA / no aplica" />
                <Row label="Forma de pago" value={f.formaPago} onChange={(v) => set('formaPago', v)} area />
                <Row label="Plazo de ejecución" value={f.plazo} onChange={(v) => set('plazo', v)}
                  placeholder="0 (cero) días / meses" />
                <RowDoble
                  label="Supervisor"
                  a={f.supervisorNombre} onA={(v) => set('supervisorNombre', v)} phA="Nombre completo"
                  b={f.supervisorCargo} onB={(v) => set('supervisorCargo', v)} phB="Cargo"
                />
                {/*
                  La fila de garantías la manda la casilla del control: apagada, el acta no
                  puede insinuar que hubo una aprobación que nunca existió.
                */}
                <Row
                  label="Garantías"
                  value={f.exigeGarantias ? f.garantias : 'No aplican'}
                  onChange={(v) => set('garantias', v)}
                  area={f.exigeGarantias}
                  soloLectura={!f.exigeGarantias}
                  placeholder="Aplican · acta de aprobación de fecha 00/00/0000"
                />
                <Row label="Fecha de inicio" value={f.inicio} onChange={(v) => set('inicio', v)} placeholder="00 de mes de 0000" />
                <Row label="Fecha de terminación" value={f.terminacion} onChange={(v) => set('terminacion', v)} placeholder="00 de mes de 0000" />
              </tbody>
            </table>

            {/* La reunión de inicio */}
            <div className="leading-relaxed text-[12.5px] space-y-3 pt-2">
              <TextoEd
                k={claveTexto('apertura')}
                plantilla={
                  `En ${tx(f.ciudadReunion)}, a los ${tx(f.fechaReunion)}, se reunieron `
                  + `${tx(f.supervisorNombre).toUpperCase()}, identificado(a) con ${tx(f.supervisorId)}, `
                  + `en calidad de supervisor(a) del contrato por parte de ${tx(f.contratante)}, y `
                  + `${tx(f.contratistaRepLegal).toUpperCase()}, identificado(a) con `
                  + `${tx(f.contratistaRepCc)}, actuando en calidad de representante legal de `
                  + `${tx(f.contratista)}.`
                }
              />

              {/*
                La constancia de requisitos. La frase de garantías es la que cambia con la
                casilla: son dos afirmaciones opuestas sobre un requisito de inicio, no dos
                formas de decir lo mismo.
              */}
              <TextoEd
                k={claveTexto('requisitos')}
                plantilla={
                  `Verificados los requisitos previstos contractualmente para iniciar la `
                  + `ejecución, las partes dejan constancia de que ${tx(f.requisitos)}. `
                  + (f.exigeGarantias
                    ? `Las garantías exigidas fueron expedidas, presentadas y aprobadas mediante `
                      + `acta de fecha ${tx(f.aprobacionGarantias)}.`
                    : 'El contrato no exige garantías como condición de inicio.')
                }
              />

              <TextoEd
                k={claveTexto('acuerdo')}
                plantilla={
                  `En consecuencia, se acuerda dar inicio a la ejecución del contrato a partir del `
                  + `${tx(f.fechaInicio || f.inicio)}. El plazo de ${tx(f.plazoCorto || f.plazo)} se `
                  + `contará de conformidad con lo pactado en el contrato y finalizará el `
                  + `${tx(f.fechaFinal || f.terminacion)}, salvo modificación posterior formalmente `
                  + `suscrita por las partes cuando corresponda.`
                }
              />
            </div>

            {/* Constancia de inicio */}
            <h3 className="font-bold text-center pt-2">CONSTANCIA DE INICIO</h3>

            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[hsl(var(--canalco-neutral-100))]">
                  <th className="border border-[#0a2a52] px-2 py-1">FECHA DE INICIO</th>
                  <th className="border border-[#0a2a52] px-2 py-1">PLAZO</th>
                  <th className="border border-[#0a2a52] px-2 py-1">FECHA FINAL</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-center font-semibold">
                  <td className="border border-[#0a2a52] px-2 py-1">
                    <input value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} placeholder="dd/mm/aaaa"
                      className="w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
                  </td>
                  <td className="border border-[#0a2a52] px-2 py-1">
                    <input value={f.plazoCorto} onChange={(e) => set('plazoCorto', e.target.value)} placeholder="Quince (15) días"
                      className="w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
                  </td>
                  <td className="border border-[#0a2a52] px-2 py-1">
                    <input value={f.fechaFinal} onChange={(e) => set('fechaFinal', e.target.value)} placeholder="dd/mm/aaaa"
                      className="w-full bg-transparent outline-none text-center text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
                  </td>
                </tr>
              </tbody>
            </table>

            <TextoEd
              k={claveTexto('noModifica')}
              plantilla="La suscripción de la presente acta no modifica el contrato ni autoriza actividades, valores, plazos o condiciones diferentes de las expresamente pactadas. Cualquier modificación deberá formalizarse por el mecanismo contractual correspondiente."
            />

            {/* Firmas: quien supervisa por la contratante y la contratista. */}
            <div className="grid grid-cols-2 gap-10 pt-16">
              <Firma>
                <FLine value={f.supervisorNombre} onChange={(v) => set('supervisorNombre', v)} placeholder="NOMBRE DEL SUPERVISOR" bold />
                <FLine value={f.supervisorCargo} onChange={(v) => set('supervisorCargo', v)} placeholder="Cargo" />
                <div>Supervisor(a)</div>
                <FLine value={f.contratante} onChange={(v) => set('contratante', v)} placeholder="ENTIDAD CONTRATANTE" bold />
              </Firma>
              <Firma>
                <FLine value={f.contratistaRepLegal} onChange={(v) => set('contratistaRepLegal', v)} placeholder="NOMBRE DEL CONTRATISTA / REPRESENTANTE" bold />
                <FLine value={f.contratista} onChange={(v) => set('contratista', v)} placeholder="Cargo / razón social" />
                <div className="font-bold">EL/LA CONTRATISTA</div>
              </Firma>
            </div>

            <PieMembrete />
          </div>

          {/* Quien elabora varía; quien revisa es siempre la Dirección Jurídica. */}
          <div className="px-8 pt-3 text-[10px] text-black">
            <span>Elaboró: </span>
            <input
              value={f.elaboro}
              onChange={(e) => set('elaboro', e.target.value)}
              placeholder="Nombre - Cargo"
              className="bg-transparent outline-none text-[10px] w-64 placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]"
            />
          </div>
          <PieElaboracion soloRevision className="pt-0" />
          </TextosDocumento>
          </fieldset>
        )}

        {habilitada && !editable && (
          <p className="no-print text-center text-xs text-[hsl(var(--canalco-neutral-500))] mt-4">
            Solo Jurídica puede diligenciar esta acta. Puedes consultarla e imprimirla.
          </p>
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ─────────────────────────────────────── */

function Row({ label, value, onChange, area, placeholder, soloLectura }: {
  label: string; value: string; onChange: (v: string) => void;
  area?: boolean; placeholder?: string; soloLectura?: boolean;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[34%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        {soloLectura ? (
          <span>{value}</span>
        ) : area ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
            className="w-full bg-transparent outline-none resize-y text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className="w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        )}
      </td>
    </tr>
  );
}

/**
 * Fila con dos datos en la misma celda —«Nombre - Identificación»—, como los junta el
 * modelo. Se guardan aparte porque el texto del acta los cita por separado.
 */
function RowDoble({ label, a, onA, phA, b, onB, phB }: {
  label: string;
  a: string; onA: (v: string) => void; phA?: string;
  b: string; onB: (v: string) => void; phB?: string;
}) {
  return (
    <tr>
      <td className="border border-[#0a2a52] px-2 py-1 font-semibold bg-[hsl(var(--canalco-neutral-100))] align-top w-[34%]">{label}</td>
      <td className="border border-[#0a2a52] px-2 py-1 align-top">
        <div className="flex items-baseline gap-1">
          <input value={a} onChange={(e) => onA(e.target.value)} placeholder={phA}
            className="flex-grow min-w-0 bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
          <span className="shrink-0">-</span>
          <input value={b} onChange={(e) => onB(e.target.value)} placeholder={phB}
            className="flex-grow min-w-0 bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))]" />
        </div>
      </td>
    </tr>
  );
}

/** Marca de dato faltante en el texto: mejor un vacío visible que un hueco. */
const tx = (v: string) => (v?.trim() ? v : '…');

function Firma({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-t border-[#0a2a52] pt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function FLine({ value, onChange, placeholder, bold }: { value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={'w-full bg-transparent outline-none text-[12px] placeholder:italic placeholder:text-[hsl(var(--canalco-neutral-400))] ' + (bold ? 'font-bold' : '')}
    />
  );
}
