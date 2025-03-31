BROWSERIFY := node_modules/.bin/browserify
PRETTIER := node_modules/.bin/prettier
LESSC := node_modules/.bin/lessc

CLEAN_FILES := css js
PRETTIER_FILES := $(wildcard *.json *.js popup/*.js offscreen/*.js options/*.js *.less popup/*.less options/*.less *.html popup/*.html offscreen/*.html options/*.html)

.PHONY: all
all: deps prettier css/popup.dist.css css/options.dist.css js/background.dist.js js/popup.dist.js js/offscreen.dist.js js/options.dist.js js/inject.dist.js

.PHONY: deps
deps:
	yarn install

.PHONY: prettier
prettier: $(PRETTIER) $(PRETTIER_FILES)
	$(PRETTIER) --write $(PRETTIER_FILES)

css/popup.dist.css: $(LESSC) popup/*.less
	[ -d css ] || mkdir -p css
	$(LESSC) popup/popup.less css/popup.dist.css

css/options.dist.css: $(LESSC) options/*.less
	[ -d css ] || mkdir -p css
	$(LESSC) options/options.less css/options.dist.css

js/background.dist.js: $(BROWSERIFY) background.js helpers.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/background.dist.js background.js

js/popup.dist.js: $(BROWSERIFY) popup/*.js helpers.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/popup.dist.js popup/popup.js

js/offscreen.dist.js: $(BROWSERIFY) offscreen/*.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/offscreen.dist.js offscreen/offscreen.js

js/options.dist.js: $(BROWSERIFY) options/*.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/options.dist.js options/options.js

js/inject.dist.js: $(BROWSERIFY) inject.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/inject.dist.js inject.js

	# Firefox requires the last command to evaluate to something serializable
	# https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/executeScript#Return_value
	echo ";undefined" >> js/inject.dist.js

.PHONY: clean
clean:
	rm -rf $(CLEAN_FILES)
