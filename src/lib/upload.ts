import { getSupabase } from "./supabase";
export async function uploadFile(
  file: File,
  demo: boolean,
): Promise<{ url: string; name: string; size: number }> {
  if (demo)
    throw new Error(
      "Connect Supabase and R2 to upload media. You can preview and save text locally for now.",
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
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      name: upload.name,
      type: upload.type,
      size: upload.size,
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Couldn’t prepare the upload.");
  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": upload.type },
    body: upload,
  });
  if (!put.ok)
    throw new Error(
      "Upload failed. Please check your R2 CORS configuration and try again.",
    );
  return { url: data.publicUrl, name: file.name, size: upload.size };
}
