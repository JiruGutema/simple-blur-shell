import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

import { tintStyle } from './utils.js';

export class WorkspaceSwitchBlurManager {
    constructor(settings) {
        this._settings = settings;
        this._bgManagers = new Set();
    }

    enable() {
        // GNOME fills the gap between workspaces during a switch with a flat
        // color (.workspace-animation). It builds one actor per monitor for
        // each switch and adds it to the UI group, above the real windows, so
        // put a blurred wallpaper at the bottom of it to fill the gap instead.
        Main.uiGroup.connectObject(
            'child-added', (_group, actor) => this._onChildAdded(actor),
            this
        );
    }

    _onChildAdded(actor) {
        if (!(actor instanceof St.Widget) || !actor.has_style_class_name('workspace-animation'))
            return;

        // Follow the overview blur, which this matches
        if (!this._settings.get_boolean('overview-blur-enabled'))
            return;

        const bgGroup = new Meta.BackgroundGroup({reactive: false});
        actor.insert_child_at_index(bgGroup, 0);

        const bgManager = new Background.BackgroundManager({
            container: bgGroup,
            monitorIndex: actor._monitor?.index ?? Main.layoutManager.primaryIndex,
            controlPosition: false,
            vignette: false,
        });
        this._addEffect(bgManager.backgroundActor);
        bgManager.connectObject(
            'changed', () => this._addEffect(bgManager.backgroundActor),
            this
        );
        this._bgManagers.add(bgManager);

        bgGroup.add_child(new St.Widget({
            reactive: false,
            width: actor._monitor?.width ?? 0,
            height: actor._monitor?.height ?? 0,
            style: tintStyle(
                this._settings.get_enum('overview-tint-mode'),
                this._settings.get_int('overview-tint-opacity')),
        }));

        // The actor only lives for the length of the switch
        actor.connectObject(
            'destroy', () => this._destroyBackground(bgManager),
            this
        );
    }

    _addEffect(actor) {
        if (!actor || actor.get_effect('simple-blur-shell-workspace'))
            return;

        const radius = this._settings.get_int('overview-blur-radius');
        const brightnessPercent = this._settings.get_int('overview-blur-brightness');
        const themeContext = St.ThemeContext.get_for_stage(global.stage);

        // ACTOR mode blurs the wallpaper once for the whole switch
        actor.add_effect(new Shell.BlurEffect({
            name: 'simple-blur-shell-workspace',
            mode: Shell.BlurMode.ACTOR,
            radius: Math.round(radius * themeContext.scale_factor),
            brightness: Math.min(1.0, Math.max(0.0, brightnessPercent / 100.0)),
        }));
    }

    _destroyBackground(bgManager) {
        if (!this._bgManagers.delete(bgManager))
            return;

        bgManager.disconnectObject(this);
        bgManager.destroy();
    }

    disable() {
        Main.uiGroup.disconnectObject(this);

        // Only non-empty if disabled in the middle of a switch
        for (const bgManager of [...this._bgManagers])
            this._destroyBackground(bgManager);
    }
}
