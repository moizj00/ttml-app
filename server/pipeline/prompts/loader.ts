import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Basic template loader for markdown prompts.
 * In a real production environment, these would be cached.
 */
export function loadPrompt(filename: string, variables: Record<string, string | number | boolean | null | undefined> = {}): string {
  const filePath = path.join(__dirname, filename);
  let content = fs.readFileSync(filePath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{${key}}}`, "g");
    content = content.replace(placeholder, String(value ?? "Not specified"));
  }

  return content.trim();
}
