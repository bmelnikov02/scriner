"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartDrawing } from "./components/CandleChart";

const CandleChart = dynamic(() => import("./components/CandleChart"), {
  ssr: false,
});

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

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type CoinSortMode = "volume" | "alphabet";

type DrawingsByChart = Record<string, ChartDrawing[]>;
type FavoriteColors = Record<string, string>;

type SavedWorkspace = {
  activeView?: "overview" | "favorites";
  alertsEnabled?: boolean;
  coinSortMode?: CoinSortMode;
  drawingsByChart?: DrawingsByChart;
  favoriteColors?: FavoriteColors;
  favorites?: string[];
  gridCount?: number;
  pageIndex?: number;
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
    };

const GRID_COUNTS = Array.from({ length: 12 }, (_, index) => index + 1);
const GRID_WINDOW_SIZE = 6;
const DEFAULT_GRID_WINDOW_START = 3;
const TIMEFRAMES = ["1s", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
const TIMEFRAME_WINDOW_SIZE = 5;
const DEFAULT_TIMEFRAME_WINDOW_START = 2;
const MULTI_TIMEFRAMES = ["5m", "15m", "1h", "4h"];
const API_PORT = "4000";
const WORKSPACE_STORAGE_KEY = "scriner-workspace-v1";
const MOVE_ALERT_PERCENT = 1.5;
const ALERT_COOLDOWN_MS = 45_000;
const BOOKMARK_COLORS = [
  "#2f80ed",
  "#c8b6dc",
  "#24e66f",
  "#ff576d",
  "#a855f7",
  "#f97316",
];
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
  return value === "volume" || value === "alphabet";
}

function getChartColumnCount(count: number) {
  if (count <= 1) return 1;
  if (count <= 5) return 2;
  if (count <= 7) return 3;
  if (count <= 9) return 4;
  if (count <= 11) return 5;
  return 4;
}

