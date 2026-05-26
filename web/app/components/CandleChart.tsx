"use client";

import {
  Chart as ChartJS,
  Legend,
  LinearScale,
  TimeScale,
  Tooltip,
} from "chart.js";
import {
  CandlestickController,
  CandlestickElement,
} from "chartjs-chart-financial";
import "chartjs-adapter-date-fns";
import zoomPlugin from "chartjs-plugin-zoom";
import { Chart } from "react-chartjs-2";
import { useEffect, useRef, useState } from "react";

ChartJS.register(
  LinearScale,
  TimeScale,
  CandlestickController,
  CandlestickElement,
  Tooltip,
  Legend,
  zoomPlugin
);

type Candle = {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

type LimitLine = {
  price: number;
  quantity: string;
  notional: number;
  side: "bid" | "ask";
  strength: number;
};

type Props = {
  symbol: string;
  candles: Candle[];
  heightClass?: string;
  timeframe?: string;
  theme?: "dark" | "light";
  compact?: boolean;
  showTools?: boolean;
  timeframeControls?: {
    active: string;
    visible: string[];
    canShiftLeft: boolean;
    canShiftRight: boolean;
    onChange: (value: string) => void;
    onShift: (direction: -1 | 1) => void;
  };
  drawings?: Drawing[];
  limitLines?: LimitLine[];
  onDrawingsChange?: (drawings: Drawing[]) => void;
  onNeedOlderCandles?: (oldestTime: number) => void;
};

type XRange = {
  symbol: string;
  timeframe: string;
  min: number;
  max: number;
};

type YRange = XRange;

type ZoomEvent = {
  chart: ChartJS;
};

type YScaleDrag = {
  center: number;
  range: number;
  startY: number;
};

type DrawingTool =
  | "cursor"
  | "trend"
  | "horizontal"
  | "vertical"
  | "rectangle"
  | "arrow-right"
  | "arrow-up"
  | "arrow-left"
  | "arrow-down"
  | "trajectory"
  | "ruler"
  | "triangle";

type DrawingPoint = {
  x: number;
  y: number;
};

type Drawing = {
  id: string;
  tool: Exclude<DrawingTool, "cursor">;
  start: DrawingPoint;
  end: DrawingPoint;
  color?: string;
  groupId?: string;
};

export type ChartDrawing = Drawing;

type DragDrawingTool = Extract<
  DrawingTool,
  | "trend"
  | "rectangle"
  | "ruler"
  | "triangle"
  | "arrow-right"
  | "arrow-up"
  | "arrow-left"
  | "arrow-down"
>;

type DrawingTarget = DrawingPoint & {
  pixelX: number;
  pixelY: number;
  chartLeft: number;
  chartRight: number;
  chartTop: number;
  chartBottom: number;
};

type DrawingPanelItem =
  | { kind: "tool"; tool: DrawingTool; title: string }
  | { kind: "clear"; id: "clear"; title: string };

type DrawingColorMenu = {
  drawingId: string;
  tool: Exclude<DrawingTool, "cursor">;
  x: number;
  y: number;
};

const DRAWING_PANEL_ITEMS: DrawingPanelItem[] = [
  { kind: "tool", tool: "cursor", title: "Cursor" },
  { kind: "clear", id: "clear", title: "Clear drawings" },
  { kind: "tool", tool: "rectangle", title: "Rectangle" },
  { kind: "tool", tool: "trend", title: "Trend line" },
  { kind: "tool", tool: "horizontal", title: "Horizontal line" },
  { kind: "tool", tool: "vertical", title: "Vertical line" },
  { kind: "tool", tool: "arrow-right", title: "Arrow right" },
  { kind: "tool", tool: "arrow-up", title: "Arrow up" },
  { kind: "tool", tool: "arrow-left", title: "Arrow left" },
  { kind: "tool", tool: "arrow-down", title: "Arrow down" },
  { kind: "tool", tool: "trajectory", title: "Trajectory" },
];
const DRAWING_TABLE_ITEMS: DrawingPanelItem[] = [
  { kind: "tool", tool: "cursor", title: "Cursor" },
  { kind: "clear", id: "clear", title: "Clear drawings" },
  { kind: "tool", tool: "rectangle", title: "Rectangle" },
  { kind: "tool", tool: "arrow-right", title: "Arrow right" },
  { kind: "tool", tool: "arrow-up", title: "Arrow up" },
  { kind: "tool", tool: "trend", title: "Trend line" },
  { kind: "tool", tool: "arrow-left", title: "Arrow left" },
  { kind: "tool", tool: "arrow-down", title: "Arrow down" },
  { kind: "tool", tool: "trajectory", title: "Trajectory" },
  { kind: "tool", tool: "vertical", title: "Vertical line" },
  { kind: "tool", tool: "horizontal", title: "Horizontal line" },
  { kind: "tool", tool: "ruler", title: "Ruler - hold Shift" },
];
const DRAWING_TOOL_VALUES: DrawingTool[] = [
  "cursor",
  "trend",
  "horizontal",
  "vertical",
  "rectangle",
  "arrow-right",
  "arrow-up",
  "arrow-left",
  "arrow-down",
  "trajectory",
  "ruler",
  "triangle",
];
const DRAWING_WINDOW_SIZE = 5;
const DRAWING_FAVORITES_STORAGE_KEY = "scriner-drawing-tool-favorites-v1";
const DRAWING_LINE_COLOR = "#d15bff";
const DRAWING_ACTIVE_COLOR = "#ff74d6";
const DRAWING_FILL_COLOR = "rgba(255, 79, 216, 0.16)";
const CHART_FONT_FAMILY = "Helvetica, Arial, sans-serif";
const DRAWING_RAINBOW_COLORS = [
  "#ff1744",
  "#ff9100",
  "#ffea00",
  "#00e676",
  "#00e5ff",
  "#2979ff",
  "#651fff",
  "#d500f9",
];
const RULER_ICON_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAViSURBVHhe7Zzfb1RFFMf76J/AgzE8aPTFH4kan0x4MBF9MWJCjGA0IgUSiBoSDI2CCAbTRG1IsYFoWxuxYo1FrDZEGo0/aGxjCrFNaQ1di2C7PwqulAJrd45zZu+0s7Pn7r2Lu33p95OchOyd3dt8zt1zZu/coQ4AAAAAAAAAAAAAAAAAAAAAAAAAAADwv1Ap9bSaUW0qo4Z0jOroVGm1OTgMagVdppVadi9liKTQSeinNN0VDAfVhJJ0nxZ8WRLvhhmjxwZvA9VAkj/7K9Glb4lmThBdGdDiU0hCTfDlq2miRFeWJjqu0nQXLUSmt3CskACia7/nr8yeVquDjwE3gyR/4miW1q7cSuvveIUGm86XJCE/RXTjHNH1s0Rzo/lZNakeCD4OVIIknwVf6MzRxnsaaM2tm0qSMKUj1aOv/hGdgPHCe1COboIw+Vb0yOFMSRJYPgcfT+sk5C8U3mvejyTEJ0q+lIRn79xOZ95PFo59Xjju9gTzORmVoATdEpwGSMSVb4OTUH/va7T94UZ6+4lW+u1Quuh4SRJm1HvBqYCPJH/o8Hn6ZOtJU/ddsTa45Iy1/k3vrv2Ydj3aTBvv3klnmqeKxmR/chKQUVPB6YBL2JW/57EWU2Jef+RASRLcmj/e/g9te/BNM/bQc91F4zjcb4E+14rgtIApV3Z6GgaMVD8Jrnxb88dbs/Thhq9MWTKvOzHvNGQ+X3BqUE6+jWM7ThUl4U+dBF9+uUh9uShfl6BraMQBceTbsEl46rYtdHB9F108Oh9LPscN/Xtg4Rxp1R+cfnlTiXwbx17tN7Md7gsfbDhOF0Masxtzw4vyTaRpVfAnLF8k+QMHJ+ilh/bRR5t7RZG25v+w/6yZ7ay7/WWxMbvhy8cUVBN25bt1nhupK9JvuD07fynqCVISBPltwZ+wfIkqO41r2kuS4Mu3Y/3G7CYB8gXi1vyiJLzYI8q34Sahed1n5jXIF6i04XISeLbDDffrhsGysx1OAt+M4x9fkC8gyef7+f5iiht81bfVf2NmO9xwOzbJjdkNyBeQ5E8fz5krVlpM4XBr/pFtJ81sh0uMf3/HDcgXKFd2tty/20iVFlP8ms+1naenfJvBjnMD8gWian7UYkq5mu8G5AvEbbhRiylRAfkCceXbiFpMCQvIF5Dkn2oaM7cWwmY8XHL8xRSpMbsB+QJhV75dTOEm6ifBrfnuYkrY7IgD8gXKlZ0f94+Z53f8JEgNV2rM5ngQkC8Qp+b37R0uSsI5nQRfvg0/CXbuD/kClTRcmwS+vdD4ZDtNHrkeOttxk8C3GSBfoBL5Nvr2jtCOVe+YvnDgmU8p0TEnjuPgUsXlC/IFJPlxF1MGmyZpz+Mt5vYCJ0IaawPyBXjjg3Tln9g1ZEoGR9RiyvdvjZpyxGXGHecG5IegMuo7X76VVsliCt/XCfttAPkhaBnPu2J4U4Qvr5LFFCkgvwz66u+2YnhniiSQo5LFFDcgPwLzZHEgp9yMh696LKbUALf58rP3kki35ruLKTyl9MfagPyY6G/AwtbQ7M+lIl35tuzwOi0/sYDFlCqgp6BvLIjSMyB+3tKKlORHBeRXCD/Q6vaBf/8gSnZD/pKikmq1Ky6X0EK/CMRC/tKgpZnfA7wPl7eCXj2txepvgiTbD8ivEvMp9YLdh8tbQXP631yOJOk2IL/KzA2r3XYfLgu1PQHyl5D5aap3xeb/IrrUtyieZ0ru5ggOyK8yWmrRPSIO3o+Vmyh+jQPya4T5z5OcX8pS6ClsSzAc1AJK0gotuVMQP8rT12AYWAp41Yz3YmE3IgAAAAAAAAAAAAAAAAAAAAAAAACqQF3df0MiLg1i7rV+AAAAAElFTkSuQmCC";
const LOGO_COLOR = "#c8b6dc";
const CURRENT_PRICE_LINE_COLOR = LOGO_COLOR;
const CHART_BACKGROUND_COLOR = "#111116";
const CHART_GRID_COLOR = "rgba(255,255,255,0.06)";
const CHART_GRID_STRONG_COLOR = "rgba(255,255,255,0.095)";
const CANDLE_UP_COLOR = "#089981";
const CANDLE_DOWN_COLOR = "#f23645";
const CANDLE_UNCHANGED_COLOR = "#d1a83a";
const Y_SCALE_DRAG_SENSITIVITY = 0.0025;
const PAST_SCROLL_PADDING_BARS = 120;
const COMPACT_VISIBLE_FUTURE_BARS = 50;
const FULLSCREEN_FUTURE_BARS = 200;

function formatLinePrice(value: number) {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatLimitQuantity(value: string) {
  const number = Number(value);

  if (!Number.isFinite(number)) return value;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  if (number >= 1) return number.toFixed(2);

  return number.toFixed(4);
}

function formatLimitNotional(value: number) {
  if (!Number.isFinite(value)) return "";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;

  return `$${value.toFixed(0)}`;
}

function isStoredDrawingTool(value: unknown): value is DrawingTool {
  return (
    typeof value === "string" &&
    DRAWING_TOOL_VALUES.includes(value as DrawingTool)
  );
}

function getTickPrecision(step: number) {
  if (step >= 1) return 0;
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(step)) + 1));
}

