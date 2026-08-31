import { useEffect, useState } from 'react';
import seasons, { isSeasonKey, readStoredSeason } from '../constants/seasons';

const SEASON_ORDER = Object.keys(seasons);
const SEASON_DETAILS = {
  spring: { ornament: '✿', name: '春天' },
  summer: { ornament: '☀', name: '夏天' },
  // 使用单色字形，继续继承主题强调色与原有入场动效。
  autumn: { ornament: '🍁︎', name: '秋天' },
  winter: { ornament: '❄', name: '冬天' },
};

export default function SeasonSwitcher({ compact = false }) {
  const [season, setSeason] = useState(readStoredSeason);
  const activeIndex = SEASON_ORDER.indexOf(season);

  useEffect(() => {
    const syncSeason = (event) => {
      const nextSeason = event.detail?.season;
      if (isSeasonKey(nextSeason)) setSeason(nextSeason);
    };

    window.addEventListener('beihang-season-change', syncSeason);
    return () => window.removeEventListener('beihang-season-change', syncSeason);
  }, []);

  const changeSeason = (nextSeason) => {
    if (!isSeasonKey(nextSeason) || nextSeason === season) return;

    setSeason(nextSeason);
    window.dispatchEvent(new CustomEvent('beihang-season-change', { detail: { season: nextSeason } }));
  };

  return (
    <div
      className={compact ? 'season-rail season-rail--compact' : 'season-rail'}
      aria-label="四季主题"
      data-season={season}
      role="radiogroup"
      style={{ '--season-position': activeIndex }}
    >
      <div className="season-rail__track" aria-hidden="true">
        <span className="season-rail__thumb" />
      </div>
      <div className="season-rail__stops">
        {SEASON_ORDER.map((key) => {
          const item = seasons[key];
          const detail = SEASON_DETAILS[key];
          const isActive = key === season;

          return (
            <button
              type="button"
              key={key}
              className={isActive ? 'season-rail__stop is-active' : 'season-rail__stop'}
              role="radio"
              aria-checked={isActive}
              aria-label={`切换至${detail.name}主题`}
              onClick={() => changeSeason(key)}
            >
              <span
                className="season-rail__image"
                style={{ backgroundImage: `url(${item.thumbnail})` }}
                aria-hidden="true"
              />
              <span className="season-rail__label">{item.label}</span>
              <span className="season-rail__ornament" aria-hidden="true">{detail.ornament}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
