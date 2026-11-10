import { Bebas_Neue, Cormorant_Garamond } from "next/font/google";

/**
 * Extra typefaces for titles in Scene Studio and Motion Studio (both under
 * the SIL Open Font Licence, self-hosted by next/font). Inter and Inter Tight
 * come from the root layout.
 */
export const creativeSerif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-creative-serif" });
export const creativeCondensed = Bebas_Neue({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-creative-condensed" });
