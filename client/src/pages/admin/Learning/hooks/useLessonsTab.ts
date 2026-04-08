import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  CATEGORIES,
  STAGES,
  LessonCategory,
  PipelineStage,
} from "../constants";

export function useLessonsTab(
  setShowCreateDialog: (v: boolean) => void
) {
  // Filter state
  const [filterStage, setFilterStage] = useState("__all__");
  const [filterActive, setFilterActive] = useState("__all__");
  const [filterCategory, setFilterCategory] = useState("__all__");
  const [filterJurisdiction, setFilterJurisdiction] = useState("");
  const [filterLetterType, setFilterLetterType] = useState("__all__");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    lessonText: "",
    category: "",
    weight: 50,
  });

  // New lesson form state
  const [newLesson, setNewLesson] = useState<{
    lessonText: string;
    category: LessonCategory;
    pipelineStage: string;
    letterType: string;
    jurisdiction: string;
    weight: number;
  }>({
    lessonText: "",
    category: "general",
    pipelineStage: "",
    letterType: "",
    jurisdiction: "",
    weight: 50,
  });

  // Build query filters
  const filters: {
    pipelineStage?: string;
    isActive?: boolean;
    jurisdiction?: string;
    letterType?: string;
  } = {};
  if (filterStage !== "__all__") filters.pipelineStage = filterStage;
  if (filterActive === "active") filters.isActive = true;
  if (filterActive === "inactive") filters.isActive = false;
  if (filterJurisdiction) filters.jurisdiction = filterJurisdiction;
  if (filterLetterType !== "__all__") filters.letterType = filterLetterType;
  const hasFilters = Object.keys(filters).length > 0;

  const {
    data: lessons,
    isLoading,
    refetch,
  } = trpc.admin.lessonsFiltered.useQuery(
    hasFilters ? filters : undefined
  );

  const filteredLessons =
    filterCategory !== "__all__"
      ? lessons?.filter((l) => l.category === filterCategory)
      : lessons;

  const activeCount = lessons?.filter((l) => l.isActive).length ?? 0;
  const totalCount = lessons?.length ?? 0;

  const scopeGroups = lessons
    ? Array.from(
        new Map(
          lessons
            .filter((l) => l.isActive && l.letterType)
            .map((l) => [
              `${l.letterType}|${l.jurisdiction ?? ""}`,
              {
                letterType: l.letterType!,
                jurisdiction: l.jurisdiction,
              },
            ])
        ).values()
      )
    : [];

  // Mutations
  const updateLesson = trpc.admin.updateLesson.useMutation({
    onSuccess: () => {
      toast.success("Lesson updated");
      refetch();
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  const createLesson = trpc.admin.createLesson.useMutation({
    onSuccess: () => {
      toast.success("Lesson created");
      setShowCreateDialog(false);
      refetch();
    },
    onError: (e) => toast.error("Creation failed", { description: e.message }),
  });

  const consolidateMutation = trpc.admin.consolidateLessons.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Consolidated ${data.consolidated} groups, deactivated ${data.deactivated} lessons`
      );
      refetch();
    },
    onError: (e) =>
      toast.error("Consolidation failed", { description: e.message }),
  });

  // Edit handlers
  function startEdit(lesson: {
    id: number;
    lessonText: string;
    category: string | null;
    weight: number | null;
  }) {
    setEditingId(lesson.id);
    setEditForm({
      lessonText: lesson.lessonText,
      category: lesson.category ?? "general",
      weight: lesson.weight ?? 50,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit() {
    if (!editingId) return;
    updateLesson.mutate(
      {
        id: editingId,
        lessonText: editForm.lessonText,
        category: editForm.category as LessonCategory,
        weight: editForm.weight,
      },
      {
        onSuccess: () => {
          setEditingId(null);
        },
      }
    );
  }

  function clearFilters() {
    setFilterStage("__all__");
    setFilterActive("__all__");
    setFilterCategory("__all__");
    setFilterJurisdiction("");
    setFilterLetterType("__all__");
  }

  function submitNewLesson() {
    createLesson.mutate({
      lessonText: newLesson.lessonText,
      category: newLesson.category,
      pipelineStage: (newLesson.pipelineStage ||
        undefined) as PipelineStage | undefined,
      letterType: newLesson.letterType || undefined,
      jurisdiction: newLesson.jurisdiction || undefined,
      weight: newLesson.weight,
      sourceAction: "manual",
    });
  }

  return {
    // Filter state
    filterStage,
    setFilterStage,
    filterActive,
    setFilterActive,
    filterCategory,
    setFilterCategory,
    filterJurisdiction,
    setFilterJurisdiction,
    filterLetterType,
    setFilterLetterType,
    hasFilters,
    clearFilters,
    // Data
    lessons,
    filteredLessons,
    isLoading,
    activeCount,
    totalCount,
    scopeGroups,
    // Edit state
    editingId,
    editForm,
    setEditForm,
    startEdit,
    cancelEdit,
    saveEdit,
    // New lesson
    newLesson,
    setNewLesson,
    submitNewLesson,
    // Mutations
    updateLesson,
    createLesson,
    consolidateMutation,
  };
}
