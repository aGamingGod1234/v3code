#!/usr/bin/env node
/**
 * Generate V3 brand icons (Windows .ico, macOS .icns via 1024 PNG,
 * Linux .png, and web favicons) from `assets/prod/v3-logo.svg`.
 *
 * Why this exists: the upstream fork shipped with `t3-black-*`
 * assets hard-embedded as binary files. We generate V3-branded
 * replacements programmatically so forkers can re-skin by editing
 * one SVG and re-running this script.
 *
 * Usage: `bun run scripts/generate-v3-icons.mjs`
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";
import pngToIcns from "png2icons";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SVG_PATH = join(ROOT, "assets/prod/v3-logo.svg");
const OUT_DIR = join(ROOT, "assets/prod");

const WIN_ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const WEB_ICO_SIZES = [16, 32, 48];

async function renderPng(svgBuffer, size) {
  return await sharp(svgBuffer, { density: 512 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  if (!existsSync(SVG_PATH)) {
    throw new Error(`Missing source SVG: ${SVG_PATH}`);
  }
  const svgBuffer = await readFile(SVG_PATH);
  await mkdir(OUT_DIR, { recursive: true });

  // --- Windows .ico (app exe + taskbar + installer icon) ---
  console.log("[icons] Rendering Windows .ico sizes:", WIN_ICO_SIZES.join(", "));
  const winPngBuffers = await Promise.all(WIN_ICO_SIZES.map((size) => renderPng(svgBuffer, size)));
  const winIco = await toIco(winPngBuffers);
  await writeFile(join(OUT_DIR, "v3-black-windows.ico"), winIco);

  // --- Web favicon .ico ---
  console.log("[icons] Rendering web favicon .ico sizes:", WEB_ICO_SIZES.join(", "));
  const webPngBuffers = await Promise.all(WEB_ICO_SIZES.map((size) => renderPng(svgBuffer, size)));
  const webIco = await toIco(webPngBuffers);
  await writeFile(join(OUT_DIR, "v3-black-web-favicon.ico"), webIco);

  // --- Web favicon PNGs ---
  console.log("[icons] Rendering web favicon PNGs (16, 32, 180)...");
  await writeFile(join(OUT_DIR, "v3-black-web-favicon-16x16.png"), await renderPng(svgBuffer, 16));
  await writeFile(join(OUT_DIR, "v3-black-web-favicon-32x32.png"), await renderPng(svgBuffer, 32));
  await writeFile(
    join(OUT_DIR, "v3-black-web-apple-touch-180.png"),
    await renderPng(svgBuffer, 180),
  );

  // --- 1024 PNGs (source for .icns on macOS + Linux icon) ---
  console.log("[icons] Rendering 1024 PNGs for macOS/Linux/iOS...");
  const png1024 = await renderPng(svgBuffer, 1024);
  await writeFile(join(OUT_DIR, "v3-black-macos-1024.png"), png1024);
  await writeFile(join(OUT_DIR, "v3-black-universal-1024.png"), png1024);
  await writeFile(join(OUT_DIR, "v3-black-ios-1024.png"), png1024);

  // --- macOS .icns (for reference, not used on Windows builds) ---
  console.log("[icons] Rendering macOS .icns...");
  const icnsBuffer = pngToIcns.createICNS(png1024, pngToIcns.BICUBIC, 0);
  if (icnsBuffer) {
    await writeFile(join(OUT_DIR, "v3-black-macos.icns"), icnsBuffer);
  } else {
    console.warn("[icons] Skipping .icns — png2icons.createICNS returned null");
  }

  console.log("[icons] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
