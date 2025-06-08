import { useState, useEffect, useCallback } from 'react';

// Simple in-memory cache for React components
class FrontendCache {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
  }

  set(key, data, ttl = 300000) { // 5 minutes default
    this.cache.set(key, data);
    this.timestamps.set(key, Date.now() + ttl);
  }

  get(key) {
    const timestamp = this.timestamps.get(key);
    
    if (!timestamp || Date.now() > timestamp) {
      // Expired or doesn't exist
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  clear(pattern = null) {
    if (pattern) {
      // Clear keys matching pattern
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
          this.timestamps.delete(key);
        }
      }
    } else {
      // Clear all
      this.cache.clear();
      this.timestamps.clear();
    }
  }

  size() {
    return this.cache.size;
  }
}

const frontendCache = new FrontendCache();

// Custom hook for caching API responses
export const useCache = (key, fetchFunction, ttl = 300000) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      if (!forceRefresh) {
        const cached = frontendCache.get(key);
        if (cached) {
          console.log(`Cache hit for ${key}`);
          setData(cached);
          setLoading(false);
          return cached;
        }
      }

      // Fetch fresh data
      console.log(`Fetching fresh data for ${key}`);
      const result = await fetchFunction();
      
      // Cache the result
      frontendCache.set(key, result, ttl);
      setData(result);
      
      return result;
    } catch (err) {
      setError(err);
      console.error(`Error fetching ${key}:`, err);
    } finally {
      setLoading(false);
    }
  }, [key, fetchFunction, ttl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const clearCache = useCallback(() => {
    frontendCache.clear(key);
  }, [key]);

  return {
    data,
    loading,
    error,
    refresh,
    clearCache
  };
};

// Hook for caching multiple API calls
export const useCacheMultiple = (requests, ttl = 300000) => {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    const newData = {};
    const newErrors = {};

    for (const [key, fetchFunction] of Object.entries(requests)) {
      try {
        // Check cache
        if (!forceRefresh) {
          const cached = frontendCache.get(key);
          if (cached) {
            newData[key] = cached;
            continue;
          }
        }

        // Fetch fresh
        const result = await fetchFunction();
        frontendCache.set(key, result, ttl);
        newData[key] = result;
      } catch (error) {
        newErrors[key] = error;
        console.error(`Error fetching ${key}:`, error);
      }
    }

    setData(newData);
    setErrors(newErrors);
    setLoading(false);
  }, [requests, ttl]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    data,
    loading,
    errors,
    refresh: () => fetchAll(true),
    clearCache: () => frontendCache.clear()
  };
};

// Cache management utilities
export const cacheUtils = {
  clear: (pattern) => frontendCache.clear(pattern),
  size: () => frontendCache.size(),
  
  // Get cache statistics
  getStats: () => ({
    totalEntries: frontendCache.size(),
    keys: Array.from(frontendCache.cache.keys())
  })
};

export default useCache;