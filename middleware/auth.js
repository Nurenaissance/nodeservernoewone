/**
 * Authentication Middleware for Node.js Bot Server
 * Supports dual authentication: User JWT tokens and Service API keys
 */

const jwt = require('jsonwebtoken');

// Load service keys from environment
const SERVICE_KEYS = {
  django: process.env.DJANGO_SERVICE_KEY,
  fastapi: process.env.FASTAPI_SERVICE_KEY,
  nodejs: process.env.NODEJS_SERVICE_KEY,
};

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/webhook',  // Webhook has its own signature validation
];

/**
 * Check if API key is a valid service key
 * @param {string} apiKey - The API key to validate
 * @returns {{valid: boolean, serviceName: string|null}}
 */
function isValidServiceKey(apiKey) {
  for (const [serviceName, key] of Object.entries(SERVICE_KEYS)) {
    if (key && apiKey === key) {
      return { valid: true, serviceName };
    }
  }
  return { valid: false, serviceName: null };
}

/**
 * Authentication middleware supporting both user tokens and service keys
 *
 * Authentication priority:
 * 1. Check if route is public → Allow
 * 2. Check for service API key (X-Service-Key header) → Allow
 * 3. Check for user JWT token (Authorization: Bearer) → Validate and allow
 * 4. Reject request with 401
 */
function authMiddleware(req, res, next) {
  const path = req.path;

  // 1. Allow public routes
  if (PUBLIC_ROUTES.includes(path) || path.startsWith('/docs')) {
    return next();
  }

  // 2. Check for Service API Key (X-Service-Key header)
  const serviceKey = req.headers['x-service-key'];

  if (serviceKey) {
    const { valid, serviceName } = isValidServiceKey(serviceKey);

    if (valid) {
      // Valid service request
      req.isServiceRequest = true;
      req.serviceName = serviceName;

      // Get tenant context from X-Tenant-Id header
      const tenantId = req.headers['x-tenant-id'];
      if (tenantId) {
        req.tenantId = tenantId;
      }

      console.log(`✅ Service request from: ${serviceName} (tenant: ${tenantId || 'none'})`);
      return next();
    } else {
      console.warn(`❌ Invalid service key attempted from ${req.ip}`);
      return res.status(403).json({
        error: 'forbidden',
        message: 'Invalid service key'
      });
    }
  }

  // 3. Check for User JWT Token (Authorization: Bearer token)
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify and decode JWT token
    const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || 'your-secret-key';
    const payload = jwt.verify(token, secret);

    // Add user info to request
    req.userId = payload.user_id || payload.sub;
    req.tenantId = payload.tenant_id;
    req.userRole = payload.role;
    req.scope = payload.scope;
    req.isServiceRequest = false;

    // Handle system/service scope from JWT
    if (req.scope === 'service' || req.userRole === 'system') {
      req.isService = true;
    }

    return next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Access token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      console.warn(`Invalid JWT token: ${error.message}`);
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid token'
      });
    }

    console.error(`Unexpected error in auth middleware: ${error.message}`);
    return res.status(401).json({
      error: 'authentication_error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional: Middleware to require tenant context
 * Use this after authMiddleware for endpoints that need tenant_id
 */
function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Tenant ID is required (X-Tenant-Id header)'
    });
  }
  next();
}

module.exports = {
  authMiddleware,
  requireTenant,
  isValidServiceKey,
};
