import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Plus,
  ToggleLeft,
  ToggleRight,
  Target,
  BookOpen,
  Loader2,
  Pencil,
  X,
  Check,
  Filter,
  Layers,
  Clock,
  Zap,
} from "lucide-react";
import { EffectivenessBadge } from "./EffectivenessBadge";
import { useLessonsTab } from "./hooks/useLessonsTab";
import {
  CATEGORIES,
  STAGES,
  LETTER_TYPES,
  categoryColor,
  sourceLabel,
  daysSince,
  LessonCategory,
  PipelineStage,
} from "./constants";

interface LessonsTabProps {
  showCreateDialog: boolean;
  setShowCreateDialog: (v: boolean) => void;
}

export function LessonsTab({
  showCreateDialog,
  setShowCreateDialog,
}: LessonsTabProps) {
  const {
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
    filteredLessons,
    isLoading,
    activeCount,
    totalCount,
    scopeGroups,
    editingId,
    editForm,
    setEditForm,
    startEdit,
    cancelEdit,
    saveEdit,
    newLesson,
    setNewLesson,
    submitNewLesson,
    updateLesson,
    createLesson,
    consolidateMutation,
  } = useLessonsTab(setShowCreateDialog);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-lessons">
                  {totalCount}
                </p>
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
                <p className="text-2xl font-bold" data-testid="text-active-lessons">
                  {activeCount}
                </p>
                <p className="text-xs text-muted-foreground">Active (Injected)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between gap-2">
            {/* Create dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  data-testid="button-create-lesson"
                >
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
                      placeholder="Describe the lesson the system should learn..."
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
                          setNewLesson({
                            ...newLesson,
                            category: v as LessonCategory,
                          })
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
                          setNewLesson({
                            ...newLesson,
                            jurisdiction: e.target.value,
                          })
                        }
                        placeholder="e.g. CA, NY"
                        data-testid="input-jurisdiction"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Weight (0–100)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={newLesson.weight}
                      onChange={(e) =>
                        setNewLesson({
                          ...newLesson,
                          weight: parseInt(e.target.value) || 0,
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
                    onClick={submitNewLesson}
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

            {/* Consolidate dialog */}
            {scopeGroups.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    data-testid="button-consolidate-open"
                  >
                    <Layers className="w-4 h-4" />
                    Consolidate
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Consolidate Lessons</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Select a letter type / jurisdiction group to merge similar
                    lessons automatically.
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
                        data-testid={`button-consolidate-${g.letterType}-${
                          g.jurisdiction ?? "all"
                        }`}
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

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger
                className="w-[140px] h-8 text-xs"
                data-testid="filter-stage"
              >
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
              <SelectTrigger
                className="w-[160px] h-8 text-xs"
                data-testid="filter-category"
              >
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
              <SelectTrigger
                className="w-[160px] h-8 text-xs"
                data-testid="filter-letter-type"
              >
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
              <SelectTrigger
                className="w-[120px] h-8 text-xs"
                data-testid="filter-active"
              >
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
            {(filterStage !== "__all__" ||
              filterCategory !== "__all__" ||
              filterActive !== "__all__" ||
              filterLetterType !== "__all__" ||
              filterJurisdiction) && (
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

      {/* Lesson list */}
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
                  <div
                    className="space-y-3"
                    data-testid={`edit-form-${lesson.id}`}
                  >
                    <Textarea
                      value={editForm.lessonText}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lessonText: e.target.value })
                      }
                      rows={3}
                      className="text-sm"
                      data-testid={`edit-text-${lesson.id}`}
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <Select
                        value={editForm.category}
                        onValueChange={(v) =>
                          setEditForm({ ...editForm, category: v })
                        }
                      >
                        <SelectTrigger
                          className="w-[160px] h-8 text-xs"
                          data-testid={`edit-category-${lesson.id}`}
                        >
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
                        <label className="text-xs text-muted-foreground">
                          Weight:
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={editForm.weight}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              weight: parseInt(e.target.value) || 0,
                            })
                          }
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
                          disabled={
                            editForm.lessonText.length < 10 ||
                            updateLesson.isPending
                          }
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
                        <Badge
                          className={categoryColor(lesson.category)}
                          variant="secondary"
                        >
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
                      <p className="text-sm leading-relaxed">
                        {lesson.lessonText}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-muted-foreground">
                        {lesson.sourceLetterRequestId ? (
                          <span>
                            From letter #{lesson.sourceLetterRequestId}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysSince(lesson.createdAt)}d ago
                        </span>
                        {(lesson.hitCount ?? 1) > 1 && (
                          <span
                            className="flex items-center gap-1"
                            data-testid={`text-hit-count-${lesson.id}`}
                          >
                            <Layers className="w-3 h-3" />
                            {lesson.hitCount} hits
                          </span>
                        )}
                        {(lesson.timesInjected ?? 0) > 0 && (
                          <span
                            className="flex items-center gap-1"
                            data-testid={`text-times-injected-${lesson.id}`}
                          >
                            <Zap className="w-3 h-3" />
                            {lesson.timesInjected} injections
                          </span>
                        )}
                        {lesson.lastInjectedAt && (
                          <span>
                            Last injected:{" "}
                            {new Date(
                              lesson.lastInjectedAt
                            ).toLocaleDateString()}
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
