import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";

interface LockedLetterDocumentProps {
  content: string;
  subject?: string;
  letterType?: string;
}

export function LockedLetterDocument({
  content,
  subject,
  letterType,
}: LockedLetterDocumentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Determine if focus or selection is inside our container
      const activeElement = document.activeElement;
      const selection = window.getSelection();
      let isInside = false;

      if (containerRef.current) {
        if (activeElement && containerRef.current.contains(activeElement)) {
          isInside = true;
        } else if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (containerRef.current.contains(range.commonAncestorContainer)) {
            isInside = true;
          }
        }
      }

      if (!isInside) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      if (
        cmdKey &&
        (e.key === "c" ||
          e.key === "C" ||
          e.key === "p" ||
          e.key === "P" ||
          e.key === "s" ||
          e.key === "S" ||
          e.key === "a" ||
          e.key === "A")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const preventEvent = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const isHtml = /<[a-z]/i.test(content);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          .locked-letter-doc {
            display: none !important;
          }
        }
      `,
        }}
      />
      <div
        ref={containerRef}
        className="locked-letter-doc relative bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
        style={{
          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
        onCopy={preventEvent}
        onCut={preventEvent}
        onContextMenu={preventEvent}
        onDragStart={preventEvent}
        draggable={false}
        tabIndex={0}
      >
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-10"
          aria-hidden="true"
        >
          <div className="transform -rotate-45 text-4xl sm:text-6xl font-extrabold text-slate-300/30 whitespace-nowrap tracking-widest uppercase">
            PREVIEW — ATTORNEY REVIEW REQUIRED
          </div>
        </div>

        <div className="p-8 sm:p-12 relative z-0">
          {(subject || letterType) && (
            <div className="mb-8 pb-6 border-b border-slate-100">
              {letterType && (
                <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {letterType}
                </div>
              )}
              {subject && (
                <div className="text-xl font-serif font-medium text-slate-900">
                  Re: {subject}
                </div>
              )}
            </div>
          )}

          {isHtml ? (
            <div
              className="prose prose-slate max-w-none text-slate-800 font-serif leading-relaxed"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <pre className="text-base text-slate-800 whitespace-pre-wrap font-serif leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
