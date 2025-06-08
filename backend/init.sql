-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embedding vector(384) -- 384 dimensions for all-MiniLM-L6-v2 model
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS tasks_embedding_idx ON tasks USING ivfflat (embedding vector_cosine_ops);

-- Insert sample data
INSERT INTO tasks (title, description, status) VALUES
('Finish report', 'Complete Q3 summary', 'todo'),
('Team meeting', 'Discuss project goals', 'done'),
('Buy groceries', 'Milk, eggs, bread', 'todo'),
('Exercise routine', 'Go for a 30-minute run', 'in progress'),
('Read documentation', 'Study React hooks and state management', 'todo');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE
    ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();