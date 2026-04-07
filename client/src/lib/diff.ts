/**
 * Lightweight word-level diff utility.
 * Returns an array of tokens with type: "equal" | "added" | "removed".
 * No external dependencies — uses a simple LCS-based approach.
 */

export type DiffToken = {
  type: "equal" | "added" | "removed";
  value: string;
};

/** Tokenise text into words + whitespace/punctuation chunks */
function tokenise(text: string): string[] {
  return text.split(/(\s+)/);
}

/** Compute LCS length table */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Backtrack LCS table to produce diff tokens */
function backtrack(dp: number[][], a: string[], b: string[], i: number, j: number, result: DiffToken[]): void {
  if (i === 0 && j === 0) return;
  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    backtrack(dp, a, b, i - 1, j - 1, result);
    result.push({ type: "equal", value: a[i - 1] });
  } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
    backtrack(dp, a, b, i, j - 1, result);
    result.push({ type: "added", value: b[j - 1] });
  } else {
    backtrack(dp, a, b, i - 1, j, result);
    result.push({ type: "removed", value: a[i - 1] });
  }
}

/**
 * Compute word-level diff between `before` and `after`.
 * @param before  Original text (e.g. ai_draft)
 * @param after   Modified text (e.g. attorney_edit)
 * @returns Array of DiffToken
 */
export function computeDiff(before: string, after: string): DiffToken[] {
  const a = tokenise(before);
  const b = tokenise(after);

  // Guard: if either side is very large, fall back to line-level diff to avoid O(n²) freeze
  if (a.length * b.length > 500_000) {
    return lineLevel(before, after);
  }

  const dp = lcsTable(a, b);
  const result: DiffToken[] = [];
  backtrack(dp, a, b, a.length, b.length, result);
  return result;
}

/** Fallback: line-level diff for very large documents */
function lineLevel(before: string, after: string): DiffToken[] {
  const aLines = before.split("\n");
  const bLines = after.split("\n");
  const dp = lcsTable(aLines, bLines);
  const result: DiffToken[] = [];
  backtrack(dp, aLines, bLines, aLines.length, bLines.length, result);
  // Re-join line tokens with newlines
  return result.map((t) => ({ ...t, value: t.value + "\n" }));
}

/** Merge consecutive tokens of the same type for cleaner rendering */
export function mergeDiff(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type) {
      last.value += token.value;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}

/** Strip HTML tags for plain-text diffing */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
