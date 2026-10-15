// RGB values for the TintMode enum: none, dark, light, black
const TINT_COLORS = [null, [20, 20, 20], [240, 240, 240], [0, 0, 0]];

export function tintStyle(mode, opacityPercent) {
    const rgb = TINT_COLORS[mode];
    if (!rgb || opacityPercent <= 0)
        return 'background-color: transparent; ';

    const alpha = Math.min(1, opacityPercent / 100);
    return `background-color: rgba(${rgb.join(', ')}, ${alpha}); `;
}
