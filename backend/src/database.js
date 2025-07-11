// config/database.js
const { Sequelize } = require('sequelize');

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
