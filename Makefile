VERSION ?= undefined

CLEAN_FILES := chromium firefox dist
CHROME := $(shell which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which chrome 2>/dev/null || which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null)
PEM := $(shell find . -maxdepth 1 -name "*.pem")

#######################
# For local development

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

#######################
# For official releases

.PHONY: clean
clean:
	rm -rf $(CLEAN_FILES)
	$(MAKE) -C src clean

.PHONY: crx
crx:
ifneq ($(PEM),)
	"$(CHROME)" --disable-gpu --pack-extension=./chromium --pack-extension-key=$(PEM)
else
	"$(CHROME)" --disable-gpu --pack-extension=./chromium
	rm chromium.pem
endif
	mv chromium.crx browserpass.crx

.PHONY: dist
dist: clean extension chromium firefox crx
	mkdir -p dist

	git archive -o dist/$(VERSION).tar.gz --format tar.gz --prefix=browserpass-extension-$(VERSION)/ $(VERSION)
	mv browserpass.crx dist/

	for file in dist/*; do \
	    gpg --detach-sign "$$file"; \
	done

	rm -f dist/$(VERSION).tar.gz
