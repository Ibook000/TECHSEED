import { rmSync } from 'node:fs';

for (const path of ['dist', 'server.js']) {
  rmSync(path, { recursive: true, force: true });
}
