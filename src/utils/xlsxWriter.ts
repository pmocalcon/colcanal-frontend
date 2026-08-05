/**
 * Escritor mínimo de .xlsx (OOXML SpreadsheetML) sobre fflate.
 *
 * El proyecto ya usa fflate para LEER libros de Excel (ver xlsxReader.ts); aquí
 * lo usamos para ESCRIBIR uno, sin sumar dependencias ni un SheetJS completo.
 * Soporta lo justo para exportar una tabla tal como se ve en pantalla: texto,
 * números, negritas, rellenos y formato de miles / moneda.
 *
 * Un .xlsx es un ZIP con estas partes:
 *   [Content_Types].xml, _rels/.rels, xl/workbook.xml,
 *   xl/_rels/workbook.xml.rels, xl/styles.xml, xl/worksheets/sheet1.xml
 * Las cadenas se escriben "inline" (t="inlineStr") para no manejar sharedStrings.
 */

/** Estilo visual de una celda. El índice en cellXfs va en STYLE_INDEX. */
export type XlsxStyle =
  | 'title'
  | 'header'
  | 'text'
  | 'money'
  | 'qty'
  | 'groupText'
  | 'groupMoney'
  | 'groupQty'
  | 'totalText'
  | 'totalMoney'
  | 'totalQty'
  | 'labelBold'
  | 'value'
  | 'cardHeader'
  | 'cardLabel'
  | 'cardValue'
  | 'greenBarText'
  | 'greenBarMoney'
  // Bloque de firmas al pie: la raya sobre la que se firma, el nombre y el cargo.
  | 'signLine'
  | 'signName'
  | 'signRole'
  // Numéricos CON decimales. `qty` / `money` redondean a entero, que sirve para
  // cantidades y pesos pero destruye los cálculos de CREG (un Wi×HSSi de 0,42
  // salía como 0). Estos conservan lo que se ve en pantalla.
  | 'num1' // 1 decimal, en celda de tabla
  | 'num2' // 2 decimales, en celda de tabla
  | 'totalNum1'
  | 'totalNum2'
  | 'value1' // 1 decimal, suelto (tarjetas del encabezado)
  | 'value2'
  | 'value8' // el índice de disponibilidad, que se lee en la octava cifra
  | 'valueInt';

// Índice de cada estilo dentro de <cellXfs> de styles.xml. El 0 es el default
// (celda sin estilo). No cambiar sin actualizar STYLES_XML.
const STYLE_INDEX: Record<XlsxStyle, number> = {
  title: 1,
  header: 2,
  text: 3,
  money: 4,
  qty: 5,
  groupText: 6,
  groupMoney: 7,
  groupQty: 8,
  totalText: 9,
  totalMoney: 10,
  totalQty: 11,
  labelBold: 12,
  value: 13,
  cardHeader: 14,
  cardLabel: 15,
  cardValue: 16,
  greenBarText: 17,
  greenBarMoney: 18,
  signLine: 19,
  signName: 20,
  signRole: 21,
  num1: 22,
  num2: 23,
  totalNum1: 24,
  totalNum2: 25,
  value1: 26,
  value2: 27,
  value8: 28,
  valueInt: 29,
};

export interface XlsxCell {
  v: string | number | null;
  s?: XlsxStyle;
  /**
   * Fórmula de Excel SIN el `=` inicial (p. ej. "D28*G28"). Se guarda en `<f>`
   * junto al valor calculado en `<v>` como caché; Excel la recalcula al abrir.
   * Las funciones van en inglés (PMT, SUM) y los argumentos separados por coma,
   * como exige OOXML, sin importar el idioma de Excel.
   */
  f?: string;
}
/** Una celda puede ser un valor pelado (sin estilo) o {v, s}. */
export type XlsxCellInput = XlsxCell | string | number | null;
export type XlsxRow = XlsxCellInput[];

