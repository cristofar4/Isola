# Model files

The `.onnx` weights are not committed. Install them with:

```bash
npm run models:fetch            # Standard (IS-Net, ~179 MB)
npm run models:fetch -- --all   # Standard + High detail (BiRefNet, ~224 MB)
```

Or host them elsewhere and set `NEXT_PUBLIC_ISOLA_MODEL_BASE_URL`.