export default function Home() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [gridCount, setGridCount] = useState(9);
  const [timeframe, setTimeframe] = useState("1h");
  const [timeframeOpen, setTimeframeOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [gridWindowStart, setGridWindowStart] = useState(
    DEFAULT_GRID_WINDOW_START
  );
  const [timeframeWindowStart, setTimeframeWindowStart] = useState(
    DEFAULT_TIMEFRAME_WINDOW_START
  );
  const [fullscreenSymbol, setFullscreenSymbol] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<FavoriteColors>({});
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [drawingsByChart, setDrawingsByChart] = useState<DrawingsByChart>({});
  const [activeView, setActiveView] = useState<"overview" | "favorites">(
    "overview"
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [coinSortMode, setCoinSortMode] = useState<CoinSortMode>("volume");
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [quickSearchText, setQuickSearchText] = useState("");
  const [quickSearchVisible, setQuickSearchVisible] = useState(false);
  const alertCooldownsRef = useRef<Record<string, number>>({});
  const alertsEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const drawingsByChartRef = useRef<DrawingsByChart>({});
  const quickSearchTimerRef = useRef<number | null>(null);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const orderedSymbols = useMemo(() => {
    return [...allSymbols].sort((a, b) => {
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
    return activeView === "favorites"
      ? orderedSymbols.filter((symbol) => favoriteSet.has(symbol))
      : orderedSymbols;
  }, [orderedSymbols, favoriteSet, activeView]);

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

  const visibleTimeframes = useMemo(
    () =>
      TIMEFRAMES.slice(
        timeframeWindowStart,
        timeframeWindowStart + TIMEFRAME_WINDOW_SIZE
      ),
    [timeframeWindowStart]
  );

  const visibleGridCounts = useMemo(
    () => GRID_COUNTS.slice(gridWindowStart, gridWindowStart + GRID_WINDOW_SIZE),
    [gridWindowStart]
  );

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
    drawingsByChartRef.current = drawingsByChart;
  }, [alertsEnabled, drawingsByChart]);

  useEffect(() => {
    return () => {
      if (quickSearchTimerRef.current) {
        window.clearTimeout(quickSearchTimerRef.current);
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
    alertsEnabled,
    coinSortMode,
    drawingsByChart,
    favoriteColors,
    favorites,
    gridCount,
    safePageIndex,
    workspaceLoaded,
  ]);

  const playAlertSound = useCallback(() => {
    const context = audioContextRef.current ?? new window.AudioContext();

    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
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
    (symbol: string, timeframeValue: string, kind: string, message: string) => {
      if (!alertsEnabledRef.current) return;

      const key = getAlertKey(symbol, timeframeValue, kind);
      const now = Date.now();
      const lastAlertAt = alertCooldownsRef.current[key] ?? 0;

      if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;

      alertCooldownsRef.current[key] = now;
      playAlertSound();
      showBrowserNotification(symbol, message);
    },
    [playAlertSound, showBrowserNotification]
  );

  const checkPriceAlerts = useCallback(
    (symbol: string, candle: Candle, timeframeValue: string) => {
      if (!alertsEnabledRef.current || candle.o <= 0) return;

      const movePercent = ((candle.c - candle.o) / candle.o) * 100;

      if (Math.abs(movePercent) >= MOVE_ALERT_PERCENT) {
        triggerAlert(
          symbol,
          timeframeValue,
          "fast-move",
          `${symbol} moved ${movePercent > 0 ? "+" : ""}${movePercent.toFixed(
            2
          )}%`
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
            `${symbol} touched ${formatPrice(level)}`
          );
        }
      });
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
          setRows((prev) => ({
            ...prev,
            [parsed.data.symbol]: parsed.data,
          }));
        }

        if (parsed.event === "candle:update") {
          const { symbol, candle, interval } = parsed.data;

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
              [symbol]: updated.slice(-1500),
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
  }, [checkPriceAlerts, timeframe]);

  useEffect(() => {
    async function loadCandles(symbol: string, interval = timeframe) {
      try {
        const res = await fetch(
          getApiUrl(`/candles?symbol=${symbol}&interval=${interval}`)
        );

        if (!res.ok) {
          console.error("Candles error:", await res.text());
          return;
        }

        const data: unknown = await res.json();

        if (!Array.isArray(data)) return;

        const formatted: Candle[] = data.map((item) => {
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

        if (interval === timeframe) {
          setCandles((prev) => ({
            ...prev,
            [symbol]: formatted,
          }));
        }
      } catch (error) {
        console.error("Load candles error:", error);
      }
    }

    let cancelled = false;

    async function loadVisibleCandles() {
      for (const symbol of visibleSymbols) {
        if (cancelled) return;

        await loadCandles(symbol);
      }
    }

    void loadVisibleCandles();

    if (fullscreenSymbol) {
      loadCandles(fullscreenSymbol);
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

        setPageIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (gridOpen) {
          changeGridCount(gridCount + 1);
          return;
        }

        setPageIndex((prev) => Math.min(pageCount - 1, prev + 1));
      }
    }

    window.addEventListener("keydown", handleKeyboard);

    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [
    fullscreenSymbol,
    gridCount,
    gridOpen,
    pageCount,
    quickSearchText,
    quickSearchVisible,
    timeframe,
  ]);

  async function changeTimeframe(value: string) {
    const timeframeIndex = TIMEFRAMES.indexOf(value);

    if (timeframeIndex >= 0) {
      revealTimeframe(timeframeIndex);
    }

    setTimeframe(value);
    setCandles({});

    try {
      await fetch(getApiUrl(`/timeframe?interval=${value}`));
    } catch (error) {
      console.error("Timeframe error:", error);
    }
  }

  function revealTimeframe(index: number) {
    const maxStart = Math.max(0, TIMEFRAMES.length - TIMEFRAME_WINDOW_SIZE);

    setTimeframeWindowStart((prev) => {
      if (index < prev) return index;
      if (index >= prev + TIMEFRAME_WINDOW_SIZE) {
        return Math.min(maxStart, index - TIMEFRAME_WINDOW_SIZE + 1);
      }

      return prev;
    });
  }

  function moveTimeframe(direction: -1 | 1) {
    const currentIndex = Math.max(0, TIMEFRAMES.indexOf(timeframe));
    const nextIndex = Math.min(
      TIMEFRAMES.length - 1,
      Math.max(0, currentIndex + direction)
    );

    if (nextIndex === currentIndex) return;

    void changeTimeframe(TIMEFRAMES[nextIndex]);
  }

  function shiftTimeframeWindow(direction: -1 | 1) {
    const maxStart = Math.max(0, TIMEFRAMES.length - TIMEFRAME_WINDOW_SIZE);

    setTimeframeWindowStart((prev) =>
      Math.min(maxStart, Math.max(0, prev + direction))
    );
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
    setActiveView("overview");
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
    setActiveView("favorites");
    setGridCount(9);
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

  const chartHeight = "h-full min-h-0 flex-1";
  const chartColumnCount = getChartColumnCount(visibleSymbols.length);
  const hasWideBottomChart =
    visibleSymbols.length > 1 && visibleSymbols.length % 2 === 1;
  const chartGridStyle = {
    gridAutoRows: "minmax(0, 1fr)",
    gridTemplateColumns: `repeat(${chartColumnCount}, minmax(0, 1fr))`,
  };
  const shellGridClass =
    "lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_260px]";

  return (
    <main className="h-screen overflow-hidden bg-[#030608] text-[#d9dee5]">
      <div
        className={`grid h-screen min-h-0 grid-cols-1 gap-0 overflow-hidden p-0 transition-[grid-template-columns] duration-200 ${shellGridClass}`}
      >
        <aside className="hidden">
          <div className="mb-5 flex items-center gap-2">
            <div className="relative size-12 overflow-hidden rounded-full border border-[#c8b6dc]/70 bg-[#c8b6dc]/10">
              <Image
                src="/cfge-community.jpg"
                alt="$CFG coin"
                width={48}
                height={48}
                sizes="48px"
                className="h-full w-full object-cover grayscale opacity-75"
              />
              <div className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/65 mix-blend-color" />
              <div className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/10" />
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
              <Image
                src="/cfge-logo.jpg"
                alt="CFG community"
                width={96}
                height={96}
                sizes="96px"
                className="h-full w-full object-contain grayscale opacity-75"
              />
              <div className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/65 mix-blend-color" />
              <div className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/10" />
            </div>

            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span>CFG Community</span>
              <span className="rounded bg-[#c8b6dc] px-1.5 py-0.5 text-[10px] text-black">
                PRO
              </span>
            </div>

          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="relative mb-0 shrink-0 flex min-h-[76px] flex-col gap-0 border border-white/10 bg-[#080d11]/95 p-1">
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <div className="relative size-10 overflow-hidden rounded-full border border-[#c8b6dc]/70 bg-[#c8b6dc]/10">
                <Image
                  src="/cfge-community.jpg"
                  alt="$CFG coin"
                  width={40}
                  height={40}
                  sizes="40px"
                  className="h-full w-full object-cover grayscale opacity-75"
                />
                <div className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/65 mix-blend-color" />
                <div className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/10" />
              </div>
              <div>
                <div className="text-xl font-black tracking-tight text-[#c8b6dc]">
                  CFG
                </div>
                <div className="text-[10px] font-semibold text-white/70">
                  Screener
                </div>
              </div>
            </div>
            <div className="mx-auto grid w-full max-w-[420px] grid-cols-[repeat(7,minmax(0,1fr))] overflow-hidden rounded-md border border-white/10 bg-black/20 text-center">
              <button
                type="button"
                onClick={() => {
                  setTimeframeOpen((value) => !value);
                  setGridOpen(false);
                }}
                className={`border-r border-white/10 px-1.5 py-1 text-[11px] font-semibold transition ${
                  timeframeOpen
                    ? "bg-[#c8b6dc] text-black"
                    : "text-white/75 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                TF
              </button>
              <div className="border-r border-white/10 px-1.5 py-1 text-[11px] font-semibold text-white/75">
                DO
              </div>
              <button
                type="button"
                onClick={() => {
                  setGridOpen((value) => !value);
                  setTimeframeOpen(false);
                }}
                className={`border-r border-white/10 px-1.5 py-1 text-[11px] font-semibold transition ${
                  gridOpen
                    ? "bg-[#c8b6dc] text-black"
                    : "text-white/75 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                GC
              </button>
              <button
                type="button"
                onClick={toggleAlerts}
                className={`border-r border-white/10 px-1.5 py-1 text-[11px] font-semibold transition ${
                  alertsEnabled
                    ? "bg-[#24e66f]/10 text-[#24e66f]"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                }`}
                title="Sound alerts"
              >
                🔔
              </button>
              <div className="border-r border-white/10 px-1.5 py-1 text-[11px] text-white/35">
                -
              </div>
              <div className="border-r border-white/10 px-1.5 py-1 text-[11px] text-white/35">
                -
              </div>
              <div className="px-1.5 py-1 text-[11px] font-semibold text-white/75">
                {filteredSymbols.length}
              </div>
            </div>

            {timeframeOpen && (
              <div className="mx-auto grid w-full max-w-[420px] grid-cols-[30px_repeat(5,minmax(0,1fr))_30px] overflow-hidden rounded-md border border-white/10 bg-black/20 text-center">
                <button
                  type="button"
                  onClick={() => shiftTimeframeWindow(-1)}
                  disabled={timeframeWindowStart === 0}
                  className="border-r border-white/10 px-1.5 py-1 text-base font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/10 disabled:text-white/20 disabled:hover:bg-transparent"
                  aria-label="Shift timeframes left"
                >
                  {"<"}
                </button>
                {visibleTimeframes.map((item) => (
                  <button
                    key={item}
                    onClick={() => changeTimeframe(item)}
                    className={`border-r border-white/10 px-1.5 py-1 text-[11px] font-semibold transition ${
                      timeframe === item
                        ? "bg-[#c8b6dc] text-black"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {item}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => shiftTimeframeWindow(1)}
                  disabled={
                    timeframeWindowStart >=
                    TIMEFRAMES.length - TIMEFRAME_WINDOW_SIZE
                  }
                  className="px-1.5 py-1 text-base font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/10 disabled:text-white/20 disabled:hover:bg-transparent"
                  aria-label="Shift timeframes right"
                >
                  {">"}
                </button>
              </div>
            )}

            {gridOpen && (
              <div className="mx-auto grid w-full max-w-[420px] grid-cols-[30px_repeat(6,minmax(0,1fr))_30px] overflow-hidden rounded-md border border-white/10 bg-black/20 text-center">
                <button
                  type="button"
                  onClick={() => shiftGridWindow(-1)}
                  disabled={gridWindowStart === 0}
                  className="border-r border-white/10 px-1.5 py-1 text-base font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/10 disabled:text-white/20 disabled:hover:bg-transparent"
                  aria-label="Shift grid counts left"
                >
                  {"<"}
                </button>
                {visibleGridCounts.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => changeGridCount(count)}
                    className={`border-r border-white/10 px-1.5 py-1 text-[11px] font-semibold transition ${
                      gridCount === count
                        ? "bg-[#c8b6dc] text-black"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {count}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => shiftGridWindow(1)}
                  disabled={gridWindowStart >= GRID_COUNTS.length - GRID_WINDOW_SIZE}
                  className="px-1.5 py-1 text-base font-black text-[#c8b6dc] transition hover:bg-[#c8b6dc]/10 disabled:text-white/20 disabled:hover:bg-transparent"
                  aria-label="Shift grid counts right"
                >
                  {">"}
                </button>
              </div>
            )}

            <div className="hidden overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-1">
              {TIMEFRAMES.map((item) => (
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
                onClick={() => setSettingsOpen((value) => !value)}
                className="hidden"
              >
                ⚙
              </button>

              {settingsOpen && (
                <div className="absolute right-0 top-12 z-20 w-44 rounded-lg border border-white/10 bg-[#0b1116] p-2 shadow-2xl">
                  <div className="mb-2 text-xs text-white/45">Grid</div>
                  <div className="grid grid-cols-2 gap-2">
                    {GRID_COUNTS.map((count) => (
                      <button
                        key={count}
                        onClick={() => {
                          changeGridCount(count);
                          setSettingsOpen(false);
                        }}
                        className={`rounded-md px-3 py-2 text-sm ${
                          gridCount === count
                            ? "bg-[#c8b6dc] text-black"
                            : "bg-white/[0.06] text-white/70 hover:bg-white/10"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
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
                onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
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
                onClick={() =>
                  setPageIndex(Math.min(pageCount - 1, safePageIndex + 1))
                }
                disabled={safePageIndex >= pageCount - 1}
                className="grid size-8 place-items-center rounded-md border border-white/10 text-sm font-black text-white/70 transition hover:border-[#c8b6dc]/50 hover:bg-[#c8b6dc]/10 hover:text-[#c8b6dc] disabled:pointer-events-none disabled:opacity-35"
                aria-label="Next charts"
              >
                {">"}
              </button>
            </div>
          </div>

          <div
            className="grid min-h-0 flex-1 gap-0 overflow-hidden"
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
              const isWideBottomChart =
                hasWideBottomChart && index === visibleSymbols.length - 1;

              return (
                <article
                  key={`${symbol}-${timeframe}`}
                  onDoubleClick={() => setFullscreenSymbol(symbol)}
                  className="relative flex min-h-0 flex-col overflow-hidden border border-white/10 bg-[#080d11] shadow-[0_0_35px_rgba(0,0,0,0.2)]"
                  style={isWideBottomChart ? { gridColumn: "1 / -1" } : undefined}
                >
                  <div className="flex shrink-0 items-start justify-between gap-2 p-2 pb-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="relative size-5 shrink-0 overflow-hidden rounded-full border border-[#c8b6dc]/60 bg-[#c8b6dc]/10">
                          <Image
                            src="/cfge-community.jpg"
                            alt=""
                            width={20}
                            height={20}
                            sizes="20px"
                            className="h-full w-full object-cover grayscale opacity-75"
                          />
                          <span className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/65 mix-blend-color" />
                          <span className="pointer-events-none absolute inset-0 bg-[#c8b6dc]/10" />
                        </span>
                        <button
                          type="button"
                          onClick={() => copySymbol(symbol)}
                          className="truncate text-left text-sm font-semibold text-white transition hover:text-[#c8b6dc]"
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
                      <p className="mt-1 text-xs text-white/55">
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
                      className={`text-lg leading-none transition ${
                        isFavorite
                          ? ""
                          : "text-white/70 hover:text-[#c8b6dc]"
                      }`}
                      style={
                        isFavorite
                          ? { color: favoriteColors[symbol] ?? BOOKMARK_COLORS[1] }
                          : undefined
                      }
                      title={
                        isFavorite ? "Remove from favorites" : "Add to favorites"
                      }
                    >
                      ★
                    </button>
                  </div>

                  <div className="flex min-h-0 flex-1 px-2 pb-1">
                    <CandleChart
                      symbol={symbol}
                      candles={candles[symbol] || []}
                      timeframe={timeframe}
                      heightClass={chartHeight}
                      compact
                      drawings={drawingsByChart[drawingKey] ?? []}
                    />
                  </div>

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

        <aside className="min-h-0 overflow-hidden border border-white/10 bg-[#080d11] p-1">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Coins ({filteredSymbols.length})
            </h2>
            <button
              onClick={showOverview}
              className="hidden"
            >
              Все
            </button>
          </div>

          <div className="mb-1 flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
            <span className="text-white/30">⌕</span>
          </div>

          <div className="mb-1 grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={showOverview}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                activeView === "overview"
                  ? "bg-[#c8b6dc] text-black"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
              title="Overview"
              aria-label="Overview"
            >
              &#9638;
            </button>
            <button
              type="button"
              onClick={showFavorites}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                activeView === "favorites"
                  ? "bg-[#c8b6dc] text-black"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
              title="Favorites"
              aria-label="Favorites"
            >
              &#9733;
            </button>
            {[
              ["volume", "Volume"],
              ["alphabet", "A-Z"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setCoinSortMode(mode as CoinSortMode);
                  setPageIndex(0);
                }}
                className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                  coinSortMode === mode
                    ? "bg-[#c8b6dc] text-black"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-158px)] overflow-y-auto overflow-x-visible pr-1">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_82px_42px] border border-white/10 bg-[#10161c] text-[10px] font-black uppercase tracking-normal text-white/50">
              <div className="border-r border-white/10 px-2 py-1.5">Name</div>
              <div className="border-r border-white/10 px-2 py-1.5 text-right">
                Volume
              </div>
              <div className="px-1 py-1.5 text-center">Mark</div>
            </div>
            {filteredSymbols.map((symbol) => {
              const row = rows[symbol];
              const isFavorite = favoriteSet.has(symbol);
              const bookmarkColor = favoriteColors[symbol] ?? BOOKMARK_COLORS[0];

              return (
                <div
                  key={symbol}
                  className="grid grid-cols-[minmax(0,1fr)_82px_42px] border-x border-b border-white/10 bg-white/[0.025] text-left transition hover:bg-[#c8b6dc]/5"
                >
                  <button
                    type="button"
                    onClick={() => copySymbol(symbol)}
                    className="min-w-0 border-r border-white/10 px-2 py-1.5 text-left transition hover:text-[#c8b6dc]"
                    title="Copy symbol"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-xs font-semibold uppercase text-white">
                        {symbol}
                      </span>
                      {isFavorite && (
                        <span
                          className="shrink-0 text-[0px] leading-none before:text-xs before:content-['*']"
                          style={{ color: bookmarkColor }}
                        >
                          в…
                        </span>
                      )}
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
                          fill={
                            isFavorite ? bookmarkColor : "rgba(255,255,255,0.055)"
                          }
                          stroke={isFavorite ? "rgba(255,255,255,0.55)" : "#ffffff"}
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
            <div
              className="max-w-full break-words px-4 font-mono text-5xl font-black uppercase tracking-[0.08em] text-white sm:text-7xl"
              style={{
                imageRendering: "pixelated",
                textShadow:
                  "0 4px 0 #000, 4px 0 0 #000, -4px 0 0 #000, 0 -4px 0 #000, 0 0 22px rgba(200,182,220,0.45)",
              }}
            >
              {quickSearchText}
            </div>

            {quickSearchMatch && quickSearchValue.length >= 2 && (
              <button
                type="button"
                onClick={() => openQuickSearchSymbol(quickSearchMatch)}
                className="pointer-events-auto rounded-md border border-[#c8b6dc]/55 bg-[#080d11]/95 px-6 py-3 font-mono text-xl font-black uppercase tracking-[0.08em] text-white shadow-[0_0_26px_rgba(200,182,220,0.22)] transition hover:bg-[#c8b6dc]/18 hover:text-[#efe6ff]"
                style={{
                  textShadow: "0 2px 0 #000, 2px 0 0 #000",
                }}
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
              showTools
              timeframeControls={{
                active: timeframe,
                visible: visibleTimeframes,
                canShiftLeft: timeframeWindowStart > 0,
                canShiftRight:
                  timeframeWindowStart <
                  TIMEFRAMES.length - TIMEFRAME_WINDOW_SIZE,
                onChange: changeTimeframe,
                onShift: shiftTimeframeWindow,
              }}
              drawings={
                drawingsByChart[getDrawingKey(fullscreenSymbol, timeframe)] ??
                []
              }
              onDrawingsChange={(nextDrawings) =>
                updateChartDrawings(fullscreenSymbol, nextDrawings)
              }
            />
          </div>
        </div>
      )}
    </main>
  );
}
