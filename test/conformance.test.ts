// Compile-time only: nothing here runs. Without it the .mjs and its .d.ts are
// checked in isolation and either side can change alone. Assignability runs
// implementation -> declaration, so internals absent from the .d.ts are fine.

import type * as browserDecl from '../src/zipcodetw.d.ts';
import type * as nodeDecl from '../src/node.d.ts';
import type * as translateDecl from '../src/translate.d.ts';
import type * as mailboxDecl from '../src/mailbox.d.ts';
import type * as zipcodeDecl from '../src/zipcode.d.ts';
import type * as entryDecl from '../src/browser.d.ts';

import * as browserImpl from '../src/zipcodetw.mjs';
import * as nodeImpl from '../src/node.mjs';
import * as translateImpl from '../src/translate.mjs';
import * as mailboxImpl from '../src/mailbox.mjs';
import * as zipcodeImpl from '../src/zipcode.mjs';
import * as entryImpl from '../src/browser.mjs';

const browserConforms: typeof browserDecl = browserImpl;
const nodeConforms: typeof nodeDecl = nodeImpl;
const translateConforms: typeof translateDecl = translateImpl;
const mailboxConforms: typeof mailboxDecl = mailboxImpl;
const zipcodeConforms: typeof zipcodeDecl = zipcodeImpl;
const entryConforms: typeof entryDecl = entryImpl;

void browserConforms;
void nodeConforms;
void translateConforms;
void mailboxConforms;
void zipcodeConforms;
void entryConforms;
