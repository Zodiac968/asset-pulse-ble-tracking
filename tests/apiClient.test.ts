import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveApi } from '@/services/api'
import { ApiError } from '@/types/api'
import { DEFAULT_ROOM } from '@/config/constants'

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

const api = (opts: Partial<Parameters<typeof createLiveApi>[0]> = {}) =>
  createLiveApi({ baseUrl: 'https://api.example.test/', getAccessToken: () => 'TOKEN', timeoutMs: 50, ...opts })

afterEach(() => vi.unstubAllGlobals())

describe('live API client', () => {
  it('sends the access token as a Bearer header and normalizes the result', async () => {
    const fetchFn = mockFetch(200, { status: 'insufficient_data', x: null, y: null, receivers_used: 2 })
    const asset = await api().getAsset()
    expect(asset.status).toBe('insufficient_data')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.test/asset')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
  })

  it('PUTs exactly the documented config payload', async () => {
    const fetchFn = mockFetch(200, { ok: true, configuration: DEFAULT_ROOM, warning: null })
    await api().putConfig(DEFAULT_ROOM)
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual(DEFAULT_ROOM)
  })

  it('surfaces the backend { error } message', async () => {
    mockFetch(400, { error: 'Calibration models for all three receivers are required' })
    await expect(api().applyCalibration('S1')).rejects.toMatchObject({ kind: 'http', status: 400, message: 'Calibration models for all three receivers are required' })
  })

  it('reports 401 as unauthorized and notifies the session', async () => {
    mockFetch(401, { message: 'Unauthorized' })
    const onUnauthorized = vi.fn()
    await expect(api({ onUnauthorized }).getConfig()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('reports 403 as forbidden', async () => {
    mockFetch(403, {})
    await expect(api().startCalibration()).rejects.toMatchObject({ kind: 'forbidden', status: 403 })
  })

  it('does not call the API without a token', async () => {
    const fetchFn = mockFetch(200, {})
    await expect(api({ getAccessToken: () => null }).getAsset()).rejects.toBeInstanceOf(ApiError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps network failures and timeouts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(api().getHealth()).rejects.toMatchObject({ kind: 'network' })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    )
    await expect(api().getHealth()).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('rejects malformed responses instead of inventing data', async () => {
    mockFetch(200, { width: 6 })
    await expect(api().getConfig()).rejects.toMatchObject({ kind: 'parse' })
    mockFetch(200, '<html>gateway</html>')
    await expect(api().getAsset()).rejects.toMatchObject({ kind: 'parse' })
  })
})
