import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Upload, X, Loader2, Info } from "lucide-react";
import { Link } from "wouter";
import { ALLOWED_EXTS, MAX_MB } from "./hooks/useDocumentAnalyzer";

interface FileUploadZoneProps {
  file: File | null;
  dragging: boolean;
  isAnalyzing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onRemoveFile: () => void;
  onAnalyze: () => void;
}

export function FileUploadZone({
  file,
  dragging,
  isAnalyzing,
  fileInputRef,
  onFile,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveFile,
  onAnalyze,
}: FileUploadZoneProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      {/* Drag & Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl transition-all ${
          file
            ? "border-blue-300 bg-blue-50/40 cursor-default"
            : dragging
            ? "border-blue-500 bg-blue-50 cursor-pointer scale-[1.01] animate-drag-glow"
            : "border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer"
        } p-8 sm:p-12 flex flex-col items-center gap-4 text-center`}
        data-testid="upload-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTS.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
          data-testid="input-file"
        />

        {file ? (
          <>
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
              <FileText className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-base">{file.name}</p>
              <p className="text-sm text-slate-400 mt-0.5">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile();
              }}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              data-testid="button-remove-file"
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Upload className="w-7 h-7 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-base">
                Drag & drop your document here
              </p>
              <p className="text-sm text-slate-400 mt-1">
                or click to browse — PDF, DOCX, or TXT up to {MAX_MB} MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Analyze button */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center justify-center">
        <Button
          onClick={onAnalyze}
          disabled={!file || isAnalyzing}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl text-base font-semibold shadow-md shadow-blue-600/20 disabled:opacity-50"
          data-testid="button-analyze"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing document…
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Analyze Document
            </>
          )}
        </Button>
        {!file && (
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto"
            data-testid="button-choose-file"
          >
            Choose File
          </Button>
        )}
      </div>

      {/* Progress hint */}
      {isAnalyzing && (
        <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Processing your document</p>
            <p className="text-sm text-blue-600 mt-0.5">
              Extracting text, analyzing legal content, identifying recommended actions and
              risks… This may take 15–30 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Info line */}
      {!isAnalyzing && (
        <p className="mt-5 text-center text-xs text-slate-400">
          <Info className="inline w-3 h-3 mr-1" />
          Unauthenticated users are limited to 3 analyses per hour.
          <Link href="/login" className="underline ml-1 text-blue-500">
            Sign in
          </Link>{" "}
          for higher limits.
        </p>
      )}
    </div>
  );
}
