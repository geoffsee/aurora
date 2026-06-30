import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useControls } from "../context/ControlsContext.tsx";

export function ErrorBanners() {
	const { banners, dismissErrorBanner } = useControls();

	if (!banners.length) return null;

	return (
		<Box
			position="fixed"
			right={4}
			bottom={4}
			zIndex={1000}
			display="flex"
			flexDirection="column"
			gap={2}
			maxW="420px"
			role="alert"
			aria-live="assertive"
			aria-atomic="false"
		>
			{banners.map((banner) => {
				const isWarn =
					banner.type === "warn" || banner.type === "disconnect";
				return (
					<Flex
						key={banner.id}
						align="start"
						justify="space-between"
						gap={3}
						p={3}
						borderRadius="md"
						bg={isWarn ? "orange.900" : "red.900"}
						borderWidth="1px"
						borderColor={isWarn ? "orange.500" : "red.500"}
					>
						<Box>
							<Text fontSize="sm">{banner.description}</Text>
							<Text fontSize="xs" color="whiteAlpha.700" mt={1}>
								{new Date(banner.createdAt).toLocaleTimeString()}
							</Text>
						</Box>
						<Button
							size="sm"
							variant="ghost"
							aria-label="Dismiss"
							onClick={() => dismissErrorBanner(banner.id)}
						>
							×
						</Button>
					</Flex>
				);
			})}
		</Box>
	);
}
