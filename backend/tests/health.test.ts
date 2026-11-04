import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/errors.js';

test('process health is independent of MySQL', async () => {
  const app = createApp(async () => { throw new Error('Must not be called'); });
  const response = await request(app).get('/api/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok', message: 'Backend is running' });
});
test('unknown routes return safe JSON', async () => {
  const response = await request(createApp(async () => {})).get('/missing').expect(404);
  assert.deepEqual(response.body, { status: 'error', message: 'Route not found' });
});
test('database success calls the checker and reports connected', async () => {
  let calls = 0;
  const response = await request(createApp(async () => { calls++; }))
    .get('/api/health/db').expect(200);
  assert.equal(calls, 1);
  assert.deepEqual(response.body, { status: 'ok', database: 'connected' });
});
test('database failure hides sensitive errors', async () => {
  const response = await request(createApp(async () => {
    throw new Error('private connection details');
  })).get('/api/health/db').expect(503);
  assert.deepEqual(response.body, { status: 'error', database: 'unavailable' });
});
test('CORS permits configured browser origins and omits others', async () => {
  const app = createApp(async () => {}, ['http://localhost:8081']);
  const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:8081');
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:8081');
  const denied = await request(app).get('/api/health').set('Origin', 'https://example.com');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
});
test('central error handler sanitizes malformed JSON', async () => {
  const app = createApp(async () => {});
  const response = await request(app).post('/api/health').set('Content-Type', 'application/json')
    .send('{invalid').expect(400);
  assert.deepEqual(response.body, { status: 'error', message: 'Invalid JSON body' });
});
test('central error handler hides internal errors', async () => {
  const app = express();
  app.get('/failure', () => { throw new Error('private internal details'); });
  app.use(errorHandler);
  const response = await request(app).get('/failure').expect(500);
  assert.deepEqual(response.body, { status: 'error', message: 'Internal server error' });
});
