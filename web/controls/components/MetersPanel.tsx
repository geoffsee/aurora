import { Box, Flex, Progress, Text } from "@chakra-ui/react";
import { useControls } from "../context/ControlsContext.tsx";
import { Panel } from "./ui.tsx";

const METERS = [
	["energy", "Energy"],
	["bass", "Bass"],
	["mid", "Mid"],
	["high", "High"],
	["deckA", "Deck A"],
	["deckB", "Deck B"],
] as const;

export function MetersPanel() {
	const { osc } = useControls();

	return (
		<Panel area="mete">
			<Flex direction="column" gap={3}>
				{METERS.map(([key, label]) => (
					<Box key={key}>
						<Flex justify="space-between" mb={1}>
							<Text fontWeight="semibold">{label}</Text>
							<Text fontFamily="mono" fontSize="sm">
								{osc[key].toFixed(2)}
							</Text>
						</Flex>
						<Progress.Root value={osc[key] * 100} max={100} size="lg">
							<Progress.Track bg="whiteAlpha.200" borderRadius="full">
								<Progress.Range bg="cyan.400" />
							</Progress.Track>
						</Progress.Root>
					</Box>
				))}
			</Flex>
		</Panel>
	);
}
