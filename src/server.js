const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { port, corsOrigin } = require('./config');
const { AppError } = require('./lib/errors');
const db = require('./lib/db');
const { getAiHealth } = require('./services/aiClient');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const demoRoutes = require('./routes/demoRoutes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsOrigin.includes('*') || corsOrigin.includes(origin)) {
        return callback(null, true);
      }
      if (/^https:\/\/[a-z0-9-]+-960275674145\.europe-west1\.run\.app$/i.test(origin) ||
          /^https:\/\/[a-z0-9-]+\.europe-west1\.run\.app$/i.test(origin) ||
          origin === 'http://localhost:5173' ||
          origin === 'http://localhost:8080') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('combined'));
app.use('/api', apiLimiter);

app.get('/health', async (req, res) => {
  await db.init();
  const aiHealth = await getAiHealth();
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    aiService: aiHealth,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);
app.use('/api', demoRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details || null,
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

if (require.main === module) {
  db.init()
    .then(() => {
      app.listen(port, '0.0.0.0', () => {
        console.log(`Backend running on http://0.0.0.0:${port}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = app;
