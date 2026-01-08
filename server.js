import express from "express";
import cors from 'cors';
import session from "express-session";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import NodeCache from 'node-cache';
import setupRoutes from './routes/index.js';
import { clearInactiveSessions } from './utils.js';
import { setupAggregationJobs } from './analytics/aggregation.js';
import "./setupAuth.js";
import sessionManager from './sessionManager.js';
import {
  apiRateLimiter,
  skipRateLimitForServices,
  conditionalRateLimit,
  cleanupRateLimiter
} from './middleware/rateLimiter.js';

// Initialize cache and other shared resources
export const messageCache = new NodeCache({ stdTTL: 600 });
export const userSessions = sessionManager; // Redis-based session manager
export const nurenConsumerMap = {};
export const customWebhook = new Map();

// Load environment variables
dotenv.config();

// Server setup
const PORT = process.env.PORT || 8080;



const app = express();
const httpServer = createServer(app);
const allowedOrigins = [
  'http://localhost:8080', 
  'http://localhost:5174', 
  'http://localhost:5173', 
  'https://whatsappbotserver.azurewebsites.net',
  'https://nuren.ai/'
];

// Socket.io setup
export const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Middleware setup
app.use(
  express.json({
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  }),
);

app.use(cors());

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    return res.status(204).end();
  }
  
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  
  next();
});

app.use(session({
  secret: 'my_whatsapp_nuren_adarsh',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true }
}));

// Rate limiting middleware
// Skip rate limiting for internal service-to-service calls
app.use(skipRateLimitForServices);
// Apply rate limiting to all routes (will be skipped for service calls)
app.use(conditionalRateLimit(apiRateLimiter));

// Setup routes
setupRoutes(app);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

// Session cleanup
setInterval(clearInactiveSessions, 60 * 60 * 1000);

// Setup analytics aggregation cron jobs
try {
  setupAggregationJobs();
  console.log('✅ Analytics aggregation jobs initialized');
} catch (error) {
  console.error('❌ Failed to initialize analytics aggregation jobs:', error);
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Close HTTP server
    await new Promise((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ HTTP server closed');

    // Close Socket.IO
    io.close();
    console.log('✅ Socket.IO closed');

    // Disconnect session manager
    await sessionManager.disconnect();

    // Cleanup rate limiter
    await cleanupRateLimiter();

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));