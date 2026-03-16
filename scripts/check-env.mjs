import 'dotenv/config';

console.log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY ? `(starts with ${process.env.ANTHROPIC_API_KEY.substring(0,8)}...)` : '');
console.log('PERPLEXITY_API_KEY set:', !!process.env.PERPLEXITY_API_KEY, process.env.PERPLEXITY_API_KEY ? `(starts with ${process.env.PERPLEXITY_API_KEY.substring(0,8)}...)` : '');
console.log('BUILT_IN_FORGE_API_KEY set:', !!process.env.BUILT_IN_FORGE_API_KEY);
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
