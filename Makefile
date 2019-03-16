CLEAN_FILES := chromium firefox

.PHONY: all
all: extension chromium firefox

.PHONY: extension
extension:
	$(MAKE) -C src

EXTENSION_FILES := \
	src/*.css \
	src/*.png \
	src/popup/*.html \
	src/popup/*.svg \
	src/options/*.html
EXTENSION_FILES := \
    $(wildcard $(EXTENSION_FILES)) \
	src/css/popup.dist.css \
	src/css/options.dist.css \
	src/js/background.dist.js \
	src/js/popup.dist.js \
	src/js/options.dist.js \
	src/js/inject.dist.js
CHROMIUM_FILES := $(patsubst src/%,chromium/%, $(EXTENSION_FILES))
FIREFOX_FILES  := $(patsubst src/%,firefox/%,  $(EXTENSION_FILES))

.PHONY: chromium
chromium: extension $(CHROMIUM_FILES) chromium/manifest.json

$(CHROMIUM_FILES) : chromium/% : src/%
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

chromium/manifest.json : src/manifest-chromium.json
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

.PHONY: firefox
firefox: extension $(FIREFOX_FILES) firefox/manifest.json

$(FIREFOX_FILES) : firefox/% : src/%
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

firefox/manifest.json : src/manifest-firefox.json
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

.PHONY: clean
clean:
	rm -rf $(CLEAN_FILES)
	$(MAKE) -C src clean
