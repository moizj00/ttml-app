/**
 * LangGraph Postgres Checkpointer
 *
 * Persists LangGraph pipeline state to PostgreSQL so the worker can resume
 * after a crash or restart. Each letter gets its own checkpoint "thread"
 * (thread_id = letterId).
 */
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createLogger } from "../../logger";

const log = createLogger({ module: "LangGraph:Checkpointer" });

let _checkpointer: PostgresSaver | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (_checkpointer) return _checkpointer;

  const connString =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!connString) {
    throw new Error(
      "No database connection string available for LangGraph checkpointer"
    );
  }

  _checkpointer = PostgresSaver.fromConnString(connString);

  // Ensure checkpoint tables exist (checkpoints, checkpoint_writes, etc.)
  await _checkpointer.setup();

  log.info({}, "[LangGraph Checkpointer] PostgresSaver initialized");
  return _checkpointer;
}
