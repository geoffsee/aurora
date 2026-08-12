import { Box, Flex, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { haptic } from '../lib/haptics.ts';

/**
 * Full-width slider sized for a thumb rather than a mouse.
 *
 * A native `input[type=range]` is deliberate: it gets platform touch handling,
 * VoiceOver/TalkBack support, and drag-outside-the-track behaviour for free —
 * all of which a custom pointer-event control has to reimplement badly.
 *
 * The scrubbing state exists because a finger covers the thing it is moving.
 * While a drag is live the readout grows and takes the accent colour, so the
 * value stays legible above the thumb instead of under it.
 */
export function TouchSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  trackBackground,
  accent = '#7fd1e0',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Formatted value shown beside the label. */
  display: string;
  onChange: (value: number) => void;
  trackBackground?: string;
  accent?: string;
}) {
  const [scrubbing, setScrubbing] = useState(false);

  return (
    <Box>
      <Flex align="baseline" justify="space-between" mb={1} gap={2}>
        <Text fontSize="sm" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="wider">
          {label}
        </Text>
        <Text
          fontSize={scrubbing ? '2xl' : 'lg'}
          fontWeight="bold"
          fontFamily="mono"
          lineHeight="1"
          color={scrubbing ? accent : 'gray.50'}
          transition="font-size 90ms ease-out, color 90ms ease-out"
        >
          {display}
        </Text>
      </Flex>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        // Pointer events cover touch, pen, and mouse in one pair of handlers.
        // One haptic on grab and none during the drag: buzzing every frame is
        // unpleasant and eats the battery the set depends on.
        onPointerDown={() => {
          setScrubbing(true);
          haptic();
        }}
        onPointerUp={() => setScrubbing(false)}
        onPointerCancel={() => setScrubbing(false)}
        onBlur={() => setScrubbing(false)}
        style={{
          width: '100%',
          height: '2.75rem',
          borderRadius: '999px',
          background: trackBackground ?? 'rgba(255,255,255,0.14)',
          accentColor: accent,
          outline: 'none',
          margin: 0,
          cursor: 'pointer',
          // Visible grab state: the track picks up a ring under the finger.
          boxShadow: scrubbing ? `0 0 0 2px ${accent}66` : 'none',
          transition: 'box-shadow 90ms ease-out',
        }}
      />
    </Box>
  );
}
