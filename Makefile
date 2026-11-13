UUID = simple-blur-shell@jirugutema.github.io
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMA_DIR = schemas
ZIP_FILE = $(UUID).shell-extension.zip

SOURCES = extension.js overview.js panel.js workspace.js prefs.js utils.js stylesheet.css metadata.json
SCHEMA_SRC = $(SCHEMA_DIR)/org.gnome.shell.extensions.simple-blur-shell.gschema.xml

.PHONY: all build install uninstall reinstall schemas enable disable restart log clean test

all: build

# Run the unit tests
test:
	node test/panel.test.js

# Compile GSettings schemas
schemas: $(SCHEMA_SRC)
	glib-compile-schemas $(SCHEMA_DIR)

# Build the extension zip for extensions.gnome.org with the official packer.
# It leaves out gschemas.compiled, which GNOME compiles on install.
build:
	@echo "Building $(ZIP_FILE)..."
	gnome-extensions pack --force \
		--extra-source=overview.js \
		--extra-source=panel.js \
		--extra-source=utils.js \
		--extra-source=workspace.js \
		--schema=$(SCHEMA_SRC) \
		--out-dir=.
	@echo "Done → $(ZIP_FILE)"

# Install to local GNOME Shell extensions directory
install: schemas
	@echo "Installing to $(EXTDIR)..."
	@mkdir -p $(EXTDIR)/$(SCHEMA_DIR)
	@cp $(SOURCES) $(EXTDIR)/
	@cp $(SCHEMA_DIR)/*.xml $(EXTDIR)/$(SCHEMA_DIR)/
	@cp $(SCHEMA_DIR)/gschemas.compiled $(EXTDIR)/$(SCHEMA_DIR)/
	@echo "Installed. Run 'make enable' then restart GNOME Shell."

# Remove the extension
uninstall:
	@echo "Removing $(EXTDIR)..."
	@rm -rf $(EXTDIR)
	@echo "Uninstalled."

# Shortcut: uninstall + install
reinstall: uninstall install

# Enable the extension via gnome-extensions CLI
enable:
	gnome-extensions enable $(UUID)

# Disable the extension via gnome-extensions CLI
disable:
	gnome-extensions disable $(UUID)

# Restart GNOME Shell (X11 only — on Wayland you must log out/in)
restart:
	@echo "Restarting GNOME Shell (X11 only)..."
	@dbus-send --session --type=method_call \
		--dest=org.gnome.Shell /org/gnome/Shell \
		org.gnome.Shell.Eval string:'global.reexec_self()'
	@echo "If this failed, you are likely on Wayland — log out and back in instead."

# Tail extension logs (journalctl)
log:
	journalctl -f -o cat /usr/bin/gnome-shell

# Remove build artifacts
clean:
	@rm -f $(ZIP_FILE)
	@rm -f $(SCHEMA_DIR)/gschemas.compiled
	@echo "Cleaned."
