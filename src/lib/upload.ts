import { getSupabase } from "./supabase";
export async function uploadFile(
  file: File,
  demo: boolean,
): Promise<{ url: string; name: string; size: number }> {
  if (demo)
    throw new Error(
      "Connect Supabase to upload media. You can preview and save text locally for now.",
    );
  let upload = file;
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn’t prepare this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.88),
    );
    if (blob && (blob.size < file.size || scale < 1))
      upload = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
        type: "image/webp",
      });
  }
  const {
    data: { session },
  } = await getSupabase()!.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };
  const extension = extensions[upload.type];
  if (!extension || upload.size === 0 || upload.size > 20 * 1024 * 1024)
    throw new Error("Use JPG, PNG, WebP, PDF, DOCX, or TXT files up to 20 MB.");
  const storage = getSupabase()!.storage.from("portfolio-media");
  const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await storage.upload(path, upload, {
    contentType: upload.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return {
    url: storage.getPublicUrl(path).data.publicUrl,
    name: file.name,
    size: upload.size,
  };
}
