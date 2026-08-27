/**
 * El plan de pagos de un préstamo a empleado, mes a mes, contra lo que de verdad se le
 * descontó.
 *
 * **No lleva intereses.** Estos préstamos no los cobran: no hay tasa en la ficha ni en el
 * formato GTH-007-F, y el saldo se mueve solo con lo que se abona. Así que esto no es una
 * amortización de las de banco —donde cada cuota se parte en interés y capital—, sino el
 * calendario de descuentos: cuánto toca en cada mes, cuánto se descontó y cómo va el
 * saldo. Si algún día se cobran intereses, hay que agregar la tasa y partir la cuota;
 * hoy inventar una columna de intereses en cero sería decir algo que no se pactó.
 *
 * Lo que hace útil la tabla no es el plan solo —eso ya se sabe— sino ponerlo **al lado de
 * la realidad**: los meses que se saltaron, los que se pagaron de más y en qué cuota va
 * de verdad la persona. Es la pregunta que hoy se responde contando renglones a mano.
 */

/** Lo mínimo que el plan necesita del préstamo. Así sirve para la ficha y para el formato. */
export interface PrestamoParaPlan {
  mesInicio: string | null;
  numeroCuotas: number | null;
  valorPrestamo: string | number | null;
  valorCuota: string | number | null;
}

/** Un pago ya registrado, como viene de la cartera. */
export interface PagoParaPlan {
  anio: number;
  mes: number;
  valor: string | number | null;
  tipo?: string | null;
}

export type EstadoCuota = "pagada" | "parcial" | "pendiente" | "de-mas";

export interface CuotaPlan {
  /** El número de cuota, de 1 a `numeroCuotas`. */
  numero: number;
  anio: number;
  mes: number;
  /** 'YYYY-MM', para cruzar con los pagos. */
  clave: string;
  /** Lo que le toca ese mes según el plan. */
  cuota: number;
  /** Lo que de verdad se le descontó ese mes, cuota y abonos juntos. */
  pagado: number;
  /** El saldo que quedaría si todo se pagara al día. */
  saldoPlan: number;
  /** El saldo de verdad después de ese mes, con lo que se ha pagado hasta ahí. */
  saldoReal: number;
  /**
   * Si a esta altura del plan ya hay historia que contar.
   *
   * Deja de ser cierto pasado el último mes con movimiento: de ahí en adelante el saldo
   * real no se sabe —nadie ha pagado todavía— y repetir la última cifra hasta el final
   * daría a entender que sí.
   */
  conHistoria: boolean;
  estado: EstadoCuota;
}

