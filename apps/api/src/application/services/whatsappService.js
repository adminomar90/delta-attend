import { env } from '../../config/env.js';
import { sanitizeWhatsappNumber } from '../../shared/attendanceUtils.js';

const WHATSAPP_GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

const safeExtractError = (payload = {}) => {
  if (payload?.error?.message) {
    return payload.error.message;
  }

  if (Array.isArray(payload?.errors) && payload.errors[0]?.message) {
    return payload.errors[0].message;
  }

  return '';
};

const sendViaCloudApi = async ({ to, message }) => {
  if (!env.whatsappCloudApiToken || !env.whatsappCloudPhoneNumberId) {
    return {
      attempted: false,
      sent: false,
      provider: 'WHATSAPP_CLOUD_API',
      reason: 'cloud_api_not_configured',
    };
  }

  const endpoint = `${WHATSAPP_GRAPH_API_BASE}/${env.whatsappCloudPhoneNumberId}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsappCloudApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: String(message || ''),
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    const messageId = payload?.messages?.[0]?.id || '';

    if (!response.ok || !messageId) {
      return {
        attempted: true,
        sent: false,
        provider: 'WHATSAPP_CLOUD_API',
        reason: response.ok ? 'cloud_api_missing_message_id' : 'cloud_api_request_failed',
        error: safeExtractError(payload) || `Cloud API responded with status ${response.status}`,
      };
    }

    return {
      attempted: true,
      sent: true,
      provider: 'WHATSAPP_CLOUD_API',
      messageId,
    };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      provider: 'WHATSAPP_CLOUD_API',
      reason: 'cloud_api_network_error',
      error: error?.message || 'Unknown Cloud API error',
    };
  }
};

export const whatsappService = {
  async sendTextMessage({ to, message }) {
    const normalizedTo = sanitizeWhatsappNumber(to);

    if (!normalizedTo) {
      return {
        attempted: false,
        sent: false,
        provider: 'NONE',
        reason: 'missing_recipient_number',
      };
    }

    if (!env.attendanceWhatsappAutoSend) {
      return {
        attempted: false,
        sent: false,
        provider: 'DISABLED',
        reason: 'auto_send_disabled',
      };
    }

    return sendViaCloudApi({
      to: normalizedTo,
      message,
    });
  },

  async sendAttendanceNotification({ to, message }) {
    return this.sendTextMessage({ to, message });
  },
};
