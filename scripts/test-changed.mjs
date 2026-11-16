#!/usr/bin/env node
// Тести лише змінених файлів (docs/development.md §7): Vitest сам знаходить тести, що імпортують змінене.
//   npm run test:changed                — незакомічені зміни (разом із новими файлами)
//   npm run test:changed -- origin/main — усе, що змінилось відносно гілки чи коміту
// Зміна package.json або конфігу Vitest запускає всі тести workspace — так вирішує сам Vitest.
// Повний прогін — npm test.
import { spawnSync } from 'node:child_process';

const WORKSPACES = ['server', 'web'];
const since = process.argv[2];
const changed = since ? ['--changed', since] : ['--changed'];

let failed = false;
for (const workspace of WORKSPACES) {
  console.log(`\n── ${workspace} ──`);
  const res = spawnSync('npm', ['-w', workspace, 'exec', '--', 'vitest', 'run', ...changed, '--passWithNoTests'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
