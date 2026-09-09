/** ASCII-only object-key basename. The UI keeps file.name as original_filename. */
export function storageSafeFilename(name: string): string {
  const basename = name.normalize("NFKC").split(/[\\/]/).pop() || "";
  const extensionMatch = basename.match(/\.([A-Za-z0-9]{1,10})$/);
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  const rawStem = extension ? basename.slice(0, -extension.length) : basename;
  const stem = rawStem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "") || "material";
  return `${stem.slice(0, 120 - extension.length)}${extension}`;
}
