BROWSERIFY := node_modules/.bin/browserify
PRETTIER := node_modules/.bin/prettier

.PHONY: all
all: deps prettier background.js popup.js

.PHONY: deps
deps:
	yarn install

prettier: $(PRETTIER) *.src.js
	$(PRETTIER) --write *.src.js

background.js: $(BROWSERIFY) background.src.js
	$(BROWSERIFY) -o background.js background.src.js

popup.js: $(BROWSERIFY) popup.src.js
	$(BROWSERIFY) -o popup.js popup.src.js

$(BROWSERIFY):
	npm install browserify

$(PRETTIER):
	npm install prettier
