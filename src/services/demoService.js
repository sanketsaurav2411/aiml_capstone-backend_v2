const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');

async function createDemoRequest({ name = 'Demo Prospect', email, mobile = '', company = 'Not provided', message = 'Product demo request', requestedBy = null }) {
  const id = `demo-${uuidv4().slice(0, 10)}`;
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO demo_requests (id, name, email, mobile, company, message, requested_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name || 'Demo Prospect', email, mobile || '', company || 'Not provided', message || 'Product demo request', requestedBy, createdAt]
  );

  return {
    id,
    name: name || 'Demo Prospect',
    email,
    mobile: mobile || '',
    company: company || 'Not provided',
    message: message || 'Product demo request',
    requestedBy,
    createdAt,
  };
}

module.exports = {
  createDemoRequest,
};
