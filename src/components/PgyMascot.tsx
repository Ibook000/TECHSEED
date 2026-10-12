import React, { useState } from 'react';

interface PgyMascotProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'badge' | 'plain' | 'circle' | 'glow';
  showFlagText?: boolean;
}

const SIZE_MAP = {
  xs: 'w-7 h-7',
  sm: 'w-9 h-9',
  md: 'w-14 h-14 sm:w-16 sm:h-16',
  lg: 'w-24 h-24 sm:w-28 sm:h-28',
  xl: 'w-36 h-36 sm:w-40 sm:h-40',
};

const BADGE_RADIUS_MAP = {
  xs: 'rounded-[8px] p-0.5',
  sm: 'rounded-[10px] p-1',
  md: 'rounded-[14px] p-1.5',
  lg: 'rounded-[18px] p-2',
  xl: 'rounded-[22px] p-3',
};

export const PgyMascot: React.FC<PgyMascotProps> = ({
  className = '',
  size = 'md',
  variant = 'badge',
  showFlagText = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const imageSrc = !imgError ? '/PGY_logo.png' : null;

  const getContainerStyles = () => {
    return `relative inline-flex items-center justify-center ${BADGE_RADIUS_MAP[size]} p-1 shrink-0 ${SIZE_MAP[size]} ${className}`;
  };

  if (imageSrc) {
    const imgElement = (
      <img
        src={imageSrc}
        alt="黎明职业大学信息与电子工程学院 学生会技术部吉祥物"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-contain select-none transition-transform"
      />
    );

    if (variant === 'plain') {
      return (
        <div className={`relative inline-flex items-center justify-center select-none ${SIZE_MAP[size]} ${className}`}>
          {imgElement}
        </div>
      );
    }

    return (
      <div
        className={getContainerStyles()}
        title="黎明职业大学信息与电子工程学院学生会技术部"
      >
        {imgElement}
      </div>
    );
  }

  // High-fidelity SVG recreation of the PGY Mascot
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${SIZE_MAP[size]} ${className}`}
      title="黎明职业大学信息与电子工程学院学生会技术部吉祥物"
    >
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Dandelion fluff spore on head */}
        <line x1="60" y1="50" x2="45" y2="25" stroke="#E2E8F0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="45" cy="25" r="14" fill="#FFFFFF" fillOpacity="0.8" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="2 2" />
        <line x1="45" y1="11" x2="45" y2="39" stroke="#94A3B8" strokeWidth="1" />
        <line x1="31" y1="25" x2="59" y2="25" stroke="#94A3B8" strokeWidth="1" />
        <line x1="35" y1="15" x2="55" y2="35" stroke="#94A3B8" strokeWidth="1" />
        <line x1="35" y1="35" x2="55" y2="15" stroke="#94A3B8" strokeWidth="1" />

        {/* Fluffy Dandelion Head (Cloud body) */}
        <path
          d="M 50 110 
             C 30 110, 20 90, 25 75 
             C 15 60, 25 40, 45 42 
             C 55 25, 80 25, 95 38 
             C 110 25, 135 30, 140 50 
             C 155 55, 160 80, 145 95 
             C 155 115, 135 135, 115 130 
             C 100 142, 70 142, 55 130 
             C 35 130, 30 115, 50 110 Z"
          fill="#F8FAFC"
          stroke="#0F172A"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {/* Yellow Engineer Hard Hat */}
        <path
          d="M 85 30 
             C 95 18, 125 18, 138 32 
             C 145 40, 142 55, 120 58 
             C 95 60, 80 48, 85 30 Z"
          fill="#FACC15"
          stroke="#0F172A"
          strokeWidth="3"
        />
        {/* Hat Badge / IEE Circuit Symbol */}
        <circle cx="114" cy="40" r="8" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1" />
        <text x="114" y="43" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#0284C7" fontFamily="monospace">
          IEE
        </text>

        {/* Safety Goggles Outer Frame */}
        <rect
          x="42"
          y="65"
          width="62"
          height="28"
          rx="8"
          fill="#3B82F6"
          stroke="#0F172A"
          strokeWidth="3"
        />
        {/* Goggles Lens */}
        <rect
          x="46"
          y="69"
          width="54"
          height="20"
          rx="5"
          fill="#E0F2FE"
          fillOpacity="0.9"
        />

        {/* Left Eye: Big sparkle anime eye */}
        <ellipse cx="60" cy="79" rx="5" ry="6.5" fill="#0F172A" />
        <circle cx="58" cy="76" r="2.2" fill="#FFFFFF" />
        <circle cx="62" cy="81" r="1.2" fill="#FFFFFF" />
        {/* Right Eye: Winking joyfully */}
        <path d="M 80 81 Q 87 75 92 81" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* Blush cheeks */}
        <ellipse cx="50" cy="88" rx="4" ry="2" fill="#FDA4AF" />
        <ellipse cx="96" cy="88" rx="4" ry="2" fill="#FDA4AF" />

        {/* Smile mouth */}
        <path d="M 68 96 Q 74 103 80 96 Z" fill="#E11D48" stroke="#0F172A" strokeWidth="1.5" />

        {/* Blue Engineer Jumpsuit & Body */}
        <path
          d="M 52 130 
             L 52 165 
             L 65 178 
             L 75 160 
             L 82 160 
             L 92 178 
             L 105 165 
             L 105 130 Z"
          fill="#0284C7"
          stroke="#0F172A"
          strokeWidth="3"
        />

        {/* Yellow Vest */}
        <path d="M 60 130 L 70 148 L 78 148 L 88 130 Z" fill="#FACC15" />

        {/* Tool Belt & Wrench */}
        <rect x="52" y="146" width="53" height="8" fill="#B45309" stroke="#0F172A" strokeWidth="2" />
        {/* Small Wrench */}
        <path d="M 85 148 L 85 162 M 83 162 L 87 162" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />

        {/* Tablet in Hand (Left) */}
        <rect x="22" y="125" width="22" height="30" rx="3" fill="#F1F5F9" stroke="#0F172A" strokeWidth="2" transform="rotate(-15 22 125)" />
        <text x="24" y="144" fontSize="4" fontWeight="bold" fill="#0284C7" fontFamily="sans-serif" transform="rotate(-15 24 144)">
          信电学院
        </text>

        {/* Flag Pole (Held by Right Hand) */}
        <line x1="95" y1="160" x2="145" y2="28" stroke="#CBD5E1" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="145" cy="28" r="4.5" fill="#E2E8F0" stroke="#0F172A" strokeWidth="1.5" />

        {/* Yellow College Flag */}
        <path
          d="M 143 32 
             C 165 30, 185 45, 198 36 
             L 196 82 
             C 178 92, 160 76, 133 80 Z"
          fill="#FACC15"
          stroke="#0F172A"
          strokeWidth="2.5"
        />
        {/* Flag Text & Logo */}
        <text x="160" y="47" fontSize="5" fontWeight="bold" fill="#1E3A8A" fontFamily="sans-serif">
          黎明职业大学
        </text>
        <text x="162" y="54" fontSize="3" fill="#1E3A8A" fontFamily="monospace">
          LIMING UNIV
        </text>
        <circle cx="168" cy="65" r="5.5" fill="#FFFFFF" fillOpacity="0.8" stroke="#0284C7" strokeWidth="0.8" />
        <text x="168" y="67" textAnchor="middle" fontSize="4" fontWeight="bold" fill="#0284C7" fontFamily="monospace">
          IEE
        </text>
        <text x="165" y="76" fontSize="4.5" fontWeight="bold" fill="#0284C7" fontFamily="sans-serif">
          信息与电子工程
        </text>
      </svg>
    </div>
  );
};
