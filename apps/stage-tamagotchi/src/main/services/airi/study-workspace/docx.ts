import type { StudyWorkspaceDocxDocument } from '../../../../shared/eventa/study-workspace'

import { Buffer } from 'node:buffer'

import JSZip from 'jszip'
import mammoth from 'mammoth'

import { array, literal, looseObject, nullish, object, optional, parse, string, unknown } from 'valibot'

const documentSchema = looseObject({ type: literal('document'), children: array(unknown()) })
const nodeSchema = object({
  type: string(),
  children: optional(array(unknown())),
  value: optional(string()),
  styleId: nullish(string()),
  styleName: nullish(string()),
})

async function validateArchive(data: Buffer) {
  const archive = await JSZip.loadAsync(data)
  const entries = Object.values(archive.files)
  if (entries.length > 1000)
    throw new Error('DOCX archives must contain at most 1,000 entries.')
  let expanded = 0
  for (const entry of entries) {
    if (entry.dir)
      continue
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer')
      stream.on('data', (chunk: Buffer) => {
        expanded += chunk.byteLength
        if (expanded > 20 * 1024 * 1024) {
          stream.pause()
          reject(new Error('DOCX archives must expand to at most 20 MiB.'))
        }
      })
      stream.on('error', reject)
      stream.on('end', resolve)
      stream.resume()
    })
  }
}

/**
 * Extracts body text through Mammoth's pinned document-transform API. External file access stays disabled.
 * The caller supplies folder-authorized bytes with a 10 MiB compressed limit.
 */
export async function readDocx(data: Buffer, path: string): Promise<StudyWorkspaceDocxDocument> {
  await validateArchive(data)
  const paragraphs: StudyWorkspaceDocxDocument['paragraphs'] = []
  let heading: string | undefined
  let nodes = 0
  let bytes = 2
  function visit(input: unknown, depth: number): string {
    if (++nodes > 100_000 || depth > 64)
      throw new Error('DOCX body structure exceeds the extraction limit.')
    const node = parse(nodeSchema, input)
    if (node.type === 'text') {
      if (node.value === undefined)
        throw new Error('DOCX text is missing from the parsed document.')
      return node.value
    }
    if (node.type === 'tab')
      return '\t'
    if (node.type === 'break')
      return '\n'
    let text = ''
    if (node.children) {
      for (const child of node.children)
        text += visit(child, depth + 1)
    }
    if (node.type !== 'paragraph' || !text.trim())
      return text
    text = text.trim()
    const level = node.styleId?.match(/^heading\s*([1-9])$/iu) ?? node.styleName?.match(/^heading\s*([1-9])$/iu)
    if (level || node.styleId?.toLowerCase() === 'title' || node.styleName?.toLowerCase() === 'title')
      heading = text
    const paragraph: StudyWorkspaceDocxDocument['paragraphs'][number] = { paragraph: paragraphs.length + 1, text }
    if (heading !== undefined)
      paragraph.heading = heading
    if (level)
      paragraph.headingLevel = Number(level[1])
    bytes += Buffer.byteLength(JSON.stringify(paragraph), 'utf8') + 1
    if (bytes > 256 * 1024 || paragraphs.length === 10_000)
      throw new Error('DOCX paragraph data must fit within 256 KiB and 10,000 paragraphs.')
    paragraphs.push(paragraph)
    return ''
  }
  const result = await mammoth.convertToHtml({ buffer: data }, {
    externalFileAccess: false,
    includeEmbeddedStyleMap: false,
    includeDefaultStyleMap: false,
    transformDocument(input: unknown) {
      const document = parse(documentSchema, input)
      for (const child of document.children)
        visit(child, 0)
      // The extracted paragraphs are the output. Empty children prevent image conversion and unused HTML generation.
      return { ...document, children: [] }
    },
  })
  if (result.messages.some(message => message.type === 'error'))
    throw new Error('DOCX text extraction failed.')
  if (!paragraphs.length)
    throw new Error('This DOCX contains no readable body paragraphs. Image text requires unsupported OCR.')
  return { path, format: 'docx', paragraphs, warnings: result.messages.slice(0, 10).map(message => message.message.slice(0, 240)) }
}
