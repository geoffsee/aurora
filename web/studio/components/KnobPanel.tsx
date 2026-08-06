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
        label="Hue"
        value={knobs.hue}
        min={0}
        max={1}
        step={0.01}
        format={fmt01}
        onChange={(hue) => onChange({ hue })}
      />
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
