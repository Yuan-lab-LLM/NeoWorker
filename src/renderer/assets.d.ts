declare module "*.webp" {
  const source: string;
  export default source;
}

// Vite imports SVG assets as bundled URLs, including file:// desktop builds.
declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.png" {
  const url: string;
  export default url;
}

declare module "*.ico" {
  const url: string;
  export default url;
}
