import healthRoutes from './healthRoute.js';
import messageRoutes from './messageRoute.js';
import templateRoutes from './templateRoute.js';
import webhookRoutes from './webhookRoute.js';
import authRoutes from './authRoute.js';
import jobRoutes from './jobRoute.js';
import flowRoutes from './flowRoute.js';
import triggerRoutes from './triggerRoute.js';
import sessionRoutes from './sessionRoute.js';
import analyticsRoutes from './analyticsRoute.js';

export default function setupRoutes(app) {
  app.use(healthRoutes);
  app.use(messageRoutes);
  app.use(templateRoutes);
  app.use(webhookRoutes);
  app.use(authRoutes);
  app.use(jobRoutes);
  app.use(flowRoutes);
  app.use(triggerRoutes);
  app.use(sessionRoutes);
  app.use('/api/analytics', analyticsRoutes);
  
  // Default route
  app.get("/", (req, res) => {
    res.send(`<pre>Nothing to see here.
    Checkout README.md to start.</pre>`);
  });
}