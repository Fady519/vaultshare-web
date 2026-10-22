import { useSession } from '@/store/session'
import type { ErrorCode, ProblemDetails, RefreshResponse, StepUpAction } from './types'

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  code: ErrorCode
  errors?: Record<string, string[]>
  action?: StepUpAction

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title)
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code
    this.errors = problem.errors
    this.action = problem.action
  }
}

type RequestOptions = {
  body?: unknown
  stepUpToken?: string
  signal?: AbortSignal
  // internal: stop retry loops
  retried?: boolean
}

/*
  Step-up (FR-17): when the server answers 403 STEP_UP_REQUIRED we ask the
  registered handler (the step-up modal, phase 5) for a token and send the
  same request again with it. No handler = the error goes to the caller.
*/
type StepUpHandler = (action: StepUpAction) => Promise<string | null>
let stepUpHandler: StepUpHandler | null = null

export function setStepUpHandler(handler: StepUpHandler | null) {
  stepUpHandler = handler
}

// one refresh at a time, every 401 waiting on it shares the same promise
let refreshing: Promise<string | null> | null = null

export function refreshAccessToken() {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) return null
        const data = (await res.json()) as RefreshResponse
        useSession.getState().setAccessToken(data.accessToken)
        return data.accessToken
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

// only used when the server sends no "code" (e.g. a proxy error page)
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED'
    case 401:
      return 'UNAUTHENTICATED'
    case 403:
      return 'FORBIDDEN_ROLE'
    case 404:
      return 'NOT_FOUND'
    case 410:
      return 'LINK_GONE'
    case 413:
      return 'QUOTA_EXCEEDED'
    case 429:
      return 'RATE_LIMITED'
    default:
      return 'NETWORK_ERROR'
  }
}

async function toProblem(res: Response): Promise<ProblemDetails> {
  const base = {
    status: res.status,
    title: res.statusText || 'Request failed',
    code: codeForStatus(res.status),
  }
  try {
    return { ...base, ...(await res.json()) }
  } catch {
    return base
  }
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = useSession.getState().accessToken
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.stepUpToken) headers['X-Step-Up-Token'] = opts.stepUpToken

  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError({ status: 0, title: 'Network error', code: 'NETWORK_ERROR' })
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  const problem = await toProblem(res)

  if (res.status === 401 && problem.code === 'TOKEN_EXPIRED' && !opts.retried) {
    const fresh = await refreshAccessToken()
    if (fresh) return request<T>(method, path, { ...opts, retried: true })
    useSession.getState().clear()
  }

  if (problem.code === 'STEP_UP_REQUIRED' && problem.action && stepUpHandler && !opts.retried) {
    const stepUpToken = await stepUpHandler(problem.action)
    if (stepUpToken) return request<T>(method, path, { ...opts, stepUpToken, retried: true })
  }

  throw new ApiError(problem)
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
