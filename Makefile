CLEAN_FILES := chrome

.PHONY: all
all: extension chrome

.PHONY: extension
extension:
	$(MAKE) -C src

CHROME_FILES := manifest.json \
				*.css \
				*.png \
				popup/*.html \
				popup/*.svg \
				options/*.html
CHROME_FILES := $(wildcard $(addprefix src/,$(CHROME_FILES))) \
				src/css/popup.dist.css \
				src/css/options.dist.css \
				src/js/background.dist.js \
				src/js/popup.dist.js \
				src/js/options.dist.js \
				src/js/inject.dist.js
CHROME_FILES := $(patsubst src/%,chrome/%,$(CHROME_FILES))

.PHONY: chrome
chrome: extension $(CHROME_FILES)

$(CHROME_FILES) : chrome/% : src/%
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

.PHONY: clean
clean:
	rm -rf $(CLEAN_FILES)
	$(MAKE) -C src clean
