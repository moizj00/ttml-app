import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
} from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Library,
  X,
} from "lucide-react";

interface PrefillData {
  subject?: string;
  description?: string;
  desiredOutcome?: string;
  tonePreference?: "firm" | "moderate" | "aggressive";
  amountOwed?: string;
  letterType?: string;
  jurisdictionState?: string;
  jurisdictionCity?: string;
  additionalContext?: string;
}

type TonePreference = "firm" | "moderate" | "aggressive";

const EMPTY_FORM = {
  title: "",
  scenarioDescription: "",
  category: "",
  tags: "",
  letterType: "demand-letter" as string,
  subject: "",
  description: "",
  desiredOutcome: "",
  tonePreference: "firm" as TonePreference,
  amountOwed: "",
  jurisdictionState: "",
  jurisdictionCity: "",
  additionalContext: "",
  active: true,
  sortOrder: 0,
  contextualNotes: "",
};

export default function AdminTemplates() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.templates.listAll.useQuery();
  const createMutation = trpc.templates.create.useMutation({
    onSuccess: () => {
      utils.templates.listAll.invalidate();
      toast.success("Template created");
      setDialogOpen(false);
    },
    onError: (err) => toast.error("Failed to create template", { description: err.message }),
  });
  const updateMutation = trpc.templates.update.useMutation({
    onSuccess: () => {
      utils.templates.listAll.invalidate();
      toast.success("Template updated");
      setDialogOpen(false);
    },
    onError: (err) => toast.error("Failed to update template", { description: err.message }),
  });
  const toggleMutation = trpc.templates.toggleActive.useMutation({
    onSuccess: () => {
      utils.templates.listAll.invalidate();
      toast.success("Template status updated");
    },
    onError: (err) => toast.error("Failed to toggle template", { description: err.message }),
  });
  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => {
      utils.templates.listAll.invalidate();
      toast.success("Template deleted");
    },
    onError: (err) => toast.error("Failed to delete template", { description: err.message }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (t: NonNullable<typeof templates>[number]) => {
    setEditingId(t.id);
    const pf = (t.prefillData ?? {}) as PrefillData;
    setForm({
      title: t.title,
      scenarioDescription: t.scenarioDescription,
      category: t.category,
      tags: t.tags.join(", "),
      letterType: t.letterType,
      subject: pf.subject ?? "",
      description: pf.description ?? "",
      desiredOutcome: pf.desiredOutcome ?? "",
      tonePreference: (pf.tonePreference ?? "firm") as TonePreference,
      amountOwed: pf.amountOwed ?? "",
      jurisdictionState: pf.jurisdictionState ?? "",
      jurisdictionCity: pf.jurisdictionCity ?? "",
      additionalContext: pf.additionalContext ?? "",
      active: t.active,
      sortOrder: t.sortOrder,
      contextualNotes: t.contextualNotes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const prefillData: PrefillData = {
      ...(form.subject && { subject: form.subject }),
      ...(form.description && { description: form.description }),
      ...(form.desiredOutcome && { desiredOutcome: form.desiredOutcome }),
      ...(form.tonePreference && { tonePreference: form.tonePreference }),
      ...(form.amountOwed && { amountOwed: form.amountOwed }),
      ...(form.letterType && { letterType: form.letterType }),
      ...(form.jurisdictionState && { jurisdictionState: form.jurisdictionState }),
      ...(form.jurisdictionCity && { jurisdictionCity: form.jurisdictionCity }),
      ...(form.additionalContext && { additionalContext: form.additionalContext }),
    };

    const payload = {
      title: form.title,
      scenarioDescription: form.scenarioDescription,
      category: form.category,
      tags,
      letterType: form.letterType as typeof EMPTY_FORM.letterType,
      prefillData,
      active: form.active,
      sortOrder: form.sortOrder,
      contextualNotes: form.contextualNotes || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload } as Parameters<typeof updateMutation.mutate>[0]);
    } else {
      createMutation.mutate(payload as Parameters<typeof createMutation.mutate>[0]);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to permanently delete this template?")) {
      deleteMutation.mutate({ id });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Template Library" },
      ]}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-admin-templates-title">Template Library</h1>
            <p className="text-sm text-muted-foreground">
              Manage demand letter scenario templates. Subscribers browse active templates to pre-fill their intake form.
            </p>
          </div>
          <Button onClick={openCreate} data-testid="button-create-template">
            <Plus className="w-4 h-4 mr-1.5" />
            New Template
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !templates?.length ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
            <Library className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No templates yet</p>
            <p className="text-xs text-muted-foreground">Create your first template to get started.</p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Create Template
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Category</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Letter Type</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-center">Active</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell text-center">Order</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates?.map(t => (
                  <tr key={t.id} className="border-t border-border hover:bg-muted/30 transition-colors" data-testid={`template-row-${t.id}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{t.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.scenarioDescription}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {LETTER_TYPE_CONFIG[t.letterType]?.label ?? t.letterType}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={t.active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: t.id, active: checked })}
                        data-testid={`switch-active-${t.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-center text-muted-foreground">
                      {t.sortOrder}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(t)}
                          data-testid={`button-edit-template-${t.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(t.id)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-template-${t.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">
                {editingId ? "Edit Template" : "Create Template"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Title *</Label>
                  <Input
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g., Unpaid Invoice"
                    maxLength={200}
                    data-testid="input-template-title"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Category *</Label>
                  <Input
                    value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    placeholder="e.g., Unpaid Money"
                    maxLength={100}
                    data-testid="input-template-category"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">Scenario Description *</Label>
                <Textarea
                  value={form.scenarioDescription}
                  onChange={e => setForm(p => ({ ...p, scenarioDescription: e.target.value }))}
                  placeholder="Describe the scenario this template covers..."
                  rows={3}
                  data-testid="input-template-scenario"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Letter Type *</Label>
                  <Select value={form.letterType} onValueChange={v => setForm(p => ({ ...p, letterType: v }))}>
                    <SelectTrigger data-testid="select-template-letter-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LETTER_TYPE_CONFIG).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Tags (comma-separated)</Label>
                  <Input
                    value={form.tags}
                    onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="e.g., invoice, payment, debt"
                    data-testid="input-template-tags"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-foreground mb-3">Pre-fill Data</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Subject</Label>
                    <Input
                      value={form.subject}
                      onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                      placeholder="Subject line for the letter..."
                      data-testid="input-template-subject"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Pre-fill description for the intake form..."
                      rows={4}
                      data-testid="input-template-description"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Desired Outcome</Label>
                    <Textarea
                      value={form.desiredOutcome}
                      onChange={e => setForm(p => ({ ...p, desiredOutcome: e.target.value }))}
                      placeholder="What the sender hopes to achieve..."
                      rows={2}
                      data-testid="input-template-desired-outcome"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">Tone</Label>
                      <Select value={form.tonePreference} onValueChange={(v: string) => setForm(p => ({ ...p, tonePreference: v as TonePreference }))}>
                        <SelectTrigger data-testid="select-template-tone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="firm">Firm</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="aggressive">Aggressive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">Amount Owed</Label>
                      <Input
                        value={form.amountOwed}
                        onChange={e => setForm(p => ({ ...p, amountOwed: e.target.value }))}
                        placeholder="e.g., 3500"
                        data-testid="input-template-amount"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">Sort Order</Label>
                      <Input
                        type="number"
                        value={form.sortOrder}
                        onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                        data-testid="input-template-sort-order"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">Default Jurisdiction State</Label>
                      <Input
                        value={form.jurisdictionState}
                        onChange={e => setForm(p => ({ ...p, jurisdictionState: e.target.value }))}
                        placeholder="e.g., California"
                        data-testid="input-template-jurisdiction-state"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-1.5 block">Default Jurisdiction City</Label>
                      <Input
                        value={form.jurisdictionCity}
                        onChange={e => setForm(p => ({ ...p, jurisdictionCity: e.target.value }))}
                        placeholder="e.g., Los Angeles"
                        data-testid="input-template-jurisdiction-city"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">Additional Context</Label>
                    <Textarea
                      value={form.additionalContext}
                      onChange={e => setForm(p => ({ ...p, additionalContext: e.target.value }))}
                      placeholder="Additional context or instructions for the drafting engine..."
                      rows={2}
                      data-testid="input-template-additional-context"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1.5 block">Contextual Notes (admin-only)</Label>
                <Textarea
                  value={form.contextualNotes}
                  onChange={e => setForm(p => ({ ...p, contextualNotes: e.target.value }))}
                  placeholder="Internal notes about this template..."
                  rows={2}
                  data-testid="input-template-notes"
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={form.active}
                  onCheckedChange={checked => setForm(p => ({ ...p, active: checked }))}
                  data-testid="switch-template-active"
                />
                <Label className="text-sm">
                  {form.active ? "Active — visible to subscribers" : "Inactive — hidden from subscribers"}
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-template">
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !form.title || !form.scenarioDescription || !form.category}
                  data-testid="button-save-template"
                >
                  {isSaving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Template"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
