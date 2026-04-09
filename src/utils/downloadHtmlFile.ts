/**
 * Downloads HTML content as a file. Fetches from a signed URL and triggers browser download.
 */
export async function downloadHtmlFile(url: string, fileName: string) {
  const res = await fetch(url);
  const text = await res.text();
  const blob = new Blob([text], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  // Ensure .html extension
  const safeName = fileName.endsWith(".html") ? fileName : `${fileName}.html`;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
