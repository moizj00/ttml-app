import { and, desc, eq, lt } from "drizzle-orm";
import { documentAnalyses, type DocumentAnalysis, type InsertDocumentAnalysis } from "../../drizzle/schema/content";
import { getDb } from "./core";

export async function insertDocumentAnalysis(values: InsertDocumentAnalysis): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(documentAnalyses).values(values);
}

export async function listDocumentAnalysesByUser(opts: {
  userId: number;
  limit: number;
  cursor?: number;
}): Promise<{ rows: DocumentAnalysis[]; nextCursor: number | undefined }> {
  const db = await getDb();
  if (!db) return { rows: [], nextCursor: undefined };

  // Cursor is the id of the last seen row. Order by id DESC so the WHERE
  // predicate (`id < cursor`) matches the sort order — pagination stays
  // stable even when createdAt ties.
  const conditions = opts.cursor
    ? and(eq(documentAnalyses.userId, opts.userId), lt(documentAnalyses.id, opts.cursor))
    : eq(documentAnalyses.userId, opts.userId);

  const fetched = await db
    .select()
    .from(documentAnalyses)
    .where(conditions)
    .orderBy(desc(documentAnalyses.id))
    .limit(opts.limit + 1);

  let nextCursor: number | undefined;
  if (fetched.length > opts.limit) {
    nextCursor = fetched[opts.limit].id;
    fetched.pop();
  }

  return { rows: fetched, nextCursor };
}
