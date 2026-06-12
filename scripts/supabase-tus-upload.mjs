import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename } from "node:path";

const CHUNK_SIZE = 6 * 1024 * 1024;
const TUS_VERSION = "1.0.0";

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function requiredArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function encodeMetadata(metadata) {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${Buffer.from(String(value)).toString("base64")}`)
    .join(",");
}

async function readChunk(handle, offset, size) {
  const buffer = Buffer.alloc(size);
  const { bytesRead } = await handle.read(buffer, 0, size, offset);
  return buffer.subarray(0, bytesRead);
}

async function main() {
  const projectRef = requiredArg("project-ref");
  const bucket = requiredArg("bucket");
  const objectName = requiredArg("object");
  const filePath = requiredArg("file");
  const contentType = getArg("content-type", "application/octet-stream");
  const cacheControl = getArg("cache-control", "3600");
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Supabase TUS upload.");
  }

  await fs.access(filePath, fsConstants.R_OK);
  const stat = await fs.stat(filePath);
  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

  const createResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: token,
      "tus-resumable": TUS_VERSION,
      "upload-length": String(stat.size),
      "upload-metadata": encodeMetadata({
        bucketName: bucket,
        objectName,
        contentType,
        cacheControl,
        filename: basename(filePath),
      }),
      "x-upsert": "true",
    },
  });

  if (!createResponse.ok) {
    throw new Error(`TUS create failed: ${createResponse.status} ${await createResponse.text()}`);
  }

  const location = createResponse.headers.get("location");
  if (!location) {
    throw new Error("TUS create did not return a Location header.");
  }

  const uploadUrl = new URL(location, endpoint).href;
  const handle = await fs.open(filePath, "r");
  let offset = 0;

  try {
    while (offset < stat.size) {
      const remaining = stat.size - offset;
      const chunk = await readChunk(handle, offset, Math.min(CHUNK_SIZE, remaining));
      const patchResponse = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          apikey: token,
          "content-type": "application/offset+octet-stream",
          "tus-resumable": TUS_VERSION,
          "upload-offset": String(offset),
          "x-upsert": "true",
        },
        body: chunk,
      });

      if (!patchResponse.ok) {
        throw new Error(`TUS patch failed at offset ${offset}: ${patchResponse.status} ${await patchResponse.text()}`);
      }

      const nextOffset = Number(patchResponse.headers.get("upload-offset"));
      offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + chunk.length;
      const percent = ((offset / stat.size) * 100).toFixed(1);
      process.stdout.write(`Uploaded ${offset}/${stat.size} bytes (${percent}%)\r`);
    }
  } finally {
    await handle.close();
  }

  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
