"use client";

type DepthLevel = [string, string];

type Props = {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  maxLevels?: number;
};

function formatDepthValue(value: string, digits = 4) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return value;
  if (numeric >= 1000) return numeric.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (numeric >= 1) return numeric.toFixed(Math.min(digits, 3));

  return numeric.toFixed(Math.min(digits + 2, 8));
}

function DepthSide({
  title,
  levels,
  tone,
  maxQuantity,
}: {
  title: string;
  levels: DepthLevel[];
  tone: "bid" | "ask";
  maxQuantity: number;
}) {
  const isBid = tone === "bid";
  const accent = isBid ? "text-[#24e66f]" : "text-[#ff576d]";
  const bar = isBid ? "bg-[#24e66f]/16" : "bg-[#ff576d]/16";
  const glow = isBid ? "shadow-[inset_1px_0_0_rgba(36,230,111,0.22)]" : "shadow-[inset_-1px_0_0_rgba(255,87,109,0.22)]";

  return (
    <div className="min-w-0">
      <div className={`mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-normal ${accent}`}>
        <span>{title}</span>
        <span className="text-white/35">qty</span>
      </div>
      <div className="space-y-px">
        {levels.map(([price, quantity]) => {
          const quantityValue = Number(quantity);
          const width =
            Number.isFinite(quantityValue) && maxQuantity > 0
              ? Math.max(5, Math.min(100, (quantityValue / maxQuantity) * 100))
              : 5;

          return (
            <div
              key={`${tone}-${price}`}
              className="relative grid h-4 grid-cols-[minmax(0,1fr)_minmax(46px,0.72fr)] overflow-hidden border border-white/[0.035] bg-black/20 px-1.5 text-[10px] leading-4"
            >
              <span
                className={`absolute inset-y-0 ${isBid ? "right-0" : "left-0"} ${bar} ${glow}`}
                style={{ width: `${width}%` }}
              />
              <span className={`relative z-10 truncate font-mono font-semibold ${accent}`}>
                {formatDepthValue(price)}
              </span>
              <span className="relative z-10 truncate text-right font-mono text-white/68">
                {formatDepthValue(quantity, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrderBook({ symbol, bids, asks, maxLevels = 5 }: Props) {
  const visibleBids = bids.slice(0, maxLevels);
  const visibleAsks = asks.slice(0, maxLevels);
  const maxQuantity = Math.max(
    0,
    ...visibleBids.map(([, quantity]) => Number(quantity) || 0),
    ...visibleAsks.map(([, quantity]) => Number(quantity) || 0)
  );
  const isWaiting = visibleBids.length === 0 && visibleAsks.length === 0;

  return (
    <section className="shrink-0 border-t border-fuchsia-500/15 bg-black/25 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] font-black uppercase tracking-normal text-fuchsia-100/70">
          Depth
        </div>
        <div className="truncate font-mono text-[9px] font-semibold text-white/35">
          {symbol}
        </div>
      </div>
      {isWaiting ? (
        <div className="grid h-10 place-items-center border border-white/[0.035] bg-black/20 font-mono text-[10px] font-semibold uppercase tracking-normal text-white/35">
          Waiting
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <DepthSide title="BIDS / Покупки" levels={visibleBids} tone="bid" maxQuantity={maxQuantity} />
          <DepthSide title="ASKS / Продажи" levels={visibleAsks} tone="ask" maxQuantity={maxQuantity} />
        </div>
      )}
    </section>
  );
}
