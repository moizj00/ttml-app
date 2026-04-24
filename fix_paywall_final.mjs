import fs from 'fs';
const filePath = 'client/src/components/LetterPaywall.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// The botched script added \\n\\n literal strings
content = content.replace(/\\}\\);\\n\\n  const/g, '});\\n\\n  const');
content = content.replace(/\\}\\);\\\\n\\\\n  const/g, '});\\n\\n  const');

fs.writeFileSync(filePath, content);
console.log('Cleaned up literal backslashes in LetterPaywall.tsx');
