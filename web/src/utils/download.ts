/** Завантажує Blob як файл (створює тимчасовий anchor і клікає). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Завантажує текст як файл (`text/plain`). */
export function downloadText(text: string, filename: string): void {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}
