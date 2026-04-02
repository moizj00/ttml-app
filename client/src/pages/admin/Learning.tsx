import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Brain,
  Plus,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Target,
  BarChart3,
  Loader2,
  Pencil,
  X,
  Check,
  Filter,
  Layers,
  Clock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const CATEGORIES = [
  "citation_error", "jurisdiction_error", "tone_issue", "structure_issue",
  "factual_error", "bloat_detected", "missing_section", "style_preference",
  "legal_accuracy", "general",
] as const;
type LessonCategory = (typeof CATEGORIES)[number];

const STAGES = ["research", "drafting", "assembly", "vetting"] as const;
type PipelineStage = (typeof STAGES)[number];

const LETTER_TYPES = [
  "demand-letter", "cease-and-desist", "contract-breach", "eviction-notice",
  "employment-dispute", "consumer-complaint", "general-legal",
] as const;

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    citation_error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    jurisdiction_error: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    tone_issue: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    structure_issue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    factual_error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    bloat_detected: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    missing_section: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    style_preference: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    legal_accuracy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return map[cat] ?? map.general;
}

function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    attorney_approval: "Approval",
    attorney_rejection: "Rejection",
    attorney_changes: "Changes Req.",
    attorney_edit: "Edit",
    manual: "Manual",
    consolidation: "Consolidated",
  };
  return map[src] ?? src;
}

function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function EffectivenessBadge({ before, after }: { before: number | null; after: number | null }) {
  if (before == null || after == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="badge-effectiveness-neutral">
        <Minus className="w-3 h-3" /> No data
      </span>
    );
  }
  const delta = after - before;
  if (delta > 2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium" data-testid="badge-effectiveness-positive">
        <TrendingUp className="w-3 h-3" /> +{delta} pts
      </span>
    );
  }
  if (delta < -2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium" data-testid="badge-effectiveness-negative">
        <TrendingDown className="w-3 h-3" /> {delta} pts
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="badge-effectiveness-neutral">
      <Minus className="w-3 h-3" /> Neutral
    </span>
  );
}

