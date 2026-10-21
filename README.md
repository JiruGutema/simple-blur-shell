<p align="center">
  <img src="assets/icon.svg" alt="Simple Blur Shell icon" width="128">
</p>

# Simple Blur Shell

Lightweight blur for the GNOME Shell top bar and the Activities overview.

## Features

- **Top bar blur**
  - *Static* (default): blurs the wallpaper once and reuses it. Costs about the same as no blur.
  - *Dynamic*: blurs whatever is behind the bar, including windows, on every frame. Costs more GPU time.
  - *Transparent*: no blur, just the tint (or nothing) over whatever is behind the bar
  - Radius, brightness, tint (none, dark, light, black, accent) with adjustable opacity, and corner radius
  - Accent tint follows the system accent color, shaded darker or lighter for the dark or light style
  - Optionally fade the tint out toward the bottom of the bar
  - Smart mode: turn the blur off when a window is maximized or touches the bar
  - Optionally turn the blur off while the overview is open
- **Overview blur**
  - Blurred wallpaper behind the overview (static, blurred once)
  - Radius, brightness, tint (including accent) and tint opacity
  - Corner radius of the workspace previews
  - Restyle the search bar and dash (dark or transparent) to blend with the blur

Supports GNOME Shell 46–50. GNOME 46 has no accent color setting, so the accent tint uses GNOME's default blue there.

## Install

From [extensions.gnome.org](https://extensions.gnome.org/), or from source:

```sh
make install
gnome-extensions enable simple-blur-shell@jirugutema.github.io
```

Then log out and back in (on Wayland, GNOME Shell only loads new extensions at login).

## Build

```sh
make build
```

This creates `simple-blur-shell@jirugutema.github.io.shell-extension.zip` with `gnome-extensions pack`, ready to upload.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
