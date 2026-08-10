import { Box, Flex, Text } from '@chakra-ui/react';

/**
 * Full-width slider sized for a thumb rather than a mouse.
 *
 * A native `input[type=range]` is deliberate: it gets platform touch handling,
 * VoiceOver/TalkBack support, and drag-outside-the-track behaviour for free —
 * all of which a custom pointer-event control has to reimplement badly.
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
  return (
    <Box>
      <Flex align="baseline" justify="space-between" mb={1} gap={2}>
        <Text fontSize="sm" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="wider">
          {label}
        </Text>
        <Text fontSize="lg" fontWeight="bold" fontFamily="mono" lineHeight="1">
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
        style={{
          width: '100%',
          height: '2.75rem',
          borderRadius: '999px',
          background: trackBackground ?? 'rgba(255,255,255,0.14)',
          accentColor: accent,
          outline: 'none',
          margin: 0,
          cursor: 'pointer',
        }}
      />
    </Box>
  );
}
