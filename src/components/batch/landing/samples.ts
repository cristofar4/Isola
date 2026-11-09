/**
 * Sample assets for the Batch Studio intro page. The cutouts are real outputs
 * of ISOLA's Standard model (see public/samples/CREDITS.md).
 */
export const SAMPLE_ITEMS = [
  { id: "sneaker", name: "White sneaker", file: "sneaker.jpg", original: "/showcase/batch/sneaker.webp", cutout: "/showcase/batch/sneaker-cutout.webp" },
  { id: "serum", name: "Serum bottle", file: "serum.jpg", original: "/showcase/batch/serum.webp", cutout: "/showcase/batch/serum-cutout.webp" },
  { id: "handbag", name: "Woven handbag", file: "handbag.jpg", original: "/showcase/batch/handbag.webp", cutout: "/showcase/batch/handbag-cutout.webp" },
] as const;
