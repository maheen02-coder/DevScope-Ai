import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parse } from '../lib/validation.js'
import { notFound } from '../lib/errors.js'
import { deleteReport, getReportById, listReports, updateReport } from '../services/reports.js'
import { createNote, deleteNote, listNotes } from '../services/notes.js'
import { createShare, getActiveShare, revokeShares } from '../services/shares.js'

const router = Router()

const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  saved: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ensureId(id) {
  if (!idPattern.test(id)) throw notFound('Report not found.')
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(listSchema, req.query)
    const saved = query.saved === undefined ? undefined : query.saved === 'true'
    res.json(listReports(req.user.id, { ...query, saved }))
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    const report = getReportById(req.params.id, req.user.id)
    if (!report) throw notFound('Report not found.')
    res.json({ report })
  }),
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    const input = parse(
      z
        .object({
          title: z.string().trim().min(1).max(120).optional(),
          saved: z.boolean().optional(),
        })
        .refine((data) => data.title !== undefined || data.saved !== undefined, {
          message: 'Provide a title or saved state.',
        }),
      req.body ?? {},
    )
    res.json({ report: updateReport(req.user.id, req.params.id, input) })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    deleteReport(req.user.id, req.params.id)
    res.status(204).end()
  }),
)

const noteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

router.get(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    res.json({ notes: listNotes(req.user.id, req.params.id) })
  }),
)

router.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    const input = parse(noteSchema, req.body ?? {})
    res.status(201).json({ note: createNote(req.user.id, req.params.id, input.body) })
  }),
)

router.delete(
  '/:id/notes/:noteId',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    ensureId(req.params.noteId)
    deleteNote(req.user.id, req.params.id, req.params.noteId)
    res.status(204).end()
  }),
)

const shareSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(365).optional().default(30),
})

router.get(
  '/:id/share',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    res.json({ share: getActiveShare(req.user.id, req.params.id) })
  }),
)

router.post(
  '/:id/share',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    const input = parse(shareSchema, req.body ?? {})
    const share = createShare(req.user.id, req.params.id, input.expiresInDays)
    res.status(201).json({ share })
  }),
)

router.delete(
  '/:id/share',
  asyncHandler(async (req, res) => {
    ensureId(req.params.id)
    revokeShares(req.user.id, req.params.id)
    res.status(204).end()
  }),
)

export default router
