// One-off logo processing script.
// - Trims whitespace + resizes the wordmark for the navbar at public/logo.png
// - Extracts the leftmost square (the "M") for a multi-size favicon at src/app/favicon.ico
//
// Run with:  node scripts/update-logo.js [source-image-path]

const sharp = require("sharp");
const pngToIco = require("png-to-ico").default;
const fs = require("node:fs/promises");
const path = require("node:path");

const SOURCE = process.argv[2] || "/Users/qasimjaveed/Downloads/FA120C7A-800A-49F9-9C60-8D6BD2E43B95.PNG";
const REPO = process.cwd();
const NAVBAR_OUT = path.join(REPO, "public", "logo.png");
const FAVICON_OUT = path.join(REPO, "src", "app", "favicon.ico");

async function main() {
  console.log(`Source: ${SOURCE}`);
  const sourceBuffer = await fs.readFile(SOURCE);
  const sourceMeta = await sharp(sourceBuffer).metadata();
  console.log(`Source dimensions: ${sourceMeta.width}x${sourceMeta.height} (${(sourceBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // 1. Navbar logo: trim transparent padding, resize down to web-appropriate width
  console.log("\n[1/2] Navbar logo...");
  const navbarLogo = await sharp(sourceBuffer)
    .trim()
    .resize({ width: 1600, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const navbarMeta = await sharp(navbarLogo).metadata();
  await fs.writeFile(NAVBAR_OUT, navbarLogo);
  console.log(`  Trimmed + resized: ${navbarMeta.width}x${navbarMeta.height}`);
  console.log(`  → ${NAVBAR_OUT} (${(navbarLogo.length / 1024).toFixed(0)} KB)`);

  // 2. Favicon: trim, then extract a square from the left edge (the "M"),
  //    render at multiple sizes for a proper multi-resolution .ico
  console.log("\n[2/2] Favicon (extracting \"M\")...");
  const trimmedBuffer = await sharp(sourceBuffer).trim().toBuffer();
  const trimmedMeta = await sharp(trimmedBuffer).metadata();
  console.log(`  Trimmed dimensions: ${trimmedMeta.width}x${trimmedMeta.height}`);

  // Tight crop on just the M region. M is roughly 1/7 of the wordmark width
  // for a serif "MODAIRE". Use ~15% of the trimmed width to land on the M only,
  // with no bleed into the next letter. Then pad horizontally to square so the
  // favicon stays balanced (M centered, transparent space on either side).
  const mWidth = Math.round(trimmedMeta.width * 0.17);
  const squareSize = Math.max(mWidth, trimmedMeta.height);
  console.log(`  Extracting M region: ${mWidth}x${trimmedMeta.height}, padded to ${squareSize}x${squareSize}`);

  const mRegion = await sharp(trimmedBuffer)
    .extract({ left: 0, top: 0, width: mWidth, height: trimmedMeta.height })
    .toBuffer();

  const mSquare = await sharp({
    create: {
      width: squareSize,
      height: squareSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: mRegion, gravity: "center" }])
    .png()
    .toBuffer();

  const iconSizes = [16, 32, 48, 64];
  const iconBuffers = await Promise.all(
    iconSizes.map((size) =>
      sharp(mSquare)
        .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const icoBuffer = await pngToIco(iconBuffers);
  await fs.writeFile(FAVICON_OUT, icoBuffer);
  console.log(`  Embedded sizes: ${iconSizes.join(", ")}`);
  console.log(`  → ${FAVICON_OUT} (${(icoBuffer.length / 1024).toFixed(0)} KB)`);

  console.log("\nDone. Hot-reload should pick both up automatically.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
