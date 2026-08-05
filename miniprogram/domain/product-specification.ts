export type ProductSpecificationTagKind = 'dimension' | 'grit' | 'shape' | 'generic'

export interface ProductSpecificationTag {
  key: string
  kind: ProductSpecificationTagKind
  label: string
  value: string
}

const DIMENSION_PATTERN = /^(\d+(?:\.\d+)?(?:\s*(?:x|X|×|\*)\s*\d+(?:\.\d+)?){0,3})\s*(mm|cm|m|in|inch)?$/i
const GRIT_PATTERN = /^(?:P\s*(\d+)|#\s*(\d+))$/i
const SHAPE_PATTERN = /^T\s*(\d+)$/i

function normalizeDimensions(value: string): string {
  return value.replace(/\s*(?:x|X|×|\*)\s*/g, ' × ').trim()
}

function createTag(
  index: number,
  kind: ProductSpecificationTagKind,
  label: string,
  value: string,
): ProductSpecificationTag {
  return { key: `${kind}-${index}`, kind, label, value }
}

export function parseProductSpecification(input: unknown): ProductSpecificationTag[] {
  const source = String(input || '').trim()
  if (!source) return []

  return source
    .split(/[，,；;、|/]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token, index) => {
      const dimensions = token.match(DIMENSION_PATTERN)
      if (dimensions) {
        const value = `${normalizeDimensions(dimensions[1])}${dimensions[2] ? ` ${dimensions[2].toLowerCase()}` : ''}`
        return createTag(index, 'dimension', '尺寸', value)
      }

      const grit = token.match(GRIT_PATTERN)
      if (grit) return createTag(index, 'grit', '粒度', `P${grit[1] || grit[2]}`)

      const shape = token.match(SHAPE_PATTERN)
      if (shape) return createTag(index, 'shape', '型式', `T${shape[1]}`)

      return createTag(index, 'generic', '规格', token)
    })
}
