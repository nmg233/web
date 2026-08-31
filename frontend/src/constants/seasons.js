const seasons = {
  // 使用用户指定的北航四季原图；背景组件会在绘制时像素化，保持现有页面的像素风格。
  spring: {
    label: '春',
    accent: '#6eaa67',
    src: '/assets/seasons/春.jpg',
    thumbnail: '/assets/seasons/spring-symbol.png',
    palette: {
      canvas: '#e5f2df', paper: 'rgba(247, 253, 245, .94)', panel: 'rgba(248, 255, 247, .76)',
      'panel-strong': 'rgba(250, 255, 249, .92)', ink: '#244f37', muted: '#527563',
      line: 'rgba(255, 255, 255, .88)', primary: '#4d8e5d', shadow: 'rgba(43, 89, 56, .19)',
      'season-overlay': 'rgba(222, 242, 214, .22)',
    },
  },
  summer: {
    label: '夏',
    accent: '#4d9cc5',
    src: '/assets/seasons/夏.jpg',
    thumbnail: '/assets/seasons/summer-symbol.png',
    palette: {
      canvas: '#dcedf7', paper: 'rgba(246, 252, 255, .94)', panel: 'rgba(247, 253, 255, .76)',
      'panel-strong': 'rgba(250, 254, 255, .92)', ink: '#1d4f70', muted: '#4d748a',
      line: 'rgba(255, 255, 255, .88)', primary: '#397fa7', shadow: 'rgba(37, 95, 128, .19)',
      'season-overlay': 'rgba(211, 238, 250, .23)',
    },
  },
  autumn: {
    label: '秋',
    accent: '#c9943d',
    src: '/assets/seasons/秋.jpg',
    thumbnail: '/assets/seasons/autumn-symbol.png',
    palette: {
      canvas: '#f3e8c8', paper: 'rgba(255, 251, 239, .94)', panel: 'rgba(255, 251, 239, .76)',
      'panel-strong': 'rgba(255, 253, 246, .92)', ink: '#70491f', muted: '#8a6840',
      line: 'rgba(255, 255, 255, .88)', primary: '#aa7130', shadow: 'rgba(119, 81, 31, .19)',
      'season-overlay': 'rgba(247, 230, 181, .24)',
    },
  },
  winter: {
    label: '冬',
    accent: '#8a9aab',
    src: '/assets/seasons/冬.jpg',
    thumbnail: '/assets/seasons/winter-symbol.png',
    palette: {
      canvas: '#e8edf1', paper: 'rgba(250, 252, 253, .94)', panel: 'rgba(250, 253, 255, .76)',
      'panel-strong': 'rgba(253, 254, 255, .92)', ink: '#334b60', muted: '#617585',
      line: 'rgba(255, 255, 255, .90)', primary: '#5d8099', shadow: 'rgba(55, 77, 95, .18)',
      'season-overlay': 'rgba(225, 235, 243, .23)',
    },
  },
};

const STORAGE_KEY = 'beihang-season';

export const DEFAULT_SEASON = 'autumn';

// 统一校验季节值，避免旧版本或手工修改的本地缓存让主题组件崩溃。
export function isSeasonKey(value) {
  return Object.prototype.hasOwnProperty.call(seasons, value);
}

export function readStoredSeason() {
  try {
    const storedSeason = localStorage.getItem(STORAGE_KEY);
    return isSeasonKey(storedSeason) ? storedSeason : DEFAULT_SEASON;
  } catch {
    // 浏览器禁用存储时仍使用默认季节，不影响页面其余功能。
    return DEFAULT_SEASON;
  }
}

export function storeSeason(season) {
  if (!isSeasonKey(season)) return;

  try {
    localStorage.setItem(STORAGE_KEY, season);
  } catch {
    // 存储失败只影响下次打开时的季节记忆，本次切换仍然生效。
  }
}

export default seasons;