function formatAxisPrice(value: number, step: number) {
  return value.toFixed(getTickPrecision(step));
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const parsed = Number.parseInt(value, 16);

  if (value.length !== 6 || Number.isNaN(parsed)) {
    return `rgba(209, 91, 255, ${alpha})`;
  }

  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getRecentCandleSpacing(candles: Candle[]) {
  const spacings: number[] = [];

  for (let index = candles.length - 1; index > 0 && spacings.length < 12; index -= 1) {
    const spacing = candles[index].x - candles[index - 1].x;

    if (Number.isFinite(spacing) && spacing > 0) {
      spacings.push(spacing);
    }
  }

  if (spacings.length === 0) return 60_000;

  spacings.sort((a, b) => a - b);

  return spacings[Math.floor(spacings.length / 2)];
}

function getTimeframeMs(timeframe: string) {
  const unit = timeframe.at(-1);
  const value = Number(timeframe.slice(0, -1));

  if (!Number.isFinite(value) || value <= 0 || !unit) return null;

  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 60 * 60_000;
  if (unit === "d") return value * 24 * 60 * 60_000;
  if (unit === "w") return value * 7 * 24 * 60 * 60_000;
  if (unit === "M") return value * 30 * 24 * 60 * 60_000;

  return null;
}

function formatRulerDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);

  return parts.length ? parts.join(" ") : "0м";
}

function getRulerPercentDiff(startPrice: number, endPrice: number) {
  if (
    !Number.isFinite(startPrice) ||
    !Number.isFinite(endPrice) ||
    startPrice <= 0
  ) {
    return 0;
  }

  const rawPercent = ((endPrice - startPrice) / startPrice) * 100;

  if (!Number.isFinite(rawPercent)) return 0;

  return rawPercent < 0 ? Math.max(rawPercent, -100) : rawPercent;
}

