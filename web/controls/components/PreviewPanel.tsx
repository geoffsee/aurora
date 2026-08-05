import { Box, Button, Flex, Link, Text } from '@chakra-ui/react';
import { useCallback, useMemo, useState } from 'react';
import { isGeoffseeGithubPages } from '../../../shared/static-hosting.ts';
import { loadPreviewEnabled, savePreviewEnabled } from '../lib/preview-preference.ts';
import { projectorPreviewUrl, projectorWindowUrl } from '../lib/projector-url.ts';
import { Panel } from './ui.tsx';

const glassButtonProps = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  w: '3rem',
  h: '3rem',
  borderWidth: '1px',
  borderColor: 'whiteAlpha.300',
  borderRadius: '0.75rem',
  bg: 'blackAlpha.500',
  backdropFilter: 'blur(14px)',
  color: 'whiteAlpha.900',
  flexShrink: 0,
  transition: 'background 0.15s ease, border-color 0.15s ease',
  _hover: {
    bg: 'whiteAlpha.200',
    borderColor: 'whiteAlpha.500',
    textDecoration: 'none',
  },
  _focusVisible: {
    outline: '2px solid',
    outlineColor: 'cyan.300',
    outlineOffset: '2px',
  },
} as const;

const previewFrameProps = {
  position: 'relative' as const,
  flex: '1',
  minH: { base: '14rem', md: '18rem', xl: '22rem' },
  borderRadius: 'lg',
  overflow: 'hidden' as const,
  borderWidth: '1px',
  borderColor: 'whiteAlpha.200',
  bg: 'black',
};

function ProjectorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Open projector</title>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="m7 4 1.5 3h7L17 4" />
      <path d="M5 7h14l-1 12H6L5 7Z" />
    </svg>
  );
}

export function PreviewPanel() {
  const src = useMemo(() => projectorPreviewUrl(), []);
  const projectorUrl = useMemo(() => projectorWindowUrl(), []);
  const onGeoffsee = isGeoffseeGithubPages();
  const [previewEnabled, setPreviewEnabled] = useState(() => loadPreviewEnabled());

  const setEnabled = useCallback((enabled: boolean) => {
    setPreviewEnabled(enabled);
    savePreviewEnabled(enabled);
  }, []);

  return (
    <Panel area="prev" aria-label="Visualization preview">
      <Flex align="stretch" gap={3} h="100%">
        <Box {...previewFrameProps}>
          {previewEnabled ? (
            <>
              <iframe
                src={src}
                title="aurora visualization preview"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                loading="lazy"
              />
              <Button
                size="sm"
                variant="surface"
                position="absolute"
                top={2}
                right={2}
                zIndex={1}
                onClick={() => setEnabled(false)}
                aria-label="Disable preview"
              >
                Disable preview
              </Button>
            </>
          ) : (
            <Flex
              position="absolute"
              inset={0}
              direction="column"
              align="center"
              justify="center"
              gap={3}
              px={4}
              textAlign="center"
            >
              <Text color="whiteAlpha.700" fontSize="sm" m={0}>
                Embedded preview is off to save memory. Enable only when you need a live view here.
              </Text>
              <Button
                size="md"
                colorPalette="cyan"
                onClick={() => setEnabled(true)}
                aria-label="Enable preview"
              >
                Enable preview
              </Button>
            </Flex>
          )}
        </Box>
        {onGeoffsee ? (
          <Link
            {...glassButtonProps}
            href={projectorUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open projector in new window"
            aria-label="Open projector in new window"
            alignSelf="flex-start"
          >
            <ProjectorIcon />
          </Link>
        ) : null}
      </Flex>
    </Panel>
  );
}
