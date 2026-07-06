import { Box, Flex, Link } from "@chakra-ui/react";
import { useMemo } from "react";
import { isGeoffseeGithubPages } from "../../../shared/static-hosting.ts";
import { projectorPreviewUrl, projectorWindowUrl } from "../lib/projector-url.ts";
import { Panel } from "./ui.tsx";

const glassButtonProps = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	w: "2.75rem",
	h: "2.75rem",
	borderWidth: "1px",
	borderColor: "whiteAlpha.300",
	borderRadius: "0.75rem",
	bg: "blackAlpha.500",
	backdropFilter: "blur(14px)",
	color: "whiteAlpha.900",
	flexShrink: 0,
	transition: "background 0.15s ease, border-color 0.15s ease",
	_hover: {
		bg: "whiteAlpha.200",
		borderColor: "whiteAlpha.500",
		textDecoration: "none",
	},
	_focusVisible: {
		outline: "2px solid",
		outlineColor: "cyan.300",
		outlineOffset: "2px",
	},
} as const;

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

	return (
		<Panel area="prev" aria-label="Visualization preview">
			<Flex align="flex-start" gap={2}>
				<Box
					position="relative"
					width="25%"
					minW="10rem"
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
				{onGeoffsee ? (
					<Link
						{...glassButtonProps}
						href={projectorUrl}
						target="_blank"
						rel="noopener noreferrer"
						title="Open projector in new window"
						aria-label="Open projector in new window"
					>
						<ProjectorIcon />
					</Link>
				) : null}
			</Flex>
		</Panel>
	);
}
