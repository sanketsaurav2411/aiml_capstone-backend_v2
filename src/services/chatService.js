const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');
const { AppError } = require('../lib/errors');
const { sendAgentChat, getAiMetrics } = require('./aiClient');

function buildUploadedFilesMetadata(files = []) {
  return files.map((file) => ({
    name: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  }));
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function cleanupTempFiles(files = []) {
  for (const file of files) {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlink(file.path, () => {});
    }
  }
}

async function processUserChatTurn({ userId, message = '', conversationId, files = [] }) {
  const now = new Date().toISOString();
  const threadId = conversationId && conversationId.trim() ? conversationId.trim() : `conv-${uuidv4().slice(0, 12)}`;
  const cleanMessage = (message || '').trim() || (files.length ? 'Please review the attached document.' : '');

  if (!cleanMessage && files.length === 0) {
    throw new AppError('Message or uploaded file is required', 400);
  }

  let convo = await db.get('SELECT * FROM conversations WHERE id = ?', [threadId]);
  if (convo && convo.user_id !== userId) {
    throw new AppError('Access denied for this conversation', 403);
  }

  const titleSnippet = cleanMessage.slice(0, 60) + (cleanMessage.length > 60 ? '...' : '');
  if (!convo) {
    await db.run(
      'INSERT INTO conversations (id, user_id, title, active_product_profile, last_classification, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [threadId, userId, titleSnippet, '{}', null, now, now]
    );
  }

  const existingMessages = await db.all(
    'SELECT sender, text FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [threadId]
  );
  const historyForAi = existingMessages.slice(-10).map((m) => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.text,
  }));

  const uploadedMeta = buildUploadedFilesMetadata(files);
  const userMsgId = `msg-${uuidv4()}`;
  await db.run(
    `INSERT INTO messages (id, conversation_id, sender, text, files, created_at)
     VALUES (?, ?, 'user', ?, ?, ?)`,
    [userMsgId, threadId, cleanMessage, JSON.stringify(uploadedMeta), now]
  );

  let aiResponse;
  try {
    aiResponse = await sendAgentChat({
      threadId,
      userId,
      message: cleanMessage,
      files,
      history: historyForAi,
    });
  } finally {
    cleanupTempFiles(files);
  }

  const botNow = new Date().toISOString();
  const botMsgId = `msg-${uuidv4()}`;
  const activeProfile = aiResponse.active_product_profile || {};
  const classification = aiResponse.classification || null;
  const clarifyingQuestions = aiResponse.clarifying_questions || [];
  const citations = aiResponse.citations || [];
  const telemetry = aiResponse.telemetry || null;

  await db.run(
    `INSERT INTO messages (
      id, conversation_id, sender, text, action, classification,
      clarifying_questions, citations, active_product_profile,
      tariff_version, telemetry, created_at
    ) VALUES (?, ?, 'bot', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      botMsgId,
      threadId,
      aiResponse.reply,
      aiResponse.action,
      classification ? JSON.stringify(classification) : null,
      JSON.stringify(clarifyingQuestions),
      JSON.stringify(citations),
      JSON.stringify(activeProfile),
      aiResponse.tariff_version || '',
      telemetry ? JSON.stringify(telemetry) : null,
      botNow,
    ]
  );

  await db.run(
    `UPDATE conversations
     SET active_product_profile = ?, last_classification = COALESCE(?, last_classification), updated_at = ?
     WHERE id = ?`,
    [
      JSON.stringify(activeProfile),
      classification ? JSON.stringify(classification) : null,
      botNow,
      threadId,
    ]
  );

  return {
    userId,
    conversationId: threadId,
    message: cleanMessage,
    uploadedFiles: uploadedMeta,
    reply: aiResponse.reply,
    action: aiResponse.action,
    needsClarification: Boolean(aiResponse.needs_clarification),
    clarifyingQuestions,
    activeProductProfile: activeProfile,
    classification,
    citations,
    tariffVersion: aiResponse.tariff_version,
    telemetry,
    createdAt: botNow,
  };
}

async function listUserConversations(userId) {
  const rows = await db.all(
    `SELECT id, title, active_product_profile, last_classification, created_at, updated_at
     FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    activeProductProfile: safeJsonParse(row.active_product_profile, {}),
    lastClassification: safeJsonParse(row.last_classification, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getConversationDetail(userId, conversationId) {
  const convo = await db.get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  if (!convo) {
    throw new AppError('Conversation not found', 404);
  }
  if (convo.user_id !== userId) {
    throw new AppError('Access denied for this conversation', 403);
  }

  const msgRows = await db.all(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );

  return {
    id: convo.id,
    title: convo.title,
    activeProductProfile: safeJsonParse(convo.active_product_profile, {}),
    lastClassification: safeJsonParse(convo.last_classification, null),
    createdAt: convo.created_at,
    updatedAt: convo.updated_at,
    messages: msgRows.map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      action: m.action || undefined,
      classification: safeJsonParse(m.classification, null),
      clarifyingQuestions: safeJsonParse(m.clarifying_questions, []),
      citations: safeJsonParse(m.citations, []),
      activeProductProfile: safeJsonParse(m.active_product_profile, {}),
      tariffVersion: m.tariff_version || undefined,
      telemetry: safeJsonParse(m.telemetry, null),
      files: safeJsonParse(m.files, []),
      createdAt: m.created_at,
    })),
  };
}

async function deleteUserConversation(userId, conversationId) {
  const convo = await db.get('SELECT id, user_id FROM conversations WHERE id = ?', [conversationId]);
  if (!convo) {
    throw new AppError('Conversation not found', 404);
  }
  if (convo.user_id !== userId) {
    throw new AppError('Access denied for this conversation', 403);
  }
  await db.run('DELETE FROM conversations WHERE id = ?', [conversationId]);
  return { deleted: true, id: conversationId };
}

async function getPlatformMetrics(userId) {
  const convRow = await db.get(
    'SELECT COUNT(*) as total_conversations FROM conversations WHERE user_id = ?',
    [userId]
  );
  let aiMetrics = null;
  try {
    aiMetrics = await getAiMetrics();
  } catch {
    aiMetrics = { status: 'unavailable' };
  }
  return {
    userConversations: Number(convRow?.total_conversations || 0),
    aiTelemetry: aiMetrics,
  };
}

module.exports = {
  buildUploadedFilesMetadata,
  processUserChatTurn,
  listUserConversations,
  getConversationDetail,
  deleteUserConversation,
  getPlatformMetrics,
};
