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
	       popup/*.css
CHROME_FILES := $(wildcard $(addprefix src/,$(CHROME_FILES))) \
		src/js/background.dist.js \
		src/js/popup.dist.js
CHROME_FILES := $(patsubst src/%,chrome/%,$(CHROME_FILES))

chrome: extension $(CHROME_FILES)

$(CHROME_FILES) : chrome/% : src/%
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

clean:
	rm -rf $(CLEAN_FILES)
	$(MAKE) -C src clean
