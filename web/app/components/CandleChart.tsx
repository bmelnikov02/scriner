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

type Props = {
  symbol: string;
  candles: Candle[];
  heightClass?: string;
  timeframe?: string;
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
const DRAWING_WINDOW_SIZE = 5;
const DRAWING_LINE_COLOR = "#d15bff";
const DRAWING_ACTIVE_COLOR = "#ff74d6";
const DRAWING_FILL_COLOR = "rgba(255, 79, 216, 0.16)";
const LOGO_COLOR = "#c8b6dc";
const CURRENT_PRICE_LINE_COLOR = LOGO_COLOR;
const CHART_BACKGROUND_COLOR = "#111116";
const CHART_GRID_COLOR = "rgba(255,255,255,0.06)";
const CHART_GRID_STRONG_COLOR = "rgba(255,255,255,0.095)";
const CANDLE_UP_COLOR = "#089981";
const CANDLE_DOWN_COLOR = "#f23645";
const CANDLE_UNCHANGED_COLOR = "#d1a83a";

function formatLinePrice(value: number) {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatSignedLinePrice(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatLinePrice(Math.abs(value))}`;
}

function getTickPrecision(step: number) {
  if (step >= 1) return 0;
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(step)) + 1));
}

function formatAxisPrice(value: number, step: number) {
  return value.toFixed(getTickPrecision(step));
}

function formatRulerTime(ms: number) {
  const absMs = Math.abs(ms);
  const minutes = Math.round(absMs / 60_000);

  if (minutes < 60) return `${minutes}m`;

  const hours = minutes / 60;

  if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;

  const days = hours / 24;

  return `${days.toFixed(days >= 10 ? 0 : 1)}d`;
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
  item: DrawingPanelItem;
  active: boolean;
}) {
  const color =
    item.kind === "tool" && item.tool === "cursor"
      ? LOGO_COLOR
      : active
        ? "#ffffff"
        : "#e7a8ff";

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
          stroke="#b56cff"
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
          fill="rgba(255,79,216,0.16)"
          stroke={color}
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (item.tool === "ruler") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M5 18L18 5"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          d="M7 16L9 18M10 13L12 15M13 10L15 12M16 7L18 9"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="1.4"
        />
      </svg>
    );
  }

  if (item.tool === "triangle") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M12 5L20 19H4Z"
          fill="rgba(255,79,216,0.16)"
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
  compact = false,
  showTools = false,
  timeframeControls,
  drawings: controlledDrawings,
  onDrawingsChange,
  onNeedOlderCandles,
}: Props) {
  const chartRef = useRef<ChartJS | null>(null);
  const yScaleDragRef = useRef<YScaleDrag | null>(null);
  const drawingStartRef = useRef<DrawingPoint | null>(null);
  const drawingIdRef = useRef(0);
  const cursorPriceRef = useRef<number | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const draftDrawingRef = useRef<Drawing | null>(null);
  const toolsEnabledRef = useRef(false);
  const trajectoryLastPointRef = useRef<DrawingPoint | null>(null);
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

        ctx.font = "700 10px Arial, Helvetica, sans-serif";
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
        ctx.font = "700 10px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + labelWidth / 2, labelY + labelHeight / 2);
        ctx.restore();
      };
      const drawLine = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
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

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = draft ? 2.5 : 3;
        ctx.strokeStyle = DRAWING_LINE_COLOR;
        ctx.lineCap = "round";
        ctx.shadowBlur = 9;
        ctx.shadowColor = DRAWING_LINE_COLOR;

        if (draft) {
          ctx.setLineDash([7, 5]);
        }

        ctx.stroke();
        ctx.restore();
      };
      const drawHorizontalLabel = (y: number, price: number, draft: boolean) => {
        if (!Number.isFinite(y) || !Number.isFinite(price)) return;

        const text = `${symbol.replace("USDT", "")} ${formatLinePrice(price)}`;

        ctx.save();
        ctx.font = "700 11px Arial, Helvetica, sans-serif";
        const paddingX = 6;
        const labelHeight = 20;
        const labelWidth = Math.ceil(ctx.measureText(text).width + paddingX * 2);
        const x = Math.max(chartArea.left + 4, chartArea.right - labelWidth - 6);
        const labelY = Math.min(
          Math.max(chartArea.top + 4, y - labelHeight / 2),
          chartArea.bottom - labelHeight - 4
        );

        ctx.shadowBlur = draft ? 10 : 7;
        ctx.shadowColor = DRAWING_LINE_COLOR;
        ctx.fillStyle = draft ? "rgba(255,79,216,0.24)" : "rgba(12,6,18,0.92)";
        ctx.strokeStyle = DRAWING_LINE_COLOR;
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

        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        ctx.save();
        ctx.fillStyle = DRAWING_FILL_COLOR;
        ctx.strokeStyle = draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR;
        ctx.lineWidth = draft ? 2.2 : 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = DRAWING_LINE_COLOR;

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

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const centerX = left + (right - left) / 2;

        ctx.save();
        ctx.fillStyle = DRAWING_FILL_COLOR;
        ctx.strokeStyle = draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR;
        ctx.lineWidth = draft ? 2.2 : 2;
        ctx.lineJoin = "round";
        ctx.shadowBlur = 8;
        ctx.shadowColor = DRAWING_LINE_COLOR;

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

        const priceDiff = end.y - start.y;
        const percentDiff = start.y !== 0 ? (priceDiff / start.y) * 100 : 0;
        const timeDiff = end.x - start.x;
        const label = `${formatSignedLinePrice(priceDiff)} (${
          percentDiff >= 0 ? "+" : ""
        }${percentDiff.toFixed(2)}%)  ${formatRulerTime(
          timeDiff
        )}`;
        const labelX = Math.min(
          Math.max(chartArea.left + 6, (x1 + x2) / 2),
          chartArea.right - 6
        );
        const labelY = Math.min(
          Math.max(chartArea.top + 18, (y1 + y2) / 2 - 14),
          chartArea.bottom - 8
        );

        ctx.save();
        ctx.strokeStyle = draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR;
        ctx.fillStyle = draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR;
        ctx.lineWidth = draft ? 2.4 : 2.2;
        ctx.lineCap = "round";
        ctx.shadowBlur = 8;
        ctx.shadowColor = DRAWING_LINE_COLOR;

        if (draft) {
          ctx.setLineDash([7, 5]);
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        [x1, x2].forEach((x, index) => {
          const y = index === 0 ? y1 : y2;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.shadowBlur = 0;
        ctx.font = "700 11px Arial, Helvetica, sans-serif";
        const paddingX = 7;
        const labelHeight = 20;
        const labelWidth = Math.ceil(ctx.measureText(label).width + paddingX * 2);
        const left = Math.min(
          Math.max(chartArea.left + 4, labelX - labelWidth / 2),
          chartArea.right - labelWidth - 4
        );

        ctx.fillStyle = "rgba(12,6,18,0.92)";
        ctx.strokeStyle = DRAWING_LINE_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(left, labelY - labelHeight / 2, labelWidth, labelHeight, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#f4d8ff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, left + labelWidth / 2, labelY);
        ctx.restore();
      };
      const drawArrow = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
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

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 14;

        ctx.save();
        ctx.strokeStyle = draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR;
        ctx.fillStyle = draft ? DRAWING_ACTIVE_COLOR : DRAWING_LINE_COLOR;
        ctx.lineWidth = draft ? 2.5 : 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 9;
        ctx.shadowColor = DRAWING_LINE_COLOR;

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
          drawLine(chartArea.left, startY, chartArea.right, startY, draft);
          drawHorizontalLabel(startY, item.start.y, draft);
          return;
        }

        if (item.tool === "vertical") {
          drawLine(startX, chartArea.top, startX, chartArea.bottom, draft);
          return;
        }

        const endX = xScale.getPixelForValue(item.end.x);
        const endY = yScale.getPixelForValue(item.end.y);

        if (item.tool === "rectangle") {
          drawRectangle(startX, startY, endX, endY, draft);
          return;
        }

        if (item.tool === "triangle") {
          drawTriangle(startX, startY, endX, endY, draft);
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

          drawArrow(startX, startY, arrowEndX, arrowEndY, draft);
          return;
        }

        drawLine(startX, startY, endX, endY, draft);
      });

      drawCurrentPriceLine();
      drawCursorPriceLabel();
    },
  }));
  const [xRange, setXRange] = useState<XRange | null>(null);
  const [yRange, setYRange] = useState<YRange | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("cursor");
  const [activeToolPanel, setActiveToolPanel] = useState<"tf" | "draw" | null>(null);
  const [drawingWindowStart, setDrawingWindowStart] = useState(0);
  const [localDrawings, setLocalDrawings] = useState<Drawing[]>([]);
  const [draftDrawing, setDraftDrawing] = useState<Drawing | null>(null);
  const [shiftPressed, setShiftPressed] = useState(false);
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
  const canShiftDrawingLeft = drawingWindowStart > 0;
  const canShiftDrawingRight =
    drawingWindowStart < DRAWING_PANEL_ITEMS.length - DRAWING_WINDOW_SIZE;
  const currentXRange =
    xRange?.symbol === symbol && xRange.timeframe === timeframe ? xRange : null;
  const currentYRange =
    yRange?.symbol === symbol && yRange.timeframe === timeframe ? yRange : null;
  const visibleVolumeCandles = candles.filter(
    (candle) =>
      !currentXRange ||
      (candle.x >= currentXRange.min && candle.x <= currentXRange.max)
  );
  const volumeCandles =
    visibleVolumeCandles.length > 0 ? visibleVolumeCandles : candles;
  const maxVolume = Math.max(
    1,
    ...volumeCandles.map((candle) => Number(candle.v ?? 0))
  );
  const oldestCandleTime = candles[0]?.x;
  const newestCandleTime = candles.at(-1)?.x;
  const candleSpacing = getRecentCandleSpacing(candles);
  const rightCandlePadding = candleSpacing * (compact ? 5 : 8);
  const newestVisibleTime =
    newestCandleTime !== undefined ? newestCandleTime + rightCandlePadding : undefined;
  const loadedXRange =
    oldestCandleTime !== undefined &&
    newestVisibleTime !== undefined &&
    newestVisibleTime > oldestCandleTime
      ? newestVisibleTime - oldestCandleTime
      : 0;
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
      loadedXRange <= 0
    ) {
      return null;
    }

    const visibleRange = range.max - range.min;

    if (!Number.isFinite(visibleRange) || visibleRange <= 0) return null;

    if (visibleRange >= loadedXRange) {
      return {
        symbol,
        timeframe,
        min: oldestCandleTime,
        max: newestVisibleTime,
      };
    }

    const hasCandlesInView =
      range.max >= oldestCandleTime && range.min <= newestVisibleTime;
    const emptyLeft = Math.max(0, oldestCandleTime - range.min);
    const emptyRight = Math.max(0, range.max - newestVisibleTime);
    const tooMuchEmptySpace =
      !hasCandlesInView ||
      emptyLeft > visibleRange * 0.08 ||
      emptyRight > visibleRange * 0.08;

    if (!tooMuchEmptySpace) return null;

    if (range.max < oldestCandleTime || emptyLeft > 0) {
      return {
        symbol,
        timeframe,
        min: oldestCandleTime,
        max: oldestCandleTime + visibleRange,
      };
    }

    return {
      symbol,
      timeframe,
      min: newestVisibleTime - visibleRange,
      max: newestVisibleTime,
    };
  }

  useEffect(() => {
    if (!currentXRange) return;

    requestOlderCandlesIfNeeded(currentXRange.min);
  }, [candles, currentXRange]);

  useEffect(() => {
    if (!currentXRange || candles.length < 2) return;

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
  }, [candles, currentXRange, loadedXRange, oldestCandleTime, newestVisibleTime]);

  function redrawChart() {
    window.requestAnimationFrame(() => chartRef.current?.draw());
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

    redrawChart();
  }

  function clearCursorPrice() {
    cursorPriceRef.current = null;
    redrawChart();
  }

  useEffect(() => {
    drawingsRef.current = drawings;
    draftDrawingRef.current = draftDrawing;
    toolsEnabledRef.current = toolsEnabled;
    redrawChart();
  }, [drawings, draftDrawing, toolsEnabled]);

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
    window.requestAnimationFrame(() => {
      chartRef.current?.resize();
      chartRef.current?.update("none");
      chartRef.current?.draw();
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

  function rememberChartRange({ chart }: ZoomEvent) {
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    if (!xScale || !yScale) return;

    setXRange((prev) => {
      if (
        prev?.symbol === symbol &&
        prev.timeframe === timeframe &&
        prev.min === xScale.min &&
        prev.max === xScale.max
      ) {
        return prev;
      }

      return {
        symbol,
        timeframe,
        min: xScale.min,
        max: xScale.max,
      };
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

    requestOlderCandlesIfNeeded(xScale.min);

    redrawChart();
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

  function startDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    const target = getDrawingTarget(event);

    if (!target) return;

    event.preventDefault();
    event.stopPropagation();

    if (drawingTool === "horizontal" || drawingTool === "vertical") {
      addStraightDrawing(target, drawingTool);
      resetDraftDrawing();
      trajectoryLastPointRef.current = null;
      return;
    }

    if (drawingTool === "trajectory") {
      const previousPoint = trajectoryLastPointRef.current;

      if (previousPoint) {
        updateDrawings((prev) => [
          ...prev,
          {
            id: nextDrawingId(),
            tool: "trajectory",
            start: previousPoint,
            end: target,
          },
        ]);
      }

      trajectoryLastPointRef.current = target;

      const draft: Drawing = {
        id: nextDrawingId(),
        tool: "trajectory",
        start: target,
        end: target,
      };

      setDraftDrawing(draft);
      draftDrawingRef.current = draft;
      redrawChart();
      return;
    }

    if (!isDragDrawingTool(drawingTool)) return;
    if (drawingTool === "ruler" && !event.shiftKey) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drawingStartRef.current = target;

    const draft: Drawing = {
      id: nextDrawingId(),
      tool: drawingTool,
      start: target,
      end: target,
    };

    setDraftDrawing(draft);
    draftDrawingRef.current = draft;
    redrawChart();
  }

  function moveDrawing(event: React.PointerEvent<HTMLDivElement>) {
    const point = getDrawingTarget(event);

    if (!point) return;

    if (drawingTool === "trajectory") {
      const start = trajectoryLastPointRef.current;

      if (!start) return;

      event.preventDefault();
      event.stopPropagation();
      const nextDraft: Drawing = {
        id: draftDrawingRef.current?.id ?? nextDrawingId(),
        tool: "trajectory",
        start,
        end: point,
      };

      setDraftDrawing(nextDraft);
      draftDrawingRef.current = nextDraft;
      redrawChart();
      return;
    }

    if (!isDragDrawingTool(drawingTool)) return;

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
    if (!isDragDrawingTool(drawingTool)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const start = drawingStartRef.current;
    const point = getDrawingTarget(event);

    if (start) {
      updateDrawings((prev) => [
          ...prev,
          {
            id: nextDrawingId(),
            tool: drawingTool,
            start,
            end: point ?? draftDrawing?.end ?? start,
          },
        ]);
    }

    setDraftDrawing(null);
    draftDrawingRef.current = null;
    drawingStartRef.current = null;
    redrawChart();
  }

  function stopTrajectory(event: React.MouseEvent<HTMLDivElement>) {
    if (drawingTool !== "trajectory") return;

    event.preventDefault();
    event.stopPropagation();
    trajectoryLastPointRef.current = null;
    resetDraftDrawing();
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

    const factor = Math.exp((event.clientY - drag.startY) * 0.006);
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
      style={{ backgroundColor: CHART_BACKGROUND_COLOR }}
      onPointerMove={updateCursorPrice}
      onPointerLeave={clearCursorPrice}
    >
      {!compact && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="select-none text-[52px] font-black tracking-widest text-white/[0.035]">
            {symbol.replace("USDT", "")}
          </div>
        </div>
      )}

      {toolsEnabled && (
        <div className="fixed left-1/2 top-5 z-[9999] w-[330px] -translate-x-1/2 overflow-hidden rounded-md border border-white/10 bg-[#061014]/95 text-center shadow-[0_0_30px_rgba(209,91,255,0.2)] backdrop-blur">
          <div className="grid grid-cols-3 border-b border-white/10 text-[11px] font-black">
            <button
              type="button"
              onClick={() => setActiveToolPanel((value) => (value === "tf" ? null : "tf"))}
              className={`h-8 border-r border-white/10 transition ${
                activeToolPanel === "tf"
                  ? "bg-[#c8b6dc] text-black"
                  : "text-white/75 hover:bg-white/[0.06]"
              }`}
            >
              TF
            </button>
            <button
              type="button"
              onClick={() => setActiveToolPanel((value) => (value === "draw" ? null : "draw"))}
              className={`grid h-8 place-items-center border-r border-white/10 transition ${
                activeToolPanel === "draw"
                  ? "bg-[#d15bff]/25 text-[#ffd6fb]"
                  : "text-white/75 hover:bg-white/[0.06]"
              }`}
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
              className="h-8 text-white/75 transition hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-35"
              title="Undo drawing"
            >
              DO
            </button>
          </div>

          {activeToolPanel === "tf" && timeframeControls && (
            <div className="grid grid-cols-[32px_repeat(5,minmax(0,1fr))_32px] border-b border-white/10 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => timeframeControls.onShift(-1)}
                disabled={!timeframeControls.canShiftLeft}
                className="h-8 border-r border-white/10 text-base font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/10 disabled:text-white/20 disabled:hover:bg-transparent"
              >
                {"<"}
              </button>
              {timeframeControls.visible.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => timeframeControls.onChange(item)}
                  className={`h-8 border-r border-white/10 transition ${
                    timeframeControls.active === item
                      ? "bg-[#c8b6dc] text-black"
                      : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => timeframeControls.onShift(1)}
                disabled={!timeframeControls.canShiftRight}
                className="h-8 text-base font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/10 disabled:text-white/20 disabled:hover:bg-transparent"
              >
                {">"}
              </button>
            </div>
          )}

          {activeToolPanel === "draw" && (
            <div className="grid grid-cols-3 bg-[#120817]/78 text-[#f1c7ff]">
              {DRAWING_TABLE_ITEMS.map((item, index) => (
                <button
                  key={item.kind === "clear" ? item.id : item.tool}
                  type="button"
                  onClick={() => {
                    if (item.kind === "clear") {
                      updateDrawings(() => []);
                      resetDraftDrawing();
                      trajectoryLastPointRef.current = null;
                      redrawChart();
                      return;
                    }

                    setDrawingTool(item.tool);
                    resetDraftDrawing();
                    trajectoryLastPointRef.current = null;
                    redrawChart();
                  }}
                  disabled={item.kind === "clear" && drawings.length === 0 && !draftDrawing}
                  className={`grid h-14 place-items-center border-t border-[#d15bff]/30 transition ${
                    index % 3 !== 2 ? "border-r border-[#d15bff]/30" : ""
                  } disabled:pointer-events-none disabled:opacity-35 ${
                    item.kind === "tool" && drawingTool === item.tool
                      ? item.tool === "cursor"
                        ? "bg-[#c8b6dc]/18 text-[#c8b6dc] shadow-[inset_0_0_18px_rgba(200,182,220,0.16)]"
                        : "bg-[#d15bff]/24 text-white shadow-[inset_0_0_18px_rgba(255,79,216,0.18)]"
                      : "text-[#e7a8ff] hover:bg-[#d15bff]/12 hover:text-white"
                  }`}
                  title={item.title}
                >
                  <DrawingPanelIcon
                    item={item}
                    active={item.kind === "tool" && drawingTool === item.tool}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
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
              borderWidth: compact ? 1 : 1.2,
              ...candleColors,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 180,
          },
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
              min: currentXRange?.min,
              max: currentXRange?.max ?? newestVisibleTime,
              ticks: {
                autoSkip: true,
                maxTicksLimit,
                color: "#6f7681",
                font: {
                  size: compact ? 9 : 10,
                },
              },
              grid: {
                color: CHART_GRID_COLOR,
              },
              border: {
                color: CHART_GRID_STRONG_COLOR,
              },
            },
            y: {
              position: "right",
              min: currentYRange?.min ?? (candles.length ? autoYMin : undefined),
              max: currentYRange?.max ?? (candles.length ? autoYMax : undefined),
              ticks: {
                color: "#8b949e",
                maxTicksLimit,
                stepSize: currentYRange ? undefined : yStep,
                callback: (value) => formatAxisPrice(Number(value), yStep),
                font: {
                  size: compact ? 9 : 10,
                },
              },
              grid: {
                color: CHART_GRID_COLOR,
              },
              border: {
                color: CHART_GRID_STRONG_COLOR,
              },
            },
          },
          plugins: {
            legend: {
              display: !compact,
              position: "top",
              labels: {
                color: "#8b949e",
                boxWidth: 10,
                boxHeight: 10,
                font: {
                  size: 10,
                },
              },
            },
            tooltip: {
              enabled: true,
              backgroundColor: "rgba(17,17,22,0.94)",
              titleColor: "#ffffff",
              bodyColor: "#d1d5db",
              borderColor: "rgba(34,171,148,0.45)",
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              mode: "nearest",
              intersect: false,
            },
            zoom: {
              limits: {
                x:
                  oldestCandleTime !== undefined &&
                  newestVisibleTime !== undefined &&
                  newestVisibleTime > oldestCandleTime
                    ? {
                        min: oldestCandleTime,
                        max: newestVisibleTime,
                      }
                    : undefined,
              },
              pan: {
                enabled: true,
                mode: "xy",
                threshold: 1,
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
          drawingTool === "cursor" ||
          (drawingTool === "ruler" && !shiftPressed && !draftDrawing)
            ? "pointer-events-none"
            : "cursor-crosshair touch-none"
        }`}
        onPointerDown={startDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={cancelDrawing}
        onContextMenu={stopTrajectory}
      />
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
          {volumeCandles.map((candle) => {
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
