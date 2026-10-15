import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function spinRow(settings, key, title, subtitle, lower, upper, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        numeric: true,
        adjustment: new Gtk.Adjustment({
            lower, upper,
            step_increment: step,
            page_increment: step * 5,
        }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function enumComboRow(settings, key, title, subtitle, items) {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(items),
        selected: settings.get_enum(key),
    });

    row.connect('notify::selected', () => {
        if (settings.get_enum(key) !== row.selected)
            settings.set_enum(key, row.selected);
    });

    const changedId = settings.connect(`changed::${key}`, () => {
        const val = settings.get_enum(key);
        if (row.selected !== val)
            row.selected = val;
    });

    row.connect('destroy', () => settings.disconnect(changedId));
    return row;
}

export default class SimpleBlurShellPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Simple Blur Shell',
            icon_name: 'preferences-desktop-appearance-symbolic',
        });

        // --- Panel Blur ---
        const panelGroup = new Adw.PreferencesGroup({
            title: 'Panel Blur',
            description: 'Blur effect for the top bar.',
        });
        panelGroup.add(switchRow(settings, 'topbar-blur-enabled', 'Enable', 'Apply blurred background to the top bar'));
        panelGroup.add(enumComboRow(settings, 'topbar-blur-mode', 'Blur Mode', 'Static only blurs the wallpaper and is much lighter', ['Dynamic', 'Static']));
        panelGroup.add(spinRow(settings, 'topbar-blur-radius', 'Radius', 'Gaussian blur strength in pixels', 0, 120, 5));
        panelGroup.add(spinRow(settings, 'topbar-blur-brightness', 'Brightness', 'Brightness percentage (lower = darker)', 10, 100, 5));
        panelGroup.add(enumComboRow(settings, 'topbar-tint-mode', 'Tint', 'Color overlay on the blur', ['None', 'Dark', 'Light', 'Black']));
        panelGroup.add(spinRow(settings, 'topbar-tint-opacity', 'Tint Opacity', 'Opacity percentage of the tint', 0, 100, 5));
        panelGroup.add(spinRow(settings, 'topbar-corner-radius', 'Corner Radius', 'Rounded corners for floating panel styles', 0, 50, 2));
        panelGroup.add(enumComboRow(settings, 'topbar-smart-mode', 'Smart Mode', 'Adapt when windows touch the bar', ['Always Blurred', 'Solid on Maximized']));
        panelGroup.add(switchRow(settings, 'topbar-unblur-in-overview', 'Unblur in Overview', 'Disable panel blur during the overview'));
        page.add(panelGroup);

        // --- Overview Blur ---
        const overviewGroup = new Adw.PreferencesGroup({
            title: 'Overview Blur',
            description: 'Blur the desktop wallpaper in the Activities overview.',
        });
        overviewGroup.add(switchRow(settings, 'overview-blur-enabled', 'Enable', 'Blur wallpaper when overview is open'));
        overviewGroup.add(spinRow(settings, 'overview-blur-radius', 'Radius', 'Gaussian blur strength in pixels', 0, 120, 5));
        overviewGroup.add(spinRow(settings, 'overview-blur-brightness', 'Brightness', 'Brightness percentage (lower = darker)', 10, 100, 5));
        overviewGroup.add(enumComboRow(settings, 'overview-tint-mode', 'Tint', 'Color overlay on the blur', ['None', 'Dark', 'Light', 'Black']));
        overviewGroup.add(spinRow(settings, 'overview-tint-opacity', 'Tint Opacity', 'Opacity percentage of the tint', 0, 100, 5));
        overviewGroup.add(spinRow(settings, 'overview-corner-radius', 'Workspace Corner Radius', 'Rounded corners of the workspace previews (GNOME default: 30)', 0, 60, 2));
        overviewGroup.add(enumComboRow(settings, 'overview-components-style', 'Components Style', 'Restyle the search bar and dash to blend with the blur', ['Default', 'Dark', 'Transparent']));
        page.add(overviewGroup);

        window.add(page);
    }
}
