// RGB values for the TintMode enum: none, dark, light, black (accent is
// looked up separately)
const TINT_COLORS = [null, [20, 20, 20], [240, 240, 240], [0, 0, 0]];
const TINT_ACCENT = 4;

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

function accentColor(interfaceSettings) {
    // accent-color is new in GNOME 47; GNOME 46 is always blue
    let rgb = ACCENT_COLORS.blue;
    if (interfaceSettings.settings_schema.has_key('accent-color'))
        rgb = ACCENT_COLORS[interfaceSettings.get_string('accent-color')] ?? rgb;

    const target = interfaceSettings.get_string('color-scheme') === 'prefer-dark' ? 0 : 255;
    return rgb.map(c => Math.round(c + (target - c) * ACCENT_SHADE));
}

export function tintStyle(mode, opacityPercent, interfaceSettings, fade = false) {
    const rgb = mode === TINT_ACCENT ? accentColor(interfaceSettings) : TINT_COLORS[mode];
    if (!rgb || opacityPercent <= 0)
        return 'background-color: transparent; ';

    const alpha = Math.min(1, opacityPercent / 100);
    if (fade) {
        return 'background-gradient-direction: vertical; ' +
            `background-gradient-start: rgba(${rgb.join(', ')}, ${alpha}); ` +
            `background-gradient-end: rgba(${rgb.join(', ')}, 0); `;
    }

    return `background-color: rgba(${rgb.join(', ')}, ${alpha}); `;
}
