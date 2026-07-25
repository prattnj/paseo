// A cleared construction site (placeholder orange ground).
import { PALETTE as P } from '../palette.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

function buildConstruction(g, col, b) {
  const r = slabAndSidewalk(g, col, b, P.testOrange);
  cornerLamps(g, col, b);
}

export { buildConstruction };
