import fs from "node:fs";
import { performance } from "node:perf_hooks";
import decompressStream from "../dist/index.js";

const replayPath = process.argv[2];
const runs = Number(process.argv[3] ?? 5);
const chunkSize = Number(process.argv[4] ?? 4 * 1000 * 1000);

if (!replayPath) {
  console.error("Usage: node scripts/bench.mjs /path/to/file.dem.bz2 [runs] [chunkSize]");
  process.exit(1);
}

const input = fs.readFileSync(replayPath);
const samples = [];

for (let run = 0; run < runs; run++) {
  let chunks = 0;
  let decompressedBytes = 0;
  let doneSeen = false;
  const startedAt = performance.now();
  const actions = decompressStream({
    onDecompressed: (_id, data, done) => {
      chunks++;
      decompressedBytes += data.byteLength;
      doneSeen ||= done;
    },
    onError: (_id, error) => {
      throw new Error(error);
    },
  });

  for (let offset = 0; offset < input.byteLength; offset += chunkSize) {
    await actions.addData(input.subarray(offset, Math.min(offset + chunkSize, input.byteLength)));
  }

  await actions.dataFinished();
  const durationMs = performance.now() - startedAt;

  if (!doneSeen) {
    throw new Error("Decompression did not report done");
  }

  samples.push({
    chunks,
    decompressedBytes,
    durationMs,
    throughputCompressedMiBs: input.byteLength / 1024 / 1024 / (durationMs / 1000),
    throughputDecompressedMiBs: decompressedBytes / 1024 / 1024 / (durationMs / 1000),
  });
}

const sorted = [...samples].sort((a, b) => a.durationMs - b.durationMs);
const median = sorted[Math.floor(sorted.length / 2)];
const best = sorted[0];
const worst = sorted.at(-1);

console.log(
  JSON.stringify(
    {
      bytes: input.byteLength,
      best,
      chunkSize,
      median,
      runs,
      samples,
      worst,
    },
    null,
    2,
  ),
);
