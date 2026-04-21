import fs from 'fs';

const filePath = 'client/src/pages/Pricing.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// There are multiple declarations of searchString
content = content.replace(
  /const \[, navigate\] = useLocation\(\);\n\s*const searchString = useSearch\(\);\n\s*const urlParams = new URLSearchParams\(searchString\);\n\s*const returnTo = urlParams\.get\("returnTo"\);\n\s*const searchString = useSearch\(\);/,
  `const [, navigate] = useLocation();\n  const searchString = useSearch();\n  const urlParams = new URLSearchParams(searchString);\n  const returnTo = urlParams.get("returnTo");`
);

// If the regex above couldn't match due to spacing/indentation:
// Clean up any double `const searchString = useSearch();` declarations explicitly.
// Let's just fix it smartly.
let lines = content.split('\n');
let modifiedLines = [];
let searchStringSeen = false;

for (let line of lines) {
  if (line.includes('const searchString = useSearch();')) {
    if (searchStringSeen) {
      continue; // Skip the second declaration
    }
    searchStringSeen = true;
  }
  modifiedLines.push(line);
}

fs.writeFileSync(filePath, modifiedLines.join('\n'));
console.log("Fixed Pricing.tsx!");
