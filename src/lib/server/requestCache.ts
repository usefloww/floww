import { getRequest } from '@tanstack/react-start/server'

const REQUEST_CACHE_SYMBOL = Symbol('requestCache')

/**
 * Gets or creates a cache map for the current request
 */
function getRequestCache<T>(): Map<string, Promise<T>> {
  const request = getRequest() as Request & { [REQUEST_CACHE_SYMBOL]?: Map<string, Promise<T>> }

  if (!request[REQUEST_CACHE_SYMBOL]) {
    request[REQUEST_CACHE_SYMBOL] = new Map()
  }

  return request[REQUEST_CACHE_SYMBOL]
}

/**
 * Wraps an async function with per-request caching/deduplication
 * Multiple calls with the same key within a single request will share the same promise
 */
export function cachePerRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const cache = getRequestCache<T>()

  if (cache.has(key)) {
    return cache.get(key)!
  }

  const promise = fn()
  cache.set(key, promise)

  // Clean up on completion (success or failure)
  promise.finally(() => {
    cache.delete(key)
  })

  return promise
}
