// Downloads the on-device segmentation models into ./models (ISOLA_MODEL_DIR)
// and verifies their SHA-256 checksums. They're kept out of public/ because
// the app serves them only to signed-in users (app/api/models). Optional: the
// server downloads a missing model on first use. Usage:
//   npm run models:fetch                 # default model (isnet-general-use)
//   npm run models:fetch -- --all        # every model
//   npm run models:fetch -- birefnet-lite
//
// Weights are mirrored by the rembg project on GitHub Releases. Licences:
//   isnet-general-use — Apache-2.0 (https://github.com/xuebinqin/DIS)
//   birefnet-lite     — MIT        (https://github.com/ZhengPeng7/BiRefNet)
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MIRROR = process.env.ISOLA_MODEL_MIRROR || "https://github.com/danielgatis/rembg/releases/download/v0.0.0/";
const MODELS = {
  "isnet-general-use": {
    file: "isnet-general-use.onnx",
    bytes: 178648008,
    sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
  },
  "birefnet-lite": {
    file: "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
    bytes: 224005088,
    sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.ISOLA_MODEL_DIR || join(root, "models");
mkdirSync(target, { recursive: true });

// Older versions stored models in public/models, where anyone could download
// them. Move any found there into the private directory.
const legacy = join(root, "public", "models");
if (existsSync(legacy)) {
  for (const name of readdirSync(legacy).filter((f) => f.endsWith(".onnx"))) {
    if (!existsSync(join(target, name))) renameSync(join(legacy, name), join(target, name));
    else unlinkSync(join(legacy, name));
    console.log(`→ moved ${name} out of public/models`);
  }
}

const args = process.argv.slice(2);
const wanted = args.includes("--all") ? Object.keys(MODELS) : args.filter((a) => !a.startsWith("-"));
const ids = wanted.length ? wanted : ["isnet-general-use"];

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

for (const id of ids) {
  const model = MODELS[id];
  if (!model) {
    console.error(`Unknown model "${id}". Choose from: ${Object.keys(MODELS).join(", ")}`);
    process.exit(1);
  }
  const dest = join(target, model.file);
  if (existsSync(dest) && statSync(dest).size === model.bytes && (await sha256(dest)) === model.sha256) {
    console.log(`✓ ${id} already present`);
    continue;
  }
  const url = MIRROR + model.file;
  console.log(`↓ ${id} (${(model.bytes / 1e6).toFixed(0)} MB) from ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    console.error(`Download failed: HTTP ${response.status}`);
    process.exit(1);
  }
  const partial = `${dest}.partial`;
  let received = 0;
  let last = 0;
  const body = Readable.fromWeb(response.body);
  body.on("data", (chunk) => {
    received += chunk.length;
    const pct = Math.floor((received / model.bytes) * 100);
    if (pct >= last + 10) {
      last = pct;
      process.stdout.write(`  ${pct}%\n`);
    }
  });
  await pipeline(body, createWriteStream(partial));
  const digest = await sha256(partial);
  if (digest !== model.sha256) {
    unlinkSync(partial);
    console.error(`Checksum mismatch for ${id}: ${digest}`);
    process.exit(1);
  }
  renameSync(partial, dest);
  console.log(`✓ ${id} verified`);
}
