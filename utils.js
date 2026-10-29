// RGB values for the TintMode enum: none, dark, light, black (accent and auto
// are looked up separately)
const TINT_COLORS = [null, [20, 20, 20], [240, 240, 240], [0, 0, 0]];
const TINT_DARK = 1;
const TINT_LIGHT = 2;
const TINT_ACCENT = 4;
const TINT_AUTO = 5;

// libadwaita's accent colors, by org.gnome.desktop.interface accent-color
const ACCENT_COLORS = {
    blue: [53, 132, 228],
    teal: [33, 144, 164],
    green: [58, 148, 74],
    yellow: [200, 136, 0],
    orange: [237, 91, 0],
    red: [230, 45, 66],
    pink: [213, 97, 153],
    purple: [145, 65, 172],
    slate: [111, 131, 150],
};

// How far the accent is mixed toward black or white for the dark or light style
const ACCENT_SHADE = 0.3;

function isDarkStyle(interfaceSettings) {
    return interfaceSettings.get_string('color-scheme') === 'prefer-dark';
}

function accentColor(interfaceSettings) {
    // accent-color is new in GNOME 47; GNOME 46 is always blue
    let rgb = ACCENT_COLORS.blue;
    if (interfaceSettings.settings_schema.has_key('accent-color'))
        rgb = ACCENT_COLORS[interfaceSettings.get_string('accent-color')] ?? rgb;

    const target = isDarkStyle(interfaceSettings) ? 0 : 255;
    return rgb.map(c => Math.round(c + (target - c) * ACCENT_SHADE));
}

function tintColor(mode, interfaceSettings) {
    if (mode === TINT_ACCENT)
        return accentColor(interfaceSettings);
    if (mode === TINT_AUTO)
        return TINT_COLORS[isDarkStyle(interfaceSettings) ? TINT_DARK : TINT_LIGHT];
    return TINT_COLORS[mode];
}

// fadePercent is how much of the tint is gone by the bottom; 0 is no fade
export function tintStyle(mode, opacityPercent, interfaceSettings, fadePercent = 0) {
    const rgb = tintColor(mode, interfaceSettings);
    if (!rgb || opacityPercent <= 0)
        return 'background-color: transparent; ';

    const alpha = Math.min(1, opacityPercent / 100);
    if (fadePercent > 0) {
        const endAlpha = Math.round(alpha * (1 - Math.min(1, fadePercent / 100)) * 1000) / 1000;
        return 'background-gradient-direction: vertical; ' +
            `background-gradient-start: rgba(${rgb.join(', ')}, ${alpha}); ` +
            `background-gradient-end: rgba(${rgb.join(', ')}, ${endAlpha}); `;
    }

    return `background-color: rgba(${rgb.join(', ')}, ${alpha}); `;
}
