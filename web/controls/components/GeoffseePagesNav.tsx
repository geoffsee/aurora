import { Box, Link } from "@chakra-ui/react";
import {
	geoffseePagesProjectorUrl,
	isGeoffseeGithubPages,
} from "../../../shared/static-hosting.ts";

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

function ControlsIcon() {
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
			<line x1="4" x2="4" y1="21" y2="14" />
			<line x1="4" x2="4" y1="10" y2="3" />
			<line x1="12" x2="12" y1="21" y2="12" />
			<line x1="12" x2="12" y1="8" y2="3" />
			<line x1="20" x2="20" y1="21" y2="16" />
			<line x1="20" x2="20" y1="12" y2="3" />
			<line x1="1" x2="7" y1="14" y2="14" />
			<line x1="9" x2="15" y1="8" y2="8" />
			<line x1="17" x2="23" y1="16" y2="16" />
		</svg>
	);
}

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

export function GeoffseePagesNav() {
	if (!isGeoffseeGithubPages()) return null;

	return (
		<Box
			as="nav"
			position="fixed"
			left={4}
			bottom={4}
			zIndex={20}
			display="flex"
			gap={2}
			aria-label="Site navigation"
		>
			<Link
				{...glassButtonProps}
				href={geoffseePagesProjectorUrl()}
				title="Open projector output"
				aria-label="Open projector output"
			>
				<ProjectorIcon />
			</Link>
			<Box
				{...glassButtonProps}
				bg="whiteAlpha.200"
				borderColor="cyan.300"
				title="Control panel (static preview — run locally for live Ableton/VST)"
				aria-label="Control panel"
				aria-current="page"
			>
				<ControlsIcon />
			</Box>
		</Box>
	);
}
