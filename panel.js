import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

import { tintStyle } from './utils.js';

export class TopBarBlurManager {
    constructor(settings) {
        this._settings = settings;
        this._bgGroup = null;
        this._bgWidget = null;
        this._blurEffect = null;
        this._staticWidget = null;
        this._staticBgManager = null;
        this._syncTimeoutId = 0;
        this._inOverview = false;
        this._isBlurred = null;
        this._trackingWindows = false;
        this._windowSignals = new Map();
    }

    enable() {
        if (this._bgGroup)
            return;

        // Container actor with zero allocated size so it does not affect panelBox layout
        this._bgGroup = new Meta.BackgroundGroup({
            name: 'simple-blur-shell-bg-group',
            width: 0,
            height: 0,
        });

        // The widget that holds the blur effect and optional color tint
        this._bgWidget = new St.Widget({
            name: 'simple-blur-shell-widget',
            style_class: 'simple-blur-shell-widget',
            reactive: false,
        });

        this._blurEffect = new Shell.BlurEffect({
            name: 'simple-blur-shell-effect',
            mode: Shell.BlurMode.BACKGROUND,
        });

        this._bgWidget.add_effect(this._blurEffect);

        // Static mode: a monitor-sized copy of the wallpaper, blurred once and
        // clipped to the panel. The blur sits on this wrapper rather than on the
        // wallpaper actor itself; on the actor it gets redone whenever anything
        // repaints under the panel. Sits below _bgWidget so the tint stays on top.
        this._staticWidget = new St.Widget({
            name: 'simple-blur-shell-static-widget',
            reactive: false,
            visible: false,
        });
        this._staticWidget.add_effect(new Shell.BlurEffect({
            name: 'simple-blur-shell-static',
            mode: Shell.BlurMode.ACTOR,
        }));

        // While a new wallpaper loads it is added on top of the old one; keep
        // it underneath so the old one can fade out over it
        this._staticWidget.connectObject(
            'child-added', (widget, child) => {
                if (child instanceof Meta.BackgroundActor)
                    widget.set_child_below_sibling(child, null);
            },
            this
        );

        this._bgGroup.add_child(this._staticWidget);
        this._bgGroup.add_child(this._bgWidget);

        // Insert at bottom of panelBox (behind Main.panel)
        Main.layoutManager.panelBox.insert_child_at_index(this._bgGroup, 0);

        // Bind settings changes
        this._settings.connectObject(
            'changed::topbar-blur-enabled', () => this._updateEffect(),
            'changed::topbar-blur-radius', () => this._updateEffect(),
            'changed::topbar-blur-brightness', () => this._updateEffect(),
            'changed::topbar-tint-mode', () => this._updateEffect(),
            'changed::topbar-tint-opacity', () => this._updateEffect(),
            'changed::topbar-blur-mode', () => this._updateEffect(),
            'changed::topbar-corner-radius', () => this._updateEffect(),
            'changed::topbar-smart-mode', () => {
                this._updateWindowTracking();
                this._updateActiveState();
            },
            'changed::topbar-unblur-in-overview', () => this._updateActiveState(),
            this
        );

        // Listen for panel geometry changes
        Main.panel.connectObject(
            'notify::allocation', () => this._queueSyncGeometry(),
            'notify::size', () => this._queueSyncGeometry(),
            'notify::position', () => this._queueSyncGeometry(),
            this
        );

        Main.layoutManager.connectObject(
            'monitors-changed', () => {
                // The static wallpaper is tied to a monitor index
                this._destroyStaticBackground();
                this._updateEffect();
                this._queueSyncGeometry();
            },
            this
        );

        global.display.connectObject(
            'workareas-changed', () => this._queueSyncGeometry(),
            this
        );

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.connectObject(
            'notify::scale-factor', () => this._updateEffect(),
            this
        );

        // Overview tracking
        Main.overview.connectObject(
            'showing', () => {
                this._inOverview = true;
                this._updateActiveState();
            },
            'hidden', () => {
                this._inOverview = false;
                this._updateActiveState();
            },
            this
        );

        // Window tracking is only needed by smart mode
        this._updateWindowTracking();

        // Initial sync
        this._syncGeometry();
        this._updateEffect();
    }

