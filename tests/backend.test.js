const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tariff-backend-test-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.sqlite');
process.env.JWT_SECRET = 'test-jwt-secret-12345';

let mockAiServer;
let backendServer;
let backendBaseUrl;

test.before(async () => {
  mockAiServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/v1/health') {
        res.end(JSON.stringify({ status: 'ok', pipeline_version: 'v0_3' }));
        return;
      }
      if (req.url === '/api/v1/metrics/summary') {
        res.end(JSON.stringify({ total_queries: 2, mean_latency_ms: 45.0 }));
        return;
      }
      if (req.url === '/api/v1/agent/chat') {
        const parsed = JSON.parse(body || '{}');
        const msg = (parsed.message || '').toLowerCase();
        if (msg === 'valves') {
          res.end(
            JSON.stringify({
              thread_id: parsed.thread_id,
              action: 'clarify',
              reply: 'Please specify material, operation, and pipeline application.',
              tariff_version: 'ITC-HS 2022 (DGCI&S Schedule I, effective 1 April 2022)',
              needs_clarification: true,
              clarifying_questions: ['What material?', 'How is it operated?'],
              active_product_profile: { product_name: 'valves' },
              classification: null,
              citations: [],
              telemetry: { latency_ms: 18, retrieval_ms: 10, llm_ms: 0, input_tokens: 0, output_tokens: 0, estimated_cost_inr: 0 },
            })
          );
          return;
        }
        res.end(
          JSON.stringify({
            thread_id: parsed.thread_id,
            action: 'classify',
            reply: 'Classified under ITC-HS 84818030.',
            tariff_version: 'ITC-HS 2022 (DGCI&S Schedule I, effective 1 April 2022)',
            needs_clarification: false,
            clarifying_questions: [],
            active_product_profile: { product_name: 'ball valve', material: 'stainless steel' },
            classification: {
              items: [
                {
                  line: 1,
                  product_name: 'ball valve',
                  chapter_2_digit: '84',
                  heading_4_digit: '8481',
                  subheading_6_digit: '848180',
                  code_8d: '84818030',
                  lineage_path: 'TAPS, COCKS, VALVES > Industrial valves',
                  schedule_duty_rate: '7.5%',
                  unit: 'kg',
                  gri_applied: ['GRI 1', 'GRI 6'],
                  confidence_score: 0.94,
                },
              ],
              section_chapter_notes_reasoning: 'Chapter 84 Heading 8481 applies.',
              precedents_reasoning: 'Consistent with industrial valve rulings.',
              step_by_step_reasoning: ['GRI 1 -> 8481', 'GRI 6 -> 84818030'],
              conflict_resolution_note: null,
            },
            citations: [
              {
                source_type: 'tariff_item',
                id: 'it_84818030',
                title: 'ITC-HS 2022 Tariff Item 84818030',
                snippet: 'Industrial valves (7.5%)',
                score: 0.94,
              },
            ],
            telemetry: { latency_ms: 25, retrieval_ms: 12, llm_ms: 0, input_tokens: 0, output_tokens: 0, estimated_cost_inr: 0 },
          })
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ detail: 'Not found' }));
    });
  });

  await new Promise((resolve) => mockAiServer.listen(0, '127.0.0.1', resolve));
  const aiPort = mockAiServer.address().port;
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${aiPort}`;

  const app = require('../src/server');
  const db = require('../src/lib/db');
  await db.init();
  backendServer = http.createServer(app);
  await new Promise((resolve) => backendServer.listen(0, '127.0.0.1', resolve));
  backendBaseUrl = `http://127.0.0.1:${backendServer.address().port}`;
});

test.after(async () => {
  const db = require('../src/lib/db');
  await db.close();
  await new Promise((resolve) => backendServer.close(resolve));
  await new Promise((resolve) => mockAiServer.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Auth, demo request, chat persistence, and file validation work end-to-end', async () => {
  // 1. Protected route blocks unauthenticated requests
  const unauthRes = await fetch(`${backendBaseUrl}/api/conversations`);
  assert.equal(unauthRes.status, 401);

  // 2. Public request-demo succeeds without token
  const demoRes = await fetch(`${backendBaseUrl}/api/request-demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'lead@logistics.in',
      mobile: '+91 9876543210',
      company: 'Bharat Trade Co',
    }),
  });
  assert.equal(demoRes.status, 201);

  // 3. Login with seeded business@tariff.ai account
  const loginRes = await fetch(`${backendBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'business@tariff.ai', password: 'password123' }),
  });
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  assert.ok(token);

  // 4. Turn 1: Ambiguous query -> clarify
  const form1 = new FormData();
  form1.append('message', 'valves');
  form1.append('conversationId', 'conv-e2e-1');
  const chat1Res = await fetch(`${backendBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form1,
  });
  assert.equal(chat1Res.status, 200);
  const chat1 = await chat1Res.json();
  assert.equal(chat1.data.action, 'clarify');
  assert.equal(chat1.data.needsClarification, true);

  // 5. Turn 2: Detailed query with valid TXT upload -> classify 84818030
  const form2 = new FormData();
  form2.append('message', '2-inch stainless steel ball valve for water pipelines');
  form2.append('conversationId', 'conv-e2e-1');
  form2.append('files', new Blob(['Invoice Item: 2-inch SS ball valve'], { type: 'text/plain' }), 'invoice.txt');
  const chat2Res = await fetch(`${backendBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form2,
  });
  assert.equal(chat2Res.status, 200);
  const chat2 = await chat2Res.json();
  assert.equal(chat2.data.action, 'classify');
  assert.equal(chat2.data.classification.items[0].code_8d, '84818030');
  assert.equal(chat2.data.citations.length, 1);

  // 6. Disallowed upload extension/MIME rejected cleanly with 400
  const badForm = new FormData();
  badForm.append('message', 'check file');
  badForm.append('files', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'malware.exe');
  const badRes = await fetch(`${backendBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: badForm,
  });
  assert.equal(badRes.status, 400);

  // 7. Reload persisted conversation & verify messages survived
  const convRes = await fetch(`${backendBaseUrl}/api/conversations/conv-e2e-1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(convRes.status, 200);
  const convData = await convRes.json();
  assert.equal(convData.data.conversation.messages.length, 4);
  assert.equal(convData.data.conversation.lastClassification.items[0].code_8d, '84818030');
});
