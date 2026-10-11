import {readFileSync} from 'node:fs';
// Generated with the installed FFmpeg lavfi testsrc2, 320x180/12fps/1s/VP8.
// This contains synthetic colour/test patterns, never uploaded or student media.
export function syntheticReplay(){return readFileSync(new URL('../../backend/testFixtures/teaching-replay.webm',import.meta.url));}
