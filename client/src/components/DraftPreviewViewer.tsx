import FreePreviewViewer, {
  FreePreviewViewer as DraftPreviewViewer,
} from "./FreePreviewViewer";

/**
 * Coherent public name for the generic 24-hour draft visibility renderer.
 * The underlying implementation is temporarily reused for compatibility while
 * legacy FreePreview* files/tests still exist.
 */
export { DraftPreviewViewer };
export default FreePreviewViewer;
