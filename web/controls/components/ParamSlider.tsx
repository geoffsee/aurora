import { Box, Slider, Text } from "@chakra-ui/react";

export function ParamSlider({
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
	return (
		<Box>
			<Box display="flex" justifyContent="space-between" mb={2}>
				<Text fontWeight="semibold">{label}</Text>
				<Text fontFamily="mono" fontSize="sm" color="cyan.200">
					{format ? format(value) : value.toFixed(2)}
				</Text>
			</Box>
			<Slider.Root
				value={[value]}
				min={min}
				max={max}
				step={step}
				onValueChange={(details) => onChange(details.value[0] ?? value)}
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
}
