import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { BlogPost } from "../../../drizzle/schema";
import AppLayout from "@/components/shared/AppLayout";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ExternalLink,
  FileText,
} from "lucide-react";

const CATEGORIES = [
  { value: "demand-letters", label: "Demand Letters" },
  { value: "cease-and-desist", label: "Cease & Desist" },
  { value: "contract-disputes", label: "Contract Disputes" },
  { value: "document-analysis", label: "Document Analysis" },
  { value: "pricing-and-roi", label: "Pricing & ROI" },
  { value: "general", label: "General" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 300);
}

interface PostForm {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  metaDescription: string;
  ogImageUrl: string;
  authorName: string;
  status: "draft" | "published";
}

const emptyForm: PostForm = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  category: "general",
  metaDescription: "",
  ogImageUrl: "",
  authorName: "Talk to My Lawyer",
  status: "draft",
};

export default function BlogEditor() {
  const utils = trpc.useUtils();
  const { data: posts, isLoading } = trpc.blog.adminList.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PostForm>({ ...emptyForm });
  const [autoSlug, setAutoSlug] = useState(true);

  const createMutation = trpc.blog.adminCreate.useMutation({
    onSuccess: () => {
      utils.blog.adminList.invalidate();
      setDialogOpen(false);
      toast.success("Post created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.blog.adminUpdate.useMutation({
    onSuccess: () => {
      utils.blog.adminList.invalidate();
      setDialogOpen(false);
      toast.success("Post updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.blog.adminDelete.useMutation({
    onSuccess: () => {
      utils.blog.adminList.invalidate();
      toast.success("Post deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setAutoSlug(true);
    setDialogOpen(true);
  };

  const openEdit = (post: BlogPost) => {
    setEditingId(post.id);
    setForm({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      metaDescription: post.metaDescription ?? "",
      ogImageUrl: post.ogImageUrl ?? "",
      authorName: post.authorName,
      status: post.status as "draft" | "published",
    });
    setAutoSlug(false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.slug || !form.excerpt || !form.content) {
      toast.error("Title, slug, excerpt, and content are required");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form, metaDescription: form.metaDescription || null, ogImageUrl: form.ogImageUrl || null });
    } else {
      createMutation.mutate({ ...form, metaDescription: form.metaDescription || undefined, ogImageUrl: form.ogImageUrl || undefined });
    }
  };

  const handleTitleChange = (title: string) => {
    setForm((f) => ({
      ...f,
      title,
      slug: autoSlug ? slugify(title) : f.slug,
    }));
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout
      title="Blog Management"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Blog" },
      ]}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-blog-admin-title">Blog Management</h1>
            <p className="text-sm text-muted-foreground mt-1">{posts?.length ?? 0} total posts</p>
          </div>
          <Button onClick={openCreate} data-testid="button-create-post">
            <Plus className="w-4 h-4 mr-2" />
            New Post
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-card border rounded-lg p-4 animate-pulse">
                <div className="h-5 bg-muted rounded w-1/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="text-center py-16 bg-card border rounded-xl">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-posts">No blog posts yet</h2>
            <p className="text-muted-foreground mb-4">Create your first post to get started.</p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create Post
            </Button>
          </div>
        ) : (
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Updated</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-post-${post.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground line-clamp-1">{post.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">/{post.slug}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {CATEGORY_LABELS[post.category] ?? post.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        post.status === "published"
                          ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}>
                        {post.status === "published" ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {new Date(post.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {post.status === "published" && (
                          <Button variant="ghost" size="icon" asChild title="View on site" data-testid={`button-view-${post.id}`}>
                            <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(post)} title="Edit" data-testid={`button-edit-${post.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this post?")) deleteMutation.mutate({ id: post.id });
                          }}
                          title="Delete"
                          data-testid={`button-delete-${post.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Post" : "Create New Post"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
              <Input
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter post title"
                data-testid="input-title"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Slug</label>
              <Input
                value={form.slug}
                onChange={(e) => { setAutoSlug(false); setForm((f) => ({ ...f, slug: e.target.value })); }}
                placeholder="url-friendly-slug"
                data-testid="input-slug"
              />
              {autoSlug && form.slug && (
                <p className="text-xs text-muted-foreground mt-1">Auto-generated from title</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Status</label>
                <Select value={form.status} onValueChange={(v: "draft" | "published") => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Excerpt</label>
              <Textarea
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                placeholder="Brief summary for the blog listing"
                rows={2}
                data-testid="input-excerpt"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Content (Markdown)</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write your blog post content in markdown..."
                rows={12}
                className="font-mono text-sm"
                data-testid="input-content"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Meta Description (SEO)</label>
              <Textarea
                value={form.metaDescription}
                onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                placeholder="150-160 character description for search results"
                rows={2}
                data-testid="input-meta-description"
              />
              <p className="text-xs text-muted-foreground mt-1">{form.metaDescription.length}/160 characters</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">OG Image URL</label>
                <Input
                  value={form.ogImageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, ogImageUrl: e.target.value }))}
                  placeholder="https://..."
                  data-testid="input-og-image"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Author Name</label>
                <Input
                  value={form.authorName}
                  onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))}
                  data-testid="input-author"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">Cancel</Button>
              {editingId && form.status === "published" && (
                <Button variant="outline" asChild data-testid="button-preview">
                  <a href={`/blog/${form.slug}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </a>
                </Button>
              )}
              <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save">
                {isSaving ? "Saving..." : editingId ? "Update Post" : "Create Post"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
