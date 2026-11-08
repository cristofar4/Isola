# Sample and showcase image credits

All photographs are from Unsplash and used under the Unsplash License
(https://unsplash.com/license), which permits commercial use without
attribution. Source files (CDN identifiers):

| File | Unsplash source |
| --- | --- |
| samples/portrait.jpg | https://images.unsplash.com/photo-1494790108377-be9c29b29330 |
| samples/sneaker.jpg | https://images.unsplash.com/photo-1600185365483-26d7a4cc7519 |
| samples/bottles.jpg | https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd |
| samples/curls.jpg | https://images.unsplash.com/photo-1589156280159-27698a70f29e |
| samples/sky.jpg | https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6 |

The `showcase/*-cutout.webp` files are real outputs of ISOLA's on-device
models, rendered offline from the samples above with the same pre- and
post-processing the app uses:

- portrait, sneaker, bottles: Standard model (IS-Net general-use, Apache-2.0)
- curls: High detail model (BiRefNet Swin-T, MIT)

They illustrate the landing page only. Choosing a sample on the site runs the
model live in your browser; it never shows these pre-rendered files as a result.
