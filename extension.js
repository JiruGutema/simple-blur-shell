import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { TopBarBlurManager } from './panel.js';
import { OverviewBlurManager } from './overview.js';

export default class SimpleBlurShellExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._panelBlur = new TopBarBlurManager(this._settings);
        this._overviewBlur = new OverviewBlurManager(this._settings);

        this._panelBlur.enable();
        this._overviewBlur.enable();
    }

    disable() {
        this._overviewBlur?.disable();
        this._panelBlur?.disable();

        this._overviewBlur = null;
        this._panelBlur = null;
        this._settings = null;
    }
}
