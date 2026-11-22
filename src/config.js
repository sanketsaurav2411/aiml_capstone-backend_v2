const path = require('path');
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: path.join(__dirname, '../uploads'),
  maxUploadSize: 5 * 1024 * 1024,
  aiServiceUrl: (process.env.AI_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, ''),
  internalApiKey: process.env.INTERNAL_API_KEY || '',
  useGcpOidc: process.env.USE_GCP_OIDC === 'true',
  sqliteDbPath: process.env.SQLITE_DB_PATH || path.join(__dirname, '../data/backend.sqlite'),
  databaseUrl: process.env.DATABASE_URL || '',
};
