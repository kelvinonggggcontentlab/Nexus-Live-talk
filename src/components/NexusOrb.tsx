import React from "react";

interface NexusOrbProps {
  status: "idle" | "connecting" | "active" | "error";
  userAudioLevel: number; // 0 to 1
  nexusAudioLevel: number; // 0 to 1
  isMuted: boolean;
  onClick: () => void;
}

export const NexusOrb: React.FC<NexusOrbProps> = ({
  status,
  userAudioLevel,
  nexusAudioLevel,
  isMuted,
  onClick,
}) => {
  // Combine audio reactivity for smooth compositor-only transform scaling
  const activeEnergy =
    status === "active"
      ? Math.min(1, nexusAudioLevel * 1.35 + (isMuted ? 0 : userAudioLevel * 0.65))
      : status === "connecting"
      ? 0.25
      : 0;

  const orbScale = 1 + activeEnergy * 0.14;
  const innerRibbonScale = 1 + activeEnergy * 0.22;
  const glowOpacity =
    status === "active"
      ? 0.45 + activeEnergy * 0.55
      : status === "connecting"
      ? 0.35
      : 0.2;

  return (
    <div className="relative flex items-center justify-center select-none">
      {/* Ambient Crimson Backlight (Compositor-only opacity + transform) */}
      <div
        className="pointer-events-none absolute w-72 h-72 sm:w-80 sm:h-80 rounded-full transition-transform duration-150 ease-out"
        style={{
          background:
            "radial-gradient(circle, rgba(220, 38, 38, 0.38) 0%, rgba(153, 27, 27, 0.14) 48%, rgba(9, 9, 11, 0) 72%)",
          transform: `scale(${1 + activeEnergy * 0.35})`,
          opacity: glowOpacity,
        }}
      />

      {/* Interactive Orb Button */}
      <button
        type="button"
        onClick={onClick}
        aria-label={
          status === "active"
            ? "End live voice session with NEXUS"
            : "Start live voice session with NEXUS"
        }
        className="group relative w-60 h-60 sm:w-72 sm:h-72 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#09090B] cursor-pointer transition-transform duration-150 ease-out"
        style={{
          transform: `scale(${orbScale})`,
        }}
      >
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full overflow-visible drop-shadow-[0_20px_50px_rgba(220,38,38,0.28)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Deep Obsidian Sphere Core */}
            <radialGradient id="obsidianCore" cx="50%" cy="45%" r="52%">
              <stop offset="0%" stopColor="#1A0507" />
              <stop offset="45%" stopColor="#090304" />
              <stop offset="82%" stopColor="#050507" />
              <stop offset="100%" stopColor="#180406" />
            </radialGradient>

            {/* Crimson Plasma Glow */}
            <radialGradient id="crimsonNebula" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.42" />
              <stop offset="50%" stopColor="#991B1B" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>

            {/* Liquid Crimson Ribbon 1 */}
            <linearGradient id="crimsonRibbon1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FCA5A5" stopOpacity="0.9" />
              <stop offset="28%" stopColor="#EF4444" stopOpacity="0.95" />
              <stop offset="65%" stopColor="#991B1B" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#450A0A" stopOpacity="0.2" />
            </linearGradient>

            {/* Liquid Crimson Ribbon 2 */}
            <linearGradient id="crimsonRibbon2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F87171" stopOpacity="0.85" />
              <stop offset="40%" stopColor="#DC2626" stopOpacity="0.9" />
              <stop offset="80%" stopColor="#7F1D1D" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#1F0406" stopOpacity="0.1" />
            </linearGradient>

            {/* Outer Rim Specular Highlight */}
            <linearGradient id="rimHighlight" x1="15%" y1="5%" x2="85%" y2="95%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="30%" stopColor="#F87171" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#991B1B" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.7" />
            </linearGradient>

            {/* Metallic Silver-Crimson Gradient for the Central N Monogram */}
            <linearGradient id="nexusMonogramMetal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F4F4F5" />
              <stop offset="42%" stopColor="#A1A1AA" />
              <stop offset="72%" stopColor="#3F3F46" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>

            {/* Neon Crimson Edge Filter */}
            <filter id="crimsonGlow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Base Obsidian Glass Sphere */}
          <circle
            cx="200"
            cy="200"
            r="176"
            fill="url(#obsidianCore)"
            stroke="url(#rimHighlight)"
            strokeWidth="2.5"
          />

          {/* Inner Crimson Nebula Pulse */}
          <circle
            cx="200"
            cy="200"
            r="142"
            fill="url(#crimsonNebula)"
            style={{
              transformOrigin: "200px 200px",
              transform: `scale(${innerRibbonScale})`,
              transition: "transform 120ms ease-out",
            }}
          />

          {/* Swirling Sculpted Crimson Glass Waves (Matching orb.png aesthetic) */}
          <g
            style={{
              transformOrigin: "200px 200px",
              transform: `scale(${1 + activeEnergy * 0.08}) rotate(${
                status === "active" ? activeEnergy * 14 : 0
              }deg)`,
              transition: "transform 140ms ease-out",
            }}
          >
            {/* Upper Left to Lower Right Sweeping Fin */}
            <path
              d="M 68 135 C 95 55, 225 45, 295 105 C 345 148, 355 245, 310 302 C 275 340, 220 330, 260 270 C 295 215, 265 130, 185 112 C 125 98, 82 145, 68 135 Z"
              fill="url(#crimsonRibbon1)"
              opacity="0.78"
            />

            {/* Lower Left to Upper Right Counter-Swirl */}
            <path
              d="M 332 265 C 305 345, 175 355, 105 295 C 55 252, 45 155, 90 98 C 125 60, 180 70, 140 130 C 105 185, 135 270, 215 288 C 275 302, 318 255, 332 265 Z"
              fill="url(#crimsonRibbon2)"
              opacity="0.82"
            />

            {/* Razor-Sharp Specular Crimson Arcs */}
            <path
              d="M 76 122 C 122 52, 248 56, 312 132 C 352 182, 336 278, 282 320"
              fill="none"
              stroke="#FCA5A5"
              strokeWidth="1.75"
              strokeLinecap="round"
              opacity={0.65 + activeEnergy * 0.35}
              filter="url(#crimsonGlow)"
            />
            <path
              d="M 324 278 C 278 348, 152 344, 88 268 C 48 218, 64 122, 118 80"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2"
              strokeLinecap="round"
              opacity={0.7 + activeEnergy * 0.3}
              filter="url(#crimsonGlow)"
            />

            {/* Diagonal Internal Glass Fold */}
            <path
              d="M 102 96 C 165 145, 235 255, 298 304"
              fill="none"
              stroke="#FECACA"
              strokeWidth="1.2"
              strokeOpacity="0.55"
            />
          </g>

          {/* Deep Recessed Inner Sanctuary Circle */}
          <circle
            cx="200"
            cy="200"
            r="76"
            fill="#070304"
            fillOpacity="0.88"
            stroke="#EF4444"
            strokeOpacity={0.28 + activeEnergy * 0.45}
            strokeWidth="1.2"
          />

          {/* Iconic Geometric Split 'N' Monogram (Exact match to orb.png) */}
          <g filter="url(#crimsonGlow)">
            {/* Left Vertical Pillar + Upper Diagonal */}
            <path
              d="M 164 246 L 164 152 L 218 206 L 198 206 L 178 186 L 178 234 Z"
              fill="url(#nexusMonogramMetal)"
              stroke="#F87171"
              strokeWidth="1.2"
            />
            {/* Right Vertical Pillar + Lower Diagonal */}
            <path
              d="M 236 154 L 236 248 L 182 194 L 202 194 L 222 214 L 222 166 Z"
              fill="url(#nexusMonogramMetal)"
              stroke="#EF4444"
              strokeWidth="1.2"
            />
          </g>

          {/* Top-Left Curved Specular Glass Reflection */}
          <path
            d="M 95 92 C 138 52, 210 42, 268 64 C 225 56, 150 68, 108 112 C 76 146, 64 195, 68 235 C 56 185, 65 125, 95 92 Z"
            fill="#FFFFFF"
            opacity="0.18"
          />

          {/* Outer Glass Rim Accent */}
          <circle
            cx="200"
            cy="200"
            r="174"
            fill="none"
            stroke="#EF4444"
            strokeOpacity={status === "active" ? 0.55 : 0.22}
            strokeWidth="1"
          />
        </svg>
      </button>
    </div>
  );
};
