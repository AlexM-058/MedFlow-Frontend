// Local file checks. Files are only inspected in the browser; never uploaded or logged.

export interface FileRule {
  /** Allowed MIME types, e.g. ['application/pdf', 'image/jpeg', 'image/png']. */
  mimeTypes: readonly string[];
  /** Allowed lowercase extensions including the dot, e.g. ['.pdf', '.jpg']. */
  extensions: readonly string[];
  maxBytes: number;
  /** Human label used in messages, e.g. "PDF, JPG or PNG". */
  label: string;
}

export const MB = 1024 * 1024;

export const CREDENTIAL_FILE_RULE: FileRule = {
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
  maxBytes: 10 * MB,
  label: 'PDF, JPG or PNG',
};

export const SUGGESTION_PHOTO_RULE: FileRule = {
  mimeTypes: ['image/jpeg', 'image/png'],
  extensions: ['.jpg', '.jpeg', '.png'],
  maxBytes: 10 * MB,
  label: 'JPG or PNG',
};

/** Value for an <input type="file" accept> attribute. */
export function acceptAttribute(rule: FileRule): string {
  return [...rule.mimeTypes, ...rule.extensions].join(',');
}

/** Returns an error message, or null when the file is acceptable. */
export function validateFile(file: { name: string; type: string; size: number }, rule: FileRule): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  const typeOk = file.type ? rule.mimeTypes.includes(file.type) : true;
  if (!rule.extensions.includes(extension) || !typeOk) {
    return `Choose a ${rule.label} file.`;
  }
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > rule.maxBytes) {
    return `The file is larger than ${Math.round(rule.maxBytes / MB)} MB.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
