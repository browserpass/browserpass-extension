BROWSERIFY := node_modules/.bin/browserify
PRETTIER := node_modules/.bin/prettier

CLEAN_FILES := js

.PHONY: all
all: deps prettier js/background.dist.js js/popup.dist.js

.PHONY: deps
deps:
	yarn install

prettier: $(PRETTIER) *.js popup/*.js
	$(PRETTIER) --write *.js popup/*.js

js/background.dist.js: $(BROWSERIFY) background.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/background.dist.js background.js

js/popup.dist.js: $(BROWSERIFY) popup/*.js
	[ -d js ] || mkdir -p js
	$(BROWSERIFY) -o js/popup.dist.js popup/popup.js

clean:
	rm -rf $(CLEAN_FILES)
