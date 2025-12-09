import React from 'react';

interface ShiftPaletteIconProps {
    size?: number;
    className?: string;
}

export const ShiftPaletteIcon: React.FC<ShiftPaletteIconProps> = ({ size = 24, className = '' }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
                    <feOffset dx="0" dy="4" result="offsetblur" />
                    <feComponentTransfer>
                        <feFuncA type="linear" slope="0.2" />
                    </feComponentTransfer>
                    <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Palette Body */}
            <path d="M100 10 C50.29 10 10 50.29 10 100 C10 149.71 50.29 190 100 190 C120.8 190 140 183 155 170 C165 161 165 145 155 138 C148 133 148 123 154 118 C160 113 175 113 180 113 C185.52 113 190 108.52 190 103 V100 C190 50.29 149.71 10 100 10 Z"
                fill="#FDFDFD" stroke="#E5E7EB" strokeWidth="2" filter="url(#shadow)" />

            {/* Thumb Hole */}
            <circle cx="50" cy="100" r="12" fill="#F7F8FA" stroke="#E5E7EB" strokeWidth="1" />

            {/* Paint Blobs (Shift Colors) */}
            {/* A: Sunrise Yellow */}
            <circle cx="100" cy="45" r="14" fill="#F59E0B" />
            {/* B: Sky Blue */}
            <circle cx="145" cy="60" r="14" fill="#3B82F6" />
            {/* D: Sunset Orange */}
            <circle cx="165" cy="100" r="14" fill="#F97316" />
            {/* E: Magenta */}
            <circle cx="145" cy="140" r="14" fill="#EC4899" />
            {/* J: Crimson Red */}
            <circle cx="100" cy="155" r="14" fill="#EF4444" />
            {/* 振: Emerald Green */}
            <circle cx="60" cy="145" r="14" fill="#10B981" />

            {/* Shine on blobs */}
            <circle cx="96" cy="41" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="141" cy="56" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="161" cy="96" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="141" cy="136" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="96" cy="151" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="56" cy="141" r="4" fill="white" fillOpacity="0.4" />
        </svg>
    );
};
