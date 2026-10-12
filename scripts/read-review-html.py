"""Parse a saved review as data; never execute HTML, JavaScript or URLs."""
import json
import sys
from html.parser import HTMLParser


class Review(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.fields, self.base, self.active = [], {}, [], None
        self.enabled = {}
        self.baseline_depth = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.active and tag in ("div", "p", "br"):
            self.fields[self.active] += "\n"
        if tag not in ("br", "img", "input", "meta", "link", "hr"):
            self.stack.append(tag)
        key = attrs.get("data-copy-id")
        enabled_key = attrs.get("data-enabled-id")
        if enabled_key:
            self.enabled[enabled_key] = "checked" in attrs
        if key:
            if key in self.fields:
                raise ValueError("Duplicate copy ID: " + key)
            self.fields[key], self.active = "", key
            self.active_depth = len(self.stack)
        if tag == "script" and attrs.get("id") == "baseline" and attrs.get("type") == "application/json":
            self.baseline_depth = len(self.stack)

    def handle_endtag(self, tag):
        if self.active and len(self.stack) == self.active_depth:
            self.active = None
        if self.baseline_depth == len(self.stack):
            self.baseline_depth = None
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()

    def handle_data(self, text):
        if self.active:
            self.fields[self.active] += text
        if self.baseline_depth:
            self.base.append(text)


if __name__ == "__main__":
    review = Review()
    with open(sys.argv[1], encoding="utf-8-sig") as stream:
        review.feed(stream.read())
    baseline = json.loads("".join(review.base))
    if not isinstance(baseline, list) or len(baseline) != len(review.fields):
        raise ValueError("Baseline and editable fields do not match")
    edits = []
    for entry in baseline:
        key = entry["id"]
        value = review.fields[key].replace("\r\n", "\n")
        enabled = review.enabled.get(key, entry["enabled"])
        if value != entry["text"] or enabled != entry["enabled"]:
            edits.append(dict(id=key, text=value, enabled=enabled, baseText=entry["text"], baseEnabled=entry["enabled"]))
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(dict(baseline=baseline, edits=edits), ensure_ascii=False))
