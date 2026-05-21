export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-6">

        <div className="relative w-[220px] h-[220px]">

          {/* Orbit rings */}
          <div className="absolute inset-0 m-auto w-[70px] h-[70px] rounded-full border border-[#2ee6a6]/35" />
          <div className="absolute inset-0 m-auto w-[126px] h-[126px] rounded-full border border-[#2ee6a6]/22" />
          <div className="absolute inset-0 m-auto w-[192px] h-[192px] rounded-full border border-[#2ee6a6]/13" />

          {/* Inner planet — small, bright, fast */}
          <div
            className="absolute inset-0 m-auto w-[70px] h-[70px] animate-spin"
            style={{ animationDuration: "2s", animationTimingFunction: "linear" }}
          >
            <div
              className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#2ee6a6]"
              style={{ boxShadow: "0 0 10px 3px rgba(46,230,166,0.55)" }}
            />
          </div>

          {/* Middle planet — medium, medium speed */}
          <div
            className="absolute inset-0 m-auto w-[126px] h-[126px] animate-spin"
            style={{ animationDuration: "4.5s", animationTimingFunction: "linear" }}
          >
            <div
              className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#2ee6a6]/70"
              style={{ boxShadow: "0 0 6px 1px rgba(46,230,166,0.3)" }}
            />
          </div>

          {/* Outer planet — dimmer, slow */}
          <div
            className="absolute inset-0 m-auto w-[192px] h-[192px] animate-spin"
            style={{ animationDuration: "9s", animationTimingFunction: "linear" }}
          >
            <div
              className="absolute -top-[4px] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#2ee6a6]/45"
              style={{ boxShadow: "0 0 5px 1px rgba(46,230,166,0.2)" }}
            />
          </div>

          {/* Central star — pulsing core with outer glow ring */}
          <div
            className="absolute inset-0 m-auto w-[28px] h-[28px] rounded-full border border-[#2ee6a6]/40 bg-[#2ee6a6]/10 flex items-center justify-center"
            style={{ boxShadow: "0 0 18px 5px rgba(46,230,166,0.18)" }}
          >
            <div className="w-[13px] h-[13px] rounded-full bg-[#2ee6a6] animate-pulse"
                 style={{ boxShadow: "0 0 8px 2px rgba(46,230,166,0.6)" }}
            />
          </div>

        </div>

        <p className="text-sm text-zinc-500 tracking-widest uppercase">Loading project</p>
      </div>
    </div>
  );
}
