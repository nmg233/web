"""Offline extraction only. Never executes or renders source HTML."""
import json
import sys
from html.parser import HTMLParser


class Article(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.text, self.skip = [], [], 0

    def flush(self):
        text = ''.join(self.text).strip()
        if text:
            self.blocks.append({'type': 'paragraph', 'text': text})
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'iframe', 'object', 'video'):
            self.skip += 1
        if self.skip:
            return
        if tag == 'p':
            self.flush()
        if tag == 'img':
            self.flush()
            self.blocks.append({'type': 'image', 'source': attrs.get('data-src') or attrs.get('src')})
        if tag == 'br' and self.text:
            self.text.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe', 'object', 'video') and self.skip:
            self.skip -= 1
        elif not self.skip and tag == 'p':
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)


source = json.load(open(sys.argv[1], encoding='utf-8-sig'))
parser = Article()
parser.feed(source['html'])
parser.flush()
json.dump(parser.blocks, sys.stdout, ensure_ascii=True)
