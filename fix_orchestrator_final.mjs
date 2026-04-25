import fs from 'fs';
const filePath = 'server/pipeline/orchestrator.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Change getLatestResearchByLetterId back to getLatestResearchRun
content = content.replace(/getLatestResearchByLetterId/g, 'getLatestResearchRun');

fs.writeFileSync(filePath, content);
console.log('Fixed research function name in orchestrator.ts');
