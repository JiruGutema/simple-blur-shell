import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';

import { tintStyle } from './utils.js';

// Indexed by the ComponentsStyle enum: default, dark, transparent
const COMPONENT_STYLE_CLASSES = [null, 'simple-blur-shell-overview-dark', 'simple-blur-shell-overview-transparent'];

export class OverviewBlurManager {
    constructor(settings) {
        this._settings = settings;
        this._bgGroup = null;
        this._bgManagers = [];
        this._tintWidgets = [];
        this._origUpdateBorderRadius = null;
    }

    enable() {
        if (this._bgGroup)
            return;

        // The wallpaper in Main.layoutManager._backgroundGroup lives inside
        // global.window_group, which GNOME Shell hides while the overview is
        // open. So draw our own copy of the wallpaper at the bottom of the
        // overview group and blur that. The overview group is only visible
        // during the overview, so this costs nothing the rest of the time.
        this._bgGroup = new Meta.BackgroundGroup({
            name: 'simple-blur-shell-overview-group',
            reactive: false,
        });
        Main.layoutManager.overviewGroup.insert_child_at_index(this._bgGroup, 0);

        // Other extensions may add actors to the overview group; stay below them
        Main.layoutManager.overviewGroup.connectObject(
            'child-added', () => {
                if (Main.layoutManager.overviewGroup.get_child_at_index(0) !== this._bgGroup)
                    Main.layoutManager.overviewGroup.set_child_below_sibling(this._bgGroup, null);
            },
            this
        );

        this._settings.connectObject(
            'changed::overview-blur-enabled', () => this._updateVisibility(),
            'changed::overview-blur-radius', () => this._updateEffects(),
            'changed::overview-blur-brightness', () => this._updateEffects(),
            'changed::overview-tint-mode', () => this._updateTint(),
            'changed::overview-tint-opacity', () => this._updateTint(),
            'changed::overview-components-style', () => this._updateVisibility(),
            'changed::overview-corner-radius', () => this._refreshCornerRadius(),
            this
        );

        this._patchCornerRadius();

        Main.layoutManager.connectObject(
            'monitors-changed', () => this._rebuild(),
            this
        );

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.connectObject(
            'notify::scale-factor', () => this._updateEffects(),
            this
        );

        this._rebuild();
        this._updateVisibility();
    }

    _rebuild() {
        this._destroyBackgrounds();

        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            const bgManager = new Background.BackgroundManager({
                container: this._bgGroup,
                monitorIndex: i,
                vignette: false,
            });

            // The background actor is replaced when the wallpaper changes
            bgManager.connectObject(
                'changed', () => this._addEffect(bgManager.backgroundActor),
                this
            );

            this._addEffect(bgManager.backgroundActor);
            this._bgManagers.push(bgManager);
        }

        // Tints are added after the wallpapers, which always keep themselves
        // at the bottom of the group, so the tints stay on top
        for (const monitor of Main.layoutManager.monitors) {
            const tint = new St.Widget({
                reactive: false,
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
            });
            this._bgGroup.add_child(tint);
            this._tintWidgets.push(tint);
        }

        this._updateTint();
    }

    _updateTint() {
        const style = tintStyle(
            this._settings.get_enum('overview-tint-mode'),
            this._settings.get_int('overview-tint-opacity'));

        for (const tint of this._tintWidgets)
            tint.style = style;
    }

    _addEffect(actor) {
        if (!actor || actor.get_effect('simple-blur-shell-overview'))
            return;

        // ACTOR mode blurs the wallpaper once and caches the result
        actor.add_effect(new Shell.BlurEffect({
            name: 'simple-blur-shell-overview',
            mode: Shell.BlurMode.ACTOR,
        }));
        this._updateEffect(actor);
    }

    _updateEffect(actor) {
        const effect = actor?.get_effect('simple-blur-shell-overview');
        if (!effect)
            return;

        const radius = this._settings.get_int('overview-blur-radius');
        const brightnessPercent = this._settings.get_int('overview-blur-brightness');
        const themeContext = St.ThemeContext.get_for_stage(global.stage);

        effect.radius = Math.round(radius * themeContext.scale_factor);
        effect.brightness = Math.min(1.0, Math.max(0.0, brightnessPercent / 100.0));
    }

    _updateEffects() {
        for (const bgManager of this._bgManagers)
            this._updateEffect(bgManager.backgroundActor);
    }

    _updateVisibility() {
        if (!this._bgGroup)
            return;

        const enabled = this._settings.get_boolean('overview-blur-enabled');
        this._bgGroup.visible = enabled;

        this._removeComponentStyle();
        const styleClass = COMPONENT_STYLE_CLASSES[this._settings.get_enum('overview-components-style')];
        if (enabled && styleClass)
            Main.uiGroup.add_style_class_name(styleClass);
    }

    _removeComponentStyle() {
        for (const styleClass of COMPONENT_STYLE_CLASSES) {
            if (styleClass)
                Main.uiGroup.remove_style_class_name(styleClass);
        }
    }

    _patchCornerRadius() {
        // GNOME hardcodes the workspace preview corner radius, so replace the
        // method that applies it. It runs on every frame of the overview
        // animation, so it reads the cached value rather than GSettings.
        const proto = Workspace.WorkspaceBackground.prototype;
        this._origUpdateBorderRadius = proto._updateBorderRadius;
        this._cornerRadius = this._settings.get_int('overview-corner-radius');

        const manager = this;
        proto._updateBorderRadius = function () {
            const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
            this._bgManager.backgroundActor.content.rounded_clip_radius =
                scaleFactor * manager._cornerRadius * this._stateAdjustment.value;
        };

        this._refreshCornerRadius();
    }

    _unpatchCornerRadius() {
        if (!this._origUpdateBorderRadius)
            return;

        Workspace.WorkspaceBackground.prototype._updateBorderRadius = this._origUpdateBorderRadius;
        this._origUpdateBorderRadius = null;
        this._refreshCornerRadius();
    }

    _refreshCornerRadius() {
        this._cornerRadius = this._settings.get_int('overview-corner-radius');

        // Update the workspace previews that already exist
        const visit = actor => {
            if (actor instanceof Workspace.WorkspaceBackground)
                actor._updateBorderRadius();
            else
                actor.get_children().forEach(visit);
        };
        visit(Main.layoutManager.overviewGroup);
    }

    _destroyBackgrounds() {
        for (const bgManager of this._bgManagers) {
            bgManager.disconnectObject(this);
            bgManager.destroy();
        }
        this._bgManagers = [];

        for (const tint of this._tintWidgets)
            tint.destroy();
        this._tintWidgets = [];
    }

    disable() {
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.layoutManager.overviewGroup.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);

        this._unpatchCornerRadius();
        this._destroyBackgrounds();
        this._removeComponentStyle();

        this._bgGroup?.destroy();
        this._bgGroup = null;
    }
}
