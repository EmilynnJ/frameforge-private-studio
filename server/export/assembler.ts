import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { storageGetSignedUrl, storagePut } from "../storage";

type ClipInput = { storageKey: string; durationSeconds: number };

async function downloadFile(url: string, path: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Could not download a timeline clip (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path));
}

function runFfmpeg(args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Video assembly exceeded the render time limit."));
    }, timeoutMs);
    child.stderr.on("data", chunk => { stderr = `${stderr}${String(chunk)}`.slice(-12_000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg assembly failed (${code}). ${stderr.slice(-2000)}`));
    });
  });
}

export async function assembleVerticalVideo(input: {
  ownerId: number;
  projectId: number;
  clips: ClipInput[];
}) {
  if (!input.clips.length) throw new Error("The timeline has no completed clips.");
  const totalDurationSeconds = input.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0);
  if (totalDurationSeconds < 61) throw new Error("The final timeline must be at least 61 seconds.");

  const directory = await mkdtemp(join(tmpdir(), "frameforge-"));
  try {
    const paths = input.clips.map((_, index) => join(directory, `clip-${String(index).padStart(2, "0")}.mp4`));
    for (let index = 0; index < input.clips.length; index += 1) {
      const signedUrl = await storageGetSignedUrl(input.clips[index]!.storageKey);
      await downloadFile(signedUrl, paths[index]!);
    }

    const outputPath = join(directory, "master.mp4");
    const filters = input.clips.map((clip, index) =>
      `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${clip.durationSeconds},trim=duration=${clip.durationSeconds},setpts=PTS-STARTPTS[v${index}]`,
    );
    filters.push(`${input.clips.map((_, index) => `[v${index}]`).join("")}concat=n=${input.clips.length}:v=1:a=0[outv]`);
    const filterPath = join(directory, "filters.txt");
    await writeFile(filterPath, filters.join(";"), "utf8");

    const args = paths.flatMap(path => ["-i", path]);
    args.push(
      "-filter_complex_script", filterPath,
      "-map", "[outv]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "24",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      "-y",
      outputPath,
    );
    await runFfmpeg(args, 165_000);
    const bytes = await readFile(outputPath);
    if (bytes.length > 150_000_000) throw new Error("The assembled MP4 exceeds the 150 MB export limit.");
    const stored = await storagePut(
      `users/${input.ownerId}/projects/${input.projectId}/exports/frameforge-${Date.now()}.mp4`,
      bytes,
      "video/mp4",
    );
    return { ...stored, sizeBytes: bytes.length, durationSeconds: totalDurationSeconds };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
