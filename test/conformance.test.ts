// Compile-time only: nothing here runs, but `npm run typecheck` fails if the
// hand-written declarations in src/*.d.ts stop describing what src/*.mjs
// actually exports. Without this, the two files are checked in isolation and a
// signature can be changed on one side alone without anything noticing.
//
// Assignability runs implementation -> declaration, so the implementation may
// carry extra internals (Directory.aliasIndex, Directory.canonicalize) that the
// published surface deliberately keeps quiet about.

import type * as browserDecl from '../src/zipcodetw.d.ts';
import type * as nodeDecl from '../src/node.d.ts';

import * as browserImpl from '../src/zipcodetw.mjs';
import * as nodeImpl from '../src/node.mjs';

const browserConforms: typeof browserDecl = browserImpl;
const nodeConforms: typeof nodeDecl = nodeImpl;

void browserConforms;
void nodeConforms;
