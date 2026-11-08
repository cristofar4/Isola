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
    src: "/samples/portrait.jpg",
    fileName: "portrait.jpg",
    alt: "Smiling woman with dark wavy hair in a red top",
  },
  {
    id: "sneaker",
    label: "Sneaker",
    src: "/samples/sneaker.jpg",
    fileName: "sneaker.jpg",
    alt: "White and orange running shoe on a pale grey backdrop",
  },
  {
    id: "bottles",
    label: "Bottles",
    src: "/samples/bottles.jpg",
    fileName: "bottles.jpg",
    alt: "Stacked amber and dark glass bottles on a grey backdrop",
  },
];
