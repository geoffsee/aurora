import { Box, Text } from '@chakra-ui/react';
import { memo, useEffect, useRef, useState } from 'react';

const START_ANGLE = -135;
const SWEEP_ANGLE = 270;
const CENTER = 48;
const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = (SWEEP_ANGLE / 360) * CIRCUMFERENCE;

const DRAG_PIXELS_FOR_FULL_RANGE = 160;

export function valueFromDrag(
  startValue: number,
  deltaY: number,
  min: number,
  max: number,
  step: number,
  pixelsForFullRange = DRAG_PIXELS_FOR_FULL_RANGE,
) {
  const range = Math.max(max - min, Number.EPSILON);
  const raw = startValue - (deltaY / pixelsForFullRange) * range;
  const stepped = Math.round((raw - min) / step) * step + min;
  return Math.max(min, Math.min(max, Number(stepped.toFixed(10))));
}

export const ParamKnob = memo(function ParamKnob({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  /** Optional progress-arc color (e.g. live palette hex for Color knobs). */
  accent?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const dragging = dragRef.current !== null;
  const range = Math.max(max - min, Number.EPSILON);
  const percent = Math.max(0, Math.min(1, (localValue - min) / range));
  const pointerAngle = START_ANGLE + percent * SWEEP_ANGLE;
  const progressLength = ARC_LENGTH * percent;

  useEffect(() => {
    if (!dragging && Math.abs(value - localValue) > 1e-6) setLocalValue(value);
  }, [value, localValue, dragging]);

  const progressStroke = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#998862';

  return (
    <Box minW="82px" flex="0 0 auto" textAlign="center">
      <Text
        fontSize="xs"
        fontWeight="600"
        letterSpacing="0.025em"
        color="whiteAlpha.800"
        mb={1}
        whiteSpace="nowrap"
      >
        {label}
      </Text>
      <Box
        position="relative"
        mx="auto"
        boxSize="76px"
        borderRadius="full"
        bg="#090b0f"
        border="1px solid"
        borderColor="#252a31"
        boxShadow="inset 2px 2px 5px rgba(0,0,0,.9), inset -1px -1px 3px rgba(255,255,255,.08), 0 3px 8px rgba(0,0,0,.45)"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={localValue}
        aria-valuetext={format ? format(localValue) : String(localValue)}
        cursor="ns-resize"
        touchAction="none"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { startY: event.clientY, startValue: localValue };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const next = valueFromDrag(drag.startValue, event.clientY - drag.startY, min, max, step);
          setLocalValue(next);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          // Commit the final value only on release — avoids bridge round-trip
          // overwriting the local position mid-drag.
          if (drag) {
            const finalValue = valueFromDrag(
              drag.startValue,
              event.clientY - drag.startY,
              min,
              max,
              step,
            );
            onChange(finalValue);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          if (
            event.key !== 'ArrowUp' &&
            event.key !== 'ArrowDown' &&
            event.key !== 'Home' &&
            event.key !== 'End'
          )
            return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? min
              : event.key === 'End'
                ? max
                : valueFromDrag(localValue, event.key === 'ArrowUp' ? -1 : 1, min, max, step, 1);
          setLocalValue(next);
          onChange(next);
        }}
      >
        <svg
          viewBox="0 0 96 96"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#171b20"
            strokeWidth="7"
            strokeLinecap="butt"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            transform={`rotate(${START_ANGLE} ${CENTER} ${CENTER})`}
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={progressStroke}
            strokeWidth="7"
            strokeLinecap="butt"
            strokeDasharray={`${progressLength} ${CIRCUMFERENCE}`}
            transform={`rotate(${START_ANGLE} ${CENTER} ${CENTER})`}
          />
          {Array.from({ length: 5 }, (_, index) => {
            const deg = START_ANGLE + (index / 4) * SWEEP_ANGLE;
            const angle = (deg * Math.PI) / 180;
            const outer = RADIUS + 7;
            const inner = RADIUS + 3;
            return (
              <line
                key={`tick-${deg}`}
                x1={CENTER + Math.cos(angle) * inner}
                y1={CENTER + Math.sin(angle) * inner}
                x2={CENTER + Math.cos(angle) * outer}
                y2={CENTER + Math.sin(angle) * outer}
                stroke="#dce3e8"
                strokeWidth={index === 0 || index === 4 ? 1.8 : 1.4}
                strokeLinecap="round"
                opacity={0.9}
              />
            );
          })}
          <line
            x1={CENTER}
            y1={CENTER - 6}
            x2={CENTER}
            y2={CENTER - 27}
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform={`rotate(${pointerAngle} ${CENTER} ${CENTER})`}
          />
          <circle cx={CENTER} cy={CENTER} r="3" fill="#f7fafc" />
        </svg>
        <input
          type="range"
          value={localValue}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            setLocalValue(next);
            onChange(next);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        <Text
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          pointerEvents="none"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="700"
          color="white"
          textShadow="0 1px 2px rgba(0,0,0,.9)"
        >
          {format ? format(localValue) : localValue.toFixed(2)}
        </Text>
      </Box>
    </Box>
  );
});
