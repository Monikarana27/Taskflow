import redis
import json
import hashlib
import numpy as np
import pickle
import os
from typing import Optional, List, Dict, Any

class VectorCacheManager:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            decode_responses=False  # We'll handle binary data
        )
        
        # Test connection
        try:
            self.redis_client.ping()
            print("Connected to Redis for vector caching")
        except redis.ConnectionError:
            print("Failed to connect to Redis")
            self.redis_client = None
    
    def _generate_cache_key(self, text: str, prefix: str = "embedding") -> str:
        """Generate a cache key based on text content"""
        text_hash = hashlib.md5(text.encode()).hexdigest()
        return f"{prefix}:{text_hash}"
    
    def get_embedding(self, text: str) -> Optional[np.ndarray]:
        """Get cached embedding for text"""
        if not self.redis_client:
            return None
            
        try:
            key = self._generate_cache_key(text)
            cached = self.redis_client.get(key)
            
            if cached:
                embedding = pickle.loads(cached)
                print(f"Cache hit for embedding: {text[:50]}...")
                return embedding
                
        except Exception as e:
            print(f"Error getting cached embedding: {e}")
            
        return None
    
    def set_embedding(self, text: str, embedding: np.ndarray, ttl: int = 3600):
        """Cache embedding for text (1 hour default TTL)"""
        if not self.redis_client:
            return
            
        try:
            key = self._generate_cache_key(text)
            serialized = pickle.dumps(embedding)
            self.redis_client.setex(key, ttl, serialized)
            print(f"Cached embedding for: {text[:50]}...")
            
        except Exception as e:
            print(f"Error caching embedding: {e}")
    
    def get_search_results(self, query: str, filters: Dict = None) -> Optional[List[Dict]]:
        """Get cached search results"""
        if not self.redis_client:
            return None
            
        try:
            # Include filters in cache key
            cache_data = {"query": query, "filters": filters or {}}
            cache_str = json.dumps(cache_data, sort_keys=True)
            key = self._generate_cache_key(cache_str, "search")
            
            cached = self.redis_client.get(key)
            if cached:
                results = json.loads(cached.decode())
                print(f"Cache hit for search: {query[:50]}...")
                return results
                
        except Exception as e:
            print(f"Error getting cached search results: {e}")
            
        return None
    
    def set_search_results(self, query: str, results: List[Dict], 
                          filters: Dict = None, ttl: int = 600):
        """Cache search results (10 minutes default TTL)"""
        if not self.redis_client:
            return
            
        try:
            cache_data = {"query": query, "filters": filters or {}}
            cache_str = json.dumps(cache_data, sort_keys=True)
            key = self._generate_cache_key(cache_str, "search")
            
            serialized = json.dumps(results).encode()
            self.redis_client.setex(key, ttl, serialized)
            print(f"Cached search results for: {query[:50]}...")
            
        except Exception as e:
            print(f"Error caching search results: {e}")
    
    def invalidate_search_cache(self):
        """Clear all search cache"""
        if not self.redis_client:
            return
            
        try:
            keys = self.redis_client.keys("search:*")
            if keys:
                self.redis_client.delete(*keys)
                print(f"Cleared {len(keys)} search cache entries")
                
        except Exception as e:
            print(f"Error clearing search cache: {e}")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        if not self.redis_client:
            return {"status": "disconnected"}
            
        try:
            info = self.redis_client.info()
            embedding_keys = len(self.redis_client.keys("embedding:*"))
            search_keys = len(self.redis_client.keys("search:*"))
            
            return {
                "status": "connected",
                "total_keys": info.get("db0", {}).get("keys", 0),
                "embedding_cache_entries": embedding_keys,
                "search_cache_entries": search_keys,
                "memory_usage": info.get("used_memory_human", "N/A"),
                "hit_rate": "N/A"  # Would need custom tracking
            }
            
        except Exception as e:
            return {"status": "error", "error": str(e)}

# Global instance
cache_manager = VectorCacheManager()