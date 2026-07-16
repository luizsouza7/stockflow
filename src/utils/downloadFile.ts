import type { ExportFile } from '../services/backupExportService';

export function downloadFile(file: ExportFile): void {
  const blob = new Blob([file.content], { type: file.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = objectUrl;
    anchor.download = file.fileName;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  } catch (error) {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

