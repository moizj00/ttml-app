import fs from 'fs';
const filePath = 'client/src/components/FreePreviewViewer.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// The botched script added escaped newlines \\n to the first line.
// We'll just replace that first line with the actual correct imports.

const correctImports = \`import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PRICING } from "../../../shared/pricing";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
\`;

// Split content by the docblock start
const parts = content.split('/**');
if (parts.length > 1) {
    fs.writeFileSync(filePath, correctImports + '/**' + parts.slice(1).join('/**'));
    console.log('Fixed FreePreviewViewer imports');
}