    _queueSyncGeometry() {
        if (this._syncTimeoutId)
            return;

        this._syncTimeoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncTimeoutId = 0;
            this._syncGeometry();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncGeometry() {
        if (!this._bgWidget || !Main.panel)
            return;

        const [x, y] = Main.panel.get_position();
        const [w, h] = Main.panel.get_size();

        if (w > 0 && h > 0) {
            this._bgWidget.set_position(x, y);
            this._bgWidget.set_size(w, h);
        }

        this._syncStaticGeometry();

        this._updateActiveState();
    }

    _updateEffect() {
        if (!this._blurEffect || !this._bgWidget)
            return;

        const enabled = this._settings.get_boolean('topbar-blur-enabled');
        const radius = this._settings.get_int('topbar-blur-radius');
        const brightnessPercent = this._settings.get_int('topbar-blur-brightness');
        const brightness = Math.min(1.0, Math.max(0.0, brightnessPercent / 100.0));
        const cornerRadius = this._settings.get_int('topbar-corner-radius');
        const tintMode = this._settings.get_enum('topbar-tint-mode');
        const tintOpacity = this._settings.get_int('topbar-tint-opacity');
        const isStatic = this._settings.get_enum('topbar-blur-mode') === 1;
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        const scaledRadius = Math.round(radius * themeContext.scale_factor);

        this._blurEffect.enabled = enabled && !isStatic;
        this._blurEffect.radius = scaledRadius;
        this._blurEffect.brightness = brightness;

        const staticEffect = this._staticWidget.get_effect('simple-blur-shell-static');
        staticEffect.radius = scaledRadius;
        staticEffect.brightness = brightness;

        if (enabled && isStatic)
            this._ensureStaticBackground();
        else
            this._destroyStaticBackground();

        let style = tintStyle(tintMode, tintOpacity);

        if (cornerRadius > 0)
            style += `border-radius: ${cornerRadius}px; `;

        this._bgWidget.style = style;
        this._updateActiveState();
    }

    _ensureStaticBackground() {
        if (this._staticBgManager)
            return;

        this._staticBgManager = new Background.BackgroundManager({
            container: this._staticWidget,
            monitorIndex: Main.layoutManager.primaryIndex,
            controlPosition: false,
        });

        this._syncStaticGeometry();
    }

    _syncStaticGeometry() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!this._staticWidget || !monitor)
            return;

        // Line the wallpaper up with the monitor, wherever the panel is, then
        // clip it to the panel's area
        const [gx, gy] = this._bgGroup.get_transformed_position();
        if (!Number.isFinite(gx) || !Number.isFinite(gy))
            return;

        const wx = monitor.x - gx;
        const wy = monitor.y - gy;
        this._staticWidget.set_position(wx, wy);
        this._staticWidget.set_size(monitor.width, monitor.height);

