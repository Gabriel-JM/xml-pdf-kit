import { XMLParser } from 'fast-xml-parser'
import { writeFile } from 'node:fs/promises'
import PDFDocument from 'pdfkit'

type TagData = {
  textNode?: string
  attrs?: Record<string, string>
}

function xml(templateStrings: TemplateStringsArray, ...values: unknown[]) {
  const fullXML = templateStrings.reduce((acc, txt, index) => {
    const valueStr = values[index]

    return acc + txt + valueStr
  }, '')

  return fullXML
}

const tagsMap = new Map()
  .set('text', (pdfDoc: typeof PDFDocument, obj: TagData) => {
    const { attrs = {} } = obj

    if (attrs.font) {
      pdfDoc.font(attrs.font)
    }

    if (attrs.fontSize) {
      pdfDoc.fontSize(Number(attrs.fontSize))
    }

    if (attrs.color) {
      pdfDoc.fillColor(attrs.color)
    }
    
    pdfDoc.text(
      obj.textNode ?? '',
      {
        ...attrs.width && { width: Number(attrs.width) },
        ...attrs.align && { align: attrs.align }
      }
    )
  })
  .set('page', (pdfDoc: typeof PDFDocument) => {
    pdfDoc.addPage()
  })

function generatePDF(xmlText: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributesGroupName: 'attrs',
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    alwaysCreateTextNode: true,
    textNodeName: 'textNode'
  })

  const { document } = parser.parse(xmlText)

  const { attrs = {}, ...xmlObj } = document

  const pdfDocument = new PDFDocument({
    ...attrs,
    autoFirstPage: false
  })

  const pdfPromise = new Promise((resolve) => {
    const buffers = []
    pdfDocument
      .on('data', buffers.push.bind(buffers))
      .on('end', () => resolve(Buffer.concat(buffers)))
  })

  runThroughObj(pdfDocument, xmlObj)

  pdfDocument.end()

  return pdfPromise
}

function runThroughObj(pdfDoc: typeof PDFDocument, obj: Record<string, TagData>) {
  for (const [field, value] of Object.entries(obj)) {
    console.log(field, value)

    if (field === 'attrs') {
      continue
    }

    if (Array.isArray(value)) {
      for (const tagData of value) {
        runThroughObj(pdfDoc, { [field]: tagData })
      }
    }

    if (value && typeof value === 'object') {
      const handler = tagsMap.get(field)

      if (!handler) continue

      const { attrs, textNode, ...children } = value

      handler(pdfDoc, {
        attrs,
        textNode
      })

      runThroughObj(pdfDoc, children)
    }
  }
}

const pdfBuffer = await generatePDF(xml`
  <document>
    <page>
      <text
        color="red"
        fontSize="20"
        align="center"
      >
        Title
      </text>
      <text color="black" fontSize="12">Paragraph</text>
    </page>
  </document>
`)

await writeFile('./tmp.pdf', pdfBuffer as Buffer)
