/**
 * Reconocimiento de texto sobre un PDF escaneado.
 *
 * Las órdenes de pago llegan escaneadas: son una foto del papel, sin capa de texto, así
 * que no hay nada que extraer y hay que **leer la imagen**. Eso es lo que hace esto:
 * dibuja cada página en un lienzo y le pasa un reconocedor encima.
 *
 * **Lo que sale de acá no es un dato, es una propuesta.** Un reconocedor confunde un 3
 * con un 8 y un 0 con una O, y en un cotejo de plata una cifra mal leída es peor que una
 * ausente: la ausente se busca a mano, la mal leída se aprueba. Por eso quien llama tiene
 * que poner las cifras delante de una persona para que las confirme antes de comparar
 * nada. Acá no se decide nada, solo se lee.
 *
 * Todo ocurre en el navegador: la imagen no sale del computador de quien la carga.
 */

/** Cómo va el reconocimiento, para poder mostrarlo: es lento y sin aviso parece colgado. */
export interface ProgresoOcr {
  pagina: number;
  paginas: number;
  /** 0 a 1 dentro de la página actual. */
  avance: number;
}

/**
 * A cuánto se agranda la página antes de reconocerla.
 *
 * Un PDF se dibuja por defecto a 72 puntos por pulgada y a esa escala el reconocedor no
 * distingue los dígitos. Con 2,5 la página carta queda cerca de 180 ppp, que es donde
 * empieza a leer bien sin que el lienzo se vuelva ingobernable.
 */
const ESCALA = 2.5;

/**
 * Reconoce el texto de un PDF escaneado, página por página.
 *
 * Devuelve los renglones tal como los entrega el reconocedor, para que quien llame los
 * interprete igual que si vinieran de la capa de texto.
 */
export async function ocrDelPdf(
  datos: ArrayBuffer,
  onProgreso?: (p: ProgresoOcr) => void,
): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const tarea = pdfjs.getDocument({ data: new Uint8Array(datos) });
  const doc = await tarea.promise;

  // Se carga acá y no arriba: pesa varios megas y solo hace falta cuando el documento
  // resultó ser un escaneo, que no es el caso corriente.
  const { createWorker } = await import('tesseract.js');

  const renglones: string[] = [];
  let lector: Awaited<ReturnType<typeof createWorker>> | null = null;
  // El reconocedor avisa su avance por un callback que no sabe en qué página va; se lo
  // dice esta variable, que el bucle actualiza antes de cada página.
  let paginaActual = 1;

  try {
    lector = await createWorker('spa', 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text' && onProgreso) {
          onProgreso({ pagina: paginaActual, paginas: doc.numPages, avance: m.progress });
        }
      },
    });

    for (let p = 1; p <= doc.numPages; p++) {
      paginaActual = p;
      onProgreso?.({ pagina: p, paginas: doc.numPages, avance: 0 });

      const pagina = await doc.getPage(p);
      const viewport = pagina.getViewport({ scale: ESCALA });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.ceil(viewport.width);
      lienzo.height = Math.ceil(viewport.height);
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new Error('El navegador no pudo dibujar la página para leerla.');

      // Fondo blanco: un PDF sin fondo se dibuja sobre transparente y el reconocedor lo
      // toma como negro, con lo que la página le llega en negativo.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);

      await pagina.render({ canvas: lienzo, canvasContext: ctx, viewport }).promise;

      const { data } = await lector.recognize(lienzo);
      for (const linea of (data.text ?? '').split('\n')) {
        if (linea.trim()) renglones.push(linea.trim());
      }

      // El lienzo de una página carta a esta escala son varios megas: sin soltarlo, un
      // documento de diez páginas deja la pestaña sin memoria.
      lienzo.width = 0;
      lienzo.height = 0;
    }
  } finally {
    await lector?.terminate();
    await tarea.destroy();
  }

  if (renglones.length === 0) {
    throw new Error(
      'El reconocedor no encontró texto en la imagen. Si el escaneo está muy claro, '
      + 'torcido o de baja resolución, pida el documento otra vez.',
    );
  }
  return renglones;
}
