const {
  processUserChatTurn,
  listUserConversations,
  getConversationDetail,
  deleteUserConversation,
  getPlatformMetrics,
} = require('../services/chatService');

async function processChat(req, res, next) {
  try {
    const { message = '', conversationId } = req.body;
    const payload = await processUserChatTurn({
      userId: req.user.sub,
      message,
      conversationId,
      files: req.files || [],
    });

    return res.status(200).json({
      success: true,
      message: 'Chat request processed successfully',
      data: payload,
    });
  } catch (error) {
    return next(error);
  }
}

async function getConversations(req, res, next) {
  try {
    const conversations = await listUserConversations(req.user.sub);
    return res.status(200).json({
      success: true,
      data: { conversations },
    });
  } catch (error) {
    return next(error);
  }
}

async function getConversationById(req, res, next) {
  try {
    const conversation = await getConversationDetail(req.user.sub, req.params.id);
    return res.status(200).json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteConversation(req, res, next) {
  try {
    const result = await deleteUserConversation(req.user.sub, req.params.id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getMetrics(req, res, next) {
  try {
    const metrics = await getPlatformMetrics(req.user.sub);
    return res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  processChat,
  getConversations,
  getConversationById,
  deleteConversation,
  getMetrics,
};
