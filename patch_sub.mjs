import fs from 'fs';

const filePath = 'server/routers/billing/subscriptions.ts';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  /z\.object\(\{ planId: z\.string\(\), discountCode: z\.string\(\)\.optional\(\) \}\)/,
  `z.object({ planId: z.string(), discountCode: z.string().optional(), returnTo: z.string().optional() })`
);

content = content.replace(
  /discountCode: input\.discountCode,/,
  `discountCode: input.discountCode,\n        returnTo: input.returnTo,`
);

fs.writeFileSync(filePath, content);
console.log("Patched server/routers/billing/subscriptions.ts!");
