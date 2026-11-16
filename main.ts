// Entry point for the markdown-render-speed-02 kit driver.
//
// The kit drops a JSON array of { id, markdown } cases into the input
// directory and expects a JSON array of rendered HTML strings in the
// output directory. Each case is rendered in isolation, so state from
// one document can never leak into the next.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

function dirOf(name: string, fallback: string): string {
  const seen = process.env[name];
  return seen !== undefined && seen !== '' ? seen : fallback;
}

function loadCases(dir: string): Case[] {
  const raw = readFileSync(join(dir, 'cases.json'), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('cases.json is not an array');
  return parsed as Case[];
}

function renderAll(cases: Case[]): string[] {
  const out: string[] = new Array(cases.length);
  for (let i = 0; i < cases.length; i++) out[i] = parse(cases[i].markdown);
  return out;
}

function store(dir: string, html: string[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'html.json'), JSON.stringify(html));
}

const inDir = dirOf('MAKEFUN_INPUT_DIR', '/input');
const outDir = dirOf('MAKEFUN_OUTPUT_DIR', '/output');
store(outDir, renderAll(loadCases(inDir)));