        const [x, y] = Main.panel.get_position();
        const [w, h] = Main.panel.get_size();
        this._staticWidget.set_clip(x - wx, y - wy, w, h);
    }

    _destroyStaticBackground() {
        if (!this._staticBgManager)
            return;

        this._staticBgManager.destroy();
        this._staticBgManager = null;
    }

    _shouldBlur() {
        if (!this._settings.get_boolean('topbar-blur-enabled'))
            return false;

        if (this._inOverview && this._settings.get_boolean('topbar-unblur-in-overview'))
            return false;

        const smartMode = this._settings.get_enum('topbar-smart-mode');
        if (smartMode === 1 /* unblur-maximized */ && this._hasMaximizedOrNearWindow())
            return false;

        return true;
    }

    _updateActiveState() {
        if (!this._bgWidget || !Main.panel)
            return;

        const shouldBlur = this._shouldBlur();

        // Only show the static widget when it has a wallpaper; an empty widget
        // with a blur effect would still be rendered offscreen
        this._staticWidget.visible = shouldBlur && this._staticBgManager !== null;

        // This runs on every window move in smart mode; only touch the panel
        // when the state actually changes
        if (shouldBlur === this._isBlurred)
            return;
        this._isBlurred = shouldBlur;

        if (shouldBlur) {
            this._bgWidget.show();
            Main.panel.add_style_class_name('simple-blur-shell-active');
            this._blurEffect?.queue_repaint();
        } else {
            this._bgWidget.hide();
            Main.panel.remove_style_class_name('simple-blur-shell-active');
        }
    }

    _hasMaximizedOrNearWindow() {
        if (!Main.layoutManager.primaryMonitor)
            return false;

        const workspace = global.workspace_manager.get_active_workspace();
        if (!workspace)
            return false;

        const primaryIndex = Main.layoutManager.primaryIndex;
        const monitor = Main.layoutManager.primaryMonitor;
        const panelBottom = monitor.y + Main.panel.height;

        const windows = workspace.list_windows().filter(w => {
            return w.showing_on_its_workspace()
                && !w.is_hidden()
                && w.get_window_type() === Meta.WindowType.NORMAL
                && w.get_monitor() === primaryIndex;
        });

        for (const win of windows) {
            if (win.maximized_vertically || win.maximized_horizontally)
                return true;

            const rect = win.get_frame_rect();
            if (rect.y <= panelBottom + 5 && (rect.y + rect.height) > monitor.y)
                return true;
        }

        return false;
    }

    _updateWindowTracking() {
        const wanted = this._settings.get_enum('topbar-smart-mode') === 1;
        if (wanted === this._trackingWindows)
            return;
        this._trackingWindows = wanted;

        if (!wanted) {
            this._untrackWindows();
            return;
        }

        global.display.connectObject(
            'restacked', () => this._onWindowStateChanged(),
            this._windowSignals
        );
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._onWindowStateChanged(),
            this._windowSignals
        );
        global.window_manager.connectObject(
            'switch-workspace', () => this._onWindowStateChanged(),
            this._windowSignals
        );
        global.window_group.connectObject(
            'child-added', (_group, actor) => this._onWindowActorAdded(actor),
            'child-removed', (_group, actor) => this._onWindowActorRemoved(actor),
            this._windowSignals
        );

        for (const actor of global.get_window_actors())
            this._onWindowActorAdded(actor);
    }

    _untrackWindows() {
        global.display.disconnectObject(this._windowSignals);
        global.workspace_manager.disconnectObject(this._windowSignals);
        global.window_manager.disconnectObject(this._windowSignals);
        global.window_group.disconnectObject(this._windowSignals);

        for (const [actor, ids] of this._windowSignals) {
            for (const id of ids)
                actor.disconnect(id);
        }
        this._windowSignals.clear();
    }

    _onWindowActorAdded(actor) {
        if (!actor || this._windowSignals.has(actor))
            return;

        const id1 = actor.connect('notify::allocation', () => this._onWindowStateChanged());
        const id2 = actor.connect('notify::visible', () => this._onWindowStateChanged());
        const id3 = actor.connect('destroy', () => this._onWindowActorRemoved(actor));
        this._windowSignals.set(actor, [id1, id2, id3]);
        this._onWindowStateChanged();
    }

    _onWindowActorRemoved(actor) {
        if (!actor || !this._windowSignals.has(actor))
            return;

        const ids = this._windowSignals.get(actor);
        for (const id of ids) {
            try {
                actor.disconnect(id);
            } catch {
                // Actor might be already destroyed
            }
        }

        this._windowSignals.delete(actor);
        this._onWindowStateChanged();
    }

    _onWindowStateChanged() {
        this._updateActiveState();
    }

    disable() {
        if (this._syncTimeoutId) {
            GLib.Source.remove(this._syncTimeoutId);
            this._syncTimeoutId = 0;
        }

        // Clean up window connections
        this._untrackWindows();
        this._trackingWindows = false;
        this._isBlurred = null;

        // Disconnect all listeners
        this._settings.disconnectObject(this);
        Main.panel.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.overview.disconnectObject(this);
        global.display.disconnectObject(this);

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.disconnectObject(this);

        // Remove panel class
        Main.panel.remove_style_class_name('simple-blur-shell-active');

        // Destroy actors
        this._destroyStaticBackground();

        if (this._bgGroup) {
            this._bgGroup.destroy();
            this._bgGroup = null;
        }

        this._bgWidget = null;
        this._staticWidget = null;
        this._blurEffect = null;
    }
}