const normCell = (c: XlsxCellInput): XlsxCell => {
  if (c === null) return { v: null };
  if (typeof c === 'string' || typeof c === 'number') return { v: c };
  return c;
};

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** (fila 0-based, col 0-based) -> referencia A1 (A1, B1, ..., AA1). */
const cellRef = (row: number, col: number): string => {
  let c = col;
  let name = '';
  do {
    name = String.fromCharCode(65 + (c % 26)) + name;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return `${name}${row + 1}`;
};

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="#,##0.0"/><numFmt numFmtId="167" formatCode="#,##0.00"/><numFmt numFmtId="168" formatCode="0.00000000"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA7F3D0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF059669"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border><border><left/><right/><top style="medium"><color rgb="FF000000"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="30">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="164" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="166" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="167" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const buildContentTypes = (hasImage: boolean) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>${hasImage ? '\n<Default Extension="png" ContentType="image/png"/>' : ''}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hasImage ? '\n<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
</Types>`;

/**
 * Logo anclado a una celda (oneCellAnchor). Flota desde la celda (col,row) con
 * un tamaño fijo en EMU (1 px = 9525 EMU), así conserva su proporción en vez de
 * estirarse a un rango de celdas.
 */
export interface XlsxImage {
  data: Uint8Array; // bytes PNG
  col: number;
  row: number;
  colOff?: number; // desplazamiento dentro de la celda ancla (EMU)
  rowOff?: number;
  widthEmu: number;
  heightEmu: number;
}

// Dibujo con la imagen anclada a una celda y tamaño fijo. El r:embed apunta a la
// relación de la imagen en drawing1.xml.rels.
const buildDrawingXml = (img: XlsxImage) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>${img.colOff ?? 0}</xdr:colOff><xdr:row>${img.row}</xdr:row><xdr:rowOff>${img.rowOff ?? 0}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(img.widthEmu)}" cy="${Math.round(img.heightEmu)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo" descr="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(img.widthEmu)}" cy="${Math.round(img.heightEmu)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;

const DRAWING_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;

const SHEET_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Excel prohíbe : \ / ? * [ ] en el nombre de hoja y lo corta a 31 chars. */
const sanitizeSheetName = (name: string) =>
  (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Hoja1').slice(0, 31);

const buildWorkbookXml = (sheetName: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const buildCellXml = (cell: XlsxCell, ref: string): string => {
  const s = cell.s ? ` s="${STYLE_INDEX[cell.s]}"` : '';
  // Celda con fórmula: <f> + <v> de caché (el valor calculado, para que se vea
  // correcto antes de que Excel recalcule).
  if (cell.f) {
    const cached = typeof cell.v === 'number' && Number.isFinite(cell.v) ? cell.v : 0;
    return `<c r="${ref}"${s}><f>${escapeXml(cell.f)}</f><v>${cached}</v></c>`;
  }
  if (cell.v == null || cell.v === '') return `<c r="${ref}"${s}/>`;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell.v))}</t></is></c>`;
};

const buildSheetXml = (
  rows: XlsxRow[],
  colWidths?: number[],
  merges?: string[],
  ignoredTextRanges?: string[],
  hasDrawing = false,
): string => {
  const cols = colWidths?.length
    ? `<cols>${colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((c, ci) => buildCellXml(normCell(c), cellRef(r, ci)))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  // <mergeCells> debe ir DESPUÉS de <sheetData> según el esquema.
  const mergeXml = merges?.length
    ? `<mergeCells count="${merges.length}">${merges
        .map((ref) => `<mergeCell ref="${escapeXml(ref)}"/>`)
        .join('')}</mergeCells>`
    : '';
  // <ignoredErrors> va casi al final del esquema (después de mergeCells). Marca
  // rangos donde no queremos el aviso "número guardado como texto" (triángulo
  // verde) para los valores de tarjeta que escribimos con formato de pantalla.
  const ignoredXml = ignoredTextRanges?.length
    ? `<ignoredErrors>${ignoredTextRanges
        .map((ref) => `<ignoredError sqref="${escapeXml(ref)}" numberStoredAsText="1"/>`)
        .join('')}</ignoredErrors>`
    : '';
  // <drawing> va al final del esquema (después de ignoredErrors). Referencia el
  // dibujo del logo por su relación en sheet1.xml.rels.
  const drawingXml = hasDrawing ? '<drawing r:id="rId1"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${cols}<sheetData>${body}</sheetData>${mergeXml}${ignoredXml}${drawingXml}</worksheet>`;
};

/**
 * Arma un .xlsx en memoria y devuelve el Blob listo para descargar.
 * @param sheetName Nombre de la hoja (se sanea y corta a 31 chars).
 * @param rows      Filas; cada celda es un valor pelado o {v, s}.
 * @param colWidths Anchos de columna opcionales (en "caracteres" de Excel).
 */
export async function buildXlsxBlob(
  sheetName: string,
  rows: XlsxRow[],
  colWidths?: number[],
  merges?: string[],
  ignoredTextRanges?: string[],
  image?: XlsxImage,
): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(buildContentTypes(!!image)),
    '_rels/.rels': strToU8(RELS_XML),
    'xl/workbook.xml': strToU8(buildWorkbookXml(sanitizeSheetName(sheetName))),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS_XML),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/worksheets/sheet1.xml': strToU8(buildSheetXml(rows, colWidths, merges, ignoredTextRanges, !!image)),
  };
  if (image) {
    files['xl/worksheets/_rels/sheet1.xml.rels'] = strToU8(SHEET_RELS_XML);
    files['xl/drawings/drawing1.xml'] = strToU8(buildDrawingXml(image));
    files['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(DRAWING_RELS_XML);
    files['xl/media/image1.png'] = image.data;
  }
  const zipped = zipSync(files);
  // Copia a un ArrayBuffer «limpio» para que el Blob no arrastre el offset del
  // buffer subyacente de fflate.
  return new Blob([zipped.slice()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Dispara la descarga de un Blob con el nombre dado. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
