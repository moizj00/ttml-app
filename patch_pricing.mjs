import fs from 'fs';

const filePath = 'client/src/pages/Pricing.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

if (!content.includes('const returnTo = ')) {
  content = content.replace(
    /const \[, navigate\] = useLocation\(\);/,
    `const [, navigate] = useLocation();\n  const searchString = useSearch();\n  const urlParams = new URLSearchParams(searchString);\n  const returnTo = urlParams.get("returnTo");`
  );
  
  content = content.replace(
    /checkoutMutation\.mutate\(\{\s*planId,\s*discountCode: appliedDiscount\?\.code,\s*\}\);/g,
    `checkoutMutation.mutate({ planId, discountCode: appliedDiscount?.code, returnTo: returnTo || undefined });`
  );
  
  content = content.replace(
    /navigate\("\/signup"\);/,
    `navigate(\`/signup\${returnTo ? '?next=' + encodeURIComponent(\`/pricing?returnTo=\${returnTo}\`) : ''}\`);`
  );
}

fs.writeFileSync(filePath, content);
console.log("Patched Pricing.tsx!");
