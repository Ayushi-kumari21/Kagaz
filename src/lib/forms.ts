import { PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, type PDFFont } from 'pdf-lib'
import type { PDFDocumentProxy } from './pdf'

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'select'

/** One visible box of a fillable form field (a field can have several boxes, e.g. radio options). */
export interface FormField {
  id: string
  name: string
  page: number
  kind: FieldKind
  /** Box in page display units (scale 1, top-left origin). */
  x: number
  y: number
  w: number
  h: number
  multiline?: boolean
  maxLen?: number
  comb?: boolean
  readOnly?: boolean
  fontSize?: number
  align?: 'left' | 'center' | 'right'
  /** For checkbox/radio: the value this box stands for. */
  onValue?: string
  options?: { value: string; label: string }[]
}

export type FormValues = Record<string, string | boolean>

interface RawAnnot {
  id: string
  subtype: string
  fieldType?: string
  fieldName?: string
  fieldValue?: string | string[]
  rect: number[]
  checkBox?: boolean
  radioButton?: boolean
  pushButton?: boolean
  exportValue?: string
  buttonValue?: string
  multiLine?: boolean
  comb?: boolean
  maxLen?: number
  readOnly?: boolean
  hidden?: boolean
  textAlignment?: number
  options?: { exportValue: string; displayValue: string }[]
  defaultAppearanceData?: { fontSize?: number }
}

/** Find every fillable field in the document using pdf.js (which also gives us screen positions). */
export async function extractFields(doc: PDFDocumentProxy): Promise<{ fields: FormField[]; values: FormValues }> {
  const fields: FormField[] = []
  const values: FormValues = {}
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const annots = (await page.getAnnotations({ intent: 'display' })) as RawAnnot[]
    for (const a of annots) {
      if (a.subtype !== 'Widget' || !a.fieldName || a.hidden || a.pushButton) continue
      const [x1, y1] = vp.convertToViewportPoint(a.rect[0], a.rect[1])
      const [x2, y2] = vp.convertToViewportPoint(a.rect[2], a.rect[3])
      const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
      if (box.w < 2 || box.h < 2) continue
      const base = { id: `${a.id}-${i}`, name: a.fieldName, page: i - 1, readOnly: !!a.readOnly, ...box }
      const val = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue

      if (a.fieldType === 'Tx') {
        fields.push({
          ...base,
          kind: 'text',
          multiline: !!a.multiLine,
          comb: !!a.comb,
          maxLen: a.maxLen || undefined,
          fontSize: a.defaultAppearanceData?.fontSize || 0,
          align: a.textAlignment === 1 ? 'center' : a.textAlignment === 2 ? 'right' : 'left',
        })
        if (!(a.fieldName in values)) values[a.fieldName] = val ?? ''
      } else if (a.fieldType === 'Btn' && a.checkBox) {
        fields.push({ ...base, kind: 'checkbox', onValue: a.exportValue })
        if (!(a.fieldName in values)) values[a.fieldName] = !!val && val !== 'Off'
      } else if (a.fieldType === 'Btn' && a.radioButton) {
        fields.push({ ...base, kind: 'radio', onValue: a.buttonValue })
        if (!(a.fieldName in values) || (val && val !== 'Off')) values[a.fieldName] = val && val !== 'Off' ? val : ''
      } else if (a.fieldType === 'Ch') {
        fields.push({
          ...base,
          kind: 'select',
          options: (a.options || []).map((o) => ({ value: o.exportValue, label: o.displayValue })),
        })
        if (!(a.fieldName in values)) values[a.fieldName] = val ?? ''
      }
    }
    page.cleanup()
  }
  return { fields, values }
}

function encodable(font: PDFFont, text: string) {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Write values into the PDF's real form fields.
 * Returns names of text fields whose value uses characters the standard font can't show
 * (e.g. Hindi); the caller draws those on the page instead.
 * With lock, every field becomes read-only.
 */
/** Font size to use for a text box: the form's own size, or a sensible one when it says "auto" (0). */
export function fieldFontSize(f: { fontSize?: number; h: number; multiline?: boolean }) {
  const own = f.fontSize || 0
  if (own > 0) return Math.min(own, f.multiline ? 14 : f.h * 0.85)
  return f.multiline ? Math.min(10, f.h * 0.4) : Math.max(6, Math.min(12, f.h * 0.65))
}

export async function fillForm(doc: PDFDocument, values: FormValues, lock: boolean): Promise<string[]> {
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const drawInstead: string[] = []
  for (const field of form.getFields()) {
    const name = field.getName()
    if (!(name in values)) continue
    const v = values[name]
    try {
      if (field instanceof PDFTextField) {
        let text = String(v ?? '')
        if (text && !encodable(font, text.replace(/\n/g, ''))) {
          drawInstead.push(name)
          text = ''
        }
        const max = field.getMaxLength()
        field.setText(max ? text.slice(0, max) : text)
        // "auto" (0) or oversized fonts would fill the whole box with giant text; use a normal size
        const da = field.acroField.getDefaultAppearance() || ''
        const m = da.match(/([\d.]+)\s+Tf/)
        const own = m ? Number(m[1]) : 0
        const h = field.acroField.getWidgets()[0]?.getRectangle().height || 20
        const want = fieldFontSize({ fontSize: own, h, multiline: field.isMultiline() })
        if (Math.abs(want - own) > 0.01) field.setFontSize(want)
        if (drawInstead.includes(name)) {
          // the text is drawn on the page under the box, so the box must not paint an opaque background over it
          for (const w of field.acroField.getWidgets()) {
            const mk = w.dict.lookupMaybe(PDFName.of('MK'), PDFDict)
            mk?.delete(PDFName.of('BG'))
          }
        }
      } else if (field instanceof PDFCheckBox) {
        if (v) field.check()
        else field.uncheck()
      } else if (field instanceof PDFRadioGroup) {
        if (v && field.getOptions().includes(String(v))) field.select(String(v))
        else if (!v) field.clear()
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        const opts = field.getOptions()
        if (v && opts.includes(String(v))) field.select(String(v))
      }
    } catch (e) {
      console.warn('Could not fill field', name, e)
    }
  }
  try {
    form.updateFieldAppearances(font)
  } catch (e) {
    console.warn('Appearance update failed', e)
  }
  if (lock) {
    // read-only keeps the form's look exactly, but answers can no longer be changed in PDF readers
    for (const field of form.getFields()) field.enableReadOnly()
  }
  return drawInstead
}
