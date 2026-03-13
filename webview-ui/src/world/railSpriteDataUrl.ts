import type { AgentSnapshot } from "@shared/domain";

type RailRole = AgentSnapshot["runtimeRole"];

function accentFor(role: RailRole): string {
  switch (role) {
    case "subagent":
      return "#2f6f8f";
    case "team":
      return "#8a6a2d";
    default:
      return "#8f2d4f";
  }
}

function outlineFor(role: RailRole): string {
  switch (role) {
    case "subagent":
      return "#8fd3ff";
    case "team":
      return "#ffd47a";
    default:
      return "#ffd2dd";
  }
}

function dataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function frontSvg(role: RailRole): string {
  const accent = accentFor(role);
  const outline = outlineFor(role);
  return dataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c8c0b6"/>
          <stop offset="0.14" stop-color="#504d5b"/>
          <stop offset="0.48" stop-color="#1d2230"/>
          <stop offset="0.72" stop-color="${accent}"/>
          <stop offset="1" stop-color="#2a2631"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stop-color="#c8f6ff"/>
          <stop offset="0.4" stop-color="#8ac7d8"/>
          <stop offset="1" stop-color="#365265"/>
        </linearGradient>
      </defs>
      <g filter="url(#none)">
        <path d="M31 108c-7 0-12-5-13-12l-4-28c-1-8 1-15 7-22L37 25c5-6 12-9 21-9h4c9 0 16 3 21 9l16 21c6 7 8 14 7 22l-4 28c-1 7-6 12-13 12z" fill="url(#body)" stroke="#11131d" stroke-width="4" stroke-linejoin="round"/>
        <path d="M43 25h34c8 0 14 3 18 9l5 8c2 4 2 7 1 11l-3 11c-1 5-5 8-10 8H32c-5 0-9-3-10-8l-3-11c-1-4-1-7 1-11l5-8c4-6 10-9 18-9z" fill="#1a2230" stroke="#d9d3cb" stroke-width="3"/>
        <path d="M31 42c4-8 9-12 18-12h22c9 0 14 4 18 12l3 7c1 3 0 6-3 8L77 61H43l-12-4c-3-2-4-5-3-8z" fill="url(#glass)"/>
        <path d="M59 31 48 61" stroke="#11131d" stroke-width="3"/>
        <path d="M73 31 74 61" stroke="#11131d" stroke-width="3"/>
        <path d="M43 31 34 58" stroke="#11131d" stroke-width="3"/>
        <path d="M77 31 88 58" stroke="#11131d" stroke-width="3"/>
        <path d="M24 76h18c4 0 6 2 6 6v10H22v-9c0-4 1-7 2-7z" fill="#2b2934" stroke="#11131d" stroke-width="3"/>
        <path d="M78 76h18c1 0 2 3 2 7v9H72V82c0-4 2-6 6-6z" fill="#2b2934" stroke="#11131d" stroke-width="3"/>
        <path d="M20 74c4-6 8-9 14-9" stroke="${outline}" stroke-width="3" stroke-linecap="round"/>
        <path d="M86 65c6 0 10 3 14 9" stroke="${outline}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="28" cy="72" r="3" fill="#fff0d6"/>
        <circle cx="92" cy="72" r="3" fill="#fff0d6"/>
      </g>
    </svg>
  `);
}

function sideSvg(role: RailRole): string {
  const accent = accentFor(role);
  const outline = outlineFor(role);
  return dataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">
      <defs>
        <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ddd6cd"/>
          <stop offset="1" stop-color="#545260"/>
        </linearGradient>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4a4f60"/>
          <stop offset="0.28" stop-color="#1f2533"/>
          <stop offset="0.64" stop-color="${accent}"/>
          <stop offset="1" stop-color="#242734"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stop-color="#d6f8ff"/>
          <stop offset="0.45" stop-color="#88c2d0"/>
          <stop offset="1" stop-color="#31495b"/>
        </linearGradient>
      </defs>
      <path d="M24 98V34c0-9 7-16 16-16h190c18 0 34 6 47 19l18 18c10 10 15 22 15 36v7H24z" fill="url(#body)" stroke="#11131d" stroke-width="4" stroke-linejoin="round"/>
      <path d="M40 18h191c23 0 42 7 58 22l15 15" fill="none" stroke="url(#roof)" stroke-width="12" stroke-linecap="round"/>
      <path d="M32 98h270" stroke="#11131d" stroke-width="5"/>
      <path d="M30 53h245" stroke="#eadfd3" stroke-width="4"/>
      <path d="M33 72h245" stroke="#5b1e34" stroke-width="8"/>
      <rect x="46" y="42" width="24" height="28" rx="7" fill="url(#glass)" stroke="#11131d" stroke-width="3"/>
      <rect x="94" y="40" width="24" height="44" rx="6" fill="#c8c0b6" stroke="#11131d" stroke-width="3"/>
      <rect x="118" y="40" width="24" height="44" rx="6" fill="#c8c0b6" stroke="#11131d" stroke-width="3"/>
      <path d="M159 42h70a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8h-70a8 8 0 0 1-8-8V50a8 8 0 0 1 8-8z" fill="url(#glass)" stroke="#11131d" stroke-width="3"/>
      <rect x="252" y="39" width="24" height="44" rx="6" fill="#c8c0b6" stroke="#11131d" stroke-width="3"/>
      <rect x="276" y="39" width="24" height="44" rx="6" fill="#c8c0b6" stroke="#11131d" stroke-width="3"/>
      <path d="M239 34c17 0 31 3 41 10l17 13c5 4 8 9 9 15h-48c-7 0-13-6-13-13z" fill="#202635" stroke="#11131d" stroke-width="3"/>
      <path d="M284 58c8 0 14 3 20 10" stroke="${outline}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="86" cy="100" r="12" fill="#51474c" stroke="#11131d" stroke-width="4"/>
      <circle cx="221" cy="100" r="12" fill="#51474c" stroke="#11131d" stroke-width="4"/>
      <circle cx="86" cy="100" r="4" fill="#11131d"/>
      <circle cx="221" cy="100" r="4" fill="#11131d"/>
      <path d="M18 98h14v-8H18c-4 0-7 3-7 7v2h7z" fill="#222530"/>
    </svg>
  `);
}

export function defaultRailFrontSprite(role: RailRole): string {
  return frontSvg(role);
}

export function defaultRailSideSprite(role: RailRole): string {
  return sideSvg(role);
}
