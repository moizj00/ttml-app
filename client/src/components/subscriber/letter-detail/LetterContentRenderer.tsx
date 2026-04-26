interface LetterContentRendererProps {
  content: string;
  borderClass?: string;
}

export function LetterContentRenderer({ content, borderClass = "border-muted" }: LetterContentRendererProps) {
  return (
    <div className={`bg-white border ${borderClass} rounded-lg p-5`}>
      {/<[a-z][\s\S]*>/i.test(content) ? (
        <div
          className="prose prose-sm max-w-none text-foreground prose-p:my-2 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans">
          {content}
        </pre>
      )}
    </div>
  );
}
