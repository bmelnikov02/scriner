"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, CSSProperties } from "react";
import type { ChartDrawing } from "./components/CandleChart";
import OrderBook from "./components/OrderBook";

const CandleChartBase = dynamic(() => import("./components/CandleChart"), {
  ssr: false,
});
type CandleChartProps = ComponentProps<typeof CandleChartBase>;
const CandleChart = memo(
  CandleChartBase,
  (prev: CandleChartProps, next: CandleChartProps) => {
    const prevControls = prev.timeframeControls;
    const nextControls = next.timeframeControls;
    const sameControls =
      prevControls === nextControls ||
      Boolean(
        prevControls &&
          nextControls &&
          prevControls.active === nextControls.active &&
          prevControls.visible === nextControls.visible &&
          prevControls.canShiftLeft === nextControls.canShiftLeft &&
          prevControls.canShiftRight === nextControls.canShiftRight
      );

    return (
      prev.symbol === next.symbol &&
      prev.candles === next.candles &&
      prev.timeframe === next.timeframe &&
      prev.heightClass === next.heightClass &&
      prev.theme === next.theme &&
      prev.compact === next.compact &&
      prev.showTools === next.showTools &&
      prev.drawings === next.drawings &&
      prev.limitLines === next.limitLines &&
      sameControls
    );
  }
);

type Row = {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
};

type Candle = {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

type DepthLevel = [string, string];

type DepthData = {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
};

type LimitLine = {
  price: number;
  quantity: string;
  notional: number;
  side: "bid" | "ask";
  strength: number;
};

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type CoinSortMode = "volume" | "alphabet" | "pump" | "dump";
type DrawingsByChart = Record<string, ChartDrawing[]>;
type FavoriteColors = Record<string, string>;
type SiteStyle = "dark" | "light";
type SiteThemeStyle = CSSProperties & Record<`--${string}`, string>;
type SettingsTab =
  | "telegram"
  | "support"
  | "notifications"
  | "timeframe"
  | "charts"
  | "style"
  | "density"
  | "about";
type AlertToast = {
  id: string;
  symbol: string;
  timeframe: string;
  message: string;
  kind: "pump" | "damp" | "level";
  createdAt: number;
};
type PriceSample = {
  price: number;
  time: number;
};
type FloatingMenu =
  | "timeframe"
  | "alerts"
  | "grid"
  | "favorites"
  | "volatility"
  | "settings";
type ChartPageMotion = "idle" | "next" | "prev";

type SavedWorkspace = {
  activeView?: "overview" | "favorites";
  alertsEnabled?: boolean;
  coinSortMode?: CoinSortMode;
  drawingsByChart?: DrawingsByChart;
  favoriteColors?: FavoriteColors;
  favorites?: string[];
  gridCount?: number;
  pageIndex?: number;
  siteStyle?: SiteStyle;
  customTimeframes?: string[];
  alertThresholdPercent?: number;
  alertWindowMinutes?: number;
};

type WsMessage =
  | { event: "ticker:update"; data: Row }
  | {
      event: "candle:update";
      data: {
        symbol: string;
        interval: string;
        candle: {
          x: number;
          o: number | string;
          h: number | string;
          l: number | string;
          c: number | string;
          v?: number | string;
        };
      };
    }
  | {
      event: "depth:update";
      data: DepthData;
    };

const GRID_COUNTS = Array.from({ length: 12 }, (_, index) => index + 1);
const GRID_WINDOW_SIZE = 6;
const DEFAULT_GRID_WINDOW_START = 3;
const BASE_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
const EXTRA_TIMEFRAMES = ["3m", "7m", "10m", "30m", "2h", "3h", "12h"];
const TIMEFRAME_WINDOW_SIZE = BASE_TIMEFRAMES.length;
const DEFAULT_TIMEFRAME_WINDOW_START = 0;
const MULTI_TIMEFRAMES = ["5m", "15m", "1h", "4h"];
const API_PORT = "4000";
const WORKSPACE_STORAGE_KEY = "scriner-workspace-v2";
const ALERT_COOLDOWN_MS = 45_000;
const ALERT_SOUND_SRC = "/sounds/sound-messages-odnoklassniki.mp3";
const DEFAULT_ALERT_THRESHOLD_PERCENT = 5;
const DEFAULT_ALERT_WINDOW_MINUTES = 1;
const GRID_CANDLE_LIMIT = 350;
const FULLSCREEN_CANDLE_LIMIT = 1000;
const OLDER_CANDLE_LIMIT = 500;
const BOOKMARK_COLORS = [
  "#2f80ed",
  "#c8b6dc",
  "#24e66f",
  "#ff576d",
  "#a855f7",
  "#f97316",
];
const EMPTY_DRAWINGS: ChartDrawing[] = [];
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "telegram", label: "\u041d\u0430\u0448 Telegram" },
  { id: "support", label: "\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430" },
  { id: "notifications", label: "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f" },
  { id: "timeframe", label: "\u0422\u0430\u0439\u043c\u0444\u0440\u0435\u0439\u043c" },
  { id: "charts", label: "\u0413\u0440\u0430\u0444\u0438\u043a\u0438" },
  { id: "style", label: "\u0421\u0442\u0438\u043b\u044c" },
  { id: "density", label: "Density" },
  { id: "about", label: "About" },
];
const SITE_STYLES: { id: SiteStyle; label: string }[] = [
  { id: "light", label: "\u0411\u0435\u043b\u044b\u0439" },
  { id: "dark", label: "\u0422\u0435\u043c\u043d\u044b\u0439" },
];

function SettingsTabIcon({ id }: { id: SettingsTab }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: "1.8",
  };

  if (id === "telegram") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path
          d="M21 4L3.8 10.8C2.7 11.2 2.8 12.8 4 13.1L8.4 14.2L10.1 19C10.5 20.1 12 20.3 12.6 19.3L15 15.5L19 18.4C20 19.1 21.3 18.5 21.4 17.3L23 5.3C23.2 4.4 22.1 3.6 21 4ZM8.4 14.2L18.7 7.4L10.1 19"
          {...common}
        />
      </svg>
    );
  }

  if (id === "support") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M4 13V11A8 8 0 0 1 20 11V13" {...common} />
        <path d="M4 13H6.5V18H4A2 2 0 0 1 2 16V15A2 2 0 0 1 4 13Z" {...common} />
        <path d="M20 13H17.5V18H20A2 2 0 0 0 22 16V15A2 2 0 0 0 20 13Z" {...common} />
        <path d="M17 19C16 20.3 14.4 21 12 21" {...common} />
      </svg>
    );
  }

  if (id === "notifications") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M18 9A6 6 0 0 0 6 9C6 16 3 17 3 17H21S18 16 18 9Z" {...common} />
        <path d="M10 21H14" {...common} />
      </svg>
    );
  }

  if (id === "timeframe") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="12" r="9" {...common} />
        <path d="M12 7V12L16 15" {...common} />
      </svg>
    );
  }

  if (id === "charts") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M4 19V5M4 19H20" {...common} />
        <path d="M7 15L11 11L14 13L20 7" {...common} />
      </svg>
    );
  }

  if (id === "style") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M4 20L14.5 9.5" {...common} />
        <path d="M13 6L18 11" {...common} />
        <path d="M15.5 3.5L20.5 8.5L18 11L13 6L15.5 3.5Z" {...common} />
      </svg>
    );
  }

  if (id === "density") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M5 5H10V10H5V5ZM14 5H19V10H14V5ZM5 14H10V19H5V14ZM14 14H19V19H14V14Z" {...common} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...common} />
      <path d="M12 11V17M12 7H12.01" {...common} />
    </svg>
  );
}

function VolumeBarsIcon() {
  return (
    <svg viewBox="0 0 28 24" className="h-5 w-6" aria-hidden="true">
      <rect
        x="3"
        y="9"
        width="7"
        height="11"
        rx="0.8"
        fill="#4f78ca"
        stroke="#315aa5"
        strokeWidth="1.6"
        opacity="0.78"
      />
      <rect
        x="10"
        y="3"
        width="8"
        height="17"
        rx="0.8"
        fill="#4f78ca"
        stroke="#315aa5"
        strokeWidth="1.6"
      />
      <rect
        x="18"
        y="7"
        width="7"
        height="13"
        rx="0.8"
        fill="#4f78ca"
        stroke="#315aa5"
        strokeWidth="1.6"
        opacity="0.86"
      />
    </svg>
  );
}

const FALLBACK_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "TONUSDT",
  "TRXUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "SUIUSDT",
  "1000PEPEUSDT",
  "1000BONKUSDT",
  "WIFUSDT",
  "FETUSDT",
  "INJUSDT",
  "ETCUSDT",
];

function normalizeCandle(candle: {
  x: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v?: number | string;
}): Candle {
  return {
    x: Number(candle.x),
    o: Number(candle.o),
    h: Number(candle.h),
    l: Number(candle.l),
    c: Number(candle.c),
    v: Number(candle.v ?? 0),
  };
}

function parseKlineCandles(data: unknown): Candle[] {
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const values = item as [number, string, string, string, string, string];

    return {
      x: values[0],
      o: Number(values[1]),
      h: Number(values[2]),
      l: Number(values[3]),
      c: Number(values[4]),
      v: Number(values[5] ?? 0),
    };
  });
}

function mergeCandles(current: Candle[], incoming: Candle[]) {
  const byTime = new Map<number, Candle>();

  [...current, ...incoming].forEach((candle) => {
    byTime.set(candle.x, candle);
  });

  return [...byTime.values()].sort((a, b) => a.x - b.x);
}

function getTimeframeMinutes(interval: string) {
  const match = /^(\d+)([mh])$/.exec(interval);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) return null;

  return unit === "h" ? value * 60 : value;
}

function shouldAggregateOnClient(interval: string) {
  return EXTRA_TIMEFRAMES.includes(interval);
}

function aggregateCandlesToTimeframe(candles: Candle[], interval: string) {
  const minutes = getTimeframeMinutes(interval);

  if (!minutes || minutes <= 1) return candles;

  const bucketMs = minutes * 60_000;
  const buckets = new Map<number, Candle>();

  candles.forEach((candle) => {
    const bucketTime = Math.floor(candle.x / bucketMs) * bucketMs;
    const current = buckets.get(bucketTime);

    if (!current) {
      buckets.set(bucketTime, {
        x: bucketTime,
        o: candle.o,
        h: candle.h,
        l: candle.l,
        c: candle.c,
        v: candle.v ?? 0,
      });
      return;
    }

    current.h = Math.max(current.h, candle.h);
    current.l = Math.min(current.l, candle.l);
    current.c = candle.c;
    current.v = (current.v ?? 0) + (candle.v ?? 0);
  });

  return [...buckets.values()].sort((a, b) => a.x - b.x);
}

function needsClientAggregation(candles: Candle[], interval: string) {
  const minutes = getTimeframeMinutes(interval);

  if (!minutes || minutes <= 1 || candles.length < 2) {
    return shouldAggregateOnClient(interval);
  }

  const expectedMs = minutes * 60_000;
  const spacing = candles[1].x - candles[0].x;

  return spacing > 0 && spacing < expectedMs * 0.75;
}

function getClientAggregateFetchLimit(interval: string, limit: number) {
  const minutes = getTimeframeMinutes(interval);

  if (!minutes) return limit;

  return Math.min(1000, Math.max(limit, limit * minutes));
}

function formatPrice(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "Loading...";
  if (value >= 100) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatVolume(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "...";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function extractTickers(payload: unknown): BinanceTicker[] {
  if (Array.isArray(payload)) return payload as BinanceTicker[];

  if (
    payload &&
    typeof payload === "object" &&
    "value" in payload &&
    Array.isArray((payload as { value?: unknown }).value)
  ) {
    return (payload as { value: BinanceTicker[] }).value;
  }

  return [];
}

function buildFallbackRows(symbols: string[]) {
  return symbols.reduce<Record<string, Row>>((acc, symbol) => {
    acc[symbol] = {
      symbol,
      price: Number.NaN,
      change24h: 0,
      volume24h: 0,
    };

    return acc;
  }, {});
}

function getStrongestDepthLines(
  levels: DepthLevel[],
  side: "bid" | "ask",
  limit: number,
  minNotional: number
): LimitLine[] {
  const parsedLevels = levels
    .map(([price, quantity]) => ({
      price: Number(price),
      quantity,
      quantityValue: Number(quantity),
      side,
    }))
    .filter(
      (level) =>
        Number.isFinite(level.price) &&
        Number.isFinite(level.quantityValue) &&
        level.quantityValue > 0
    )
    .map((level) => ({
      ...level,
      notional: level.price * level.quantityValue,
    }))
    .filter((level) => Number.isFinite(level.notional) && level.notional > 0);

  const maxNotional = Math.max(1, ...parsedLevels.map((level) => level.notional));
  const adaptiveMinNotional = Math.max(minNotional, maxNotional * 0.35);
  const parsed = parsedLevels
    .filter((level) => level.notional >= adaptiveMinNotional)
    .sort((a, b) => b.notional - a.notional)
    .slice(0, limit);

  return parsed.map((level) => ({
    price: level.price,
    quantity: level.quantity,
    notional: level.notional,
    side: level.side,
    strength: Math.max(0.25, Math.min(1, level.notional / maxNotional)),
  }));
}

function getDepthLimitLines(
  data: DepthData | undefined,
  limitPerSide: number,
  minNotional: number
): LimitLine[] {
  if (!data) return [];

  return [
    ...getStrongestDepthLines(data.bids, "bid", limitPerSide, minNotional),
    ...getStrongestDepthLines(data.asks, "ask", limitPerSide, minNotional),
  ];
}

function getApiUrl(path: string) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");

  if (backendUrl) return `${backendUrl}${path}`;
  if (typeof window === "undefined") return `http://localhost:${API_PORT}${path}`;

  const { hostname } = window.location;

  if (hostname.endsWith("trycloudflare.com")) {
    return `/api${path}`;
  }

  return `http://${hostname}:${API_PORT}${path}`;
}

function getWsUrl(path: string) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");

  if (backendUrl) {
    const wsBackendUrl = backendUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

    return `${wsBackendUrl}${path}`;
  }

  if (typeof window === "undefined") return `ws://localhost:${API_PORT}${path}`;

  const { hostname, host, protocol } = window.location;

  if (hostname.endsWith("trycloudflare.com")) {
    return `${protocol === "https:" ? "wss" : "ws"}://${host}${path}`;
  }

  return `ws://${hostname}:${API_PORT}${path}`;
}

function getDrawingKey(symbol: string, timeframe: string) {
  return `${symbol}:${timeframe}`;
}

function getCandleKey(symbol: string, timeframe: string) {
  return `${symbol}:${timeframe}`;
}

function getAlertKey(symbol: string, timeframe: string, kind: string) {
  return `${symbol}:${timeframe}:${kind}`;
}

function isView(value: unknown): value is "overview" | "favorites" {
  return value === "overview" || value === "favorites";
}

