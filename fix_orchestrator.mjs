import fs from 'fs';
const filePath = 'server/pipeline/orchestrator.ts';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('const _intermediateContentRegistry')) {
    const registryCode = `/**
 * Global registry for intermediate pipeline results (drafts and vetted letters).
 * Used for RAG training data capture and near-real-time visibility.
 */
export const _intermediateContentRegistry = new Map<number, { content: string; qualityWarnings: string[] }>();

`;
    content = registryCode + content;
    fs.writeFileSync(filePath, content);
    console.log('Fixed _intermediateContentRegistry');
}

if (content.includes('const latestResearch = await getLatestResearchRun(letterId);')) {
    content = content.replace('const latestResearch = await getLatestResearchRun(letterId);', 'const latestResearch = await getLatestResearchByLetterId(letterId);');
    fs.writeFileSync(filePath, content);
    console.log('Renamed getLatestResearchRun to getLatestResearchByLetterId');
}
