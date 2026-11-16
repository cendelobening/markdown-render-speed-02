// Driver for the markdown renderer: reads every case, renders each one
// alone with parse(), and writes the HTML array for the scorer.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

interface InputCase {
  id: string;
  markdown: string;
}

const inputDir: string = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const payload: string = readFileSync(join(inputDir, 'cases.json'), 'utf8');
const cases: InputCase[] = JSON.parse(payload) as InputCase[];

const rendered: string[] = [];
for (const item of cases) {
  rendered.push(parse(item.markdown));
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), JSON.stringify(rendered));
