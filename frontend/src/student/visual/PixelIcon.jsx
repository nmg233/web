const monochrome = new Set(['continue', 'back', 'close', 'menu', 'chevron-down', 'check']);
const known = new Set(['map', 'lab', 'archive', 'continue', 'back', 'notification', 'coin', 'help', 'user', 'close', 'menu', 'chevron-down', 'check', 'clock', 'pin', 'book', 'cat']);

export default function PixelIcon({ name, size = 24, className = '', style, ...props }) {
  const source = `/assets/pixel-v1/icons/${known.has(name) ? name : 'help'}.svg`;
  return <span className={`pixel-icon ${className}`} style={{ width: size, height: size, ...style }} aria-hidden="true" {...props}>
    {monochrome.has(name)
      ? <span className="pixel-icon-mask" style={{ maskImage: `url("${source}")`, WebkitMaskImage: `url("${source}")` }} />
      : <img src={source} alt="" width={size} height={size} draggable="false" />}
  </span>;
}