function isSortMode(value: unknown): value is CoinSortMode {
  return (
    value === "volume" ||
    value === "alphabet" ||
    value === "pump" ||
    value === "dump"
  );
}

function isSiteStyle(value: unknown): value is SiteStyle {
  return value === "dark" || value === "light";
}

function getChartColumnCount(count: number) {
  if (count <= 1) return 1;
  if (count <= 5) return 2;
  if (count <= 7) return 3;
  if (count <= 9) return 4;
  if (count <= 11) return 5;
  return 4;
}

function getDepthChartColumnCount(count: number) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  if (count <= 9) return 3;
  return 4;
}

export default function Home() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [depth, setDepth] = useState<Record<string, DepthData>>({});
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [gridCount, setGridCount] = useState(9);
  const [timeframe, setTimeframe] = useState("1h");
  const [timeframeOpen, setTimeframeOpen] = useState(false);
  const [timeframeAddOpen, setTimeframeAddOpen] = useState(false);
  const [customTimeframes, setCustomTimeframes] = useState<string[]>([]);
  const [gridOpen, setGridOpen] = useState(false);
  const [depthOpen, setDepthOpen] = useState(false);
  const [gridWindowStart, setGridWindowStart] = useState(
    DEFAULT_GRID_WINDOW_START
  );
  const [timeframeWindowStart, setTimeframeWindowStart] = useState(
    DEFAULT_TIMEFRAME_WINDOW_START
  );
  const [fullscreenSymbol, setFullscreenSymbol] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("telegram");
  const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<FavoriteColors>({});
  const [favoriteMenuOpen, setFavoriteMenuOpen] = useState(false);
  const [favoriteColorFilter, setFavoriteColorFilter] = useState<string | null>(
    null
  );
  const [volatilityMenuOpen, setVolatilityMenuOpen] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertThresholdPercent, setAlertThresholdPercent] = useState(
    DEFAULT_ALERT_THRESHOLD_PERCENT
  );
  const [alertWindowMinutes, setAlertWindowMinutes] = useState(
    DEFAULT_ALERT_WINDOW_MINUTES
  );
  const [alertToasts, setAlertToasts] = useState<AlertToast[]>([]);
  const [drawingsByChart, setDrawingsByChart] = useState<DrawingsByChart>({});
  const [activeView, setActiveView] = useState<"overview" | "favorites">(
    "overview"
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [chartPageMotion, setChartPageMotion] =
    useState<ChartPageMotion>("idle");
  const [coinSortMode, setCoinSortMode] = useState<CoinSortMode>("volume");
  const [siteStyle, setSiteStyle] = useState<SiteStyle>("dark");
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [quickSearchText, setQuickSearchText] = useState("");
  const [quickSearchVisible, setQuickSearchVisible] = useState(false);
  const alertCooldownsRef = useRef<Record<string, number>>({});
  const alertsEnabledRef = useRef(false);
  const alertThresholdPercentRef = useRef(DEFAULT_ALERT_THRESHOLD_PERCENT);
  const alertWindowMinutesRef = useRef(DEFAULT_ALERT_WINDOW_MINUTES);
  const priceHistoryRef = useRef<Record<string, PriceSample[]>>({});
  const baseMinuteCandlesRef = useRef<Record<string, Candle[]>>({});
  const drawingsByChartRef = useRef<DrawingsByChart>({});
  const fullscreenSymbolRef = useRef<string | null>(null);
  const timeframeClientAggregationRef = useRef<Record<string, boolean>>({});
  const quickSearchTimerRef = useRef<number | null>(null);
  const chartPageMotionTimerRef = useRef<number | null>(null);
  const olderCandlesLoadingRef = useRef<Set<string>>(new Set());
  const pendingTickerRowsRef = useRef<Record<string, Row>>({});
  const tickerRowsFrameRef = useRef<number | null>(null);

  const closeFloatingMenus = useCallback(() => {
    setTimeframeOpen(false);
    setTimeframeAddOpen(false);
    setGridOpen(false);
    setFavoriteMenuOpen(false);
    setVolatilityMenuOpen(false);
    setAlertSettingsOpen(false);
    setSettingsOpen(false);
  }, []);

  const toggleFloatingMenu = useCallback(
    (menu: FloatingMenu) => {
      const isOpen =
        (menu === "timeframe" && timeframeOpen) ||
        (menu === "alerts" && alertSettingsOpen) ||
        (menu === "grid" && gridOpen) ||
        (menu === "favorites" && favoriteMenuOpen) ||
        (menu === "volatility" && volatilityMenuOpen) ||
        (menu === "settings" && settingsOpen);
      const shouldOpen = !isOpen;

      setTimeframeOpen(menu === "timeframe" && shouldOpen);
      setTimeframeAddOpen(false);
      setGridOpen(menu === "grid" && shouldOpen);
      setFavoriteMenuOpen(menu === "favorites" && shouldOpen);
      setVolatilityMenuOpen(menu === "volatility" && shouldOpen);
      setAlertSettingsOpen(menu === "alerts" && shouldOpen);
      setSettingsOpen(menu === "settings" && shouldOpen);
    },
    [
      alertSettingsOpen,
      favoriteMenuOpen,
      gridOpen,
      settingsOpen,
      timeframeOpen,
      volatilityMenuOpen,
    ]
  );

  const queueTickerRow = useCallback((row: Row) => {
    pendingTickerRowsRef.current[row.symbol] = row;

    if (tickerRowsFrameRef.current !== null) return;

    tickerRowsFrameRef.current = window.requestAnimationFrame(() => {
      tickerRowsFrameRef.current = null;
      const pending = pendingTickerRowsRef.current;

      pendingTickerRowsRef.current = {};

      if (Object.keys(pending).length === 0) return;

      setRows((prev) => ({
        ...prev,
        ...pending,
      }));
    });
  }, []);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const favoriteColorGroups = useMemo(
    () =>
      BOOKMARK_COLORS.map((color) => ({
        color,
        symbols: favorites.filter(
          (symbol) => (favoriteColors[symbol] ?? BOOKMARK_COLORS[1]) === color
        ),
      })).filter((group) => group.symbols.length > 0),
    [favoriteColors, favorites]
  );

  const orderedSymbols = useMemo(() => {
    const symbols = allSymbols.filter((symbol) => {
      const change = rows[symbol]?.change24h ?? 0;

      if (coinSortMode === "pump") return change > 0;
      if (coinSortMode === "dump") return change < 0;

      return true;
    });

    return symbols.sort((a, b) => {
      if (coinSortMode === "pump") {
        return (rows[b]?.change24h ?? 0) - (rows[a]?.change24h ?? 0);
      }

      if (coinSortMode === "dump") {
        return (rows[a]?.change24h ?? 0) - (rows[b]?.change24h ?? 0);
      }

      const favoriteDelta = Number(favoriteSet.has(b)) - Number(favoriteSet.has(a));

      if (favoriteDelta !== 0) return favoriteDelta;

      if (coinSortMode === "alphabet") {
        return a.localeCompare(b);
      }

      const volumeDelta =
        (rows[b]?.volume24h ?? 0) - (rows[a]?.volume24h ?? 0);

      if (volumeDelta !== 0) return volumeDelta;

      return a.localeCompare(b);
    });
  }, [allSymbols, rows, favoriteSet, coinSortMode]);

  const chartSymbols = useMemo(() => {
    if (activeView !== "favorites") return orderedSymbols;

    return orderedSymbols.filter((symbol) => {
      if (!favoriteSet.has(symbol)) return false;
      if (!favoriteColorFilter) return true;

      return (favoriteColors[symbol] ?? BOOKMARK_COLORS[1]) === favoriteColorFilter;
    });
  }, [activeView, favoriteColorFilter, favoriteColors, favoriteSet, orderedSymbols]);

  const pageCount = Math.max(1, Math.ceil(chartSymbols.length / gridCount));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * gridCount;
  const pageEnd = Math.min(pageStart + gridCount, chartSymbols.length);

  const visibleSymbols = useMemo(() => {
    return chartSymbols.slice(pageStart, pageEnd);
  }, [chartSymbols, pageStart, pageEnd]);

  const filteredSymbols = useMemo(() => {
    return orderedSymbols.filter((symbol) =>
      symbol.toLowerCase().includes(search.toLowerCase())
    );
  }, [orderedSymbols, search]);
  const quickSearchValue = quickSearchText.trim().toUpperCase();
  const quickSearchMatch = useMemo(() => {
    if (!quickSearchValue) return null;

    return (
      orderedSymbols.find((symbol) => symbol === quickSearchValue) ??
      orderedSymbols.find((symbol) => symbol.startsWith(quickSearchValue)) ??
      null
    );
  }, [orderedSymbols, quickSearchValue]);

  const allTimeframes = useMemo(
    () => [...BASE_TIMEFRAMES, ...customTimeframes],
    [customTimeframes]
  );

  const visibleTimeframes = allTimeframes;

  const availableExtraTimeframes = useMemo(
    () => EXTRA_TIMEFRAMES.filter((item) => !customTimeframes.includes(item)),
    [customTimeframes]
  );

  const visibleGridCounts = useMemo(
    () => GRID_COUNTS.slice(gridWindowStart, gridWindowStart + GRID_WINDOW_SIZE),
    [gridWindowStart]
  );

  const animateChartPage = useCallback((motion: Exclude<ChartPageMotion, "idle">) => {
    if (chartPageMotionTimerRef.current !== null) {
      window.clearTimeout(chartPageMotionTimerRef.current);
    }

    setChartPageMotion(motion);
    chartPageMotionTimerRef.current = window.setTimeout(() => {
      setChartPageMotion("idle");
      chartPageMotionTimerRef.current = null;
    }, 340);
  }, []);

  const goToChartPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(pageCount - 1, Math.max(0, nextPage));

      if (clamped === safePageIndex) return;

      animateChartPage(clamped > safePageIndex ? "next" : "prev");
      setPageIndex(clamped);
    },
    [animateChartPage, pageCount, safePageIndex]
  );

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
    alertThresholdPercentRef.current = alertThresholdPercent;
    alertWindowMinutesRef.current = alertWindowMinutes;
    drawingsByChartRef.current = drawingsByChart;
    fullscreenSymbolRef.current = fullscreenSymbol;
  }, [
    alertThresholdPercent,
    alertWindowMinutes,
    alertsEnabled,
    drawingsByChart,
    fullscreenSymbol,
  ]);

  useEffect(() => {
    return () => {
      if (quickSearchTimerRef.current) {
        window.clearTimeout(quickSearchTimerRef.current);
      }

      if (chartPageMotionTimerRef.current !== null) {
        window.clearTimeout(chartPageMotionTimerRef.current);
      }

      if (tickerRowsFrameRef.current !== null) {
        window.cancelAnimationFrame(tickerRowsFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);

        if (!raw) return;

        const saved = JSON.parse(raw) as SavedWorkspace;

        if (Array.isArray(saved.favorites)) {
          setFavorites(
            saved.favorites.filter((item) => typeof item === "string")
          );
        }

        if (typeof saved.favoriteColors === "object" && saved.favoriteColors) {
          setFavoriteColors(
            Object.fromEntries(
              Object.entries(saved.favoriteColors).filter(
                ([symbol, color]) =>
                  typeof symbol === "string" && typeof color === "string"
              )
            )
          );
        }

        if (typeof saved.drawingsByChart === "object" && saved.drawingsByChart) {
          setDrawingsByChart(saved.drawingsByChart);
        }

        if (
          typeof saved.gridCount === "number" &&
          GRID_COUNTS.includes(saved.gridCount)
        ) {
          setGridCount(saved.gridCount);
        }

        if (isView(saved.activeView)) {
          setActiveView(saved.activeView);
        }

        if (isSortMode(saved.coinSortMode)) {
          setCoinSortMode(saved.coinSortMode);
        }

        if (isSiteStyle(saved.siteStyle)) {
          setSiteStyle(saved.siteStyle);
        }

        if (Array.isArray(saved.customTimeframes)) {
          const restoredCustomTimeframes = EXTRA_TIMEFRAMES.filter((item) =>
            saved.customTimeframes?.includes(item)
          );

          setCustomTimeframes(restoredCustomTimeframes);
        }

        if (
          typeof saved.alertThresholdPercent === "number" &&
          saved.alertThresholdPercent > 0
        ) {
          setAlertThresholdPercent(saved.alertThresholdPercent);
        }

        if (
          typeof saved.alertWindowMinutes === "number" &&
          saved.alertWindowMinutes > 0
        ) {
          setAlertWindowMinutes(saved.alertWindowMinutes);
        }

      if (typeof saved.alertsEnabled === "boolean") {
        setAlertsEnabled(saved.alertsEnabled);
      }

        if (typeof saved.pageIndex === "number" && saved.pageIndex >= 0) {
          setPageIndex(saved.pageIndex);
        }
      } catch (error) {
        console.error("Workspace restore error:", error);
      } finally {
        setWorkspaceLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!workspaceLoaded) return;

    const workspace: SavedWorkspace = {
      activeView,
      alertsEnabled,
      coinSortMode,
      drawingsByChart,
      favoriteColors,
      favorites,
      gridCount,
      pageIndex: safePageIndex,
      siteStyle,
      customTimeframes,
      alertThresholdPercent,
      alertWindowMinutes,
    };

    try {
      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify(workspace)
      );
    } catch (error) {
      console.error("Workspace save error:", error);
    }
  }, [
    activeView,
    alertThresholdPercent,
    alertWindowMinutes,
    alertsEnabled,
    coinSortMode,
    customTimeframes,
    drawingsByChart,
    favoriteColors,
    favorites,
    gridCount,
    safePageIndex,
    siteStyle,
    workspaceLoaded,
  ]);

  const playAlertSound = useCallback(() => {
    const audio = new Audio(ALERT_SOUND_SRC);
    audio.volume = 0.82;

    void audio.play().catch((error) => {
      console.error("Alert sound error:", error);
    });
  }, []);

  const showBrowserNotification = useCallback((title: string, body: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    new Notification(title, {
      body,
      silent: true,
    });
  }, []);

  const triggerAlert = useCallback(
    (
      symbol: string,
      timeframeValue: string,
      cooldownKind: string,
      message: string,
      toastKind: AlertToast["kind"] = "pump"
    ) => {
      if (!alertsEnabledRef.current) return;

      const key = getAlertKey(symbol, timeframeValue, cooldownKind);
      const now = Date.now();
      const lastAlertAt = alertCooldownsRef.current[key] ?? 0;

      if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;

      alertCooldownsRef.current[key] = now;
      const toastId = `${key}-${now}`;
      const percent = message.match(/[+-]?\d+(?:\.\d+)?%/)?.[0];
      const direction = toastKind === "damp" ? "DAMP" : toastKind === "pump" ? "PUMP" : "LEVEL";
      const displayMessage = percent
        ? `${symbol} ${direction} ${percent}`
        : `${symbol} ${message}`;

      setAlertToasts((prev) => [
        {
          id: toastId,
          symbol,
          timeframe: timeframeValue,
          message: displayMessage,
          kind: toastKind,
          createdAt: now,
        },
        ...prev,
      ].slice(0, 5));

      playAlertSound();
      showBrowserNotification(`${direction} ${symbol}`, displayMessage);
    },
    [playAlertSound, showBrowserNotification]
  );

  const checkPriceAlerts = useCallback(
    (symbol: string, candle: Candle, timeframeValue: string) => {
      if (!alertsEnabledRef.current || candle.o <= 0) return;

      const movePercent = ((candle.c - candle.o) / candle.o) * 100;

      if (movePercent >= alertThresholdPercentRef.current) {
        triggerAlert(
          symbol,
          timeframeValue,
          "fast-pump",
          `PUMP +${movePercent.toFixed(2)}%`,
          "pump"
        );
      }

      if (movePercent <= -alertThresholdPercentRef.current) {
        triggerAlert(
          symbol,
          timeframeValue,
          "fast-damp",
          `DAMP ${movePercent.toFixed(2)}%`,
          "damp"
        );
      }

      const drawingKey = getDrawingKey(symbol, timeframeValue);
      const horizontalLines = (
        drawingsByChartRef.current[drawingKey] ?? []
      ).filter((drawing) => drawing.tool === "horizontal");

      horizontalLines.forEach((line) => {
        const level = line.start.y;
        const touched = candle.l <= level && candle.h >= level;

        if (touched) {
          triggerAlert(
            symbol,
            timeframeValue,
            `level-${line.id}`,
            `${symbol} touched ${formatPrice(level)}`,
            "level"
          );
        }
      });
      if (movePercent <= -alertThresholdPercentRef.current) {
        triggerAlert(
          symbol,
          timeframeValue,
          "fast-damp",
          `DAMP ${movePercent.toFixed(2)}% за ${alertWindowMinutesRef.current}m`,
          "damp"
        );
      }
    },
    [triggerAlert]
  );

  const checkTickerPumpAlert = useCallback(
    (row: Row) => {
      if (!alertsEnabledRef.current || !Number.isFinite(row.price) || row.price <= 0) {
        return;
      }

      const now = Date.now();
      const windowMs = Math.max(1, alertWindowMinutesRef.current) * 60_000;
      const samples = [
        ...(priceHistoryRef.current[row.symbol] ?? []),
        { price: row.price, time: now },
      ].filter((sample) => now - sample.time <= windowMs);

      priceHistoryRef.current[row.symbol] = samples;

      const oldestSample = samples[0];

      if (!oldestSample || oldestSample.price <= 0 || oldestSample.time === now) {
        return;
      }

      const movePercent = ((row.price - oldestSample.price) / oldestSample.price) * 100;

      if (movePercent >= alertThresholdPercentRef.current) {
        triggerAlert(
          row.symbol,
          `${alertWindowMinutesRef.current}m`,
          "pump",
          `PUMP +${movePercent.toFixed(2)}% за ${alertWindowMinutesRef.current}m`,
          "pump"
        );
      }
      if (movePercent <= -alertThresholdPercentRef.current) {
        triggerAlert(
          row.symbol,
          `${alertWindowMinutesRef.current}m`,
          "damp",
          `DAMP ${movePercent.toFixed(2)}% за ${alertWindowMinutesRef.current}m`,
          "damp"
        );
      }
    },
    [triggerAlert]
  );

  useEffect(() => {
    async function loadSymbols() {
      try {
        const res = await fetch(getApiUrl("/symbols"));
        const data: unknown = await res.json();
        const tickers = extractTickers(data);

        if (tickers.length === 0) {
          console.warn("Symbols fallback: unexpected response", data);
          setRows((prev) => ({
            ...buildFallbackRows(FALLBACK_SYMBOLS),
            ...prev,
          }));
          setAllSymbols(FALLBACK_SYMBOLS);
          return;
        }

        const usdtPairs = tickers
          .filter((item) => item.symbol.endsWith("USDT"))
          .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume));

        const initialRows = usdtPairs.reduce<Record<string, Row>>(
          (acc, item) => {
            acc[item.symbol] = {
              symbol: item.symbol,
              price: Number(item.lastPrice),
              change24h: Number(item.priceChangePercent),
              volume24h: Number(item.quoteVolume),
            };

            return acc;
          },
          {}
        );

        const symbols = usdtPairs.map((item) => item.symbol);
        setRows(initialRows);
        setAllSymbols(symbols);
      } catch (error) {
        console.error("Symbols error:", error);
      }
    }

    loadSymbols();
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      socket = new WebSocket(getWsUrl("/ws"));

      socket.onmessage = (msg) => {
        const parsed: WsMessage = JSON.parse(msg.data);

        if (parsed.event === "ticker:update") {
          checkTickerPumpAlert(parsed.data);
          queueTickerRow(parsed.data);
        }

        if (parsed.event === "depth:update") {
          setDepth((prev) => ({
            ...prev,
            [parsed.data.symbol]: parsed.data,
          }));
        }

        if (parsed.event === "candle:update") {
          const { symbol, candle, interval } = parsed.data;
          const activeFullscreenSymbol = fullscreenSymbolRef.current;

          if (activeFullscreenSymbol && symbol !== activeFullscreenSymbol) {
            return;
          }

          const aggregateOnClient =
            shouldAggregateOnClient(timeframe) &&
            (timeframeClientAggregationRef.current[timeframe] ?? true);

          if (aggregateOnClient) {
            if (interval !== "1m" && interval !== timeframe) return;

            const normalized = normalizeCandle(candle);
            const baseCandles = mergeCandles(
              baseMinuteCandlesRef.current[symbol] ?? [],
              [normalized]
            ).slice(-5000);
            const aggregated = aggregateCandlesToTimeframe(
              baseCandles,
              timeframe
            ).slice(-5000);
            const latestAggregated = aggregated.at(-1);

            baseMinuteCandlesRef.current[symbol] = baseCandles;

            if (latestAggregated) {
              checkPriceAlerts(symbol, latestAggregated, timeframe);
            }

            setCandles((prev) => ({
              ...prev,
              [symbol]: aggregated,
            }));
            return;
          }

          if (interval !== timeframe) return;

          const normalized = normalizeCandle(candle);

          checkPriceAlerts(symbol, normalized, timeframe);

          setCandles((prev) => {
            const list = prev[symbol] || [];
            const idx = list.findIndex((item) => item.x === normalized.x);
            const updated = [...list];

            if (idx >= 0) {
              updated[idx] = normalized;
            } else {
              updated.push(normalized);
            }

            return {
              ...prev,
              [symbol]: updated.slice(-5000),
            };
          });
        }
      };

      socket.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [checkPriceAlerts, checkTickerPumpAlert, queueTickerRow, timeframe]);

  useEffect(() => {
    async function loadCandles(
      symbol: string,
      interval = timeframe,
      limit = GRID_CANDLE_LIMIT
    ) {
      try {
        const canAggregateOnClient = shouldAggregateOnClient(interval);
        const requestLimit = canAggregateOnClient
          ? getClientAggregateFetchLimit(interval, limit)
          : limit;
        const res = await fetch(
          getApiUrl(
            `/candles?symbol=${symbol}&interval=${interval}&limit=${requestLimit}`
          )
        );

        if (!res.ok) {
          console.error("Candles error:", await res.text());
          return;
        }

        const formatted = parseKlineCandles(await res.json());

        if (formatted.length === 0) return;

        const aggregateOnClient =
          canAggregateOnClient && needsClientAggregation(formatted, interval);
        if (canAggregateOnClient) {
          timeframeClientAggregationRef.current[interval] = aggregateOnClient;
        }
        const displayCandles = aggregateOnClient
          ? aggregateCandlesToTimeframe(formatted, interval).slice(-limit)
          : formatted.slice(-limit);

        if (interval === timeframe) {
          if (aggregateOnClient) {
            baseMinuteCandlesRef.current[symbol] = formatted.slice(-5000);
          }

          setCandles((prev) => ({
            ...prev,
            [symbol]: mergeCandles(prev[symbol] ?? [], displayCandles).slice(
              -limit
            ),
          }));
        }
      } catch (error) {
        console.error("Load candles error:", error);
      }
    }

    let cancelled = false;

    async function loadVisibleCandles() {
      if (fullscreenSymbol) return;

      for (const symbol of visibleSymbols) {
        if (cancelled) return;

        await loadCandles(symbol, timeframe, GRID_CANDLE_LIMIT);
      }
    }

    void loadVisibleCandles();

    if (fullscreenSymbol) {
      loadCandles(fullscreenSymbol, timeframe, FULLSCREEN_CANDLE_LIMIT);
    }

    return () => {
      cancelled = true;
    };
  }, [visibleSymbols, timeframe, fullscreenSymbol]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;

      if (
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      ) {
        return;
      }

      const hasOpenMenu =
        settingsOpen ||
        timeframeOpen ||
        gridOpen ||
        alertSettingsOpen ||
        favoriteMenuOpen ||
        volatilityMenuOpen;

      if (hasOpenMenu && event.key === "Escape") {
        event.preventDefault();
        closeFloatingMenus();
        return;
      }

      if (fullscreenSymbol && event.key === "Escape") {
        event.preventDefault();
        setFullscreenSymbol(null);
        return;
      }

      if (!fullscreenSymbol && event.key.length === 1 && /^[a-zA-Z0-9]$/.test(event.key)) {
        event.preventDefault();
        const nextValue = `${quickSearchText}${event.key}`.toUpperCase();

        setQuickSearchText(nextValue);
        setQuickSearchVisible(true);

        if (quickSearchTimerRef.current) {
          window.clearTimeout(quickSearchTimerRef.current);
        }

        quickSearchTimerRef.current = window.setTimeout(() => {
          setQuickSearchVisible(false);
          setQuickSearchText("");
        }, 7000);
        return;
      }

      if (quickSearchVisible && event.key === "Backspace") {
        event.preventDefault();
        const nextValue = quickSearchText.slice(0, -1);

        setQuickSearchText(nextValue);
        setQuickSearchVisible(nextValue.length > 0);

        if (quickSearchTimerRef.current) {
          window.clearTimeout(quickSearchTimerRef.current);
        }

        if (nextValue.length > 0) {
          quickSearchTimerRef.current = window.setTimeout(() => {
            setQuickSearchVisible(false);
            setQuickSearchText("");
          }, 7000);
        }
        return;
      }

      if (quickSearchVisible && event.key === "Escape") {
        event.preventDefault();
        setQuickSearchVisible(false);
        setQuickSearchText("");

        if (quickSearchTimerRef.current) {
          window.clearTimeout(quickSearchTimerRef.current);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveTimeframe(-1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveTimeframe(1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (gridOpen) {
          changeGridCount(gridCount - 1);
          return;
        }

        goToChartPage(safePageIndex - 1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (gridOpen) {
          changeGridCount(gridCount + 1);
          return;
        }

        goToChartPage(safePageIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyboard);

    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [
    alertSettingsOpen,
    closeFloatingMenus,
    favoriteMenuOpen,
    fullscreenSymbol,
    gridCount,
    gridOpen,
    goToChartPage,
    pageCount,
    quickSearchText,
    quickSearchVisible,
    safePageIndex,
    settingsOpen,
    timeframe,
    timeframeOpen,
    volatilityMenuOpen,
  ]);

  async function changeTimeframe(value: string) {
    const timeframeIndex = allTimeframes.indexOf(value);

    if (timeframeIndex >= 0) {
      revealTimeframe(timeframeIndex);
    }

    closeFloatingMenus();
    setTimeframe(value);
    setCandles({});
    baseMinuteCandlesRef.current = {};

    try {
      await fetch(getApiUrl(`/timeframe?interval=${value}`));
    } catch (error) {
      console.error("Timeframe error:", error);
    }
  }

  function revealTimeframe(index: number) {
    const maxStart = Math.max(0, allTimeframes.length - TIMEFRAME_WINDOW_SIZE);

    setTimeframeWindowStart((prev) => {
      if (index < prev) return index;
      if (index >= prev + TIMEFRAME_WINDOW_SIZE) {
        return Math.min(maxStart, index - TIMEFRAME_WINDOW_SIZE + 1);
      }

      return prev;
    });
  }

  function moveTimeframe(direction: -1 | 1) {
    const currentIndex = Math.max(0, allTimeframes.indexOf(timeframe));
    const nextIndex = Math.min(
      allTimeframes.length - 1,
      Math.max(0, currentIndex + direction)
    );

    if (nextIndex === currentIndex) return;

    void changeTimeframe(allTimeframes[nextIndex]);
  }

  function shiftTimeframeWindow(direction: -1 | 1) {
    const maxStart = Math.max(0, allTimeframes.length - TIMEFRAME_WINDOW_SIZE);

    setTimeframeWindowStart((prev) =>
      Math.min(maxStart, Math.max(0, prev + direction))
    );
  }

  function addCustomTimeframe(value: string) {
    if (!EXTRA_TIMEFRAMES.includes(value)) return;

    setCustomTimeframes((prev) => {
      if (prev.includes(value)) return prev;

      return EXTRA_TIMEFRAMES.filter((item) => item === value || prev.includes(item));
    });
    setTimeframeAddOpen(false);
  }

  function removeCustomTimeframe(value: string) {
    if (!customTimeframes.includes(value)) return;

    setCustomTimeframes((prev) => prev.filter((item) => item !== value));
    setTimeframeWindowStart((prev) =>
      Math.min(
        prev,
        Math.max(0, allTimeframes.length - 1 - TIMEFRAME_WINDOW_SIZE)
      )
    );

    if (timeframe === value) {
      void changeTimeframe("1h");
    }
  }

  function revealGridCount(count: number) {
    const index = GRID_COUNTS.indexOf(count);
    const maxStart = Math.max(0, GRID_COUNTS.length - GRID_WINDOW_SIZE);

    if (index < 0) return;

    setGridWindowStart((prev) => {
      if (index < prev) return index;
      if (index >= prev + GRID_WINDOW_SIZE) {
        return Math.min(maxStart, index - GRID_WINDOW_SIZE + 1);
      }

      return prev;
    });
  }

  function changeGridCount(count: number) {
    const nextCount = Math.min(12, Math.max(1, count));

    revealGridCount(nextCount);
    setGridCount(nextCount);
    setPageIndex(0);
  }

  function shiftGridWindow(direction: -1 | 1) {
    const maxStart = Math.max(0, GRID_COUNTS.length - GRID_WINDOW_SIZE);

    setGridWindowStart((prev) =>
      Math.min(maxStart, Math.max(0, prev + direction))
    );
  }

  async function copySymbol(symbol: string) {
    try {
      await navigator.clipboard.writeText(symbol);
    } catch (error) {
      console.error("Copy symbol error:", error);
    }
  }

  async function loadOlderCandles(symbol: string, oldestTime: number) {
    const requestKey = `${symbol}:${timeframe}:${oldestTime}`;

    if (olderCandlesLoadingRef.current.has(requestKey)) return;

    olderCandlesLoadingRef.current.add(requestKey);

    try {
      const canAggregateOnClient = shouldAggregateOnClient(timeframe);
      const requestLimit = canAggregateOnClient
        ? getClientAggregateFetchLimit(timeframe, OLDER_CANDLE_LIMIT)
        : OLDER_CANDLE_LIMIT;
      const res = await fetch(
        getApiUrl(
          `/candles?symbol=${symbol}&interval=${timeframe}&limit=${requestLimit}&endTime=${
            oldestTime - 1
          }`
        )
      );

      if (!res.ok) {
        console.error("Older candles error:", await res.text());
        return;
      }

      const olderCandles = parseKlineCandles(await res.json());

      if (olderCandles.length === 0) return;

      const aggregateOnClient =
        canAggregateOnClient && needsClientAggregation(olderCandles, timeframe);
      if (canAggregateOnClient) {
        timeframeClientAggregationRef.current[timeframe] = aggregateOnClient;
      }

      if (aggregateOnClient) {
        const baseCandles = mergeCandles(
          olderCandles,
          baseMinuteCandlesRef.current[symbol] ?? []
        ).slice(-5000);
        const aggregated = aggregateCandlesToTimeframe(
          baseCandles,
          timeframe
        ).slice(-5000);

        baseMinuteCandlesRef.current[symbol] = baseCandles;
        setCandles((prev) => ({
          ...prev,
          [symbol]: aggregated,
        }));
        return;
      }

      setCandles((prev) => ({
        ...prev,
        [symbol]: mergeCandles(prev[symbol] ?? [], olderCandles).slice(-5000),
      }));
    } catch (error) {
      console.error("Load older candles error:", error);
    } finally {
      olderCandlesLoadingRef.current.delete(requestKey);
    }
  }

  async function toggleAlerts() {
    const nextEnabled = !alertsEnabled;

    if (
      nextEnabled &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error("Notification permission error:", error);
      }
    }

    if (nextEnabled) {
      playAlertSound();
    }

    setAlertsEnabled(nextEnabled);
  }

  function clearAllDrawings() {
    setDrawingsByChart({});
    drawingsByChartRef.current = {};
  }

  function toggleFavorite(symbol: string) {
    const isAlreadyFavorite = favorites.includes(symbol);

    if (isAlreadyFavorite) {
      setFavorites((prev) => prev.filter((item) => item !== symbol));
      setFavoriteColors((colors) => {
        const next = { ...colors };
        delete next[symbol];
        return next;
      });
      return;
    }

    setFavorites((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
    setFavoriteColors((colors) => ({
      ...colors,
      [symbol]: colors[symbol] ?? BOOKMARK_COLORS[1],
    }));
  }

  function setBookmarkColor(symbol: string, color: string) {
    setFavoriteColors((prev) => ({
      ...prev,
      [symbol]: color,
    }));

    setFavorites((prev) =>
      prev.includes(symbol) ? prev : [symbol, ...prev]
    );

    setPageIndex(0);
  }

  function showOverview() {
    closeFloatingMenus();
    setActiveView("overview");
    setFavoriteColorFilter(null);
    setGridCount(9);
    setPageIndex(0);
  }

  function updateChartDrawings(symbol: string, nextDrawings: ChartDrawing[]) {
    const key = getDrawingKey(symbol, timeframe);

    setDrawingsByChart((prev) => ({
      ...prev,
      [key]: nextDrawings,
    }));
  }

  function showFavorites() {
    closeFloatingMenus();
    setActiveView("favorites");
    setFavoriteColorFilter(null);
    setGridCount(9);
    setPageIndex(0);
  }

  function toggleFavoriteColorMenu() {
    if (favoriteMenuOpen || activeView === "favorites") {
      showOverview();
      return;
    }

    toggleFloatingMenu("favorites");
  }

  function showFavoriteColor(color: string) {
    closeFloatingMenus();
    setActiveView("favorites");
    setFavoriteColorFilter(color);
    setGridCount(9);
    setPageIndex(0);
  }

  function toggleVolatilityMenu() {
    toggleFloatingMenu("volatility");
  }

  function setVolatilitySort(mode: Extract<CoinSortMode, "pump" | "dump">) {
    setCoinSortMode(mode);
    closeFloatingMenus();
    setActiveView("overview");
    setFavoriteColorFilter(null);
    setPageIndex(0);
  }

  function openQuickSearchSymbol(symbol: string) {
    const index = Math.max(0, orderedSymbols.indexOf(symbol));

    setActiveView("overview");
    setGridCount(1);
    revealGridCount(1);
    setPageIndex(index);
    setQuickSearchVisible(false);
    setQuickSearchText("");

    if (quickSearchTimerRef.current) {
      window.clearTimeout(quickSearchTimerRef.current);
      quickSearchTimerRef.current = null;
    }
  }

  function openFullscreenSymbol(symbol: string) {
    setFullscreenSymbol(symbol);
    setActiveView("overview");
    setPageIndex(Math.max(0, Math.floor(Math.max(0, orderedSymbols.indexOf(symbol)) / gridCount)));
  }

  function openAlertSymbol(symbol: string, toastTimeframe: string) {
    if (allTimeframes.includes(toastTimeframe)) {
      setTimeframe(toastTimeframe);
    }

    openFullscreenSymbol(symbol);
  }

  const chartHeight = "h-full min-h-0 flex-1";
  const gridDepthLevels = depthOpen
    ? visibleSymbols.length >= 5
      ? 2
      : visibleSymbols.length >= 3
        ? 3
        : 5
    : gridCount >= 9
      ? 4
      : gridCount >= 4
        ? 5
        : 6;
  const chartColumnCount = depthOpen
    ? getDepthChartColumnCount(visibleSymbols.length)
    : getChartColumnCount(visibleSymbols.length);
  const bottomRowCount = visibleSymbols.length % chartColumnCount;
  const lastChartColumnSpan =
    visibleSymbols.length > 1 && bottomRowCount > 0
      ? chartColumnCount - bottomRowCount + 1
      : 1;
  const hasWideBottomChart = lastChartColumnSpan > 1;
  const chartGridStyle = {
    gridAutoRows: "minmax(0, 1fr)",
    gridTemplateColumns: `repeat(${chartColumnCount}, minmax(0, 1fr))`,
  };
  const chartGridClass = `chart-grid grid min-h-0 flex-1 gap-0 overflow-hidden ${
    chartPageMotion === "next"
      ? "chart-grid-slide-next"
      : chartPageMotion === "prev"
        ? "chart-grid-slide-prev"
        : ""
  }`;
  const shellGridClass =
    "lg:grid-cols-[minmax(0,1fr)_285px] xl:grid-cols-[minmax(0,1fr)_305px]";

  function renderSettingsContent() {
    if (activeSettingsTab === "telegram") {
      return (
        <div className="settings-tab-content">
          <h3>TELEGRAM</h3>
          <a
            href="https://t.me/CoinFinderGraphics"
            target="_blank"
            rel="noreferrer"
            className="settings-link-card"
          >
            <span className="settings-card-icon">
              <SettingsTabIcon id="telegram" />
            </span>
            <span>t.me/CoinFinderGraphics</span>
          </a>
        </div>
      );
    }

    if (activeSettingsTab === "support") {
      return (
        <div className="settings-tab-content">
          <h3>SUPPORT</h3>
          <div className="settings-link-card">
            <span className="settings-card-icon">
              <SettingsTabIcon id="support" />
            </span>
            <span>@Skynemiz</span>
          </div>
        </div>
      );
    }

    if (activeSettingsTab === "notifications") {
      return (
        <div className="settings-tab-content">
          <h3>УВЕДОМЛЕНИЯ</h3>
          <div className="settings-control-grid">
            <button
              type="button"
              onClick={toggleAlerts}
              className={`settings-choice ${alertsEnabled ? "is-active" : ""}`}
            >
              {alertsEnabled ? "ON" : "OFF"}
            </button>
            <label className="settings-field">
              <span>Движение, %</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={alertThresholdPercent}
                onChange={(event) =>
                  setAlertThresholdPercent(
                    Math.max(
                      0.1,
                      Number(event.target.value) ||
                        DEFAULT_ALERT_THRESHOLD_PERCENT
                    )
                  )
                }
              />
            </label>
            <label className="settings-field">
              <span>За минут</span>
              <input
                type="number"
                min="1"
                step="1"
                value={alertWindowMinutes}
                onChange={(event) =>
                  setAlertWindowMinutes(
                    Math.max(
                      1,
                      Math.round(
                        Number(event.target.value) ||
                          DEFAULT_ALERT_WINDOW_MINUTES
                      )
                    )
                  )
                }
              />
            </label>
          </div>
          <div className="settings-note">
            PUMP/DAMP SMS при движении {alertThresholdPercent}% за {alertWindowMinutes}m
          </div>
        </div>
      );
    }

    if (activeSettingsTab === "timeframe") {
      return (
        <div className="settings-tab-content">
          <h3>ТАЙМФРЕЙМ</h3>
          <div className="settings-chip-grid">
            {allTimeframes.map((item) => {
              const isCustomTimeframe = customTimeframes.includes(item);

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => changeTimeframe(item)}
                  onContextMenu={(event) => {
                    if (!isCustomTimeframe) return;

                    event.preventDefault();
                    removeCustomTimeframe(item);
                  }}
                  className={`settings-choice ${
                    timeframe === item ? "is-active" : ""
                  }`}
                  title={isCustomTimeframe ? "ПКМ - удалить" : undefined}
                >
                  {item}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTimeframeAddOpen((value) => !value)}
              className="settings-add-button"
            >
              +
            </button>
            {timeframeAddOpen && (
              <div className="settings-add-menu">
                {availableExtraTimeframes.length > 0 ? (
                  availableExtraTimeframes.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => addCustomTimeframe(item)}
                      className="settings-choice"
                    >
                      {item}
                    </button>
                  ))
                ) : (
                  <div className="settings-note">Все добавлены</div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeSettingsTab === "charts") {
      return (
        <div className="settings-tab-content">
          <h3>ГРАФИКИ</h3>
          <div className="settings-chip-grid">
            {GRID_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => changeGridCount(count)}
                className={`settings-choice ${gridCount === count ? "is-active" : ""}`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeSettingsTab === "style") {
      return (
        <div className="settings-tab-content">
          <h3>СТИЛЬ</h3>
          <div className="settings-control-grid">
            {SITE_STYLES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSiteStyle(item.id)}
                className={`settings-choice site-style-option ${
                  siteStyle === item.id ? "is-active" : ""
                }`}
                data-style={item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (activeSettingsTab === "density") {
      return (
        <div className="settings-tab-content">
          <h3>DENSITY</h3>
          <div className="settings-link-card">
            <span className="settings-card-icon">
              <SettingsTabIcon id="density" />
            </span>
            <span>Compact trading layout</span>
          </div>
        </div>
      );
    }

    return (
      <div className="settings-tab-content">
        <h3>ABOUT</h3>
        <div className="settings-link-card">
          <span className="settings-card-icon">
            <SettingsTabIcon id="about" />
          </span>
          <span>Coin Finder Graphics screener</span>
        </div>
      </div>
    );
  }

  const siteThemeStyle = useMemo<SiteThemeStyle>(
    () =>
      siteStyle === "light"
        ? {
            "--site-bg": "#f7f8fb",
            "--site-panel": "#ffffff",
            "--site-panel-strong": "#f2f4f8",
            "--site-surface": "#fbfcfe",
            "--site-border": "rgba(17, 24, 39, 0.14)",
            "--site-muted": "rgba(17, 24, 39, 0.58)",
            "--site-text": "#111827",
            "--site-accent": "#111827",
            "--site-accent-contrast": "#ffffff",
            "--site-shadow": "0 12px 34px rgba(15, 23, 42, 0.08)",
            backgroundColor: "#f7f8fb",
            color: "#111827",
          }
        : {
            "--site-bg": "#020305",
            "--site-panel": "#07090d",
            "--site-panel-strong": "#0c1016",
            "--site-surface": "#10151c",
            "--site-border": "rgba(186, 154, 255, 0.16)",
            "--site-muted": "rgba(228, 232, 240, 0.58)",
            "--site-text": "#eef2f8",
            "--site-accent": "#c7b4ff",
            "--site-accent-contrast": "#050609",
            "--site-shadow": "0 18px 44px rgba(0, 0, 0, 0.46)",
            backgroundColor: "#020305",
            color: "#eef2f8",
          },
    [siteStyle]
  );

  return (
    <main
      className="site-shell h-screen overflow-hidden bg-[#030608] text-[#d9dee5]"
      data-site-style={siteStyle}
      style={siteThemeStyle}
    >
      <style>
        {`
          .site-shell {
            background: var(--site-bg) !important;
            color: var(--site-text) !important;
            font-family: Helvetica, Arial, sans-serif;
          }

          html,
          body,
          button,
          input,
          textarea,
          select {
            font-family: Helvetica, Arial, sans-serif !important;
          }

          .app-shell-grid {
            gap: 10px !important;
            padding: 12px !important;
            background: var(--site-bg) !important;
          }

          .main-workspace {
            gap: 10px;
          }

          .app-header,
          .coins-panel,
          .chart-card,
          .settings-button {
            border: 1px solid var(--site-border) !important;
            border-radius: 10px !important;
            background: var(--site-panel) !important;
            color: var(--site-text) !important;
            box-shadow: var(--site-shadow);
          }

          .app-header {
            min-height: 96px !important;
            padding: 10px 12px !important;
            border-color: transparent !important;
            background: transparent !important;
            box-shadow: none !important;
          }

          .chart-grid {
            gap: 8px !important;
          }

          .chart-card {
            overflow: hidden;
          }

          .chart-card-header {
            padding: 12px 14px 4px !important;
          }

          .chart-card-title,
          .coin-row-symbol,
          .coins-panel-title,
          .brand-title {
            color: var(--site-text) !important;
          }

          .chart-card-price,
          .brand-subtitle,
          .coin-search input,
          .coin-list-head,
          .coin-row {
            color: var(--site-muted) !important;
          }

          .chart-card-body {
            padding: 0 14px 10px !important;
          }

          .coins-panel {
            padding: 14px 12px !important;
          }

          .coin-search,
          .coin-filter-tabs,
          .coin-list-head,
          .coin-row {
            border-color: var(--site-border) !important;
            background: var(--site-surface) !important;
          }

          .coin-search {
            min-height: 38px;
            border-radius: 8px !important;
            padding: 0 10px !important;
          }

          .coin-search input {
            color: var(--site-text) !important;
          }

          .coin-filter-tabs {
            border-radius: 8px !important;
            padding: 4px !important;
          }

          .coin-filter-button {
            border: 1px solid var(--site-border) !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--site-text) !important;
            display: grid;
            min-width: 0;
            place-items: center;
          }

          .coin-filter-button.is-active {
            background: var(--site-accent) !important;
            color: var(--site-accent-contrast) !important;
          }

          .bookmark-shield {
            fill: transparent;
            stroke: var(--site-text);
          }

          .site-shell[data-site-style="light"] .bookmark-shield {
            fill: #ffffff;
            stroke: #111827;
          }

          .site-shell[data-site-style="dark"] .bookmark-shield {
            fill: transparent;
            stroke: #ffffff;
          }

          .coin-list-head {
            border-radius: 8px 8px 0 0;
            font-size: 11px !important;
            color: var(--site-muted) !important;
          }

          .coin-row {
            color: var(--site-text) !important;
          }

          .coin-row:hover {
            background: var(--site-panel-strong) !important;
          }

          .coin-table-scroll {
            max-height: calc(100vh - 170px) !important;
            position: relative;
          }

          .coin-grid-count-menu {
            display: grid;
            grid-template-columns: repeat(3, 32px);
            position: absolute;
            right: 4px;
            top: 27px;
            z-index: 40;
            width: max-content;
            overflow: hidden;
            border: 1px solid #111827;
            border-radius: 0;
            background: var(--site-panel);
            color: var(--site-text);
            box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
          }

          .coin-grid-count-item {
            min-height: 18px;
            border-right: 1px solid #111827;
            border-bottom: 1px solid #111827;
            color: inherit;
            font-size: 10px;
            font-weight: 700;
            transition: background 180ms ease, color 180ms ease;
          }

          .coin-grid-count-item:nth-child(3n) {
            border-right: 0;
          }

          .coin-grid-count-item:nth-last-child(-n + 3) {
            border-bottom: 0;
          }

          .coin-grid-count-item:hover,
          .coin-grid-count-item.is-active {
            background: var(--site-accent);
            color: var(--site-accent-contrast);
          }

          .favorite-color-menu {
            position: absolute;
            left: calc(25% + 4px);
            top: calc(100% + 4px);
            z-index: 50;
            width: min(210px, calc(100vw - 32px));
            overflow: hidden;
            border: 1px solid #111827;
            background: var(--site-panel);
            color: var(--site-text);
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
          }

          .favorite-color-row {
            display: grid;
            grid-template-columns: 46px minmax(0, 1fr);
            min-height: 32px;
            border-bottom: 1px solid #111827;
            text-align: left;
            transition: background 180ms ease;
          }

          .favorite-color-row:last-child {
            border-bottom: 0;
          }

          .favorite-color-row:hover,
          .favorite-color-row.is-active {
            background: var(--site-panel-strong);
          }

          .favorite-color-star {
            display: grid;
            place-items: center;
            border-right: 1px solid #111827;
            font-size: 28px;
            line-height: 1;
          }

          .favorite-color-symbols {
            display: flex;
            min-width: 0;
            align-items: center;
            padding: 0 8px;
            color: var(--site-muted);
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .volatility-menu {
            position: absolute;
            left: calc(50% + 4px);
            top: calc(100% + 4px);
            z-index: 50;
            width: 96px;
            overflow: hidden;
            border: 1px solid #111827;
            background: var(--site-panel);
            color: var(--site-text);
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
          }

          .volatility-menu-button {
            display: block;
            width: 100%;
            min-height: 28px;
            border-bottom: 1px solid #111827;
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            transition: background 180ms ease, color 180ms ease;
          }

          .volatility-menu-button:last-child {
            border-bottom: 0;
          }

          .volatility-menu-button.is-pump {
            color: #14c86f;
          }

          .volatility-menu-button.is-dump {
            color: #ff4058;
          }

          .volatility-menu-button:hover,
          .volatility-menu-button.is-active {
            background: var(--site-panel-strong);
          }

          .site-shell input {
            color: var(--site-text) !important;
          }

          .site-shell[data-site-style="light"] .settings-popover button[class~="bg-[#c8b6dc]"],
          .site-shell[data-site-style="light"] .site-style-option[class~="bg-[#c8b6dc]"],
          .site-shell[data-site-style="light"] button[class~="bg-[#c8b6dc]"] {
            background-color: var(--site-accent) !important;
            color: #ffffff !important;
          }

          .site-shell .settings-popover.settings-designed {
            --settings-line: var(--site-border);
            --settings-text: var(--site-text);
            --settings-muted: var(--site-muted);
            background: var(--site-panel) !important;
            border: 1px solid var(--settings-line) !important;
            border-radius: 14px;
            color: var(--settings-text) !important;
          }

          .settings-sidebar,
          .settings-main-panel {
            position: relative;
            overflow: hidden;
            border: 1px solid var(--settings-line);
            border-radius: 12px;
            background: var(--site-surface) !important;
            box-shadow: none;
          }

          .settings-sidebar {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 28px 16px 34px;
          }

          .settings-tab-list {
            display: flex;
            flex-direction: column;
          }

          .settings-tab-button {
            display: flex;
            align-items: center;
            gap: 18px;
            min-height: 58px;
            border: 0;
            border-bottom: 1px solid rgba(196, 151, 255, 0.12);
            padding: 0 18px;
            color: var(--settings-text);
            font-size: 18px;
            font-weight: 500;
            text-align: left;
            transition: background-color 240ms ease, color 240ms ease, box-shadow 240ms ease;
          }

          .settings-tab-button:hover,
          .settings-tab-button.is-active {
            background: var(--site-accent);
            color: var(--site-accent-contrast);
            box-shadow: none;
          }

          .settings-logo-orb {
            display: grid;
            place-items: center;
            align-self: center;
            width: 138px;
            aspect-ratio: 1;
            border: 2px solid rgba(179, 104, 255, 0.72);
            border-radius: 999px;
            color: var(--site-text);
            font-size: 36px;
            font-weight: 900;
            text-shadow: none;
            box-shadow: none;
          }

          .settings-main-panel {
            padding: 48px;
          }

          .settings-main-inner {
            position: relative;
            z-index: 2;
          }

          .settings-tab-content {
            max-width: 760px;
          }

          .settings-tab-content h3 {
            margin: 0 0 30px;
            color: var(--site-text);
            font-size: 26px;
            font-weight: 900;
            letter-spacing: 0.28em;
          }

          .settings-link-card,
          .settings-note,
          .settings-field input,
          .settings-choice,
          .settings-add-button,
          .settings-add-menu {
            border: 1px solid var(--site-border);
            border-radius: 10px;
            background: var(--site-panel) !important;
            color: var(--settings-text) !important;
            box-shadow: none;
          }

          .settings-link-card {
            display: flex;
            align-items: center;
            gap: 18px;
            min-height: 70px;
            padding: 0 22px;
            font-size: 20px;
            font-weight: 500;
            text-decoration: none;
          }

          .settings-card-icon {
            display: grid;
            place-items: center;
            width: 40px;
            aspect-ratio: 1;
            border-radius: 10px;
            background: var(--site-accent);
            color: var(--site-accent-contrast);
            box-shadow: none;
          }

          .settings-control-grid,
          .settings-chip-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .settings-chip-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .settings-field {
            display: grid;
            gap: 8px;
            color: var(--settings-muted);
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
          }

          .settings-field input {
            height: 50px;
            padding: 0 16px;
            font-size: 16px;
            font-weight: 800;
            outline: none;
          }

          .settings-choice,
          .settings-add-button,
          .settings-add-menu button {
            min-height: 52px;
            padding: 0 16px;
            font-size: 15px;
            font-weight: 900;
            transition: background-color 220ms ease, box-shadow 220ms ease, color 220ms ease;
          }

          .settings-choice:hover,
          .settings-choice.is-active,
          .settings-add-button:hover {
            background: var(--site-accent) !important;
            box-shadow: none;
            color: var(--site-accent-contrast) !important;
          }

          .settings-add-button {
            display: grid;
            place-items: center;
            width: 52px;
            aspect-ratio: 1;
            margin-top: 14px;
            color: var(--site-text) !important;
            font-size: 24px;
          }

          .settings-add-menu {
            position: absolute;
            left: 0;
            top: 74px;
            z-index: 4;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            width: 220px;
            padding: 10px;
            backdrop-filter: blur(12px);
          }

          .settings-note {
            margin-top: 16px;
            padding: 16px 18px;
            color: var(--settings-muted) !important;
            font-size: 14px;
            font-weight: 700;
          }

          .settings-wave-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
            overflow: hidden;
          }

          .settings-wave-layer::before,
          .settings-wave-layer::after {
            content: "";
            position: absolute;
            right: -12%;
            bottom: -18%;
            width: 88%;
            height: 58%;
            border-radius: 50%;
            background: linear-gradient(18deg, transparent 18%, rgba(189, 118, 255, 0.18) 19%, transparent 22%), linear-gradient(165deg, transparent 28%, rgba(202, 148, 255, 0.34) 29%, transparent 34%), linear-gradient(9deg, transparent 38%, rgba(148, 83, 238, 0.42) 40%, transparent 50%);
            transform: rotate(-11deg);
          }

          .settings-wave-layer::after {
            right: -2%;
            bottom: -5%;
            opacity: 0.55;
            transform: rotate(-22deg) scale(1.18);
          }

          .site-shell[data-site-style="light"] .settings-popover.settings-designed {
            --settings-line: rgba(17, 24, 39, 0.14);
            --settings-text: #1f1b33;
            --settings-muted: rgba(31, 27, 51, 0.64);
            background: rgba(255, 255, 255, 0.68) !important;
            color: var(--settings-text) !important;
            backdrop-filter: blur(18px);
          }

          .site-shell[data-site-style="light"] .settings-sidebar,
          .site-shell[data-site-style="light"] .settings-main-panel {
            background: rgba(255, 255, 255, 0.72) !important;
            backdrop-filter: blur(12px);
          }

          .site-shell[data-site-style="light"] .settings-tab-button {
            color: var(--settings-text) !important;
            border-bottom-color: rgba(108, 91, 150, 0.1);
          }

          .site-shell[data-site-style="light"] .settings-tab-button:hover,
          .site-shell[data-site-style="light"] .settings-tab-button.is-active,
          .site-shell[data-site-style="light"] .settings-choice:hover,
          .site-shell[data-site-style="light"] .settings-choice.is-active,
          .site-shell[data-site-style="light"] .settings-add-button:hover {
            background: #111827 !important;
            color: #ffffff !important;
          }

          .site-shell[data-site-style="light"] .settings-link-card,
          .site-shell[data-site-style="light"] .settings-note,
          .site-shell[data-site-style="light"] .settings-field input,
          .site-shell[data-site-style="light"] .settings-choice,
          .site-shell[data-site-style="light"] .settings-add-button,
          .site-shell[data-site-style="light"] .settings-add-menu {
            background: rgba(255, 255, 255, 0.76) !important;
            color: var(--settings-text) !important;
          }

          .site-shell[data-site-style="light"] .settings-logo-orb {
            color: #111827 !important;
            text-shadow: none;
            box-shadow: none;
          }

          .main-toolbar {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            width: min(360px, calc(100vw - 360px));
            min-width: 300px;
            overflow: hidden;
            border: 1px solid var(--site-border);
            border-radius: 10px;
            background: var(--site-panel);
            color: var(--site-text);
            box-shadow: var(--site-shadow);
          }

          .main-toolbar.has-open-menu {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
          }

          .main-toolbar-item {
            display: grid;
            min-height: 34px;
            place-items: center;
            border-right: 1px solid var(--site-border);
            color: inherit;
            font-size: 12px;
            font-weight: 900;
            transition: background 220ms ease, color 220ms ease, box-shadow 220ms ease;
          }

          .main-toolbar-item:last-child {
            border-right: 0;
          }

          .main-toolbar-item:hover,
          .main-toolbar-item.is-active {
            background: var(--site-accent);
            color: var(--site-accent-contrast);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
          }

          .main-toolbar-icon svg {
            width: 22px;
            height: 22px;
          }

          .main-timeframe-row,
          .main-grid-row {
            display: grid;
            width: min(520px, calc(100vw - 96px));
            overflow: hidden;
            border: 1px solid var(--site-border);
            border-radius: 0 0 8px 8px;
            background: var(--site-panel);
            color: var(--site-text);
            box-shadow: var(--site-shadow);
          }

          .main-timeframe-item,
          .main-grid-item {
            min-height: 22px;
            border-right: 1px solid var(--site-border);
            color: inherit;
            font-size: 9px;
            font-weight: 900;
            transition: background 220ms ease, color 220ms ease, box-shadow 220ms ease;
          }

          .main-timeframe-item:last-child,
          .main-grid-item:last-child {
            border-right: 0;
          }

          .main-timeframe-item:hover,
          .main-timeframe-item.is-active,
          .main-grid-item:hover,
          .main-grid-item.is-active {
            background: var(--site-accent);
            color: var(--site-accent-contrast);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
          }

          .alert-panel {
            --alert-line: rgba(178, 119, 255, 0.42);
            --alert-text: #f4ecff;
            --alert-muted: rgba(219, 198, 255, 0.74);
            position: absolute;
            left: 50%;
            top: 48px;
            z-index: 40;
            width: min(260px, calc(100vw - 32px));
            min-width: 0;
            transform: translateX(-50%);
            border: 1px solid var(--alert-line);
            border-radius: 14px;
            padding: 16px 18px 18px;
            background: radial-gradient(circle at 80% 80%, rgba(139, 78, 220, 0.28), transparent 34%), linear-gradient(135deg, #1a1231 0%, #171128 48%, #261a47 100%);
            color: var(--alert-text);
            box-shadow: 0 26px 80px rgba(0, 0, 0, 0.48), inset 0 0 34px rgba(166, 92, 255, 0.08);
          }

          .alert-panel-title {
            color: #bd83ff;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            text-shadow: 0 0 18px rgba(189, 131, 255, 0.42);
          }

          .alert-panel-subtitle {
            margin-top: 3px;
            color: var(--alert-muted);
            font-size: 12px;
            font-weight: 700;
          }

          .alert-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 54px;
            height: 28px;
            border: 2px solid rgba(189, 131, 255, 0.55);
            border-radius: 9px;
            padding: 0 7px;
            background: rgba(42, 26, 73, 0.44);
            color: #bd83ff;
            font-size: 10px;
            font-weight: 900;
            box-shadow: inset 0 0 22px rgba(162, 93, 255, 0.1);
          }

          .alert-toggle.is-on {
            background: linear-gradient(135deg, rgba(147, 83, 255, 0.86), rgba(206, 145, 255, 0.56));
            color: #ffffff;
            box-shadow: inset 0 0 16px rgba(234, 211, 255, 0.18), 0 0 18px rgba(181, 112, 255, 0.28);
          }

          .alert-toggle.is-off {
            background: transparent;
            color: rgba(219, 198, 255, 0.62);
            box-shadow: none;
          }

          .alert-field-label {
            display: block;
            margin: 18px 0 7px;
            color: var(--alert-muted);
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .alert-field-input,
          .alert-note {
            width: 100%;
            min-height: 36px;
            border: 1px solid rgba(184, 122, 255, 0.34);
            border-radius: 9px;
            background: rgba(41, 27, 74, 0.38) !important;
            color: var(--alert-text) !important;
            padding: 0 12px;
            font-size: 15px;
            font-weight: 800;
            outline: none;
            box-shadow: inset 0 0 24px rgba(172, 105, 255, 0.08);
          }

          .alert-note {
            display: flex;
            align-items: center;
            margin-top: 14px;
            color: var(--alert-muted) !important;
            font-size: 12px;
          }

          .alert-toast-stack {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            width: min(390px, calc(100vw - 32px));
            height: 142px;
            pointer-events: none;
          }

          .alert-toast-card {
            position: absolute;
            inset: 0;
            cursor: pointer;
            pointer-events: auto;
          }

          .site-shell .alert-toast-card {
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-left-width: 10px !important;
            border-radius: 8px;
            background: #10131a !important;
            color: #ffffff !important;
            box-shadow: 0 18px 46px rgba(0, 0, 0, 0.42) !important;
          }

          .site-shell .alert-toast-card.is-pump {
            border-left-color: #24e66f !important;
          }

          .site-shell .alert-toast-card.is-damp {
            border-left-color: #ff4058 !important;
          }

          .site-shell .alert-toast-title {
            color: currentColor !important;
          }

          .site-shell .alert-toast-percent,
          .site-shell .alert-toast-symbol {
            color: #ffffff !important;
          }

          .site-shell .alert-toast-close {
            color: rgba(255, 255, 255, 0.62) !important;
          }

          .site-shell .alert-toast-close:hover {
            color: #ffffff !important;
          }

          .site-shell[data-site-style="dark"] .app-header,
          .site-shell[data-site-style="dark"] .coins-panel,
          .site-shell[data-site-style="dark"] .chart-card,
          .site-shell[data-site-style="dark"] .settings-button,
          .site-shell[data-site-style="dark"] .main-toolbar,
          .site-shell[data-site-style="dark"] .main-timeframe-row,
          .site-shell[data-site-style="dark"] .main-grid-row,
          .site-shell[data-site-style="dark"] .coin-search,
          .site-shell[data-site-style="dark"] .coin-filter-tabs,
          .site-shell[data-site-style="dark"] .coin-list-head,
          .site-shell[data-site-style="dark"] .coin-row {
            background: var(--site-panel) !important;
            border-color: var(--site-border) !important;
          }

          .site-shell[data-site-style="dark"] .coin-filter-button.is-active,
          .site-shell[data-site-style="dark"] .main-toolbar-item.is-active,
          .site-shell[data-site-style="dark"] .main-timeframe-item.is-active,
          .site-shell[data-site-style="dark"] .main-grid-item.is-active {
            background: linear-gradient(180deg, rgba(199, 180, 255, 0.36), rgba(199, 180, 255, 0.18)) !important;
            color: #f7f3ff !important;
            border-color: rgba(199, 180, 255, 0.45) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 22px rgba(0,0,0,0.3) !important;
          }

          .site-shell[data-site-style="light"] .alert-panel {
            --alert-line: rgba(177, 139, 255, 0.24);
            --alert-text: #1f1b33;
            --alert-muted: rgba(108, 91, 150, 0.72);
            background: radial-gradient(circle at 78% 70%, rgba(194, 151, 255, 0.18), transparent 34%), linear-gradient(135deg, #fff 0%, #fbf8ff 52%, #f1eaff 100%);
            box-shadow: 0 26px 80px rgba(119, 83, 165, 0.16), inset 0 0 34px rgba(185, 138, 255, 0.08);
          }

          .site-shell[data-site-style="light"] .alert-field-input,
          .site-shell[data-site-style="light"] .alert-note {
            background: rgba(255, 255, 255, 0.52) !important;
          }

          .site-shell .settings-wave-layer {
            display: none;
          }

          .site-shell .settings-popover.settings-designed,
          .site-shell .settings-sidebar,
          .site-shell .settings-main-panel,
          .site-shell .settings-link-card,
          .site-shell .settings-note,
          .site-shell .settings-field input,
          .site-shell .settings-choice,
          .site-shell .settings-add-button,
          .site-shell .settings-add-menu,
          .site-shell .alert-panel,
          .site-shell .alert-field-input,
          .site-shell .alert-note {
            background: var(--site-panel) !important;
            border-color: var(--site-border) !important;
            color: var(--site-text) !important;
            box-shadow: var(--site-shadow) !important;
          }

          .site-shell[data-site-style="light"] .settings-popover.settings-designed,
          .site-shell[data-site-style="light"] .settings-sidebar,
          .site-shell[data-site-style="light"] .settings-main-panel,
          .site-shell[data-site-style="light"] .settings-link-card,
          .site-shell[data-site-style="light"] .settings-note,
          .site-shell[data-site-style="light"] .settings-field input,
          .site-shell[data-site-style="light"] .settings-choice,
          .site-shell[data-site-style="light"] .settings-add-button,
          .site-shell[data-site-style="light"] .settings-add-menu {
            background: rgba(255, 255, 255, 0.72) !important;
          }

          .settings-overlay {
            background: rgba(0, 0, 0, 0.45);
          }

          .site-shell[data-site-style="light"] .settings-overlay {
            background: rgba(255, 255, 255, 0.34);
          }

          .site-shell .settings-tab-button,
          .site-shell .settings-field,
          .site-shell .alert-panel-subtitle,
          .site-shell .alert-field-label,
          .site-shell .alert-note {
            color: var(--site-muted) !important;
          }

          .site-shell .settings-tab-button:hover,
          .site-shell .settings-tab-button.is-active,
          .site-shell .settings-choice:hover,
          .site-shell .settings-choice.is-active,
          .site-shell .settings-add-button:hover,
          .site-shell .site-style-option[class~="bg-[#c8b6dc]"] {
            background: var(--site-accent) !important;
            color: var(--site-accent-contrast) !important;
            box-shadow: none !important;
          }

          .site-shell .settings-tab-content h3,
          .site-shell .alert-panel-title {
            color: var(--site-text) !important;
            text-shadow: none !important;
          }

          .site-shell .settings-card-icon {
            background: var(--site-accent) !important;
            color: var(--site-accent-contrast) !important;
            box-shadow: none !important;
          }

          .site-shell .alert-toggle {
            border-color: var(--site-border) !important;
          }

          .site-shell .alert-toggle.is-on {
            background: var(--site-accent) !important;
            color: var(--site-accent-contrast) !important;
            box-shadow: none !important;
          }

          .site-shell .alert-toggle.is-off {
            color: var(--site-muted) !important;
          }

          .site-shell[data-site-style="light"] .settings-popover button[class~="bg-[#c8b6dc]"],
          .site-shell[data-site-style="light"] .site-style-option[class~="bg-[#c8b6dc]"],
          .site-shell[data-site-style="light"] button[class~="bg-[#c8b6dc]"] {
            background-color: var(--site-accent) !important;
            color: var(--site-accent-contrast) !important;
          }

          .site-shell[data-site-style="dark"] {
            background: var(--site-bg) !important;
          }

          .site-shell[data-site-style="dark"] .app-shell-grid {
            background: linear-gradient(180deg, #030407 0%, #000 100%) !important;
          }

          .site-shell[data-site-style="dark"] .chart-card,
          .site-shell[data-site-style="dark"] .coins-panel,
          .site-shell[data-site-style="dark"] .app-header {
            background: linear-gradient(180deg, rgba(10, 13, 18, 0.98), rgba(4, 5, 8, 0.98)) !important;
            border-color: rgba(186, 154, 255, 0.16) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 44px rgba(0,0,0,0.42) !important;
          }

          .site-shell[data-site-style="dark"] .app-header {
            background: linear-gradient(180deg, rgba(9, 12, 17, 0.72), rgba(3, 4, 6, 0.34)) !important;
            box-shadow: none !important;
          }

          .site-shell[data-site-style="dark"] .main-toolbar,
          .site-shell[data-site-style="dark"] .main-timeframe-row,
          .site-shell[data-site-style="dark"] .main-grid-row,
          .site-shell[data-site-style="dark"] .coin-filter-tabs,
          .site-shell[data-site-style="dark"] .coin-search {
            background: rgba(5, 7, 11, 0.92) !important;
            border-color: rgba(186, 154, 255, 0.15) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important;
          }

          .site-shell[data-site-style="dark"] .main-toolbar-item,
          .site-shell[data-site-style="dark"] .main-timeframe-item,
          .site-shell[data-site-style="dark"] .main-grid-item,
          .site-shell[data-site-style="dark"] .coin-filter-button {
            color: rgba(238, 242, 248, 0.82) !important;
            border-color: rgba(186, 154, 255, 0.08) !important;
          }

          .site-shell[data-site-style="dark"] .main-toolbar-item:hover,
          .site-shell[data-site-style="dark"] .main-timeframe-item:hover,
          .site-shell[data-site-style="dark"] .main-grid-item:hover,
          .site-shell[data-site-style="dark"] .coin-filter-button:hover,
          .site-shell[data-site-style="dark"] .settings-button:hover {
            background: rgba(199, 180, 255, 0.12) !important;
            border-color: rgba(199, 180, 255, 0.3) !important;
            color: #ffffff !important;
          }

          .site-shell[data-site-style="dark"] .coin-list-head {
            background: rgba(13, 17, 23, 0.96) !important;
            border-color: rgba(186, 154, 255, 0.15) !important;
            color: rgba(228, 232, 240, 0.6) !important;
          }

          .site-shell[data-site-style="dark"] .coin-row {
            background: rgba(7, 9, 13, 0.78) !important;
            border-color: rgba(255,255,255,0.055) !important;
          }

          .site-shell[data-site-style="dark"] .coin-row:hover {
            background: rgba(199, 180, 255, 0.08) !important;
          }

          .site-shell[data-site-style="dark"] .settings-popover.settings-designed,
          .site-shell[data-site-style="dark"] .settings-sidebar,
          .site-shell[data-site-style="dark"] .settings-main-panel,
          .site-shell[data-site-style="dark"] .settings-link-card,
          .site-shell[data-site-style="dark"] .settings-note,
          .site-shell[data-site-style="dark"] .settings-field input,
          .site-shell[data-site-style="dark"] .settings-choice,
          .site-shell[data-site-style="dark"] .settings-add-button,
          .site-shell[data-site-style="dark"] .settings-add-menu,
          .site-shell[data-site-style="dark"] .alert-panel,
          .site-shell[data-site-style="dark"] .alert-field-input,
          .site-shell[data-site-style="dark"] .alert-note {
            background: linear-gradient(180deg, rgba(12, 16, 22, 0.96), rgba(5, 7, 11, 0.96)) !important;
            border-color: rgba(186, 154, 255, 0.16) !important;
            color: var(--site-text) !important;
          }

          .site-shell[data-site-style="dark"] .settings-tab-button:hover,
          .site-shell[data-site-style="dark"] .settings-tab-button.is-active,
          .site-shell[data-site-style="dark"] .settings-choice:hover,
          .site-shell[data-site-style="dark"] .settings-choice.is-active,
          .site-shell[data-site-style="dark"] .settings-add-button:hover,
          .site-shell[data-site-style="dark"] .site-style-option[class~="bg-[#c8b6dc]"] {
            background: linear-gradient(180deg, rgba(199, 180, 255, 0.28), rgba(199, 180, 255, 0.14)) !important;
            color: #ffffff !important;
            border-color: rgba(199, 180, 255, 0.36) !important;
          }

          .site-shell[data-site-style="light"] .chart-card {
            background: #ffffff !important;
          }

          .site-shell[data-site-style="light"] .chart-card button[title="Open fullscreen"] {
            background: rgba(255,255,255,0.88) !important;
            color: #111827 !important;
          }

          .site-shell[data-site-style="dark"] .chart-card button[title="Open fullscreen"] {
            background: rgba(5, 7, 11, 0.88) !important;
            border-color: rgba(199, 180, 255, 0.18) !important;
            color: #ffffff !important;
            box-shadow: 0 10px 26px rgba(0,0,0,0.42) !important;
          }

          @media (max-width: 980px) {
            .header-brand {
              display: none;
            }

            .main-toolbar {
              width: min(560px, calc(100vw - 42px));
              min-width: 0;
            }

            .main-timeframe-row,
            .main-grid-row,
            .alert-panel {
              width: min(560px, calc(100vw - 24px));
              min-width: 0;
            }

            .main-toolbar-item,
            .main-timeframe-item,
            .main-grid-item {
              min-height: 46px;
              font-size: 14px;
            }
          }
        `}
      </style>
      <div
        className={`app-shell-grid grid h-screen min-h-0 grid-cols-1 overflow-hidden transition-[grid-template-columns] duration-200 ${shellGridClass}`}
      >
        <aside className="hidden">
          <div className="mb-5 flex items-center gap-2">
            <div className="relative size-12 overflow-hidden rounded-full border border-[#c8b6dc]/70 bg-[#c8b6dc]/10">
              <div className="grid h-full w-full place-items-center text-[11px] font-black text-[#c8b6dc]">
                CFG
              </div>
            </div>

            <div>
              <div className="text-2xl font-black tracking-tight text-[#c8b6dc]">
                CFG
              </div>
              <div className="text-xs font-semibold text-white/80">Screener</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {[
              ["Обзор", "▦"],
              ["Избранное", "☆"],
            ].map(([label, icon], index) => {
              const view = index === 0 ? "overview" : "favorites";

              return (
              <button
                key={label}
                onClick={index === 0 ? showOverview : showFavorites}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  activeView === view
                    ? "bg-[#c8b6dc] text-black shadow-[0_8px_30px_rgba(200,182,220,0.22)]"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="w-4 text-center text-base">{icon}</span>
                <span>{label}</span>
              </button>
              );
            })}
          </nav>

          <div className="mt-auto hidden rounded-lg border border-white/10 bg-[#0b1116] p-3 lg:block">
            <div className="relative mx-auto mb-2 h-24 w-24">
              <div className="grid h-full w-full place-items-center rounded-full border border-[#c8b6dc]/50 bg-[#c8b6dc]/10 text-xl font-black text-[#c8b6dc]">
                CFG
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span>CFG Community</span>
              <span className="rounded bg-[#c8b6dc] px-1.5 py-0.5 text-[10px] text-black">
                PRO
              </span>
            </div>

          </div>
        </aside>

        <section className="main-workspace flex min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="app-header relative mb-0 shrink-0 flex min-h-[76px] flex-col gap-0 border border-white/10 bg-[#080d11]/95 p-1">
            <div className="header-brand absolute left-3 top-3 flex items-center gap-2">
              <div className="relative size-10 overflow-hidden rounded-full border border-[#c8b6dc]/70 bg-[#c8b6dc]/10">
                <div className="grid h-full w-full place-items-center text-[10px] font-black text-[#c8b6dc]">
                  CFG
                </div>
              </div>
              <div>
                <div className="brand-title text-xl font-black tracking-tight text-[#c8b6dc]">
                  CFG
                </div>
                <div className="brand-subtitle text-[10px] font-semibold text-white/70">
                  Screener
                </div>
              </div>
            </div>
            <div className={`main-toolbar mx-auto text-center ${timeframeOpen || gridOpen ? "has-open-menu" : ""}`}>
              <button
                type="button"
                onClick={() => toggleFloatingMenu("timeframe")}
                className={`main-toolbar-item ${timeframeOpen ? "is-active" : ""}`}
              >
                TF
              </button>
              <button
                type="button"
                onClick={() => {
                  setDepthOpen((value) => !value);
                  closeFloatingMenus();
                }}
                className={`main-toolbar-item main-toolbar-icon ${
                  depthOpen ? "is-active" : ""
                }`}
                title="Depth order book"
                aria-label="Toggle order book"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M5 7H19V13H5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M7 13V20M17 13V20M4 20H20M7 7L11 13M12 7L16 13"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => toggleFloatingMenu("alerts")}
                className={`main-toolbar-item main-toolbar-icon ${
                  alertsEnabled
                    ? "is-active text-[#24e66f]"
                    : ""
                }`}
                title="Alert settings"
              >
                🔔
              </button>
              <button
                type="button"
                onClick={clearAllDrawings}
                className="main-toolbar-item main-toolbar-icon hover:text-[#ff576d]"
                title="Clear drawings"
                aria-label="Clear drawings"
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
              </button>
            </div>

            {timeframeOpen && (
              <div
                className="main-timeframe-row mx-auto mt-0 text-center"
                style={{
                  gridTemplateColumns: `repeat(${visibleTimeframes.length}, minmax(28px, 1fr))`,
                }}
              >
                {visibleTimeframes.map((item) => (
                  <button
                    key={item}
                    onClick={() => changeTimeframe(item)}
                    className={`main-timeframe-item ${timeframe === item ? "is-active" : ""}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {alertSettingsOpen && (
              <div className="alert-panel text-left backdrop-blur">
                <div className="flex items-start justify-between gap-8">
                  <div>
                    <div className="alert-panel-title">
                      PUMP ALERTS
                    </div>
                    <div className="alert-panel-subtitle">
                      SMS справа снизу
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAlerts}
                    className={`alert-toggle ${alertsEnabled ? "is-on" : "is-off"}`}
                  >
                    <span>{alertsEnabled ? "ON" : "OFF"}</span>
                  </button>
                </div>

                <label className="alert-field-label">
                  Рост, %
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={alertThresholdPercent}
                  onChange={(event) =>
                    setAlertThresholdPercent(
                      Math.max(0.1, Number(event.target.value) || DEFAULT_ALERT_THRESHOLD_PERCENT)
                    )
                  }
                  className="alert-field-input"
                />

                <label className="alert-field-label">
                  За минут
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={alertWindowMinutes}
                  onChange={(event) =>
                    setAlertWindowMinutes(
                      Math.max(1, Math.round(Number(event.target.value) || DEFAULT_ALERT_WINDOW_MINUTES))
                    )
                  }
                  className="alert-field-input"
                />

                <div className="alert-note">
                  Сейчас: +{alertThresholdPercent}% за {alertWindowMinutes}m
                </div>
              </div>
            )}

            <div className="hidden overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-1">
              {allTimeframes.map((item) => (
                <button
                  key={item}
                  onClick={() => changeTimeframe(item)}
                  className={`min-w-12 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    timeframe === item
                      ? "bg-[#c8b6dc] text-black"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="absolute right-3 top-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => toggleFloatingMenu("settings")}
                  className={`settings-button grid size-8 place-items-center rounded-md border border-white/10 transition ${
                  settingsOpen
                    ? "bg-[#c8b6dc] text-black"
                    : "bg-black/20 text-white/65 hover:bg-white/[0.06] hover:text-white"
                }`}
                title="Settings"
                aria-label="Settings"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 0 0 12 8.5ZM19.4 13.3C19.5 12.9 19.5 12.4 19.5 12S19.5 11.1 19.4 10.7L21.2 9.3L19.2 5.8L17.1 6.7C16.4 6.1 15.7 5.7 14.8 5.4L14.5 3H10.5L10.2 5.4C9.3 5.7 8.6 6.1 7.9 6.7L5.8 5.8L3.8 9.3L5.6 10.7C5.5 11.1 5.5 11.6 5.5 12S5.5 12.9 5.6 13.3L3.8 14.7L5.8 18.2L7.9 17.3C8.6 17.9 9.3 18.3 10.2 18.6L10.5 21H14.5L14.8 18.6C15.7 18.3 16.4 17.9 17.1 17.3L19.2 18.2L21.2 14.7L19.4 13.3Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleAlerts}
                className={`hidden rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  alertsEnabled
                    ? "border-[#24e66f] bg-[#24e66f]/10 text-[#24e66f]"
                    : "border-white/10 text-white/70 hover:bg-white/[0.06]"
                }`}
                title="Sound alerts"
              >
                Alerts
              </button>
              <button
                type="button"
                aria-hidden="true"
                className="hidden"
              >
                Coins⌄
              </button>
              <button
                onClick={() => toggleFloatingMenu("settings")}
                className="hidden"
              >
                ⚙
              </button>

              {settingsOpen && (
                <>
                <div
                  className="settings-overlay fixed inset-0 z-[9999] backdrop-blur-sm"
                  onClick={() => setSettingsOpen(false)}
                />
                <div className="settings-popover settings-designed fixed left-1/2 top-1/2 z-[10000] grid h-[720px] max-h-[92vh] w-[1180px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 grid-cols-[280px_minmax(0,1fr)] gap-4 overflow-hidden p-4 shadow-[0_28px_90px_rgba(0,0,0,0.62)] backdrop-blur">
                  <div className="settings-sidebar">
                    <div className="settings-tab-list">
                      {SETTINGS_TABS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveSettingsTab(item.id);
                            setTimeframeAddOpen(false);
                          }}
                          className={`settings-tab-button ${
                            activeSettingsTab === item.id ? "is-active" : ""
                          }`}
                        >
                          <SettingsTabIcon id={item.id} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="settings-logo-orb">CFG</div>
                  </div>
                  <div className="settings-main-panel">
                    <div className="settings-wave-layer" />
                    <div className="settings-main-inner">
                      {renderSettingsContent()}
                    </div>
                  </div>
                </div>
                <div className="hidden">
                  <div className="w-56 shrink-0 overflow-y-auto border-r border-white/10 text-left text-[12px] font-semibold text-white/72">
                    {SETTINGS_TABS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveSettingsTab(item.id);
                          setTimeframeAddOpen(false);
                        }}
                        className={`block w-full border-b border-white/10 px-3 py-2.5 text-left transition last:border-b-0 ${
                          activeSettingsTab === item.id
                            ? "bg-[#c8b6dc] text-black"
                            : "hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="hidden">
                    {["Наш Telegram", "Поддержка", "Стиль", "Density", "About"].map(
                      (item) => (
                        <button
                          key={item}
                          type="button"
                          className="border-b border-white/10 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[#c8b6dc]/12 hover:text-white"
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                  <div className="min-h-48 flex-1 overflow-y-auto p-6 text-sm text-white/76">
                    {activeSettingsTab === "telegram" && (
                      <div className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                          Telegram
                        </div>
                        <a
                          href="https://t.me/CoinFinderGraphics"
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-md border border-[#c8b6dc]/25 bg-[#c8b6dc]/10 px-3 py-2 font-bold text-[#c8b6dc] transition hover:bg-[#c8b6dc]/18 hover:text-white"
                        >
                          t.me/CoinFinderGraphics
                        </a>
                      </div>
                    )}

                    {activeSettingsTab === "support" && (
                      <div className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                          Support
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 font-bold text-white">
                          @Skynemiz
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === "notifications" && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                            Notifications
                          </div>
                          <div className="mt-1 text-xs font-semibold text-white/55">
                            Pump SMS справа снизу при резком росте монеты.
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={toggleAlerts}
                          className={`rounded-md border px-4 py-2 text-sm font-black transition ${
                            alertsEnabled
                              ? "border-[#24e66f]/40 bg-[#24e66f]/12 text-[#24e66f]"
                              : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white"
                          }`}
                        >
                          {alertsEnabled ? "ON" : "OFF"}
                        </button>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="block">
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-white/45">
                              Рост, %
                            </span>
                            <input
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={alertThresholdPercent}
                              onChange={(event) =>
                                setAlertThresholdPercent(
                                  Math.max(
                                    0.1,
                                    Number(event.target.value) ||
                                      DEFAULT_ALERT_THRESHOLD_PERCENT
                                  )
                                )
                              }
                              className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#c8b6dc]/70"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-white/45">
                              За минут
                            </span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={alertWindowMinutes}
                              onChange={(event) =>
                                setAlertWindowMinutes(
                                  Math.max(
                                    1,
                                    Math.round(
                                      Number(event.target.value) ||
                                        DEFAULT_ALERT_WINDOW_MINUTES
                                    )
                                  )
                                )
                              }
                              className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#c8b6dc]/70"
                            />
                          </label>
                        </div>

                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/58">
                          Сейчас: +{alertThresholdPercent}% за {alertWindowMinutes}m
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === "timeframe" && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                            Timeframe
                          </div>
                          <div className="mt-1 text-xs font-semibold text-white/55">
                            Выбери таймфрейм для всех графиков.
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {allTimeframes.map((item) => {
                            const isCustomTimeframe = customTimeframes.includes(item);

                            return (
                              <button
                                key={item}
                                type="button"
                                onClick={() => changeTimeframe(item)}
                                onContextMenu={(event) => {
                                  if (!isCustomTimeframe) return;

                                  event.preventDefault();
                                  removeCustomTimeframe(item);
                                }}
                                className={`rounded-md border px-3 py-3 text-sm font-black transition-colors duration-300 ${
                                  timeframe === item
                                    ? "border-[#c8b6dc] bg-[#c8b6dc] text-black"
                                    : isCustomTimeframe
                                      ? "border-[#c8b6dc]/20 bg-white/[0.05] text-white/72 hover:border-[#c8b6dc]/55 hover:bg-[#c8b6dc]/18 hover:text-[#c8b6dc]"
                                      : "border-white/10 bg-white/[0.05] text-white/72 hover:bg-[#c8b6dc]/14 hover:text-white"
                                }`}
                                title={
                                  isCustomTimeframe
                                    ? "\u041f\u041a\u041c - \u0443\u0434\u0430\u043b\u0438\u0442\u044c"
                                    : undefined
                                }
                              >
                                {item}
                              </button>
                            );
                          })}
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setTimeframeAddOpen((value) => !value)}
                            className="grid size-10 place-items-center rounded-md border border-[#c8b6dc]/35 bg-[#c8b6dc]/10 text-lg font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/18 hover:text-white"
                            aria-label="Add timeframe"
                            title={"\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0442\u0430\u0439\u043c\u0444\u0440\u0435\u0439\u043c"}
                          >
                            +
                          </button>
                          {timeframeAddOpen && (
                            <div className="absolute left-0 top-12 z-20 w-48 rounded-md border border-white/10 bg-[#080d11]/98 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                              {availableExtraTimeframes.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                  {availableExtraTimeframes.map((item) => (
                                    <button
                                      key={item}
                                      type="button"
                                      onClick={() => addCustomTimeframe(item)}
                                      className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-2 text-xs font-black text-white/72 transition-colors duration-300 hover:border-[#c8b6dc]/55 hover:bg-[#c8b6dc]/18 hover:text-[#c8b6dc]"
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="px-2 py-2 text-xs font-semibold text-white/45">
                                  {"\u0412\u0441\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u044b"}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === "charts" && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                            Charts
                          </div>
                          <div className="mt-1 text-xs font-semibold text-white/55">
                            Количество графиков на экране.
                          </div>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                          {GRID_COUNTS.map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => changeGridCount(count)}
                              className={`rounded-md border px-3 py-3 text-sm font-black transition ${
                                gridCount === count
                                  ? "border-[#c8b6dc] bg-[#c8b6dc] text-black"
                                  : "border-white/10 bg-white/[0.05] text-white/72 hover:bg-white/[0.08] hover:text-white"
                              }`}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === "style" && (
                      <div className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                          Style
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {SITE_STYLES.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSiteStyle(item.id)}
                              className={`site-style-option rounded-md border px-3 py-3 text-left text-xs font-black transition ${
                                siteStyle === item.id
                                  ? "border-[#c8b6dc] bg-[#c8b6dc] text-black"
                                  : "border-white/10 bg-white/[0.05] text-white/72 hover:bg-white/[0.08] hover:text-white"
                              }`}
                              data-style={item.id}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === "density" && (
                      <div className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                          Density
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                          Compact trading layout
                        </div>
                      </div>
                    )}

                    {activeSettingsTab === "about" && (
                      <div className="space-y-3">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                          About
                        </div>
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                          Coin Finder Graphics screener
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </>
              )}
            </div>
          </header>

          <div className="hidden">
            <div className="text-xs font-semibold text-white/55">
              Charts{" "}
              {chartSymbols.length > 0
                ? `${pageStart + 1}-${pageEnd} / ${chartSymbols.length}`
                : "0 / 0"}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToChartPage(safePageIndex - 1)}
                disabled={safePageIndex === 0}
                className="grid size-8 place-items-center rounded-md border border-white/10 text-sm font-black text-white/70 transition hover:border-[#c8b6dc]/50 hover:bg-[#c8b6dc]/10 hover:text-[#c8b6dc] disabled:pointer-events-none disabled:opacity-35"
                aria-label="Previous charts"
              >
                {"<"}
              </button>

              <span className="min-w-14 text-center text-xs font-semibold text-white/60">
                {safePageIndex + 1}/{pageCount}
              </span>

              <button
                type="button"
                onClick={() => goToChartPage(safePageIndex + 1)}
                disabled={safePageIndex >= pageCount - 1}
                className="grid size-8 place-items-center rounded-md border border-white/10 text-sm font-black text-white/70 transition hover:border-[#c8b6dc]/50 hover:bg-[#c8b6dc]/10 hover:text-[#c8b6dc] disabled:pointer-events-none disabled:opacity-35"
                aria-label="Next charts"
              >
                {">"}
              </button>
            </div>
          </div>

          <div
            className={chartGridClass}
            style={chartGridStyle}
          >
            {visibleSymbols.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-[#080d11] p-5 text-sm font-semibold text-white/55">
                No charts to show
              </div>
            ) : (
            visibleSymbols.map((symbol, index) => {
              const row = rows[symbol];
              const changePositive = (row?.change24h ?? 0) >= 0;
              const isFavorite = favorites.includes(symbol);
              const drawingKey = getDrawingKey(symbol, timeframe);
              const densityLineCount =
                visibleSymbols.length >= 5 ? 2 : visibleSymbols.length >= 3 ? 3 : 4;
              const densityMinNotional = visibleSymbols.length >= 5 ? 25_000 : 15_000;
              const limitLines = depthOpen
                ? getDepthLimitLines(
                    depth[symbol],
                    densityLineCount,
                    densityMinNotional
                  )
                : [];
              const isWideBottomChart =
                hasWideBottomChart && index === visibleSymbols.length - 1;
              const chartStyle = isWideBottomChart
                ? { gridColumn: `span ${lastChartColumnSpan}` }
                : undefined;

              return (
                <article
                  key={`${symbol}-${timeframe}`}
                  onDoubleClick={() => setFullscreenSymbol(symbol)}
                  className="chart-card relative flex min-h-0 flex-col overflow-hidden border border-white/10 bg-[#080d11] shadow-[0_0_35px_rgba(0,0,0,0.2)]"
                  style={chartStyle}
                >
                  <div className="chart-card-header flex shrink-0 items-start justify-between gap-2 p-2 pb-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copySymbol(symbol)}
                          className="chart-card-title truncate text-left text-sm font-semibold text-white transition hover:text-[#c8b6dc]"
                          title="Copy symbol"
                        >
                          {symbol}
                        </button>
                        <span
                          className={`text-xs font-bold ${
                            changePositive ? "text-[#24e66f]" : "text-[#ff576d]"
                          }`}
                        >
                          {row
                            ? `${changePositive ? "+" : ""}${row.change24h.toFixed(
                                2
                              )}%`
                            : "..."}
                        </span>
                      </div>
                      <p className="chart-card-price mt-1 text-xs text-white/55">
                        {formatPrice(row?.price)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFullscreenSymbol(symbol)}
                      className="hidden"
                      title="Open fullscreen"
                    >
                      ⛶
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFavorite(symbol)}
                      className="text-lg leading-none text-gray-500 transition hover:text-gray-700"
                      title={
                        isFavorite ? "Remove from favorites" : "Add to favorites"
                      }
                    >
                      ★
                    </button>
                  </div>

                  <div className="chart-card-body flex min-h-0 flex-1 px-2 pb-1">
                    <CandleChart
                      symbol={symbol}
                      candles={candles[symbol] || []}
                      timeframe={timeframe}
                      heightClass={chartHeight}
                      theme={siteStyle}
                      compact
                      drawings={drawingsByChart[drawingKey] ?? EMPTY_DRAWINGS}
                      limitLines={limitLines}
                      onNeedOlderCandles={(oldestTime) =>
                        void loadOlderCandles(symbol, oldestTime)
                      }
                    />
                  </div>

                  {depthOpen && (
                    <OrderBook
                      symbol={symbol}
                      bids={depth[symbol]?.bids ?? []}
                      asks={depth[symbol]?.asks ?? []}
                      maxLevels={gridDepthLevels}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setFullscreenSymbol(symbol)}
                    className="absolute bottom-0 right-0 z-10 grid h-12 w-12 place-items-center border-l border-t border-white/10 bg-[#080d11]/95 text-sm font-bold text-white/60 transition hover:bg-[#c8b6dc]/10 hover:text-[#c8b6dc]"
                    title="Open fullscreen"
                  >
                    &#9974;
                  </button>
                </article>
              );
            })
            )}
          </div>
        </section>

        <aside className="coins-panel min-h-0 overflow-hidden border border-white/10 bg-[#080d11] p-1">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="coins-panel-title text-sm font-semibold text-white">
              Coins ({filteredSymbols.length})
            </h2>
            <button
              onClick={showOverview}
              className="hidden"
            >
              Все
            </button>
          </div>

          <div className="coin-search mb-1 flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
            <span className="text-white/30">⌕</span>
          </div>

          <div className="coin-filter-tabs relative mb-1 grid grid-cols-5 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => toggleFloatingMenu("grid")}
              className={`coin-filter-button rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                gridOpen
                  ? "is-active bg-[#c8b6dc] text-black"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
              title="Grid count"
              aria-label="Grid count"
            >
              &#9638;
            </button>
            <button
              type="button"
              onClick={toggleFavoriteColorMenu}
              className={`coin-filter-button rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                activeView === "favorites" || favoriteMenuOpen
                  ? "is-active bg-[#c8b6dc] text-black"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
              title="Favorites"
              aria-label="Favorites"
            >
              &#9733;
            </button>
            {favoriteMenuOpen && (
              <div className="favorite-color-menu">
                {favoriteColorGroups.length > 0 ? (
                  favoriteColorGroups.map((group) => (
                    <button
                      key={group.color}
                      type="button"
                      onClick={() => showFavoriteColor(group.color)}
                      className={`favorite-color-row ${
                        favoriteColorFilter === group.color ? "is-active" : ""
                      }`}
                    >
                      <span
                        className="favorite-color-star"
                        style={{ color: group.color }}
                      >
                        &#9733;
                      </span>
                      <span className="favorite-color-symbols">
                        <span className="truncate">
                          {group.symbols.join(", ")}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="favorite-color-row">
                    <span className="favorite-color-star text-gray-400">
                      &#9733;
                    </span>
                    <span className="favorite-color-symbols">
                      Empty
                    </span>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={toggleVolatilityMenu}
              className={`coin-filter-button rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                volatilityMenuOpen || coinSortMode === "pump" || coinSortMode === "dump"
                  ? "is-active bg-[#c8b6dc] text-black"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
              title="Volatility"
              aria-label="Volatility"
            >
              %
            </button>
            {volatilityMenuOpen && (
              <div className="volatility-menu text-center">
                <button
                  type="button"
                  onClick={() => setVolatilitySort("pump")}
                  className={`volatility-menu-button is-pump ${
                    coinSortMode === "pump" ? "is-active" : ""
                  }`}
                >
                  pump
                </button>
                <button
                  type="button"
                  onClick={() => setVolatilitySort("dump")}
                  className={`volatility-menu-button is-dump ${
                    coinSortMode === "dump" ? "is-active" : ""
                  }`}
                >
                  dump
                </button>
              </div>
            )}
            {[
              ["volume", "volume"],
              ["alphabet", "A-Z"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setCoinSortMode(mode as CoinSortMode);
                  setVolatilityMenuOpen(false);
                  setPageIndex(0);
                }}
                className={`coin-filter-button rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                  coinSortMode === mode
                    ? "is-active bg-[#c8b6dc] text-black"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                }`}
                title={mode === "volume" ? "Volume" : "A-Z"}
                aria-label={mode === "volume" ? "Volume" : "A-Z"}
              >
                {mode === "volume" ? <VolumeBarsIcon /> : label}
              </button>
            ))}
          </div>

          <div className="coin-table-scroll max-h-[calc(100vh-158px)] overflow-y-auto overflow-x-visible pr-1">
            <div className="coin-list-head sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_92px_44px] border border-white/10 bg-[#10161c] text-[10px] font-black uppercase tracking-normal text-white/50">
              <div className="border-r border-white/10 px-2 py-1.5">Name</div>
              <div className="border-r border-white/10 px-2 py-1.5 text-right">
                Volume
              </div>
              <button
                type="button"
                onClick={() => toggleFloatingMenu("grid")}
                className="px-1 py-1.5 text-center transition hover:bg-black/5"
                title="Grid count"
                aria-label="Grid count from mark"
              >
                Mark
              </button>
            </div>
            {gridOpen && (
              <div className="coin-grid-count-menu text-center">
                {GRID_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => changeGridCount(count)}
                    className={`coin-grid-count-item ${gridCount === count ? "is-active" : ""}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            )}
            {filteredSymbols.map((symbol) => {
              const row = rows[symbol];
              const isFavorite = favoriteSet.has(symbol);
              const bookmarkColor = favoriteColors[symbol] ?? BOOKMARK_COLORS[0];

              return (
                <div
                  key={symbol}
                  className="coin-row grid grid-cols-[minmax(0,1fr)_92px_44px] border-x border-b border-white/10 bg-white/[0.025] text-left transition hover:bg-[#c8b6dc]/5"
                >
                  <button
                    type="button"
                    onClick={() => openFullscreenSymbol(symbol)}
                    className="min-w-0 border-r border-white/10 px-2 py-1.5 text-left transition hover:text-[#c8b6dc]"
                    title="Open fullscreen"
                  >
                    <span className="flex min-w-0 items-center">
                      <span className="coin-row-symbol truncate text-xs font-semibold uppercase text-white">
                        {symbol}
                      </span>
                    </span>
                  </button>

                  <div className="min-w-0 border-r border-white/10 px-2 py-1.5 text-right text-xs font-bold text-[#c8b6dc]">
                    {formatVolume(row?.volume24h)}
                  </div>

                  <div className="group/bookmark relative flex items-center justify-center px-1 py-1">
                    <button
                      type="button"
                      onClick={() =>
                        isFavorite
                          ? toggleFavorite(symbol)
                          : setBookmarkColor(symbol, bookmarkColor)
                      }
                      className="grid h-4 w-3.5 place-items-center transition hover:scale-105"
                      title={isFavorite ? "Remove bookmark" : "Add bookmark"}
                    >
                      <svg
                        viewBox="0 0 14 16"
                        className="h-4 w-3.5"
                        aria-hidden="true"
                      >
                        <path
                          d="M1 1H13V11.5L7 15L1 11.5Z"
                          className="bookmark-shield"
                          style={{
                            fill: isFavorite ? bookmarkColor : "transparent",
                            fillOpacity: isFavorite ? 0.22 : 1,
                            stroke: isFavorite ? bookmarkColor : undefined,
                          }}
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </button>

                    <div className="pointer-events-none absolute right-0 top-5 z-30 flex gap-1 rounded-md border border-white/10 bg-[#0b1116] p-1 opacity-0 shadow-xl transition group-hover/bookmark:pointer-events-auto group-hover/bookmark:opacity-100">
                      {BOOKMARK_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setBookmarkColor(symbol, color)}
                          className="size-4 rounded-sm border border-white/25 transition hover:scale-110"
                          style={{ backgroundColor: color }}
                          title={`Set ${symbol} bookmark color`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {quickSearchVisible && quickSearchText && !fullscreenSymbol && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/10">
          <div className="flex max-w-[88vw] flex-col items-center gap-5 text-center">
            <div className="max-w-full break-words px-4 text-5xl font-bold uppercase tracking-normal text-[var(--site-text)] sm:text-6xl">
              {quickSearchText}
            </div>

            {quickSearchMatch && quickSearchValue.length >= 2 && (
              <button
                type="button"
                onClick={() => openQuickSearchSymbol(quickSearchMatch)}
                className="pointer-events-auto rounded-md border border-[var(--site-border)] bg-[var(--site-panel)] px-6 py-3 text-xl font-bold uppercase tracking-normal text-[var(--site-text)] shadow-[var(--site-shadow)] transition hover:bg-[var(--site-panel-strong)]"
              >
                {quickSearchMatch}
              </button>
            )}
          </div>
        </div>
      )}

      {fullscreenSymbol && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#05090c] p-4">
          <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border border-white/10 bg-[#080d11] px-4 py-3">
            <div>
              <h2 className="text-2xl font-black text-[#c8b6dc]">
                {fullscreenSymbol} {timeframe}
              </h2>
              <p className="text-sm text-white/45">Candlestick chart</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFullscreenSymbol(null)}
                className="grid size-10 place-items-center rounded-lg border border-white/10 text-xl font-black text-white/70 hover:bg-white/[0.06]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-[#080d11] p-3">
            <CandleChart
              symbol={fullscreenSymbol}
              candles={candles[fullscreenSymbol] || []}
              timeframe={timeframe}
              heightClass="min-h-0 flex-1"
              theme={siteStyle}
              showTools
              timeframeControls={{
                active: timeframe,
                visible: visibleTimeframes,
                canShiftLeft: timeframeWindowStart > 0,
                canShiftRight:
                  timeframeWindowStart <
                  allTimeframes.length - TIMEFRAME_WINDOW_SIZE,
                onChange: changeTimeframe,
                onShift: shiftTimeframeWindow,
              }}
              drawings={
                drawingsByChart[getDrawingKey(fullscreenSymbol, timeframe)] ??
                EMPTY_DRAWINGS
              }
              limitLines={
                depthOpen ? getDepthLimitLines(depth[fullscreenSymbol], 6, 10_000) : []
              }
              onDrawingsChange={(nextDrawings) =>
                updateChartDrawings(fullscreenSymbol, nextDrawings)
              }
              onNeedOlderCandles={(oldestTime) =>
                void loadOlderCandles(fullscreenSymbol, oldestTime)
              }
            />
            {depthOpen && (
              <OrderBook
                symbol={fullscreenSymbol}
                bids={depth[fullscreenSymbol]?.bids ?? []}
                asks={depth[fullscreenSymbol]?.asks ?? []}
                maxLevels={12}
              />
            )}
          </div>
        </div>
      )}

      {alertToasts.length > 0 && (
        <div className="alert-toast-stack">
          {alertToasts.map((toast, index) => {
            const isDamp = toast.kind === "damp";
            const isLevel = toast.kind === "level";
            const percent = toast.message.match(/[+-]?\d+(?:\.\d+)?%/)?.[0] ?? "";
            const accentClass = isLevel
              ? "border-[#c8b6dc]/45 bg-[#10091a]/96 text-[#c8b6dc]"
              : isDamp
                ? "is-damp text-[#ff576d]"
                : "is-pump text-[#24e66f]";
            const label = isLevel ? "LEVEL" : isDamp ? "DAMP" : "PUMP";
            const isTopToast = index === 0;

            return (
              <div
                key={toast.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  openAlertSymbol(toast.symbol, toast.timeframe);
                  setAlertToasts((prev) =>
                    prev.filter((item) => item.id !== toast.id)
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;

                  event.preventDefault();
                  openAlertSymbol(toast.symbol, toast.timeframe);
                  setAlertToasts((prev) =>
                    prev.filter((item) => item.id !== toast.id)
                  );
                }}
                className={`alert-toast-card border p-5 pr-12 text-left transition ${
                  isTopToast ? "hover:scale-[1.01]" : ""
                } ${accentClass}`}
                style={{
                  zIndex: alertToasts.length - index,
                  transform: isTopToast ? "none" : "translateY(0)",
                  opacity: isTopToast ? 1 : 0,
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="alert-toast-title block text-base font-black uppercase tracking-[0.14em]">
                    {label}
                  </span>
                  <span className="alert-toast-percent block text-3xl font-black leading-none">
                    {percent}
                  </span>
                </div>
                <span className="alert-toast-symbol mt-6 block text-2xl font-black uppercase">
                  {toast.symbol}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAlertToasts((prev) =>
                      prev.filter((item) => item.id !== toast.id)
                    );
                  }}
                  className="alert-toast-close absolute right-3 top-2 text-lg font-black transition"
                  aria-label="Close alert"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
