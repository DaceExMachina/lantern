// Code and Markdown for the review desk's finding view (ReviewDetail.vue): highlight.js colours a line by its file's language, and
// markdown-it turns a finding's explanation into HTML. Both run offline, from the bundle. Only the languages below are loaded.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLang from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

for (const [name, lang] of Object.entries({ bash, csharp, css, javascript, json, markdown: markdownLang, python, scss, sql, swift, typescript, xml, yaml })) hljs.registerLanguage(name, lang);

// a file's extension to its language (a Vue file's template and script both read well as xml)
const BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  vue: 'xml', html: 'xml', svg: 'xml', xml: 'xml', plist: 'xml', css: 'css', scss: 'scss', json: 'json', swift: 'swift', cs: 'csharp', sql: 'sql',
  sh: 'bash', zsh: 'bash', py: 'python', yml: 'yaml', yaml: 'yaml', md: 'markdown',
};
export const language = (file: string | undefined) => BY_EXT[file?.split('.').pop()?.toLowerCase() ?? ''];

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
/** A line (or a block) as HTML: highlighted when its language is known, else just escaped. highlight.js escapes the text it colours. */
// ponytail: a line at a time, so a comment or string that spans lines only colours where it starts; highlight the whole excerpt and split it if that grates
export const highlight = (text: string, lang: string | undefined) => lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : escape(text);

// The explanation comes from an agent reading untrusted PR content: no raw HTML (html: false escapes it), no images (they'd load from
// the network), and links only to http(s), opening outside Lantern.
const md = new MarkdownIt({ html: false, linkify: false, highlight: (code, lang) => lang && hljs.getLanguage(lang) ? highlight(code, lang) : '' });
md.disable('image');
md.validateLink = url => /^https?:\/\//i.test(url);
md.renderer.rules['link_open'] = (tokens, i, options, _env, self) => {
  tokens[i]?.attrSet('target', '_blank');
  tokens[i]?.attrSet('rel', 'noopener');
  return self.renderToken(tokens, i, options);
};
/** Markdown as safe HTML. */
export const markdown = (text: string) => md.render(text);
