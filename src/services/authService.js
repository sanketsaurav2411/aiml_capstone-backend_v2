const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../lib/db');

async function findUserByEmail(email) {
  return db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
}

async function verifyCredentials(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const isValid = await bcrypt.compare(password, user.password_hash);
  return isValid ? user : null;
}

async function registerUser({ name, email, company = 'Import & Export', password }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    return null;
  }
  const id = `user-${uuidv4().slice(0, 8)}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const createdAt = new Date().toISOString();
  await db.run(
    'INSERT INTO users (id, name, email, company, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, email.toLowerCase(), company || 'Import & Export', passwordHash, createdAt]
  );
  return getUserById(id);
}

async function getUserById(userId) {
  return db.get('SELECT * FROM users WHERE id = ?', [userId]);
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company || 'Import & Export',
  };
}

module.exports = {
  findUserByEmail,
  verifyCredentials,
  registerUser,
  getUserById,
  serializeUser,
};
