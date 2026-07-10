import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";

const storage = new Storage();

export async function uploadPng(bucketName, buffer, prefix = "scenes", customMetadata = {}) {
  if (!bucketName) throw new Error("bucketName is required");
  const key = `${prefix}/${Date.now()}-${randomUUID()}.png`;
  const file = storage.bucket(bucketName).file(key);
  // GCS custom key/values must be strings.
  const meta = {};
  for (const [k, v] of Object.entries(customMetadata || {})) {
    if (v !== undefined && v !== null) meta[k] = String(v);
  }
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: { cacheControl: "public, max-age=86400", metadata: meta }
  });
  return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(key)}`;
}

// Write a JSON object to a FIXED key (overwrite) — used for per-client brand config.
export async function writeJson(bucketName, key, obj) {
  if (!bucketName) throw new Error("bucketName is required");
  await storage.bucket(bucketName).file(key).save(Buffer.from(JSON.stringify(obj)), {
    contentType: "application/json",
    resumable: false,
    metadata: { cacheControl: "no-store" }
  });
  return true;
}

// Read a JSON object from a fixed key (null if it doesn't exist yet).
export async function readJson(bucketName, key) {
  if (!bucketName) throw new Error("bucketName is required");
  const file = storage.bucket(bucketName).file(key);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  try { return JSON.parse(buf.toString("utf8")); } catch(_) { return null; }
}

// List saved assets under a prefix (e.g. clients/drmax/images/) with their custom metadata.
export async function listFiles(bucketName, prefix) {
  if (!bucketName) throw new Error("bucketName is required");
  const [files] = await storage.bucket(bucketName).getFiles({ prefix });
  return files
    .filter((f) => !f.name.endsWith("/"))
    .map((f) => ({
      url: `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(f.name)}`,
      name: f.name,
      created: f.metadata?.timeCreated || null,
      meta: f.metadata?.metadata || {}
    }));
}
