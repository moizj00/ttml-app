/**
 * Trigger the AI pipeline for a specific letter ID.
 * Usage: node scripts/trigger-pipeline.mjs <letterId>
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const letterId = parseInt(process.argv[2] ?? '1', 10);
console.log(`[Trigger] Starting pipeline for letter #${letterId}...`);

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the letter's intakeJson
const [rows] = await conn.execute(
  'SELECT id, status, intakeJson FROM letter_requests WHERE id = ?',
  [letterId]
);

if (!rows.length) {
  console.error(`Letter #${letterId} not found`);
  process.exit(1);
}

const letter = rows[0];
console.log(`Letter #${letterId} status: ${letter.status}`);

if (!['submitted', 'needs_changes'].includes(letter.status)) {
  console.error(`Letter #${letterId} is in status '${letter.status}' — can only trigger from submitted/needs_changes`);
  process.exit(1);
}

const intakeJson = typeof letter.intakeJson === 'string' 
  ? JSON.parse(letter.intakeJson) 
  : letter.intakeJson;

console.log(`[Trigger] IntakeJson letterType: ${intakeJson.letterType}`);
await conn.end();

// Now trigger via HTTP to the running dev server
const response = await fetch('http://localhost:3000/api/trpc/admin.forceRetryPipeline', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ json: { letterId } }),
}).catch(e => null);

if (response) {
  const body = await response.text();
  console.log(`[Trigger] HTTP response ${response.status}:`, body.substring(0, 200));
} else {
  console.log('[Trigger] Could not reach dev server via HTTP — pipeline must be triggered from the UI');
  console.log('[Trigger] Letter has been reset to submitted — use the admin panel to retry');
}
