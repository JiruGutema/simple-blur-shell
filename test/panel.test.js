// Drives the real panel.js with stubs to check that the panel keeps the
// overview styling while the top bar is blurred.
//
// Run with: node test/panel.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const noop = () => {};

function makeSignal() {
    const handlers = {};
    return {
        connectObject(...args) {
            for (let i = 0; i < args.length - 1; i += 2)
                handlers[args[i]] = args[i + 1];
        },
        disconnectObject: noop,
        emit(name) {
            handlers[name]?.();
        },
    };
}

class FakeActor {
    constructor() {
        Object.assign(this, {
            connectObject: noop,
            disconnectObject: noop,
            connect: noop,
            disconnect: noop,
            destroy: noop,
            add_effect: noop,
            queue_repaint: noop,
            get_effect: () => ({radius: 0, brightness: 0}),
            set_clip: noop,
            set_position: noop,
            set_size: noop,
            set_child_below_sibling: noop,
            add_child: noop,
            insert_child_at_index: noop,
            show: noop,
            hide: noop,
            visible: false,
            style: '',
            style_class: '',
        });
    }
}

const panel = new FakeActor();
panel._pseudo = new Set();
panel._classes = new Set();
panel.add_style_pseudo_class = c => panel._pseudo.add(c);
panel.remove_style_pseudo_class = c => panel._pseudo.delete(c);
panel.add_style_class_name = c => panel._classes.add(c);
panel.remove_style_class_name = c => panel._classes.delete(c);
panel.get_position = () => [0, 0];
panel.get_size = () => [1920, 35];

const overview = makeSignal();
overview.visible = false;

const Main = {
    panel,
    overview,
    uiGroup: new FakeActor(),
    layoutManager: Object.assign(new FakeActor(), {
        primaryIndex: 0,
        primaryMonitor: null,
        monitors: [],
        panelBox: new FakeActor(),
        overviewGroup: new FakeActor(),
    }),
};

const global = {
    stage: {},
    display: new FakeActor(),
    workspace_manager: new FakeActor(),
    window_manager: new FakeActor(),
    window_group: new FakeActor(),
    get_window_actors: () => [],
};

const St = {
    Widget: FakeActor,
    ThemeContext: {
        get_for_stage: () => ({scale_factor: 1, connectObject: noop, disconnectObject: noop}),
    },
};

const Meta = {BackgroundGroup: FakeActor};
const Shell = {BlurEffect: FakeActor, BlurMode: {BACKGROUND: 0, ACTOR: 1}};
const Background = {BackgroundManager: class {
    connectObject = noop;
    destroy = noop;
}};
const GLib = {idle_add: () => 0, Source: {remove: noop}, PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false};

const settings = {
    values: {
        'topbar-blur-enabled': true,
        'topbar-unblur-in-overview': true,
        'topbar-smart-mode': 0,
        'topbar-blur-mode': 0,
        'topbar-blur-radius': 30,
        'topbar-blur-brightness': 85,
        'topbar-tint-mode': 0,
        'topbar-tint-opacity': 35,
        'topbar-tint-fade': false,
        'topbar-corner-radius': 0,
    },
    get_boolean: k => settings.values[k],
    get_int: k => settings.values[k],
    get_enum: k => settings.values[k],
    connectObject: noop,
    disconnectObject: noop,
};

const interfaceSettings = {
    get_string: () => 'prefer-dark',
    connectObject: noop,
    disconnectObject: noop,
};

// Load panel.js with its imports replaced by the stubs above
const source = fs.readFileSync(path.join(__dirname, '..', 'panel.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '');
const names = ['Main', 'global', 'St', 'GLib', 'Meta', 'Shell', 'Background', 'tintStyle'];
const load = new Function(...names, `${source}\nreturn TopBarBlurManager;`);
const TopBarBlurManager = load(Main, global, St, GLib, Meta, Shell, Background, () => '');

const manager = new TopBarBlurManager(settings, interfaceSettings);
manager.enable();

// A blurred panel sits on the wallpaper, so it keeps the overview colours
assert.ok(panel._pseudo.has('overview'), 'blurred panel uses the overview style');

// The overview opens: GNOME adds the pseudo class, the extension keeps it
overview.emit('showing');
assert.ok(manager._inOverview);
assert.ok(panel._pseudo.has('overview'));

// The overview closes: GNOME drops the pseudo class again
panel.remove_style_pseudo_class('overview');
overview.emit('hiding');
assert.ok(!panel._pseudo.has('overview'), 'unblurred in the overview, theme colours');
overview.emit('hidden');
assert.ok(panel._pseudo.has('overview'), 'overview style restored after the overview');

// Turning the blur off gives the panel the theme colours back
settings.values['topbar-blur-enabled'] = false;
manager._updateEffect();
assert.ok(!panel._pseudo.has('overview'));
assert.ok(!panel._classes.has('simple-blur-shell-active'));

// ... and turning it on again puts the overview style back
settings.values['topbar-blur-enabled'] = true;
manager._updateEffect();
assert.ok(panel._pseudo.has('overview'));
assert.ok(panel._classes.has('simple-blur-shell-active'));

// Disabling the extension must not leave the pseudo class behind
manager.disable();
assert.ok(!panel._pseudo.has('overview'));
assert.ok(!panel._classes.has('simple-blur-shell-active'));

console.log('all panel tests passed');
