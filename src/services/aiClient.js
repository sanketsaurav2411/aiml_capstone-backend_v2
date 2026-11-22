const fs = require('fs');
const { aiServiceUrl, internalApiKey, useGcpOidc } = require('../config');
const { AppError } = require('../lib/errors');

let cachedOidcToken = null;
let cachedOidcExpiresAt = 0;

async function getOidcIdToken(audience) {
  if (!useGcpOidc) return null;
  const now = Date.now();
  if (cachedOidcToken && now < cachedOidcExpiresAt) {
    return cachedOidcToken;
  }

  const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(metadataUrl, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch GCP OIDC identity token: ${res.status}`);
  }
  const token = (await res.text()).trim();
  cachedOidcToken = token;
  cachedOidcExpiresAt = now + 40 * 60 * 1000;
  return token;
}

async function buildServiceHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (internalApiKey) {
    headers['X-Internal-Api-Key'] = internalApiKey;
  }
  if (useGcpOidc) {
    const idToken = await getOidcIdToken(aiServiceUrl);
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }
  }
  return headers;
}

function encodeAttachments(files = []) {
  return files.map((file) => {
    const rawBuffer = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
    let extractedText = null;
    let contentBase64 = null;

    if (rawBuffer) {
      const textTypes = ['text/plain', 'text/csv', 'application/json'];
      if (textTypes.includes(file.mimetype)) {
        extractedText = rawBuffer.toString('utf-8');
      } else {
        contentBase64 = rawBuffer.toString('base64');
      }
    }

    return {
      name: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      extracted_text: extractedText,
      content_base64: contentBase64,
    };
  });
}

async function sendAgentChat({ threadId, userId, message, files = [], history = [] }) {
  const headers = await buildServiceHeaders();
  const payload = {
    thread_id: threadId,
    user_id: userId,
    message: message || '',
    attachments: encodeAttachments(files),
    history,
  };

  let response;
  try {
    response = await fetch(`${aiServiceUrl}/api/v1/agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new AppError(`AI intelligence service unreachable: ${err.message}`, 503);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new AppError(`AI service error (${response.status}): ${bodyText || response.statusText}`, 502);
  }

  return response.json();
}

async function getAiHealth() {
  try {
    const headers = await buildServiceHeaders();
    const res = await fetch(`${aiServiceUrl}/api/v1/health`, { headers });
    if (!res.ok) return { status: 'degraded', code: res.status };
    return res.json();
  } catch (err) {
    return { status: 'unreachable', error: err.message };
  }
}

async function getAiMetrics() {
  const headers = await buildServiceHeaders();
  const res = await fetch(`${aiServiceUrl}/api/v1/metrics/summary`, { headers });
  if (!res.ok) {
    throw new AppError('Unable to fetch AI telemetry metrics', 502);
  }
  return res.json();
}

module.exports = {
  sendAgentChat,
  getAiHealth,
  getAiMetrics,
};
