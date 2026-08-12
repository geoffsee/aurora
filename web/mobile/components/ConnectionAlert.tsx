import { Box, Text } from '@chakra-ui/react';
import {
  describeInstanceTarget,
  isRemoteInstance,
  loadInstanceTarget,
} from '../../../shared/instance-target.ts';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import { describeConnectionAlert } from '../lib/status.ts';

/**
 * Full-width "this phone is not driving anything" strip.
 *
 * The header pills already carry the state, but a grey chip at arm's length on
 * a bright stage is indistinguishable from a live one. This is the version you
 * cannot miss, and it disappears the moment the bridge is live.
 */
export function ConnectionAlert() {
  const { bridgeStatus } = useControls();
  const target = loadInstanceTarget();
  const alert = describeConnectionAlert({
    status: bridgeStatus,
    target: describeInstanceTarget(target),
    remote: isRemoteInstance(target),
  });

  if (!alert) return null;
  const error = alert.tone === 'error';

  return (
    <Box
      role="alert"
      aria-live="assertive"
      px={3}
      py={2}
      bg={error ? 'red.900' : 'orange.900'}
      borderBottomWidth="1px"
      borderColor={error ? 'red.500' : 'orange.500'}
    >
      <Text fontSize="sm" fontWeight="bold" m={0}>
        {alert.title}
      </Text>
      <Text fontSize="xs" color="whiteAlpha.800" mt={0.5}>
        {alert.detail}
      </Text>
    </Box>
  );
}
