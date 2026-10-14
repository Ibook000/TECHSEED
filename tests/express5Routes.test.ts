import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { test } from 'node:test';

test('Express 5 SPA fallback serves the root and nested routes', async t => {
  const app = express();
  app.get('/{*splat}', (_req, res) => res.send('index'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const address = server.address() as AddressInfo;
  for (const path of ['/', '/dashboard/candidates']) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'index');
  }
});
