require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const { seedDatabase } = require('./seed');
const { createIpAllowlistMiddleware } = require('./middleware/ipAllowlist');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const theatreRoutes = require('./routes/theatres');
const performanceRoutes = require('./routes/performances');
const attendanceRoutes = require('./routes/attendance');
const connectionRoutes = require('./routes/connections');
const feedRoutes = require('./routes/feed');

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin: string) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', true);

// Middleware
app.use(createIpAllowlistMiddleware());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/theatres', theatreRoutes);
app.use('/api/performances', performanceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/feed', feedRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Podium App API draait! 🎭' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Er is een interne fout opgetreden.' });
});

// Start server
async function start() {
  try {
    await initDb();
    console.log('📦 Database geïnitialiseerd');

    await seedDatabase();
    console.log('🌱 Seed data geladen');

    app.listen(PORT, () => {
      console.log(`\n🎭 Podium App API draait op http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
