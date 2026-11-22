const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const { sqliteDbPath, databaseUrl } = require('../config');

class DatabaseAdapter {
  constructor() {
    this.isPostgres = Boolean(databaseUrl && databaseUrl.startsWith('postgres'));
    this.sqlite = null;
    this.pgPool = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    if (this.isPostgres) {
      const { Pool } = require('pg');
      this.pgPool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
      });
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          company TEXT NOT NULL DEFAULT 'Import & Export',
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          active_product_profile TEXT NOT NULL DEFAULT '{}',
          last_classification TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender TEXT NOT NULL,
          text TEXT NOT NULL,
          action TEXT,
          classification TEXT,
          clarifying_questions TEXT,
          citations TEXT,
          active_product_profile TEXT,
          tariff_version TEXT,
          telemetry TEXT,
          files TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS demo_requests (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          mobile TEXT NOT NULL DEFAULT '',
          company TEXT NOT NULL DEFAULT 'Not provided',
          message TEXT NOT NULL DEFAULT '',
          requested_by TEXT,
          created_at TEXT NOT NULL
        );
      `);
    } else {
      fs.mkdirSync(path.dirname(sqliteDbPath), { recursive: true });
      this.sqlite = new DatabaseSync(sqliteDbPath);
      this.sqlite.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          company TEXT NOT NULL DEFAULT 'Import & Export',
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          active_product_profile TEXT NOT NULL DEFAULT '{}',
          last_classification TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender TEXT NOT NULL,
          text TEXT NOT NULL,
          action TEXT,
          classification TEXT,
          clarifying_questions TEXT,
          citations TEXT,
          active_product_profile TEXT,
          tariff_version TEXT,
          telemetry TEXT,
          files TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS demo_requests (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          mobile TEXT NOT NULL DEFAULT '',
          company TEXT NOT NULL DEFAULT 'Not provided',
          message TEXT NOT NULL DEFAULT '',
          requested_by TEXT,
          created_at TEXT NOT NULL
        );
      `);
    }

    await this.seedDefaultUsers();
    this.initialized = true;
  }

  async close() {
    if (this.sqlite) {
      this.sqlite.close();
      this.sqlite = null;
    }
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    this.initialized = false;
  }

  _convertSqlForPg(sql) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  async get(sql, params = []) {
    await this.init();
    if (this.isPostgres) {
      const res = await this.pgPool.query(this._convertSqlForPg(sql), params);
      return res.rows[0] || null;
    }
    return this.sqlite.prepare(sql).get(...params) || null;
  }

  async all(sql, params = []) {
    await this.init();
    if (this.isPostgres) {
      const res = await this.pgPool.query(this._convertSqlForPg(sql), params);
      return res.rows;
    }
    return this.sqlite.prepare(sql).all(...params);
  }

  async run(sql, params = []) {
    await this.init();
    if (this.isPostgres) {
      return this.pgPool.query(this._convertSqlForPg(sql), params);
    }
    return this.sqlite.prepare(sql).run(...params);
  }

  async seedDefaultUsers() {
    const now = new Date().toISOString();
    const seeds = [
      {
        id: 'user-1',
        name: 'Demo User',
        email: 'demo@example.com',
        company: 'TariffFlow Demo Imports',
        passwordHash: bcrypt.hashSync('Demo@123', 10),
      },
      {
        id: 'user-2',
        name: 'Aarav Mehta',
        email: 'business@tariff.ai',
        company: 'Export Logistics Pvt Ltd',
        passwordHash: bcrypt.hashSync('password123', 10),
      },
    ];

    for (const u of seeds) {
      const existing = this.isPostgres
        ? (await this.pgPool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [u.email])).rows[0]
        : this.sqlite.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(u.email);

      if (!existing) {
        if (this.isPostgres) {
          await this.pgPool.query(
            'INSERT INTO users (id, name, email, company, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [u.id, u.name, u.email, u.company, u.passwordHash, now]
          );
        } else {
          this.sqlite
            .prepare('INSERT INTO users (id, name, email, company, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(u.id, u.name, u.email, u.company, u.passwordHash, now);
        }
      }
    }
  }
}

module.exports = new DatabaseAdapter();
