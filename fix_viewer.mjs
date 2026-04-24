import fs from 'fs';
const filePath = 'client/src/components/FreePreviewViewer.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const imports = [
    'import { trpc } from "@/lib/trpc";',
    'import { toast } from "sonner";',
    'import { PRICING } from "../../../shared/pricing";',
    'import { Button } from "@/components/ui/button";',
    'import { Card, CardContent } from "@/components/ui/card";'
];

let header = content.split('import {')[0];
// Simple way to add imports if they don't exist
imports.forEach(imp => {
    if (!content.includes(imp)) {
        content = imp + '\\n' + content;
    }
});

fs.writeFileSync(filePath, content);
console.log('Added missing imports to FreePreviewViewer.tsx');
