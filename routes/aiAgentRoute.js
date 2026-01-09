import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * Generate OpenAI Realtime API ephemeral key
 *
 * This endpoint creates a temporary session key for the OpenAI Realtime API
 * which is used for voice agent interactions on the frontend.
 *
 * @route GET /api/ephemeral
 * @returns {Object} { key: string } - Ephemeral API key
 */
router.get('/ephemeral', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not configured in environment variables');
      return res.status(500).json({
        error: 'OpenAI API key not configured',
        message: 'Please configure OPENAI_API_KEY in your environment variables'
      });
    }

    // Create ephemeral key for Realtime API
    // Docs: https://platform.openai.com/docs/api-reference/realtime
    const response = await axios.post(
      'https://api.openai.com/v1/realtime/sessions',
      {
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy', // or 'echo', 'fable', 'onyx', 'nova', 'shimmer'
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Return the ephemeral key
    res.json({
      key: response.data.client_secret.value,
    });

  } catch (error) {
    console.error('❌ Error generating ephemeral key:', error.response?.data || error.message);

    // Handle specific OpenAI API errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Invalid OpenAI API key',
        message: 'The configured OpenAI API key is invalid or expired'
      });
    }

    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'The OpenAI API key does not have access to the Realtime API'
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'OpenAI API rate limit exceeded. Please try again later'
      });
    }

    // Generic error
    res.status(500).json({
      error: 'Failed to generate ephemeral key',
      message: error.response?.data?.error?.message || 'An unexpected error occurred'
    });
  }
});

export default router;
