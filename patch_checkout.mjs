import fs from 'fs';

const filePath = 'server/stripe/checkouts.ts';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  /export async function createCheckoutSession\(params: \{\s*userId: number;\s*email: string;\s*name\?: string \| null;\s*planId: string;\s*origin: string;\s*discountCode\?: string;\s*\}\)/,
  `export async function createCheckoutSession(params: {
  userId: number;
  email: string;
  name?: string | null;
  planId: string;
  origin: string;
  discountCode?: string;
  returnTo?: string;
})`
);

content = content.replace(
  /const \{ userId, email, name, planId, origin, discountCode \} = params;/,
  `const { userId, email, name, planId, origin, discountCode, returnTo } = params;`
);

content = content.replace(
  /success_url: \`\$\{origin\}\/subscriber\/billing\?success=true&plan=\$\{planId\}\`,/,
  `success_url: returnTo ? \`\$\{origin\}\$\{returnTo\}\?success=true&plan=\$\{planId\}\` : \`\$\{origin\}\/subscriber\/billing?success=true&plan=\$\{planId\}\`,`
);

content = content.replace(
  /cancel_url: \`\$\{origin\}\/pricing\?canceled=true\`,/,
  `cancel_url: returnTo ? \`\$\{origin\}\/pricing?returnTo=\$\{encodeURIComponent(returnTo)\}&canceled=true\` : \`\$\{origin\}\/pricing?canceled=true\`,`
);

fs.writeFileSync(filePath, content);
console.log("Patched server/stripe/checkouts.ts!");
