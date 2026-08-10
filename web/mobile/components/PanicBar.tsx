import { Button, Grid } from '@chakra-ui/react';
import { useControls } from '../../controls/context/ControlsContext.tsx';

/**
 * Always-visible kill switches.
 *
 * These sit outside the tabs on purpose: blackout is the control you reach for
 * when something is wrong on stage, and it must never be behind a tab switch.
 */
export function PanicBar() {
  const { state, updateState } = useControls();

  return (
    <Grid templateColumns="repeat(4, 1fr)" gap={2} px={3} pb={2}>
      <Button
        h="3.25rem"
        colorPalette="red"
        variant={state.blackout ? 'solid' : 'surface'}
        aria-pressed={state.blackout}
        onClick={() => updateState({ blackout: !state.blackout })}
      >
        Blackout
      </Button>
      <Button
        h="3.25rem"
        colorPalette="yellow"
        variant={state.freeze ? 'solid' : 'surface'}
        aria-pressed={state.freeze}
        onClick={() => updateState({ freeze: !state.freeze })}
      >
        Freeze
      </Button>
      <Button
        h="3.25rem"
        colorPalette="yellow"
        variant={state.strobe ? 'solid' : 'surface'}
        aria-pressed={state.strobe}
        onClick={() => {
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
        h="3.25rem"
        colorPalette="purple"
        onClick={() => updateState({ flashVersion: state.flashVersion + 1 })}
      >
        Flash
      </Button>
    </Grid>
  );
}
