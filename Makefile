VERSION ?= $(shell cat .version)

CLEAN_FILES := chromium firefox dist dist-webstore
CHROME := $(shell which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which chrome 2>/dev/null || which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null)

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
	src/*.svg \
	src/fonts/* \
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

.PHONY: crx-webstore
crx-webstore:
	"$(CHROME)" --disable-gpu --pack-extension=./chromium --pack-extension-key=webstore.pem
	mv chromium.crx browserpass-webstore.crx

.PHONY: crx-github
crx-github:
	"$(CHROME)" --disable-gpu --pack-extension=./chromium --pack-extension-key=github.pem
	mv chromium.crx browserpass-github.crx

.PHONY: dist
dist: clean extension chromium firefox crx-webstore crx-github
	mkdir -p dist

	git archive -o dist/browserpass-extension-$(VERSION).tar.gz --format tar.gz --prefix=browserpass-extension-$(VERSION)/ $(VERSION)

	(cd chromium && zip -r ../dist/chromium.zip *)
	(cd firefox  && zip -r ../dist/firefox.zip  *)

	mv browserpass-webstore.crx dist/
	mv browserpass-github.crx dist/

	for file in dist/*; do \
	    gpg --detach-sign "$$file"; \
	done

	rm -f dist/browserpass-extension-$(VERSION).tar.gz

	mkdir -p dist-webstore
	cp -a chromium dist-webstore/
	sed -i '/"key"/d' dist-webstore/chromium/manifest.json
	(cd dist-webstore/chromium && zip -r ../chrome.zip *)
	rm -rf dist-webstore/chromium
