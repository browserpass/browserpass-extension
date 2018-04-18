BROWSERIFY := node_modules/.bin/browserify
PRETTIER := node_modules/.bin/prettier

CLEAN_FILES := background.js popup.js

.PHONY: all
all: deps prettier background.js popup.js

.PHONY: deps
deps:
	yarn install

prettier: $(PRETTIER) *.src.js popup/*.js
	$(PRETTIER) --write *.src.js popup/*.js

background.js: $(BROWSERIFY) background.src.js
	$(BROWSERIFY) -o background.dist.js background.src.js

popup.js: $(BROWSERIFY) popup/*.js
	$(BROWSERIFY) -o popup.dist.js popup/popup.js

clean:
	rm -rf $(CLEAN_FILES)
