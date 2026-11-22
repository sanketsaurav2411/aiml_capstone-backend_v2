const { createDemoRequest } = require('../services/demoService');

async function requestDemo(req, res, next) {
  try {
    const { name, email, mobile, company, message } = req.body;

    const demoRequest = await createDemoRequest({
      name,
      email,
      mobile,
      company,
      message,
      requestedBy: req.user?.sub || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Demo request submitted successfully',
      data: demoRequest,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requestDemo,
};
