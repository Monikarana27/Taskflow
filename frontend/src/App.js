import React, { useState, useEffect } from 'react';
import { Plus, Search, Moon, Sun, Filter, MoreHorizontal, Trash2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import './App.css';

// Custom hook for caching - COPIED FROM FIRST CODE
const useTaskCache = () => {
  const CACHE_KEY = 'tasks';
  
  const getCachedTasks = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  };
  
  const setCachedTasks = (tasks) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  };
  
  const clearCache = () => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };
  
  return { getCachedTasks, setCachedTasks, clearCache };
};

// Custom hook for theme management
const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return { theme, toggleTheme };
};

// Custom hook for task management with localStorage persistence
const useTaskManager = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { getCachedTasks, setCachedTasks, clearCache } = useTaskCache();

  // Initial sample tasks
  const initialTasks = [
    { id: 1, title: 'Design new landing page', description: 'Create wireframes and mockups for the new product landing page', status: 'in progress', created_at: '2024-06-01', priority: 'high' },
    { id: 2, title: 'Review team proposals', description: 'Go through the quarterly planning proposals from each team member', status: 'todo', created_at: '2024-06-02', priority: 'medium' },
    { id: 3, title: 'Update documentation', description: 'Revise API documentation with latest changes', status: 'done', created_at: '2024-05-28', priority: 'low' },
    { id: 4, title: 'Client meeting preparation', description: 'Prepare presentation slides for quarterly review', status: 'todo', created_at: '2024-06-03', priority: 'high' }
  ];

  // Load tasks from cache or use initial tasks
  useEffect(() => {
    const loadTasks = () => {
      try {
        setLoading(true);
        setError(null);
        
        const cachedTasks = getCachedTasks();
        if (cachedTasks && cachedTasks.length > 0) {
          setTasks(cachedTasks);
        } else {
          // Use initial tasks if no cache exists
          setTasks(initialTasks);
          setCachedTasks(initialTasks);
        }
      } catch (err) {
        setError('Failed to load tasks');
        setTasks(initialTasks);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  const addTask = async (taskData) => {
    setLoading(true);
    try {
      const newTask = {
        id: Date.now(),
        ...taskData,
        created_at: new Date().toISOString().split('T')[0],
        priority: taskData.priority || 'medium'
      };
      const updatedTasks = [newTask, ...tasks];
      setTasks(updatedTasks);
      setCachedTasks(updatedTasks); // Save to cache
      setError(null);
    } catch (err) {
      setError('Failed to add task');
    } finally {
      setLoading(false);
    }
  };

  const updateTask = async (id, updates) => {
    setLoading(true);
    try {
      const updatedTasks = tasks.map(task => 
        task.id === id ? { ...task, ...updates } : task
      );
      setTasks(updatedTasks);
      setCachedTasks(updatedTasks); // Save to cache
      setError(null);
    } catch (err) {
      setError('Failed to update task');
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (id) => {
    setLoading(true);
    try {
      const updatedTasks = tasks.filter(task => task.id !== id);
      setTasks(updatedTasks);
      setCachedTasks(updatedTasks); // Save to cache
      setError(null);
    } catch (err) {
      setError('Failed to delete task');
    } finally {
      setLoading(false);
    }
  };

  // Manual cache refresh
  const refreshCache = () => {
    clearCache();
    setTasks(initialTasks);
    setCachedTasks(initialTasks);
  };

  return { tasks, loading, error, addTask, updateTask, deleteTask, refreshCache };
};

function App() {
  const { theme, toggleTheme } = useTheme();
  const { tasks, loading, error, addTask, updateTask, deleteTask, refreshCache } = useTaskManager();
  
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium' });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);

  // Filter tasks based on search and filters
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Task statistics
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'done').length,
    inProgress: tasks.filter(t => t.status === 'in progress').length,
    todo: tasks.filter(t => t.status === 'todo').length
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    
    await addTask(newTask);
    setNewTask({ title: '', description: '', priority: 'medium' });
    setShowAddForm(false);
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'high': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'medium': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'low': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      default: return null;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'in progress': return <Clock className="w-5 h-5 text-blue-500" />;
      case 'todo': return <AlertCircle className="w-5 h-5 text-gray-400" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="app-title">TaskFlow</h1>
            <p className="app-subtitle">Organize your work, amplify your productivity</p>
          </div>
          <div className="header-actions">
            <button onClick={refreshCache} className="refresh-btn">
              🔄 Refresh Cache
            </button>
            <button onClick={toggleTheme} className="theme-toggle">
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => setShowAddForm(true)} 
              className="add-task-btn primary-btn"
            >
              <Plus className="w-5 h-5" />
              Add Task
            </button>
          </div>
        </div>
      </header>

      {/* Statistics Dashboard */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon total">
            <MoreHorizontal className="w-6 h-6" />
          </div>
          <div className="stat-content">
            <div className="stat-number">{stats.total}</div>
            <div className="stat-label">Total Tasks</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon completed">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="stat-content">
            <div className="stat-number">{stats.completed}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon in-progress">
            <Clock className="w-6 h-6" />
          </div>
          <div className="stat-content">
            <div className="stat-number">{stats.inProgress}</div>
            <div className="stat-label">In Progress</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon todo">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="stat-content">
            <div className="stat-number">{stats.todo}</div>
            <div className="stat-label">To Do</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls-section">
        <div className="search-container">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filters">
          <div className="filter-group">
            <Filter className="filter-icon" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="todo">To Do</option>
              <option value="in progress">In Progress</option>
              <option value="done">Completed</option>
            </select>
          </div>
          
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Task</h2>
              <button onClick={() => setShowAddForm(false)} className="close-btn">×</button>
            </div>
            <form onSubmit={handleAddTask} className="task-form">
              <div className="form-group">
                <label htmlFor="title">Task Title</label>
                <input
                  id="title"
                  type="text"
                  placeholder="Enter task title..."
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  placeholder="Enter task description..."
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="form-textarea"
                  rows="3"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="priority">Priority</label>
                <select
                  id="priority"
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  className="form-select"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
              
              <div className="form-actions">
                <button type="button" onClick={() => setShowAddForm(false)} className="secondary-btn">
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tasks List */}
      <div className="tasks-section">
        <div className="section-header">
          <h2>Tasks ({filteredTasks.length})</h2>
        </div>
        
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <CheckCircle2 className="w-16 h-16" />
            </div>
            <h3>No tasks found</h3>
            <p>
              {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first task to get started'}
            </p>
          </div>
        ) : (
          <div className="tasks-grid">
            {filteredTasks.map(task => (
              <div key={task.id} className={`task-card ${task.status} ${task.priority}-priority`}>
                <div className="task-header">
                  <div className="task-priority">
                    {getPriorityIcon(task.priority)}
                  </div>
                  <div className="task-actions">
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="action-btn delete-btn"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="task-content">
                  <h3 className="task-title">{task.title}</h3>
                  {task.description && (
                    <p className="task-description">{task.description}</p>
                  )}
                </div>
                
                <div className="task-footer">
                  <div className="task-status">
                    {getStatusIcon(task.status)}
                    <select
                      value={task.status}
                      onChange={(e) => updateTask(task.id, { status: e.target.value })}
                      className="status-select"
                    >
                      <option value="todo">To Do</option>
                      <option value="in progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  
                  <div className="task-meta">
                    <span className="task-date">
                      {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;