import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { ParamKnob } from '../../controls/components/ParamKnob.tsx';
import type { StudioKnobs } from '../lib/sketch-store.ts';

function fmt01(v: number) {
  return v.toFixed(2);
}

export function KnobPanel({
  knobs,
  onChange,
}: {
  knobs: StudioKnobs;
  onChange: (patch: Partial<StudioKnobs>) => void;
}) {
  return (
    <VStack align="stretch" gap={3}>
      <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
        PACK DRIVE
      </Text>
      <HStack gap={1} overflowX="auto" pb={1}>
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
      </HStack>

      <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
        PALETTE
      </Text>
      <HStack gap={1} overflowX="auto" pb={1}>
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
      </HStack>

      <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
        AUDIO SIM
      </Text>
      <HStack gap={1} overflowX="auto" pb={1} align="flex-start">
        <Box
          as="button"
          minW="82px"
          px={2}
          py={3}
          borderRadius="md"
          border="1px solid"
          borderColor={knobs.demoAudio ? '#6b8f71' : '#252a31'}
          bg={knobs.demoAudio ? 'rgba(107,143,113,0.18)' : '#0c0e12'}
          onClick={() => onChange({ demoAudio: !knobs.demoAudio })}
          cursor="pointer"
        >
          <Text fontSize="xs" fontWeight="600" color="whiteAlpha.800">
            Demo
          </Text>
          <Text
            fontSize="sm"
            fontWeight="700"
            color={knobs.demoAudio ? '#9ec49a' : 'whiteAlpha.600'}
          >
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
          <Text fontSize="xs" color="whiteAlpha.500" pt={3} maxW="220px">
            Demo pulses energy/bands. Toggle off for manual meters (−1 idle when Energy stays 0 and
            you can set energy via export defaults later).
          </Text>
        )}
      </HStack>
    </VStack>
  );
}
