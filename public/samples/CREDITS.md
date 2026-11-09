# Sample and showcase image credits

All photographs are from Unsplash and used under the Unsplash License
(https://unsplash.com/license), which permits commercial use without
attribution. Source files (Unsplash CDN identifiers):

| File | Unsplash source |
| --- | --- |
| samples/portrait-curly.jpg | https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e |
| samples/sneaker-white.jpg (cropped) | https://images.unsplash.com/photo-1579338559194-a162d19bf842 |
| samples/serum-bottle.jpg | https://images.unsplash.com/photo-1608571423902-eed4a5ad8108 |
| samples/sky.jpg | https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6 |
| e2e/fixtures/product.jpg (test fixture) | https://images.unsplash.com/photo-1600185365483-26d7a4cc7519 |

The `showcase/*-cutout.webp` files are real outputs of ISOLA's on-device
models, rendered offline from the samples above with the same pre- and
post-processing the app uses:

- portrait-curly, sneaker-white: Standard model (IS-Net general-use, Apache-2.0)
- portrait-curly-detail: High detail model (BiRefNet Swin-T, MIT)

They illustrate the landing page only. Choosing a sample on the site runs the
model live in your browser; it never shows these pre-rendered files as a result.

`showcase/sneaker-white-mask.webp` is the alpha channel of
`sneaker-white-cutout.webp` saved as a greyscale image, used on the developer
docs to show the mask step.

Batch Studio intro page (`showcase/batch/`), from Unsplash under the Unsplash License:

| File | Unsplash source |
| --- | --- |
| showcase/batch/sneaker.webp (cropped) | https://images.unsplash.com/photo-1608231387042-66d1773070a5 |
| showcase/batch/serum.webp (cropped) | https://images.unsplash.com/photo-1608571423902-eed4a5ad8108 |
| showcase/batch/handbag.webp (cropped) | https://images.unsplash.com/photo-1598532163257-ae3c6b2524b6 |

The matching `*-cutout.webp` files are real outputs of ISOLA's Standard model
(produced through this app's own `/api/v1/remove-background`), trimmed to the
subject. They're used as sample assets on that page.
