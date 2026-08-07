import { Box, HStack, Text } from '@chakra-ui/react';
import { ParamKnob } from '../../controls/components/ParamKnob.tsx';
import type { StudioKnobs } from '../lib/sketch-store.ts';

function fmt01(v: number) {
  return v.toFixed(2);
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text
      as="span"
      flex="0 0 auto"
      fontSize="9px"
      fontWeight="700"
      letterSpacing="0.1em"
      color="whiteAlpha.500"
      writingMode="vertical-rl"
      transform="rotate(180deg)"
      lineHeight="1"
      px={1}
      alignSelf="center"
      userSelect="none"
    >
      {children}
    </Text>
  );
}

function GroupDivider() {
  return (
    <Box flex="0 0 auto" w="1px" h="56px" alignSelf="center" bg="#252a31" mx={1} aria-hidden />
  );
}

function hueToHex(h: number, s = 0.8, l = 0.5): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) {
    r = c;
    g = x;
    b = 0;
  } else if (sector === 1) {
    r = x;
    g = c;
    b = 0;
  } else if (sector === 2) {
    r = 0;
    g = c;
    b = x;
  } else if (sector === 3) {
    r = 0;
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHue(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = h / 6;
  return ((h % 1) + 1) % 1;
}

export function KnobPanel({
  knobs,
  onChange,
}: {
  knobs: StudioKnobs;
  onChange: (patch: Partial<StudioKnobs>) => void;
}) {
  return (
    <HStack
      className="studio-knob-row"
      gap={0}
      align="center"
      flexWrap="nowrap"
      overflowX="auto"
      overflowY="hidden"
      w="100%"
      minH="0"
      py={0}
      css={{
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { height: '6px' },
        '&::-webkit-scrollbar-thumb': {
          background: '#3a4048',
          borderRadius: '3px',
        },
      }}
    >
      <GroupLabel>DRIVE</GroupLabel>
      <ParamKnob
        label="Intensity"
        value={knobs.intensity}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(intensity) => onChange({ intensity })}
      />
      <ParamKnob
        label="Depth"
        value={knobs.depth}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(depth) => onChange({ depth })}
      />
      <ParamKnob
        label="Feedback"
        value={knobs.feedback}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(feedback) => onChange({ feedback })}
      />
      <ParamKnob
        label="Speed"
        value={knobs.speed}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(speed) => onChange({ speed })}
      />

      <GroupDivider />
      <GroupLabel>PALETTE</GroupLabel>
      <ParamKnob
        label="Color"
        value={knobs.hue}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        accent={hueToHex(knobs.hue, knobs.sat, 0.55)}
        onChange={(hue) => onChange({ hue })}
      />
      <Box
        flex="0 0 auto"
        position="relative"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        alignSelf="center"
        title="Pick color"
        mx={1}
      >
        <input
          type="color"
          value={hueToHex(knobs.hue, knobs.sat, 0.5)}
          onChange={(e) => onChange({ hue: hexToHue(e.target.value) })}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '2px solid #3a4048',
            cursor: 'pointer',
            padding: 0,
            background: 'none',
          }}
        />
      </Box>
      <ParamKnob
        label="Sat"
        value={knobs.sat}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(sat) => onChange({ sat })}
      />
      <ParamKnob
        label="Bright"
        value={knobs.bright}
        min={0}
        max={1.5}
        step={0.01}
        format={fmt01}
        onChange={(bright) => onChange({ bright })}
      />
      <ParamKnob
        label="Pulse"
        value={knobs.pulse}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(pulse) => onChange({ pulse })}
      />
      <ParamKnob
        label="Alpha"
        value={knobs.alpha}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(alpha) => onChange({ alpha })}
      />

      <GroupDivider />
      <GroupLabel>AUDIO</GroupLabel>
      <Box
        as="button"
        flex="0 0 auto"
        minW="72px"
        px={2}
        py={2}
        borderRadius="md"
        border="1px solid"
        borderColor={knobs.demoAudio ? '#6b8f71' : '#252a31'}
        bg={knobs.demoAudio ? 'rgba(107,143,113,0.18)' : '#0c0e12'}
        onClick={() => onChange({ demoAudio: !knobs.demoAudio })}
        cursor="pointer"
        alignSelf="center"
      >
        <Text fontSize="xs" fontWeight="600" color="whiteAlpha.800">
          Demo
        </Text>
        <Text fontSize="sm" fontWeight="700" color={knobs.demoAudio ? '#9ec49a' : 'whiteAlpha.600'}>
          {knobs.demoAudio ? 'ON' : 'OFF'}
        </Text>
      </Box>
      {!knobs.demoAudio ? (
        <>
          <ParamKnob
            label="Energy"
            value={knobs.energy < 0 ? 0 : knobs.energy}
            min={0}
            max={1}
            step={0.01}
            format={fmt01}
            onChange={(energy) => onChange({ energy })}
          />
          <ParamKnob
            label="Bass"
            value={knobs.bass}
            min={0}
            max={1}
            step={0.01}
            format={fmt01}
            onChange={(bass) => onChange({ bass })}
          />
          <ParamKnob
            label="Mid"
            value={knobs.mid}
            min={0}
            max={1}
            step={0.01}
            format={fmt01}
            onChange={(mid) => onChange({ mid })}
          />
          <ParamKnob
            label="High"
            value={knobs.high}
            min={0}
            max={1}
            step={0.01}
            format={fmt01}
            onChange={(high) => onChange({ high })}
          />
        </>
      ) : (
        <Text
          flex="0 0 auto"
          fontSize="xs"
          color="whiteAlpha.500"
          maxW="200px"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
          alignSelf="center"
          px={2}
          title="Demo pulses energy/bands. Toggle off for manual meters."
        >
          Demo pulses energy/bands
        </Text>
      )}
    </HStack>
  );
}
