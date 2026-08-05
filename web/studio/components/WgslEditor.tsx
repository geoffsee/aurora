import { Box, Text } from '@chakra-ui/react';

export function WgslEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Box h="100%" display="flex" flexDirection="column" gap={2}>
      <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
        WGSL · pack-v1
      </Text>
      <textarea
        className="studio-editor"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Tab inserts two spaces instead of leaving the field.
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const next = `${value.slice(0, start)}  ${value.slice(end)}`;
            onChange(next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = start + 2;
            });
          }
        }}
        aria-label="WGSL source"
      />
      <Text fontSize="11px" color="whiteAlpha.500">
        Authoring form uses @group(0). Export remaps to Bevy @group(2) + VertexOutput on import when
        needed.
      </Text>
    </Box>
  );
}
