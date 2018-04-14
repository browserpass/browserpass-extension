.PHONY: all
all: deps prettier background.js popup.js

.PHONY: deps
deps:
	yarn install

prettier: background.src.js popup.src.js
	prettier --write *.src.js

background.js: background.src.js
	browserify -o background.js background.src.js

popup.js: popup.src.js
	browserify -o popup.js popup.src.js
