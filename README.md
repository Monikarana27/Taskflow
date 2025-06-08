# 📝 Taskflow

> A modern full-stack To-Do List Web App built with React, Express, and PostgreSQL, enhanced with Redis caching, AI-powered vector search, and Docker for seamless containerization.

**Developed by:** Monika  
**License:** Proprietary - All rights reserved

---

## 🚨 Troubleshooting

### Common Issues

#### 1. **Port Already in Use**
```bash
# Check what's using the port
lsof -i :3000  # or :5000, :5432, :6379

# Kill the process
kill -9 <PID>

# Or use different ports in docker-compose.yml
```

#### 2. **Docker Build Fails**
```bash
# Clear Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

#### 3. **Database Connection Issues**
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Access database directly
docker-compose exec postgres psql -U postgres -d taskmanager

# Reset database
docker-compose down -v
docker-compose up postgres
```

#### 4. **Frontend Won't Load**
```bash
# Check if backend is accessible
curl http://localhost:5000/api/health

# Clear browser cache
# Check browser console for errors
```

#### 5. **Vector Search Not Working**
```bash
# Install Python dependencies
cd vector-service
pip install -r requirements.txt

# Check if pgvector extension is loaded
docker-compose exec postgres psql -U postgres -d taskmanager -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

### Performance Tips

- **First Run:** Allow 3-5 minutes for initial setup
- **Subsequent Runs:** Use `docker-compose up` (without `--build`)
- **Development:** Use manual setup for faster iteration
- **Production:** Always use Docker containers

### Getting Help

If you encounter issues:
1. Check the troubleshooting section above
2. Review service logs: `docker-compose logs -f [service-name]`
3. Ensure all prerequisites are installed
4. Try resetting: `docker-compose down -v && docker-compose up --build`

---

## 🚀 Features

- ✅ **Task CRUD Operations** - Create, Read, Update, Delete tasks
- ⚡ **Real-time Status Updates** - Instant task status synchronization
- 📦 **Redis-based Caching** - Enhanced performance through intelligent caching
- 🧠 **AI Vector Search** - Semantic task search using embeddings (pgvector)
- 📱 **Responsive UI** - Mobile-first design with React
- 🐳 **Fully Containerized** - Easy deployment via Docker Compose

---

## 🏗️ Architecture

```
Frontend (React)   <--->   Backend (Express)   <--->   PostgreSQL + pgvector
        ↑                             ↕
        └──────────── Redis (cache) ◄─┘
```

---

## 📁 Project Structure

```
task-management-app/
├── frontend/           # React UI components and pages
├── backend/            # Express API & Redis logic
├── vector-service/     # AI Embedding & Vector Search (Python)
├── docker-compose.yml  # Multi-service orchestration
├── package.json        # Root setup (optional utility scripts)
└── query/              # Dev/test SQL or prompt scratchpad
```

---

## ⚙️ Getting Started

### Prerequisites

Before running the application, ensure you have the following installed:

- **Docker** (v20.10 or higher) + **Docker Compose** (v2.0 or higher)
- **Python 3.8+** (for vector-service)
- **Node.js 16+** and **npm** (for development mode only)
- **Git** (for cloning the repository)

### 🚀 Installation & Setup

#### Option 1: Docker (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Monikarana27/Taskflow.git
   cd task-management-app
   ```

2. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```
   
   *This command will:*
   - Build all Docker images
   - Start PostgreSQL database with pgvector extension
   - Launch Redis cache server
   - Start the Express backend API
   - Launch the React frontend
   - Set up the Python vector service

3. **Wait for services to initialize** (usually 2-3 minutes)

4. **Verify services are running:**
   ```bash
   docker-compose ps
   ```

5. **Access the application:**
   - 🌐 **Frontend (Main App):** http://localhost:3000
   - 🔧 **Backend API:** http://localhost:5000
   - 📊 **API Health Check:** http://localhost:5000/api/health
   - 🔴 **Redis:** localhost:6379
   - 🗄️ **PostgreSQL Database:** localhost:5432

#### Option 2: Manual Setup (Development)

1. **Clone and setup the project:**
   ```bash
   git clone https://github.com/Monikarana27/Taskflow.git
   cd task-management-app
   ```

2. **Start PostgreSQL and Redis (using Docker):**
   ```bash
   docker-compose up -d postgres redis
   ```

3. **Setup Backend:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. **Setup Frontend (in a new terminal):**
   ```bash
   cd frontend
   npm install
   npm start
   ```

5. **Setup Vector Service (in a new terminal):**
   ```bash
   cd vector-service
   pip install -r requirements.txt
   python vector_search.py
   ```

### 🔧 Configuration

#### Environment Variables
Create `.env` files in respective directories:

**Backend (.env):**
```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskmanager
DB_USER=postgres
DB_PASSWORD=password
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Frontend (.env):**
```env
REACT_APP_API_URL=http://localhost:5000
```

