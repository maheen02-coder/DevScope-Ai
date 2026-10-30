import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parse } from '../lib/validation.js'
import {
  getFile,
  getGithubStatus,
  getLanguages,
  getReadme,
  getRepo,
  getRepoTree,
  getUser,
  getUserRepos,
  searchRepositories,
  searchUsers,
} from '../services/github.js'

const router = Router()

const searchSchema = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters.').max(80),
})

const ownerParams = z.object({
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
})

const usernameParams = z.object({
  username: z.string().trim().min(1).max(39),
})

router.get(
  '/search/users',
  asyncHandler(async (req, res) => {
    const { q } = parse(searchSchema, req.query)
    res.json(await searchUsers(q))
  }),
)

router.get(
  '/search/repositories',
  asyncHandler(async (req, res) => {
    const { q } = parse(searchSchema, req.query)
    res.json(await searchRepositories(q))
  }),
)

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({ github: getGithubStatus() })
  }),
)

router.get(
  '/users/:username',
  asyncHandler(async (req, res) => {
    const { username } = parse(usernameParams, req.params)
    res.json({ user: await getUser(username) })
  }),
)

router.get(
  '/users/:username/repos',
  asyncHandler(async (req, res) => {
    const { username } = parse(usernameParams, req.params)
    res.json({ repos: await getUserRepos(username) })
  }),
)

router.get(
  '/repos/:owner/:repo',
  asyncHandler(async (req, res) => {
    const { owner, repo } = parse(ownerParams, req.params)
    const repoInfo = await getRepo(owner, repo)
    const [languages, readme] = await Promise.all([
      getLanguages(owner, repo),
      getReadme(owner, repo),
    ])
    res.json({ repo: repoInfo, languages, readme })
  }),
)

router.get(
  '/repos/:owner/:repo/tree',
  asyncHandler(async (req, res) => {
    const { owner, repo } = parse(ownerParams, req.params)
    const repoInfo = await getRepo(owner, repo)
    const tree = await getRepoTree(owner, repo, repoInfo.defaultBranch)
    res.json({ tree })
  }),
)

router.get(
  '/repos/:owner/:repo/file',
  asyncHandler(async (req, res) => {
    const { owner, repo } = parse(ownerParams, req.params)
    const query = parse(
      z.object({
        path: z.string().trim().min(1).max(400),
        ref: z.string().trim().max(100).optional(),
      }),
      req.query,
    )
    const repoInfo = await getRepo(owner, repo)
    const file = await getFile(owner, repo, query.path, query.ref || repoInfo.defaultBranch)
    res.json({ file })
  }),
)

export default router
