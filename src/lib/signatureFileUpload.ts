import { supabase } from "@/integrations/supabase/client";

/** Reconcile a lost INSERT response using the caller's RLS and exact bytes. Never overwrite or delete. */
export async function uploadImmutableSignatureFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from("external-contracts").upload(path, file, { contentType: file.type, upsert: false });
  if (!error) return;
  const existing = await supabase.storage.from("external-contracts").download(path);
  if (!existing.error && existing.data && existing.data.size === file.size) {
    const [actual, expected] = await Promise.all([existing.data.arrayBuffer(), file.arrayBuffer()]);
    const hashes = await Promise.all([actual, expected].map(bytes => crypto.subtle.digest("SHA-256", bytes)));
    if (new Uint8Array(hashes[0]).every((byte, i) => byte === new Uint8Array(hashes[1])[i])) return;
  }
  throw new Error("Не удалось подтвердить загрузку файла. Повторите попытку; существующий файл не изменён.");
}
