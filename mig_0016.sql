-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0016: Lesson Embeddings & Fine-Tune Infrastructure
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Changes:
--   1. Add embedding vector(1536) column to pipeline_lessons
--   2. Add HNSW index on pipeline_lessons.embedding for fast ANN search
--   3. Add match_lessons() helper function for semantic retrieval
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add embedding column ──────────────────────────────────────────────────
ALTER TABLE pipeline_lessons
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ── 2. HNSW index for approximate nearest-neighbour search ───────────────────
-- cosine distance (<=>), same as letter_versions uses implicitly.
-- Created concurrently so it doesn't lock the table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipeline_lessons_embedding
  ON pipeline_lessons
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 3. match_lessons() — semantic similarity function ────────────────────────
-- Returns active lessons ordered by cosine similarity to a query embedding.
-- Falls back gracefully to an empty result if pgvector isn't available.
CREATE OR REPLACE FUNCTION match_lessons(
  query_embedding  vector(1536),
  match_threshold  float   DEFAULT 0.70,
  match_count      int     DEFAULT 10,
  p_letter_type    text    DEFAULT NULL,
  p_jurisdiction   text    DEFAULT NULL,
  p_pipeline_stage text    DEFAULT NULL
)
RETURNS TABLE (
  id                        int,
  letter_type               text,
  jurisdiction              text,
  pipeline_stage            text,
  category                  text,
  lesson_text               text,
  weight                    int,
  hit_count                 int,
  times_injected            int,
  letters_before_avg_score  int,
  letters_after_avg_score   int,
  similarity                float
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    pl.id,
    pl.letter_type::text,
    pl.jurisdiction,
    pl.pipeline_stage::text,
    pl.category::text,
    pl.lesson_text,
    pl.weight,
    pl.hit_count,
    pl.times_injected,
    pl.letters_before_avg_score,
    pl.letters_after_avg_score,
    1 - (pl.embedding <=> query_embedding) AS similarity
  FROM public.pipeline_lessons pl
  WHERE pl.is_active = true
    AND pl.embedding IS NOT NULL
    AND 1 - (pl.embedding <=> query_embedding) >= match_threshold
    AND (p_letter_type   IS NULL OR pl.letter_type    = p_letter_type::public.letter_type_enum   OR pl.letter_type IS NULL)
    AND (p_jurisdiction  IS NULL OR pl.jurisdiction   = p_jurisdiction                            OR pl.jurisdiction IS NULL)
    AND (p_pipeline_stage IS NULL OR pl.pipeline_stage = p_pipeline_stage::public.pipeline_stage_enum OR pl.pipeline_stage IS NULL)
  ORDER BY pl.embedding <=> query_embedding
  LIMIT match_count;
$$;
