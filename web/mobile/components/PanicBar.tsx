import { Button, Grid } from '@chakra-ui/react';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import { HAPTIC_COMMIT_MS, haptic } from '../lib/haptics.ts';
import { sizesFor, useCompactLayout } from '../lib/layout.ts';

/**
 * Always-visible kill switches.
 *
 * These sit outside the tabs on purpose: blackout is the control you reach for
 * when something is wrong on stage, and it must never be behind a tab switch.
 *
 * They also sit *visually apart* from the tabs. Two adjacent rows of same-sized
 * buttons is the classic mis-tap geometry — a thumb travelling to "Cues" passes
 * straight over "Blackout", and the cost of that slip is the show going dark.
 * The gap, the tinted band, and the hairline below are buying separation, not
 * decoration. Nothing here gets a confirm step: the point of a panic control is
 * that it fires on the first press.
 */
export function PanicBar() {
  const sizes = sizesFor(useCompactLayout());
  const { state, updateState } = useControls();

  return (
    <Grid
      role="group"
      aria-label="Panic controls"
      templateColumns="repeat(4, 1fr)"
      gap={2}
      px={3}
      pt={2}
      pb={sizes.separatorGap}
      mb={sizes.separatorGap}
      // Tinted band + hairline: the separation an operator reads peripherally.
      // This strip is not part of the navigation below it.
      bg="rgba(60, 12, 12, 0.35)"
      borderBottomWidth="1px"
      borderColor="whiteAlpha.300"
    >
      <Button
        h={sizes.controlHeight}
        colorPalette="red"
        variant={state.blackout ? 'solid' : 'surface'}
        aria-pressed={state.blackout}
        onClick={() => {
          haptic(HAPTIC_COMMIT_MS);
          updateState({ blackout: !state.blackout });
        }}
      >
        Blackout
      </Button>
      <Button
        h={sizes.controlHeight}
        colorPalette="yellow"
        variant={state.freeze ? 'solid' : 'surface'}
        aria-pressed={state.freeze}
        onClick={() => {
          haptic(HAPTIC_COMMIT_MS);
          updateState({ freeze: !state.freeze });
        }}
      >
        Freeze
      </Button>
      <Button
        h={sizes.controlHeight}
        colorPalette="yellow"
        variant={state.strobe ? 'solid' : 'surface'}
        aria-pressed={state.strobe}
        onClick={() => {
          haptic(HAPTIC_COMMIT_MS);
          // Lockout is a safety catch (photosensitivity); releasing it is an
          // explicit act, so the first press clears it and arms the strobe.
          if (state.strobeLockout) {
            updateState({ strobeLockout: false, strobe: true });
            return;
          }
          updateState({ strobe: !state.strobe });
        }}
      >
        {state.strobeLockout ? 'Locked' : 'Strobe'}
      </Button>
      <Button
        h={sizes.controlHeight}
        colorPalette="purple"
        onClick={() => {
          haptic(HAPTIC_COMMIT_MS);
          updateState({ flashVersion: state.flashVersion + 1 });
        }}
      >
        Flash
      </Button>
    </Grid>
  );
}
