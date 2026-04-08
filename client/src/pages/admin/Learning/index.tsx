import { useState } from "react";
import AppLayout from "@/components/shared/AppLayout";
import { Brain, BookOpen, BarChart3 } from "lucide-react";
import { LessonsTab } from "./LessonsTab";
import { QualityTab } from "./QualityTab";

export default function AdminLearning() {
  const [activeTab, setActiveTab] = useState<"lessons" | "quality">("lessons");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <AppLayout>
      <div className="space-y-6" data-testid="admin-learning-page">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight flex items-center gap-2"
            data-testid="text-page-title"
          >
            <Brain className="w-6 h-6 text-indigo-600" />
            Recursive Learning System
          </h1>
          <p className="text-muted-foreground mt-1">
            System pipeline lessons extracted from attorney feedback and quality
            metrics.
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
