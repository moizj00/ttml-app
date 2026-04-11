import { getDb } from './db/core';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    const db = await getDb();
    if (!db) {
      console.error('Failed to get database connection');
      process.exit(1);
    }
    
    console.log('\n--- Job Counts by State ---');
    const counts = await db.execute(sql`SELECT state, count(*) FROM pgboss.job GROUP BY state`);
    console.log(counts);
    
    console.log('\n--- Recent Jobs ---');
    const recent = await db.execute(sql`SELECT id, name, state, created_on, started_on, completed_on FROM pgboss.job ORDER BY created_on DESC LIMIT 10`);
    console.log(JSON.stringify(recent, null, 2));
    
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

main();
