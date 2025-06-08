#!/usr/bin/env python3
"""
Vector Search Service for Task Management
This script generates embeddings for task descriptions and performs similarity search
"""

import os
import json
import psycopg2
import numpy as np
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class VectorSearchService:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.connection = None
        self.connect_to_db()
    
    def connect_to_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(
                host=os.getenv('DB_HOST', 'localhost'),
                port=os.getenv('DB_PORT', '5432'),
                database=os.getenv('DB_NAME', 'taskdb'),
                user=os.getenv('DB_USER', 'taskuser'),
                password=os.getenv('DB_PASSWORD', 'taskpass')
            )
            print("Connected to PostgreSQL database")
        except Exception as e:
            print(f"Error connecting to database: {e}")
            raise
    
    def generate_embedding(self, text):
        """Generate embedding for given text"""
        if not text:
            return None
        
        try:
            embedding = self.model.encode(text)
            return embedding.tolist()
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return None
    
    def update_task_embedding(self, task_id, description):
        """Update embedding for a specific task"""
        if not description:
            return False
        
        embedding = self.generate_embedding(description)
        if not embedding:
            return False
        
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                "UPDATE tasks SET embedding = %s WHERE id = %s",
                (embedding, task_id)
            )
            self.connection.commit()
            cursor.close()
            return True
        except Exception as e:
            print(f"Error updating task embedding: {e}")
            self.connection.rollback()
            return False
    
    def update_all_embeddings(self):
        """Generate embeddings for all tasks that don't have them"""
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                "SELECT id, title, description FROM tasks WHERE embedding IS NULL"
            )
            tasks = cursor.fetchall()
            
            updated_count = 0
            for task_id, title, description in tasks:
                # Combine title and description for better embeddings
                text = f"{title}. {description}" if description else title
                embedding = self.generate_embedding(text)
                
                if embedding:
                    cursor.execute(
                        "UPDATE tasks SET embedding = %s WHERE id = %s",
                        (embedding, task_id)
                    )
                    updated_count += 1
            
            self.connection.commit()
            cursor.close()
            print(f"Updated embeddings for {updated_count} tasks")
            return updated_count
        except Exception as e:
            print(f"Error updating embeddings: {e}")
            self.connection.rollback()
            return 0
    
    def vector_search(self, query, limit=5):
        """Perform vector similarity search"""
        query_embedding = self.generate_embedding(query)
        if not query_embedding:
            return []
        
        try:
            cursor = self.connection.cursor()
            cursor.execute("""
                SELECT id, title, description, status, 
                       embedding <-> %s as distance
                FROM tasks 
                WHERE embedding IS NOT NULL
                ORDER BY distance
                LIMIT %s
            """, (query_embedding, limit))
            
            results = cursor.fetchall()
            cursor.close()
            
            # Convert to list of dictionaries
            search_results = []
            for row in results:
                search_results.append({
                    'id': row[0],
                    'title': row[1],
                    'description': row[2],
                    'status': row[3],
                    'similarity': 1 - row[4]  # Convert distance to similarity
                })
            
            return search_results
        except Exception as e:
            print(f"Error performing vector search: {e}")
            return []
    
    def close_connection(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()

def main():
    """Main function to test the vector search service"""
    service = VectorSearchService()
    
    try:
        # Update all embeddings
        print("Updating embeddings for all tasks...")
        updated = service.update_all_embeddings()
        print(f"Updated {updated} task embeddings")
        
        # Test search
        query = "shopping"
        print(f"\nSearching for: '{query}'")
        results = service.vector_search(query, limit=3)
        
        for i, result in enumerate(results, 1):
            print(f"{i}. {result['title']} (similarity: {result['similarity']:.3f})")
            print(f"   Description: {result['description']}")
            print(f"   Status: {result['status']}")
            print()
        
    finally:
        service.close_connection()

if __name__ == "__main__":
    main()