import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

type S3Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

let client: S3Client | undefined;
let clientFingerprint = "";

function required(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Storage configuration missing: ${name}`);
  return value;
}

function config(): S3Config {
  return {
    endpoint: required("S3_ENDPOINT").replace(/\/+$/, ""),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    region: required("S3_REGION"),
  };
}

function s3() {
  const current = config();
  const fingerprint = `${current.endpoint}|${current.bucket}|${current.accessKeyId}|${current.region}`;
  if (!client || fingerprint !== clientFingerprint) {
    client = new S3Client({
      endpoint: current.endpoint,
      region: current.region,
      credentials: {
        accessKeyId: current.accessKeyId,
        secretAccessKey: current.secretAccessKey,
      },
      forcePathStyle: true,
    });
    clientFingerprint = fingerprint;
  }
  return { client, current };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { client: s3Client, current } = s3();
  const key = appendHashSuffix(normalizeKey(relKey));
  await s3Client.send(new PutObjectCommand({
    Bucket: current.bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));

  // The durable storage key is the only persisted address. Read URLs are signed on demand.
  return { key, url: key };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: key };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { client: s3Client, current } = s3();
  const key = normalizeKey(relKey);
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: current.bucket, Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}
