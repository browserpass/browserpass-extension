BROWSERIFY := node_modules/.bin/browserify
PRETTIER := node_modules/.bin/prettier
LESSC := node_modules/.bin/lessc

CLEAN_FILES := js
PRETTIER_FILES := $(wildcard *.js popup/*.js *.less popup/*.less)

.PHONY: all
all: deps prettier css/popup.css js/background.dist.js js/popup.dist.js js/inject.dist.js

.PHONY: deps
deps:
	yarn install

.PHONY: prettier
prettier: $(PRETTIER) $(PRETTIER_FILES)
	$(PRETTIER) --write $(PRETTIER_FILES)

css/popup.css: $(LESSC) popup/popup.less
	[ -d css ] || mkdir -p css
	$(LESSC) popup/popup.less css/popup.dist.css

js/background.dist.js: $(BROWSERIFY) background.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/background.dist.js background.js

js/popup.dist.js: $(BROWSERIFY) popup/*.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/popup.dist.js popup/popup.js

js/inject.dist.js: $(BROWSERIFY) inject.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/inject.dist.js inject.js

.PHONY: clean
clean:
	rm -rf $(CLEAN_FILES)
