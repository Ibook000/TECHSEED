import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const dataDirectory = process.env.TECHSEED_DEMO_MODE === 'true' ? '.demo-data' : 'data';
const databasePath = join(root, dataDirectory, 'db.json');
const backupDirectory = join(root, dataDirectory, 'backups');

if (!existsSync(databasePath)) {
  console.error('找不到 data/db.json；请先启动一次服务以初始化数据库。');
  process.exitCode = 1;
} else {
  try {
    // Database updates write a temporary file and atomically rename it over db.json.
    // Reading once here captures either the complete previous or complete next version.
    const snapshot = readFileSync(databasePath);
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    chmodSync(backupDirectory, 0o700);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = randomBytes(4).toString('hex');
    const backupPath = join(backupDirectory, `db-${timestamp}-${suffix}.json`);
    writeFileSync(backupPath, snapshot, { flag: 'wx', mode: 0o600 });

    console.log(`数据库备份已创建：${relative(root, backupPath)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error(`数据库备份失败：${message}`);
    process.exitCode = 1;
  }
}
