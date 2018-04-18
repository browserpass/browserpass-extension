CHROME_FILES := manifest.json \
	       *.html \
	       *.css \
	       *.png \
	       background.js \
	       popup.js
CHROME_FILES := $(wildcard $(addprefix src/,$(CHROME_FILES)))
CHROME_FILES := $(patsubst src/%,chrome/%,$(CHROME_FILES))

CLEAN_FILES := chrome

.PHONY: all
all: extension chrome

.PHONY: extension
extension:
	$(MAKE) -C src

chrome: extension $(CHROME_FILES)

$(CHROME_FILES) : chrome/% : src/%
	[ -d $(dir $@) ] || mkdir -p $(dir $@)
	cp $< $@

clean:
	rm -rf $(CLEAN_FILES)
	$(MAKE) -C src clean
