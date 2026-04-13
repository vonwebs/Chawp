import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Global cache that persists across component mount/unmount
const dataCache = new Map();
const fetchStatusCache = new Map();
const CACHE_PREFIX = "@chawp_data_cache:";
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 5;

const getPersistentKey = (cacheKey) => `${CACHE_PREFIX}${cacheKey}`;

const hydrateFromPersistentCache = async (cacheKey, ttlMs) => {
  try {
    const raw = await AsyncStorage.getItem(getPersistentKey(cacheKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== "number") return null;

    if (Date.now() - parsed.timestamp > ttlMs) {
      await AsyncStorage.removeItem(getPersistentKey(cacheKey));
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.warn("Failed to hydrate persistent cache:", error);
    return null;
  }
};

const persistCache = async (cacheKey, value) => {
  try {
    await AsyncStorage.setItem(
      getPersistentKey(cacheKey),
      JSON.stringify({
        timestamp: Date.now(),
        data: value,
      }),
    );
  } catch (error) {
    console.warn("Failed to persist cache:", error);
  }
};

/**
 * Custom hook for data fetching with loading, error states, and refresh capability.
 * Ready to integrate with backend API endpoints.
 *
 * @param {Function} fetchFunction - Async function that fetches data
 * @param {Array} dependencies - Dependencies array for re-fetching (only when these values actually change)
 * @param {string} cacheKey - Optional cache key for persisting data across unmounts
 * @returns {Object} { data, loading, error, refresh }
 */
export function useDataFetching(
  fetchFunction,
  dependencies = [],
  cacheKey = null,
  ttlMs = DEFAULT_CACHE_TTL_MS,
) {
  // Generate cache key if not provided
  const generatedCacheKey =
    cacheKey || fetchFunction?.name || Math.random().toString();

  // Initialize with cached data if available
  const [data, setData] = useState(
    () => dataCache.get(generatedCacheKey) || null,
  );
  const [loading, setLoading] = useState(
    () => !dataCache.has(generatedCacheKey),
  );
  const [hydrated, setHydrated] = useState(() =>
    dataCache.has(generatedCacheKey),
  );
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);
  const prevDepsRef = useRef(dependencies);
  const fetchFunctionRef = useRef(fetchFunction);

  // Update the fetch function ref whenever it changes
  useEffect(() => {
    fetchFunctionRef.current = fetchFunction;
  }, [fetchFunction]);

  useEffect(() => {
    prevDepsRef.current = dependencies;
  }, [generatedCacheKey]);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      if (dataCache.has(generatedCacheKey)) {
        if (active) setHydrated(true);
        return;
      }

      const persistedData = await hydrateFromPersistentCache(
        generatedCacheKey,
        ttlMs,
      );

      if (persistedData !== null) {
        dataCache.set(generatedCacheKey, persistedData);
        fetchStatusCache.set(generatedCacheKey, true);

        if (active) {
          setData(persistedData);
          setLoading(false);
        }
      }

      if (active) {
        setHydrated(true);
      }
    };

    hydrate();

    return () => {
      active = false;
    };
  }, [generatedCacheKey, ttlMs]);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (!fetchFunctionRef.current) return;

      const hasFetched = fetchStatusCache.get(generatedCacheKey);

      // Only show loading on first fetch or explicit refresh
      if (!hasFetched || isRefresh) {
        setLoading(true);
      }

      try {
        setError(null);
        const result = await fetchFunctionRef.current();

        if (isMountedRef.current) {
          setData(result);
          // Cache the data globally
          dataCache.set(generatedCacheKey, result);
          fetchStatusCache.set(generatedCacheKey, true);
          persistCache(generatedCacheKey, result);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err.message || "Failed to fetch data");
          console.error("Data fetch error:", err);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [generatedCacheKey],
  ); // Stable with cache key

  useEffect(() => {
    isMountedRef.current = true;

    if (!hydrated) {
      return () => {
        isMountedRef.current = false;
      };
    }

    const hasFetched = fetchStatusCache.get(generatedCacheKey);

    // Check if dependencies actually changed (deep comparison for primitives)
    const depsChanged =
      dependencies.length > 0 &&
      JSON.stringify(prevDepsRef.current) !== JSON.stringify(dependencies);

    // Fetch if:
    // 1. Never fetched before (not in cache)
    // 2. Dependencies actually changed (when provided)
    if (!hasFetched || depsChanged) {
      prevDepsRef.current = dependencies;
      fetchData();
    } else {
      // Data already cached and deps haven't changed
      setLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [hydrated, generatedCacheKey, ...dependencies]); // Only depend on actual dependencies, not fetchData

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh, setData };
}

/**
 * Hook for paginated data fetching
 *
 * @param {Function} fetchFunction - Async function that accepts page number
 * @param {number} initialPage - Starting page number
 * @returns {Object} { data, loading, error, page, nextPage, prevPage, hasMore }
 */
export function usePaginatedData(fetchFunction, initialPage = 1) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(
    async (pageNum) => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchFunction(pageNum);

        if (pageNum === 1) {
          setData(result.items || result);
        } else {
          setData((prev) => [...prev, ...(result.items || result)]);
        }

        setHasMore(result.hasMore !== undefined ? result.hasMore : true);
      } catch (err) {
        setError(err.message || "Failed to fetch data");
        console.error("Paginated fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    [fetchFunction],
  );

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const nextPage = useCallback(() => {
    if (hasMore && !loading) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore, loading]);

  const prevPage = useCallback(() => {
    if (page > 1 && !loading) {
      setPage((prev) => prev - 1);
    }
  }, [page, loading]);

  const reset = useCallback(() => {
    setPage(1);
    setData([]);
    setHasMore(true);
  }, []);

  return { data, loading, error, page, nextPage, prevPage, hasMore, reset };
}