function formatRulerPercent(value: number) {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;

  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(2)}%`;
}

function formatBarCount(value: number) {
  return `${value} бар${value === 1 ? "" : "ов"}`;
}

function getNicePriceStep(range: number, tickCount: number) {
  const rawStep = Math.max(range / Math.max(1, tickCount - 1), Number.EPSILON);
  const exponent = Math.floor(Math.log10(rawStep));
  const base = rawStep / 10 ** exponent;
  const niceBase =
    base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;

  return niceBase * 10 ** exponent;
}

function getMaxPriceStep(maxPrice: number) {
  if (maxPrice >= 10_000) return 250;
  if (maxPrice >= 1_000) return 25;
  if (maxPrice >= 100) return 2.5;
  if (maxPrice >= 10) return 0.25;
  if (maxPrice >= 1) return 0.025;
  return 0.00025;
}

function DrawingPanelIcon({
  item,
  active,
}: {
  item: DrawingPanelItem & { color?: string };
  active: boolean;
}) {
  const color = item.color ?? (active ? "#6b7280" : "#9ca3af");

  if (item.kind === "clear") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M8 8V19M12 8V19M16 8V19M5 6H19M9 6V4H15V6M7 6L8 21H16L17 6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
        />
      </svg>
    );
  }

  if (item.tool === "cursor") {
    return (
      <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
        <path
          d="M16 3V11M16 21V29M3 16H11M21 16H29"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="3.2"
        />
        <path
          d="M16 13.7V18.3M13.7 16H18.3"
          fill="none"
          stroke="#9ca3af"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (item.tool === "rectangle") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect
          x="5"
          y="6"
          width="14"
          height="12"
          fill="rgba(156,163,175,0.12)"
          stroke={color}
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (item.tool === "ruler") {
    return (
      <span
        className="h-7 w-7"
        style={{
          backgroundImage: `url(${RULER_ICON_SRC})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          filter: "grayscale(1) opacity(0.72)",
        }}
        aria-hidden="true"
      />
    );
  }

  if (item.tool === "triangle") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M12 5L20 19H4Z"
          fill="rgba(156,163,175,0.12)"
          stroke={color}
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (item.tool === "trend") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path d="M5 18L19 6" stroke={color} strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (item.tool === "horizontal" || item.tool === "vertical") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d={item.tool === "horizontal" ? "M4 12H20" : "M12 4V20"}
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (item.tool === "trajectory") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M4 18L9 13L13 15L20 7M16 7H20V11"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  const paths = {
    "arrow-right": "M4 12H19M14 7L19 12L14 17",
    "arrow-up": "M12 20V5M7 10L12 5L17 10",
    "arrow-left": "M20 12H5M10 7L5 12L10 17",
    "arrow-down": "M12 4V19M7 14L12 19L17 14",
  };

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d={paths[item.tool]}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function CandleChart({
  symbol,
  candles,
  heightClass = "h-[300px]",
  timeframe = "1m",
  theme = "dark",
  compact = false,
  showTools = false,
  timeframeControls,
  drawings: controlledDrawings,
  limitLines = [],
  onDrawingsChange,
  onNeedOlderCandles,
}: Props) {
  const chartRef = useRef<ChartJS | null>(null);
  const yScaleDragRef = useRef<YScaleDrag | null>(null);
  const drawingStartRef = useRef<DrawingPoint | null>(null);
  const drawingIdRef = useRef(0);
  const cursorPriceRef = useRef<number | null>(null);
  const drawFrameRef = useRef<number | null>(null);
  const cursorDrawFrameRef = useRef<number | null>(null);
  const chartUpdateFrameRef = useRef<number | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const draftDrawingRef = useRef<Drawing | null>(null);
  const limitLinesRef = useRef<LimitLine[]>([]);
  const toolsEnabledRef = useRef(false);
  const trajectoryLastPointRef = useRef<{
    point: DrawingPoint;
    groupId: string;
  } | null>(null);
  const olderCandlesRequestRef = useRef<{
    oldestTime: number;
    requestedAt: number;
  } | null>(null);
  const [drawingPlugin] = useState(() => ({
    id: "drawing-overlay",
    afterDatasetsDraw(chart: ChartJS) {
      const chartArea = chart.chartArea;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;

      if (!chartArea || !xScale || !yScale) return;

      const ctx = chart.ctx;
      const drawCurrentPriceLine = () => {
        const dataset = chart.data.datasets[0];
        const data = dataset?.data;
        const lastCandle = Array.isArray(data) ? data.at(-1) : null;

        if (
          !lastCandle ||
          typeof lastCandle !== "object" ||
          !("c" in lastCandle)
        ) {
          return;
        }

        const price = Number((lastCandle as Candle).c);
        const y = yScale.getPixelForValue(price);

        if (!Number.isFinite(price) || !Number.isFinite(y)) return;

        const text = formatLinePrice(price);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = "rgba(200,182,220,0.48)";
        ctx.setLineDash([2, 6]);
        ctx.shadowBlur = 0;
        ctx.shadowColor = CURRENT_PRICE_LINE_COLOR;
        ctx.stroke();

        ctx.font = `700 10px ${CHART_FONT_FAMILY}`;
        const paddingX = 5;
        const labelHeight = 16;
        const labelWidth = Math.ceil(ctx.measureText(text).width + paddingX * 2);
        const x = chartArea.right - labelWidth - 6;
        const labelY = Math.min(
          Math.max(chartArea.top + 4, y - labelHeight / 2),
          chartArea.bottom - labelHeight - 4
        );

        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(200,182,220,0.13)";
        ctx.strokeStyle = "rgba(200,182,220,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, labelY, labelWidth, labelHeight, 4);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#efe6ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + labelWidth / 2, labelY + labelHeight / 2);
        ctx.restore();
      };
      const drawCursorPriceLabel = () => {
        const price = cursorPriceRef.current;

        if (price === null) return;

        const y = yScale.getPixelForValue(price);

        if (
          !Number.isFinite(price) ||
          !Number.isFinite(y) ||
          y < chartArea.top ||
          y > chartArea.bottom
        ) {
          return;
        }

        const text = formatLinePrice(price);
        const labelHeight = 18;
        const labelWidth = Math.min(74, Math.max(48, chart.width - chartArea.right - 4));
        const x = chartArea.right + 2;
        const labelY = Math.min(
          Math.max(chartArea.top + 2, y - labelHeight / 2),
          chartArea.bottom - labelHeight - 2
        );

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.right - 10, y);
        ctx.lineTo(chartArea.right, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#22ab94";
        ctx.stroke();

        ctx.fillStyle = "rgba(34,171,148,0.2)";
        ctx.strokeStyle = "#22ab94";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, labelY, labelWidth, labelHeight, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#d8fff5";
        ctx.font = `700 10px ${CHART_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + labelWidth / 2, labelY + labelHeight / 2);
        ctx.restore();
      };
      const drawLimitLines = () => {
        const lines = limitLinesRef.current;

        if (lines.length === 0) return;

        lines.forEach((line) => {
          const y = yScale.getPixelForValue(line.price);

          if (
            !Number.isFinite(line.price) ||
            !Number.isFinite(y) ||
            y < chartArea.top ||
            y > chartArea.bottom
          ) {
            return;
          }

          const isBid = line.side === "bid";
          const color = isBid ? "#24e66f" : "#ff576d";
          const text = `${isBid ? "BID" : "ASK"} ${formatLimitNotional(line.notional) || formatLimitQuantity(line.quantity)}`;
          const alpha = 0.32 + line.strength * 0.54;
          const lineWidth = (compact ? 0.8 : 1) + line.strength * (compact ? 1.1 : 1.7);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = isBid
            ? `rgba(36,230,111,${alpha})`
            : `rgba(255,87,109,${alpha})`;
          ctx.setLineDash([]);
          ctx.shadowBlur = (compact ? 3 : 6) * line.strength;
          ctx.shadowColor = color;
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          ctx.font = `${compact ? "700 9px" : "800 10px"} Arial, Helvetica, sans-serif`;
          const paddingX = 5;
          const labelHeight = compact ? 15 : 17;
          const labelWidth = Math.ceil(ctx.measureText(text).width + paddingX * 2);
          const labelX = chartArea.left + 6;
          const labelY = Math.min(
            Math.max(chartArea.top + 3, y - labelHeight / 2),
            chartArea.bottom - labelHeight - 3
          );

          ctx.fillStyle = isBid ? "rgba(3,32,18,0.9)" : "rgba(43,10,18,0.9)";
          ctx.strokeStyle = isBid
            ? `rgba(36,230,111,${Math.min(0.75, alpha)})`
            : `rgba(255,87,109,${Math.min(0.75, alpha)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, labelX + labelWidth / 2, labelY + labelHeight / 2);
          ctx.restore();
        });
      };
      const drawLine = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        draft: boolean,
        color?: string
      ) => {
        if (
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2)
        ) {
          return;
        }

        const strokeColor = color ?? (draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = draft ? 2.5 : 3;
        ctx.strokeStyle = strokeColor;
        ctx.lineCap = "round";
        ctx.shadowBlur = 9;
        ctx.shadowColor = strokeColor;

        if (draft) {
          ctx.setLineDash([7, 5]);
        }

        ctx.stroke();
        ctx.restore();
      };
      const drawHorizontalLabel = (y: number, price: number, draft: boolean, color?: string) => {
        if (!Number.isFinite(y) || !Number.isFinite(price)) return;

        const text = `${symbol.replace("USDT", "")} ${formatLinePrice(price)}`;

        const strokeColor = color ?? (draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR);

        ctx.save();
        ctx.font = `700 11px ${CHART_FONT_FAMILY}`;
        const paddingX = 6;
        const labelHeight = 20;
        const labelWidth = Math.ceil(ctx.measureText(text).width + paddingX * 2);
        const x = Math.max(chartArea.left + 4, chartArea.right - labelWidth - 6);
        const labelY = Math.min(
          Math.max(chartArea.top + 4, y - labelHeight / 2),
          chartArea.bottom - labelHeight - 4
        );

        ctx.shadowBlur = draft ? 10 : 7;
        ctx.shadowColor = strokeColor;
        ctx.fillStyle = draft ? "rgba(255,79,216,0.24)" : "rgba(12,6,18,0.92)";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, labelY, labelWidth, labelHeight, 5);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#d7e8ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + labelWidth / 2, labelY + labelHeight / 2);
        ctx.restore();
      };
      const drawRectangle = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        draft: boolean,
        color?: string
      ) => {
        if (
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2)
        ) {
          return;
        }

        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const strokeColor = color ?? (draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR);

        ctx.save();
        ctx.fillStyle = color ? hexToRgba(color, 0.18) : DRAWING_FILL_COLOR;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = draft ? 2.2 : 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = strokeColor;

        if (draft) {
          ctx.setLineDash([7, 5]);
        }

        ctx.beginPath();
        ctx.rect(left, top, width, height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      const drawTriangle = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        draft: boolean,
        color?: string
      ) => {
        if (
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2)
        ) {
          return;
        }

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const centerX = left + (right - left) / 2;

        const strokeColor = color ?? (draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR);

        ctx.save();
        ctx.fillStyle = color ? hexToRgba(color, 0.18) : DRAWING_FILL_COLOR;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = draft ? 2.2 : 2;
        ctx.lineJoin = "round";
        ctx.shadowBlur = 8;
        ctx.shadowColor = strokeColor;

        if (draft) {
          ctx.setLineDash([7, 5]);
        }

        ctx.beginPath();
        ctx.moveTo(centerX, top);
        ctx.lineTo(right, bottom);
        ctx.lineTo(left, bottom);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      const drawRuler = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        start: DrawingPoint,
        end: DrawingPoint,
        draft: boolean
      ) => {
        if (
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2)
        ) {
          return;
        }

        const percentDiff = getRulerPercentDiff(start.y, end.y);
        const timeframeMs = getTimeframeMs(timeframe) ?? getRecentCandleSpacing(candles);
        const barCount = Math.max(
          0,
          Math.round(Math.abs(end.x - start.x) / Math.max(1, timeframeMs))
        );
        const elapsedMs = barCount * timeframeMs;
        const accent = percentDiff >= 0 ? "#22ab94" : "#f23645";
        const accentSoft = percentDiff >= 0 ? "rgba(34,171,148,0.14)" : "rgba(242,54,69,0.14)";
        const accentLine = percentDiff >= 0 ? "rgba(34,171,148,0.72)" : "rgba(242,54,69,0.72)";
        const labelText = `${formatRulerPercent(percentDiff)}  ${formatBarCount(
          barCount
        )}  ${formatRulerDuration(elapsedMs)}`;
        const areaLeft = Math.min(x1, x2);
        const areaRight = Math.max(x1, x2);
        const areaTop = Math.min(y1, y2);
        const areaBottom = Math.max(y1, y2);
        const areaWidth = areaRight - areaLeft;
        const areaHeight = areaBottom - areaTop;

        ctx.save();
        ctx.beginPath();
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
        ctx.clip();

        ctx.fillStyle = accentSoft;
        ctx.strokeStyle = accentLine;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(areaLeft, areaTop, areaWidth, areaHeight);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "rgba(231,238,247,0.45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(areaLeft, y1);
        ctx.lineTo(areaRight, y1);
        ctx.moveTo(areaLeft, y2);
        ctx.lineTo(areaRight, y2);
        ctx.moveTo(x1, areaTop);
        ctx.lineTo(x1, areaBottom);
        ctx.moveTo(x2, areaTop);
        ctx.lineTo(x2, areaBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = draft ? 2.4 : 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 10;
        ctx.shadowColor = accent;

        if (draft) {
          ctx.setLineDash([6, 4]);
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        [ [x1, y1], [x2, y2] ].forEach(([pointX, pointY]) => {
          ctx.beginPath();
          ctx.fillStyle = "#0b1116";
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.arc(pointX, pointY, 4.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        ctx.shadowBlur = 0;
        ctx.font = `800 11px ${CHART_FONT_FAMILY}`;
        const paddingX = 8;
        const labelHeight = 22;
        const labelWidth = Math.ceil(ctx.measureText(labelText).width + paddingX * 2);
        const preferredLabelX = areaLeft + Math.min(96, Math.max(52, areaWidth * 0.35));
        const preferredLabelY = areaTop + 8;
        const left = Math.min(
          Math.max(chartArea.left + 4, preferredLabelX - labelWidth / 2),
          chartArea.right - labelWidth - 4
        );
        const top = Math.min(
          Math.max(chartArea.top + 4, preferredLabelY),
          chartArea.bottom - labelHeight - 4
        );

        ctx.fillStyle = "rgba(8,13,17,0.96)";
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(left, top, labelWidth, labelHeight, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, left + labelWidth / 2, top + labelHeight / 2);
        ctx.restore();
      };
      const drawArrow = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        draft: boolean,
        color?: string
      ) => {
        if (
          !Number.isFinite(x1) ||
          !Number.isFinite(y1) ||
          !Number.isFinite(x2) ||
          !Number.isFinite(y2)
        ) {
          return;
        }

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 14;

        const strokeColor = color ?? (draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR);

        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = strokeColor;
        ctx.lineWidth = draft ? 2.5 : 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 9;
        ctx.shadowColor = strokeColor;

        if (draft) {
          ctx.setLineDash([7, 5]);
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle - Math.PI / 6),
          y2 - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          x2 - headLength * Math.cos(angle + Math.PI / 6),
          y2 - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const currentDrawings = drawingsRef.current;
      const currentDraft = draftDrawingRef.current;
      const drawableItems = currentDraft
        ? [...currentDrawings, currentDraft]
        : currentDrawings;

      drawableItems.forEach((item) => {
        const startX = xScale.getPixelForValue(item.start.x);
        const startY = yScale.getPixelForValue(item.start.y);
        const draft = item.id === currentDraft?.id;

        if (item.tool === "horizontal") {
          drawLine(chartArea.left, startY, chartArea.right, startY, draft, item.color);
          drawHorizontalLabel(startY, item.start.y, draft, item.color);
          return;
        }

        if (item.tool === "vertical") {
          drawLine(startX, chartArea.top, startX, chartArea.bottom, draft, item.color);
          return;
        }

        const endX = xScale.getPixelForValue(item.end.x);
        const endY = yScale.getPixelForValue(item.end.y);

        if (item.tool === "rectangle") {
          drawRectangle(startX, startY, endX, endY, draft, item.color);
          return;
        }

        if (item.tool === "triangle") {
          drawTriangle(startX, startY, endX, endY, draft, item.color);
          return;
        }

        if (item.tool === "ruler") {
          drawRuler(startX, startY, endX, endY, item.start, item.end, draft);
          return;
        }

        if (item.tool.startsWith("arrow-")) {
          let arrowEndX = endX;
          let arrowEndY = endY;

          if (item.tool === "arrow-right") {
            arrowEndX = Math.max(startX + 12, endX);
            arrowEndY = startY;
          }

          if (item.tool === "arrow-left") {
            arrowEndX = Math.min(startX - 12, endX);
            arrowEndY = startY;
          }

          if (item.tool === "arrow-up") {
            arrowEndX = startX;
            arrowEndY = Math.min(startY - 12, endY);
          }

          if (item.tool === "arrow-down") {
            arrowEndX = startX;
            arrowEndY = Math.max(startY + 12, endY);
          }

          drawArrow(startX, startY, arrowEndX, arrowEndY, draft, item.color);
          return;
        }

        drawLine(startX, startY, endX, endY, draft, item.color);
      });

      drawLimitLines();
      drawCurrentPriceLine();
      drawCursorPriceLabel();
    },
  }));
  const [xRange, setXRange] = useState<XRange | null>(null);
  const [yRange, setYRange] = useState<YRange | null>(null);
  const [hoverXRange, setHoverXRange] = useState<XRange | null>(null);
  const [hoverYRange, setHoverYRange] = useState<YRange | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("cursor");
  const [activeToolPanel, setActiveToolPanel] = useState<"tf" | "draw" | null>(null);
  const [drawingWindowStart, setDrawingWindowStart] = useState(0);
  const [localDrawings, setLocalDrawings] = useState<Drawing[]>([]);
  const [draftDrawing, setDraftDrawing] = useState<Drawing | null>(null);
  const [drawingColorMenu, setDrawingColorMenu] =
    useState<DrawingColorMenu | null>(null);
  const [selectedDrawingColor, setSelectedDrawingColor] =
    useState(DRAWING_LINE_COLOR);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [favoriteDrawingTools, setFavoriteDrawingTools] = useState<DrawingTool[]>(
    []
  );
  const [drawingFavoritesLoaded, setDrawingFavoritesLoaded] = useState(false);
  const drawings = controlledDrawings ?? localDrawings;
  const lastCandle = candles.at(-1);
  const lows = candles.map((candle) => candle.l);
  const highs = candles.map((candle) => candle.h);
  const minPrice = candles.length ? Math.min(...lows) : 0;
  const maxPrice = candles.length ? Math.max(...highs) : 1;
  const padding = (maxPrice - minPrice) * 0.08 || 1;
  const maxTicksLimit = 40;
  const paddedMin = minPrice - padding;
  const paddedMax = maxPrice + padding;
  const yStep = Math.min(
    getNicePriceStep(paddedMax - paddedMin || 1, maxTicksLimit),
    getMaxPriceStep(paddedMax)
  );
  const autoYMin = Math.floor(paddedMin / yStep) * yStep;
  const autoYMax = Math.ceil(paddedMax / yStep) * yStep;
  const toolsEnabled = showTools;
  const visibleDrawingPanelItems = DRAWING_PANEL_ITEMS.slice(
    drawingWindowStart,
    drawingWindowStart + DRAWING_WINDOW_SIZE
  );
  const favoriteDrawingItems = favoriteDrawingTools
    .map((tool) =>
      DRAWING_TABLE_ITEMS.find(
        (item): item is Extract<DrawingPanelItem, { kind: "tool" }> =>
          item.kind === "tool" && item.tool === tool
      )
    )
    .filter((item): item is Extract<DrawingPanelItem, { kind: "tool" }> =>
      Boolean(item)
    );
  const canShiftDrawingLeft = drawingWindowStart > 0;
  const canShiftDrawingRight =
    drawingWindowStart < DRAWING_PANEL_ITEMS.length - DRAWING_WINDOW_SIZE;
  const currentXRange =
    xRange?.symbol === symbol && xRange.timeframe === timeframe ? xRange : null;
  const currentYRange =
    yRange?.symbol === symbol && yRange.timeframe === timeframe ? yRange : null;
  const currentHoverXRange =
    hoverXRange?.symbol === symbol && hoverXRange.timeframe === timeframe
      ? hoverXRange
      : null;
  const currentHoverYRange =
    hoverYRange?.symbol === symbol && hoverYRange.timeframe === timeframe
      ? hoverYRange
      : null;
  const activeXRange = currentXRange ?? currentHoverXRange;
  const activeYRange = currentYRange ?? currentHoverYRange;
  const visibleVolumeCandles = candles.filter(
    (candle) =>
      !activeXRange ||
      (candle.x >= activeXRange.min && candle.x <= activeXRange.max)
  );
  const volumeCandles =
    visibleVolumeCandles.length > 0 ? visibleVolumeCandles : candles;
  const maxVolume = Math.max(
    1,
    ...volumeCandles.map((candle) => Number(candle.v ?? 0))
  );
  const volumeRenderLimit = compact ? 180 : 420;
  const volumeRenderStep = Math.max(
    1,
    Math.ceil(volumeCandles.length / volumeRenderLimit)
  );
  const renderedVolumeCandles =
    volumeRenderStep === 1
      ? volumeCandles
      : volumeCandles.filter(
          (_, index) =>
            index % volumeRenderStep === 0 || index === volumeCandles.length - 1
        );
  const oldestCandleTime = candles[0]?.x;
  const newestCandleTime = candles.at(-1)?.x;
  const candleSpacing = getRecentCandleSpacing(candles);
  const futureBars = compact ? COMPACT_VISIBLE_FUTURE_BARS : FULLSCREEN_FUTURE_BARS;
  const rightCandlePadding = candleSpacing * futureBars;
  const newestVisibleTime =
    newestCandleTime !== undefined ? newestCandleTime + rightCandlePadding : undefined;
  const oldestScrollableTime =
    oldestCandleTime !== undefined
      ? oldestCandleTime - candleSpacing * PAST_SCROLL_PADDING_BARS
      : undefined;
  const newestScrollableTime =
    newestCandleTime !== undefined
      ? newestCandleTime + candleSpacing * futureBars
      : undefined;
  const rightWallTime = newestScrollableTime;
  const loadedXRange =
    oldestCandleTime !== undefined &&
    newestVisibleTime !== undefined &&
    newestVisibleTime > oldestCandleTime
      ? newestVisibleTime - oldestCandleTime
      : 0;
  const chartTheme =
    theme === "light"
      ? {
          background: "#ffffff",
          grid: "rgba(17, 19, 24, 0.1)",
          gridStrong: "rgba(17, 19, 24, 0.2)",
          tick: "#374151",
          legend: "#111318",
        }
      : {
          background: CHART_BACKGROUND_COLOR,
          grid: CHART_GRID_COLOR,
          gridStrong: CHART_GRID_STRONG_COLOR,
          tick: "#8b949e",
          legend: "#8b949e",
        };
  const chartPixelRatio =
    typeof window === "undefined"
      ? 1
      : Math.min(compact ? 3 : 4, Math.max(2, window.devicePixelRatio || 1));
  const toolPanelThemeClass =
    theme === "light" ? "drawing-menu-light" : "drawing-menu-dark";
  const candleColors = {
    backgroundColors: {
      up: CANDLE_UP_COLOR,
      down: CANDLE_DOWN_COLOR,
      unchanged: CANDLE_UNCHANGED_COLOR,
    },
    borderColors: {
      up: CANDLE_UP_COLOR,
      down: CANDLE_DOWN_COLOR,
      unchanged: CANDLE_UNCHANGED_COLOR,
    },
  } as Record<string, unknown>;

  function requestOlderCandlesIfNeeded(leftEdgeTime: number) {
    if (!onNeedOlderCandles || candles.length < 2) return;

    const oldestTime = candles[0].x;
    const newestTime = candles[candles.length - 1].x;
    const loadedRange = newestTime - oldestTime;

    if (loadedRange <= 0) return;

    const nearLeftEdge = leftEdgeTime <= oldestTime + loadedRange * 0.25;

    if (!nearLeftEdge) return;

    const now = Date.now();
    const lastRequest = olderCandlesRequestRef.current;

    if (
      lastRequest &&
      lastRequest.oldestTime === oldestTime &&
      now - lastRequest.requestedAt < 30_000
    ) {
      return;
    }

    if (lastRequest && now - lastRequest.requestedAt < 1_500) {
      return;
    }

    olderCandlesRequestRef.current = {
      oldestTime,
      requestedAt: now,
    };
    onNeedOlderCandles(oldestTime);
  }

  function clampXRangeToCandles(range: XRange): XRange | null {
    if (
      oldestCandleTime === undefined ||
      newestVisibleTime === undefined ||
      oldestScrollableTime === undefined ||
      newestScrollableTime === undefined ||
      loadedXRange <= 0
    ) {
      return null;
    }

    const visibleRange = range.max - range.min;
    const scrollableRange = newestScrollableTime - oldestScrollableTime;

    if (!Number.isFinite(visibleRange) || visibleRange <= 0) return null;

    if (visibleRange >= scrollableRange) {
      return {
        symbol,
        timeframe,
        min: oldestScrollableTime,
        max: newestScrollableTime,
      };
    }

    const beyondPastLeft = Math.max(0, oldestScrollableTime - range.min);
    const beyondFutureRight = Math.max(0, range.max - newestScrollableTime);

    if (beyondPastLeft <= 0 && beyondFutureRight <= 0) return null;

    if (range.max < oldestScrollableTime || beyondPastLeft > 0) {
      return {
        symbol,
        timeframe,
        min: oldestScrollableTime,
        max: oldestScrollableTime + visibleRange,
      };
    }

    return {
      symbol,
      timeframe,
      min: newestScrollableTime - visibleRange,
      max: newestScrollableTime,
    };
  }

  function clampLiveChartXRange(chart: ChartJS) {
    const xScale = chart.scales.x;
    const xOptions = chart.options.scales?.x;

    if (!xScale || !xOptions) return;

    const fixedRange = clampXRangeToCandles({
      symbol,
      timeframe,
      min: xScale.min,
      max: xScale.max,
    });

    if (!fixedRange) return;

    xOptions.min = fixedRange.min;
    xOptions.max = fixedRange.max;
    chart.update("none");
  }

  useEffect(() => {
    if (!currentXRange) return;

    requestOlderCandlesIfNeeded(currentXRange.min);
  }, [candles, currentXRange]);

  useEffect(() => {
    if (!compact || !currentXRange || candles.length < 2) return;

    const fixedRange = clampXRangeToCandles(currentXRange);

    if (
      fixedRange &&
      (fixedRange.min !== currentXRange.min || fixedRange.max !== currentXRange.max)
    ) {
      setXRange(fixedRange);
      window.requestAnimationFrame(() => {
        chartRef.current?.update("none");
        chartRef.current?.draw();
      });
    }
  }, [
    candles,
    compact,
    currentXRange,
    loadedXRange,
    oldestCandleTime,
    oldestScrollableTime,
    newestScrollableTime,
    newestVisibleTime,
  ]);

  function redrawChart() {
    if (drawFrameRef.current !== null) return;

    drawFrameRef.current = window.requestAnimationFrame(() => {
      drawFrameRef.current = null;
      chartRef.current?.draw();
    });
  }

  function scheduleCursorDraw() {
    if (cursorDrawFrameRef.current !== null) return;

    cursorDrawFrameRef.current = window.requestAnimationFrame(() => {
      cursorDrawFrameRef.current = null;
      chartRef.current?.draw();
    });
  }

  function lockChartRangeWhileHovered() {
    const chart = chartRef.current;
    const xScale = chart?.scales.x;
    const yScale = chart?.scales.y;

    if (!xScale || !yScale) return;

    if (!currentXRange) {
      setHoverXRange({
        symbol,
        timeframe,
        min: xScale.min,
        max: xScale.max,
      });
    }

    if (!currentYRange) {
      setHoverYRange({
        symbol,
        timeframe,
        min: yScale.min,
        max: yScale.max,
      });
    }
  }

  function releaseHoveredChartRange() {
    setHoverXRange(null);
    setHoverYRange(null);
  }

  function updateCursorPrice(event: React.PointerEvent<HTMLDivElement>) {
    const chart = chartRef.current;
    const yScale = chart?.scales.y;
    const chartArea = chart?.chartArea;
    const canvas = chart?.canvas;

    if (!chart || !yScale || !chartArea || !canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const pixelY = event.clientY - bounds.top;

    if (pixelY < chartArea.top || pixelY > chartArea.bottom) {
      cursorPriceRef.current = null;
    } else {
      cursorPriceRef.current = Number(yScale.getValueForPixel(pixelY));
    }

    scheduleCursorDraw();
  }

  function clearCursorPrice() {
    cursorPriceRef.current = null;
    releaseHoveredChartRange();
    redrawChart();
  }

  useEffect(() => {
    return () => {
      if (drawFrameRef.current !== null) {
        window.cancelAnimationFrame(drawFrameRef.current);
      }

      if (cursorDrawFrameRef.current !== null) {
        window.cancelAnimationFrame(cursorDrawFrameRef.current);
      }

      if (chartUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(chartUpdateFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    drawingsRef.current = drawings;
    draftDrawingRef.current = draftDrawing;
    limitLinesRef.current = limitLines;
    toolsEnabledRef.current = toolsEnabled;
    redrawChart();
  }, [drawings, draftDrawing, limitLines, toolsEnabled]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAWING_FAVORITES_STORAGE_KEY);

      if (!raw) {
        setDrawingFavoritesLoaded(true);
        return;
      }

      const saved = JSON.parse(raw);

      if (Array.isArray(saved)) {
        setFavoriteDrawingTools(saved.filter(isStoredDrawingTool));
      }

    } catch (error) {
      console.error("Drawing favorites restore error:", error);
    } finally {
      setDrawingFavoritesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!drawingFavoritesLoaded) return;

    try {
      window.localStorage.setItem(
        DRAWING_FAVORITES_STORAGE_KEY,
        JSON.stringify(favoriteDrawingTools)
      );
    } catch (error) {
      console.error("Drawing favorites save error:", error);
    }
  }, [drawingFavoritesLoaded, favoriteDrawingTools]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setShiftPressed(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setShiftPressed(false);
      }
    }

    function handleWindowBlur() {
      setShiftPressed(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (chartUpdateFrameRef.current !== null) return;

    chartUpdateFrameRef.current = window.requestAnimationFrame(() => {
      chartUpdateFrameRef.current = null;
      const chart = chartRef.current;

      if (!chart) return;

      const container = chart.canvas.parentElement;
      const bounds = container?.getBoundingClientRect();

      if (
        bounds &&
        (Math.abs(chart.width - bounds.width) > 1 ||
          Math.abs(chart.height - bounds.height) > 1)
      ) {
        chart.resize();
      }

      chart.update("none");
      chart.draw();
    });
  }, [candles.length, lastCandle?.x, lastCandle?.c]);

  function nextDrawingId() {
    drawingIdRef.current += 1;
    return `${symbol}-${timeframe}-${drawingIdRef.current}`;
  }

  function updateDrawings(updater: (current: Drawing[]) => Drawing[]) {
    const nextDrawings = updater(drawingsRef.current);

    drawingsRef.current = nextDrawings;

    if (onDrawingsChange) {
      onDrawingsChange(nextDrawings);
    } else {
      setLocalDrawings(nextDrawings);
    }

    redrawChart();
  }

  function findDrawingAtClient(clientX: number, clientY: number) {
    const chart = chartRef.current;
    const xScale = chart?.scales.x;
    const yScale = chart?.scales.y;
    const chartArea = chart?.chartArea;
    const canvas = chart?.canvas;

    if (!chart || !xScale || !yScale || !chartArea || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;

    if (
      pixelX < chartArea.left ||
      pixelX > chartArea.right ||
      pixelY < chartArea.top ||
      pixelY > chartArea.bottom
    ) {
      return null;
    }

    for (let index = drawingsRef.current.length - 1; index >= 0; index -= 1) {
      const item = drawingsRef.current[index];

      const startX = xScale.getPixelForValue(item.start.x);
      const startY = yScale.getPixelForValue(item.start.y);
      let endX = xScale.getPixelForValue(item.end.x);
      let endY = yScale.getPixelForValue(item.end.y);
      const hitPadding = 8;

      if (item.tool === "arrow-right") {
        endX = Math.max(startX + 12, endX);
        endY = startY;
      }

      if (item.tool === "arrow-left") {
        endX = Math.min(startX - 12, endX);
        endY = startY;
      }

      if (item.tool === "arrow-up") {
        endX = startX;
        endY = Math.min(startY - 12, endY);
      }

      if (item.tool === "arrow-down") {
        endX = startX;
        endY = Math.max(startY + 12, endY);
      }

      if (item.tool === "horizontal" && Math.abs(pixelY - startY) <= hitPadding) {
        return item;
      }

      if (item.tool === "vertical" && Math.abs(pixelX - startX) <= hitPadding) {
        return item;
      }

      const left = Math.min(startX, endX);
      const right = Math.max(startX, endX);
      const top = Math.min(startY, endY);
      const bottom = Math.max(startY, endY);
      const segmentLength = Math.hypot(endX - startX, endY - startY);
      const distanceToSegment =
        segmentLength === 0
          ? Math.hypot(pixelX - startX, pixelY - startY)
          : Math.abs(
              (endY - startY) * pixelX -
                (endX - startX) * pixelY +
                endX * startY -
                endY * startX
            ) / segmentLength;

      if (item.tool === "rectangle" || item.tool === "triangle") {
        if (
          pixelX >= left - hitPadding &&
          pixelX <= right + hitPadding &&
          pixelY >= top - hitPadding &&
          pixelY <= bottom + hitPadding
        ) {
          return item;
        }
      }

      if (
        pixelX >= left - hitPadding &&
        pixelX <= right + hitPadding &&
        pixelY >= top - hitPadding &&
        pixelY <= bottom + hitPadding &&
        distanceToSegment <= hitPadding
      ) {
        return item;
      }
    }

    return null;
  }

  function openDrawingColorMenu(event: React.MouseEvent<HTMLDivElement>) {
    const drawing = findDrawingAtClient(event.clientX, event.clientY);

    if (!drawing) {
      setDrawingColorMenu(null);
      leaveDrawingMode(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDrawingColorMenu({
      drawingId: drawing.id,
      tool: drawing.tool,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function setDrawingColor(drawingId: string, color: string) {
    updateDrawings((prev) =>
      prev.map((item) => {
        const target = prev.find((drawing) => drawing.id === drawingId);
        const isSameTrajectory =
          target?.tool === "trajectory" &&
          target.groupId &&
          item.groupId === target.groupId;

        return item.id === drawingId || isSameTrajectory ? { ...item, color } : item;
      })
    );
    setDrawingColorMenu(null);
  }

  function deleteDrawing(drawingId: string) {
    updateDrawings((prev) => {
      const target = prev.find((item) => item.id === drawingId);

      if (target?.tool === "trajectory" && target.groupId) {
        return prev.filter((item) => item.groupId !== target.groupId);
      }

      return prev.filter((item) => item.id !== drawingId);
    });
    setDrawingColorMenu(null);
  }

  function selectDrawingTool(tool: DrawingTool) {
    setDrawingTool(tool);
    setDrawingColorMenu(null);
    resetDraftDrawing();
    trajectoryLastPointRef.current = null;
    redrawChart();
  }

  function toggleFavoriteDrawingTool(tool: DrawingTool) {
    setFavoriteDrawingTools((current) =>
      current.includes(tool)
        ? current.filter((item) => item !== tool)
        : [...current, tool]
    );
  }

  function rememberChartRange({ chart }: ZoomEvent) {
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale) return;

    if (compact) {
      clampLiveChartXRange(chart);
    }

    const clampedXRange =
      !compact && rightWallTime !== undefined && xScale.max > rightWallTime
        ? {
            symbol,
            timeframe,
            min: rightWallTime - (xScale.max - xScale.min),
            max: rightWallTime,
          }
        : {
            symbol,
            timeframe,
            min: xScale.min,
            max: xScale.max,
          };

    setXRange((prev) => {
      if (
        prev?.symbol === symbol &&
        prev.timeframe === timeframe &&
        prev.min === clampedXRange.min &&
        prev.max === clampedXRange.max
      ) {
        return prev;
      }

      return clampedXRange;
    });

    setYRange((prev) => {
      if (
        prev?.symbol === symbol &&
        prev.timeframe === timeframe &&
        prev.min === yScale.min &&
        prev.max === yScale.max
      ) {
        return prev;
      }

      return {
        symbol,
        timeframe,
        min: yScale.min,
        max: yScale.max,
      };
    });

    requestOlderCandlesIfNeeded(clampedXRange.min);

    redrawChart();
  }

  function zoomChartWithWheel(event: React.WheelEvent<HTMLDivElement>) {
    const chart = chartRef.current;
    const xScale = chart?.scales.x;
    const chartArea = chart?.chartArea;
    const canvas = chart?.canvas;

    if (
      !chart ||
      !xScale ||
      !chartArea ||
      !canvas ||
      oldestScrollableTime === undefined ||
      newestScrollableTime === undefined ||
      newestScrollableTime <= oldestScrollableTime ||
      candleSpacing <= 0
    ) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const pixelX = event.clientX - bounds.left;
    const pixelY = event.clientY - bounds.top;

    if (
      pixelX < chartArea.left ||
      pixelX > chartArea.right ||
      pixelY < chartArea.top ||
      pixelY > chartArea.bottom
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const currentMin = Number(activeXRange?.min ?? xScale.min);
    const currentMax = Number(activeXRange?.max ?? xScale.max);
    const currentRange = currentMax - currentMin;
    const scrollableRange = newestScrollableTime - oldestScrollableTime;

    if (!Number.isFinite(currentRange) || currentRange <= 0) return;

    const wheelFactor = Math.min(2.5, Math.max(0.4, Math.exp(event.deltaY * 0.0015)));
    const minRange = candleSpacing * 10;
    const nextRange = Math.min(
      scrollableRange,
      Math.max(minRange, currentRange * wheelFactor)
    );
    const cursorValue = Number(xScale.getValueForPixel(pixelX));
    const center = Number.isFinite(cursorValue)
      ? cursorValue
      : currentMin + currentRange / 2;
    const cursorRatio = Math.min(
      0.95,
      Math.max(0.05, (center - currentMin) / currentRange)
    );
    const unclampedRange = {
      symbol,
      timeframe,
      min: center - nextRange * cursorRatio,
      max: center + nextRange * (1 - cursorRatio),
    };
    const nextXRange = clampXRangeToCandles(unclampedRange) ?? unclampedRange;

    setHoverXRange(null);
    setXRange(nextXRange);
    requestOlderCandlesIfNeeded(nextXRange.min);

    const xOptions = chart.options.scales?.x;

    if (xOptions) {
      xOptions.min = nextXRange.min;
      xOptions.max = nextXRange.max;
      chart.update("none");
    } else {
      redrawChart();
    }
  }

  function getDrawingTargetFromClient(
    clientX: number,
    clientY: number
  ): DrawingTarget | null {
    const chart = chartRef.current;
    const xScale = chart?.scales.x;
    const yScale = chart?.scales.y;
    const chartArea = chart?.chartArea;
    const canvas = chart?.canvas;

    if (!chart || !xScale || !yScale || !chartArea || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;

    if (
      pixelX < chartArea.left ||
      pixelX > chartArea.right ||
      pixelY < chartArea.top ||
      pixelY > chartArea.bottom
    ) {
      return null;
    }

    return {
      x: Number(xScale.getValueForPixel(pixelX)),
      y: Number(yScale.getValueForPixel(pixelY)),
      pixelX,
      pixelY,
      chartLeft: chartArea.left,
      chartRight: chartArea.right,
      chartTop: chartArea.top,
      chartBottom: chartArea.bottom,
    };
  }

  function getDrawingTarget(
    event: React.PointerEvent<HTMLDivElement>
  ): DrawingTarget | null {
    return getDrawingTargetFromClient(event.clientX, event.clientY);
  }

  function addStraightDrawing(
    target: DrawingTarget,
    tool: "horizontal" | "vertical"
  ) {
    const nextDrawing: Drawing = {
      id: nextDrawingId(),
      tool,
      start: target,
      end: target,
      color: selectedDrawingColor,
    };

    updateDrawings((prev) => [...prev, nextDrawing]);
  }

  function isDragDrawingTool(tool: DrawingTool): tool is DragDrawingTool {
    return (
      tool === "trend" ||
      tool === "rectangle" ||
      tool === "ruler" ||
      tool === "triangle" ||
      tool.startsWith("arrow-")
    );
  }

  function resetDraftDrawing() {
    setDraftDrawing(null);
    draftDrawingRef.current = null;
    drawingStartRef.current = null;
  }

  function getActiveDrawingTool() {
    return draftDrawingRef.current?.tool ?? drawingTool;
  }

  function startDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const target = getDrawingTarget(event);

    if (!target) return;

    setDrawingColorMenu(null);
    event.preventDefault();
    event.stopPropagation();

    const activeTool = event.shiftKey ? "ruler" : drawingTool;

    if (event.shiftKey && drawingTool !== "ruler") {
      setDrawingTool("ruler");
    }

    if (activeTool === "horizontal" || activeTool === "vertical") {
      addStraightDrawing(target, activeTool);
      resetDraftDrawing();
      trajectoryLastPointRef.current = null;
      return;
    }

    if (activeTool === "trajectory") {
      const previousPoint = trajectoryLastPointRef.current;
      const groupId = previousPoint?.groupId ?? nextDrawingId();

      if (previousPoint) {
        updateDrawings((prev) => [
          ...prev,
          {
            id: nextDrawingId(),
            tool: "trajectory",
            start: previousPoint.point,
            end: target,
            color: selectedDrawingColor,
            groupId,
          },
        ]);
      }

      trajectoryLastPointRef.current = { point: target, groupId };

      const draft: Drawing = {
        id: nextDrawingId(),
        tool: "trajectory",
        start: target,
        end: target,
        color: selectedDrawingColor,
        groupId,
      };

      setDraftDrawing(draft);
      draftDrawingRef.current = draft;
      redrawChart();
      return;
    }

    if (!isDragDrawingTool(activeTool)) return;
    if (activeTool === "ruler" && !event.shiftKey) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drawingStartRef.current = target;

    const draft: Drawing = {
      id: nextDrawingId(),
      tool: activeTool,
      start: target,
      end: target,
      color: activeTool === "ruler" ? undefined : selectedDrawingColor,
    };

    setDraftDrawing(draft);
    draftDrawingRef.current = draft;
    redrawChart();
  }

  function moveDrawing(event: React.PointerEvent<HTMLDivElement>) {
    const point = getDrawingTarget(event);

    if (!point) return;

    const activeTool = getActiveDrawingTool();

    if (activeTool === "trajectory") {
      const start = trajectoryLastPointRef.current;

      if (!start) return;

      event.preventDefault();
      event.stopPropagation();
      const nextDraft: Drawing = {
        id: draftDrawingRef.current?.id ?? nextDrawingId(),
        tool: "trajectory",
        start: start.point,
        end: point,
        color: selectedDrawingColor,
        groupId: start.groupId,
      };

      setDraftDrawing(nextDraft);
      draftDrawingRef.current = nextDraft;
      redrawChart();
      return;
    }

    if (!isDragDrawingTool(activeTool)) return;

    const start = drawingStartRef.current;

    if (!start) return;
    if ((event.buttons & 1) !== 1) return;

    event.preventDefault();
    event.stopPropagation();
    setDraftDrawing((current) => {
      const nextDraft = current
        ? {
            ...current,
            end: point,
          }
        : null;

      draftDrawingRef.current = nextDraft;
      redrawChart();
      return nextDraft;
    });
  }

  function finishDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const activeTool = getActiveDrawingTool();

    if (!isDragDrawingTool(activeTool)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const start = drawingStartRef.current;
    const point = getDrawingTarget(event);
    const draft = draftDrawingRef.current;

    if (start) {
      updateDrawings((prev) => [
          ...prev,
          {
            id: nextDrawingId(),
            tool: activeTool,
            start,
            end: point ?? draft?.end ?? start,
            color: activeTool === "ruler" ? undefined : draft?.color ?? selectedDrawingColor,
            groupId: draft?.groupId,
          },
        ]);
    }

    setDraftDrawing(null);
    draftDrawingRef.current = null;
    drawingStartRef.current = null;
    redrawChart();
  }

  function leaveDrawingMode(event: React.MouseEvent<HTMLDivElement>) {
    if (
      !toolsEnabledRef.current ||
      (drawingTool === "cursor" &&
        !draftDrawingRef.current &&
        !trajectoryLastPointRef.current)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    trajectoryLastPointRef.current = null;
    resetDraftDrawing();
    setDrawingTool("cursor");
    redrawChart();
  }

  function cancelDrawing(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    drawingStartRef.current = null;
    trajectoryLastPointRef.current = null;
    setDraftDrawing(null);
    draftDrawingRef.current = null;
    redrawChart();
  }

  function startYScaleDrag(event: React.PointerEvent<HTMLDivElement>) {
    const chart = chartRef.current;
    const scale = chart?.scales.y;

    if (!scale) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    yScaleDragRef.current = {
      center: (scale.min + scale.max) / 2,
      range: scale.max - scale.min,
      startY: event.clientY,
    };
  }

  function dragYScale(event: React.PointerEvent<HTMLDivElement>) {
    const drag = yScaleDragRef.current;

    if (!drag) return;

    const factor = Math.exp((event.clientY - drag.startY) * Y_SCALE_DRAG_SENSITIVITY);
    const nextRange = Math.max(drag.range * factor, Number.EPSILON);
    const min = drag.center - nextRange / 2;
    const max = drag.center + nextRange / 2;

    setYRange({
      symbol,
      timeframe,
      min,
      max,
    });
    redrawChart();
  }

  function stopYScaleDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    yScaleDragRef.current = null;
  }

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden ${heightClass}`}
      style={{ backgroundColor: chartTheme.background }}
      onPointerMove={updateCursorPrice}
      onPointerEnter={lockChartRangeWhileHovered}
      onPointerLeave={clearCursorPrice}
      onClick={() => setDrawingColorMenu(null)}
      onContextMenu={openDrawingColorMenu}
    >
      <style>
        {`
          .chart-control-menu {
            border: 1px solid var(--draw-border);
            border-radius: 10px;
            background: var(--draw-bg);
            color: var(--draw-text);
            box-shadow: var(--draw-shadow);
            backdrop-filter: blur(18px);
          }

          .drawing-menu-dark {
            --draw-bg: rgba(0, 0, 0, 0.96);
            --draw-cell: rgba(255, 255, 255, 0.015);
            --draw-cell-hover: rgba(255, 255, 255, 0.08);
            --draw-active: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05));
            --draw-border: rgba(255, 255, 255, 0.16);
            --draw-soft-border: rgba(255, 255, 255, 0.1);
            --draw-text: #d1d5db;
            --draw-muted: rgba(156, 163, 175, 0.72);
            --draw-accent: #9ca3af;
            --draw-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          }

          .drawing-menu-light {
            --draw-bg: rgba(255, 255, 255, 0.96);
            --draw-cell: rgba(17, 24, 39, 0.015);
            --draw-cell-hover: rgba(17, 24, 39, 0.06);
            --draw-active: #111827;
            --draw-border: rgba(17, 24, 39, 0.16);
            --draw-soft-border: rgba(17, 24, 39, 0.1);
            --draw-text: #6b7280;
            --draw-muted: rgba(107, 114, 128, 0.72);
            --draw-accent: #9ca3af;
            --draw-shadow: 0 18px 44px rgba(15, 23, 42, 0.12);
          }

          .chart-control-menu .tool-tabs {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            overflow: hidden;
            border-bottom: 1px solid var(--draw-soft-border);
          }

          .chart-control-menu .tool-tab {
            min-height: 34px;
            border-right: 1px solid var(--draw-soft-border);
            color: var(--draw-muted);
            font-size: 13px;
            font-weight: 900;
            transition: background 220ms ease, color 220ms ease, box-shadow 220ms ease;
          }

          .chart-control-menu .tool-tab:last-child {
            border-right: 0;
          }

          .chart-control-menu .tool-tab.is-active {
            background: var(--draw-active);
            color: ${theme === "light" ? "#ffffff" : "var(--draw-text)"};
            box-shadow: none;
          }

          .chart-control-menu .tf-row {
            display: grid;
            overflow: hidden;
            border-top: 1px solid var(--draw-soft-border);
          }

          .chart-control-menu .tf-cell {
            min-height: 28px;
            border-right: 1px solid var(--draw-soft-border);
            color: var(--draw-accent);
            font-size: 11px;
            font-weight: 900;
            padding: 0 8px;
            transition: background 220ms ease, color 220ms ease;
          }

          .chart-control-menu .tf-cell.is-active {
            background: var(--draw-active);
            color: ${theme === "light" ? "#ffffff" : "var(--draw-text)"};
          }

          .drawing-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .drawing-cell {
            position: relative;
            height: 64px;
            border-top: 1px solid var(--draw-soft-border);
            border-right: 1px solid var(--draw-soft-border);
            background: var(--draw-cell);
          }

          .drawing-cell:nth-child(3n) {
            border-right: 0;
          }

          .drawing-cell-button {
            display: grid;
            width: 100%;
            height: 100%;
            place-items: center;
            color: var(--draw-accent);
            transition: background 220ms ease, color 220ms ease, box-shadow 220ms ease;
          }

          .drawing-cell-button:hover,
          .drawing-cell-button.is-active {
            background: var(--draw-cell-hover);
            color: var(--draw-text);
            box-shadow: none;
          }

          .drawing-fav-button {
            position: absolute;
            right: 8px;
            top: 6px;
            z-index: 2;
            color: var(--draw-muted);
            font-size: 14px;
            line-height: 1;
            transition: color 200ms ease, transform 200ms ease;
          }

          .drawing-fav-button:hover,
          .drawing-fav-button.is-active {
            color: #6b7280;
            transform: scale(1.08);
          }

          .drawing-color-row {
            display: flex;
            gap: 7px;
            align-items: center;
            padding: 7px 8px;
            border-top: 1px solid var(--draw-soft-border);
          }

          .drawing-swatch {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.34);
            border-radius: 999px;
            transition: transform 180ms ease, box-shadow 180ms ease;
          }

          .drawing-swatch.is-active {
            transform: scale(1.12);
            box-shadow: 0 0 0 3px rgba(107, 114, 128, 0.32);
          }

          .chart-watermark {
            color: ${theme === "light" ? "rgba(17, 19, 24, 0.18)" : "rgba(255, 255, 255, 0.035)"};
          }
        `}
      </style>
      {!compact && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="chart-watermark select-none text-[52px] font-black tracking-widest">
            {symbol.replace("USDT", "")}
          </div>
        </div>
      )}

      {toolsEnabled && (
        <div className={`chart-control-menu ${toolPanelThemeClass} fixed left-1/2 top-4 z-[9999] w-[330px] max-w-[calc(100vw-28px)] -translate-x-1/2 overflow-hidden text-center`}>
          <div className="tool-tabs">
            <button
              type="button"
              onClick={() => setActiveToolPanel((value) => (value === "tf" ? null : "tf"))}
              className={`tool-tab ${activeToolPanel === "tf" ? "is-active" : ""}`}
            >
              TF
            </button>
            <button
              type="button"
              onClick={() => setActiveToolPanel((value) => (value === "draw" ? null : "draw"))}
              className={`tool-tab grid place-items-center ${activeToolPanel === "draw" ? "is-active" : ""}`}
              title="Drawing tools"
            >
              <svg viewBox="0 0 42 24" className="h-5 w-9" aria-hidden="true">
                <path
                  d="M4 19 C 11 4, 18 21, 25 8 S 36 6, 38 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                updateDrawings((prev) => prev.slice(0, -1));
                resetDraftDrawing();
                trajectoryLastPointRef.current = null;
              }}
              disabled={drawings.length === 0}
              className="tool-tab disabled:pointer-events-none disabled:opacity-35"
              title="Undo drawing"
            >
              DO
            </button>
          </div>

          {activeToolPanel === "tf" && timeframeControls && (
            <div
              className="tf-row"
              style={{
                gridTemplateColumns: `repeat(${timeframeControls.visible.length}, minmax(44px, 1fr))`,
              }}
            >
              {timeframeControls.visible.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => timeframeControls.onChange(item)}
                  className={`tf-cell ${timeframeControls.active === item ? "is-active" : ""}`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          {activeToolPanel === "draw" && (
            <>
            <div className="drawing-grid">
              {DRAWING_TABLE_ITEMS.map((item, index) => (
                <div
                  key={item.kind === "clear" ? item.id : item.tool}
                  className="drawing-cell"
                >
                  {item.kind === "tool" && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavoriteDrawingTool(item.tool);
                      }}
                      className={`drawing-fav-button ${
                        favoriteDrawingTools.includes(item.tool) ? "is-active" : ""
                      }`}
                      title={
                        favoriteDrawingTools.includes(item.tool)
                          ? "Remove from drawing favorites"
                          : "Add to drawing favorites"
                      }
                    >
                      ★
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === "clear") {
                        updateDrawings(() => []);
                        resetDraftDrawing();
                        trajectoryLastPointRef.current = null;
                        redrawChart();
                        return;
                      }

                      selectDrawingTool(item.tool);
                    }}
                    disabled={item.kind === "clear" && drawings.length === 0 && !draftDrawing}
                    className={`drawing-cell-button disabled:pointer-events-none disabled:opacity-35 ${
                      item.kind === "tool" && drawingTool === item.tool ? "is-active" : ""
                    }`}
                    title={item.title}
                  >
                    <DrawingPanelIcon
                      item={item}
                      active={item.kind === "tool" && drawingTool === item.tool}
                    />
                  </button>
                </div>
              ))}
            </div>
            <div className="drawing-color-row">
              {DRAWING_RAINBOW_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`drawing-swatch ${selectedDrawingColor === color ? "is-active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedDrawingColor(color)}
                  title={`Drawing color ${color}`}
                />
              ))}
              <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.12em] opacity-60">
                Ruler auto
              </span>
            </div>
            </>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1" onWheel={zoomChartWithWheel}>
      {toolsEnabled && (
        <div
          className={`absolute left-0 top-0 z-[70] flex max-w-[calc(100%-48px)] items-start gap-1 rounded-br-md border-b border-r p-1 shadow-sm backdrop-blur ${
            theme === "light"
              ? "border-slate-300/80 bg-white/90"
              : "border-white/15 bg-black/88"
          }`}
        >
          <div
            className={`grid size-7 shrink-0 place-items-center text-sm leading-none ${
              favoriteDrawingItems.length > 0
                ? "text-gray-500"
                : theme === "light"
                  ? "text-slate-400"
                  : "text-white/38"
            }`}
            title="Drawing favorites"
          >
            ★
          </div>
          {favoriteDrawingItems.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {favoriteDrawingItems.map((item) => (
                <button
                  key={item.tool}
                  type="button"
                  onClick={() => selectDrawingTool(item.tool)}
                  className={`grid size-7 place-items-center rounded border transition ${
                    drawingTool === item.tool
                      ? theme === "light"
                        ? "border-gray-400 bg-gray-100 text-gray-500"
                        : "border-white/25 bg-white/10 text-gray-300"
                      : theme === "light"
                        ? "border-slate-300 text-gray-500 hover:border-gray-400 hover:bg-slate-100"
                        : "border-white/15 text-gray-400 hover:border-white/30 hover:bg-white/10"
                  }`}
                  title={item.title}
                >
                  <DrawingPanelIcon
                    item={item}
                    active={drawingTool === item.tool}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <Chart
        className="!h-full !w-full"
        ref={chartRef}
        type="candlestick"
        data={{
          datasets: [
            {
              type: "candlestick" as const,
              label: symbol,
              data: candles,
              borderWidth: compact ? 1.25 : 1.65,
              ...candleColors,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          devicePixelRatio: chartPixelRatio,
          animation: false,
          parsing: false,
          normalized: true,
          interaction: {
            mode: "nearest",
            intersect: false,
          },
          scales: {
            x: {
              type: "time",
              offset: false,
              min: activeXRange?.min,
              max: activeXRange?.max ?? newestVisibleTime,
              ticks: {
                autoSkip: true,
                maxTicksLimit,
                color: chartTheme.tick,
                font: {
                  family: CHART_FONT_FAMILY,
                  size: compact ? 9 : 10,
                  weight: "bold",
                },
              },
              grid: {
                color: chartTheme.grid,
                lineWidth: 1,
              },
              border: {
                color: chartTheme.gridStrong,
                width: 1,
              },
            },
            y: {
              position: "right",
              min: activeYRange?.min ?? (candles.length ? autoYMin : undefined),
              max: activeYRange?.max ?? (candles.length ? autoYMax : undefined),
              ticks: {
                color: chartTheme.tick,
                maxTicksLimit,
                stepSize: currentYRange ? undefined : yStep,
                callback: (value) => formatAxisPrice(Number(value), yStep),
                font: {
                  family: CHART_FONT_FAMILY,
                  size: compact ? 9 : 10,
                  weight: "bold",
                },
              },
              grid: {
                color: chartTheme.grid,
                lineWidth: 1,
              },
              border: {
                color: chartTheme.gridStrong,
                width: 1,
              },
            },
          },
          plugins: {
            legend: {
              display: !compact,
              position: "top",
              labels: {
                color: chartTheme.legend,
                boxWidth: 10,
                boxHeight: 10,
                font: {
                  family: CHART_FONT_FAMILY,
                  size: 10,
                },
              },
            },
            tooltip: {
              enabled: false,
              backgroundColor: "rgba(17,17,22,0.94)",
              titleColor: "#ffffff",
              bodyColor: "#d1d5db",
              borderColor: "rgba(34,171,148,0.45)",
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              mode: "nearest",
              intersect: false,
              titleFont: {
                family: CHART_FONT_FAMILY,
                weight: "bold",
              },
              bodyFont: {
                family: CHART_FONT_FAMILY,
              },
            },
            zoom: {
              limits: {
                x:
                  oldestScrollableTime !== undefined &&
                  newestScrollableTime !== undefined &&
                  newestScrollableTime > oldestScrollableTime
                    ? {
                        min: oldestScrollableTime,
                        max: newestScrollableTime,
                        minRange: candleSpacing * 10,
                      }
                    : undefined,
              },
              pan: {
                enabled: true,
                mode: "xy",
                threshold: 0,
                onPan: compact ? ({ chart }: ZoomEvent) => clampLiveChartXRange(chart) : undefined,
                onPanComplete: rememberChartRange,
              },
              zoom: {
                onZoomComplete: rememberChartRange,
                wheel: {
                  enabled: true,
                  speed: 0.06,
                },
                pinch: {
                  enabled: true,
                },
                mode: "x",
              },
            },
          },
        }}
        plugins={[drawingPlugin]}
      />

      {toolsEnabled && (
      <div
        aria-label="Draw on chart"
        className={`absolute bottom-0 left-0 right-11 top-0 z-40 ${
          (drawingTool === "cursor" && !shiftPressed) ||
          (drawingTool === "ruler" && !shiftPressed && !draftDrawing)
            ? "pointer-events-none"
            : "cursor-crosshair touch-none"
        }`}
        onPointerDown={startDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={cancelDrawing}
        onContextMenu={openDrawingColorMenu}
      />
      )}

      {drawingColorMenu && (
        <div
          className="fixed z-[10000] w-32 rounded-md border border-white/10 bg-[#08040d]/95 p-2 shadow-[0_0_22px_rgba(209,91,255,0.24)] backdrop-blur"
          style={{
            left: Math.min(drawingColorMenu.x, window.innerWidth - 136),
            top: Math.min(drawingColorMenu.y, window.innerHeight - 116),
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {drawingColorMenu.tool !== "ruler" && (
            <div className="grid grid-cols-4 gap-1">
              {DRAWING_RAINBOW_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="size-6 rounded-sm border border-white/20 transition hover:scale-110 hover:border-white"
                  style={{ backgroundColor: color }}
                  onClick={() => setDrawingColor(drawingColorMenu.drawingId, color)}
                  aria-label={`Set drawing color ${color}`}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className={`${drawingColorMenu.tool === "ruler" ? "" : "mt-2"} flex w-full items-center justify-center gap-1 rounded-sm border border-[#ff576d]/30 bg-[#ff576d]/10 px-2 py-1.5 text-[11px] font-bold text-[#ff8b9a] transition hover:bg-[#ff576d]/18 hover:text-white`}
            onClick={() => deleteDrawing(drawingColorMenu.drawingId)}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M8 8V19M12 8V19M16 8V19M5 6H19M9 6V4H15V6M7 6L8 21H16L17 6"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.9"
              />
            </svg>
            Delete
          </button>
        </div>
      )}

      <div
        aria-label="Drag price scale"
        className="absolute bottom-0 right-0 top-0 z-50 w-11 cursor-ns-resize"
        onPointerDown={startYScaleDrag}
        onPointerMove={dragYScale}
        onPointerUp={stopYScaleDrag}
        onPointerCancel={stopYScaleDrag}
        onDoubleClick={() => setYRange(null)}
        title="Drag price scale"
      />
      </div>

      <div className={`${compact ? "h-[18%] min-h-8 max-h-14" : "h-[19%] min-h-14 max-h-28"} shrink-0 border-t border-white/[0.06] bg-[#111116] px-1 pb-1 pt-1`}>
        <div className="mb-0.5 flex h-3 items-center justify-between px-1 text-[9px] font-semibold text-[#8b949e]">
          <span>Объём</span>
          <span className="text-[#22ab94]">
            {maxVolume >= 1_000_000
              ? `${(maxVolume / 1_000_000).toFixed(1)}M`
              : maxVolume >= 1_000
                ? `${(maxVolume / 1_000).toFixed(1)}K`
                : maxVolume.toFixed(0)}
          </span>
        </div>
        <div className="flex h-[calc(100%-14px)] items-end gap-px overflow-hidden">
          {renderedVolumeCandles.map((candle) => {
            const volume = Math.max(0, Number(candle.v ?? 0));
            const height = Math.max(2, (volume / maxVolume) * 100);
            const isUp = candle.c >= candle.o;

            return (
              <div
                key={`${candle.x}-${volume}`}
                className="min-w-px flex-1 opacity-55"
                style={{
                  height: `${height}%`,
                  backgroundColor: isUp ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
