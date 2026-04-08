import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  FileText,
  Eye,
  Loader2,
} from "lucide-react";
import { LETTER_TYPE_CONFIG, LEGAL_SUBJECTS } from "../../../../shared/types";
import type { SituationFieldDef, IntakeFieldConfig, IntakeFormTemplateRecord } from "../../../../shared/types";

type LetterTypeKey = (typeof LEGAL_SUBJECTS)[number];

interface FieldConfig {
  enabledDefaultFields: string[];
  customFields: SituationFieldDef[];
}

const EMPTY_FIELD_CONFIG: FieldConfig = {
  enabledDefaultFields: [],
  customFields: [],
};

type EditorMode = "list" | "create" | "edit";

export default function IntakeFormTemplates() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.intakeFormTemplates.list.useQuery();
  const createMutation = trpc.intakeFormTemplates.create.useMutation({
    onSuccess: () => {
      utils.intakeFormTemplates.list.invalidate();
      toast.success("Template created");
      resetEditor();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.intakeFormTemplates.update.useMutation({
    onSuccess: () => {
      utils.intakeFormTemplates.list.invalidate();
      toast.success("Template updated");
      resetEditor();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.intakeFormTemplates.delete.useMutation({
    onSuccess: () => {
      utils.intakeFormTemplates.list.invalidate();
      toast.success("Template deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const [mode, setMode] = useState<EditorMode>("list");
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [baseLetterType, setBaseLetterType] = useState("");
  const [fieldConfig, setFieldConfig] = useState<FieldConfig>(EMPTY_FIELD_CONFIG);
  const [showPreview, setShowPreview] = useState(false);

  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<SituationFieldDef["type"]>("text");

  const defaultFieldsForType = useMemo(() => {
    if (!baseLetterType) return [];
    return LETTER_TYPE_CONFIG[baseLetterType]?.situationFields ?? [];
  }, [baseLetterType]);

  const resetEditor = () => {
    setMode("list");
    setEditId(null);
    setTitle("");
    setBaseLetterType("");
    setFieldConfig(EMPTY_FIELD_CONFIG);
    setShowPreview(false);
    setNewFieldLabel("");
    setNewFieldType("text");
  };

  const startCreate = () => {
    resetEditor();
    setMode("create");
  };

  const startEdit = (template: IntakeFormTemplateRecord) => {
    setMode("edit");
    setEditId(template.id);
    setTitle(template.title);
    setBaseLetterType(template.baseLetterType);
    const fc = template.fieldConfig;
    setFieldConfig({
      enabledDefaultFields: fc?.enabledDefaultFields ?? [],
      customFields: fc?.customFields ?? [],
    });
  };

  const handleSelectLetterType = (type: string) => {
    setBaseLetterType(type);
    const fields = LETTER_TYPE_CONFIG[type]?.situationFields ?? [];
    setFieldConfig(prev => ({
      ...prev,
      enabledDefaultFields: fields.filter(f => f.defaultEnabled).map(f => f.key),
    }));
  };

  const toggleDefaultField = (key: string) => {
    setFieldConfig(prev => ({
      ...prev,
      enabledDefaultFields: prev.enabledDefaultFields.includes(key)
        ? prev.enabledDefaultFields.filter(k => k !== key)
        : [...prev.enabledDefaultFields, key],
    }));
  };

  const addCustomField = () => {
    if (!newFieldLabel.trim()) return;
    const key = `custom_${newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}`;
    setFieldConfig(prev => ({
      ...prev,
      customFields: [
        ...prev.customFields,
        { key, label: newFieldLabel.trim(), type: newFieldType, defaultEnabled: true },
      ],
    }));
    setNewFieldLabel("");
    setNewFieldType("text");
  };

  const removeCustomField = (key: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFields: prev.customFields.filter(f => f.key !== key),
    }));
  };

  const handleSave = () => {
    if (!title.trim() || title.trim().length < 3) {
      toast.error("Title must be at least 3 characters");
      return;
    }
    if (!baseLetterType) {
      toast.error("Please select a base letter type");
      return;
    }
    if (mode === "create") {
      createMutation.mutate({ title: title.trim(), baseLetterType: baseLetterType as LetterTypeKey, fieldConfig });
    } else if (mode === "edit" && editId) {
      updateMutation.mutate({ id: editId, title: title.trim(), baseLetterType: baseLetterType as LetterTypeKey, fieldConfig });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const allPreviewFields = useMemo(() => {
    const defaults = defaultFieldsForType.filter(f => fieldConfig.enabledDefaultFields.includes(f.key));
    return [...defaults, ...fieldConfig.customFields];
  }, [defaultFieldsForType, fieldConfig]);

  if (mode !== "list") {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Intake Templates", href: "/subscriber/intake-templates" },
          { label: mode === "create" ? "New Template" : "Edit Template" },
        ]}
      >
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold" data-testid="text-template-editor-title">
              {mode === "create" ? "Create Intake Template" : "Edit Intake Template"}
            </h1>
            <Button variant="outline" size="sm" onClick={resetEditor} data-testid="button-cancel-editor">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Template Name *</Label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., My Custom Employment Intake"
                  data-testid="input-template-title"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Base Letter Type *</Label>
                <Select value={baseLetterType} onValueChange={handleSelectLetterType}>
                  <SelectTrigger data-testid="select-base-letter-type">
                    <SelectValue placeholder="Select letter type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LETTER_TYPE_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {baseLetterType && defaultFieldsForType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Default Fields</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Toggle which default fields to include for {LETTER_TYPE_CONFIG[baseLetterType]?.label}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {defaultFieldsForType.map(field => (
                  <label
                    key={field.key}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    data-testid={`toggle-default-field-${field.key}`}
                  >
                    <input
                      type="checkbox"
                      checked={fieldConfig.enabledDefaultFields.includes(field.key)}
                      onChange={() => toggleDefaultField(field.key)}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">{field.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">({field.type})</span>
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custom Fields</CardTitle>
              <p className="text-xs text-muted-foreground">
                Add your own fields to collect additional information
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {fieldConfig.customFields.map(field => (
                <div key={field.key} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{field.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">({field.type})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCustomField(field.key)}
                    data-testid={`button-remove-custom-${field.key}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 items-end pt-2 border-t">
                <div className="flex-1">
                  <Label className="text-xs mb-1 block">Field Label</Label>
                  <Input
                    value={newFieldLabel}
                    onChange={e => setNewFieldLabel(e.target.value)}
                    placeholder="e.g., Department Name"
                    data-testid="input-custom-field-label"
                    onKeyDown={e => e.key === "Enter" && addCustomField()}
                  />
                </div>
                <div className="w-32">
                  <Label className="text-xs mb-1 block">Type</Label>
                  <Select value={newFieldType} onValueChange={v => setNewFieldType(v as SituationFieldDef["type"])}>
                    <SelectTrigger data-testid="select-custom-field-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="textarea">Long Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={addCustomField} data-testid="button-add-custom-field">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              data-testid="button-toggle-preview"
            >
              <Eye className="w-4 h-4 mr-1" /> {showPreview ? "Hide Preview" : "Show Preview"}
            </Button>
          </div>

          {showPreview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Form Preview</CardTitle>
                <p className="text-xs text-muted-foreground">
                  This is how the situation fields will appear in Step 4 of the intake form
                </p>
              </CardHeader>
              <CardContent>
                {allPreviewFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No fields configured. Toggle default fields or add custom fields above.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allPreviewFields.map(field => {
                      const isFullWidth = field.type === "textarea";
                      return (
                        <div key={field.key} className={isFullWidth ? "sm:col-span-2" : ""}>
                          <Label className="text-sm font-medium mb-1.5 block">
                            {field.label} (Optional)
                          </Label>
                          {field.type === "textarea" ? (
                            <Textarea disabled rows={2} className="resize-none" placeholder={field.placeholder} />
                          ) : field.type === "select" && field.options ? (
                            <Select disabled>
                              <SelectTrigger>
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                            </Select>
                          ) : (
                            <Input
                              disabled
                              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                              placeholder={field.placeholder}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetEditor} data-testid="button-cancel-save">Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-template">
              {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              {mode === "create" ? "Create Template" : "Save Changes"}
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Intake Templates" },
      ]}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" data-testid="text-intake-templates-title">Intake Form Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customize which fields appear when submitting letters
            </p>
          </div>
          <Button onClick={startCreate} data-testid="button-create-template">
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !templates?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-medium text-lg mb-1">No templates yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a custom intake form template to control which fields appear when you submit letters
              </p>
              <Button onClick={startCreate} data-testid="button-create-first-template">
                <Plus className="w-4 h-4 mr-1" /> Create Your First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {templates.map(tmpl => {
              const fc = tmpl.fieldConfig as unknown as FieldConfig;
              const fieldCount = (fc?.enabledDefaultFields?.length ?? 0) + (fc?.customFields?.length ?? 0);
              return (
                <Card key={tmpl.id} data-testid={`card-template-${tmpl.id}`}>
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm truncate" data-testid={`text-template-title-${tmpl.id}`}>
                        {tmpl.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {LETTER_TYPE_CONFIG[tmpl.baseLetterType]?.label ?? tmpl.baseLetterType} · {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => startEdit({ ...tmpl, fieldConfig: tmpl.fieldConfig as unknown as IntakeFieldConfig })} data-testid={`button-edit-template-${tmpl.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this template?")) {
                            deleteMutation.mutate({ id: tmpl.id });
                          }
                        }}
                        data-testid={`button-delete-template-${tmpl.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
