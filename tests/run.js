#!/usr/bin/env node
/**
 * Ejecutor de pruebas en Node.  Uso:  npm test
 * Los mismos archivos se ejecutan en el navegador abriendo tests.html.
 */

import { run } from './runner.js';

// El orden importa poco, pero se cargan primero las de estadística pura.
await import('./stats.test.js');
await import('./app.test.js');

const result = await run();

if (result.failed > 0) {
  console.error(`\n❌ ${result.failed} pruebas fallidas de ${result.total}.\n`);
  process.exit(1);
}
console.log(`✅ ${result.passed} pruebas superadas.\n`);
