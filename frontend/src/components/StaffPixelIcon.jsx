// Original 24 × 24 campus pictograms. Labels stay on the containing control.
const ink = '#132a49';
const paper = '#fbf6e8';
const teal = '#087f80';
const light = '#baf6ff';
const gold = '#ffd276';

const shapes = {
  refresh: <><path fill={ink} d="M5 3h12v2h3v3h3v7h-7V8h3V7h-2V6H7v2H5v8h2v2h10v-2h3v3h-3v2H5v-2H2V7h3z"/><path fill={teal} d="M7 5h9v2H7zM4 9h2v7H4zm3 10h10v1H7zm11-9h3v3h-3z"/></>,
  brand: <>
    <path fill={ink} d="M2 12h7v1h6v-1h7v9h-8v1h-4v-1H2zM9 2h6v3h3v2h3v3h-7v3h-4v-3H3V7h3V5h3z" />
    <path fill={paper} d="M3 13h6v1h2v6H9v-1H3zm10 1h2v-1h6v6h-6v1h-2z" />
    <path fill={teal} d="M4 15h4v1H4zm0 3h5v1H4zm12-3h4v1h-4zm-1 3h5v1h-5z" />
    <path fill={light} d="M10 3h4v3h3v2h3v1h-7v3h-2V9H4V8h3V6h3z" />
    <path fill={gold} d="M11 3h2v6h-2z" />
  </>,
  dashboard: <>
    <path fill={ink} d="M11 1h2v3h5v2h3v3h1v13H2V9h1V6h3V4h5z" />
    <path fill={gold} d="M13 1h5v2h-5zM5 7h14v2H5z" />
    <path fill={paper} d="M4 10h16v10H4zM7 5h10v1H7z" />
    <path fill={teal} d="M6 12h3v3H6zm9 0h3v3h-3zm-4 3h3v5h-3z" />
    <path fill={light} d="M11 10h3v3h-3z" />
    <path fill={gold} d="M3 21h18v1H3z" />
  </>,
  book: <>
    <path fill={ink} d="M1 4h8v1h6V4h8v16h-8v1H9v-1H1z" />
    <path fill={paper} d="M3 6h5v1h3v12H9v-1H3zm10 1h3V6h5v12h-6v1h-2z" />
    <path fill={teal} d="M4 8h4v7H4zm12 0h4v7h-4z" />
    <path fill={gold} d="M11 5h2v15h-2z" />
    <path fill={light} d="M4 16h5v1H4zm11 0h5v1h-5z" />
  </>,
  learning: <>
    <path fill={ink} d="M10 2h3v2h4v5h-3v2h-1v3h5v-1h5v9h-8v1H9v-1H1v-9h5v1h5v-3H8V9H5V4h5z" />
    <path fill={teal} d="M6 5h4v1h1v3H9V8H6zm7 0h3v3h-2v2h-1z" />
    <path fill={gold} d="M11 3h1v10h-1z" />
    <path fill={paper} d="M3 15h3v1h5v5H9v-1H3zm10 1h5v-1h3v5h-6v1h-2z" />
    <path fill={light} d="M4 17h5v1H4zm11 0h5v1h-5z" />
  </>,
  team: <>
    <path fill={ink} d="M9 2h6v1h1v6h-1v1h-2v2h4v2h4v2h2v6H1v-6h2v-2h4v-2h4v-2H9V9H8V3h1zM2 6h4v1h1v5H6v1H2v-1H1V7h1zm16 0h4v1h1v5h-1v1h-4v-1h-1V7h1z" />
    <path fill={paper} d="M10 4h4v5h-4zM3 8h3v4H3zm15 0h3v4h-3z" />
    <path fill={teal} d="M9 14h6v1h2v6H7v-6h2z" />
    <path fill={light} d="M3 16h3v5H2v-4h1zm15 0h3v1h1v4h-4z" />
    <path fill={gold} d="M11 14h2v4h-2z" />
  </>,
  settings: <>
    <path fill={ink} d="M9 1h6v3h3v2h3v3h2v6h-2v3h-3v3h-3v2H9v-2H6v-3H3v-3H1V9h2V6h3V3h3z" />
    <path fill={paper} d="M10 3h4v3h3v2h3v3h1v3h-3v3h-2v3h-3v1h-3v-3H7v-2H4v-3H3v-3h3V7h2V4h2z" />
    <path fill={teal} d="M9 7h6v2h2v6h-2v2H9v-2H7V9h2z" />
    <path fill={gold} d="M10 10h4v4h-4z" />
  </>,
  guide: <>
    <path fill={ink} d="M1 5h7V3h7v2h8v16h-8v2H8v-2H1z" />
    <path fill={paper} d="M3 7h4v12H3zm6-2h5v16H9zm7 2h5v12h-5z" />
    <path fill={teal} d="M4 9h3v2H4zm5 2h3v2H9zm3 2h2v2h-2zm4 1h4v2h-4z" />
    <path fill={gold} d="M17 8h3v3h-3zM5 15h2v3H5z" />
  </>,
  message: <>
    <path fill={ink} d="M3 2h18v2h2v13h-2v2h-8v1h-2v2H7v-3H3v-2H1V4h2z" />
    <path fill={paper} d="M3 4h18v13H11v2H9v-2H3z" />
    <path fill={teal} d="M5 7h14v2H5zm0 4h10v2H5z" />
    <path fill={gold} d="M17 11h2v2h-2z" />
  </>,
  bell: <>
    <path fill={ink} d="M10 1h4v2h3v2h2v9h2v2h1v3h-7v3H9v-3H2v-3h1v-2h2V5h2V3h3z" />
    <path fill={gold} d="M8 5h8v2h1v8h2v2H5v-2h2V7h1zM10 19h4v1h-4z" />
    <path fill={paper} d="M9 7h2v6H9z" />
  </>,
  user: <>
    <path fill={ink} d="M8 2h8v2h2v9h-2v2h4v2h2v6H2v-6h2v-2h4v-2H6V4h2z" />
    <path fill={paper} d="M8 7h8v6h-2v2h-4v-2H8z" />
    <path fill={teal} d="M6 17h4v2h4v-2h4v2h2v2H4v-2h2z" />
    <path fill={light} d="M10 16h4v2h-4z" />
    <path fill={gold} d="M9 3h6v2H9z" />
  </>,
  back: <>
    <path fill={ink} d="M10 3h4v5h9v8h-9v5h-4v-2H8v-2H6v-2H4v-2H2v-2h2V9h2V7h2V5h2z" />
    <path fill={gold} d="M11 6h1v4h9v4h-9v4h-1v-2H9v-2H7v-1H5v-2h2v-1h2V8h2z" />
  </>,
  key: <>
    <path fill={ink} d="M3 1h9v2h2v8h-2v2h-1v3H9v3H7v3H1v-6h2v-3h2v-1H3v-2H1V3h2z" />
    <path fill={gold} d="M4 3h7v2h1v5h-2v2H7v3H5v3H3v2h2v-3h2v-3h2v-4H4V8H3V5h1z" />
    <path fill={paper} d="M7 4h3v3H7z" />
  </>,
  logout: <>
    <path fill={ink} d="M2 1h12v5h3V4h3v2h2v2h2v8h-2v2h-2v2h-3v-2h-3v5H2z" />
    <path fill={paper} d="M4 3h8v4H8v10h4v4H4z" />
    <path fill={teal} d="M10 9h8V7h1v2h2v2h1v2h-1v2h-2v2h-1v-2h-8z" />
    <path fill={gold} d="M5 11h2v2H5z" />
  </>,
  school: <>
    <path fill={ink} d="M11 1h2v3h3v2h3v3h3v14H2V9h3V6h3V4h3z" />
    <path fill={gold} d="M11 3h2v3h3v2H8V6h3z" />
    <path fill={paper} d="M4 11h16v10H4zM7 9h10v2H7z" />
    <path fill={teal} d="M6 12h3v3H6zm9 0h3v3h-3zm-4 4h3v5h-3z" />
    <path fill={light} d="M11 9h3v4h-3z" />
  </>,
  report: <>
    <path fill={ink} d="M3 1h13v2h2v2h2v18H3z" />
    <path fill={paper} d="M5 3h10v5h3v13H5z" />
    <path fill={light} d="M16 4h1v2h-1z" />
    <path fill={teal} d="M7 10h8v2H7zm0 6h2v3H7zm4-3h2v6h-2z" />
    <path fill={gold} d="M15 14h2v5h-2z" />
  </>,
  gift: <>
    <path fill={ink} d="M3 1h6v2h6V1h6v7h2v6h-2v9H3v-9H1V8h2z" />
    <path fill={gold} d="M5 3h3v2h2v2H5zm11 0h3v4h-5V5h2zM3 10h18v2H3z" />
    <path fill={teal} d="M5 14h14v7H5z" />
    <path fill={paper} d="M10 9h4v13h-4z" />
  </>,
  upload: <>
    <path fill={ink} d="M10 1h4v2h2v2h2v2h2v5h-5v5H9v-5H4V7h2V5h2V3h2zM1 15h5v4h12v-4h5v8H1z" />
    <path fill={teal} d="M11 4h2v2h2v2h2v2h-4v6h-2v-6H7V8h2V6h2z" />
    <path fill={gold} d="M3 17h1v4h16v-4h1v5H3z" />
  </>,
};

export default function StaffPixelIcon({ name = 'brand', className = '', size, ...props }) {
  return (
    <svg
      {...props}
      className={`anticon staff-pixel-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width={size || '1em'}
      height={size || '1em'}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name] || shapes.brand}
    </svg>
  );
}
