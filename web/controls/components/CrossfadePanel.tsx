import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import { useControls } from "../context/ControlsContext.tsx";
import { Panel } from "./ui.tsx";
import { ParamSlider } from "./ParamSlider.tsx";

export function CrossfadePanel() {
	const { state, updateState } = useControls();

	return (
		<Panel area="hero" aria-label="Crossfade">
			<Flex align="center" justify="space-between" mb={3} gap={3}>
				<Badge colorPalette="cyan" px={3} py={1} borderRadius="md">
					A
				</Badge>
				<Box textAlign="center">
					<Text fontSize="sm" color="whiteAlpha.700">
						Crossfade
					</Text>
					<Text fontSize="2xl" fontWeight="bold" fontFamily="mono">
						{Math.round(state.crossfade * 100)}%
					</Text>
				</Box>
				<Badge colorPalette="pink" px={3} py={1} borderRadius="md">
					B
				</Badge>
			</Flex>
			<ParamSlider
				label=""
				value={state.crossfade}
				min={0}
				max={1}
				step={0.001}
				onChange={(crossfade) => updateState({ crossfade })}
				format={(v) => `${Math.round(v * 100)}%`}
			/>
			<Flex gap={2} mt={4}>
				<Button
					flex={1}
					size="lg"
					colorPalette="cyan"
					variant="surface"
					onClick={() => updateState({ crossfade: 0 })}
				>
					Deck A
				</Button>
				<Button
					flex={1}
					size="lg"
					variant="surface"
					onClick={() => updateState({ crossfade: 0.5 })}
				>
					Center
				</Button>
				<Button
					flex={1}
					size="lg"
					colorPalette="pink"
					variant="surface"
					onClick={() => updateState({ crossfade: 1 })}
				>
					Deck B
				</Button>
			</Flex>
		</Panel>
	);
}