export default function AdminLearning() {
  const [activeTab, setActiveTab] = useState<"lessons" | "quality">("lessons");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <AppLayout>
      <div className="space-y-6" data-testid="admin-learning-page">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <Brain className="w-6 h-6 text-indigo-600" />
            Recursive Learning System
          </h1>
          <p className="text-muted-foreground mt-1">
            AI pipeline lessons extracted from attorney feedback and quality metrics.
          </p>
        </div>

        <div className="flex gap-2 border-b pb-0">
          <button
            onClick={() => setActiveTab("lessons")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "lessons"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-lessons"
          >
            <BookOpen className="w-4 h-4 inline mr-1.5" />
            Lessons
          </button>
          <button
            onClick={() => setActiveTab("quality")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "quality"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-quality"
          >
            <BarChart3 className="w-4 h-4 inline mr-1.5" />
            Quality Scores
          </button>
        </div>

        {activeTab === "lessons" && (
          <LessonsTab
            showCreateDialog={showCreateDialog}
            setShowCreateDialog={setShowCreateDialog}
          />
        )}
        {activeTab === "quality" && <QualityTab />}
      </div>
    </AppLayout>
  );
}

function LessonsTab({
  showCreateDialog,
  setShowCreateDialog,
}: {
  showCreateDialog: boolean;
  setShowCreateDialog: (v: boolean) => void;
}) {
  const [filterStage, setFilterStage] = useState("__all__");
  const [filterActive, setFilterActive] = useState("__all__");
  const [filterCategory, setFilterCategory] = useState("__all__");
  const [filterJurisdiction, setFilterJurisdiction] = useState("");
  const [filterLetterType, setFilterLetterType] = useState("__all__");

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

  const { data: lessons, isLoading, refetch } = trpc.admin.lessonsFiltered.useQuery(
    hasFilters ? filters : undefined
  );

  const filteredLessons = filterCategory !== "__all__"
    ? lessons?.filter((l) => l.category === filterCategory)
    : lessons;

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
      toast.success(`Consolidated ${data.consolidated} groups, deactivated ${data.deactivated} lessons`);
      refetch();
    },
    onError: (e) => toast.error("Consolidation failed", { description: e.message }),
  });

  const activeCount = lessons?.filter((l) => l.isActive).length ?? 0;
  const totalCount = lessons?.length ?? 0;

  const scopeGroups = lessons ? Array.from(
    new Map(
      lessons
        .filter((l) => l.isActive && l.letterType)
        .map((l) => [`${l.letterType}|${l.jurisdiction ?? ""}`, { letterType: l.letterType!, jurisdiction: l.jurisdiction }])
    ).values()
  ) : [];

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ lessonText: "", category: "", weight: 50 });

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

  function startEdit(lesson: { id: number; lessonText: string; category: string | null; weight: number | null }) {
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
    updateLesson.mutate({
      id: editingId,
      lessonText: editForm.lessonText,
      category: editForm.category as LessonCategory,
      weight: editForm.weight,
    }, {
      onSuccess: () => {
        setEditingId(null);
      },
    });
  }

  function clearFilters() {
    setFilterStage("__all__");
    setFilterActive("__all__");
    setFilterCategory("__all__");
    setFilterJurisdiction("");
    setFilterLetterType("__all__");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-lessons">{totalCount}</p>
                <p className="text-xs text-muted-foreground">Total Lessons</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Target className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-active-lessons">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active (Injected)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between gap-2">
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-create-lesson">
                  <Plus className="w-4 h-4" />
                  Add Manual Lesson
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Manual Lesson</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-sm font-medium">Lesson Text</label>
                    <Textarea
                      value={newLesson.lessonText}
                      onChange={(e) =>
                        setNewLesson({ ...newLesson, lessonText: e.target.value })
                      }
                      placeholder="Describe the lesson the AI should learn..."
                      rows={3}
                      data-testid="input-lesson-text"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Category</label>
                      <Select
                        value={newLesson.category}
                        onValueChange={(v) =>
                          setNewLesson({ ...newLesson, category: v as LessonCategory })
                        }
                      >
                        <SelectTrigger data-testid="select-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Pipeline Stage</label>
                      <Select
                        value={newLesson.pipelineStage}
                        onValueChange={(v) =>
                          setNewLesson({ ...newLesson, pipelineStage: v })
                        }
                      >
                        <SelectTrigger data-testid="select-stage">
                          <SelectValue placeholder="All stages" />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Letter Type</label>
                      <Select
                        value={newLesson.letterType}
                        onValueChange={(v) =>
                          setNewLesson({ ...newLesson, letterType: v })
                        }
                      >
                        <SelectTrigger data-testid="select-letter-type">
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          {LETTER_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace(/-/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Jurisdiction</label>
                      <Input
                        value={newLesson.jurisdiction}
                        onChange={(e) =>
                          setNewLesson({ ...newLesson, jurisdiction: e.target.value })
                        }
                        placeholder="e.g. California"
                        data-testid="input-jurisdiction"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Weight (0-100)</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newLesson.weight}
                      onChange={(e) =>
                        setNewLesson({
                          ...newLesson,
                          weight: parseInt(e.target.value) || 50,
                        })
                      }
                      data-testid="input-weight"
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={
                      newLesson.lessonText.length < 10 || createLesson.isPending
                    }
                    onClick={() => {
                      createLesson.mutate({
                        lessonText: newLesson.lessonText,
                        category: newLesson.category,
                        pipelineStage: (newLesson.pipelineStage || undefined) as PipelineStage | undefined,
                        letterType: newLesson.letterType || undefined,
                        jurisdiction: newLesson.jurisdiction || undefined,
                        weight: newLesson.weight,
                        sourceAction: "manual",
                      });
                    }}
                    data-testid="button-submit-lesson"
                  >
                    {createLesson.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Create Lesson
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            {scopeGroups.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-consolidate-open">
                    <Layers className="w-4 h-4" />
                    Consolidate
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Consolidate Lessons</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Select a letter type / jurisdiction group to merge similar lessons using AI.
                  </p>
                  <div className="space-y-2 pt-2 max-h-64 overflow-y-auto">
                    {scopeGroups.map((g) => (
                      <Button
                        key={`${g.letterType}-${g.jurisdiction}`}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 text-xs"
                        disabled={consolidateMutation.isPending}
                        onClick={() =>
                          consolidateMutation.mutate({
                            letterType: g.letterType,
                            jurisdiction: g.jurisdiction,
                          })
                        }
                        data-testid={`button-consolidate-${g.letterType}-${g.jurisdiction ?? "all"}`}
                      >
                        {consolidateMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Layers className="w-3 h-3" />
                        )}
                        {g.letterType?.replace(/-/g, " ")}
                        {g.jurisdiction ? ` — ${g.jurisdiction}` : ""}
                      </Button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-stage">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All stages</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="filter-category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterLetterType} onValueChange={setFilterLetterType}>
              <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="filter-letter-type">
                <SelectValue placeholder="All letter types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All letter types</SelectItem>
                {LETTER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterActive} onValueChange={setFilterActive}>
              <SelectTrigger className="w-[120px] h-8 text-xs" data-testid="filter-active">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filterJurisdiction}
              onChange={(e) => setFilterJurisdiction(e.target.value)}
              placeholder="Jurisdiction..."
              className="w-[140px] h-8 text-xs"
              data-testid="filter-jurisdiction"
            />
            {(filterStage !== "__all__" || filterCategory !== "__all__" || filterActive !== "__all__" || filterLetterType !== "__all__" || filterJurisdiction) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-2 text-xs"
                data-testid="button-clear-filters"
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !filteredLessons || filteredLessons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {hasFilters || (filterCategory && filterCategory !== "__all__")
                ? "No lessons match the current filters."
                : "No lessons yet. Lessons are automatically created when attorneys approve, reject, or request changes on letters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLessons.map((lesson) => (
            <Card
              key={lesson.id}
              className={`transition-opacity ${!lesson.isActive ? "opacity-50" : ""}`}
              data-testid={`card-lesson-${lesson.id}`}
            >
              <CardContent className="py-4">
                {editingId === lesson.id ? (
                  <div className="space-y-3" data-testid={`edit-form-${lesson.id}`}>
                    <Textarea
                      value={editForm.lessonText}
                      onChange={(e) => setEditForm({ ...editForm, lessonText: e.target.value })}
                      rows={3}
                      className="text-sm"
                      data-testid={`edit-text-${lesson.id}`}
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select
                        value={editForm.category}
                        onValueChange={(v) => setEditForm({ ...editForm, category: v })}
                      >
                        <SelectTrigger className="w-[160px] h-8 text-xs" data-testid={`edit-category-${lesson.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-muted-foreground">Weight:</label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={editForm.weight}
                          onChange={(e) => setEditForm({ ...editForm, weight: parseInt(e.target.value) || 0 })}
                          className="w-[70px] h-8 text-xs"
                          data-testid={`edit-weight-${lesson.id}`}
                        />
                      </div>
                      <div className="flex gap-1.5 ml-auto">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                          className="h-8 px-2"
                          data-testid={`button-cancel-edit-${lesson.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          disabled={editForm.lessonText.length < 10 || updateLesson.isPending}
                          className="h-8 px-3 gap-1"
                          data-testid={`button-save-edit-${lesson.id}`}
                        >
                          {updateLesson.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge className={categoryColor(lesson.category)} variant="secondary">
                          {lesson.category?.replace(/_/g, " ")}
                        </Badge>
                        {lesson.pipelineStage && (
                          <Badge variant="outline">
                            Stage: {lesson.pipelineStage}
                          </Badge>
                        )}
                        {lesson.letterType && (
                          <Badge variant="outline">{lesson.letterType}</Badge>
                        )}
                        {lesson.jurisdiction && (
                          <Badge variant="outline">{lesson.jurisdiction}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {sourceLabel(lesson.sourceAction)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Weight: {lesson.weight}
                        </span>
                        <EffectivenessBadge
                          before={lesson.lettersBeforeAvgScore}
                          after={lesson.lettersAfterAvgScore}
                        />
                      </div>
                      <p className="text-sm leading-relaxed">{lesson.lessonText}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-muted-foreground">
                        {lesson.sourceLetterRequestId ? (
                          <span>From letter #{lesson.sourceLetterRequestId}</span>
                        ) : null}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysSince(lesson.createdAt)}d ago
                        </span>
                        {(lesson.hitCount ?? 1) > 1 && (
                          <span className="flex items-center gap-1" data-testid={`text-hit-count-${lesson.id}`}>
                            <Layers className="w-3 h-3" />
                            {lesson.hitCount} hits
                          </span>
                        )}
                        {(lesson.timesInjected ?? 0) > 0 && (
                          <span className="flex items-center gap-1" data-testid={`text-times-injected-${lesson.id}`}>
                            <Zap className="w-3 h-3" />
                            {lesson.timesInjected} injections
                          </span>
                        )}
                        {lesson.lastInjectedAt && (
                          <span>
                            Last injected: {new Date(lesson.lastInjectedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(lesson)}
                        data-testid={`button-edit-lesson-${lesson.id}`}
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateLesson.mutate({
                            id: lesson.id,
                            isActive: !lesson.isActive,
                          })
                        }
                        disabled={updateLesson.isPending}
                        data-testid={`button-toggle-lesson-${lesson.id}`}
                      >
                        {lesson.isActive ? (
                          <ToggleRight className="w-5 h-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function QualityTab() {
  const { data: stats, isLoading: statsLoading } =
    trpc.admin.qualityStats.useQuery();
  const { data: trend, isLoading: trendLoading } =
    trpc.admin.qualityTrend.useQuery({ days: 30 });
  const { data: byLetterType, isLoading: byTypeLoading } =
    trpc.admin.qualityByLetterType.useQuery();
  const { data: impactData, isLoading: impactLoading } =
    trpc.admin.lessonImpact.useQuery();

  const isLoading = statsLoading || trendLoading || byTypeLoading || impactLoading;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-avg-score">
                      {stats?.avgScore != null
                        ? Math.round(Number(stats.avgScore))
                        : "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Quality Score</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Target className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-first-pass-rate">
                      {stats?.firstPassRate != null
                        ? `${Math.round(Number(stats.firstPassRate))}%`
                        : "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">First-Pass Approval</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-avg-edit-dist">
                      {stats?.avgEditDistance != null
                        ? `${Math.round(Number(stats.avgEditDistance))}%`
                        : "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg Edit Distance</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <BookOpen className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-total-scored">
                      {String(stats?.totalScored ?? "\u2014")}
                    </p>
                    <p className="text-xs text-muted-foreground">Letters Scored</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {impactData && (impactData as any[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Lesson Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-lesson-impact">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Lesson</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Category</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Before</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">After</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Delta</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Injections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(impactData as any[]).map((row: any, i: number) => {
                        const delta = row.scoreDelta != null ? Number(row.scoreDelta) : null;
                        return (
                          <tr key={i} className="border-b last:border-0" data-testid={`row-impact-${i}`}>
                            <td className="py-2.5 max-w-[300px] truncate" title={row.lessonText}>
                              {String(row.lessonText).substring(0, 80)}
                              {String(row.lessonText).length > 80 ? "..." : ""}
                            </td>
                            <td className="py-2.5 text-center">
                              <Badge className={categoryColor(row.category)} variant="secondary">
                                {String(row.category ?? "general").replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right font-mono text-xs">
                              {row.lettersBeforeAvgScore ?? "\u2014"}
                            </td>
                            <td className="py-2.5 text-right font-mono text-xs">
                              {row.lettersAfterAvgScore ?? "\u2014"}
                            </td>
                            <td className="py-2.5 text-right">
                              {delta != null ? (
                                <span className={`font-semibold ${
                                  delta > 2 ? "text-green-600" : delta < -2 ? "text-red-600" : "text-muted-foreground"
                                }`}>
                                  {delta > 0 ? "+" : ""}{delta}
                                </span>
                              ) : "\u2014"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {String(row.timesInjected ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {byLetterType && byLetterType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quality by Letter Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-quality-by-type">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Letter Type</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Avg Score</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">First-Pass %</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Avg Revisions</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byLetterType.map((row, i: number) => {
                        const lt = String(row.letterType ?? "Unknown");
                        return (
                        <tr key={i} className="border-b last:border-0" data-testid={`row-quality-type-${i}`}>
                          <td className="py-2.5 font-medium capitalize">
                            {lt.replace(/[-_]/g, " ")}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className={`font-semibold ${
                              Number(row.avgScore) >= 70
                                ? "text-green-600"
                                : Number(row.avgScore) >= 40
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }`}>
                              {Math.round(Number(row.avgScore))}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            {row.firstPassRate != null
                              ? `${Math.round(Number(row.firstPassRate))}%`
                              : "\u2014"}
                          </td>
                          <td className="py-2.5 text-right">
                            {row.avgRevisions != null
                              ? Number(row.avgRevisions).toFixed(1)
                              : "\u2014"}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {String(row.total ?? 0)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {trend && trend.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">30-Day Quality Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {trend.map((entry, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-sm"
                      data-testid={`row-trend-${i}`}
                    >
                      <span className="text-muted-foreground w-24 shrink-0">
                        {new Date(String(entry.date)).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.round(Number(entry.avgScore)))}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right font-medium">
                        {Math.round(Number(entry.avgScore))}
                      </span>
                      <span className="text-muted-foreground w-8 text-right">
                        ({String(entry.count)})
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No quality scores yet. Scores are automatically computed when
                  attorneys approve or reject letters.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
