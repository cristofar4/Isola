# Model files

The `.onnx` weights aren't committed. They're served only to signed-in users
through `/api/models/:file`, so they live here rather than in `public/`.

You don't have to do anything: if a model is missing, the server downloads it
once from the mirror on first use, checks its SHA-256 checksum and caches it
here (or in the system temp folder if this directory isn't writable).

To download ahead of time (recommended for production):

```bash
npm run models:fetch            # Standard (IS-Net, ~179 MB)
npm run models:fetch -- --all   # Standard + High detail (BiRefNet, ~224 MB)
```

Set `ISOLA_MODEL_DIR` to keep them elsewhere, or `ISOLA_MODEL_AUTO_DOWNLOAD=false`
to turn off the automatic download.
