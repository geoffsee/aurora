import { Box, Link, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { projectorPreviewUrl } from "../lib/projector-url.ts";
import { Panel, SectionTitle } from "./ui.tsx";

export function PreviewPanel() {
	const src = useMemo(() => projectorPreviewUrl(), []);

	return (
		<Panel area="prev" aria-label="Visualization preview">
			<SectionTitle
				title="Output"
				badge={
					<Link href={src} target="_blank" rel="noopener noreferrer" fontSize="sm">
						Open projector
					</Link>
				}
			/>
			<Box
				position="relative"
				width="100%"
				borderRadius="md"
				overflow="hidden"
				borderWidth="1px"
				borderColor="whiteAlpha.200"
				bg="black"
				style={{ aspectRatio: "16 / 9" }}
			>
				<iframe
					src={src}
					title="aurora visualization preview"
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						border: "none",
					}}
					loading="lazy"
				/>
			</Box>
			<Text mt={2} fontSize="xs" color="whiteAlpha.600">
				Live preview of the projector page — same feed the audience sees.
			</Text>
		</Panel>
	);
}
