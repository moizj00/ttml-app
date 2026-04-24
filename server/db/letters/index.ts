export * from "./query";
export * from "./mutations";
export * from "./utils";

import { and, eq, isNull, asc, desc } from "drizzle-orm";
import { letterRequests } from "../../../drizzle/schema";
import { getDb } from "../core";

export async function getAllLetterRequests(filters?: {
    status?: string;
    assignedReviewerId?: number | null;
    unassigned?: boolean;
    orderDirection?: "asc" | "desc";
}) {
    const db = await getDb();
    if (!db) return [];
    const conditions = [];
    if (filters?.status)
        conditions.push(eq(letterRequests.status, filters.status as any));
    if (filters?.unassigned)
        conditions.push(isNull(letterRequests.assignedReviewerId));
    else if (
        filters?.assignedReviewerId !== undefined &&
        filters.assignedReviewerId !== null
    )
        conditions.push(
            eq(letterRequests.assignedReviewerId, filters.assignedReviewerId)
        );
    const order =
        filters?.orderDirection === "asc"
            ? asc(letterRequests.createdAt)
            : desc(letterRequests.createdAt);
    const query = db.select().from(letterRequests).orderBy(order);
    if (conditions.length > 0) return query.where(and(...conditions));
    return query;
}
