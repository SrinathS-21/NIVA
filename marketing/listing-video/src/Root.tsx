import React from 'react';
import { Composition } from 'remotion';
import { NivaPromo, NivaRecapSquare } from './NivaPromo';

export function Root() {
  return (
    <>
      {/* Play Store listing video: portrait, 24 s. */}
      <Composition
        id="NivaPromo"
        component={NivaPromo}
        durationInFrames={30 * 24}
        fps={30}
        width={1080}
        height={1920}
      />
      {/* Monthly recap for social: square, 6 s. */}
      <Composition
        id="NivaRecapSquare"
        component={NivaRecapSquare}
        durationInFrames={30 * 6}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{ month: 'September 2026', read: 84, handledByNiva: 23, spend: '₹24,580', billsPaid: 4 }}
      />
    </>
  );
}
