import variants from './pixelVariants.json';

// These files are derived from the original PNGs by scripts/build-pixel-web-assets.py.
// The browser chooses a width candidate using sizes and the device pixel ratio.
export function pixelImageProps(id, sizes) {
  const asset = variants[id];
  if (!asset) throw new Error(`Unknown pixel asset: ${id}`);
  return {
    src: `/assets/pixel-v1/${asset.variants[0].file}`,
    srcSet: asset.variants.map((variant) => `/assets/pixel-v1/${variant.file} ${variant.width}w`).join(', '),
    sizes,
    width: asset.width,
    height: asset.height,
    decoding: 'async',
  };
}
