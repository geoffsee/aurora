import { Box, Slider, Text } from "@chakra-ui/react";
import { memo, useEffect, useMemo, useState } from "react";

export const ParamSlider = memo(function ParamSlider({
	label,
	value,
	min,
	max,
	step,
	onChange,
	format,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	format?: (value: number) => string;
}) {
	const [localValue, setLocalValue] = useState(value);
	const [isDragging, setIsDragging] = useState(false);

	// Stabilize the array passed to the underlying slider. A fresh array on every
	// render (even with identical numbers) can make the Ark/Zag slider treat the
	// controlled value as changed on every parent re-render. When audio is
	// flowing the whole controls tree re-renders often (osc updates etc); a
	// stable array ref stops spurious thumb jumps or re-inits.
	const sliderValue = useMemo(() => [localValue], [localValue]);

	// Adopt external updates (from automation, VST, audio router, clock, echoes)
	// only when idle. Ignore microscopic float noise from JSON round-trips so
	// the thumb doesn't twitch at rest. We also avoid adopting right after a
	// drag if a concurrent writer yanks the state; the onValueChangeEnd re-assert
	// below ensures the user's final position sticks.
	useEffect(() => {
		if (!isDragging && Math.abs(value - localValue) > 1e-6) {
			setLocalValue(value);
		}
	}, [value, isDragging, localValue]);

	return (
		<Box>
			<Box display="flex" justifyContent="space-between" mb={2}>
				<Text fontWeight="semibold">{label}</Text>
				<Text fontFamily="mono" fontSize="sm" color="cyan.200">
					{format ? format(localValue) : localValue.toFixed(2)}
				</Text>
			</Box>
			<Slider.Root
				value={sliderValue}
				min={min}
				max={max}
				step={step}
				onValueChange={(details) => {
					const next = details.value[0] ?? localValue;
					setLocalValue(next);
					if (!isDragging) setIsDragging(true);
					onChange(next);
				}}
				onValueChangeEnd={() => {
					setIsDragging(false);
					// Re-assert the final local value. A driver or echo may have
					// overwritten the parent state during the gesture; this makes
					// the committed user position win on release.
					onChange(localValue);
				}}
			>
				<Slider.Control>
					<Slider.Track bg="whiteAlpha.200" h="10px" borderRadius="full">
						<Slider.Range bg="cyan.400" />
					</Slider.Track>
					<Slider.Thumb
						index={0}
						boxSize="22px"
						bg="white"
						borderWidth="2px"
						borderColor="cyan.300"
					>
						<Slider.HiddenInput />
					</Slider.Thumb>
				</Slider.Control>
			</Slider.Root>
		</Box>
	);
});
