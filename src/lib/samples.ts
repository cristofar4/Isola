export interface Sample {
  id: string;
  label: string;
  src: string;
  fileName: string;
  alt: string;
}

/** Sample photos visitors can try. Selecting one runs the real engine on it. */
export const SAMPLES: Sample[] = [
  {
    id: "portrait",
    label: "Portrait",
    src: "/samples/portrait-curly.jpg",
    fileName: "portrait.jpg",
    alt: "Smiling woman with short curly hair in a striped blazer",
  },
  {
    id: "sneaker",
    label: "Sneaker",
    src: "/samples/sneaker-white.jpg",
    fileName: "sneaker.jpg",
    alt: "White sneaker floating above a blue sports court",
  },
  {
    id: "bottle",
    label: "Serum bottle",
    src: "/samples/serum-bottle.jpg",
    fileName: "serum-bottle.jpg",
    alt: "Amber glass dropper bottle on a wooden stand",
  },
];
