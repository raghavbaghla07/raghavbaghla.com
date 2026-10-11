import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export const runtime = "nodejs";
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 },
    );
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user)
    return NextResponse.json(
      { error: "Your session has expired." },
      { status: 401 },
    );
  const admin = await db.rpc("is_admin");
  if (admin.error || !admin.data)
    return NextResponse.json(
      { error: "Only the portfolio owner can upload." },
      { status: 403 },
    );
  const account = process.env.R2_ACCOUNT_ID,
    bucket = process.env.R2_BUCKET_NAME,
    accessKeyId = process.env.R2_ACCESS_KEY_ID,
    secretAccessKey = process.env.R2_SECRET_ACCESS_KEY,
    publicUrl = process.env.R2_PUBLIC_URL;
  if (!account || !bucket || !accessKeyId || !secretAccessKey || !publicUrl)
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured yet." },
      { status: 503 },
    );
  try {
    const body = await request.json();
    const extension = extensions[body.type];
    if (
      !extension ||
      !Number.isSafeInteger(body.size) ||
      body.size <= 0 ||
      body.size > 20 * 1024 * 1024 ||
      typeof body.name !== "string" ||
      body.name.length > 250
    )
      return NextResponse.json(
        { error: "Use JPG, PNG, WebP, PDF, DOCX, or TXT files up to 20 MB." },
        { status: 400 },
      );
    const objectKey = `media/${user.id}/${crypto.randomUUID()}.${extension}`;
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: body.type,
      ContentLength: body.size,
      CacheControl: "public, max-age=31536000, immutable",
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 120 });
    return NextResponse.json({
      uploadUrl,
      publicUrl: `${publicUrl.replace(/\/$/, "")}/${objectKey}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn’t prepare this upload. Please try again." },
      { status: 500 },
    );
  }
}