export interface Plan {
  cuotas: CuotaPlan[];
  /** Meses en que se pagó algo fuera del calendario del plan. */
  fueraDePlan: Array<{ clave: string; anio: number; mes: number; pagado: number }>;
  /** Por qué no se pudo armar el plan, si es que no se pudo. */
  problema: string | null;
  /**
   * Avisos sobre el propio plan: que las cuotas no sumen el préstamo, que la última
   * quede desproporcionada. No impiden mostrarlo, pero hay que decirlos.
   */
  avisos: string[];
  totalPlan: number;
  totalPagado: number;
  /** Lo descontado en meses que el calendario no contempla. */
  totalFueraDePlan: number;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const cop = (v: number) => "$" + Math.round(v).toLocaleString("es-CO");

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** '2024-05' se lee «may 2024». Para los avisos, que los lee una persona. */
const mesLegible = (clave: string) => `${MESES[Number(clave.slice(5, 7)) - 1]} ${clave.slice(0, 4)}`;

/** 'YYYY-MM' del mes que va `i` meses después del inicio. */
const mesDesplazado = (anio: number, mes: number, i: number) => {
  const total = (mes - 1) + i;
  return { anio: anio + Math.floor(total / 12), mes: (((total % 12) + 12) % 12) + 1 };
};

/**
 * Arma el plan y le cruza los pagos.
 *
 * La cuota de cada mes sale de `valorCuota`, que es lo pactado, y **la última absorbe la
 * diferencia**: multiplicar la cuota por el número de meses casi nunca da el préstamo
 * exacto, y el resto se cobra al final. Es lo que se hace en la práctica.
 *
 * Si la última queda muy lejos de las demás, se avisa en vez de disimularlo: quiere decir
 * que el número de cuotas o el valor de la cuota está mal en la ficha, y es justo lo que
 * la tabla sirve para descubrir.
 */
export function planDeAmortizacion(
  prestamo: PrestamoParaPlan,
  pagos: PagoParaPlan[] = [],
): Plan {
  const vacio: Plan = {
    cuotas: [],
    fueraDePlan: [],
    problema: null,
    avisos: [],
    totalPlan: 0,
    totalPagado: 0,
    totalFueraDePlan: 0,
  };

  const total = num(prestamo.valorPrestamo);
  const n = Math.trunc(num(prestamo.numeroCuotas));
  const cuotaPactada = num(prestamo.valorCuota);

  // Lo pagado se agrupa por mes antes de cualquier otra cosa: sirve igual para el plan y
  // para los meses que quedan fuera de él.
  const pagadoPorMes = new Map<string, number>();
  for (const p of pagos) {
    const clave = `${p.anio}-${String(p.mes).padStart(2, "0")}`;
    pagadoPorMes.set(clave, (pagadoPorMes.get(clave) ?? 0) + num(p.valor));
  }
  const totalPagado = [...pagadoPorMes.values()].reduce((s, v) => s + v, 0);

  if (!prestamo.mesInicio) {
    return { ...vacio, totalPagado, problema: "El préstamo no tiene mes de inicio." };
  }
  if (!(n > 0)) {
    return { ...vacio, totalPagado, problema: "El préstamo no tiene número de cuotas." };
  }
  if (!(total > 0)) {
    return { ...vacio, totalPagado, problema: "El préstamo no tiene valor." };
  }

  const m = /^(\d{4})-(\d{2})/.exec(prestamo.mesInicio);
  if (!m) {
    return { ...vacio, totalPagado, problema: "El mes de inicio no se entiende." };
  }
  const anioInicio = Number(m[1]);
  const mesInicio = Number(m[2]);

  const avisos: string[] = [];
  // Sin cuota pactada se reparte parejo, que es lo que haría cualquiera a mano.
  const cuotaBase = cuotaPactada > 0 ? cuotaPactada : Math.round(total / n);
  if (!(cuotaPactada > 0)) {
    avisos.push(
      `La ficha no tiene valor de cuota, así que el plan reparte el préstamo en ${n} partes ` +
        `de ${cop(cuotaBase)}.`,
    );
  }

  const ultima = total - cuotaBase * (n - 1);
  if (ultima < 0) {
    avisos.push(
      `Con ${n} cuotas de ${cop(cuotaBase)} se pasa del préstamo: sobran ` +
        `${cop(Math.abs(ultima))}. Revisa el número de cuotas o el valor de la cuota.`,
    );
  } else if (n > 1 && Math.abs(ultima - cuotaBase) > cuotaBase) {
    avisos.push(
      `La última cuota queda en ${cop(ultima)} contra ${cop(cuotaBase)} de las demás: ` +
        `${n} × ${cop(cuotaBase)} no suma el préstamo. Revisa la ficha.`,
    );
  }

  const cuotas: CuotaPlan[] = [];
  let saldoPlan = total;
  let saldoReal = total;
  const usados = new Set<string>();

  for (let i = 0; i < n; i++) {
    const { anio, mes } = mesDesplazado(anioInicio, mesInicio, i);
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;

    /*
     * La cuota del mes, sin pasarse nunca de lo que falta por cobrar.
     *
     * La última lleva el resto, para que el plan sume exactamente el préstamo aunque la
     * cuota no divida justo. Y ninguna cobra más de lo que queda: cuando el número de
     * cuotas se pasa del valor prestado —lo hay en la base—, los meses sobrantes quedan
     * en cero en vez de seguir cobrando plata que ya no se debe.
     */
    const cuota = i === n - 1 ? saldoPlan : Math.min(cuotaBase, saldoPlan);
    const pagado = pagadoPorMes.get(clave) ?? 0;
    usados.add(clave);

    saldoPlan = Math.max(saldoPlan - cuota, 0);
    saldoReal = saldoReal - pagado;

    let estado: EstadoCuota;
    if (pagado <= 0) estado = "pendiente";
    else if (Math.round(pagado) > Math.round(cuota)) estado = "de-mas";
    else if (Math.round(pagado) < Math.round(cuota)) estado = "parcial";
    else estado = "pagada";

    cuotas.push({
      numero: i + 1, anio, mes, clave, cuota, pagado, saldoPlan, saldoReal,
      conHistoria: false,
      estado,
    });
  }

  // La historia llega hasta el último mes con movimiento, ni un renglón más.
  let ultimoConPago = -1;
  cuotas.forEach((c, i) => { if (c.pagado > 0) ultimoConPago = i; });
  for (let i = 0; i <= ultimoConPago; i++) cuotas[i].conHistoria = true;

  /*
   * Los meses en que se pagó algo por fuera del calendario.
   *
   * Pasa todo el tiempo: un abono con la prima de diciembre, o un descuento que siguió
   * corriendo después de la última cuota. Van aparte y no como cuotas nuevas, porque el
   * plan es lo pactado y esto es lo que se salió de él —meterlos adentro haría que el
   * plan cambiara solo cada vez que alguien abona—.
   */
  const fueraDePlan = [...pagadoPorMes.entries()]
    .filter(([clave]) => !usados.has(clave))
    .map(([clave, pagado]) => ({
      clave,
      anio: Number(clave.slice(0, 4)),
      mes: Number(clave.slice(5, 7)),
      pagado,
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave));

  /*
   * El plan corrido: cuando el mes de inicio de la ficha no es el mes en que de verdad
   * empezaron los descuentos.
   *
   * Un mes de diferencia no es un error y no se dice: el préstamo se otorga un mes y se
   * empieza a descontar en la nómina siguiente, así que la última cuota se sale por el
   * final y ya. Lo que sí hay que decir es cuando el plan quedó corrido de verdad —hay uno
   * con el mes de inicio un año atrás—, porque entonces las primeras cuotas salen
   * «pendientes» sin estarlo, media tabla se va «fuera del plan» y el saldo real que se ve
   * en el último renglón no es el que la persona debe.
   *
   * Antes de acusar a la ficha se comprueba: se rearma la ventana del plan empezando en el
   * primer descuento y se cuenta cuántos quedarían fuera. Solo si caben más adentro se
   * dice, y se dice con el número. Corregir el mes de inicio es de la ficha, no de aquí:
   * mover el plan solo, según los pagos, dejaría de ser el plan pactado.
   */
  const mesesPagados = [...pagadoPorMes.keys()].sort();
  const primerPago = mesesPagados[0];
  if (primerPago && fueraDePlan.length > 1) {
    const anio = Number(primerPago.slice(0, 4));
    const mes = Number(primerPago.slice(5, 7));
    const ventana = new Set<string>();
    for (let i = 0; i < n; i++) {
      const d = mesDesplazado(anio, mes, i);
      ventana.add(`${d.anio}-${String(d.mes).padStart(2, "0")}`);
    }
    const fueraSiSeCorre = mesesPagados.filter((c) => !ventana.has(c)).length;
    if (fueraSiSeCorre < fueraDePlan.length) {
      const inicio = `${anioInicio}-${String(mesInicio).padStart(2, "0")}`;
      avisos.push(
        `Los descuentos empiezan en ${mesLegible(primerPago)}, pero la ficha dice que el ` +
          `préstamo arranca en ${mesLegible(inicio)}: ${fueraDePlan.length} de ` +
          `${mesesPagados.length} meses descontados caen fuera del plan. Empezando en ` +
          `${mesLegible(primerPago)} quedarían ${fueraSiSeCorre}. Corrige el mes de inicio ` +
          `en la ficha del préstamo.`,
      );
    }
  }

  return {
    cuotas,
    fueraDePlan,
    problema: null,
    avisos,
    totalPlan: cuotas.reduce((s, c) => s + c.cuota, 0),
    totalPagado,
    totalFueraDePlan: fueraDePlan.reduce((s, f) => s + f.pagado, 0),
  };
}

/**
 * En qué cuota va la persona: la última con algo pagado.
 *
 * Se cuenta por cuotas tocadas y no por meses transcurridos: alguien que abonó de más va
 * más adelante de lo que dice el calendario, y alguien a quien se le dejó de descontar va
 * más atrás.
 */
export function cuotaActual(plan: Plan): number {
  let ultima = 0;
  for (const c of plan.cuotas) if (c.pagado > 0) ultima = c.numero;
  return ultima;
}
