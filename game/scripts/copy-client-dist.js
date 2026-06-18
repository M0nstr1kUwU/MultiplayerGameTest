import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'client', 'dist');
const target = path.join(root, 'server', 'client-dist');

if (!fs.existsSync(source)) {
  console.error(`Client build not found: ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Copied client build to ${target}`);
