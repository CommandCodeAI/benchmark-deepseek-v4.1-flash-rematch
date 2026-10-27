// Cross-process engine determinism probe: node engine-proc.mjs <enginePath> <seed> <gens>
// Prints the world hash of a full headless run.
import { readFileSync } from 'node:fs';
import { loadEngineSource } from './engine.mjs';

const [, , enginePath, seedArg, gensArg] = process.argv;
const code = readFileSync(enginePath, 'utf8');
const { Engine } = loadEngineSource(code, { filename: enginePath });
const seed = Number(seedArg);
const gens = Number(gensArg);
const w = Engine.createWorld({ seed });
Engine.runHeadless(w, gens);
process.stdout.write(String(Engine.hashWorld(w)));