### 🧪 Testing the Setup

1. **Check if all services are running:**
   ```bash
   # Check Docker containers
   docker-compose ps
   
   # Check API health
   curl http://localhost:5000/api/health
   ```

2. **Test basic functionality:**
   - Open http://localhost:3000
   - Create a new task
   - Edit the task
   - Delete the task
   - Try the search functionality

### 🛑 Stopping the Application

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clears database)
docker-compose down -v

# Stop specific service
docker-compose stop frontend
```

---

## 🧠 AI Vector Search Setup

Enable semantic task search using AI embeddings:

1. **Navigate to vector service:**
   ```bash
   cd vector-service
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Generate embeddings:**
   ```bash
   python vector_search.py
   ```

---

## 🔍 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | Fetch all tasks |
| `POST` | `/api/tasks` | Create a new task |
| `PUT` | `/api/tasks/:id` | Update task by ID |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `POST` | `/api/tasks/search` | Semantic task search |

---

## 🗃️ Redis Caching Strategy

- **Caches:** Task lists with configurable TTL
- **Invalidation:** Automatic on task add/update/delete operations
- **Benefits:** Reduced database load and improved response times

---

## 📦 Docker Commands

### Basic Operations
```bash
# Start all services
docker-compose up

# Start with rebuild (recommended for first run)
docker-compose up --build

# Start in detached mode (background)
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes (clears database)
docker-compose down -v
```

### Debugging & Monitoring
```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Check service status
docker-compose ps

# Access container shell
docker-compose exec backend bash
docker-compose exec postgres psql -U postgres -d taskmanager
```

### Rebuilding Services
```bash
# Rebuild specific service
docker-compose build backend

# Rebuild and restart specific service
docker-compose up --build backend

# Force rebuild (no cache)
docker-compose build --no-cache
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React, Axios, localStorage |
| **Backend** | Node.js, Express, Redis |
| **Database** | PostgreSQL + pgvector |
| **AI/ML** | Python + sentence-transformers |
| **DevOps** | Docker & Docker Compose |

---

## 💡 Key Design Decisions

### 1. **Frontend-Backend Separation**
- **Why:** Clean separation of concerns for independent scaling
- **Implementation:** React SPA + Express with RESTful API

### 2. **Docker-based Architecture**
- **Why:** Simplified environment management and CI/CD readiness
- **Implementation:** Single docker-compose.yml for all services

### 3. **pgvector for Semantic Search**
- **Why:** Traditional SQL LIKE searches lack semantic understanding
- **Implementation:** Vector embeddings with cosine similarity

### 4. **Client-side Caching**
- **Why:** Offline support and reduced server requests
- **Implementation:** localStorage with cache invalidation

### 5. **Minimalist UI Design**
- **Why:** Universal usability across all age groups and devices
- **Implementation:** Clean, card-based layout with intuitive controls

---

## ⚖️ Trade-offs Analysis

| Area | Chosen Approach | Trade-off |
|------|----------------|-----------|
| **Search** | Vector embeddings | Requires Python + AI model setup |
| **Caching** | localStorage | Fast offline access vs. centralized Redis |
| **Deployment** | Dockerized | Slower cold start vs. easy environment management |
| **Database** | PostgreSQL + pgvector | Heavier setup vs. vector search capabilities |
| **Backend** | Node.js | Lightweight vs. compiled language performance |
| **State Management** | useState + props | Simplicity vs. scalability (Redux/MobX) |

---

## 📌 Future Roadmap

- 🔐 **User Authentication** - JWT-based secure login
- 🏷️ **Categories & Tags** - Enhanced task organization
- ⏰ **Due Date Notifications** - Smart reminder system
- 👥 **Task Collaboration** - Sharing and team features
- 🌙 **Dark Mode Toggle** - Theme customization

---
![image](https://github.com/user-attachments/assets/c49d0857-415f-4bf3-9bc0-95d07c3a496f)

![image](https://github.com/user-attachments/assets/a4f6d3ef-8868-4a4b-b9dd-9efddccdd9e6)


## 🔒 License & Ownership

This project is privately developed and maintained by **Monika**. All rights reserved.

---

## 🤝 Contributing

This is a proprietary project. For any inquiries or collaboration requests, please contact the project owner.

---

*Built with ❤️ by Monika*
