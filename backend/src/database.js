// config/database.js
const { Sequelize } = require('sequelize');

// DEBUG: Check environment variables
console.log('🔍 DEBUG: DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('🔍 DEBUG: DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0);
console.log('🔍 DEBUG: NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 DEBUG: All env vars starting with DB:', Object.keys(process.env).filter(key => key.startsWith('DB')));

// Option 1: SQLite (for development)
//const sequelize = new Sequelize({
 // dialect: 'sqlite',
 // storage: './database.sqlite',
 // logging: console.log, // Set to false to disable SQL logging
//});

// Option 2: PostgreSQL (for production with DATABASE_URL or individual vars)
let sequelize;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL (typical for Render, Heroku, etc.)
  console.log('🔄 Using DATABASE_URL connection');
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: console.log,
  });
} else {
  // Use individual environment variables (for local development)
  console.log('🔄 Using individual environment variables');
  console.log('🔍 DB_HOST:', process.env.DB_HOST || 'localhost');
  console.log('🔍 DB_PORT:', process.env.DB_PORT || 5432);
  console.log('🔍 DB_NAME:', process.env.DB_NAME || 'task_management');
  console.log('🔍 DB_USER:', process.env.DB_USER || 'postgres');
  
  sequelize = new Sequelize(
    process.env.DB_NAME || 'task_management',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'password',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: console.log,
    }
  );
}

// Option 3: MySQL (uncomment if using MySQL)
/*
const sequelize = new Sequelize(
  process.env.DB_NAME || 'task_management',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: console.log,
  }
);
*/

// Test the connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
};

module.exports = sequelize;
module.exports.testConnection = testConnection;
