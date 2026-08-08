// Compile-time only: nothing here runs. Without it the .mjs and its .d.ts are
// checked in isolation and either side can change alone. Assignability runs
// implementation -> declaration, so internals absent from the .d.ts are fine.

import type * as browserDecl from '../src/zipcodetw.d.ts';
import type * as nodeDecl from '../src/node.d.ts';

import * as browserImpl from '../src/zipcodetw.mjs';
import * as nodeImpl from '../src/node.mjs';

const browserConforms: typeof browserDecl = browserImpl;
const nodeConforms: typeof nodeDecl = nodeImpl;

void browserConforms;
void nodeConforms;
