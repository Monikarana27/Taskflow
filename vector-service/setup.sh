#!/bin/bash

# Task Management App Setup Script
echo "🚀 Setting up Task Management Application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"

# Create project directory structure
echo "📁 Creating project structure..."

# Backend structure
mkdir -p backend/src backend/routes backend/models
mkdir -p frontend/src/components frontend/src/utils

# Create necessary files
echo "📝 Creating configuration files..."

# Backend package.json
cat > backend/package.json << 'EOF'
{
  "name": "task-backend",
  "version": "1.0.0",
  "description": "Task Management Backend API",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3",
    "pg-hstore": "^2.3.4"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

# Backend environment file
cat > backend/.env << 'EOF'
DB_HOST=postgres
DB_PORT=5432
DB_NAME=taskdb
DB_USER=taskuser
DB_PASSWORD=taskpass
PORT=5000
EOF

# Frontend environment file
cat > frontend/.env << 'EOF'
REACT_APP_API_URL=http://localhost:5000
EOF

# Python requirements for vector search
cat > backend/requirements.txt << 'EOF'
sentence-transformers==2.2.2
psycopg2-binary==2.9.7
python-dotenv==1.0.0
numpy==1.24.3
EOF

echo "🐳 Building and starting Docker containers..."

# Build and start containers
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "🌐 Application URLs:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend API: http://localhost:5000"
    echo "   Database: localhost:5432"
    echo ""
    echo "📊 To view logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 To stop services:"
    echo "   docker-compose down"
    echo ""
    echo "🔄 To restart services:"
    echo "   docker-compose restart"
else
    echo "❌ Some services failed to start. Check logs with:"
    echo "   docker-compose logs"
fi

# Setup vector search (optional)
echo ""
echo "🔍 Setting up vector search (optional)..."
echo "To enable vector search, run:"
echo "   cd backend && python vector_search.py"