/**
 * Service Client for Authenticated Service-to-Service API Calls
 * Handles making HTTP requests with service authentication
 */

const axios = require('axios');

class ServiceClient {
  /**
   * Client for making authenticated service-to-service API calls
   * @param {string} serviceName - Name of calling service ('nodejs', 'django', 'fastapi')
   */
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.serviceKey = process.env[`${serviceName.toUpperCase()}_SERVICE_KEY`];

    if (!this.serviceKey) {
      const error = `Missing service key for ${serviceName}. Please set ${serviceName.toUpperCase()}_SERVICE_KEY in environment variables.`;
      console.error(`❌ ${error}`);
      throw new Error(error);
    }

    console.log(`✅ ServiceClient initialized for ${serviceName}`);
  }

  /**
   * Get headers for service request
   * @param {string|null} tenantId - Tenant ID for tenant-specific operations
   * @returns {Object} Headers object
   */
  getHeaders(tenantId = null) {
    const headers = {
      'X-Service-Key': this.serviceKey,
      'Content-Type': 'application/json',
    };

    if (tenantId) {
      headers['X-Tenant-Id'] = tenantId;
    }

    return headers;
  }

  /**
   * Make GET request to another service
   * @param {string} url - Full URL to request
   * @param {string|null} tenantId - Tenant ID for tenant-specific operations
   * @param {Object|null} params - Query parameters
   * @param {number} timeout - Request timeout in milliseconds
   * @returns {Promise<any>} Response data
   */
  async get(url, tenantId = null, params = null, timeout = 30000) {
    try {
      console.log(`🔄 Service GET: ${url} (tenant: ${tenantId || 'none'})`);

      const response = await axios.get(url, {
        headers: this.getHeaders(tenantId),
        params: params,
        timeout: timeout,
      });

      console.log(`✅ Service GET success: ${url} (${response.status})`);
      return response.data;

    } catch (error) {
      console.error(`❌ Service GET failed: ${url}`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Make POST request to another service
   * @param {string} url - Full URL to request
   * @param {Object} data - JSON data to send
   * @param {string|null} tenantId - Tenant ID for tenant-specific operations
   * @param {number} timeout - Request timeout in milliseconds
   * @returns {Promise<any>} Response data
   */
  async post(url, data, tenantId = null, timeout = 30000) {
    try {
      console.log(`🔄 Service POST: ${url} (tenant: ${tenantId || 'none'})`);

      const response = await axios.post(url, data, {
        headers: this.getHeaders(tenantId),
        timeout: timeout,
      });

      console.log(`✅ Service POST success: ${url} (${response.status})`);
      return response.data;

    } catch (error) {
      console.error(`❌ Service POST failed: ${url}`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Make PATCH request to another service
   * @param {string} url - Full URL to request
   * @param {Object} data - JSON data to send
   * @param {string|null} tenantId - Tenant ID for tenant-specific operations
   * @param {number} timeout - Request timeout in milliseconds
   * @returns {Promise<any>} Response data
   */
  async patch(url, data, tenantId = null, timeout = 30000) {
    try {
      console.log(`🔄 Service PATCH: ${url} (tenant: ${tenantId || 'none'})`);

      const response = await axios.patch(url, data, {
        headers: this.getHeaders(tenantId),
        timeout: timeout,
      });

      console.log(`✅ Service PATCH success: ${url} (${response.status})`);
      return response.data;

    } catch (error) {
      console.error(`❌ Service PATCH failed: ${url}`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Make PUT request to another service
   * @param {string} url - Full URL to request
   * @param {Object} data - JSON data to send
   * @param {string|null} tenantId - Tenant ID for tenant-specific operations
   * @param {number} timeout - Request timeout in milliseconds
   * @returns {Promise<any>} Response data
   */
  async put(url, data, tenantId = null, timeout = 30000) {
    try {
      console.log(`🔄 Service PUT: ${url} (tenant: ${tenantId || 'none'})`);

      const response = await axios.put(url, data, {
        headers: this.getHeaders(tenantId),
        timeout: timeout,
      });

      console.log(`✅ Service PUT success: ${url} (${response.status})`);
      return response.data;

    } catch (error) {
      console.error(`❌ Service PUT failed: ${url}`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Make DELETE request to another service
   * @param {string} url - Full URL to request
   * @param {string|null} tenantId - Tenant ID for tenant-specific operations
   * @param {number} timeout - Request timeout in milliseconds
   * @returns {Promise<any>} Response data (empty if no content)
   */
  async delete(url, tenantId = null, timeout = 30000) {
    try {
      console.log(`🔄 Service DELETE: ${url} (tenant: ${tenantId || 'none'})`);

      const response = await axios.delete(url, {
        headers: this.getHeaders(tenantId),
        timeout: timeout,
      });

      console.log(`✅ Service DELETE success: ${url} (${response.status})`);
      return response.data || {};

    } catch (error) {
      console.error(`❌ Service DELETE failed: ${url}`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
      throw error;
    }
  }
}

// Create singleton instance for Node.js service
const nodejsClient = new ServiceClient('nodejs');

// Export both class and singleton
module.exports = {
  ServiceClient,
  nodejsClient,
};
