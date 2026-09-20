#!/usr/bin/env node
/* Copies SQL migration/seed files into dist so the compiled CLI can run without ts-node. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
for (const dir of ['migrations', 'seeds']) {
  const from = path.join(root, dir);
  const to = path.join(root, 'dist', dir);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(to, { recursive: true });
  for (const file of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
}
console.log('bezzo-db: SQL assets copied to dist');
