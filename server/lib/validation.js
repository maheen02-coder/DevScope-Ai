import { ApiError } from './errors.js'

export function parse(schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) {
    const fields = {}
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join('.') : '_'
      if (!fields[key]) fields[key] = issue.message
    }
    throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', {
      fields,
    })
  }
  return result.data
}

export const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99})$/
export const repoPattern = /^[A-Za-z0-9_.-]{1,100}$/

export function normalizeOwner(value) {
  return String(value || '').trim()
}

export function normalizeRepo(value) {
  return String(value || '')
    .trim()
    .replace(/\.git$/i, '')
}
